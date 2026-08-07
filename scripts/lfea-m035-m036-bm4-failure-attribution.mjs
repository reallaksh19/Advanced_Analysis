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
const CROSS_EFFECT = new Set([
  ...M035_NONLINEAR_SUPPORT_NODE_IDS,
  ...M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
]);
const CASE19_HISTORY_AFFECTED_CASES = new Set(['SUS', 'EXP']);
const HISTORY_OBSERVED_RELEASES = Object.freeze(['20090', '21470']);
const REDUCER_ADJACENCY_EDGES = 1;

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
      local: {
        I: subtractFields(ope.local.I, sus.local.I, ACTIONS),
        J: subtractFields(ope.local.J, sus.local.J, ACTIONS),
      },
      global: {
        I: subtractFields(ope.global.I, sus.global.I, ACTIONS),
        J: subtractFields(ope.global.J, sus.global.J, ACTIONS),
      },
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
  return FORCES.has(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.force
    : BM4_COMPARISON_POLICY.absoluteTolerance.moment;
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
  return { UX: -row.FX, UY: -row.FY, UZ: -row.FZ, RX: -row.MX, RY: -row.MY, RZ: -row.MZ };
}
function scopeFor({ family, identifier, touchedNodes, bendTagged }) {
  const id = String(identifier);
  if (family === 'restraint' && NONLINEAR.has(id)) {
    return { included: false, code: 'M036_UNILATERAL_SUPPORT_REACTION_OUT_OF_SCOPE' };
  }
  if (family === 'displacement' && BEND_EXCLUDED.has(id)) {
    return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE' };
  }
  if ((family === 'globalForce' || family === 'localForce') && bendTagged
      && touchedNodes.some((nodeId) => BEND_EXCLUDED.has(String(nodeId)))) {
    return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE' };
  }
  const crossEffectPossible = touchedNodes.some((nodeId) => CROSS_EFFECT.has(String(nodeId)));
  return {
    included: true,
    code: crossEffectPossible ? 'M036_LIFTOFF_LOAD_PATH_CROSS_EFFECT_POSSIBLE' : 'M035_IN_SCOPE',
  };
}
function deviation({ family, identifier, end = null, field, ours, cii, touchedNodes, bendTagged = false }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const percentDifference = nearZero ? null : absoluteDifference / Math.abs(cii) * 100;
  const absoluteLimit = nearZero ? absoluteTolerance(family, field) : null;
  const passedTarget = nearZero
    ? Math.abs(absoluteDifference) <= absoluteLimit
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  return {
    family,
    identifier,
    end,
    field,
    ours,
    cii,
    absoluteDifference,
    percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT',
    absoluteLimit,
    passedTarget,
    m035Scope: scopeFor({ family, identifier, touchedNodes, bendTagged }),
  };
}
function compareNodes(family, own, reference) {
  const rows = [];
  for (const [nodeIdRaw, ciiRow] of reference) {
    const nodeId = String(nodeIdRaw);
    const actual = own.get(nodeId);
    if (!actual) continue;
    const cii = family === 'displacement' ? ciiDisplacement(ciiRow) : ciiRestraint(ciiRow);
    const values = family === 'displacement' ? actual.displacement : actual.reaction;
    for (const field of DOFS) rows.push(deviation({
      family,
      identifier: nodeId,
      field,
      ours: values[field] ?? 0,
      cii: cii[field],
      touchedNodes: [nodeId],
    }));
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
      family,
      identifier: pairKey,
      end,
      field,
      ours: actual[ownField][end][field],
      cii: cii[end][field],
      touchedNodes,
      bendTagged: actual.bendTagged,
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
  return CASES.flatMap((label) => ['displacement', 'restraint', 'globalForce', 'localForce']
    .flatMap((family) => cases[label][family].map((row) => ({ ...row, caseLabel: label }))));
}
function rowKey(row) {
  return `${row.caseLabel}|${row.family}|${row.identifier}|${row.end ?? ''}|${row.field}`;
}
function targetWidth(row) {
  return row.comparisonMode === 'RELATIVE_PERCENT'
    ? Math.abs(row.cii) * BM4_COMPARISON_POLICY.targetTolerancePercent / 100
    : row.absoluteLimit;
}
function touchedNodes(row) {
  if (row.family === 'displacement' || row.family === 'restraint') return [String(row.identifier)];
  return String(row.identifier).split('-').map(String);
}
function sourceNodeId(nodeId) { return String(nodeId).replace(/^BM4M035\.N/u, ''); }
function buildAdjacency(geometry) {
  const result = new Map(geometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const segment of geometry.segments) {
    const i = String(segment.startNodeId);
    const j = String(segment.endNodeId);
    result.get(i)?.add(j);
    result.get(j)?.add(i);
  }
  return result;
}
function distanceToSet(startNodes, targets, adjacency, limit) {
  const queue = startNodes.map((nodeId) => [String(nodeId), 0]);
  const visited = new Set();
  while (queue.length) {
    const [nodeId, distance] = queue.shift();
    if (visited.has(nodeId) || distance > limit) continue;
    visited.add(nodeId);
    if (targets.has(nodeId)) return distance;
    if (distance === limit) continue;
    for (const next of adjacency.get(nodeId) ?? []) queue.push([next, distance + 1]);
  }
  return null;
}
function sensitivity(current, variant) {
  if (!variant) return { material: false, movement: null, errorImprovement: null, variantPassed5pct: null };
  const width = targetWidth(current);
  const movement = Math.abs(variant.ours - current.ours);
  const errorImprovement = Math.abs(current.absoluteDifference) - Math.abs(variant.absoluteDifference);
  return {
    material: Number.isFinite(width) && movement >= width && errorImprovement > 0,
    movement,
    targetWidth: width,
    errorImprovement,
    variantPassed5pct: variant.passedTarget,
    variantOurs: variant.ours,
    variantPercentDifference: variant.percentDifference,
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
  const sourceNodes = new Set(snapshot.nodes.get('SUS').keys());
  const sourcePairs = new Set(snapshot.elements.get('SUS').map((row) => row.pairKey));
  for (const caseLabel of CASES) {
    for (const family of ['displacement', 'restraint']) {
      for (const nodeIdRaw of cii[family].get(caseLabel).keys()) {
        const nodeId = String(nodeIdRaw);
        if (!sourceNodes.has(nodeId)) result.push({
          caseLabel,
          family,
          identifier: nodeId,
          primaryCategory: 'UNMATCHED_CAESAR_STATION_OR_NODE',
          reason: 'CAESAR result node is not a source model node; no off-node value is invented.',
        });
      }
    }
    for (const family of ['globalForce', 'localForce']) {
      for (const [pairKey, group] of cii[family].get(caseLabel).byPair) {
        if (group.length !== 1) result.push({
          caseLabel,
          family,
          identifier: pairKey,
          primaryCategory: 'UNMATCHED_CAESAR_STATION_OR_PAIR',
          reason: `${group.length} CAESAR rows share this pair; no arbitrary row selection is allowed.`,
        });
        else if (!sourcePairs.has(pairKey)) result.push({
          caseLabel,
          family,
          identifier: pairKey,
          primaryCategory: 'UNMATCHED_CAESAR_STATION_OR_PAIR',
          reason: 'CAESAR pair has no 1:1 source element mapping; no internal-station interpolation is invented.',
        });
      }
    }
  }
  return result;
}

const cii = loadBm4CiiOutputCases1921();
const m035 = solveBm4M035FeatureCases();
const combined = solveBm4M035M036Combined();
const m035Cases = compareSnapshot(featureSnapshot(m035), cii);
const combinedSnapshot = featureSnapshot(combined);
const combinedCases = compareSnapshot(combinedSnapshot, cii);

const m035Rows = allRows(m035Cases);
const combinedRows = allRows(combinedCases);
const m035ByKey = new Map(m035Rows.map((row) => [rowKey(row), row]));

const m035Displacement = m035Rows.filter((row) => row.family === 'displacement');
const m035Forces = m035Rows.filter((row) => row.family !== 'displacement');
assert.equal(m035Displacement.length, 1746, 'M035 displacement comparison row-count parity');
assert.equal(m035Forces.length, 6516, 'M035 force comparison row-count parity');
assert.ok(Math.abs(m035Displacement.filter((row) => row.passedTarget).length / m035Displacement.length * 100
  - 18.499427262313862) < 1e-12, 'M035 raw displacement rate parity');
assert.ok(Math.abs(m035Forces.filter((row) => row.passedTarget).length / m035Forces.length * 100
  - 28.959484346224677) < 1e-12, 'M035 raw force rate parity');

const reducerNodes = new Set(combined.authorities.inlineReducers.transitions.map((row) => String(row.nodeId)));
const adjacency = buildAdjacency(combined.authorities.sourceGeometry);
const failedRows = combinedRows.filter((row) => !row.passedTarget).map((row) => {
  const key = rowKey(row);
  const nodes = touchedNodes(row);
  const reducerDistanceEdges = distanceToSet(nodes, reducerNodes, adjacency, REDUCER_ADJACENCY_EDGES);
  const m035Sensitivity = sensitivity(row, m035ByKey.get(key));
  const case19HistoryBoundary = CASE19_HISTORY_AFFECTED_CASES.has(row.caseLabel);
  const directNonlinearSupport = row.family === 'restraint' && NONLINEAR.has(String(row.identifier));
  const bendEndpointBoundary = nodes.some((nodeId) => BEND_EXCLUDED.has(nodeId));
  const contactSensitive = directNonlinearSupport || m035Sensitivity.material;
  const evidenceFlags = [
    ...(case19HistoryBoundary ? ['CASE19_HISTORY_UNSERIALIZED_AFFECTS_CASE'] : []),
    ...(reducerDistanceEdges !== null ? [`REDUCER_WITHIN_${reducerDistanceEdges}_SOURCE_EDGES`] : []),
    ...(contactSensitive ? ['M036_CONTACT_LOAD_PATH_SENSITIVE'] : []),
    ...(bendEndpointBoundary ? ['BEND_ENDPOINT_OR_STATION_SEMANTICS_BOUNDARY'] : []),
    ...(!row.m035Scope.included ? [`PREDECLARED_SCOPE:${row.m035Scope.code}`] : []),
  ];
  let primaryCategory = 'UNEXPLAINED_MATCHED';
  if (case19HistoryBoundary) primaryCategory = 'CASE19_HISTORY_UNRESOLVED';
  else if (reducerDistanceEdges !== null) primaryCategory = 'REDUCER_ADJACENT';
  else if (contactSensitive) primaryCategory = 'CONTACT_LOAD_PATH_SENSITIVE';
  else if (bendEndpointBoundary) primaryCategory = 'BEND_ENDPOINT_OR_STATION_SEMANTICS';
  return {
    ...row,
    primaryCategory,
    evidenceFlags,
    touchedNodes: nodes,
    reducerDistanceEdges,
    normalizedSeverity: normalizedSeverity(row),
    m035ToCombinedSensitivity: m035Sensitivity,
    case19HistoryBoundary,
  };
});

const unmatchedReference = unmatchedReferenceRows(combinedSnapshot, cii);
const unexplained = failedRows
  .filter((row) => row.primaryCategory === 'UNEXPLAINED_MATCHED')
  .sort((a, b) => b.normalizedSeverity - a.normalizedSeverity);
const report = {
  schema: 'm035-m036-bm4-failure-attribution/v1',
  policy: {
    targetTolerancePercent: BM4_COMPARISON_POLICY.targetTolerancePercent,
    reducerAdjacencyEdges: REDUCER_ADJACENCY_EDGES,
    case19HistoryBoundary: {
      authoritativeHistoryAvailable: false,
      observedCaesarReleasedTargets: HISTORY_OBSERVED_RELEASES,
      normalCombinedReleasedTargets: ['20090'],
      affectedCases: ['SUS', 'EXP'],
      counterfactualStatus: 'BLOCKED_RECOVERY_NOT_USED',
      reason: 'The supplied InputXML does not serialize the CAESAR CASE 19 history. Imposing the additional observed 21470 release produces a BLOCKED SUS execution, so no recovery from that counterfactual is accepted. SUS and derived EXP failures are withheld from mechanics fitting.',
    },
    contactSensitivityRule: 'For clean OPE discrimination, M035-bilateral to combined-M036 change must move a failed row toward CAESAR by at least one row-specific 5% target-width; direct nonlinear restraint rows are also contact-tagged.',
    mechanicsChangeRule: 'Only UNEXPLAINED_MATCHED rows are eligible to motivate additional mechanics work. CASE19/EXP history-boundary, reducer-adjacent, contact-sensitive, bend/station-boundary, and unmatched CAESAR rows are not fit targets.',
  },
  evidence: {
    reducerNodes: [...reducerNodes].sort(),
    normalReleaseStates: {
      SUS: combined.sustainedRun.convergedState.filter((row) => row.status === 'RELEASED').map((row) => sourceNodeId(row.nodeId)).sort(),
      OPE: combined.operatingRun.convergedState.filter((row) => row.status === 'RELEASED').map((row) => sourceNodeId(row.nodeId)).sort(),
    },
  },
  summary: {
    matchedRows: combinedRows.length,
    matchedFailures5pct: failedRows.length,
    matchedPasses5pct: combinedRows.length - failedRows.length,
    failureCategories: countBy(failedRows, 'primaryCategory'),
    failureCases: countBy(failedRows, 'caseLabel'),
    failureFamilies: countBy(failedRows, 'family'),
    unmatchedReferenceRows: unmatchedReference.length,
    genuinelyUnexplainedMatchedRows: unexplained.length,
  },
  topUnexplained: unexplained.slice(0, 100),
  matchedFailures: failedRows,
  unmatchedReference,
};

const reportDir = fileURLToPath(new URL('../reports', import.meta.url));
mkdirSync(reportDir, { recursive: true });
writeFileSync(`${reportDir}/m035-m036-bm4-failure-attribution.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(`M035_M036_ATTRIBUTION_SUMMARY=${JSON.stringify(report.summary)}`);
console.log(`M035_M036_ATTRIBUTION_REDUCERS=${JSON.stringify(report.evidence.reducerNodes)}`);
console.log(`M035_M036_ATTRIBUTION_TOP_UNEXPLAINED=${JSON.stringify(report.topUnexplained.slice(0, 12).map((row) => ({
  caseLabel: row.caseLabel,
  family: row.family,
  identifier: row.identifier,
  end: row.end,
  field: row.field,
  percentDifference: row.percentDifference,
  normalizedSeverity: row.normalizedSeverity,
})))}`);
