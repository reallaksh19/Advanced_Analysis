#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import { BM4_COMPARISON_POLICY, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { BM4_SOLVER_CONDITIONING_PROFILE } from './lfea-m034-bm4-solve-fixtures.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import {
  analyseM035M036Case,
  buildM035M036Inventory,
  solveBm4M035M036Combined,
} from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';

const NODE_PREFIX = 'BM4M035.N';
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTIONS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const TRANSLATIONS = new Set(['UX', 'UY', 'UZ']);
const FORCES = new Set(['fx', 'fy', 'fz']);
const TOP_FAILURES = 40;

function zeroDof() { return Object.fromEntries(DOFS.map((dof) => [dof, 0])); }
function vectorByNode(rows) {
  const result = new Map();
  for (const row of rows) {
    const vector = result.get(row.nodeId) ?? zeroDof();
    vector[row.dof] = row.value;
    result.set(row.nodeId, vector);
  }
  return result;
}
function sourceActions(authorities, recovery) {
  const byElement = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const result = new Map();
  for (const sourceEntry of authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const descendants = authorities.entries.filter((row) => row.sourceSegmentId === sourceId);
    const first = byElement.get(descendants[0]?.elementId);
    const last = byElement.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`Missing recovered source actions for ${sourceId}.`);
    result.set(sourceId, { local: { I: first.local.I, J: last.local.J }, global: { I: first.global.I, J: last.global.J } });
  }
  return result;
}
function snapshot(authorities, analysis) {
  const displacement = vectorByNode(analysis.execution.displacement);
  const reactions = vectorByNode(analysis.execution.reactions);
  const actions = sourceActions(authorities, analysis.recovery);
  const nodes = new Map(authorities.sourceGeometry.nodes.map((node) => {
    const id = String(node.id); const kernel = `${NODE_PREFIX}${id}`;
    return [id, { displacement: displacement.get(kernel) ?? zeroDof(), reaction: reactions.get(kernel) ?? zeroDof() }];
  }));
  const elements = new Map(authorities.base.entries.map((entry) => {
    const source = entry.sourceSegment;
    return [`${source.startNodeId}-${source.endNodeId}`, {
      sourceSegmentId: String(source.id), sourceType: source.type, rigid: entry.rigidAuthority !== null,
      fromNode: String(source.startNodeId), toNode: String(source.endNodeId), actions: actions.get(String(source.id)),
    }];
  }));
  return { nodes, elements };
}
function absoluteTolerance(family, field) {
  if (family === 'displacement') return TRANSLATIONS.has(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.translation : BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  return FORCES.has(field) || TRANSLATIONS.has(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.force : BM4_COMPARISON_POLICY.absoluteTolerance.moment;
}
function deviation({ family, identifier, end = null, field, ours, cii }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const absoluteLimit = nearZero ? absoluteTolerance(family, field) : null;
  const percentDifference = nearZero ? null : absoluteDifference / Math.abs(cii) * 100;
  const passed5pct = nearZero ? Math.abs(absoluteDifference) <= absoluteLimit
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  const normalizedSeverity = nearZero ? Math.abs(absoluteDifference) / Math.max(absoluteLimit, Number.EPSILON)
    : Math.abs(percentDifference) / BM4_COMPARISON_POLICY.targetTolerancePercent;
  return { family, identifier: String(identifier), end, field, ours, cii, absoluteDifference, percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT', absoluteLimit, passed5pct, normalizedSeverity };
}
function ciiDisplacement(row) {
  return { UX: row.DX / 1000, UY: row.DY / 1000, UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180, RY: row.RY * Math.PI / 180, RZ: row.RZ * Math.PI / 180 };
}
function ciiRestraint(row) { return { UX: -row.FX, UY: -row.FY, UZ: -row.FZ, RX: -row.MX, RY: -row.MY, RZ: -row.MZ }; }
function compareOpe(own, cii) {
  const rows = [];
  for (const [nodeIdRaw, referenceRow] of cii.displacement.get('OPE')) {
    const nodeId = String(nodeIdRaw); const actual = own.nodes.get(nodeId); if (!actual) continue;
    const reference = ciiDisplacement(referenceRow);
    for (const field of DOFS) rows.push(deviation({ family: 'displacement', identifier: nodeId, field, ours: actual.displacement[field] ?? 0, cii: reference[field] }));
  }
  for (const [nodeIdRaw, referenceRow] of cii.restraint.get('OPE')) {
    const nodeId = String(nodeIdRaw); const actual = own.nodes.get(nodeId); if (!actual) continue;
    const reference = ciiRestraint(referenceRow);
    for (const field of DOFS) rows.push(deviation({ family: 'restraint', identifier: nodeId, field, ours: actual.reaction[field] ?? 0, cii: reference[field] }));
  }
  for (const [family, actionBasis] of [['globalForce', 'global'], ['localForce', 'local']]) {
    for (const [pair, group] of cii[family].get('OPE').byPair) {
      if (group.length !== 1) continue;
      const actual = own.elements.get(pair); if (!actual) continue;
      const reference = group[0];
      for (const end of ['I', 'J']) for (const field of ACTIONS) rows.push(deviation({
        family, identifier: pair, end, field, ours: actual.actions[actionBasis][end][field], cii: reference[end][field],
      }));
    }
  }
  return rows;
}
function rowKey(row) { return `${row.family}|${row.identifier}|${row.end ?? ''}|${row.field}`; }
function touchedNodes(row) { return row.family === 'displacement' || row.family === 'restraint' ? [row.identifier] : row.identifier.split('-'); }
function summarize(rows) {
  const one = (selected) => ({ comparisons: selected.length, passed5pct: selected.filter((row) => row.passed5pct).length,
    passRate5pct: selected.length ? selected.filter((row) => row.passed5pct).length / selected.length * 100 : null });
  return { displacement: one(rows.filter((row) => row.family === 'displacement')), forces: one(rows.filter((row) => row.family !== 'displacement')) };
}
function equilibrium(analysis) {
  const nodeById = new Map(analysis.compilation.model.nodes.map((node) => [node.nodeId, node]));
  const lengths = new Map(analysis.compilation.model.elements.map((element) => {
    const i = nodeById.get(element.nodeI).position; const j = nodeById.get(element.nodeJ).position;
    return [element.elementId, Math.hypot(j.x - i.x, j.y - i.y, j.z - i.z)];
  }));
  let appliedY = 0;
  for (const primitive of analysis.loadCase.primitives) if (primitive.kind === 'DISTRIBUTED_LOAD') {
    appliedY += 0.5 * (primitive.startIntensity.fy + primitive.endIntensity.fy) * lengths.get(primitive.elementId);
  }
  const reactionY = analysis.execution.reactions.filter((row) => row.dof === 'UY').reduce((sum, row) => sum + row.value, 0);
  const relative = Math.abs(reactionY + appliedY) / Math.max(Math.abs(appliedY), 1);
  const forceLimit = analysis.execution.diagnostics.forceEquilibrium.limit;
  const acceptedEnvelope = Math.max(forceLimit, BM4_SOLVER_CONDITIONING_PROFILE.normalizedResidualWarnLimit.value);
  return { appliedY, reactionY, relative, forceLimit, acceptedEnvelope, accepted: relative <= acceptedEnvelope };
}
function restraintEvidence(node) {
  return (node?.meta?.restraints ?? []).map((row) => ({ typeCode: row.typeCode, sourceTypeCode: row.sourceTypeCode,
    xCosine: row.xCosine, yCosine: row.yCosine, zCosine: row.zCosine, gap: row.gap,
    frictionCoefficient: row.frictionCoefficient, mutationApplied: row.mutationApplied }));
}
function incident(authorities, nodeIds) {
  const ids = new Set(nodeIds.map(String));
  return authorities.base.entries.filter((entry) => ids.has(String(entry.sourceSegment.startNodeId)) || ids.has(String(entry.sourceSegment.endNodeId)))
    .map((entry) => ({ sourceSegmentId: String(entry.sourceSegment.id), pair: `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`,
      sourceType: entry.sourceSegment.type, rigid: entry.rigidAuthority !== null,
      analysisDescendants: authorities.entries.filter((row) => row.sourceSegmentId === String(entry.sourceSegment.id)).map((row) => row.elementId) }));
}
function graphOf(geometry) {
  const graph = new Map(geometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const segment of geometry.segments) { const i = String(segment.startNodeId); const j = String(segment.endNodeId); graph.get(i)?.add(j); graph.get(j)?.add(i); }
  return graph;
}
function distanceToSet(starts, targets, graph, limit = 1) {
  const queue = starts.map((node) => [String(node), 0]); const seen = new Set();
  while (queue.length) { const [node, distance] = queue.shift(); if (seen.has(node) || distance > limit) continue; seen.add(node);
    if (targets.has(node)) return distance; if (distance < limit) for (const next of graph.get(node) ?? []) queue.push([next, distance + 1]); }
  return null;
}
function stateByNode(run) {
  const result = new Map();
  for (const row of run.convergedState) { const node = String(row.nodeId).replace(/^BM4M035\.N/u, '').replace(/^BM4\.N/u, '');
    if (!result.has(node)) result.set(node, []); result.get(node).push({ declarationId: row.declarationId, status: row.status }); }
  return result;
}
function classify(row, combined, reducerNodes, graph, states) {
  const nodes = touchedNodes(row);
  const sourceNodes = nodes.map((id) => combined.authorities.sourceGeometry.nodes.find((node) => String(node.id) === id)).filter(Boolean);
  const restraints = sourceNodes.flatMap(restraintEvidence);
  const hasFriction = restraints.some((r) => (r.frictionCoefficient ?? 0) > 0);
  const hasPlusY = restraints.some((r) => String(r.typeCode) === '14');
  const currentUnilateral = combined.inventory.unilateral.some((r) => nodes.includes(String(r.nodeId).replace(NODE_PREFIX, '')) && Number(r.typeCode) === 14);
  const linearizedPlusY = hasPlusY && !currentUnilateral;
  const incidentRows = incident(combined.authorities, nodes);
  const activeState = nodes.flatMap((id) => states.get(id) ?? []);
  const reducerDistance = distanceToSet(nodes, reducerNodes, graph, 1);
  let primaryCategory = 'UNEXPLAINED_MATCHED_OPE_ROW';
  if (linearizedPlusY) primaryCategory = 'LINEARIZED_UNILATERAL_SUPPORT';
  else if (activeState.length) primaryCategory = 'ACTIVE_SET_CONTACT_SENSITIVE';
  else if (hasFriction) primaryCategory = 'FRICTION_DECLARED_UNMODELED';
  else if (reducerDistance !== null) primaryCategory = 'REDUCER_ADJACENT';
  else if (incidentRows.some((entry) => entry.rigid)) primaryCategory = 'RIGID_RESULT_BOUNDARY';
  else if (incidentRows.some((entry) => entry.sourceType === 'BEND')) primaryCategory = 'BEND_OR_STATION_SEMANTICS';
  return { primaryCategory, hasFriction, hasPlusY, currentUnilateral, linearizedPlusY, activeState, reducerDistance,
    sourceNodes: sourceNodes.map((node) => ({ nodeId: String(node.id), position: [node.x, node.y, node.z], restraints: restraintEvidence(node) })),
    incidentSources: incidentRows };
}
function plusYDeclarations(authorities) {
  const result = [];
  for (const node of authorities.sourceGeometry.nodes) for (const restraint of node.meta?.restraints ?? []) {
    if (String(restraint.typeCode) !== '14') continue;
    result.push({ declarationId: `BM4-C-${node.id}-UY-PLUS-Y`, nodeId: `${NODE_PREFIX}${node.id}`, typeCode: 14,
      gap: restraint.gap ?? 0, frictionCoefficient: restraint.frictionCoefficient ?? null });
  }
  return result;
}
function allPlusYCounterfactual(authorities) {
  const inventory = buildM035M036Inventory(authorities);
  const plusY = plusYDeclarations(authorities); const plusYNodes = new Set(plusY.map((row) => row.nodeId));
  const base = inventory.base.filter((row) => !(plusYNodes.has(row.nodeId) && row.dof === 'UY' && row.declarationId.includes('PLUS-Y-LINEARIZED')));
  const unilateralById = new Map(inventory.unilateral.map((row) => [row.declarationId, row]));
  for (const row of plusY) unilateralById.set(row.declarationId, row);
  const unilateral = [...unilateralById.values()].sort((a, b) => a.declarationId.localeCompare(b.declarationId));
  const run = compileUnilateralSolverExecution({ baseDeclarations: base, unilateral,
    buildAndSolve: (constraints, active) => analyseM035M036Case(authorities, constraints, 'BM4-OPE-ALL-PLUS-Y-AUDIT', true, active.prescribedMovements).execution });
  const state = new Map(run.convergedState.map((row) => [row.declarationId, row.status]));
  const active = run.unilateral.filter((row) => state.get(row.declarationId) === 'ENGAGED');
  const analysis = analyseM035M036Case(authorities, [...base, ...active.map((row) => row.constraintDeclaration)],
    'BM4-OPE-ALL-PLUS-Y-AUDIT', true, active.map((row) => row.prescribedMovement).filter(Boolean));
  if (analysis.execution.semanticHash !== run.finalExecutionHash) throw new Error('All-+Y audit final execution hash drift.');
  return { run, analysis };
}
function countBy(rows, selector) { const result = {}; for (const row of rows) { const key = selector(row); result[key] = (result[key] ?? 0) + 1; } return result; }
function probe(rows, family, identifier, field) { return rows.find((row) => row.family === family && row.identifier === identifier && row.field === field) ?? null; }
function makeMarkdown(report) {
  const h = report.hypotheses.allPlusY;
  const lines = ['# M035 BM4 OPE source audit', '', `Qualified base: \`${report.qualifiedBaseSha}\``, '', '## Current combined OPE parity', '',
    `- displacement within ±5%: ${report.current.summary.displacement.passRate5pct.toFixed(2)}%`,
    `- forces within ±5%: ${report.current.summary.forces.passRate5pct.toFixed(2)}%`,
    `- vertical equilibrium: ${report.current.verticalEquilibrium.relative} (accepted=${report.current.verticalEquilibrium.accepted})`, '',
    '## H1: every source +Y through existing unilateral active-set', '', `- verdict: **${h.verdict}**`];
  if (h.status === 'EVALUATED') lines.push(`- displacement within ±5%: ${h.summary.displacement.passRate5pct.toFixed(2)}%`,
    `- forces within ±5%: ${h.summary.forces.passRate5pct.toFixed(2)}%`, `- force Δ: ${h.deltaPercentagePoints.forces.toFixed(2)} pp`,
    `- vertical equilibrium: ${h.verticalEquilibrium.relative} (accepted=${h.verticalEquilibrium.accepted})`,
    `- released declarations: ${h.releasedDeclarations.length}`);
  else lines.push(`- error: ${h.error}`);
  lines.push('', '## Current OPE failure categories', '');
  for (const [category, count] of Object.entries(report.current.failureCategories).sort((a, b) => b[1] - a[1])) lines.push(`- ${category}: ${count}`);
  lines.push('', '## Top current OPE failures', '', '| family | row | field | error % | category | H1 error % |', '|---|---|---|---:|---|---:|');
  for (const row of report.current.topFailures.slice(0, 20)) lines.push(`| ${row.family} | ${row.identifier}${row.end ? `/${row.end}` : ''} | ${row.field} | ${row.percentDifference == null ? 'near-zero' : row.percentDifference.toFixed(2)} | ${row.evidence.primaryCategory} | ${row.counterfactual?.percentDifference == null ? 'n/a' : row.counterfactual.percentDifference.toFixed(2)} |`);
  lines.push('', '## Guardrails', '', '- 12 bend components and 327 analysis nodes are frozen qualification invariants.',
    '- H1 is an audit counterfactual only; production restraint behavior is unchanged.', '- Friction remains explicit unsupported physics; no stick/slip response is invented.',
    '- A counterfactual failing equilibrium is falsified regardless of CAESAR parity.', '');
  return `${lines.join('\n')}\n`;
}

const qualifiedBaseSha = '65acbd5ca6f13e431d913ae8b227148894171812';
const rawCii = loadBm4CiiOutputCases1921();
const m035 = solveBm4M035FeatureCases();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, m035.authorities);
const combined = solveBm4M035M036Combined();
assert.equal(combined.authorities.bendExpansion.components.length, 12, 'freeze qualified bend count');
assert.equal(combined.authorities.analysisGeometry.nodes.length, 327, 'freeze qualified analysis node count');
const currentRows = compareOpe(snapshot(combined.authorities, combined.operating), cii);
const currentSummary = summarize(currentRows); const currentEquilibrium = equilibrium(combined.operating);
assert.equal(currentEquilibrium.accepted, true, 'qualified combined OPE equilibrium must remain accepted');
const reducerNodes = new Set(combined.authorities.inlineReducers.transitions.map((row) => String(row.nodeId)));
const graph = graphOf(combined.authorities.sourceGeometry); const states = stateByNode(combined.operatingRun);
const currentFailures = currentRows.filter((row) => !row.passed5pct).map((row) => ({ ...row,
  evidence: classify(row, combined, reducerNodes, graph, states) }));
currentFailures.sort((a, b) => b.normalizedSeverity - a.normalizedSeverity || rowKey(a).localeCompare(rowKey(b)));

let allPlusY;
try {
  const candidate = allPlusYCounterfactual(combined.authorities); const rows = compareOpe(snapshot(combined.authorities, candidate.analysis), cii);
  const summary = summarize(rows); const verticalEquilibrium = equilibrium(candidate.analysis); const byKey = new Map(rows.map((row) => [rowKey(row), row]));
  for (const failure of currentFailures) { const variant = byKey.get(rowKey(failure)); if (!variant) continue;
    failure.counterfactual = { ours: variant.ours, percentDifference: variant.percentDifference, passed5pct: variant.passed5pct,
      normalizedSeverity: variant.normalizedSeverity, severityImprovement: failure.normalizedSeverity - variant.normalizedSeverity }; }
  const deltaPercentagePoints = { displacement: summary.displacement.passRate5pct - currentSummary.displacement.passRate5pct,
    forces: summary.forces.passRate5pct - currentSummary.forces.passRate5pct };
  const materiallyImprovedFailures = currentFailures.filter((row) => (row.counterfactual?.severityImprovement ?? 0) >= 1).length;
  const materiallyWorsenedFailures = currentFailures.filter((row) => (row.counterfactual?.severityImprovement ?? 0) <= -1).length;
  let verdict = 'FALSIFIED_AS_GLOBAL_FIX';
  if (!verticalEquilibrium.accepted) verdict = 'FALSIFIED_EQUILIBRIUM';
  else if (deltaPercentagePoints.forces > 0.25 && materiallyImprovedFailures > materiallyWorsenedFailures) verdict = 'SUPPORTED_FOR_NARROW_FIX_INVESTIGATION';
  else if (deltaPercentagePoints.forces > 0 && materiallyImprovedFailures > 0) verdict = 'MIXED_REQUIRES_NODE_LEVEL_REVIEW';
  allPlusY = { status: 'EVALUATED', verdict, summary, deltaPercentagePoints, verticalEquilibrium,
    releasedDeclarations: candidate.run.convergedState.filter((row) => row.status === 'RELEASED').map((row) => row.declarationId),
    convergedState: candidate.run.convergedState, materiallyImprovedFailures, materiallyWorsenedFailures };
} catch (error) {
  allPlusY = { status: 'NOT_EVALUATED', verdict: 'FAIL_CLOSED', error: error instanceof Error ? error.message : String(error) };
}
const report = { schema: 'm035-bm4-ope-source-audit/v2', qualifiedBaseSha,
  invariants: { sourceNodes: combined.authorities.sourceGeometry.nodes.length, sourceElements: combined.authorities.base.entries.length,
    analysisNodes: combined.authorities.analysisGeometry.nodes.length, analysisElements: combined.authorities.entries.length,
    bendComponents: combined.authorities.bendExpansion.components.length, teeJunctions: combined.authorities.teeJunctions.length,
    inlineReducerCandidates: combined.authorities.inlineReducers.transitions.length, reducerCondensationActive: 0 },
  current: { summary: currentSummary, verticalEquilibrium: currentEquilibrium,
    failureCategories: countBy(currentFailures, (row) => row.evidence.primaryCategory),
    frictionAffectedFailures: currentFailures.filter((row) => row.evidence.hasFriction).length,
    linearizedPlusYFailures: currentFailures.filter((row) => row.evidence.linearizedPlusY).length,
    probes: { node20170Uy: probe(currentRows, 'restraint', '20170', 'UY'), node20300Uy: probe(currentRows, 'restraint', '20300', 'UY') },
    topFailures: currentFailures.slice(0, TOP_FAILURES), allFailures: currentFailures },
  hypotheses: { allPlusY,
    friction: { status: 'SCOPE_BOUNDARY', verdict: 'UNSUPPORTED_NOT_SILENTLY_APPROXIMATED',
      affectedCurrentFailures: currentFailures.filter((row) => row.evidence.hasFriction).length },
    reducer: { status: 'SCOPE_BOUNDARY', verdict: 'FAIL_CLOSED_PENDING_FINITE_REDUCER_QUALIFICATION', reducerNodes: [...reducerNodes].sort() } } };
const reportsDir = fileURLToPath(new URL('../reports', import.meta.url)); mkdirSync(reportsDir, { recursive: true });
writeFileSync(`${reportsDir}/m035-bm4-ope-source-audit.json`, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(`${reportsDir}/m035-bm4-ope-source-audit.md`, makeMarkdown(report));
console.log(`BM4_OPE_SOURCE_AUDIT_SUMMARY=${JSON.stringify({ current: report.current.summary,
  verticalEquilibrium: report.current.verticalEquilibrium, categories: report.current.failureCategories,
  frictionAffectedFailures: report.current.frictionAffectedFailures, linearizedPlusYFailures: report.current.linearizedPlusYFailures,
  probes: report.current.probes, allPlusY: report.hypotheses.allPlusY.status === 'EVALUATED' ? {
    verdict: report.hypotheses.allPlusY.verdict, summary: report.hypotheses.allPlusY.summary,
    deltaPercentagePoints: report.hypotheses.allPlusY.deltaPercentagePoints, verticalEquilibrium: report.hypotheses.allPlusY.verticalEquilibrium,
    releasedDeclarations: report.hypotheses.allPlusY.releasedDeclarations } : report.hypotheses.allPlusY,
  topFailures: report.current.topFailures.slice(0, 12).map((row) => ({ key: rowKey(row), percentDifference: row.percentDifference,
    category: row.evidence.primaryCategory, counterfactualPercentDifference: row.counterfactual?.percentDifference ?? null })) })}`);
