import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  requireInputXmlModelHealthSource,
} from '../geometry/model-health/index.js';
import { requireInputXmlLinearModelHealth } from './inputxml-linear-model-health-contract.js';

export const INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA =
  'fea-inputxml-linear-solve-preparation/v1';

export function sealInputXmlLinearSolvePreparation(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(semanticProjection(draft));
  const evidence = semanticHash(evidenceProjection(draft, semantic));
  return deepFreeze({ ...draft, semanticHash: semantic, evidenceHash: evidence });
}

export function requireInputXmlLinearSolvePreparation(
  value,
  expectedSourceBundle = null,
  expectedModelHealthReport = null,
) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA) {
    throw new TypeError('InputXML linear solve preparation schema is invalid.');
  }
  requireDraft(value);
  const expectedSemantic = semanticHash(semanticProjection(value));
  if (value.semanticHash !== expectedSemantic) {
    throw new TypeError('InputXML linear solve preparation semantic hash mismatch.');
  }
  const expectedEvidence = semanticHash(evidenceProjection(value, expectedSemantic));
  if (value.evidenceHash !== expectedEvidence) {
    throw new TypeError('InputXML linear solve preparation evidence hash mismatch.');
  }
  if (expectedSourceBundle !== null) {
    const source = requireInputXmlModelHealthSource(expectedSourceBundle);
    if (value.sourceBundleSemanticHash !== computeInputXmlModelHealthSourceSemanticHash(source)
      || value.sourceBundleEvidenceHash !== computeInputXmlModelHealthSourceEvidenceHash(source)) {
      throw new TypeError('InputXML linear solve preparation is stale for the supplied source bundle.');
    }
  }
  if (expectedModelHealthReport !== null) {
    const report = requireInputXmlLinearModelHealth(
      expectedModelHealthReport,
      expectedSourceBundle,
    );
    if (value.modelHealthSemanticHash !== report.semanticHash
      || value.modelHealthEvidenceHash !== report.evidenceHash) {
      throw new TypeError('InputXML linear solve preparation is stale for the supplied model-health report.');
    }
  }
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value)) {
    throw new TypeError('InputXML linear solve preparation draft must be a record.');
  }
  if (value.schema !== INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA) {
    throw new TypeError('InputXML linear solve preparation draft schema is invalid.');
  }
  for (const key of [
    'sourceBundleSemanticHash',
    'sourceBundleEvidenceHash',
    'modelHealthSemanticHash',
    'modelHealthEvidenceHash',
    'unitNormalizationSemanticHash',
    'unitNormalizationEvidenceHash',
  ]) {
    if (typeof value[key] !== 'string') {
      throw new TypeError(`InputXML linear solve preparation ${key} is invalid.`);
    }
  }
  if (typeof value.preparationId !== 'string'
    || typeof value.modelId !== 'string'
    || typeof value.analysisProfileId !== 'string'
    || typeof value.modelCapabilityId !== 'string'
    || !['PASS', 'CONDITIONAL'].includes(value.modelCapabilityStatus)
    || !isPlainRecord(value.normalizedGeometry)
    || value.normalizedGeometry.unit !== 'm'
    || !Array.isArray(value.materialResolutions)
    || !Array.isArray(value.sectionResolutions)
    || !Array.isArray(value.rigidAuthorities)
    || !Array.isArray(value.segmentBindings)
    || !Array.isArray(value.loadBindings)
    || !isPlainRecord(value.caseAvailability)
    || !Array.isArray(value.limitations)
    || !isPlainRecord(value.summary)
    || !isPlainRecord(value.executionBoundary)) {
    throw new TypeError('InputXML linear solve preparation collections are invalid.');
  }
  requireExecutionBoundary(value.executionBoundary);
  requireUnique(value.segmentBindings, 'bindingId', 'segment binding');
  requireUnique(value.loadBindings, 'loadBindingId', 'load binding');
  const segmentIds = new Set(value.segmentBindings.map((row) => row.segmentId));
  if (segmentIds.size !== value.normalizedGeometry.segments.length
    || value.loadBindings.length !== value.segmentBindings.length
    || value.loadBindings.some((row) => !segmentIds.has(row.segmentId))) {
    throw new TypeError('InputXML linear solve preparation segment/load binding coverage is incomplete.');
  }
  for (const row of value.segmentBindings) {
    if (!isPlainRecord(row)
      || typeof row.bindingId !== 'string'
      || typeof row.segmentId !== 'string'
      || typeof row.sourceFeatureId !== 'string'
      || !Number.isInteger(row.sourceIndex)
      || row.sourceIndex < 0
      || typeof row.materialResolutionSemanticHash !== 'string'
      || typeof row.materialResolutionEvidenceHash !== 'string'
      || typeof row.physicalSectionSemanticHash !== 'string'
      || typeof row.analysisSectionSemanticHash !== 'string'
      || typeof row.thermalAuthoritySemanticHash !== 'string'
      || !['RESOLVED', 'UNRESOLVED'].includes(row.thermalAuthorityStatus)) {
      throw new TypeError('InputXML linear solve preparation segment binding is malformed.');
    }
  }
  for (const row of value.loadBindings) {
    if (!isPlainRecord(row)
      || typeof row.loadBindingId !== 'string'
      || typeof row.segmentId !== 'string'
      || typeof row.sourceFeatureId !== 'string'
      || !isPlainRecord(row.gravity)
      || !isPlainRecord(row.pressure)
      || !isPlainRecord(row.thermal)
      || typeof row.gravity.semanticHash !== 'string'
      || typeof row.pressure.semanticHash !== 'string'
      || typeof row.thermal.semanticHash !== 'string') {
      throw new TypeError('InputXML linear solve preparation load binding is malformed.');
    }
  }
  for (const key of ['sustained', 'operating']) {
    const row = value.caseAvailability[key];
    if (!isPlainRecord(row)
      || !['PREPARED_AUTHORITY_ONLY', 'UNAVAILABLE'].includes(row.status)
      || typeof row.loadCaseCompilationAvailable !== 'boolean'
      || row.loadCaseCompilationAvailable !== false
      || !Array.isArray(row.reasonCodes)) {
      throw new TypeError(`InputXML linear solve preparation ${key} case availability is invalid.`);
    }
  }
}

function requireExecutionBoundary(value) {
  const falseKeys = [
    'constraintsCompiled',
    'mechanicalModelCompiled',
    'loadPrimitivesCompiled',
    'stiffnessAssembled',
    'factorizationCreated',
    'solveAuthorized',
  ];
  for (const key of falseKeys) {
    if (value[key] !== false) {
      throw new TypeError(`InputXML linear solve preparation execution boundary ${key} must be false.`);
    }
  }
  if (!Array.isArray(value.reasonCodes)
    || value.reasonCodes.length === 0
    || value.reasonCodes.some((row) => typeof row !== 'string')) {
    throw new TypeError('InputXML linear solve preparation execution boundary reasons are invalid.');
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    preparationId: value.preparationId,
    modelId: value.modelId,
    analysisProfileId: value.analysisProfileId,
    modelCapabilityId: value.modelCapabilityId,
    modelCapabilityStatus: value.modelCapabilityStatus,
    sourceBundleSemanticHash: value.sourceBundleSemanticHash,
    modelHealthSemanticHash: value.modelHealthSemanticHash,
    unitNormalizationSemanticHash: value.unitNormalizationSemanticHash,
    normalizedGeometry: geometryProjection(value.normalizedGeometry),
    materialResolutions: value.materialResolutions,
    sectionResolutions: value.sectionResolutions,
    rigidAuthorities: value.rigidAuthorities,
    segmentBindings: value.segmentBindings,
    loadBindings: value.loadBindings,
    caseAvailability: value.caseAvailability,
    limitations: value.limitations,
    summary: value.summary,
    executionBoundary: value.executionBoundary,
  };
}

function evidenceProjection(value, semantic) {
  return {
    ...semanticProjection(value),
    semanticHash: semantic,
    sourceBundleEvidenceHash: value.sourceBundleEvidenceHash,
    modelHealthEvidenceHash: value.modelHealthEvidenceHash,
    unitNormalizationEvidenceHash: value.unitNormalizationEvidenceHash,
  };
}

function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, valid: _valid, ...rest } = geometry;
  return rest;
}

function requireUnique(rows, key, label) {
  const values = rows.map((row) => row?.[key]);
  if (values.some((value) => typeof value !== 'string')
    || new Set(values).size !== values.length) {
    throw new TypeError(`InputXML linear solve preparation ${label} identities are invalid.`);
  }
}
