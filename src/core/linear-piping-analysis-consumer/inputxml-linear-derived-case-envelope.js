import { inputXmlDerivedCaseFailure as fail } from './inputxml-linear-derived-case-error.js';
import {
  INPUTXML_ACTION_KEYS as ACTION_KEYS,
  compareAscii,
  forceFieldStaticProjection,
  forceFieldStationProjection,
  requireSameProjection,
  resultStateStaticProjection,
} from './inputxml-linear-derived-result-custody.js';

export function envelopeResultStates(candidateStates) {
  if (!Array.isArray(candidateStates) || candidateStates.length < 2) fail(
    'Envelope recovery requires at least two candidate result states.',
    'INPUTXML_DERIVED_ENVELOPE_INVALID',
  );
  requireSameProjection(
    candidateStates.map((candidate) => resultStateStaticProjection(candidate.state)),
    'envelope candidate result custody',
  );
  return {
    minimum: selectResultState(candidateStates, 'minimum', false),
    maximum: selectResultState(candidateStates, 'maximum', false),
    governingMinimum: selectResultState(candidateStates, 'minimum', true),
    governingMaximum: selectResultState(candidateStates, 'maximum', true),
  };
}

function selectResultState(candidates, mode, selection) {
  const template = candidates[0].state;
  return {
    displacements: template.displacements.map((row, index) => selectDof(
      row, candidates, (item) => item.state.displacements[index].value, mode, selection,
    )),
    reactions: template.reactions.map((row, index) => selectDof(
      row, candidates, (item) => item.state.reactions[index].value, mode, selection,
    )),
    elementResults: template.elementResults.map((row, index) => selectElement(
      row, index, candidates, mode, selection,
    )),
    sourceStations: template.sourceStations.map((row, index) => selectStation(
      row, index, candidates, mode, selection,
    )),
  };
}

function selectDof(template, candidates, getValue, mode, selection) {
  const selected = selectScalar(candidates, getValue, mode);
  return {
    nodeId: template.nodeId,
    dof: template.dof,
    ...(selection ? { candidateId: selected.candidateId } : { value: selected.value }),
  };
}

function selectElement(template, index, candidates, mode, selection) {
  const { localActions, globalActions, forceField, sourceElementAuthorities,
    limitationCodes, ...staticFields } = template;
  return {
    ...structuredClone(staticFields),
    limitationCodes: unionAscii(candidates.flatMap((candidate) => (
      candidate.state.elementResults[index].limitationCodes
    ))),
    candidateElementAuthorities: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      sourceElementAuthorities: structuredClone(
        candidate.state.elementResults[index].sourceElementAuthorities,
      ),
    })),
    localActions: selectActionEnds(
      candidates, (item) => item.state.elementResults[index].localActions, mode, selection,
    ),
    globalActions: selectActionEnds(
      candidates, (item) => item.state.elementResults[index].globalActions, mode, selection,
    ),
    forceField: {
      ...structuredClone(forceFieldStaticProjection(forceField)),
      stations: forceField.stations.map((station, stationIndex) => ({
        ...structuredClone(forceFieldStationProjection(station)),
        action: selectAction(
          candidates,
          (item) => item.state.elementResults[index].forceField.stations[stationIndex].action,
          mode,
          selection,
        ),
      })),
    },
  };
}

function selectStation(template, index, candidates, mode, selection) {
  const { jointOnElementLocalAction, jointOnElementGlobalAction,
    internalSectionLocalAction, limitationCodes, ...staticFields } = template;
  const selectNullable = (key) => template[key] === null ? null : selectAction(
    candidates, (item) => item.state.sourceStations[index][key], mode, selection,
  );
  return {
    ...structuredClone(staticFields),
    limitationCodes: unionAscii(candidates.flatMap((candidate) => (
      candidate.state.sourceStations[index].limitationCodes
    ))),
    jointOnElementLocalAction: selectNullable('jointOnElementLocalAction'),
    jointOnElementGlobalAction: selectNullable('jointOnElementGlobalAction'),
    internalSectionLocalAction: selectNullable('internalSectionLocalAction'),
  };
}

function selectActionEnds(candidates, getActions, mode, selection) {
  return {
    I: selectAction(candidates, (item) => getActions(item).I, mode, selection),
    J: selectAction(candidates, (item) => getActions(item).J, mode, selection),
  };
}

function selectAction(candidates, getAction, mode, selection) {
  return Object.fromEntries(ACTION_KEYS.map((key) => {
    const selected = selectScalar(candidates, (item) => getAction(item)[key], mode);
    return [key, selection ? selected.candidateId : selected.value];
  }));
}

function selectScalar(candidates, getValue, mode) {
  return candidates.reduce((selected, candidate) => {
    const value = getValue(candidate);
    if (!selected || (mode === 'minimum' ? value < selected.value : value > selected.value)
      || (value === selected.value
        && compareAscii(candidate.candidateId, selected.candidateId) < 0)) {
      return { value, candidateId: candidate.candidateId };
    }
    return selected;
  }, null);
}

function unionAscii(values) {
  return [...new Set(values.map(String))].sort(compareAscii);
}
