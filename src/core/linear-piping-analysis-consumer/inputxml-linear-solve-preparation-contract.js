import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireInputXmlLinearStructuralPreparation } from './inputxml-linear-structural-preparation-contract.js';

export const INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA =
  'fea-inputxml-linear-solve-preparation/v1';

const LOAD_LEDGER_DISPOSITIONS = Object.freeze([
  'COMPILED',
  'COMPILED_WITH_DECLARED_LIMITATION',
  'INACTIVE',
  'DELEGATED_TO_RIGID_AUTHORITY',
  'BLOCKED',
]);

export function sealInputXmlLinearSolvePreparation(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(semanticProjection(draft));
  const evidence = semanticHash(evidenceProjection(draft, semantic));
  return deepFreeze({ ...draft, semanticHash: semantic, evidenceHash: evidence });
}

export function requireInputXmlLinearSolvePreparation(value, expectedContext) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA) {
    throw new TypeError('InputXML linear solve preparation schema is invalid.');
  }
  requireDraft(value);
  const semantic = semanticHash(semanticProjection(value));
  if (value.semanticHash !== semantic) {
    throw new TypeError('InputXML linear solve preparation semantic hash mismatch.');
  }
  if (value.evidenceHash !== semanticHash(evidenceProjection(value, semantic))) {
    throw new TypeError('InputXML linear solve preparation evidence hash mismatch.');
  }
  if (expectedContext) requireCurrentContext(value, expectedContext);
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value)) throw new TypeError('InputXML linear solve preparation must be a record.');
  for (const key of [
    'preparationId', 'analysisProfileId',
    'sourceBundleSemanticHash', 'sourceBundleEvidenceHash',
    'modelHealthSemanticHash', 'modelHealthEvidenceHash',
    'structuralPreparationSemanticHash', 'structuralPreparationEvidenceHash',
    'loadCaseProfileSemanticHash',
  ]) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      throw new TypeError(`InputXML solve preparation ${key} is invalid.`);
    }
  }
  const structural = requireInputXmlLinearStructuralPreparation(value.structuralPreparation);
  if (structural.semanticHash !== value.structuralPreparationSemanticHash
    || structural.evidenceHash !== value.structuralPreparationEvidenceHash) {
    throw new TypeError('InputXML solve preparation structural identity is stale.');
  }
  if (!Array.isArray(value.physicalCases) || value.physicalCases.length === 0
    || !Array.isArray(value.loadLedger) || !Array.isArray(value.limitations)
    || !isPlainRecord(value.summary) || !isPlainRecord(value.executionAvailability)) {
    throw new TypeError('InputXML solve preparation collections are invalid.');
  }
  requirePhysicalCases(value.physicalCases);
  requireLoadLedger(value.loadLedger, value.physicalCases);
  if (value.executionAvailability.stiffnessPreflight !== 'NOT_IMPLEMENTED'
    || value.executionAvailability.factorizationHandle !== 'NOT_CREATED'
    || value.executionAvailability.solveExecution !== 'NOT_AUTHORIZED') {
    throw new TypeError('InputXML solve preparation execution boundary is invalid.');
  }
}

function requirePhysicalCases(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (!isPlainRecord(row) || typeof row.caseId !== 'string' || ids.has(row.caseId)
      || typeof row.caseRole !== 'string' || !Array.isArray(row.sourceSetIds)
      || !Array.isArray(row.sourceFeatureIds) || !Array.isArray(row.primitiveIds)) {
      throw new TypeError('InputXML solve preparation physical-case record is malformed or duplicated.');
    }
    ids.add(row.caseId);
    const loadCase = requirePhysicalLoadCase(row.loadCase);
    if (loadCase.loadCaseId !== row.caseId) {
      throw new TypeError(`InputXML physical case ${row.caseId} load-case identity is inconsistent.`);
    }
    const primitiveIds = loadCase.primitives.map((primitive) => primitive.primitiveId);
    if (primitiveIds.length !== row.primitiveIds.length
      || primitiveIds.some((id, index) => id !== row.primitiveIds[index])) {
      throw new TypeError(`InputXML physical case ${row.caseId} primitive custody is inconsistent.`);
    }
  }
}

function requireLoadLedger(rows, cases) {
  const ids = new Set();
  const primitiveIds = new Set(cases.flatMap((row) => row.primitiveIds));
  const caseIds = new Set(cases.map((row) => row.caseId));
  for (const row of rows) {
    if (!isPlainRecord(row) || typeof row.ledgerId !== 'string' || ids.has(row.ledgerId)
      || !LOAD_LEDGER_DISPOSITIONS.includes(row.disposition)
      || !Array.isArray(row.primitiveIds) || !Array.isArray(row.caseIds)
      || !isPlainRecord(row.evidence)) {
      throw new TypeError('InputXML load ledger record is malformed or duplicated.');
    }
    ids.add(row.ledgerId);
    if (row.primitiveIds.some((id) => !primitiveIds.has(id))) {
      throw new TypeError(`InputXML load ledger ${row.ledgerId} names an unretained primitive.`);
    }
    if (row.caseIds.some((id) => !caseIds.has(id))) {
      throw new TypeError(`InputXML load ledger ${row.ledgerId} names an unretained physical case.`);
    }
    if (row.disposition === 'INACTIVE' && (row.primitiveIds.length > 0 || row.caseIds.length > 0)) {
      throw new TypeError(`Inactive InputXML load ledger ${row.ledgerId} cannot be compiled.`);
    }
  }
}

function requireCurrentContext(value, context) {
  if (value.sourceBundleSemanticHash !== context.sourceBundle?.semanticHash
    || value.sourceBundleEvidenceHash !== context.sourceBundle?.evidenceHash) {
    throw new TypeError('InputXML solve preparation is stale for the supplied source bundle.');
  }
  if (value.modelHealthSemanticHash !== context.report?.semanticHash
    || value.modelHealthEvidenceHash !== context.report?.evidenceHash) {
    throw new TypeError('InputXML solve preparation is stale for the supplied model-health report.');
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    preparationId: value.preparationId,
    analysisProfileId: value.analysisProfileId,
    sourceBundleSemanticHash: value.sourceBundleSemanticHash,
    modelHealthSemanticHash: value.modelHealthSemanticHash,
    structuralPreparationSemanticHash: value.structuralPreparationSemanticHash,
    loadCaseProfileSemanticHash: value.loadCaseProfileSemanticHash,
    structuralPreparation: value.structuralPreparation,
    physicalCases: value.physicalCases,
    loadLedger: value.loadLedger,
    limitations: value.limitations,
    summary: value.summary,
    executionAvailability: value.executionAvailability,
  };
}

function evidenceProjection(value, semantic) {
  return {
    ...semanticProjection(value),
    semanticHash: semantic,
    sourceBundleEvidenceHash: value.sourceBundleEvidenceHash,
    modelHealthEvidenceHash: value.modelHealthEvidenceHash,
    structuralPreparationEvidenceHash: value.structuralPreparationEvidenceHash,
  };
}
