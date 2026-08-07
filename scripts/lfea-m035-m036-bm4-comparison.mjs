#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BM4_COMPARISON_POLICY, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import {
  M035_BEND_SCORING_EXCLUDED_NODE_IDS,
  M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
  M035_NONLINEAR_SUPPORT_NODE_IDS,
} from './lfea-m035-bm4-scope-policy.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTIONS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const TRANSLATIONS = new Set(['UX', 'UY', 'UZ']);
const FORCES = new Set(['fx', 'fy', 'fz']);
const NONLINEAR = new Set(M035_NONLINEAR_SUPPORT_NODE_IDS);
const BEND_EXCLUDED = new Set(M035_BEND_SCORING_EXCLUDED_NODE_IDS);
const CROSS_EFFECT = new Set([...M035_NONLINEAR_SUPPORT_NODE_IDS, ...M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS]);

function zeroDof() { return Object.fromEntries(DOFS.map((dof) => [dof, 0])); }
function subtractFields(a = {}, b = {}, fields = DOFS) {
  return Object.fromEntries(fields.map((field) => [field, (a[field] ?? 0) - (b[field] ?? 0)]));
}
function vectorByNode(rows) {
  const result = new Map();
  for (const row of rows) {
    const value = result.get(row.nodeId) ?? zeroDof();
    value[row.dof] = row.value;
    result.set(row.nodeId, value);
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
function ownElement(sourceEntry, actions) {
  return {
    pairKey: `${sourceEntry.sourceSegment.startNodeId}-${sourceEntry.sourceSegment.endNodeId}`,
    fromNode: String(sourceEntry.sourceSegment.startNodeId),
    toNode: String(sourceEntry.sourceSegment.endNodeId),
    bendTagged: sourceEntry.sourceSegment.type === 'BEND',
    rigid: sourceEntry.rigidAuthority !== null,
    global: actions.global,
    local: actions.local,
  };
}
function featureSnapshot(solved) {
  const susDisp = vectorByNode(solved.sustained.execution.displacement);
  const opeDisp = vectorByNode(solved.operating.execution.displacement);
  const susReact = vectorByNode(solved.sustained.execution.reactions);
  const opeReact = vectorByNode(solved.operating.execution.reactions);
  const nodes = new Map([['SUS', new Map()], ['OPE', new Map()], ['EXP', new Map()]]);
  for (const node of solved.authorities.sourceGeometry.nodes) {
    const sourceId = String(node.id);
    const kernel = `BM4M035.N${sourceId}`;
    const susD = susDisp.get(kernel) ?? zeroDof();
    const opeD = opeDisp.get(kernel) ?? zeroDof();
    const susR = susReact.get(kernel) ?? zeroDof();
    const opeR = opeReact.get(kernel) ?? zeroDof();
    nodes.get('SUS').set(sourceId, { displacement: susD, reaction: susR });
    nodes.get('OPE').set(sourceId, { displacement: opeD, reaction: opeR });
    nodes.get('EXP').set(sourceId, {
      displacement: subtractFields(opeD, susD),
      reaction: subtractFields(opeR, susR),
    });
  }
  const susActions = sourceActionMap(solved.authorities, solved.sustained.recovery);
  const opeActions = sourceActionMap(solved.authorities, solved.operating.recovery);
  const elements = new Map([['SUS', []], ['OPE', []], ['EXP', []]]);
  for (const sourceEntry of solved.authorities.base.entries) {
    const id = String(sourceEntry.sourceSegment.id);
    const sus = susActions.get(id);
    const ope = opeActions.get(id);
    const exp = {
      local: { I: subtractFields(ope.local.I, sus.local.I, ACTIONS), J: subtractFields(ope.local.J, sus.local.J, ACTIONS) },
      global: { I: subtractFields(ope.global.I, sus.global.I, ACTIONS), J: subtractFields(ope.global.J, sus.global.J, ACTIONS) },
    };
    elements.get('SUS').push(ownElement(sourceEntry, sus));
    elements.get('OPE').push(ownElement(sourceEntry, ope));
    elements.get('EXP').push(ownElement(sourceEntry, exp));
  }
  return { nodes, elements };
}
function absoluteTolerance(family, field) {
  if (family === 'displacement') return TRANSLATIONS.has(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.translation
    : BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  return TRANSLATIONS.has(field) || FORCES.has(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.force
    : BM4_COMPARISON_POLICY.absoluteTolerance.moment;
}
function ciiDisplacement(row) {
  return { UX: row.DX / 1000, UY: row.DY / 1000, UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180, RY: row.RY * Math.PI / 180, RZ: row.RZ * Math.PI / 180 };
}
function ciiRestraint(row) {
  return { UX: -row.FX, UY: -row.FY, UZ: -row.FZ, RX: -row.MX, RY: -row.MY, RZ: -row.MZ };
}
function scopeFor({ family, identifier, touchedNodes, bendTagged }) {
  const id = String(identifier);
  if (family === 'restraint' && NONLINEAR.has(id)) return { included: false, code: 'M036_UNILATERAL_SUPPORT_REACTION_OUT_OF_SCOPE' };
  if (family === 'displacement' && BEND_EXCLUDED.has(id)) return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE' };
  if ((family === 'globalForce' || family === 'localForce') && bendTagged
    && touchedNodes.some((nodeId) => BEND_EXCLUDED.has(String(nodeId)))) {
    return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE' };
  }
  const crossEffectPossible = touchedNodes.some((nodeId) => CROSS_EFFECT.has(String(nodeId)));
  return { included: true, code: crossEffectPossible ? 'M036_LIFTOFF_LOAD_PATH_CROSS_EFFECT_POSSIBLE' : 'M035_IN_SCOPE' };
}
function deviation({ family, identifier, end = null, field, ours, cii, touchedNodes, bendTagged = false }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const percentDifference = nearZero ? null : absoluteDifference / Math.abs(cii) * 100;
  const passedTarget = nearZero
    ? Math.abs(absoluteDifference) <= absoluteTolerance(family, field)
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  const passedStandingBar = nearZero
    ? Math.abs(absoluteDifference) <= absoluteTolerance(family, field)
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.relativeTolerancePercent;
  return { family, identifier, end, field, ours, cii, absoluteDifference, percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT', passedTarget, passedStandingBar,
    m035Scope: scopeFor({ family, identifier, touchedNodes, bendTagged }) };
}
function compareNodes(family, own, reference) {
  const rows = [];
  for (const [nodeIdRaw, ciiRow] of reference) {
    const nodeId = String(nodeIdRaw);
    const actual = own.get(nodeId);
    if (!actual) continue;
    const cii = family === 'displacement' ? ciiDisplacement(ciiRow) : ciiRestraint(ciiRow);
    const values = family === 'displacement' ? actual.displacement : actual.reaction;
    for (const field of DOFS) rows.push(deviation({ family, identifier: nodeId, field,
      ours: values[field] ?? 0, cii: cii[field], touchedNodes: [nodeId] }));
  }
  return rows;
}
function compareElements(family, ownField, ownRows, referenceByPair) {
  const rows = [];
  const ownByPair = new Map(ownRows.map((row) => [row.pairKey, row]));
  for (const [pairKey, ciiGroup] of referenceByPair) {
    if (ciiGroup.length !== 1) continue;
    const actual = ownByPair.get(pairKey);
    if (!actual) continue;
    const cii = ciiGroup[0];
    const touchedNodes = [String(cii.fromNode), String(cii.toNode)];
    for (const end of ['I', 'J']) for (const field of ACTIONS) rows.push(deviation({
      family, identifier: pairKey, end, field, ours: actual[ownField][end][field], cii: cii[end][field],
      touchedNodes, bendTagged: actual.bendTagged,
    }));
  }
  return rows;
}
function compareSnapshot(snapshot, cii) {
  const result = {};
  for (const label of CASES) result[label] = {
    displacement: compareNodes('displacement', snapshot.nodes.get(label), cii.displacement.get(label)),
    restraint: compareNodes('restraint', snapshot.nodes.get(label), cii.restraint.get(label)),
    globalForce: compareElements('globalForce', 'global', snapshot.elements.get(label), cii.globalForce.get(label).byPair),
    localForce: compareElements('localForce', 'local', snapshot.elements.get(label), cii.localForce.get(label).byPair),
  };
  return result;
}
function summarize(rows, scoped) {
  const selected = scoped ? rows.filter((row) => row.m035Scope.included) : rows;
  const pass5 = selected.filter((row) => row.passedTarget).length;
  const pass10 = selected.filter((row) => row.passedStandingBar).length;
  return { comparisons: selected.length, passedTarget5pct: pass5, target5pctRate: selected.length ? pass5 / selected.length : null,
    passedStandingBar10pct: pass10, standingBar10pctRate: selected.length ? pass10 / selected.length : null };
}
function aggregate(cases) {
  const gather = (families) => CASES.flatMap((label) => families.flatMap((family) => cases[label][family]));
  const displacement = gather(['displacement']);
  const forces = gather(['restraint', 'globalForce', 'localForce']);
  return {
    raw: { displacement: summarize(displacement, false), forces: summarize(forces, false) },
    scoped: { displacement: summarize(displacement, true), forces: summarize(forces, true) },
  };
}
function ratePct(summary) { return summary.target5pctRate * 100; }
function probe(cases, nodeId, label = 'OPE', family = 'restraint', field = 'UY') {
  const row = cases[label][family].find((candidate) => candidate.identifier === nodeId && candidate.field === field);
  return row ? { ours: row.ours, cii: row.cii, percentDifference: row.percentDifference, passed5pct: row.passedTarget } : null;
}

const cii = loadBm4CiiOutputCases1921();
const m035 = solveBm4M035FeatureCases();
const combined = solveBm4M035M036Combined();
const m035Cases = compareSnapshot(featureSnapshot(m035), cii);
const combinedCases = compareSnapshot(featureSnapshot(combined), cii);
const m035Aggregate = aggregate(m035Cases);
const combinedAggregate = aggregate(combinedCases);

assert.ok(Math.abs(ratePct(m035Aggregate.raw.displacement) - 18.499427262313862) < 1e-12, 'comparison parity: M035 raw displacement');
assert.ok(Math.abs(ratePct(m035Aggregate.raw.forces) - 28.959484346224677) < 1e-12, 'comparison parity: M035 raw forces');

const report = {
  schema: 'm035-m036-bm4-cases-19-20-21-comparison/v1',
  m035: m035Aggregate,
  combined: combinedAggregate,
  deltaPercentagePoints: {
    rawDisplacement5pct: ratePct(combinedAggregate.raw.displacement) - ratePct(m035Aggregate.raw.displacement),
    rawForces5pct: ratePct(combinedAggregate.raw.forces) - ratePct(m035Aggregate.raw.forces),
    scopedDisplacement5pct: ratePct(combinedAggregate.scoped.displacement) - ratePct(m035Aggregate.scoped.displacement),
    scopedForces5pct: ratePct(combinedAggregate.scoped.forces) - ratePct(m035Aggregate.scoped.forces),
  },
  probes: {
    node20090OpeUy: { m035: probe(m035Cases, '20090'), combined: probe(combinedCases, '20090') },
    node20170OpeUy: { m035: probe(m035Cases, '20170'), combined: probe(combinedCases, '20170') },
    node21640OpeUy: { m035: probe(m035Cases, '21640'), combined: probe(combinedCases, '21640') },
  },
  releaseStates: {
    SUS: combined.sustainedRun.convergedState.filter((row) => row.status === 'RELEASED').map((row) => row.nodeId),
    OPE: combined.operatingRun.convergedState.filter((row) => row.status === 'RELEASED').map((row) => row.nodeId),
  },
};
const reportDir = fileURLToPath(new URL('../reports', import.meta.url));
mkdirSync(reportDir, { recursive: true });
writeFileSync(`${reportDir}/m035-m036-bm4-cases-19-20-21.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`M035_M036_COMPARISON_SUMMARY=${JSON.stringify({
  m035: {
    rawDisplacement5pct: ratePct(m035Aggregate.raw.displacement), rawForces5pct: ratePct(m035Aggregate.raw.forces),
    scopedDisplacement5pct: ratePct(m035Aggregate.scoped.displacement), scopedForces5pct: ratePct(m035Aggregate.scoped.forces),
  },
  combined: {
    rawDisplacement5pct: ratePct(combinedAggregate.raw.displacement), rawForces5pct: ratePct(combinedAggregate.raw.forces),
    scopedDisplacement5pct: ratePct(combinedAggregate.scoped.displacement), scopedForces5pct: ratePct(combinedAggregate.scoped.forces),
  },
  deltaPercentagePoints: report.deltaPercentagePoints, probes: report.probes,
})}`);
