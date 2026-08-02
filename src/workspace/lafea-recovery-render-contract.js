/**
 * Exact NB-T4B recovery-to-render contracts.
 *
 * This module validates identities, requests and retained package structure.
 * It does not invoke a calculator, recover new engineering quantities, smooth
 * across elements, assess code or qualify release.
 */
import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import {
  LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA,
  LAFEA_ANALYSIS_MESH_PRODUCER_REVISION,
  createLafeaAnalysisMeshEvidence,
} from './lafea-analysis-mesh-evidence.js';
import { sealRenderPacketV2 } from './lafea-canvas/render-packet-v2-contract.js';

export const LAFEA_RECOVERY_RENDER_INTAKE_SCHEMA =
  'lafea-recovery-render-intake/v1';
export const LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA =
  'lafea-recovery-render-field-request/v1';
export const LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA =
  'lafea-recovery-render-location/v1';
export const LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA =
  'lafea-recovery-render-display-field/v1';
export const LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA =
  'lafea-recovery-render-package/v1';
export const LAFEA_RECOVERY_RENDER_PRODUCER_REVISION = 'NB-T4B.1';
export const LAFEA_RECOVERY_RENDER_FEA_STAGES = Object.freeze([
  'LAFEA.3', 'LAFEA.4', 'LAFEA.5',
]);
export const LAFEA_RECOVERY_RENDER_QUANTITIES = Object.freeze([
  'SIGMA_X', 'SIGMA_Y', 'TAU_XY',
]);
export const LAFEA_RECOVERY_RENDER_LOCATION_KINDS = Object.freeze([
  'ELEMENT_CONSTANT', 'INTEGRATION_POINT', 'SHELL_SURFACE',
]);
export const LAFEA_RECOVERY_RENDER_SHELL_SURFACES = Object.freeze([
  'BOTTOM', 'MIDSURFACE', 'TOP',
]);
export const LAFEA_RECOVERY_RENDER_TESSELLATION_POLICY =
  'ELEMENT_LOCAL_CORNER_TESSELLATION_NO_CROSS_ELEMENT_VERTEX_SHARING/V1';

const FIELD_REQUEST_KEYS = Object.freeze([
  'schema', 'fieldId', 'loadCaseId', 'quantity', 'units', 'colorMapId',
  'location',
]);
const LOCATION_KEYS = Object.freeze([
  'schema', 'kind', 'integrationPointIndex', 'surface',
]);
const DISPLAY_FIELD_KEYS = Object.freeze([
  'schema', 'fieldId', 'loadCaseId', 'quantity', 'units', 'kind',
  'valueRole', 'location', 'values',
]);
const DISPLAY_VALUE_KEYS = Object.freeze([
  'elementId', 'value', 'sourcePath', 'authorityLayer',
]);
const PACKAGE_KEYS = Object.freeze([
  'schema', 'producerRevision', 'stageId', 'profileId', 'sceneRevision',
  'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
  'analysisMeshHash', 'executionHash', 'recoveryHash',
  'displayGeometryHash', 'renderProfileHash', 'executionRecord',
  'recoveryRecord', 'executionRegistrationId', 'recoveryRegistrationId',
  'displayField', 'renderPacket', 'calculationState',
  'resultReadyWhenRegistered', 'releaseState', 'convergenceProduced',
  'codeAssessmentProduced', 'reportProduced', 'releaseQualified', 'packageHash',
]);

export function requireLafeaRecoveryRenderFieldRequest(value) {
  const row = requireExactRecord(value, FIELD_REQUEST_KEYS,
    'recovery render field request');
  if (row.schema !== LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_FIELD_REQUEST_SCHEMA_INVALID');
  }
  if (!LAFEA_RECOVERY_RENDER_QUANTITIES.includes(row.quantity)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_QUANTITY_UNSUPPORTED');
  }
  requireText(row.fieldId, 'fieldRequest.fieldId');
  requireText(row.loadCaseId, 'fieldRequest.loadCaseId');
  requireText(row.units, 'fieldRequest.units');
  requireText(row.colorMapId, 'fieldRequest.colorMapId');
  const location = requireLafeaRecoveryRenderLocation(row.location);
  return deepFreeze({ ...row, location });
}

export function requireLafeaRecoveryRenderLocation(value) {
  const row = requireExactRecord(value, LOCATION_KEYS,
    'recovery render location');
  if (row.schema !== LAFEA_RECOVERY_RENDER_LOCATION_SCHEMA
    || !LAFEA_RECOVERY_RENDER_LOCATION_KINDS.includes(row.kind)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_LOCATION_INVALID');
  }
  if (row.kind === 'ELEMENT_CONSTANT') {
    if (row.integrationPointIndex !== null || row.surface !== null) {
      throw recoveryRenderError('LAFEA_RECOVERY_RENDER_ELEMENT_LOCATION_INVALID');
    }
  } else if (row.kind === 'INTEGRATION_POINT') {
    requireNonNegativeInteger(row.integrationPointIndex,
      'location.integrationPointIndex');
    if (row.surface !== null) {
      throw recoveryRenderError('LAFEA_RECOVERY_RENDER_CONTINUUM_LOCATION_INVALID');
    }
  } else {
    requireNonNegativeInteger(row.integrationPointIndex,
      'location.integrationPointIndex');
    if (!LAFEA_RECOVERY_RENDER_SHELL_SURFACES.includes(row.surface)) {
      throw recoveryRenderError('LAFEA_RECOVERY_RENDER_SHELL_SURFACE_INVALID');
    }
  }
  return deepFreeze({ ...row });
}

export function lafeaRecoveryRenderDisplayGeometryHash(stageId, meshEvidenceValue) {
  const evidence = rebuildAnalysisMeshEvidence(meshEvidenceValue);
  if (evidence.stageId !== stageId) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_MESH_STAGE_MISMATCH');
  }
  return canonicalLafeaSha256({
    schema: 'lafea-recovery-render-display-geometry-hash-input/v1',
    stageId,
    analysisMeshArtifactHash: evidence.artifactHash,
    analysisMeshContentHash: evidence.meshHash,
    tessellationPolicy: LAFEA_RECOVERY_RENDER_TESSELLATION_POLICY,
  });
}

export function lafeaRecoveryRenderProfileHash(fieldRequestValue) {
  const fieldRequest = requireLafeaRecoveryRenderFieldRequest(fieldRequestValue);
  return canonicalLafeaSha256({
    schema: 'lafea-recovery-render-profile-hash-input/v1',
    producerRevision: LAFEA_RECOVERY_RENDER_PRODUCER_REVISION,
    fieldRequest,
  });
}

export function requireLafeaRecoveryRenderDisplayField(value) {
  const row = requireExactRecord(value, DISPLAY_FIELD_KEYS,
    'recovery render display field');
  if (row.schema !== LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_SCHEMA
    || row.valueRole !== 'PRODUCER_PROJECTED_DISPLAY_ONLY') {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_DISPLAY_FIELD_INVALID');
  }
  requireText(row.fieldId, 'displayField.fieldId');
  requireText(row.loadCaseId, 'displayField.loadCaseId');
  requireText(row.units, 'displayField.units');
  if (!LAFEA_RECOVERY_RENDER_QUANTITIES.includes(row.quantity)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_QUANTITY_UNSUPPORTED');
  }
  requireText(row.kind, 'displayField.kind');
  const location = requireLafeaRecoveryRenderLocation(row.location);
  if (!Array.isArray(row.values) || !row.values.length) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_DISPLAY_VALUES_REQUIRED');
  }
  const values = row.values.map((item, index) => {
    const valueRow = requireExactRecord(item, DISPLAY_VALUE_KEYS,
      `display field value[${index}]`);
    requireText(valueRow.elementId, `displayField.values[${index}].elementId`);
    requireFinite(valueRow.value, `displayField.values[${index}].value`);
    requireText(valueRow.sourcePath, `displayField.values[${index}].sourcePath`);
    requireText(valueRow.authorityLayer,
      `displayField.values[${index}].authorityLayer`);
    return Object.freeze({ ...valueRow });
  });
  requireUnique(values.map((item) => item.elementId),
    'LAFEA_RECOVERY_RENDER_DISPLAY_ELEMENT_DUPLICATE');
  return deepFreeze({ ...row, location, values });
}

export function lafeaRecoveryRenderPackageHash(value) {
  const packet = value.renderPacket;
  return canonicalLafeaSha256({
    schema: 'lafea-recovery-render-package-hash-input/v1',
    producerRevision: value.producerRevision,
    stageId: value.stageId,
    profileId: value.profileId,
    sceneRevision: value.sceneRevision,
    sourceHash: value.sourceHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    analysisMeshHash: value.analysisMeshHash,
    executionHash: value.executionHash,
    recoveryHash: value.recoveryHash,
    displayGeometryHash: value.displayGeometryHash,
    renderProfileHash: value.renderProfileHash,
    executionRecord: value.executionRecord,
    recoveryRecord: value.recoveryRecord,
    executionRegistrationId: value.executionRegistrationId,
    recoveryRegistrationId: value.recoveryRegistrationId,
    displayField: value.displayField,
    renderPacket: packet ? {
      ...packet,
      positions: [...packet.positions],
      drawTriangleIndices: [...packet.drawTriangleIndices],
      drawTriangleElementIndices: [...packet.drawTriangleElementIndices],
      fieldValues: [...packet.fieldValues],
      qualityFlags: [...packet.qualityFlags],
    } : null,
    calculationState: value.calculationState,
    resultReadyWhenRegistered: value.resultReadyWhenRegistered,
    releaseState: value.releaseState,
    convergenceProduced: value.convergenceProduced,
    codeAssessmentProduced: value.codeAssessmentProduced,
    reportProduced: value.reportProduced,
    releaseQualified: value.releaseQualified,
  });
}

export function requireLafeaRecoveryRenderPackage(value) {
  const row = requireExactRecord(value, PACKAGE_KEYS,
    'recovery render package');
  if (row.schema !== LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA
    || row.producerRevision !== LAFEA_RECOVERY_RENDER_PRODUCER_REVISION) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_PACKAGE_SCHEMA_INVALID');
  }
  if (!LAFEA_RECOVERY_RENDER_FEA_STAGES.includes(row.stageId)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_STAGE_NOT_FEA');
  }
  requireText(row.profileId, 'package.profileId');
  requireNonNegativeInteger(row.sceneRevision, 'package.sceneRevision');
  for (const key of [
    'sourceHash', 'canonicalModelHash', 'analysisGeometryHash',
    'analysisMeshHash', 'executionHash', 'recoveryHash',
    'displayGeometryHash', 'renderProfileHash',
  ]) requireSha256(row[key], `package.${key}`);
  requireText(row.executionRegistrationId, 'package.executionRegistrationId');
  requireText(row.recoveryRegistrationId, 'package.recoveryRegistrationId');
  const displayField = requireLafeaRecoveryRenderDisplayField(row.displayField);
  const renderPacket = sealRenderPacketV2(row.renderPacket);
  requireSha256(row.packageHash, 'package.packageHash');
  if (row.calculationState !== 'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT'
    || row.resultReadyWhenRegistered !== true
    || row.releaseState !== 'RELEASE_NOT_QUALIFIED'
    || row.convergenceProduced !== false
    || row.codeAssessmentProduced !== false
    || row.reportProduced !== false
    || row.releaseQualified !== false) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_PACKAGE_AUTHORITY_INVALID');
  }
  const canonical = { ...row, displayField, renderPacket };
  if (lafeaRecoveryRenderPackageHash(canonical) !== row.packageHash) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_PACKAGE_TAMPERED');
  }
  return deepFreeze(canonical);
}

export function rebuildAnalysisMeshEvidence(value) {
  if (!value || value.schema !== LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA
    || value.producerRevision !== LAFEA_ANALYSIS_MESH_PRODUCER_REVISION) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_ANALYSIS_MESH_EVIDENCE_INVALID');
  }
  const rebuilt = createLafeaAnalysisMeshEvidence({
    schema: value.schema === LAFEA_ANALYSIS_MESH_EVIDENCE_SCHEMA
      ? 'lafea-analysis-mesh-intake/v1'
      : null,
    stageId: value.stageId,
    sourceHash: value.sourceHash,
    canonicalModelHash: value.canonicalModelHash,
    analysisGeometryHash: value.analysisGeometryHash,
    meshProfile: value.meshProfile,
    mesh: value.mesh,
    authority: value.authority,
  });
  if (JSON.stringify(rebuilt) !== JSON.stringify(value)
    || rebuilt.status !== 'CURRENT' || rebuilt.qualification !== 'PASS') {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_ANALYSIS_MESH_EVIDENCE_INVALID');
  }
  return rebuilt;
}

export function requireRecoveryRenderExactRecord(value, keys, label) {
  return requireExactRecord(value, keys, label);
}

export function requireRecoveryRenderSha256(value, label) {
  return requireSha256(value, label);
}

export function recoveryRenderError(code, evidence = {}) {
  const error = new TypeError(code);
  error.code = code;
  error.evidence = evidence;
  return error;
}

function requireExactRecord(value, expectedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_RECORD_INVALID', { label });
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_EXACT_KEYS_INVALID', {
      label, actual, expected,
    });
  }
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_HASH_INVALID', { label });
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_TEXT_REQUIRED', { label });
  }
  return value;
}

function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_FINITE_VALUE_REQUIRED', {
      label,
    });
  }
  return Object.is(value, -0) ? 0 : value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw recoveryRenderError('LAFEA_RECOVERY_RENDER_INTEGER_REQUIRED', { label });
  }
  return value;
}

function requireUnique(values, code) {
  if (new Set(values).size !== values.length) throw recoveryRenderError(code);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)
    || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
