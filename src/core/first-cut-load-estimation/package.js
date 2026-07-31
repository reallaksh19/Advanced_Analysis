/**
 * Functionality: Wraps qualified W10.5/W10.6 outputs, optional sustained
 * screening, mass/COG, lineage, limitations, and stale-state evidence into one
 * sealed first-cut calculation package.
 */

import { validateTributarySupportLoadScreening } from '../support-load-screening/index.js';
import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { validateVerticalBeamModel, validateVerticalBeamSolution } from '../vertical-beam-solver/index.js';
import {
  FIRST_CUT_CAPABILITIES, FIRST_CUT_METHODS, FIRST_CUT_SCHEMAS,
  FIRST_CUT_STATUSES, NOT_EVALUATED_FIELDS, NOT_EVALUATED_LABEL,
} from './constants.js';
import { validateFirstCutAssumptionSet } from './assumptions.js';
import { validateFirstCutMassLedger } from './mass-ledger.js';
import { validateFirstCutProfile } from './profile.js';
import { recoverBeamSag } from './sag-recovery.js';
import { buildSustainedScreening, validateSustainedScreening } from './sustained-screening.js';
import {
  assertExactKeys, assertHash, validateHashedContract, withSemanticHash,
} from './validation.js';

const INPUT_KEYS = Object.freeze([
  'profile', 'assumptionSet', 'massLedger', 'pathSemanticHash',
  'supportScreening', 'beamModel', 'beamSolution', 'sustainedInput', 'currentParentHashes',
]);
const BASE_CONTRACT_KEYS = Object.freeze([
  'schema', 'datasetId', 'parentHashes', 'method', 'loadCaseIds', 'massLedger',
  'supportScreening', 'beamScreening', 'sustainedScreening', 'notEvaluated',
  'notEvaluatedLabel', 'limitations', 'diagnostics', 'status', 'evidenceHash',
  ...NOT_EVALUATED_FIELDS,
]);

export function runFirstCutLoadEstimation(input) {
  assertExactKeys(input, INPUT_KEYS, 'First-cut calculation input');
  validateRequired(input.profile, validateFirstCutProfile, 'profile');
  validateRequired(input.assumptionSet, validateFirstCutAssumptionSet, 'assumption set');
  validateRequired(input.massLedger, validateFirstCutMassLedger, 'mass ledger');
  assertLineage(input);
  const methodResult = input.profile.methodId === FIRST_CUT_METHODS.SIMPLE_SPAN
    ? buildSupportScreening(input)
    : buildBeamScreening(input);
  const sustainedScreening = buildOptionalSustained(input);
  const parentHashes = buildParentHashes(input);
  const stale = parentHashMismatch(parentHashes, input.currentParentHashes);
  const diagnostics = [...methodResult.diagnostics, ...(sustainedScreening ? [] : sustainedDiagnostics(input))].sort();
  const status = stale ? FIRST_CUT_STATUSES.STALE : aggregateStatus([
    massStatus(input.massLedger, input.profile.loadCaseIds),
    methodResult.status,
    input.profile.requestedCapabilities.includes(FIRST_CUT_CAPABILITIES.SUSTAINED)
      && sustainedScreening === null ? FIRST_CUT_STATUSES.BLOCKED : null,
    sustainedScreening?.status,
  ].filter(Boolean));
  const nullFields = Object.fromEntries(NOT_EVALUATED_FIELDS.map((field) => [field, null]));
  const base = {
    schema: FIRST_CUT_SCHEMAS.CALCULATION_PACKAGE,
    datasetId: input.massLedger.datasetId,
    parentHashes,
    method: input.profile.methodId,
    loadCaseIds: input.profile.loadCaseIds,
    massLedger: input.massLedger,
    supportScreening: methodResult.supportScreening,
    beamScreening: methodResult.beamScreening,
    sustainedScreening,
    notEvaluated: NOT_EVALUATED_FIELDS,
    notEvaluatedLabel: NOT_EVALUATED_LABEL,
    limitations: Object.freeze([
      'PRELIMINARY_SCREENING_ONLY',
      'NO_THERMAL_OR_INTERFACE_REACTIONS',
      'NOT_B31_3_COMPLIANCE',
      ...(input.assumptionSet.assumptions.some(
        (row) => row.fieldId === 'supportAvailabilitySensitivity',
      ) ? ['USER_DECLARED_SUPPORT_UNAVAILABLE_SENSITIVITY'] : []),
    ]),
    diagnostics,
    status,
    evidenceHash: semanticHash({ parentHashes, evidenceHash: input.assumptionSet.evidenceHash }),
    ...nullFields,
  };
  return withSemanticHash(base);
}

export function validateFirstCutCalculationPackage(value) {
  const result = validateHashedContract(
    value, FIRST_CUT_SCHEMAS.CALCULATION_PACKAGE, BASE_CONTRACT_KEYS,
  );
  if (!result.ok) return result;
  const errors = [];
  validateNested(value, errors);
  validateParentHashes(value.parentHashes, errors);
  NOT_EVALUATED_FIELDS.forEach((field) => {
    if (value[field] !== null) errors.push(`${field} must remain null.`);
  });
  if (JSON.stringify(value.notEvaluated) !== JSON.stringify(NOT_EVALUATED_FIELDS)) {
    errors.push('notEvaluated must list every FEA-only field exactly once.');
  }
  if (!Object.values(FIRST_CUT_STATUSES).includes(value.status)) errors.push('Invalid first-cut status.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function assessFirstCutStaleness(calculationPackage, currentParentHashes) {
  const validation = validateFirstCutCalculationPackage(calculationPackage);
  if (!validation.ok) throw new TypeError(`Invalid first-cut package: ${validation.errors.join(' ')}`);
  return deepFreeze({
    stale: parentHashMismatch(calculationPackage.parentHashes, currentParentHashes),
    expected: calculationPackage.parentHashes,
    current: currentParentHashes,
  });
}

function buildSupportScreening(input) {
  const validation = validateTributarySupportLoadScreening(input.supportScreening);
  if (!validation.ok) return blockedMethod(`W10.5 invalid: ${validation.errors.join(' ')}`);
  const cases = input.supportScreening.pathCases.filter((row) => input.profile.loadCaseIds.includes(row.loadCaseId));
  const supportResults = input.supportScreening.supportResults
    .filter((row) => input.profile.loadCaseIds.includes(row.loadCaseId))
    .map((row) => deepFreeze({
      resultId: row.resultId, pathId: row.pathId, loadCaseId: row.loadCaseId,
      supportId: row.supportKey, screenedVerticalShareN: row.screenedVerticalForceN,
      resultKind: 'SCREENED_GRAVITY_SHARE', label: 'Screened vertical share',
      contributionIds: row.contributionIds, sourceEvidence: row.sourceEvidence,
    }));
  const blocked = cases.some((row) => row.qualification !== 'READY');
  const sag = buildSag(input);
  const status = aggregateStatus([
    blocked ? FIRST_CUT_STATUSES.BLOCKED : FIRST_CUT_STATUSES.QUALIFIED,
    sag?.status,
  ].filter(Boolean));
  return {
    supportScreening: withSemanticHash({
      schema: FIRST_CUT_SCHEMAS.SUPPORT_SCREENING,
      sourceSchema: input.supportScreening.schema,
      sourceSemanticHash: input.supportScreening.semanticHash,
      pathCases: cases,
      supportResults,
      sag,
      status,
    }),
    beamScreening: null, status, diagnostics: blocked ? ['W10.5_PATH_CASE_BLOCKED'] : [],
  };
}

function buildBeamScreening(input) {
  const modelValidation = validateVerticalBeamModel(input.beamModel);
  const solutionValidation = validateVerticalBeamSolution(input.beamSolution);
  if (!modelValidation.ok || !solutionValidation.ok) {
    return blockedMethod('W10.6 model or solution is invalid.');
  }
  const modelCases = input.beamModel.pathCases.filter((row) => input.profile.loadCaseIds.includes(row.loadCaseId));
  const solutionCases = input.beamSolution.pathCases.filter((row) => input.profile.loadCaseIds.includes(row.loadCaseId));
  const insufficient = modelCases.some((row) => row.qualification === 'READY' && row.constraints.length < 3);
  if (insufficient) return blockedMethod('Continuous-beam screening requires at least three bilateral supports.');
  const supportResults = solutionCases.flatMap((row) => row.supportForceResults.map((result) => deepFreeze({
    resultId: result.resultId, pathId: row.pathId, loadCaseId: row.loadCaseId,
    supportId: result.supportKey, beamVerticalForceN: result.signedSupportForceN,
    resultKind: 'BEAM_VERTICAL_FORCE', label: 'Beam vertical force',
    sourceEvidence: result.sourceEvidence,
  })));
  const sag = buildSag(input);
  const blocked = solutionCases.some((row) => row.qualification !== 'READY');
  const reversal = solutionCases.some((row) => row.supportForceResults.some((result) => result.signedSupportForceN > 0));
  const status = aggregateStatus([
    blocked ? FIRST_CUT_STATUSES.BLOCKED : reversal ? FIRST_CUT_STATUSES.CONDITIONAL : FIRST_CUT_STATUSES.QUALIFIED,
    sag?.status,
  ].filter(Boolean));
  return {
    supportScreening: null,
    beamScreening: withSemanticHash({
      schema: FIRST_CUT_SCHEMAS.BEAM_SCREENING,
      modelSemanticHash: input.beamModel.semanticHash,
      solutionSemanticHash: input.beamSolution.semanticHash,
      pathCases: solutionCases,
      supportResults,
      sag,
      status,
    }),
    status,
    diagnostics: reversal ? ['NEGATIVE_OR_DIRECTION_REVERSED_BEAM_FORCE_REQUIRES_LFEA'] : [],
  };
}

function buildSag(input) {
  if (!input.profile.requestedCapabilities.includes(FIRST_CUT_CAPABILITIES.SAG)) return null;
  if (!input.beamModel || !input.beamSolution) {
    return deepFreeze({ cases: [], maximumAbsoluteSagM: null, status: FIRST_CUT_STATUSES.BLOCKED });
  }
  return recoverBeamSag({
    beamModel: input.beamModel,
    solution: input.beamSolution,
    sagCriterion: input.profile.sagCriterion,
  });
}

function buildOptionalSustained(input) {
  if (!input.profile.requestedCapabilities.includes(FIRST_CUT_CAPABILITIES.SUSTAINED)) return null;
  if (input.sustainedInput === null) return null;
  const result = buildSustainedScreening(input.sustainedInput);
  validateRequired(result, validateSustainedScreening, 'sustained screening');
  return result;
}

function buildParentHashes(input) {
  return deepFreeze({
    sourceSemanticHash: input.massLedger.sourceSemanticHash,
    enrichmentResultSemanticHash: input.massLedger.enrichmentResultSemanticHash,
    modelLoadPrimitiveSemanticHash: input.massLedger.loadPrimitiveSemanticHash,
    pathSemanticHash: assertHash(input.pathSemanticHash, 'Path hash'),
    assumptionSetSemanticHash: input.assumptionSet.semanticHash,
    profileSemanticHash: input.profile.semanticHash,
  });
}

function assertLineage(input) {
  if (input.assumptionSet.sourceSemanticHash !== input.massLedger.sourceSemanticHash) {
    throw new TypeError('Assumption set and mass ledger reference different source models.');
  }
  if (input.assumptionSet.profileSemanticHash !== input.profile.semanticHash) {
    throw new TypeError('Assumption set and profile do not match.');
  }
}

function parentHashMismatch(expected, current) {
  assertExactKeys(current, Object.keys(expected), 'Current parent hashes');
  return Object.keys(expected).some((key) => expected[key] !== current[key]);
}

function massStatus(ledger, caseIds) {
  return ledger.cases.some((row) => caseIds.includes(row.loadCaseId) && row.qualification !== 'READY')
    ? FIRST_CUT_STATUSES.BLOCKED : FIRST_CUT_STATUSES.QUALIFIED;
}
function sustainedDiagnostics(input) {
  return input.profile.requestedCapabilities.includes(FIRST_CUT_CAPABILITIES.SUSTAINED)
    ? ['SUSTAINED_SCREENING_INPUT_MISSING'] : [];
}
function blockedMethod(message) {
  return { supportScreening: null, beamScreening: null, status: FIRST_CUT_STATUSES.BLOCKED, diagnostics: [message] };
}
function aggregateStatus(statuses) {
  const order = [
    FIRST_CUT_STATUSES.STALE, FIRST_CUT_STATUSES.BLOCKED, FIRST_CUT_STATUSES.ESCALATE,
    FIRST_CUT_STATUSES.CONDITIONAL, FIRST_CUT_STATUSES.QUALIFIED,
  ];
  return order.find((status) => statuses.includes(status)) || FIRST_CUT_STATUSES.BLOCKED;
}
function validateRequired(value, validator, label) {
  const result = validator(value);
  if (!result.ok) throw new TypeError(`Invalid first-cut ${label}: ${result.errors.join(' ')}`);
}

function validateNested(value, errors) {
  appendValidation(errors, validateFirstCutMassLedger(value.massLedger), 'mass ledger');
  if (value.method === FIRST_CUT_METHODS.SIMPLE_SPAN) {
    appendValidation(errors, validateMethodContract(
      value.supportScreening,
      FIRST_CUT_SCHEMAS.SUPPORT_SCREENING,
      ['schema', 'sourceSchema', 'sourceSemanticHash', 'pathCases', 'supportResults', 'sag', 'status'],
      value.status,
    ), 'support screening');
    if (value.beamScreening !== null) errors.push('Simple-span package beamScreening must be null.');
  } else if (value.method === FIRST_CUT_METHODS.CONTINUOUS_BEAM) {
    appendValidation(errors, validateMethodContract(
      value.beamScreening,
      FIRST_CUT_SCHEMAS.BEAM_SCREENING,
      ['schema', 'modelSemanticHash', 'solutionSemanticHash', 'pathCases', 'supportResults', 'sag', 'status'],
      value.status,
    ), 'beam screening');
    if (value.supportScreening !== null) errors.push('Continuous-beam package supportScreening must be null.');
  } else {
    errors.push('Calculation package method is invalid.');
  }
  if (value.sustainedScreening !== null) {
    appendValidation(errors, validateSustainedScreening(value.sustainedScreening), 'sustained screening');
  }
}

function validateMethodContract(value, schema, keys, packageStatus) {
  if (value === null && [FIRST_CUT_STATUSES.BLOCKED, FIRST_CUT_STATUSES.STALE].includes(packageStatus)) {
    return deepFreeze({ ok: true, errors: [] });
  }
  if (value === null) return deepFreeze({ ok: false, errors: ['Required method result is null.'] });
  return validateHashedContract(value, schema, keys);
}

function validateParentHashes(value, errors) {
  const keys = [
    'sourceSemanticHash', 'enrichmentResultSemanticHash', 'modelLoadPrimitiveSemanticHash',
    'pathSemanticHash', 'assumptionSetSemanticHash', 'profileSemanticHash',
  ];
  try {
    assertExactKeys(value, keys, 'Calculation package parent hashes');
    keys.forEach((key) => assertHash(value[key], `Parent hash ${key}`));
  } catch (error) {
    errors.push(error.message);
  }
}

function appendValidation(errors, result, label) {
  if (!result.ok) result.errors.forEach((error) => errors.push(`${label}: ${error}`));
}
