import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';
import {
  INPUTXML_ACTION_KEYS as ACTION_KEYS,
  compareAscii,
  elementStaticProjection,
  forceFieldStaticProjection,
  forceFieldStationProjection,
  requireSameIds,
  requireSameProjection,
  sourceStationProjection,
} from './inputxml-linear-derived-result-custody.js';

export function combineRecoveredResultState(terms, recoveredById) {
  const sources = terms.map((term) => ({
    term,
    recovered: recoveredById.get(term.recoveredCaseId),
  }));
  return {
    displacements: combineDofRows(sources, 'displacements'),
    reactions: combineDofRows(sources, 'reactions'),
    elementResults: combineElements(sources),
    sourceStations: combineStations(sources),
  };
}

export function absoluteResultState(state) {
  return {
    displacements: state.displacements.map((row) => ({ ...row, value: Math.abs(row.value) })),
    reactions: state.reactions.map((row) => ({ ...row, value: Math.abs(row.value) })),
    elementResults: state.elementResults.map((row) => ({
      ...structuredClone(row),
      localActions: absoluteActionEnds(row.localActions),
      globalActions: absoluteActionEnds(row.globalActions),
      forceField: {
        ...structuredClone(row.forceField),
        stations: row.forceField.stations.map((station) => ({
          ...structuredClone(station), action: absoluteAction(station.action),
        })),
      },
    })),
    sourceStations: state.sourceStations.map((row) => ({
      ...structuredClone(row),
      jointOnElementLocalAction: nullableAction(row.jointOnElementLocalAction, absoluteAction),
      jointOnElementGlobalAction: nullableAction(row.jointOnElementGlobalAction, absoluteAction),
      internalSectionLocalAction: nullableAction(row.internalSectionLocalAction, absoluteAction),
    })),
  };
}

function combineDofRows(sources, field) {
  const maps = sources.map(({ recovered }) => new Map(recovered[field]
    .map((row) => [`${row.nodeId}:${row.dof}`, row])));
  const ids = [...maps[0].keys()].sort(compareAscii);
  requireSameIds(maps, ids, field);
  return ids.map((id) => {
    const template = maps[0].get(id);
    return {
      nodeId: template.nodeId,
      dof: template.dof,
      value: cleanNumber(sources.reduce((sum, source, index) => (
        sum + source.term.factor * maps[index].get(id).value
      ), 0)),
    };
  });
}

function combineElements(sources) {
  const maps = sources.map(({ recovered }) => new Map(recovered.elementResults
    .map((row) => [row.elementId, row])));
  const ids = [...maps[0].keys()].sort(compareAscii);
  requireSameIds(maps, ids, 'elementResults');
  return ids.map((elementId) => {
    const rows = maps.map((map) => map.get(elementId));
    requireSameProjection(rows.map(elementStaticProjection), `element ${elementId}`);
    const template = rows[0];
    const { localActions, globalActions, forceField, loadActionCustody,
      frameElementSemanticHash, limitationCodes, ...staticFields } = template;
    const stationRows = rows.map((row) => row.forceField.stations);
    requireSameProjection(
      stationRows.map((stations) => stations.map(forceFieldStationProjection)),
      `element ${elementId} force-field stations`,
    );
    return {
      ...structuredClone(staticFields),
      limitationCodes: unionAscii(rows.flatMap((row) => row.limitationCodes)),
      sourceElementAuthorities: sources.map((source, index) => ({
        recoveredCaseId: source.recovered.recoveredCaseId,
        factor: source.term.factor,
        frameElementSemanticHash: rows[index].frameElementSemanticHash,
        loadActionCustodyHash: semanticHash(rows[index].loadActionCustody),
        distributedPrimitiveIds: [...rows[index].loadActionCustody.distributedPrimitiveIds],
        temperaturePrimitiveId: rows[index].loadActionCustody.temperaturePrimitiveId,
        codeOnlyPrimitiveIds: [...rows[index].loadActionCustody.codeOnlyPrimitiveIds],
      })),
      localActions: combineActionEnds(rows.map((row) => row.localActions), sources),
      globalActions: combineActionEnds(rows.map((row) => row.globalActions), sources),
      forceField: {
        ...structuredClone(forceFieldStaticProjection(forceField)),
        stations: stationRows[0].map((station, stationIndex) => ({
          ...structuredClone(forceFieldStationProjection(station)),
          action: combineActions(
            stationRows.map((stations) => stations[stationIndex].action), sources,
          ),
        })),
      },
    };
  });
}

function combineStations(sources) {
  const maps = sources.map(({ recovered }) => new Map(recovered.sourceStations
    .map((row) => [row.stationId, row])));
  const ids = [...maps[0].keys()].sort(compareAscii);
  requireSameIds(maps, ids, 'sourceStations');
  return ids.map((stationId) => {
    const rows = maps.map((map) => map.get(stationId));
    requireSameProjection(rows.map(sourceStationProjection), `source station ${stationId}`);
    const template = rows[0];
    const { jointOnElementLocalAction, jointOnElementGlobalAction,
      internalSectionLocalAction, limitationCodes, ...staticFields } = template;
    return {
      ...structuredClone(staticFields),
      limitationCodes: unionAscii(rows.flatMap((row) => row.limitationCodes)),
      jointOnElementLocalAction: combineNullableActions(
        rows.map((row) => row.jointOnElementLocalAction), sources,
      ),
      jointOnElementGlobalAction: combineNullableActions(
        rows.map((row) => row.jointOnElementGlobalAction), sources,
      ),
      internalSectionLocalAction: combineNullableActions(
        rows.map((row) => row.internalSectionLocalAction), sources,
      ),
    };
  });
}

function combineActionEnds(rows, sources) {
  return {
    I: combineActions(rows.map((row) => row.I), sources),
    J: combineActions(rows.map((row) => row.J), sources),
  };
}

function combineActions(actions, sources) {
  return Object.fromEntries(ACTION_KEYS.map((key) => [key, cleanNumber(
    sources.reduce((sum, source, index) => sum + source.term.factor * actions[index][key], 0),
  )]));
}

function combineNullableActions(actions, sources) {
  const nullCount = actions.filter((row) => row === null).length;
  if (nullCount === actions.length) return null;
  if (nullCount !== 0) fail(
    'Source-station action availability differs across recovered cases.',
    'INPUTXML_DERIVED_STATION_MISMATCH',
  );
  return combineActions(actions, sources);
}

function absoluteActionEnds(value) {
  return { I: absoluteAction(value.I), J: absoluteAction(value.J) };
}

function absoluteAction(value) {
  return Object.fromEntries(ACTION_KEYS.map((key) => [key, Math.abs(value[key])]));
}

function nullableAction(value, mapper) {
  return value === null ? null : mapper(value);
}

function unionAscii(values) {
  return [...new Set(values.map(String))].sort(compareAscii);
}

function cleanNumber(value) {
  return Object.is(value, -0) || Math.abs(value) < Number.EPSILON ? 0 : value;
}
