#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPORT_DIR = fileURLToPath(new URL('../reports', import.meta.url));
const SOURCE_AUDIT_PATH = `${REPORT_DIR}/m037-bm4-source-level-ope-audit.json`;
const RIGID_AUDIT_PATH = `${REPORT_DIR}/m037-bm4-rigid-result-semantics.json`;
const OUTPUT_PATH = `${REPORT_DIR}/m037-bm4-rigid-response-coherence.json`;
const RIGID_CHAIN_CATEGORY = 'RIGID_CHAIN_SOURCE_OR_RESULT_SEMANTICS_CANDIDATE';
const ROTATION_FIELDS = new Set(['RX', 'RY', 'RZ']);
const RATIO_SPREAD_LIMIT = 0.005;
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function groupKey(componentId, field) {
  return `${componentId}|${field}`;
}

function zeroSafeRatio(row) {
  if (!Number.isFinite(row.ours) || !Number.isFinite(row.cii) || Math.abs(row.cii) <= Number.EPSILON) return null;
  return row.ours / row.cii;
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

const sourceAudit = JSON.parse(readFileSync(SOURCE_AUDIT_PATH, 'utf8'));
const rigidAudit = JSON.parse(readFileSync(RIGID_AUDIT_PATH, 'utf8'));
const chainRows = sourceAudit.auditedPreviouslyUnexplainedOpeRows.filter((row) => (
  row.sourceCandidate === RIGID_CHAIN_CATEGORY
));
const componentByNode = new Map();
for (const component of rigidAudit.componentResults) {
  for (const node of component.nodes) componentByNode.set(String(node), component);
}

const rotationalRows = chainRows.filter((row) => (
  row.family === 'displacement'
  && ROTATION_FIELDS.has(row.field)
  && componentByNode.has(String(row.identifier))
  && zeroSafeRatio(row) !== null
));

const grouped = new Map();
for (const row of rotationalRows) {
  const component = componentByNode.get(String(row.identifier));
  const key = groupKey(component.componentId, row.field);
  if (!grouped.has(key)) grouped.set(key, { component, field: row.field, rows: [] });
  grouped.get(key).rows.push(row);
}

const rotationGroups = [...grouped.values()].map(({ component, field, rows }) => {
  const ordered = [...rows].sort((a, b) => lexical(String(a.identifier), String(b.identifier)));
  const ratios = ordered.map(zeroSafeRatio);
  const ratioMin = Math.min(...ratios);
  const ratioMax = Math.max(...ratios);
  const ratioMean = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  const ratioSpread = ratioMax - ratioMin;
  const lfeaOnlyPairFailureCount = component.compatibilityCounts.LFEA_RIGID_KINEMATICS_REQUIRES_REVIEW ?? 0;
  const coherent = ordered.length >= 3
    && lfeaOnlyPairFailureCount === 0
    && ratioSpread <= RATIO_SPREAD_LIMIT;
  return Object.freeze({
    componentId: component.componentId,
    field,
    rowCount: ordered.length,
    nodeIds: Object.freeze(ordered.map((row) => String(row.identifier))),
    ratios: Object.freeze(ratios),
    ratioMean,
    ratioMin,
    ratioMax,
    ratioSpread,
    ratioSpreadLimit: RATIO_SPREAD_LIMIT,
    lfeaOnlyPairFailureCount,
    pairCompatibilityCounts: component.compatibilityCounts,
    classification: coherent
      ? 'COHERENT_CHAIN_ROTATION_AMPLITUDE_MISMATCH_NOT_RIGID_STATION_SHIFT'
      : 'RIGID_CHAIN_ROTATION_REMAINS_MIXED_OR_UNDERDETERMINED',
  });
}).sort((a, b) => lexical(`${a.componentId}|${a.field}`, `${b.componentId}|${b.field}`));

const coherentGroups = rotationGroups.filter((group) => (
  group.classification === 'COHERENT_CHAIN_ROTATION_AMPLITUDE_MISMATCH_NOT_RIGID_STATION_SHIFT'
));
const coherentKeys = new Set(coherentGroups.map((group) => groupKey(group.componentId, group.field)));
const coherentRows = rotationalRows.filter((row) => {
  const component = componentByNode.get(String(row.identifier));
  return coherentKeys.has(groupKey(component.componentId, row.field));
}).map((row) => Object.freeze({
  nodeId: String(row.identifier),
  field: row.field,
  ours: row.ours,
  cii: row.cii,
  ratio: zeroSafeRatio(row),
  percentDifference: row.percentDifference,
  componentId: componentByNode.get(String(row.identifier)).componentId,
  evidenceClass: 'GLOBAL_RESPONSE_OR_LOAD_AUTHORITY_CANDIDATE',
})).sort((a, b) => lexical(`${a.componentId}|${a.field}|${a.nodeId}`, `${b.componentId}|${b.field}|${b.nodeId}`));

assert.equal(rigidAudit.classificationCounts.LFEA_RIGID_KINEMATICS_REQUIRES_REVIEW ?? 0, 0,
  'No LFEA-only rigid endpoint kinematic failure is expected on the qualified BM4 exact head.');
assert.equal(coherentGroups.length, 6, 'BM4 exact-head coherent rigid-chain rotation group inventory drifted.');
assert.equal(coherentRows.length, 21, 'BM4 exact-head coherent rigid-chain rotation row inventory drifted.');

const report = Object.freeze({
  schema: 'm037-bm4-rigid-response-coherence/v1',
  mechanicsChanged: false,
  scope: Object.freeze({
    rigidChainCandidateRows: chainRows.length,
    directRigidNodeRotationRows: rotationalRows.length,
    coherentRotationGroups: coherentGroups.length,
    coherentRotationRows: coherentRows.length,
  }),
  method: Object.freeze({
    statement: 'Test whether same-field rotations across retained rigid chains differ from CAESAR by an almost constant amplitude ratio.',
    ratio: 'LFEA rotation / CAESAR rotation at the same source node.',
    minimumRowsPerGroup: 3,
    ratioSpreadLimit: RATIO_SPREAD_LIMIT,
    requiredLfeaOnlyRigidKinematicFailures: 0,
    interpretation: 'Rotation is invariant to translating the result reference point along a rigid body. A coherent same-field rotation ratio across a kinematically compatible chain therefore cannot be corrected by a rigid station shift; it points upstream to global response/load/source authority unless independent mechanics evidence says otherwise.',
    policy: 'DO_NOT_TUNE_RIGID_STIFFNESS_OR_REMAP_ROTATION_STATIONS_TO_FIT THESE ROWS.',
  }),
  classificationCounts: Object.freeze(countBy(rotationGroups, (group) => group.classification)),
  rotationGroups: Object.freeze(rotationGroups),
  coherentRows: Object.freeze(coherentRows),
});

writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  scope: report.scope,
  coherentGroups: coherentGroups.map((group) => ({
    componentId: group.componentId,
    field: group.field,
    rowCount: group.rowCount,
    ratioMean: group.ratioMean,
    ratioSpread: group.ratioSpread,
    pairCompatibilityCounts: group.pairCompatibilityCounts,
  })),
}, null, 2));
console.log(`M037 rigid response-coherence audit PASS; evidence written to ${OUTPUT_PATH}`);
