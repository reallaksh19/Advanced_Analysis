#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BM4_COMPARISON_POLICY, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const REPORT_DIR = fileURLToPath(new URL('../reports', import.meta.url));
const ATTRIBUTION_PATH = `${REPORT_DIR}/m035-m036-bm4-failure-attribution.json`;
const SOURCE_AUDIT_PATH = `${REPORT_DIR}/m037-bm4-source-level-ope-audit.json`;
const OUTPUT_PATH = `${REPORT_DIR}/m037-bm4-rigid-result-semantics.json`;
const NODE_PREFIX = 'BM4M035.N';
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const RIGID_DIRECT_CATEGORY = 'RIGID_ELEMENT_RESULT_SCOPE_BOUNDARY';
const RIGID_CHAIN_CATEGORY = 'RIGID_CHAIN_SOURCE_OR_RESULT_SEMANTICS_CANDIDATE';
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function zeroDof() {
  return Object.fromEntries(DOFS.map((field) => [field, 0]));
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

function ciiDisplacement(row) {
  if (!row) return null;
  return Object.freeze({
    UX: row.DX / 1000,
    UY: row.DY / 1000,
    UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180,
    RY: row.RY * Math.PI / 180,
    RZ: row.RZ * Math.PI / 180,
  });
}

function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, value) { return [a[0] * value, a[1] * value, a[2] * value]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { return Math.hypot(a[0], a[1], a[2]); }
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function motion(row) {
  return Object.freeze({
    translation: [row.UX ?? 0, row.UY ?? 0, row.UZ ?? 0],
    rotation: [row.RX ?? 0, row.RY ?? 0, row.RZ ?? 0],
  });
}

function compatibility(iRow, jRow, r) {
  const i = motion(iRow);
  const j = motion(jRow);
  const length = norm(r);
  assert.ok(length > 0, 'Rigid source pair must have nonzero length.');
  const axis = scale(r, 1 / length);
  const thetaAverage = scale(add(i.rotation, j.rotation), 0.5);
  const rigidBodyDelta = cross(thetaAverage, r);
  const actualDelta = subtract(j.translation, i.translation);
  const residual = subtract(actualDelta, rigidBodyDelta);
  const axialResidual = dot(residual, axis);
  const transverseResidual = subtract(residual, scale(axis, axialResidual));
  const rotationDifference = subtract(j.rotation, i.rotation);
  const transverseLimit = BM4_COMPARISON_POLICY.absoluteTolerance.translation
    + length * BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  const rotationLimit = BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  return Object.freeze({
    length,
    actualTranslationDelta: Object.freeze(actualDelta),
    rigidBodyTranslationDelta: Object.freeze(rigidBodyDelta),
    axialResidual,
    transverseResidual: Object.freeze(transverseResidual),
    transverseResidualNorm: norm(transverseResidual),
    transverseLimit,
    transverseWithinBenchmarkTolerance: norm(transverseResidual) <= transverseLimit,
    rotationDifference: Object.freeze(rotationDifference),
    rotationDifferenceNorm: norm(rotationDifference),
    rotationLimit,
    rotationWithinBenchmarkTolerance: norm(rotationDifference) <= rotationLimit,
  });
}

function touchedNodes(row) {
  if (row.family === 'displacement' || row.family === 'restraint') return [String(row.identifier)];
  return String(row.identifier).split('-').map(String);
}

function rowKey(row) {
  return `${row.caseLabel}|${row.family}|${row.identifier}|${row.end ?? ''}|${row.field}`;
}

function rigidPairs(entries) {
  return entries.filter((entry) => entry.rigidAuthority).map((entry) => Object.freeze({
    pairKey: `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`,
    startNodeId: String(entry.sourceSegment.startNodeId),
    endNodeId: String(entry.sourceSegment.endNodeId),
    sourceSegmentId: String(entry.sourceSegment.id),
    rigidElementId: entry.rigidAuthority.rigidElementId,
  })).sort((a, b) => lexical(a.pairKey, b.pairKey));
}

function rigidComponents(pairs) {
  const graph = new Map();
  for (const pair of pairs) {
    if (!graph.has(pair.startNodeId)) graph.set(pair.startNodeId, new Set());
    if (!graph.has(pair.endNodeId)) graph.set(pair.endNodeId, new Set());
    graph.get(pair.startNodeId).add(pair.endNodeId);
    graph.get(pair.endNodeId).add(pair.startNodeId);
  }
  const visited = new Set();
  const components = [];
  for (const seed of [...graph.keys()].sort(lexical)) {
    if (visited.has(seed)) continue;
    const queue = [seed];
    const nodes = [];
    visited.add(seed);
    while (queue.length > 0) {
      const node = queue.shift();
      nodes.push(node);
      for (const next of [...(graph.get(node) ?? [])].sort(lexical)) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    nodes.sort(lexical);
    const nodeSet = new Set(nodes);
    const componentPairs = pairs.filter((pair) => nodeSet.has(pair.startNodeId) && nodeSet.has(pair.endNodeId));
    components.push(Object.freeze({
      componentId: nodes.join('~'),
      nodes: Object.freeze(nodes),
      pairs: Object.freeze(componentPairs.map((pair) => pair.pairKey)),
    }));
  }
  return Object.freeze(components);
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function compatibilityClass(cii, lfea) {
  const ciiCompatible = cii.transverseWithinBenchmarkTolerance && cii.rotationWithinBenchmarkTolerance;
  const lfeaCompatible = lfea.transverseWithinBenchmarkTolerance && lfea.rotationWithinBenchmarkTolerance;
  if (ciiCompatible && lfeaCompatible) return 'BOTH_ENDPOINT_SETS_RIGID_COMPATIBLE_AT_BENCHMARK_TOLERANCE';
  if (ciiCompatible && !lfeaCompatible) return 'LFEA_RIGID_KINEMATICS_REQUIRES_REVIEW';
  if (!ciiCompatible && lfeaCompatible) return 'CAESAR_ENDPOINT_REPORTING_OR_FINITE_RIGID_RESPONSE_REQUIRES_REVIEW';
  return 'BOTH_SHOW_FINITE_RIGID_DEFORMATION_OR_REPORTING_EFFECTS';
}

const attribution = JSON.parse(readFileSync(ATTRIBUTION_PATH, 'utf8'));
const sourceAudit = JSON.parse(readFileSync(SOURCE_AUDIT_PATH, 'utf8'));
const solved = solveBm4M035M036Combined();
const cii = loadBm4CiiOutputCases1921();
const pairs = rigidPairs(solved.authorities.base.entries);
const components = rigidComponents(pairs);
const nodeById = new Map(solved.authorities.sourceGeometry.nodes.map((node) => [String(node.id), node]));
const lfeaDisp = vectorByNode(solved.operating.execution.displacement);
const ciiDisp = cii.displacement.get('OPE');

assert.equal(pairs.length, 20, 'BM4 rigid result-semantics audit expects exactly 20 retained rigid source pairs.');

const pairResults = pairs.map((pair) => {
  const iNode = nodeById.get(pair.startNodeId);
  const jNode = nodeById.get(pair.endNodeId);
  assert.ok(iNode && jNode, `Rigid pair ${pair.pairKey} must retain both source nodes.`);
  const r = [jNode.x - iNode.x, jNode.y - iNode.y, jNode.z - iNode.z];
  const lfeaI = lfeaDisp.get(`${NODE_PREFIX}${pair.startNodeId}`) ?? zeroDof();
  const lfeaJ = lfeaDisp.get(`${NODE_PREFIX}${pair.endNodeId}`) ?? zeroDof();
  const ciiI = ciiDisplacement(ciiDisp.get(pair.startNodeId));
  const ciiJ = ciiDisplacement(ciiDisp.get(pair.endNodeId));
  assert.ok(ciiI && ciiJ, `CAESAR OPE displacement report must contain rigid pair ${pair.pairKey}.`);
  const caesarCompatibility = compatibility(ciiI, ciiJ, r);
  const lfeaCompatibility = compatibility(lfeaI, lfeaJ, r);
  return Object.freeze({
    ...pair,
    vectorIToJ: Object.freeze(r),
    caesar: caesarCompatibility,
    lfea: lfeaCompatibility,
    classification: compatibilityClass(caesarCompatibility, lfeaCompatibility),
  });
});

const directRigidRows = attribution.matchedFailures.filter((row) => (
  row.caseLabel === 'OPE' && row.primaryCategory === RIGID_DIRECT_CATEGORY
));
const chainRows = sourceAudit.auditedPreviouslyUnexplainedOpeRows.filter((row) => (
  row.sourceCandidate === RIGID_CHAIN_CATEGORY
));
assert.equal(directRigidRows.length, 226, 'BM4 exact-head direct rigid failure inventory drifted.');
assert.equal(chainRows.length, 139, 'BM4 exact-head rigid-chain source candidate inventory drifted.');

const rigidRowsByKey = new Map();
for (const row of [...directRigidRows, ...chainRows]) rigidRowsByKey.set(rowKey(row), row);
const rigidRows = [...rigidRowsByKey.values()];
assert.equal(rigidRows.length, 365, 'BM4 rigid/result-semantics evidence inventory must remain 365 unique OPE rows.');

const componentResults = components.map((component) => {
  const nodeSet = new Set(component.nodes);
  const rows = rigidRows.filter((row) => touchedNodes(row).some((node) => nodeSet.has(node)));
  const localPairs = pairResults.filter((pair) => component.pairs.includes(pair.pairKey));
  return Object.freeze({
    ...component,
    failedRowsTouchingComponent: rows.length,
    familyCounts: Object.freeze(countBy(rows, (row) => row.family)),
    categoryCounts: Object.freeze(countBy(rows, (row) => row.sourceCandidate ?? row.primaryCategory)),
    compatibilityCounts: Object.freeze(countBy(localPairs, (pair) => pair.classification)),
    worstRows: Object.freeze([...rows].sort((a, b) => (
      (b.normalizedSeverity ?? 0) - (a.normalizedSeverity ?? 0)
      || lexical(rowKey(a), rowKey(b))
    )).slice(0, 8).map((row) => Object.freeze({
      category: row.sourceCandidate ?? row.primaryCategory,
      family: row.family,
      identifier: row.identifier,
      end: row.end,
      field: row.field,
      ours: row.ours,
      cii: row.cii,
      percentDifference: row.percentDifference,
      normalizedSeverity: row.normalizedSeverity,
    }))),
  });
}).sort((a, b) => (
  b.failedRowsTouchingComponent - a.failedRowsTouchingComponent
  || lexical(a.componentId, b.componentId)
));

const classificationCounts = countBy(pairResults, (pair) => pair.classification);
const report = Object.freeze({
  schema: 'm037-bm4-rigid-result-semantics/v1',
  mechanicsChanged: false,
  scope: Object.freeze({
    caseLabel: 'OPE',
    retainedRigidPairs: pairs.length,
    retainedRigidComponents: components.length,
    directRigidFailureRows: directRigidRows.length,
    rigidChainCandidateRows: chainRows.length,
    totalRigidResultBoundaryRows: rigidRows.length,
  }),
  method: Object.freeze({
    statement: 'Compare CAESAR and LFEA source-endpoint rigid-body compatibility without fitting stiffness or remapping benchmark rows.',
    transverseCheck: 'delta_u_transverse versus theta_average cross r; axial residual excluded because BM4 rigid authority retains finite thermal strain.',
    rotationCheck: 'theta_J minus theta_I.',
    translationTolerance: BM4_COMPARISON_POLICY.absoluteTolerance.translation,
    rotationTolerance: BM4_COMPARISON_POLICY.absoluteTolerance.rotation,
    policy: 'DO_NOT_CHANGE_RIGID_STIFFNESS_FROM_BENCHMARK_ERROR. DISTINGUISH PHYSICAL KINEMATICS FROM RESULT/STATION SEMANTICS FIRST.',
  }),
  classificationCounts: Object.freeze(classificationCounts),
  pairResults: Object.freeze(pairResults),
  componentResults: Object.freeze(componentResults),
});

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  scope: report.scope,
  classificationCounts,
  topComponents: componentResults.slice(0, 5).map((row) => ({
    componentId: row.componentId,
    failedRowsTouchingComponent: row.failedRowsTouchingComponent,
    compatibilityCounts: row.compatibilityCounts,
  })),
}, null, 2));
console.log(`M037 rigid result-semantics audit PASS; evidence written to ${OUTPUT_PATH}`);
