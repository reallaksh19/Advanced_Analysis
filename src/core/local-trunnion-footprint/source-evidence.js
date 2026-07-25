import {
  CANONICAL_UNITS as ATTACHMENT_UNITS,
  MODEL_SCHEMA as ATTACHMENT_MODEL_SCHEMA,
  QUALIFICATION_STATES as ATTACHMENT_STATES,
  RESULT_SCHEMA as ATTACHMENT_RESULT_SCHEMA,
  calculateLocalAttachmentFoundation,
  reconstructResultHashes,
  validateCanonicalLocalAttachmentFoundationModel,
} from '../local-stress/index.js';
import { sourceError, unsupportedError } from './errors.js';
import { canonicalStringify, equalCanonical, semanticHash } from './json.js';

export function validateAttachmentEvidence(evidence, ancestry) {
  const model = validateModel(evidence.model);
  const result = validateResult(evidence.result, model);
  const recalculated = calculateLocalAttachmentFoundation(model);
  if (!equalCanonical(recalculated, result)) throw sourceError('ATTACHMENT_RESULT_FORGED', 'attachmentEvidence.result', 'Attachment result does not reproduce through the public LAFEA.1 calculator.');
  verifyAncestry(ancestry, model, result);
  const unitEvidence = verifyUnits(model);
  if (!Array.isArray(result.transformedLoadCases)) throw sourceError('ATTACHMENT_LOAD_EVIDENCE_MISSING', 'attachmentEvidence.result.transformedLoadCases', 'Accepted attachment result must retain transformed load cases.');
  return { model, result, unitEvidence, attachmentEvidenceHash: semanticHash({ modelHash: model.semanticHash, resultHashes: result.semanticHashes }) };
}

function validateModel(value) {
  if (value?.schema !== ATTACHMENT_MODEL_SCHEMA) throw sourceError('ATTACHMENT_MODEL_SCHEMA_MISMATCH', 'attachmentEvidence.model.schema', `Expected ${ATTACHMENT_MODEL_SCHEMA}.`);
  try { return validateCanonicalLocalAttachmentFoundationModel(value); }
  catch (error) { throw sourceError('ATTACHMENT_MODEL_INVALID', 'attachmentEvidence.model', error instanceof Error ? error.message : 'Attachment model is invalid.'); }
}
function validateResult(result, model) {
  if (result?.schema !== ATTACHMENT_RESULT_SCHEMA) throw sourceError('ATTACHMENT_RESULT_SCHEMA_MISMATCH', 'attachmentEvidence.result.schema', `Expected ${ATTACHMENT_RESULT_SCHEMA}.`);
  if (result?.qualification?.state !== ATTACHMENT_STATES.ACCEPTED) throw sourceError('ATTACHMENT_RESULT_NOT_ACCEPTED', 'attachmentEvidence.result.qualification', 'Attachment result must be accepted.');
  const reconstructed = reconstructResultHashes(result);
  if (!equalCanonical(reconstructed, result.semanticHashes)) throw sourceError('ATTACHMENT_RESULT_HASH_MISMATCH', 'attachmentEvidence.result.semanticHashes', 'Attachment result hashes do not reconstruct.');
  if (result.modelIdentity !== model.modelIdentity || result.modelVersion !== model.modelVersion) throw sourceError('ATTACHMENT_IDENTITY_MISMATCH', 'attachmentEvidence', 'Attachment model and result identities differ.');
  if (!equalCanonical(result.sourceAncestry, model.sourceAncestry)) throw sourceError('ATTACHMENT_ANCESTRY_MISMATCH', 'attachmentEvidence.result.sourceAncestry', 'Attachment result ancestry differs from its model.');
  if (reconstructed.canonicalModelSemanticHash !== model.semanticHash) throw sourceError('ATTACHMENT_MODEL_HASH_MISMATCH', 'attachmentEvidence.result.semanticHashes.canonicalModelSemanticHash', 'Attachment result does not belong to the supplied model.');
  return result;
}
function verifyAncestry(ancestry, model, result) {
  if (ancestry.attachmentCanonicalModelSemanticHash !== model.semanticHash) throw sourceError('SOURCE_ANCESTRY_MODEL_MISMATCH', 'sourceAncestry.attachmentCanonicalModelSemanticHash', 'Declared attachment model ancestry is stale.');
  if (ancestry.attachmentResultPayloadSemanticHash !== result.semanticHashes.resultPayloadSemanticHash) throw sourceError('SOURCE_ANCESTRY_RESULT_MISMATCH', 'sourceAncestry.attachmentResultPayloadSemanticHash', 'Declared attachment result ancestry is stale.');
}
function verifyUnits(model) {
  const canonical = model.units?.canonical ?? model.units;
  for (const [dimension, expected] of Object.entries(ATTACHMENT_UNITS)) {
    if (canonical?.[dimension] !== expected) throw sourceError('ATTACHMENT_UNIT_MISMATCH', `attachmentEvidence.model.units.${dimension}`, `Attachment ${dimension} unit must be ${expected}.`);
  }
  return { ...canonical };
}

export function attachmentLoadCase(result, identity) {
  const row = result.transformedLoadCases.find((item) => item.identity === identity);
  if (!row) throw sourceError('ATTACHMENT_LOAD_CASE_MISSING', `loadCaseMappings.${identity}`, `Attachment load case ${identity} is missing.`);
  for (const field of ['canonicalForceGlobal', 'canonicalMomentAtSourceGlobal', 'sourcePointGlobal']) {
    if (!Array.isArray(row[field]) || row[field].length !== 3) throw sourceError('ATTACHMENT_RESULTANT_INCOMPLETE', `attachmentEvidence.result.transformedLoadCases.${identity}.${field}`, `${field} is required.`);
  }
  return row;
}

export function rejectPressureOnlyRequest(result, mappings) {
  if (mappings.length === 0) {
    const pressure = Array.isArray(result.pressureStressResults) && result.pressureStressResults.length > 0;
    throw unsupportedError(pressure ? 'PRESSURE_ONLY_REQUEST_UNSUPPORTED' : 'MECHANICAL_LOAD_CASE_REQUIRED', 'loadCaseMappings', pressure ? 'LAFEA.5 does not superimpose pressure or accept pressure-only requests.' : 'At least one explicit mechanical load-case mapping is required.');
  }
}

export function sourceEvidenceDigest(model, result) {
  return semanticHash({ model: model.semanticHash, result: canonicalStringify(result.semanticHashes) });
}