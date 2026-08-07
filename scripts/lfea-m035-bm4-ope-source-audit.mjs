#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import {
  analyseM035M036Case,
  buildM035M036Inventory,
  solveBm4M035M036Combined,
} from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { auditM036Bm4Equilibrium } from './lfea-m036-bm4-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';

const NODE_PREFIX = 'BM4M035.N';
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTIONS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const TRANSLATIONS = new Set(['UX', 'UY', 'UZ']);
const FORCES = new Set(['fx', 'fy', 'fz']);
const TARGET_PERCENT = BM4_COMPARISON_POLICY.targetTolerancePercent;
const TOP_FAILURES = 40;

function zeroDof() {
  return Object.fromEntries(DOFS.map((dof) => [dof, 0]));
}

function vectorByNode(rows) {
  const result = new Map();
  for (const row of rows) {
    const record = result.get(row.nodeId) ?? zeroDof();
    record[row.dof] = row.value;
    result.set(row.nodeId, record);
  }
  return result;
}

function sourceActionMap(authorities, recovery) {
  const byElement = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const result = new Map();
  for (const sourceEntry of authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const descendants = authorities.entries.filter((row) => row.sourceSegmentId === sourceId);
    const first = byElement.get(descendants[0]?.elementId);
    const last = byElement.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`Missing recovered source actions for ${sourceId}.`);
    result.set(sourceId, {
      local: { I: first.local.I, J: last.local.J },
      global: { I: first.global.I, J: last.global.J },
    });
  }
  return result;
}

function sourceSnapshot(authorities, analysis) {
  const displacement = vectorByNode(analysis.execution.displacement);
  const reactions = vectorByNode(analysis.execution.reactions);
  const actions = sourceActionMap(authorities, analysis.recovery);
  const nodes = new Map();
  for (const node of authorities.sourceGeometry.nodes) {
    const id = String(node.id);
    const kernel = `${NODE_PREFIX}${id}`;
    nodes.set(id, {
      displacement: displacement.get(kernel) ?? zeroDof(),
      reaction: reactions.get(kernel) ?? zeroDof(),
    });
  }
  const elements = new Map();
  for (const sourceEntry of authorities.base.entries) {
    const source = sourceEntry.sourceSegment;
    elements.set(`${source.startNodeId}-${source.endNodeId}`, {
      sourceSegmentId: String(source.id),
      fromNode: String(source.startNodeId),
      toNode: String(source.endNodeId),
      sourceType: source.type,
      rigid: sourceEntry.rigidAuthority !== null,
      actions: actions.get(String(source.id)),
    });
  }
  return { nodes, elements };
}

function absoluteTolerance(family, field) {
  if (family === 'displacement') {
    return TRANSLATIONS.has(field)
      ? BM4_COMPARISON_POLICY.absoluteTolerance.translation
      : BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  }
  return FORCES.has(field) || TRANSLATIONS.has(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.force
    : BM4_COMPARISON_POLICY.absoluteTolerance.moment;
}

function deviation({ family, identifier, end = null, field, ours, cii }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const absoluteLimit = nearZero ? absoluteTolerance(family, field) : null;
  const percentDifference = nearZero ? null : absoluteDifference / Math.abs(cii) * 100;
  const passed5pct = nearZero
    ? Math.abs(absoluteDifference) <= absoluteLimit
    : Math.abs(percentDifference) <= TARGET_PERCENT;
  const normalizedSeverity = nearZero
    ? Math.abs(absoluteDifference) / Math.max(absoluteLimit, Number.EPSILON)
    : Math.abs(percentDifference) / TARGET_PERCENT;
  return {
    family,
    identifier: String(identifier),
    end,
    field,
    ours,
    cii,
    absoluteDifference,
    percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT',
    absoluteLimit,
    passed5pct,
    normalizedSeverity,
  };
}

function ciiDisplacement(row) {
  return {
    UX: row.DX / 1000,
    UY: row.DY / 1000,
    UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180,
    RY: row.RY * Math.PI / 180,
    RZ: row.RZ * Math.PI / 180,
  };
}

function ciiRestraint(row) {
  return {
    UX: -row.FX,
    UY: -row.FY,
    UZ: -row.FZ,
    RX: -row.MX,
    RY: -row.MY,
    RZ: -row.MZ,
  };
}

function compareOpe(snapshot, cii) {
  const rows = [];
  for (const [nodeIdRaw, referenceRow] of cii.displacement.get('OPE')) {
    const nodeId = String(nodeIdRaw);
    const actual = snapshot.nodes.get(nodeId);
    if (!actual) continue;
    const reference = ciiDisplacement(referenceRow);
    for (const field of DOFS) rows.push(deviation({
      family: 'displacement', identifier: nodeId, field,
      ours: actual.displacement[field] ?? 0, cii: reference[field],
    }));
  }
  for (const [nodeIdRaw, referenceRow] of cii.restraint.get('OPE')) {
    const nodeId = String(nodeIdRaw);
    const actual = snapshot.nodes.get(nodeId);
    if (!actual) continue;
    const reference = ciiRestraint(referenceRow);
    for (const field of DOFS) rows.push(deviation({
      family: 'restraint', identifier: nodeId, field,
      ours: actual.reaction[field] ?? 0, cii: reference[field],
    }));
  }
  for (const [family, sourceField] of [['globalForce', 'global'], ['localForce', 'local']]) {
    for (const [pairKey, referenceGroup] of cii[family].get('OPE').byPair) {
      if (referenceGroup.length !== 1) continue;
      const actual = snapshot.elements.get(pairKey);
      if (!actual) continue;
      const reference = referenceGroup[0];
      for (const end of ['I', 'J']) for (const field of ACTIONS) rows.push(deviation({
        family,
        identifier: pairKey,
        end,
        field,
        ours: actual.actions[sourceField][end][field],
        cii: reference[end][field],
      }));
    }
  }
  return rows;
}

function rowKey(row) {
  return `${row.family}|${row.identifier}|${row.end ?? ''}|${row.field}`;
}

function touchedNodes(row) {
  return row.family === 'displacement' || row.family === 'restraint'
    ? [String(row.identifier)]
    : String(row.identifier).split('-');
}

function graphOf(geometry) {
  const graph = new Map(geometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const segment of geometry.segments) {
    const i = String(segment.startNodeId);
    const j = String(segment.endNodeId);
    graph.get(i)?.add(j);
    graph.get(j)?.add(i);
  }
  return graph;
}

function distanceToTargets(starts, targets, graph, limit = 1) {
  const queue = starts.map((node) => [String(node), 0]);
  const visited = new Set();
  while (queue.length) {
    const [node, distance] = queue.shift();
    if (visited.has(node) || distance > limit) continue;
    visited.add(node);
    if (targets.has(node)) return distance;
    if (distance < limit) for (const next of graph.get(node) ?? []) queue.push([next, distance + 1]);
  }
  return null;
}

function restraintEvidence(node) {
  return (node?.meta?.restraints ?? []).map((row) => ({
    sourceTypeRaw: row.sourceTypeRaw,
    sourceTypeCode: row.sourceTypeCode,
    typeCode: row.typeCode,
    xCosine: row.xCosine,
    yCosine: row.yCosine,
    zCosine: row.zCosine,
    gap: row.gap,
    frictionCoefficient: row.frictionCoefficient,
    mutationApplied: row.mutationApplied,
  }));
}

function incidentSources(authorities, nodeIds) {
  const selected = new Set(nodeIds.map(String));
  return authorities.base.entries.filter((entry) => {
    const source = entry.sourceSegment;
    return selected.has(String(source.startNodeId)) || selected.has(String(source.endNodeId));
  }).map((entry) => {
    const source = entry.sourceSegment;
    const descendants = authorities.entries.filter((row) => row.sourceSegmentId === String(source.id));
    return {
      sourceSegmentId: String(source.id),
      pair: `${source.startNodeId}-${source.endNodeId}`,
      sourceType: source.type,
      rigid: entry.rigidAuthority !== null,
      analysisDescendants: descendants.map((row) => row.elementId),
    };
  });
}

function loadEvidence(analysis, descendants) {
  const ids = new Set(descendants);
  return analysis.loadCase.primitives.filter((primitive) => (
    primitive.elementId && ids.has(primitive.elementId)
  )).map((primitive) => ({
    primitiveId: primitive.primitiveId,
    kind: primitive.kind,
    elementId: primitive.elementId,
    startIntensity: primitive.startIntensity ?? null,
    endIntensity: primitive.endIntensity ?? null,
    pressure: primitive.pressure ?? null,
    operatingTemperature: primitive.operatingTemperature ?? null,
    installationTemperature: primitive.installationTemperature ?? null,
    authorizedEffects: primitive.authorizedEffects ?? null,
  }));
}

function sourceEndActions(snapshot, incident) {
  return incident.map((entry) => {
    const row = snapshot.elements.get(entry.pair);
    return {
      sourceSegmentId: entry.sourceSegmentId,
      pair: entry.pair,
      global: row?.actions?.global ?? null,
      local: row?.actions?.local ?? null,
    };
  });
}

function activeStateByNode(run) {
  const result = new Map();
  for (const row of run.convergedState) {
    const nodeId = String(row.nodeId).replace(/^BM4M035\.N/u, '').replace(/^BM4\.N/u, '');
    if (!result.has(nodeId)) result.set(nodeId, []);
    result.get(nodeId).push({ declarationId: row.declarationId, status: row.status });
  }
  return result;
}

function baseConstraintEvidence(inventory, nodeIds) {
  const selected = new Set(nodeIds.map((id) => `${NODE_PREFIX}${id}`));
  return inventory.base.filter((row) => selected.has(row.nodeId)).map((row) => ({
    declarationId: row.declarationId,
    nodeId: row.nodeId,
    dof: row.dof,
    behavior: row.behavior,
  }));
}

function unilateralEvidence(inventory, nodeIds) {
  const selected = new Set(nodeIds.map((id) => `${NODE_PREFIX}${id}`));
  return inventory.unilateral.filter((row) => selected.has(row.nodeId)).map((row) => ({
    declarationId: row.declarationId,
    nodeId: row.nodeId,
    typeCode: row.typeCode,
    gap: row.gap,
    frictionCoefficient: row.frictionCoefficient,
  }));
}

function classificationFor({ row, authorities, inventory, activeByNode, reducerNodes, graph }) {
  const nodes = touchedNodes(row);
  const sourceNodes = nodes.map((id) => authorities.sourceGeometry.nodes.find((node) => String(node.id) === id)).filter(Boolean);
  const restraints = sourceNodes.flatMap(restraintEvidence);
  const hasFriction = restraints.some((restraint) => (restraint.frictionCoefficient ?? 0) > 0);
  const hasPlusY = restraints.some((restraint) => String(restraint.typeCode) === '14');
  const currentUnilateral = unilateralEvidence(inventory, nodes).some((restraint) => Number(restraint.typeCode) === 14);
  const linearizedPlusY = hasPlusY && !currentUnilateral;
  const incident = incidentSources(authorities, nodes);
  const rigidBoundary = incident.some((entry) => entry.rigid);
  const bendBoundary = incident.some((entry) => entry.sourceType === 'BEND');
  const reducerDistance = distanceToTargets(nodes, reducerNodes, graph, 1);
  const activeSet = nodes.flatMap((nodeId) => activeByNode.get(nodeId) ?? []);
  let primaryCategory = 'UNEXPLAINED_MATCHED_OPE_ROW';
  if (linearizedPlusY) primaryCategory = 'LINEARIZED_UNILATERAL_SUPPORT';
  else if (activeSet.length) primaryCategory = 'ACTIVE_SET_CONTACT_SENSITIVE';
  else if (hasFriction) primaryCategory = 'FRICTION_DECLARED_UNMODELED';
  else if (reducerDistance !== null) primaryCategory = 'REDUCER_ADJACENT';
  else if (rigidBoundary) primaryCategory = 'RIGID_RESULT_BOUNDARY';
  else if (bendBoundary) primaryCategory = 'BEND_OR_STATION_SEMANTICS';
  return {
    primaryCategory,
    hasPlusY,
    linearizedPlusY,
    currentUnilateral,
    hasFriction,
    reducerDistance,
    rigidBoundary,
    bendBoundary,
    activeSet,
  };
}

function plusYSourceRestraints(authorities) {
  const rows = [];
  for (const node of authorities.sourceGeometry.nodes) {
    for (const restraint of node.meta?.restraints ?? []) {
      if (String(restraint.typeCode) !== '14') continue;
      rows.push({
        declarationId: `BM4-C-${node.id}-UY-PLUS-Y`,
        nodeId: `${NODE_PREFIX}${node.id}`,
        typeCode: 14,
        gap: restraint.gap ?? 0,
        frictionCoefficient: restraint.frictionCoefficient ?? null,
      });
    }
  }
  return rows;
}

function solveAllPlusYCounterfactual(authorities) {
  const inventory = buildM035M036Inventory(authorities);
  const plusY = plusYSourceRestraints(authorities);
  const plusYNodes = new Set(plusY.map((row) => row.nodeId));
  const base = inventory.base.filter((row) => !(
    plusYNodes.has(row.nodeId)
    && row.dof === 'UY'
    && row.declarationId.includes('PLUS-Y-LINEARIZED')
  ));
  const byDeclaration = new Map(inventory.unilateral.map((row) => [row.declarationId, row]));
  for (const row of plusY) byDeclaration.set(row.declarationId, row);
  const unilateral = [...byDeclaration.values()].sort((a, b) => a.declarationId.localeCompare(b.declarationId));
  const run = compileUnilateralSolverExecution({
    baseDeclarations: base,
    unilateral,
    buildAndSolve: (constraints, active) => analyseM035M036Case(
      authorities,
      constraints,
      'BM4-M035-M036-OPE-ALL-PLUS-Y-AUDIT',
      true,
      active.prescribedMovements,
    ).execution,
  });
  const state = new Map(run.convergedState.map((row) => [row.declarationId, row.status]));
  const active = run.unilateral.filter((row) => state.get(row.declarationId) === 'ENGAGED');
  const analysis = analyseM035M036Case(
    authorities,
    [...base, ...active.map((row) => row.constraintDeclaration)],
    'BM4-M035-M036-OPE-ALL-PLUS-Y-AUDIT',
    true,
    active.map((row) => row.prescribedMovement).filter((row) => row !== null),
  );
  if (analysis.execution.semanticHash !== run.finalExecutionHash) {
    throw new Error('All-+Y audit counterfactual final execution hash drift.');
  }
  return { inventory: { base, unilateral }, run, analysis };
}

function summarizeRows(rows) {
  const displacement = rows.filter((row) => row.family === 'displacement');
  const forces = rows.filter((row) => row.family !== 'displacement');
  const summarize = (selected) => ({
    comparisons: selected.length,
    passed5pct: selected.filter((row) => row.passed5pct).length,
    passRate5pct: selected.length ? selected.filter((row) => row.passed5pct).length / selected.length * 100 : null,
  });
  return { displacement: summarize(displacement), forces: summarize(forces) };
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function markdown(report) {
  const lines = [
    '# M035 BM4 OPE source audit',
    '',
    `Qualified base: \`${report.qualifiedBaseSha}\``,
    '',
    '## Current OPE parity',
    '',
    `- displacement within ±5%: ${report.current.summary.displacement.passRate5pct.toFixed(2)}% (${report.current.summary.displacement.passed5pct}/${report.current.summary.displacement.comparisons})`,
    `- forces within ±5%: ${report.current.summary.forces.passRate5pct.toFixed(2)}% (${report.current.summary.forces.passed5pct}/${report.current.summary.forces.comparisons})`,
    `- vertical equilibrium relative residual: ${report.current.verticalEquilibrium.relative}`,
    '',
    '## Primary current-failure categories',
    '',
  ];
  for (const [category, count] of Object.entries(report.current.failureCategories).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${category}: ${count}`);
  }
  lines.push('', '## H1 — generalize every source +Y to the existing unilateral active-set', '');
  if (report.hypotheses.allPlusY.status === 'EVALUATED') {
    const h = report.hypotheses.allPlusY;
    lines.push(
      `- verdict: **${h.verdict}**`,
      `- displacement within ±5%: ${h.summary.displacement.passRate5pct.toFixed(2)}% (Δ ${h.deltaPercentagePoints.displacement.toFixed(2)} pp)`,
      `- forces within ±5%: ${h.summary.forces.passRate5pct.toFixed(2)}% (Δ ${h.deltaPercentagePoints.forces.toFixed(2)} pp)`,
      `- released +Y/contact declarations: ${h.releasedDeclarations.length}`,
      `- vertical equilibrium relative residual: ${h.verticalEquilibrium.relative}`,
    );
  } else {
    lines.push(`- verdict: **NOT EVALUATED** — ${report.hypotheses.allPlusY.error}`);
  }
  lines.push('', '## Top current OPE failures', '', '| # | family | row | field | ours | CAESAR | error % | category | H1 error % |', '|---:|---|---|---|---:|---:|---:|---|---:|');
  report.current.topFailures.slice(0, 20).forEach((row, index) => {
    const currentPct = row.percentDifference == null ? 'near-zero' : row.percentDifference.toFixed(2);
    const h1Pct = row.counterfactual?.percentDifference == null ? (row.counterfactual ? 'near-zero' : 'n/a') : row.counterfactual.percentDifference.toFixed(2);
    lines.push(`| ${index + 1} | ${row.family} | ${row.identifier}${row.end ? `/${row.end}` : ''} | ${row.field} | ${row.ours} | ${row.cii} | ${currentPct} | ${row.evidence.primaryCategory} | ${h1Pct} |`);
  });
  lines.push('', '## Guardrails', '', '- Bend ingestion/flexibility is frozen at 12 bend components and 327 analysis nodes.', '- The H1 solve is evidence-only; it does not alter production M036 behavior.', '- Friction coefficients are surfaced as source evidence but friction is not silently modeled.', '- Reducer condensation remains inactive unless independently qualified.', '');
  return `${lines.join('\n')}\n`;
}

const qualifiedBaseSha = '65acbd5ca6f13e431d913ae8b227148894171812';
const rawCii = loadBm4CiiOutputCases1921();
const m035 = solveBm4M035FeatureCases();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, m035.authorities);
const combined = solveBm4M035M036Combined();
assert.equal(combined.authorities.bendExpansion.components.length, 12, 'qualified bend component count must remain frozen');
assert.equal(combined.authorities.analysisGeometry.nodes.length, 327, 'qualified analysis node count must remain frozen');

const currentSnapshot = sourceSnapshot(combined.authorities, combined.operating);
const currentRows = compareOpe(currentSnapshot, cii);
const currentSummary = summarizeRows(currentRows);
const activeByNode = activeStateByNode(combined.operatingRun);
const reducerNodes = new Set(combined.authorities.inlineReducers.transitions.map((row) => String(row.nodeId)));
const graph = graphOf(combined.authorities.sourceGeometry);
const currentFailures = currentRows.filter((row) => !row.passed5pct).map((row) => {
  const nodes = touchedNodes(row);
  const incident = incidentSources(combined.authorities, nodes);
  const descendants = incident.flatMap((entry) => entry.analysisDescendants);
  const sourceNodes = nodes.map((id) => combined.authorities.sourceGeometry.nodes.find((node) => String(node.id) === id)).filter(Boolean);
  return {
    ...row,
    evidence: {
      primaryCategory: classificationFor({
        row,
        authorities: combined.authorities,
        inventory: combined.inventory,
        activeByNode,
        reducerNodes,
        graph,
      }).primaryCategory,
      classification: classificationFor({
        row,
        authorities: combined.authorities,
        inventory: combined.inventory,
        activeByNode,
        reducerNodes,
        graph,
      }),
      sourceNodes: sourceNodes.map((node) => ({
        nodeId: String(node.id),
        position: [node.x, node.y, node.z],
        restraints: restraintEvidence(node),
      })),
      baseConstraints: baseConstraintEvidence(combined.inventory, nodes),
      unilateralDeclarations: unilateralEvidence(combined.inventory, nodes),
      incidentSources: incident,
      operatingLoadPrimitives: loadEvidence(combined.operating, descendants),
      recoveredSourceEndActions: sourceEndActions(currentSnapshot, incident),
    },
  };
});
currentFailures.sort((a, b) => b.normalizedSeverity - a.normalizedSeverity || rowKey(a).localeCompare(rowKey(b)));

let allPlusY;
try {
  const candidate = solveAllPlusYCounterfactual(combined.authorities);
  const snapshot = sourceSnapshot(combined.authorities, candidate.analysis);
  const rows = compareOpe(snapshot, cii);
  const summary = summarizeRows(rows);
  const byKey = new Map(rows.map((row) => [rowKey(row), row]));
  for (const failure of currentFailures) {
    const variant = byKey.get(rowKey(failure));
    if (!variant) continue;
    failure.counterfactual = {
      ours: variant.ours,
      absoluteDifference: variant.absoluteDifference,
      percentDifference: variant.percentDifference,
      passed5pct: variant.passed5pct,
      normalizedSeverity: variant.normalizedSeverity,
      severityImprovement: failure.normalizedSeverity - variant.normalizedSeverity,
    };
  }
  const deltaDisplacement = summary.displacement.passRate5pct - currentSummary.displacement.passRate5pct;
  const deltaForces = summary.forces.passRate5pct - currentSummary.forces.passRate5pct;
  const materiallyImprovedFailures = currentFailures.filter((row) => (
    row.counterfactual && row.counterfactual.severityImprovement >= 1
  )).length;
  const materiallyWorsenedFailures = currentFailures.filter((row) => (
    row.counterfactual && row.counterfactual.severityImprovement <= -1
  )).length;
  let verdict = 'FALSIFIED_AS_GLOBAL_FIX';
  if (deltaForces > 0.25 && materiallyImprovedFailures > materiallyWorsenedFailures) verdict = 'SUPPORTED_FOR_NARROW_FIX_INVESTIGATION';
  else if (deltaForces > 0 && materiallyImprovedFailures > 0) verdict = 'MIXED_REQUIRES_NODE_LEVEL_REVIEW';
  allPlusY = {
    status: 'EVALUATED',
    verdict,
    summary,
    deltaPercentagePoints: { displacement: deltaDisplacement, forces: deltaForces },
    verticalEquilibrium: auditM036Bm4Equilibrium(candidate.analysis),
    convergedState: candidate.run.convergedState,
    releasedDeclarations: candidate.run.convergedState.filter((row) => row.status === 'RELEASED').map((row) => row.declarationId),
    materiallyImprovedFailures,
    materiallyWorsenedFailures,
  };
} catch (error) {
  allPlusY = {
    status: 'NOT_EVALUATED',
    verdict: 'FAIL_CLOSED',
    error: error instanceof Error ? error.message : String(error),
  };
}

const failureCategories = countBy(currentFailures, (row) => row.evidence.primaryCategory);
const frictionAffectedFailures = currentFailures.filter((row) => row.evidence.classification.hasFriction).length;
const linearizedPlusYFailures = currentFailures.filter((row) => row.evidence.classification.linearizedPlusY).length;
const report = {
  schema: 'm035-bm4-ope-source-audit/v1',
  qualifiedBaseSha,
  invariants: {
    sourceNodes: combined.authorities.sourceGeometry.nodes.length,
    sourceElements: combined.authorities.base.entries.length,
    analysisNodes: combined.authorities.analysisGeometry.nodes.length,
    analysisElements: combined.authorities.entries.length,
    bendComponents: combined.authorities.bendExpansion.components.length,
    teeJunctions: combined.authorities.teeJunctions.length,
    inlineReducerCandidates: combined.authorities.inlineReducers.transitionCount,
    reducerCondensationActive: 0,
  },
  current: {
    summary: currentSummary,
    verticalEquilibrium: auditM036Bm4Equilibrium(combined.operating),
    operatingConvergedState: combined.operatingRun.convergedState,
    failureCategories,
    frictionAffectedFailures,
    linearizedPlusYFailures,
    topFailures: currentFailures.slice(0, TOP_FAILURES),
    allFailures: currentFailures,
  },
  hypotheses: {
    allPlusY: allPlusY,
    friction: {
      status: 'SCOPE_BOUNDARY',
      verdict: 'UNSUPPORTED_NOT_SILENTLY_APPROXIMATED',
      affectedCurrentFailures: frictionAffectedFailures,
      statement: 'InputXML friction coefficients are preserved as evidence; no Coulomb stick/slip mechanics are introduced by this audit.',
    },
    reducer: {
      status: 'SCOPE_BOUNDARY',
      verdict: 'FAIL_CLOSED_PENDING_FINITE_REDUCER_QUALIFICATION',
      reducerNodes: [...reducerNodes].sort(),
    },
  },
};

const reportsDir = fileURLToPath(new URL('../reports', import.meta.url));
mkdirSync(reportsDir, { recursive: true });
writeFileSync(`${reportsDir}/m035-bm4-ope-source-audit.json`, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(`${reportsDir}/m035-bm4-ope-source-audit.md`, markdown(report));

console.log(`BM4_OPE_SOURCE_AUDIT_SUMMARY=${JSON.stringify({
  current: report.current.summary,
  categories: report.current.failureCategories,
  frictionAffectedFailures,
  linearizedPlusYFailures,
  allPlusY: report.hypotheses.allPlusY.status === 'EVALUATED' ? {
    verdict: report.hypotheses.allPlusY.verdict,
    summary: report.hypotheses.allPlusY.summary,
    deltaPercentagePoints: report.hypotheses.allPlusY.deltaPercentagePoints,
    releasedDeclarations: report.hypotheses.allPlusY.releasedDeclarations,
  } : report.hypotheses.allPlusY,
  topFailures: report.current.topFailures.slice(0, 10).map((row) => ({
    key: rowKey(row),
    ours: row.ours,
    cii: row.cii,
    percentDifference: row.percentDifference,
    category: row.evidence.primaryCategory,
    counterfactualPercentDifference: row.counterfactual?.percentDifference ?? null,
    counterfactualPassed5pct: row.counterfactual?.passed5pct ?? null,
  })),
})}`);
