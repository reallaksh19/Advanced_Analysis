import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';

export const INPUTXML_LINEAR_STRUCTURAL_PREPARATION_SCHEMA =
  'fea-inputxml-linear-structural-preparation/v1';

export function sealInputXmlLinearStructuralPreparation(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(semanticProjection(draft));
  const evidence = semanticHash(evidenceProjection(draft, semantic));
  return deepFreeze({ ...draft, semanticHash: semantic, evidenceHash: evidence });
}

export function requireInputXmlLinearStructuralPreparation(value, expectedContext) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_STRUCTURAL_PREPARATION_SCHEMA) {
    throw new TypeError('InputXML linear structural preparation schema is invalid.');
  }
  requireDraft(value);
  const expectedSemantic = semanticHash(semanticProjection(value));
  if (value.semanticHash !== expectedSemantic) {
    throw new TypeError('InputXML linear structural preparation semantic hash mismatch.');
  }
  const expectedEvidence = semanticHash(evidenceProjection(value, expectedSemantic));
  if (value.evidenceHash !== expectedEvidence) {
    throw new TypeError('InputXML linear structural preparation evidence hash mismatch.');
  }
  if (expectedContext) requireCurrentContext(value, expectedContext);
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value)) throw new TypeError('InputXML linear structural preparation must be a record.');
  for (const key of [
    'preparationId', 'modelId', 'analysisProfileId', 'modelCapabilityId',
    'sourceBundleSemanticHash', 'sourceBundleEvidenceHash',
    'modelHealthSemanticHash', 'modelHealthEvidenceHash',
    'topologySemanticHash', 'topologyEvidenceHash',
    'unitNormalizationSemanticHash', 'unitNormalizationEvidenceHash',
  ]) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      throw new TypeError(`InputXML structural preparation ${key} is invalid.`);
    }
  }
  if (!['PASS', 'CONDITIONAL'].includes(value.profileCapabilityStatus)) {
    throw new TypeError('InputXML structural preparation capability status is invalid.');
  }
  for (const key of [
    'materialResolutions', 'sectionResolutions', 'rigidAuthorities',
    'materialBindings', 'sectionBindings', 'componentBindings',
    'constraintDeclarations', 'constraintBindings', 'limitations',
  ]) {
    if (!Array.isArray(value[key])) throw new TypeError(`InputXML structural preparation ${key} is invalid.`);
  }
  if (!isPlainRecord(value.normalizedGeometry) || !isPlainRecord(value.conditionedTopology)
    || !isPlainRecord(value.compilation) || !isPlainRecord(value.thermalAuthoritySummary)
    || !isPlainRecord(value.summary)) {
    throw new TypeError('InputXML structural preparation retained authorities are invalid.');
  }
  requireMechanicalModelCompilation(value.compilation);
  requireUniqueBindings(value.materialBindings, 'segmentId', 'material');
  requireUniqueBindings(value.sectionBindings, 'segmentId', 'section');
  requireUniqueBindings(value.componentBindings, 'segmentId', 'component');
}

function requireUniqueBindings(rows, key, label) {
  const values = rows.map((row) => row[key]);
  if (values.some((value) => typeof value !== 'string') || new Set(values).size !== values.length) {
    throw new TypeError(`InputXML structural preparation ${label} bindings are incomplete or duplicated.`);
  }
}

function requireCurrentContext(value, context) {
  if (value.sourceBundleSemanticHash !== context.sourceBundle?.semanticHash
    || value.sourceBundleEvidenceHash !== context.sourceBundle?.evidenceHash) {
    throw new TypeError('InputXML structural preparation is stale for the supplied source bundle.');
  }
  if (value.modelHealthSemanticHash !== context.report?.semanticHash
    || value.modelHealthEvidenceHash !== context.report?.evidenceHash) {
    throw new TypeError('InputXML structural preparation is stale for the supplied model-health report.');
  }
  if (value.topologySemanticHash !== context.topology?.semanticHash
    || value.topologyEvidenceHash !== context.topology?.evidenceHash) {
    throw new TypeError('InputXML structural preparation is stale for the supplied topology report.');
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    preparationId: value.preparationId,
    modelId: value.modelId,
    analysisProfileId: value.analysisProfileId,
    modelCapabilityId: value.modelCapabilityId,
    profileCapabilityStatus: value.profileCapabilityStatus,
    sourceBundleSemanticHash: value.sourceBundleSemanticHash,
    modelHealthSemanticHash: value.modelHealthSemanticHash,
    topologySemanticHash: value.topologySemanticHash,
    unitNormalizationSemanticHash: value.unitNormalizationSemanticHash,
    normalizedGeometry: value.normalizedGeometry,
    conditionedTopology: value.conditionedTopology,
    materialResolutions: value.materialResolutions,
    sectionResolutions: value.sectionResolutions,
    rigidAuthorities: value.rigidAuthorities,
    materialBindings: value.materialBindings,
    sectionBindings: value.sectionBindings,
    componentBindings: value.componentBindings,
    constraintDeclarations: value.constraintDeclarations,
    constraintBindings: value.constraintBindings,
    compilation: value.compilation,
    thermalAuthoritySummary: value.thermalAuthoritySummary,
    limitations: value.limitations,
    summary: value.summary,
  };
}

function evidenceProjection(value, semantic) {
  return {
    ...semanticProjection(value),
    semanticHash: semantic,
    sourceBundleEvidenceHash: value.sourceBundleEvidenceHash,
    modelHealthEvidenceHash: value.modelHealthEvidenceHash,
    topologyEvidenceHash: value.topologyEvidenceHash,
    unitNormalizationEvidenceHash: value.unitNormalizationEvidenceHash,
  };
}
