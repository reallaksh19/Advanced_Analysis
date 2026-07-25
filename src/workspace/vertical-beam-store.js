import {
  validateFlexuralPropertyProjection, validateVerticalBeamModel,
  validateVerticalBeamSolution, validateVerticalBeamSolverAudit,
  validateVerticalBeamSolverProfile,
} from '../core/vertical-beam-solver/index.js';

let profile = null;
let flexuralProjection = null;
let beamModel = null;
let solution = null;
let audit = null;

export const VerticalBeamStore = Object.freeze({
  setFoundation(nextProfile, nextProjection, nextModel) {
    assertValid(validateVerticalBeamSolverProfile(nextProfile), 'profile');
    assertValid(validateFlexuralPropertyProjection(nextProjection), 'flexural projection');
    assertValid(validateVerticalBeamModel(nextModel), 'beam model');
    assertFoundationLinks(nextProfile, nextProjection, nextModel);
    profile = nextProfile; flexuralProjection = nextProjection; beamModel = nextModel;
    solution = null; audit = null;
  },
  setSolution(nextSolution, nextAudit) {
    assertValid(validateVerticalBeamSolution(nextSolution), 'solution');
    assertValid(validateVerticalBeamSolverAudit(nextAudit), 'solver audit');
    assertSolutionLinks(nextSolution, nextAudit);
    solution = nextSolution; audit = nextAudit;
  },
  clearSolution() { solution = null; audit = null; },
  clear() { profile = null; flexuralProjection = null; beamModel = null; solution = null; audit = null; },
  getProfile() { return profile; },
  getFlexuralProjection() { return flexuralProjection; },
  getBeamModel() { return beamModel; },
  getSolution() { return solution; },
  getAudit() { return audit; },
  getSnapshot() { return Object.freeze({ profile, flexuralProjection, beamModel, solution, audit }); },
});

function assertFoundationLinks(nextProfile, nextProjection, nextModel) {
  if (nextProjection.profileSemanticHash !== nextProfile.semanticHash) {
    throw new TypeError('Vertical-beam flexural projection does not match the profile.');
  }
  if (nextModel.profile?.semanticHash !== nextProfile.semanticHash) {
    throw new TypeError('Vertical-beam model does not match the profile.');
  }
  if (nextModel.flexuralProjectionSemanticHash !== nextProjection.semanticHash) {
    throw new TypeError('Vertical-beam model does not match the flexural projection.');
  }
}

function assertSolutionLinks(nextSolution, nextAudit) {
  if (!beamModel || nextSolution.beamModelSemanticHash !== beamModel.semanticHash) {
    throw new TypeError('Vertical-beam solution does not match the active model.');
  }
  if (nextAudit.solutionSemanticHash !== nextSolution.semanticHash) {
    throw new TypeError('Vertical-beam solver audit does not match the solution.');
  }
}

function assertValid(validation, label) {
  if (!validation.ok) throw new TypeError(`Invalid vertical-beam ${label}: ${validation.errors.join(' ')}`);
}
