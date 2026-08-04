#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  STAGEDJSON_PROCESS_AUTHORITY_SCHEMA,
  requireStagedJsonProcessAuthority,
  sealStagedJsonProcessAuthority,
} from '../src/workspace/analysis-authority-overlay/stagedjson-process-authority.js';
import {
  STAGEDJSON_SUPPORT_AUTHORITY_SCHEMA,
  requireStagedJsonSupportAuthority,
  sealStagedJsonSupportAuthority,
} from '../src/workspace/analysis-authority-overlay/stagedjson-support-authority.js';
import {
  STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA,
  requireStagedJsonResolvedAnalysis,
  sealStagedJsonResolvedAnalysis,
} from '../src/workspace/analysis-authority-overlay/stagedjson-resolved-analysis.js';
import {
  STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  STAGEDJSON_RESOLUTION_STATUS,
} from '../src/workspace/analysis-authority-overlay/stagedjson-resolution-common.js';

const HASH = 'fnv1a64:0000000000000001';
const dataset = makeDataset();
const datasetRef = {
  datasetId: dataset.datasetId,
  sourceId: dataset.sourceName,
  sourceSha256: dataset.sourceSha256,
  sourceSnapshotSemanticHash: dataset.sourceSnapshot.sourceSemanticHash,
};
const process = sealStagedJsonProcessAuthority({
  schema: STAGEDJSON_PROCESS_AUTHORITY_SCHEMA,
  processAuthorityId: 'PROC:E1',
  datasetRef,
  scope: { branchId: '/B1', entityId: 'E1' },
  inheritancePolicy: STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  temperatureRoles: {
    REFERENCE: 'referenceTemperature',
    OPERATING: 'operatingTemperature',
    DESIGN: 'designTemperature',
  },
  fields: {
    designPressure: declared(11.6, 'MPa', 'E1', 'designPressureMpa'),
    operatingAnalysisPressure: missing('MPa', 'STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_POLICY_MISSING'),
    hydrotestPressure: declared(22.035, 'UNDECLARED', 'E1', 'hydroPressure'),
    referenceTemperature: missing('K', 'STAGEDJSON_REFERENCE_TEMPERATURE_MISSING'),
    operatingTemperature: declared(309, 'degC', 'E1', 'operatingTemperatureC'),
    designTemperature: declared(325, 'degC', 'E1', 'designTemperatureC'),
    operatingFluidDensity: declared(300, 'kg/m3', 'E1', 'fluidDensityOpeKgM3'),
    hydrotestFluidDensity: declared(1000, 'kg/m3', 'E1', 'fluidDensityHydKgM3'),
    insulationThickness: declared(100, 'mm', 'E1', 'insulationThicknessMm'),
    insulationDensity: declared(250, 'kg/m3', 'E1', 'insulationDensityKgM3'),
    materialDensity: declared(7850, 'kg/m3', 'E1', 'materialDensityKgM3'),
    corrosionAllowance: declared(3, 'mm', 'E1', 'corrosionAllowanceMm'),
    fluidPhase: declared('TWO_PHASE', 'NONE', 'E1', 'fluidPhase'),
    fluidService: missing('NONE', 'STAGEDJSON_FLUID_SERVICE_MISSING'),
  },
  diagnostics: [],
}, { dataset });
assert.deepEqual(requireStagedJsonProcessAuthority(process, { dataset }), process);
assert.equal(Object.isFrozen(process), true);
assert.equal(process.fields.referenceTemperature.status, STAGEDJSON_RESOLUTION_STATUS.MISSING);
assert.throws(
  () => sealStagedJsonProcessAuthority({
    ...unseal(process),
    fields: { ...unseal(process).fields, designPressure: inherited(11.6, 'MPa', 'E1', 'designPressureMpa', 'E0') },
  }, { dataset }),
  (error) => error.code === 'STAGEDJSON_RESOLUTION_INHERITANCE_PROHIBITED',
);
assert.throws(
  () => requireStagedJsonProcessAuthority({ ...process, semanticHash: HASH }, { dataset }),
  (error) => error.code === 'STAGEDJSON_PROCESS_AUTHORITY_SEMANTIC_HASH_MISMATCH',
);

const support = sealStagedJsonSupportAuthority({
  schema: STAGEDJSON_SUPPORT_AUTHORITY_SCHEMA,
  supportAuthorityId: 'SUP:PS-1',
  datasetRef,
  scope: { branchId: '/B1' },
  sourceEntityIds: ['S1'],
  fields: {
    assembly: declared({ assemblyKey: 'PS-1', sourceCount: 1 }, 'NONE', 'S1', 'SUPPORT_TYPE'),
    attachment: missing('mm', 'STAGEDJSON_SUPPORT_ATTACHMENT_UNRESOLVED'),
    restraintModel: missing('NONE', 'STAGEDJSON_SUPPORT_RESTRAINT_UNRESOLVED'),
    linearizationPolicy: missing('NONE', 'STAGEDJSON_SUPPORT_LINEARIZATION_UNDECLARED'),
  },
  diagnostics: [],
}, { dataset });
assert.deepEqual(requireStagedJsonSupportAuthority(support, { dataset }), support);

const resolved = sealStagedJsonResolvedAnalysis({
  schema: STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA,
  analysisId: 'ANALYSIS:B1:R1',
  datasetRef,
  branchSubsetRef: {
    schema: 'workspace-branch-subset/v1',
    branchId: '/B1',
    semanticHash: HASH,
    entityIds: ['BRANCH', 'E1', 'S1'],
    supportEntityIds: ['S1'],
  },
  overlayRef: {
    schema: 'analysis-authority-overlay/v1',
    overlayId: 'OVERLAY:B1:R1',
    semanticHash: HASH,
    evidenceHash: HASH,
  },
  processInheritancePolicy: STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  authorityRefs: {
    materials: [{ authorityId: 'MAT:COLD:E1', schema: 'fea-linear-material-resolution/v1', semanticHash: HASH, evidenceHash: HASH }],
    sections: [{ authorityId: 'SEC:E1', schema: 'fea-linear-pipe-section-resolution/v1', semanticHash: HASH, evidenceHash: HASH }],
    process: [{ authorityId: process.processAuthorityId, schema: process.schema, semanticHash: process.semanticHash, evidenceHash: process.evidenceHash }],
    supports: [{ authorityId: support.supportAuthorityId, schema: support.schema, semanticHash: support.semanticHash, evidenceHash: support.evidenceHash }],
    loadCases: [],
  },
  assignments: [
    assignment('A:MAT:COLD', 'E1', 'MATERIAL', 'REFERENCE', 'DECLARED', 'MAT:COLD:E1', []),
    assignment('A:MAT:HOT', 'E1', 'MATERIAL', 'OPERATING', 'MISSING', null, ['STAGEDJSON_OPERATING_MATERIAL_STATE_MISSING']),
    assignment('A:SECTION', 'E1', 'SECTION', 'PIPE_SECTION', 'DECLARED', 'SEC:E1', []),
    assignment('A:PROCESS', 'E1', 'PROCESS', 'EFFECTIVE_PROCESS', 'DECLARED', process.processAuthorityId, []),
    assignment('A:SUPPORT', 'S1', 'SUPPORT', 'RESTRAINT', 'DECLARED', support.supportAuthorityId, []),
  ],
  temperatureStateRequirements: [
    temperatureRequirement('T:REF', 'E1', 'REFERENCE', 'referenceTemperature', 'MISSING', null, 'MISSING', null, ['STAGEDJSON_REFERENCE_TEMPERATURE_MISSING']),
    temperatureRequirement('T:OPE', 'E1', 'OPERATING', 'operatingTemperature', 'DECLARED', 582.15, 'MISSING', null, ['STAGEDJSON_OPERATING_MATERIAL_STATE_MISSING']),
    temperatureRequirement('T:DES', 'E1', 'DESIGN', 'designTemperature', 'DECLARED', 598.15, 'MISSING', null, ['STAGEDJSON_DESIGN_MATERIAL_STATE_MISSING']),
  ],
  conflicts: [{ code: 'STAGEDJSON_SOURCE_CONFLICT', entityId: 'E1' }],
  limitations: [{ code: 'STAGEDJSON_SELECTED_BRANCH_ONLY' }],
  diagnostics: [],
}, { dataset });
assert.deepEqual(requireStagedJsonResolvedAnalysis(resolved, { dataset }), resolved);
assert.throws(
  () => requireStagedJsonResolvedAnalysis({ ...resolved, evidenceHash: HASH }, { dataset }),
  (error) => error.code === 'STAGEDJSON_RESOLVED_ANALYSIS_EVIDENCE_HASH_MISMATCH',
);

console.log(JSON.stringify({
  check: 'm022a-stagedjson-resolution-contracts',
  status: 'PASS',
  processSemanticHash: process.semanticHash,
  supportSemanticHash: support.semanticHash,
  resolvedAnalysisSemanticHash: resolved.semanticHash,
}, null, 2));

function makeDataset() {
  return {
    schema: 'analysis-workspace-dataset/v1',
    datasetId: 'dataset:m022a-synthetic',
    sourceName: 'synthetic.json',
    sourceSha256: 'a'.repeat(64),
    sourceSnapshot: { sourceSemanticHash: HASH },
    entities: [
      { entityId: 'BRANCH', entityType: 'BRANCH', category: 'component', branchId: '/B1' },
      { entityId: 'E1', entityType: 'PIPE', category: 'pipe', branchId: '/B1' },
      { entityId: 'S1', entityType: 'SUPPORT', category: 'support', branchId: '/B1' },
    ],
  };
}
function declared(value, unit, sourceEntityId, sourceField) { return { status: 'DECLARED', value, unit, sourceEntityId, sourceField, fromEntityId: null, diagnosticCodes: [], evidence: [{ source: 'SYNTHETIC', locator: `${sourceEntityId}.${sourceField}`, sourceSemanticHash: HASH }] }; }
function inherited(value, unit, sourceEntityId, sourceField, fromEntityId) { return { status: 'INHERITED', value, unit, sourceEntityId, sourceField, fromEntityId, diagnosticCodes: [], evidence: [{ source: 'SYNTHETIC', locator: `${fromEntityId}.${sourceField}`, sourceSemanticHash: HASH }] }; }
function missing(unit, code) { return { status: 'MISSING', value: null, unit, sourceEntityId: null, sourceField: null, fromEntityId: null, diagnosticCodes: [code], evidence: [] }; }
function assignment(assignmentId, entityId, domain, role, status, authorityId, diagnosticCodes) { return { assignmentId, entityId, domain, role, status, authorityId, diagnosticCodes }; }
function temperatureRequirement(requirementId, entityId, role, processField, processStatus, requestedTemperatureK, materialStateStatus, materialStateId, diagnosticCodes) { return { requirementId, entityId, role, processField, processStatus, requestedTemperatureK, materialStateStatus, materialStateId, diagnosticCodes }; }
function unseal(value) { const result = JSON.parse(JSON.stringify(value)); delete result.semanticHash; delete result.evidenceHash; return result; }
