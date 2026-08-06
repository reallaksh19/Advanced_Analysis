import { isPlainRecord } from '../shared-piping-model/immutable.js';
import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';

const ACTION_KEYS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);

export function requireDerivedResults(value) {
  const kind = value.algebra.kind;
  if (kind === 'LINEAR') {
    requireResultState(value.resultState, 'resultState', false);
    requireNull(value.rangeMagnitude, 'rangeMagnitude');
    requireNull(value.envelope, 'envelope');
  } else if (kind === 'RANGE') {
    requireResultState(value.resultState, 'resultState', false);
    requireResultState(value.rangeMagnitude, 'rangeMagnitude', true);
    requireNull(value.envelope, 'envelope');
  } else {
    requireNull(value.resultState, 'resultState');
    requireNull(value.rangeMagnitude, 'rangeMagnitude');
    requireEnvelope(value.envelope);
  }
}

function requireResultState(state, field, nonnegative) {
  requireRecord(state, field);
  for (const key of ['displacements', 'reactions', 'elementResults', 'sourceStations']) {
    requireArray(state[key], `${field}.${key}`);
  }
  requireDofRows(state.displacements, `${field}.displacements`, nonnegative);
  requireDofRows(state.reactions, `${field}.reactions`, nonnegative);
  requireUnique(state.elementResults, 'elementId', `${field}.elementResults`);
  state.elementResults.forEach((row, index) => {
    requireRecord(row, `${field}.elementResults[${index}]`);
    requireActionEnds(row.localActions, `${field}.elementResults[${index}].localActions`, nonnegative, false);
    requireActionEnds(row.globalActions, `${field}.elementResults[${index}].globalActions`, nonnegative, false);
    requireRecord(row.forceField, `${field}.elementResults[${index}].forceField`);
    requireArray(row.forceField.stations, `${field}.elementResults[${index}].forceField.stations`);
    row.forceField.stations.forEach((station, stationIndex) => requireAction(
      station.action,
      `${field}.elementResults[${index}].forceField.stations[${stationIndex}].action`,
      nonnegative,
      false,
    ));
  });
  requireUnique(state.sourceStations, 'stationId', `${field}.sourceStations`);
  state.sourceStations.forEach((row, index) => {
    for (const key of [
      'jointOnElementLocalAction', 'jointOnElementGlobalAction',
      'internalSectionLocalAction',
    ]) if (row[key] !== null) requireAction(
      row[key], `${field}.sourceStations[${index}].${key}`, nonnegative, false,
    );
  });
}

function requireEnvelope(value) {
  requireRecord(value, 'envelope');
  requireResultState(value.minimum, 'envelope.minimum', false);
  requireResultState(value.maximum, 'envelope.maximum', false);
  requireSelectionState(value.governingMinimum, 'envelope.governingMinimum');
  requireSelectionState(value.governingMaximum, 'envelope.governingMaximum');
}

function requireSelectionState(state, field) {
  requireRecord(state, field);
  for (const key of ['displacements', 'reactions', 'elementResults', 'sourceStations']) {
    requireArray(state[key], `${field}.${key}`);
  }
  state.displacements.forEach((row, index) => requireString(
    row.candidateId, `${field}.displacements[${index}].candidateId`,
  ));
  state.reactions.forEach((row, index) => requireString(
    row.candidateId, `${field}.reactions[${index}].candidateId`,
  ));
  state.elementResults.forEach((row, index) => {
    requireActionEnds(row.localActions, `${field}.elementResults[${index}].localActions`, false, true);
    requireActionEnds(row.globalActions, `${field}.elementResults[${index}].globalActions`, false, true);
    row.forceField.stations.forEach((station, stationIndex) => requireAction(
      station.action,
      `${field}.elementResults[${index}].forceField.stations[${stationIndex}].action`,
      false,
      true,
    ));
  });
  state.sourceStations.forEach((row, index) => {
    for (const key of [
      'jointOnElementLocalAction', 'jointOnElementGlobalAction',
      'internalSectionLocalAction',
    ]) if (row[key] !== null) requireAction(
      row[key], `${field}.sourceStations[${index}].${key}`, false, true,
    );
  });
}

function requireDofRows(rows, field, nonnegative) {
  const ids = new Set();
  rows.forEach((row, index) => {
    requireRecord(row, `${field}[${index}]`);
    requireString(row.nodeId, `${field}[${index}].nodeId`);
    requireString(row.dof, `${field}[${index}].dof`);
    requireFinite(row.value, `${field}[${index}].value`);
    if (nonnegative && row.value < 0) fail(
      `${field}[${index}].value must be nonnegative.`,
      'INPUTXML_DERIVED_RANGE_MAGNITUDE_INVALID',
    );
    const id = `${row.nodeId}:${row.dof}`;
    if (ids.has(id)) fail(`${field} duplicates ${id}.`, 'INPUTXML_DERIVED_DUPLICATE');
    ids.add(id);
  });
}

function requireActionEnds(value, field, nonnegative, selection) {
  requireRecord(value, field);
  requireAction(value.I, `${field}.I`, nonnegative, selection);
  requireAction(value.J, `${field}.J`, nonnegative, selection);
}

function requireAction(value, field, nonnegative, selection) {
  requireRecord(value, field);
  ACTION_KEYS.forEach((key) => {
    if (selection) requireString(value[key], `${field}.${key}`);
    else {
      requireFinite(value[key], `${field}.${key}`);
      if (nonnegative && value[key] < 0) fail(
        `${field}.${key} must be nonnegative.`,
        'INPUTXML_DERIVED_RANGE_MAGNITUDE_INVALID',
      );
    }
  });
}

function requireUnique(rows, key, field) {
  const ids = new Set();
  rows.forEach((row, index) => {
    requireRecord(row, `${field}[${index}]`);
    requireString(row[key], `${field}[${index}].${key}`);
    if (ids.has(row[key])) fail(
      `${field} contains duplicate ${row[key]}.`, 'INPUTXML_DERIVED_DUPLICATE',
    );
    ids.add(row[key]);
  });
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) fail(
    `${field} must be a record.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
  );
  return value;
}

function requireArray(value, field) {
  if (!Array.isArray(value)) fail(
    `${field} must be an array.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
  );
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(
    `${field} must be a non-empty string.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
  );
}

function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(
    `${field} must be finite.`, 'INPUTXML_DERIVED_NONFINITE',
  );
}

function requireNull(value, field) {
  if (value !== null) fail(
    `${field} must be null for this algebra.`, 'INPUTXML_DERIVED_SCHEMA_INVALID',
  );
}
