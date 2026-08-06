import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  INPUTXML_LINEAR_DERIVED_CASE_SCHEMA,
  requireInputXmlLinearDerivedCase,
  sealInputXmlLinearDerivedCase,
} from './inputxml-linear-derived-case-contract.js';
import {
  buildInputXmlDerivedPressureCustody,
  inputXmlDerivedDiagnostics,
  inputXmlDerivedLimitations,
  inputXmlDerivedSourceCaseRecord,
  inputXmlDerivedStatus,
  requireCompatibleRecoveredCases,
} from './inputxml-linear-derived-case-custody.js';
import {
  INPUTXML_LINEAR_DERIVED_CASE_PURPOSES,
  canonicalInputXmlDerivedAlgebra,
  referencedRecoveredCaseIds,
  requireInputXmlDerivedPurpose,
  requireInputXmlDerivedText,
} from './inputxml-linear-derived-case-definition.js';
import { envelopeResultStates } from './inputxml-linear-derived-case-envelope.js';
import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';
import {
  absoluteResultState,
  combineRecoveredResultState,
} from './inputxml-linear-derived-case-results.js';
import { requireInputXmlLinearRecoveredCase } from './inputxml-linear-recovered-case-contract.js';

export { INPUTXML_LINEAR_DERIVED_CASE_PURPOSES };

export function deriveInputXmlLinearCase(recoveredValues, definition) {
  const available = requireRecoveredCases(recoveredValues);
  const algebra = canonicalInputXmlDerivedAlgebra(definition, available);
  const referencedIds = referencedRecoveredCaseIds(algebra);
  const recoveredById = new Map(referencedIds.map((id) => [id, available.get(id)]));
  const recovered = [...recoveredById.values()];
  const compatibilityIdentity = requireCompatibleRecoveredCases(recovered);
  const name = requireInputXmlDerivedText(definition.name, 'definition.name');
  const purpose = requireInputXmlDerivedPurpose(definition.purpose);
  const states = buildStates(algebra, recoveredById);
  const sourceCases = recovered.map(inputXmlDerivedSourceCaseRecord)
    .sort((left, right) => compareAscii(left.recoveredCaseId, right.recoveredCaseId));
  const pressureCustody = buildInputXmlDerivedPressureCustody(algebra, recoveredById);
  const limitations = inputXmlDerivedLimitations(algebra, recovered);
  const status = inputXmlDerivedStatus(recovered);
  const diagnostics = inputXmlDerivedDiagnostics(
    algebra, recovered, pressureCustody, states,
  );
  const derivedCaseId = `IXDC-${semanticHash({
    name, purpose, algebra, compatibilityIdentity,
    sourceCases: sourceCases.map((row) => ({
      recoveredCaseId: row.recoveredCaseId,
      recoveredCaseSemanticHash: row.recoveredCaseSemanticHash,
    })),
  })}`;

  return sealInputXmlLinearDerivedCase({
    schema: INPUTXML_LINEAR_DERIVED_CASE_SCHEMA,
    derivedCaseId,
    name,
    purpose,
    analysisProfileId: recovered[0].analysisProfileId,
    algebra,
    compatibilityIdentity,
    sourceCases,
    resultState: states.resultState,
    rangeMagnitude: states.rangeMagnitude,
    envelope: states.envelope,
    pressureCustody,
    limitations,
    diagnostics,
    status,
    semanticHash: '',
    evidenceHash: '',
  });
}

export function deriveInputXmlLinearCases(recoveredValues, definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) fail(
    'InputXML derived-case batch requires at least one definition.',
    'INPUTXML_DERIVED_BATCH_INVALID',
  );
  const results = definitions.map((definition) => (
    deriveInputXmlLinearCase(recoveredValues, definition)
  ));
  const ids = new Set(results.map((row) => row.derivedCaseId));
  if (ids.size !== results.length) fail(
    'InputXML derived-case batch contains duplicate definitions.',
    'INPUTXML_DERIVED_DUPLICATE',
  );
  return Object.freeze(results);
}

function requireRecoveredCases(values) {
  if (!Array.isArray(values) || values.length === 0) fail(
    'InputXML derived cases require sealed recovered cases.',
    'INPUTXML_DERIVED_SOURCE_CASES_INVALID',
  );
  const map = new Map();
  values.forEach((value) => {
    const recovered = requireInputXmlLinearRecoveredCase(value);
    if (map.has(recovered.recoveredCaseId)) fail(
      `Recovered case ${recovered.recoveredCaseId} is duplicated.`,
      'INPUTXML_DERIVED_DUPLICATE',
    );
    map.set(recovered.recoveredCaseId, recovered);
  });
  return map;
}

function buildStates(algebra, recoveredById) {
  if (algebra.kind === 'LINEAR') return {
    resultState: combineRecoveredResultState(algebra.terms, recoveredById),
    rangeMagnitude: null,
    envelope: null,
  };
  if (algebra.kind === 'RANGE') {
    const resultState = combineRecoveredResultState(algebra.terms, recoveredById);
    return { resultState, rangeMagnitude: absoluteResultState(resultState), envelope: null };
  }
  const candidates = algebra.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    state: combineRecoveredResultState(candidate.terms, recoveredById),
  }));
  return {
    resultState: null,
    rangeMagnitude: null,
    envelope: envelopeResultStates(candidates),
  };
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export { requireInputXmlLinearDerivedCase };
