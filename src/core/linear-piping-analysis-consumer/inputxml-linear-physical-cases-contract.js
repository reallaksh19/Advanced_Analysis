import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';
import { requireInputXmlLinearStructuralPreparation } from './inputxml-linear-structural-preparation-contract.js';

export const INPUTXML_LINEAR_PHYSICAL_CASE_PREPARATION_SCHEMA =
  'fea-inputxml-linear-physical-case-preparation/v1';

const LEDGER_DISPOSITIONS = new Set([
  'COMPILED',
  'COMPILED_WITH_DECLARED_LIMITATION',
  'INACTIVE',
  'BLOCKED',
]);

export function sealInputXmlLinearPhysicalCasePreparation(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(semanticProjection(draft));
  const evidence = semanticHash(evidenceProjection(draft, semantic));
  return deepFreeze({ ...draft, semanticHash: semantic, evidenceHash: evidence });
}

export function requireInputXmlLinearPhysicalCasePreparation(
  value,
  expectedSourcePreparation = null,
  expectedStructuralPreparation = null,
) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_PHYSICAL_CASE_PREPARATION_SCHEMA) {
    throw new TypeError('InputXML physical-case preparation schema is invalid.');
  }
  requireDraft(value);
  const semantic = semanticHash(semanticProjection(value));
  if (value.semanticHash !== semantic) {
    throw new TypeError('InputXML physical-case preparation semantic hash mismatch.');
  }
  if (value.evidenceHash !== semanticHash(evidenceProjection(value, semantic))) {
    throw new TypeError('InputXML physical-case preparation evidence hash mismatch.');
  }
  if (expectedSourcePreparation !== null) {
    const prepared = requireInputXmlLinearSolvePreparation(expectedSourcePreparation);
    if (value.sourcePreparationSemanticHash !== prepared.semanticHash
      || value.sourcePreparationEvidenceHash !== prepared.evidenceHash) {
      throw new TypeError('InputXML physical-case preparation is stale for the supplied authority preparation.');
    }
  }
  if (expectedStructuralPreparation !== null) {
    const structural = requireInputXmlLinearStructuralPreparation(
      expectedStructuralPreparation,
      expectedSourcePreparation,
    );
    if (value.structuralPreparationSemanticHash !== structural.semanticHash
      || value.structuralPreparationEvidenceHash !== structural.evidenceHash) {
      throw new TypeError('InputXML physical-case preparation is stale for the supplied structural preparation.');
    }
  }
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_PHYSICAL_CASE_PREPARATION_SCHEMA) {
    throw new TypeError('InputXML physical-case preparation draft is invalid.');
  }
  for (const key of [
    'preparationId',
    'analysisProfileId',
    'sourcePreparationSemanticHash',
    'sourcePreparationEvidenceHash',
    'structuralPreparationSemanticHash',
    'structuralPreparationEvidenceHash',
    'loadCaseProfileSemanticHash',
  ]) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      throw new TypeError(`InputXML physical-case preparation ${key} is invalid.`);
    }
  }
  const sourcePreparation = requireInputXmlLinearSolvePreparation(value.sourcePreparation);
  const structural = requireInputXmlLinearStructuralPreparation(
    value.structuralPreparation,
    sourcePreparation,
  );
  if (sourcePreparation.semanticHash !== value.sourcePreparationSemanticHash
    || sourcePreparation.evidenceHash !== value.sourcePreparationEvidenceHash
    || structural.semanticHash !== value.structuralPreparationSemanticHash
    || structural.evidenceHash !== value.structuralPreparationEvidenceHash) {
    throw new TypeError('InputXML physical-case preparation retained parent identity is stale.');
  }
  if (!Array.isArray(value.physicalCases) || value.physicalCases.length === 0
    || !Array.isArray(value.loadLedger)
    || !Array.isArray(value.limitations)
    || !isPlainRecord(value.summary)
    || !isPlainRecord(value.executionBoundary)) {
    throw new TypeError('InputXML physical-case preparation collections are invalid.');
  }
  const caseIds = new Set();
  const primitiveIds = new Set();
  for (const row of value.physicalCases) {
    if (!isPlainRecord(row) || typeof row.caseId !== 'string' || caseIds.has(row.caseId)
      || typeof row.caseRole !== 'string' || !Array.isArray(row.primitiveIds)) {
      throw new TypeError('InputXML physical case is malformed or duplicated.');
    }
    caseIds.add(row.caseId);
    const loadCase = requirePhysicalLoadCase(row.loadCase);
    if (loadCase.loadCaseId !== row.caseId) {
      throw new TypeError(`InputXML physical case ${row.caseId} identity is inconsistent.`);
    }
    const retainedIds = loadCase.primitives.map((primitive) => primitive.primitiveId);
    if (retainedIds.length !== row.primitiveIds.length
      || retainedIds.some((id, index) => id !== row.primitiveIds[index])) {
      throw new TypeError(`InputXML physical case ${row.caseId} primitive custody is inconsistent.`);
    }
    retainedIds.forEach((id) => primitiveIds.add(id));
  }
  const ledgerIds = new Set();
  for (const row of value.loadLedger) {
    if (!isPlainRecord(row) || typeof row.ledgerId !== 'string' || ledgerIds.has(row.ledgerId)
      || !LEDGER_DISPOSITIONS.has(row.disposition)
      || !Array.isArray(row.primitiveIds) || !Array.isArray(row.caseIds)
      || !isPlainRecord(row.evidence)) {
      throw new TypeError('InputXML physical-case load ledger is malformed or duplicated.');
    }
    ledgerIds.add(row.ledgerId);
    if (row.primitiveIds.some((id) => !primitiveIds.has(id))
      || row.caseIds.some((id) => !caseIds.has(id))) {
      throw new TypeError(`InputXML load ledger ${row.ledgerId} references unretained compilation custody.`);
    }
    if (['INACTIVE', 'BLOCKED'].includes(row.disposition)
      && (row.primitiveIds.length > 0 || row.caseIds.length > 0)) {
      throw new TypeError(`InputXML load ledger ${row.ledgerId} cannot compile from ${row.disposition}.`);
    }
  }
  if (value.executionBoundary.loadPrimitivesCompiled !== true
    || value.executionBoundary.physicalCasesCompiled !== true
    || value.executionBoundary.stiffnessAssembled !== false
    || value.executionBoundary.factorizationCreated !== false
    || value.executionBoundary.solveAuthorized !== false) {
    throw new TypeError('InputXML physical-case preparation execution boundary is invalid.');
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    preparationId: value.preparationId,
    analysisProfileId: value.analysisProfileId,
    sourcePreparationSemanticHash: value.sourcePreparationSemanticHash,
    structuralPreparationSemanticHash: value.structuralPreparationSemanticHash,
    loadCaseProfileSemanticHash: value.loadCaseProfileSemanticHash,
    sourcePreparation: value.sourcePreparation,
    structuralPreparation: value.structuralPreparation,
    physicalCases: value.physicalCases,
    loadLedger: value.loadLedger,
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
    structuralPreparationEvidenceHash: value.structuralPreparationEvidenceHash,
  };
}
