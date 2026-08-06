import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';

export const INPUTXML_LINEAR_STRUCTURAL_PREPARATION_SCHEMA =
  'fea-inputxml-linear-structural-preparation/v1';

export function sealInputXmlLinearStructuralPreparation(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(semanticProjection(draft));
  const evidence = semanticHash(evidenceProjection(draft, semantic));
  return deepFreeze({ ...draft, semanticHash: semantic, evidenceHash: evidence });
}

export function requireInputXmlLinearStructuralPreparation(value, expectedSourcePreparation = null) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_STRUCTURAL_PREPARATION_SCHEMA) {
    throw new TypeError('InputXML linear structural preparation schema is invalid.');
  }
  requireDraft(value);
  const semantic = semanticHash(semanticProjection(value));
  if (value.semanticHash !== semantic) {
    throw new TypeError('InputXML linear structural preparation semantic hash mismatch.');
  }
  if (value.evidenceHash !== semanticHash(evidenceProjection(value, semantic))) {
    throw new TypeError('InputXML linear structural preparation evidence hash mismatch.');
  }
  if (expectedSourcePreparation !== null) {
    const sourcePreparation = requireInputXmlLinearSolvePreparation(expectedSourcePreparation);
    if (value.sourcePreparationSemanticHash !== sourcePreparation.semanticHash
      || value.sourcePreparationEvidenceHash !== sourcePreparation.evidenceHash) {
      throw new TypeError('InputXML structural preparation is stale for the supplied authority preparation.');
    }
  }
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_STRUCTURAL_PREPARATION_SCHEMA) {
    throw new TypeError('InputXML structural preparation draft is invalid.');
  }
  for (const key of [
    'preparationId',
    'modelId',
    'analysisProfileId',
    'sourcePreparationSemanticHash',
    'sourcePreparationEvidenceHash',
    'sourceBundleSemanticHash',
    'sourceBundleEvidenceHash',
    'modelHealthSemanticHash',
    'modelHealthEvidenceHash',
  ]) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      throw new TypeError(`InputXML structural preparation ${key} is invalid.`);
    }
  }
  if (!['PASS', 'CONDITIONAL'].includes(value.modelCapabilityStatus)
    || !isPlainRecord(value.conditionedTopology)
    || !Array.isArray(value.materialResolutions)
    || !Array.isArray(value.sectionResolutions)
    || !Array.isArray(value.rigidAuthorities)
    || !Array.isArray(value.segmentBindings)
    || !Array.isArray(value.constraintDeclarations)
    || !Array.isArray(value.constraintBindings)
    || !Array.isArray(value.limitations)
    || !isPlainRecord(value.compilation)
    || !isPlainRecord(value.summary)
    || !isPlainRecord(value.executionBoundary)) {
    throw new TypeError('InputXML structural preparation collections are invalid.');
  }
  const compilation = requireMechanicalModelCompilation(value.compilation);
  if (compilation.mechanicalModelSemanticHash !== value.summary.mechanicalModelSemanticHash
    || compilation.stiffnessStateHash !== value.summary.stiffnessStateHash) {
    throw new TypeError('InputXML structural preparation compilation identity is stale.');
  }
  requireUnique(value.segmentBindings, 'segmentId', 'segment');
  requireUnique(value.segmentBindings, 'elementId', 'element');
  if (value.segmentBindings.length !== compilation.model.elements.length) {
    throw new TypeError('InputXML structural preparation element coverage is incomplete.');
  }
  if (value.executionBoundary.constraintsCompiled !== true
    || value.executionBoundary.mechanicalModelCompiled !== true
    || value.executionBoundary.loadPrimitivesCompiled !== false
    || value.executionBoundary.stiffnessAssembled !== false
    || value.executionBoundary.factorizationCreated !== false
    || value.executionBoundary.solveAuthorized !== false) {
    throw new TypeError('InputXML structural preparation execution boundary is invalid.');
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    preparationId: value.preparationId,
    modelId: value.modelId,
    analysisProfileId: value.analysisProfileId,
    modelCapabilityStatus: value.modelCapabilityStatus,
    sourcePreparationSemanticHash: value.sourcePreparationSemanticHash,
    sourceBundleSemanticHash: value.sourceBundleSemanticHash,
    modelHealthSemanticHash: value.modelHealthSemanticHash,
    conditionedTopology: value.conditionedTopology,
    materialResolutions: value.materialResolutions,
    sectionResolutions: value.sectionResolutions,
    rigidAuthorities: value.rigidAuthorities,
    segmentBindings: value.segmentBindings,
    constraintDeclarations: value.constraintDeclarations,
    constraintBindings: value.constraintBindings,
    compilation: value.compilation,
    limitations: value.limitations,
    summary: value.summary,
    executionBoundary: value.executionBoundary,
  };
}

function evidenceProjection(value, semantic) {
  return {
    ...semanticProjection(value),
    semanticHash: semantic,
    sourcePreparationEvidenceHash: value.sourcePreparationEvidenceHash,
    sourceBundleEvidenceHash: value.sourceBundleEvidenceHash,
    modelHealthEvidenceHash: value.modelHealthEvidenceHash,
  };
}

function requireUnique(rows, key, label) {
  const values = rows.map((row) => row?.[key]);
  if (values.some((value) => typeof value !== 'string')
    || new Set(values).size !== values.length) {
    throw new TypeError(`InputXML structural preparation ${label} bindings are invalid.`);
  }
}
