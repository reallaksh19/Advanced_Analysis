import { deepFreeze } from '../shared-piping-model/index.js';
import { createVerticalBeamSolverAudit } from './audit.js';
import { buildVerticalBeamModel } from './beam-model.js';
import { buildFlexuralPropertyProjection } from './flexural-properties.js';
import { createEulerBernoulliVerticalPathProfile } from './profile.js';
import { solveVerticalBeamModel } from './solution.js';

export function buildVerticalBeamFoundation(inputs, options = {}) {
  const profile = options.profile || createEulerBernoulliVerticalPathProfile(options.profileOptions);
  const flexuralProjection = buildFlexuralPropertyProjection(inputs.sharedModel, inputs.pathModel, profile);
  const beamModel = buildVerticalBeamModel(
    inputs.pathModel, flexuralProjection, inputs.loadCaseSet,
    inputs.loadPrimitiveSet, inputs.modelLoadReadinessAudit, profile,
  );
  return deepFreeze({ profile, flexuralProjection, beamModel });
}

export function runVerticalBeamSolution(foundation) {
  assertFoundation(foundation);
  const solution = solveVerticalBeamModel(foundation.beamModel, foundation.profile);
  const audit = createVerticalBeamSolverAudit(solution);
  return deepFreeze({ ...foundation, solution, audit });
}

function assertFoundation(value) {
  if (!value?.profile?.semanticHash || value?.beamModel?.profile?.semanticHash !== value.profile.semanticHash) {
    throw new TypeError('Vertical-beam foundation profile does not match the beam model.');
  }
  if (value?.beamModel?.flexuralProjectionSemanticHash !== value?.flexuralProjection?.semanticHash) {
    throw new TypeError('Vertical-beam foundation flexural projection does not match the beam model.');
  }
}
