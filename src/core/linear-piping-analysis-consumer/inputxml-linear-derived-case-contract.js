import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { requireInputXmlLinearRecoveredCase } from './inputxml-linear-recovered-case-contract.js';
import {
  InputXmlLinearDerivedCaseError,
  inputXmlDerivedCaseFailure as fail,
} from './inputxml-linear-derived-case-error.js';
import { requireDerivedCaseShape } from './inputxml-linear-derived-case-validation.js';

export const INPUTXML_LINEAR_DERIVED_CASE_SCHEMA =
  'fea-inputxml-linear-derived-case/v1';

export const INPUTXML_LINEAR_DERIVED_CASE_KEYS = Object.freeze([
  'schema', 'derivedCaseId', 'name', 'purpose', 'analysisProfileId',
  'algebra', 'compatibilityIdentity', 'sourceCases', 'resultState',
  'rangeMagnitude', 'envelope', 'pressureCustody', 'limitations',
  'diagnostics', 'status', 'semanticHash', 'evidenceHash',
]);

export function sealInputXmlLinearDerivedCase(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(derivedCaseSemanticProjection(draft));
  const evidence = semanticHash(derivedCaseEvidenceProjection(draft, semantic));
  return requireInputXmlLinearDerivedCase(deepFreeze({
    ...draft,
    semanticHash: semantic,
    evidenceHash: evidence,
  }));
}

export function requireInputXmlLinearDerivedCase(value, expectedContext) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_DERIVED_CASE_SCHEMA) {
    fail('InputXML derived-case schema is invalid.', 'INPUTXML_DERIVED_SCHEMA_INVALID');
  }
  requireDraft(value);
  const semantic = semanticHash(derivedCaseSemanticProjection(value));
  if (value.semanticHash !== semantic) fail(
    'InputXML derived-case semantic hash mismatch.',
    'INPUTXML_DERIVED_HASH_MISMATCH',
  );
  const evidence = semanticHash(derivedCaseEvidenceProjection(value, semantic));
  if (value.evidenceHash !== evidence) fail(
    'InputXML derived-case evidence hash mismatch.',
    'INPUTXML_DERIVED_HASH_MISMATCH',
  );
  if (expectedContext) requireCurrentContext(value, expectedContext);
  return deepFreeze(value);
}

export function derivedCaseSemanticProjection(value) {
  return Object.fromEntries(INPUTXML_LINEAR_DERIVED_CASE_KEYS
    .filter((key) => key !== 'semanticHash' && key !== 'evidenceHash')
    .map((key) => [key, value[key]]));
}

export function derivedCaseEvidenceProjection(value, semanticHashValue) {
  return {
    semanticHash: semanticHashValue,
    sourceEvidence: value.sourceCases.map((row) => ({
      recoveredCaseId: row.recoveredCaseId,
      recoveredCaseSemanticHash: row.recoveredCaseSemanticHash,
      recoveredCaseEvidenceHash: row.recoveredCaseEvidenceHash,
      caseExecutionEvidenceHash: row.caseExecutionEvidenceHash,
      physicalLoadCaseEvidenceHash: row.physicalLoadCaseEvidenceHash,
    })),
    pressureEvidence: value.pressureCustody.map((row) => ({
      custodyId: row.custodyId,
      primitiveSemanticHash: row.primitiveSemanticHash,
      recoveredCaseEvidenceHash: row.recoveredCaseEvidenceHash,
    })),
    diagnostics: value.diagnostics,
    status: value.status,
  };
}

function requireDraft(value) {
  requireDerivedCaseShape(value, INPUTXML_LINEAR_DERIVED_CASE_KEYS);
}

function requireCurrentContext(value, context) {
  if (!Array.isArray(context.recoveredCases) || context.recoveredCases.length === 0) {
    fail(
      'Derived-case context requires recovered cases.',
      'INPUTXML_DERIVED_CONTEXT_INVALID',
    );
  }
  const byId = new Map(context.recoveredCases.map((row) => {
    const accepted = requireInputXmlLinearRecoveredCase(row);
    return [accepted.recoveredCaseId, accepted];
  }));
  if (byId.size !== context.recoveredCases.length) fail(
    'Derived-case context contains duplicate recovered cases.',
    'INPUTXML_DERIVED_CONTEXT_INVALID',
  );
  value.sourceCases.forEach((source) => {
    const recovered = byId.get(source.recoveredCaseId);
    if (!recovered
      || recovered.semanticHash !== source.recoveredCaseSemanticHash
      || recovered.evidenceHash !== source.recoveredCaseEvidenceHash
      || recovered.executionIdentity.caseExecutionSemanticHash
        !== source.caseExecutionSemanticHash
      || recovered.stiffnessIdentity.stiffnessRuntimeHash
        !== value.compatibilityIdentity.stiffnessRuntimeHash) {
      fail(
        `InputXML derived case is stale for recovered case ${source.recoveredCaseId}.`,
        'INPUTXML_DERIVED_CONTEXT_STALE',
      );
    }
  });
}

export { InputXmlLinearDerivedCaseError };
