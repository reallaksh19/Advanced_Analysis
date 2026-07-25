import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { LOAD_CASE_IDS, LOAD_CASE_SET_SCHEMA } from './constants.js';

const CASES = Object.freeze({
  EMPTY: caseRecord('EMPTY', ['PIPE_METAL', 'INSULATION', 'COMPONENT_MASS'], ['FLUID']),
  HYD: caseRecord('HYD', ['PIPE_METAL', 'INSULATION', 'COMPONENT_MASS', 'HYD_FLUID'], ['OPE_FLUID']),
  OPE: caseRecord('OPE', ['PIPE_METAL', 'INSULATION', 'COMPONENT_MASS', 'OPE_FLUID'], ['HYD_FLUID']),
});

export function createDefaultLoadCaseSet(order = LOAD_CASE_IDS) {
  const loadCases = [...order].map((id) => CASES[id]).filter(Boolean)
    .sort((left, right) => left.loadCaseId.localeCompare(right.loadCaseId));
  const base = { schema: LOAD_CASE_SET_SCHEMA, loadCases, diagnostics: [], summary: { caseCount: loadCases.length } };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateLoadCaseSet(value) {
  const errors = [];
  if (value?.schema !== LOAD_CASE_SET_SCHEMA) errors.push('Invalid load-case set schema.');
  const ids = (value?.loadCases || []).map((row) => stringValue(row?.loadCaseId));
  if (new Set(ids).size !== ids.length) errors.push('Load-case IDs must be unique.');
  LOAD_CASE_IDS.forEach((id) => { if (!ids.includes(id)) errors.push(`Missing load case ${id}.`); });
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Load-case set semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function caseRecord(id, includedMassSources, excludedMassSources) {
  return deepFreeze({
    loadCaseId: id,
    name: id,
    caseType: id,
    includedMassSources: [...includedMassSources].sort(),
    excludedMassSources: [...excludedMassSources].sort(),
    qualification: 'DEFINED',
    diagnostics: [],
  });
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
