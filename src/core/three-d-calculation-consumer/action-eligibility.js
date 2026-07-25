import { deepFreeze } from '../shared-piping-model/index.js';
import { validateThreeDCalculationReviewModel } from './model.js';

const ACTION_KEYS = Object.freeze([
  'EXPORT_SHARED_MODEL',
  'REBUILD_TOPOLOGY_EXACT',
  'EXPORT_TOPOLOGY',
  'REBUILD_SUPPORT_EVIDENCE',
  'EXPORT_SUPPORT_RESTRAINT',
  'REBUILD_VERTICAL_BEAM_MODEL',
  'SOLVE_VERTICAL_BEAM',
  'EXPORT_VERTICAL_BEAM',
]);

export function assessThreeDCalculationActions(reviewModel) {
  if (!validateThreeDCalculationReviewModel(reviewModel).ok) return unavailableActions();
  const contracts = reviewModel.sourceContext.contracts;
  const shared = present(contracts, ['sharedModel']);
  const topology = present(contracts, ['topologyGraph','topologyAudit']);
  const supports = present(contracts, [
    'supportAttachmentModel','supportAttachmentAudit',
    'restraintCapabilityModel','restraintCapabilityAudit',
  ]);
  return deepFreeze({
    EXPORT_SHARED_MODEL: shared,
    REBUILD_TOPOLOGY_EXACT: shared,
    EXPORT_TOPOLOGY: topology,
    REBUILD_SUPPORT_EVIDENCE: shared && topology,
    EXPORT_SUPPORT_RESTRAINT: supports,
    REBUILD_VERTICAL_BEAM_MODEL: beamBuildReady(contracts),
    SOLVE_VERTICAL_BEAM: present(contracts, ['verticalBeamModel']),
    EXPORT_VERTICAL_BEAM: present(contracts, ['verticalBeamModel','verticalBeamSolution','verticalBeamSolverAudit']),
  });
}

function beamBuildReady(contracts) {
  return present(contracts, [
    'verticalLoadPathModel',
    'loadCaseSet',
    'loadPrimitiveSet',
    'modelLoadReadinessAudit',
    'flexuralPropertyProjection',
  ]);
}

function present(contracts, keys) {
  return keys.every((key) => Boolean(contracts[key]));
}

function unavailableActions() {
  return deepFreeze(Object.fromEntries(ACTION_KEYS.map((key) => [key, false])));
}
