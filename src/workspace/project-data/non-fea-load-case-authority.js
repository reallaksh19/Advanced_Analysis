import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep, isRecord, stringValue } from '../dataset-utils.js';

export const NON_FEA_LOAD_CASE_AUTHORITY_SCHEMA = 'non-fea-load-case-authority/v1';
export const NON_FEA_CANONICAL_LOAD_CASE_IDS = Object.freeze(['EMPTY', 'OPE', 'HYD']);

/** Project Data is the sole authority for the active canonical load-case set. */
export function createNonFeaLoadCaseAuthority(profile) {
  if (!isRecord(profile)) throw new TypeError('Load-case authority requires a Project Data profile.');
  const entry = profile?.loadCalculation?.activeLoadCases;
  const blockers = [];
  let approvedLoadCases = [];

  if (!entry || !Object.hasOwn(entry, 'value')) {
    blockers.push(issue('ACTIVE_LOAD_CASES_MISSING', 'loadCalculation.activeLoadCases', 'Project Data active Load Cases are missing.'));
  } else if (entry.approved !== true || !isRecord(entry.evidence) || !stringValue(entry.evidence.source)) {
    blockers.push(issue('ACTIVE_LOAD_CASES_NOT_APPROVED', 'loadCalculation.activeLoadCases', 'Active Load Cases require approved Project Data source evidence.'));
  } else if (!Array.isArray(entry.value) || entry.value.length === 0) {
    blockers.push(issue('ACTIVE_LOAD_CASES_EMPTY', 'loadCalculation.activeLoadCases', 'At least one active Load Case is required.'));
  } else {
    const supplied = [...new Set(entry.value.map((value) => stringValue(value).toUpperCase()).filter(Boolean))];
    const unsupported = supplied.filter((value) => !NON_FEA_CANONICAL_LOAD_CASE_IDS.includes(value)).sort();
    if (unsupported.length) {
      blockers.push(issue('ACTIVE_LOAD_CASE_UNKNOWN', 'loadCalculation.activeLoadCases', `Unknown canonical Load Cases: ${unsupported.join(', ')}.`));
    }
    approvedLoadCases = NON_FEA_CANONICAL_LOAD_CASE_IDS.filter((value) => supplied.includes(value));
  }

  const base = {
    schema: NON_FEA_LOAD_CASE_AUTHORITY_SCHEMA,
    projectDataRevision: Number.isInteger(profile.revision) ? profile.revision : null,
    state: blockers.length ? 'BLOCKED' : 'READY',
    approvedLoadCases: blockers.length ? [] : approvedLoadCases,
    evidenceSource: blockers.length ? null : stringValue(entry.evidence.source),
    blockers: blockers.sort((left, right) => `${left.code}|${left.path}`.localeCompare(`${right.code}|${right.path}`)),
  };
  return freezeDeep({ ...base, semanticHash: semanticHash(base) });
}

export function assertRequestedLoadCasesAuthorized(authority, requestedLoadCases) {
  requireAuthority(authority);
  if (!Array.isArray(requestedLoadCases)) throw codedError('Requested Load Cases must be an array.', 'LOAD_CASE_REQUEST_INVALID');
  const supplied = [...new Set(requestedLoadCases.map((value) => stringValue(value).toUpperCase()).filter(Boolean))];
  const unknown = supplied.filter((value) => !NON_FEA_CANONICAL_LOAD_CASE_IDS.includes(value)).sort();
  const unauthorized = supplied.filter((value) => (
    NON_FEA_CANONICAL_LOAD_CASE_IDS.includes(value)
    && !authority.approvedLoadCases.includes(value)
  ));
  const rejected = [...unknown, ...unauthorized];
  if (rejected.length) {
    const error = codedError(
      `Requested Load Cases are outside approved Project Data authority: ${rejected.join(', ')}.`,
      'LOAD_CASE_NOT_PROJECT_DATA_APPROVED',
    );
    error.details = rejected;
    throw error;
  }
  return freezeDeep(NON_FEA_CANONICAL_LOAD_CASE_IDS.filter((value) => supplied.includes(value)));
}

export function assertEmpiricalCaseConfigurationsAuthorized(authority, caseConfigurations) {
  requireAuthority(authority);
  if (!Array.isArray(caseConfigurations)) throw codedError('Empirical case configurations must be an array.', 'LOAD_CASE_CONFIGURATION_INVALID');
  const primitiveCases = [...new Set(caseConfigurations
    .map((row) => row?.weightPrimitiveCaseId)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => stringValue(value).toUpperCase())
    .filter(Boolean))];
  return assertRequestedLoadCasesAuthorized(authority, primitiveCases);
}

function requireAuthority(authority) {
  if (!isRecord(authority) || authority.schema !== NON_FEA_LOAD_CASE_AUTHORITY_SCHEMA) {
    throw codedError(`Expected ${NON_FEA_LOAD_CASE_AUTHORITY_SCHEMA}.`, 'LOAD_CASE_AUTHORITY_INVALID');
  }
  if (authority.state !== 'READY') {
    const error = codedError('Project Data Load Case authority is not ready.', 'LOAD_CASE_AUTHORITY_NOT_READY');
    error.details = authority.blockers || [];
    throw error;
  }
}

function issue(code, path, message) {
  return freezeDeep({ code, path, message });
}
function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
