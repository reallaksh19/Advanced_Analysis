#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BM4_COMPARISON_POLICY, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';
import {
  M035_BEND_SCORING_EXCLUDED_NODE_IDS,
  M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
  M035_NONLINEAR_SUPPORT_NODE_IDS,
} from './lfea-m035-bm4-scope-policy.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const FAMILIES = Object.freeze(['displacement', 'restraint', 'globalForce', 'localForce']);
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTIONS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const TRANSLATIONS = new Set(['UX', 'UY', 'UZ']);
const FORCES = new Set(['fx', 'fy', 'fz']);
const NONLINEAR = new Set(M035_NONLINEAR_SUPPORT_NODE_IDS);
const BEND_EXCLUDED = new Set(M035_BEND_SCORING_EXCLUDED_NODE_IDS);
const CROSS_EFFECT = new Set([...NONLINEAR, ...M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS]);
const HISTORY_CASES = new Set(['SUS', 'EXP']);
const REDUCER_ADJACENCY_EDGES = 1;

function zeroDof() { return Object.fromEntries(DOFS.map((field) => [field, 0])); }
function subtract(left = {}, right = {}, fields = DOFS) {
  return Object.fromEntries(fields.map((field) => [field, (left[field] ?? 0) - (right[field] ?? 0)]));
}
function vectorByNode(rows) {
  const result = new Map();
  for (const row of rows) {
    const current = result.get(row.nodeId) ?? zeroDof();
    current[row.dof] = row.value;
    result.set(row.nodeId, current);
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
    result.set(sourceId, {
      local: { I: first.local.I, J: last.local.J },
      global: { I: first.global.I, J: last.global.J },
    });
  }
  return result;
}
function ownElement(sourceEntry, actions) {
  const source = sourceEntry.sourceSegment;
  return {
    pairKey: `${source.startNodeId}-${source.endNodeId}`,
    fromNode: String(source.startNodeId),
    toNode: String(source.endNodeId),
    bendTagged: source.type === 'BEND',
    global: actions.global,
    local: actions.local,
  };
}
function featureSnapshot(solved) {
  const susDisp = vectorByNode(solved.sustained.execution.displacement);
  const opeDisp = vectorByNode(solved.operating.execution.displacement);
  const susReact = vectorByNode(solved.sustained.execution.reactions);
  const opeReact = vectorByNode(solved.operating.execution.reactions);
  const nodes = new Map(CASES.map((label) => [label, new Map()]));
  for (const node of solved.authorities.sourceGeometry.nodes) {
    const id = String(node.id);
    const kernel = `BM4M035.N${id}`;
    const susD = susDisp.get(kernel) ?? zeroDof();
    const opeD = opeDisp.get(kernel) ?? zeroDof();
    const susR = susReact.get(kernel) ?? zeroDof();
    const opeR = opeReact.get(kernel) ?? zeroDof();
    nodes.get('SUS').set(id, { displacement: susD, reaction: susR });
    nodes.get('OPE').set(id, { displacement: opeD, reaction: opeR });
    nodes.get('EXP').set(id, { displacement: subtract(opeD, susD), reaction: subtract(opeR, susR) });
  }
  const sus = sourceActions(solved.authorities, solved.sustained.recovery);
  const ope = sourceActions(solved.authorities, solved.operating.recovery);
  const elements = new Map(CASES.map((label) => [label, []]));
  for (const sourceEntry of solved.authorities.base.entries) {
    const id = String(sourceEntry.sourceSegment.id);
    const s = sus.get(id);
    const o = ope.get(id);
    const e = {
      local: { I: subtract(o.local.I, s.local.I, ACTIONS), J: subtract(o.local.J, s.local.J, ACTIONS) },
      global: { I: subtract(o.global.I, s.global.I, ACTIONS), J: subtract(o.global.J, s.global.J, ACTIONS) },
    };
    elements.get('SUS').push(ownElement(sourceEntry, s));
    elements.get('OPE').push(ownElement(sourceEntry, o));
    elements.get('EXP').push(ownElement(sourceEntry, e));
  }
  return { nodes, elements };
}
function absoluteTolerance(family, field) {
  if (family === 'displacement') return TRANSLATIONS.has(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.translation
    : BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  if (TRANSLATIONS.has(field) || FORCES.has(field)) return BM4_COMPARISON_POLICY.absoluteTolerance.force;
  return BM4_COMPARISON_POLICY.absoluteTolerance.moment;
}
function ciiDisplacement(row) {
  return {
    UX: row.DX / 1000, UY: row.DY / 1000, UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180, RY: row.RY * Math.PI / 180, RZ: row.RZ * Math.PI / 180,
  };
}
function ciiRestraint(row) {
  return { UX: -row.FX, UY: -row.FY, UZ: -row.FZ, RX: -row.MX, RY: -row.MY, RZ: -row.MZ };
}
function scopeFor(family, identifier, nodes, bendTagged) {
  const id = String(identifier);
  if (family === 'restraint' && NONLINEAR.has(id)) return { included: false, code: 'M036_UNILATERAL_SUPPORT_REACTION_OUT_OF_SCOPE' };
  if (family === 'displacement' && BEND_EXCLUDED.has(id)) return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE' };
  if ((family === 'globalForce' || family === 'localForce') && bendTagged && nodes.some((node) => BEND_EXCLUDED.has(String(node)))) {
    return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE' };
  }
  return { included: true, code: nodes.some((node) => CROSS_EFFECT.has(String(node))) ? 'M036_LIFTOFF_LOAD_PATH_CROSS_EFFECT_POSSIBLE' : 'M035_IN_SCOPE' };
}
function deviation({ family, identifier, end = null, field, ours, cii, nodes, bendTagged = false }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const percentDifference = nearZero ? null : absoluteDifference / Math.abs(cii) * 100;
  const absoluteLimit = nearZero ? absoluteTolerance(family, field) : null;
  const passedTarget = nearZero
    ? Math.abs(absoluteDifference) <= absoluteLimit
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  return {
    family, identifier, end, field, ours, cii, absoluteDifference, percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT',
    absoluteLimit, passedTarget, m035Scope: scopeFor(family, identifier, nodes, bendTagged),
  };
}
function compareNodes(family, own, ciiMap) {
  const rows = [];
  for (const [nodeRaw, ciiRow] of ciiMap) {
    const node = String(nodeRaw);
    const actual = own.get(node);
    if (!actual) continue;
    const reference = family === 'displacement' ? ciiDisplacement(ciiRow) : ciiRestraint(ciiRow);
    const values = family === 'displacement' ? actual.displacement : actual.reaction;
    for (const field of DOFS) rows.push(deviation({ family, identifier: node, field, ours: values[field] ?? 0, cii: reference[field], nodes: [node] }));
  }
  return rows;
}
function compareElements(family, ownField, ownRows, ciiByPair) {
  const rows = [];
  const ownByPair = new Map(ownRows.map((row) => [row.pairKey, row]));
  for (const [pairKey, group] of ciiByPair) {
    if (group.length !== 1) continue;
    const actual = ownByPair.get(pairKey);
    if (!actual) continue;
    const cii = group[0];
    const nodes = [String(cii.fromNode), String(cii.toNode)];
    for (const end of ['I', 'J']) for (const field of ACTIONS) rows.push(deviation({
      family, identifier: pairKey, end, field, ours: actual[ownField][end][field], cii: cii[end][field], nodes, bendTagged: actual.bendTagged,
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
function allRows(cases) {
  return CASES.flatMap((caseLabel) => FAMILIES.flatMap((family) => cases[caseLabel][family].map((row) => ({ ...row, caseLabel }))));
}
function rowKey(row) { return `${row.caseLabel}|${row.family}|${row.identifier}|${row.end ?? ''}|${row.field}`; }
function targetWidth(row) {
  return row.comparisonMode === 'RELATIVE_PERCENT'
    ? Math.abs(row.cii) * BM4_COMPARISON_POLICY.targetTolerancePercent / 100
    : row.absoluteLimit;
}
function touchedNodes(row) {
  return row.family === 'displacement' || row.family === 'restraint' ? [String(row.identifier)] : String(row.identifier).split('-');
}
function sourceNodeId(nodeId) { return String(nodeId).replace(/^BM4M035\.N/u, ''); }
function adjacency(geometry) {
  const map = new Map(geometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const segment of geometry.segments) {
    const i = String(segment.startNodeId); const j = String(segment.endNodeId);
    map.get(i)?.add(j); map.get(j)?.add(i);
  }
  return map;
}
function distanceToSet(start, targets, graph, limit) {
  const queue = start.map((node) => [String(node), 0]);
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
function sensitivity(current, variant) {
  if (!variant) return { material: false };
  const width = targetWidth(current);
  const movement = Math.abs(variant.ours - current.ours);
  const errorImprovement = Math.abs(current.absoluteDifference) - Math.abs(variant.absoluteDifference);
  return {
    material: Number.isFinite(width) && movement >= width,
    movement, targetWidth: width, errorImprovement,
    variantOurs: variant.ours, variantPercentDifference: variant.percentDifference, variantPassed5pct: variant.passedTarget,
  };
}
function countBy(rows, field) {
  const result = {};
  for (const row of rows) result[row[field]] = (result[row[field]] ?? 0) + 1;
  return result;
}
function normalizedSeverity(row) {
  const width = targetWidth(row);
  return width > 0 ? Math.abs(row.absoluteDifference) / width : Number.POSITIVE_INFINITY;
}
function unmatchedReferenceRows(snapshot, cii) {
  const result = [];
  const nodes = new Set(snapshot.nodes.get('SUS').keys());
  const pairs = new Set(snapshot.elements.get('SUS').map((row) => row.pairKey));
  for (const caseLabel of CASES) {
    for (const family of ['displacement', 'restraint']) for (const nodeRaw of cii[family].get(caseLabel).keys()) {
      const id = String(nodeRaw);
      if (!nodes.has(id)) result.push({ caseLabel, family, identifier: id, primaryCategory: 'UNMATCHED_CAESAR_STATION_OR_NODE' });
    }
    for (const family of ['globalForce', 'localForce']) for (const [pair, group] of cii[family].get(caseLabel).byPair) {
      if (group.length !== 1 || !pairs.has(pair)) result.push({
        caseLabel, family, identifier: pair, primaryCategory: 'UNMATCHED_CAESAR_STATION_OR_PAIR',
        reason: group.length !== 1 ? `${group.length} CAESAR rows share this pair.` : 'No 1:1 source element mapping; no internal-station interpolation is invented.',
      });
    }
  }
  return result;
}

const rawCii = loadBm4CiiOutputCases1921();
const m035 = solveBm4M035FeatureCases();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, m035.authorities);
const combined = solveBm4M035M036Combined();
const m035Rows = allRows(compareSnapshot(featureSnapshot(m035), cii));
const combinedSnapshot = featureSnapshot(combined);
const combinedRows = allRows(compareSnapshot(combinedSnapshot, cii));
const m035ByKey = new Map(m035Rows.map((row) => [rowKey(row), row]));
const m035Displacement = m035Rows.filter((row) => row.family === 'displacement');
const m035Forces = m035Rows.filter((row) => row.family !== 'displacement');
assert.equal(m035Displacement.length, 1746, 'M035 displacement comparison row-count parity');
assert.equal(m035Forces.length, 6516, 'M035 force comparison row-count parity');
assert.ok(Math.abs(m035Displacement.filter((row) => row.passedTarget).length / m035Displacement.length * 100 - 18.499427262313862) < 1e-12, 'M035 raw displacement rate parity');
assert.ok(Math.abs(m035Forces.filter((row) => row.passedTarget).length / m035Forces.length * 100 - 31.49171270718232) < 1e-12, 'M035 raw force rate parity after local-axis reference normalization');

const reducerNodes = new Set(combined.authorities.inlineReducers.transitions.map((row) => String(row.nodeId)));
const rigidElementPairs = new Set(combined.authorities.base.entries
  .filter((row) => row.rigidAuthority !== null)
  .map((row) => `${row.sourceSegment.startNodeId}-${row.sourceSegment.endNodeId}`));
const graph = adjacency(combined.authorities.sourceGeometry);
const failures = combinedRows.filter((row) => !row.passedTarget).map((row) => {
  const nodes = touchedNodes(row);
  const reducerDistanceEdges = distanceToSet(nodes, reducerNodes, graph, REDUCER_ADJACENCY_EDGES);
  const contact = sensitivity(row, m035ByKey.get(rowKey(row)));
  const historyBoundary = HISTORY_CASES.has(row.caseLabel);
  const directContact = row.family === 'restraint' && NONLINEAR.has(String(row.identifier));
  const bendBoundary = nodes.some((node) => BEND_EXCLUDED.has(String(node)));
  const contactSensitive = directContact || contact.material;
  const directRigidElementResult = (row.family === 'globalForce' || row.family === 'localForce') && rigidElementPairs.has(String(row.identifier));
  let primaryCategory = 'UNEXPLAINED_MATCHED';
  if (historyBoundary) primaryCategory = 'CASE19_HISTORY_UNRESOLVED';
  else if (reducerDistanceEdges !== null) primaryCategory = 'REDUCER_ADJACENT';
  else if (directRigidElementResult) primaryCategory = 'RIGID_ELEMENT_RESULT_SCOPE_BOUNDARY';
  else if (contactSensitive) primaryCategory = 'CONTACT_LOAD_PATH_SENSITIVE';
  else if (bendBoundary) primaryCategory = 'BEND_ENDPOINT_OR_STATION_SEMANTICS';
  return {
    ...row, primaryCategory, touchedNodes: nodes, reducerDistanceEdges, normalizedSeverity: normalizedSeverity(row),
    m035ToCombinedSensitivity: contact, case19HistoryBoundary: historyBoundary, directRigidElementResult,
    evidenceFlags: [
      ...(historyBoundary ? ['CASE19_HISTORY_UNSERIALIZED_AFFECTS_CASE'] : []),
      ...(reducerDistanceEdges !== null ? [`REDUCER_WITHIN_${reducerDistanceEdges}_SOURCE_EDGES`] : []),
      ...(directRigidElementResult ? ['M035_SCOPE_EXCLUDES_RIGID_ELEMENT_AUTHORITY_CHANGE'] : []),
      ...(contactSensitive ? ['M036_CONTACT_LOAD_PATH_SENSITIVE'] : []),
      ...(bendBoundary ? ['BEND_ENDPOINT_OR_STATION_SEMANTICS_BOUNDARY'] : []),
      ...(!row.m035Scope.included ? [`PREDECLARED_SCOPE:${row.m035Scope.code}`] : []),
    ],
  };
});
const unmatchedReference = unmatchedReferenceRows(combinedSnapshot, cii);
const unexplained = failures.filter((row) => row.primaryCategory === 'UNEXPLAINED_MATCHED').sort((a, b) => b.normalizedSeverity - a.normalizedSeverity);
const report = {
  schema: 'm035-m036-bm4-failure-attribution/v2',
  localForceReferenceNormalization: cii.localForceReferenceNormalization,
  policy: {
    targetTolerancePercent: BM4_COMPARISON_POLICY.targetTolerancePercent,
    reducerAdjacencyEdges: REDUCER_ADJACENCY_EDGES,
    case19HistoryBoundary: {
      authoritativeHistoryAvailable: false,
      observedCaesarReleasedTargets: ['20090', '21470'],
      normalCombinedReleasedTargets: ['20090'],
      affectedCases: ['SUS', 'EXP'],
      counterfactualStatus: 'BLOCKED_RECOVERY_NOT_USED',
      reason: 'InputXML does not serialize CAESAR CASE 19 history. Imposing the additional observed 21470 release produced a BLOCKED SUS execution, so no counterfactual recovery is accepted; SUS and derived EXP failures are withheld from mechanics fitting.',
    },
    contactSensitivityRule: 'For OPE, M035-bilateral to combined-M036 movement of at least one row-specific 5% target-width marks the row contact-load-path-sensitive, whether the movement improves or worsens CAESAR agreement; direct nonlinear restraint rows are also contact-tagged.',
    mechanicsChangeRule: 'Only UNEXPLAINED_MATCHED rows may motivate additional M035 mechanics work. Direct rigid-element result rows are a scope boundary because #834 explicitly excludes rigid-element authority changes; this does not assert that rigid weight caused the discrepancy.',
  },
  evidence: {
    reducerNodes: [...reducerNodes].sort(),
    rigidElementPairs: [...rigidElementPairs].sort(),
    normalReleaseStates: {
      SUS: combined.sustainedRun.convergedState.filter((row) => row.status === 'RELEASED').map((row) => sourceNodeId(row.nodeId)).sort(),
      OPE: combined.operatingRun.convergedState.filter((row) => row.status === 'RELEASED').map((row) => sourceNodeId(row.nodeId)).sort(),
    },
  },
  summary: {
    matchedRows: combinedRows.length,
    matchedFailures5pct: failures.length,
    matchedPasses5pct: combinedRows.length - failures.length,
    failureCategories: countBy(failures, 'primaryCategory'),
    failureCases: countBy(failures, 'caseLabel'),
    failureFamilies: countBy(failures, 'family'),
    unmatchedReferenceRows: unmatchedReference.length,
    genuinelyUnexplainedMatchedRows: unexplained.length,
  },
  topUnexplained: unexplained.slice(0, 100),
  matchedFailures: failures,
  unmatchedReference,
};
const reportDir = fileURLToPath(new URL('../reports', import.meta.url));
mkdirSync(reportDir, { recursive: true });
writeFileSync(`${reportDir}/m035-m036-bm4-failure-attribution.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`M035_M036_ATTRIBUTION_SUMMARY=${JSON.stringify(report.summary)}`);
console.log(`M035_M036_ATTRIBUTION_REDUCERS=${JSON.stringify(report.evidence.reducerNodes)}`);
console.log(`M035_M036_ATTRIBUTION_TOP_UNEXPLAINED=${JSON.stringify(report.topUnexplained.slice(0, 12).map((row) => ({ caseLabel: row.caseLabel, family: row.family, identifier: row.identifier, end: row.end, field: row.field, percentDifference: row.percentDifference, normalizedSeverity: row.normalizedSeverity })))}`);
