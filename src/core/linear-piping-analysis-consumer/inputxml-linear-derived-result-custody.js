import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';

export const INPUTXML_ACTION_KEYS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);

export function resultStateStaticProjection(state) {
  return {
    displacements: state.displacements.map(({ value, ...row }) => row),
    reactions: state.reactions.map(({ value, ...row }) => row),
    elementResults: state.elementResults.map(elementStaticProjection),
    sourceStations: state.sourceStations.map(sourceStationProjection),
  };
}

export function elementStaticProjection(row) {
  const { localActions, globalActions, forceField, loadActionCustody,
    frameElementSemanticHash, sourceElementAuthorities, limitationCodes,
    ...staticFields } = row;
  return {
    ...staticFields,
    forceField: {
      ...forceFieldStaticProjection(forceField),
      stations: forceField.stations.map(forceFieldStationProjection),
    },
  };
}

export function forceFieldStaticProjection(value) {
  const { stations, ...staticFields } = value;
  return staticFields;
}

export function forceFieldStationProjection(value) {
  const { action, ...staticFields } = value;
  return staticFields;
}

export function sourceStationProjection(value) {
  const { jointOnElementLocalAction, jointOnElementGlobalAction,
    internalSectionLocalAction, limitationCodes, ...staticFields } = value;
  return staticFields;
}

export function requireSameIds(maps, expected, field) {
  maps.forEach((map) => {
    const ids = [...map.keys()].sort(compareAscii);
    if (semanticHash(ids) !== semanticHash(expected)) fail(
      `${field} identity differs across recovered cases.`,
      'INPUTXML_DERIVED_RESULT_LEDGER_MISMATCH',
    );
  });
}

export function requireSameProjection(values, field) {
  const expected = semanticHash(values[0]);
  if (values.some((value) => semanticHash(value) !== expected)) fail(
    `${field} differs across recovered cases.`,
    'INPUTXML_DERIVED_RESULT_LEDGER_MISMATCH',
  );
}

export function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
