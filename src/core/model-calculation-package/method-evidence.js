import { deepFreeze } from '../shared-piping-model/index.js';
import { ENGINEERING_LEVELS, PACKAGE_LIMITATIONS } from './constants.js';
import { uniqueSorted } from './diagnostics.js';

export function buildMethodEvidence(screening, beam) {
  return deepFreeze([
    screening ? screeningMethod(screening) : null,
    beam ? beamMethod(beam) : null,
  ].filter(Boolean).sort((a, b) => a.methodId.localeCompare(b.methodId)));
}

function screeningMethod(snapshot) {
  const profile = snapshot.profile;
  return deepFreeze({
    methodId: profile.profileId,
    methodVersion: profile.profileVersion,
    engineeringLevel: ENGINEERING_LEVELS.SCREENING,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    profileSemanticHash: snapshot.sourceSemanticHashes.profileSemanticHash,
    formulaIds: collectFormulaIds(snapshot),
    signConvention: 'screenedVerticalForceN is a nonnegative tributary support-force magnitude.',
    assumptions: screeningAssumptions(profile),
    limitations: uniqueSorted([...PACKAGE_LIMITATIONS, 'Only qualified simple acyclic non-branching paths are screened.', 'Springs, gaps, cycles, branches and overhang loads are blocked.']),
    resultSemanticHash: snapshot.sourceSemanticHashes.resultSemanticHash,
    auditSemanticHash: snapshot.sourceSemanticHashes.auditSemanticHash,
  });
}

function beamMethod(snapshot) {
  const profile = snapshot.profile;
  return deepFreeze({
    methodId: profile.profileId,
    methodVersion: profile.profileVersion,
    engineeringLevel: ENGINEERING_LEVELS.BEAM,
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    profileSemanticHash: snapshot.sourceSemanticHashes.profileSemanticHash,
    formulaIds: collectFormulaIds(snapshot),
    signConvention: profile.signConvention,
    assumptions: beamAssumptions(profile),
    limitations: uniqueSorted([...PACKAGE_LIMITATIONS, 'Scalar Euler-Bernoulli vertical bending only.', 'Linear elastic small-displacement response only.', 'Rotations remain free and vertical rigid supports have zero prescribed displacement.']),
    resultSemanticHash: snapshot.sourceSemanticHashes.solutionSemanticHash,
    auditSemanticHash: snapshot.sourceSemanticHashes.auditSemanticHash,
  });
}

function collectFormulaIds(value) {
  const ids = [];
  walk(value, (key, child) => { if (key === 'formulaId' && typeof child === 'string') ids.push(child); });
  return uniqueSorted(ids);
}
function screeningAssumptions(profile) {
  return uniqueSorted([
    `Profile ${profile.profileId}@${profile.profileVersion}.`,
    `Branch policy: ${profile.branchPolicy || profile.topologyPolicy || 'BLOCKED'}.`,
    `Cycle policy: ${profile.cyclePolicy || 'BLOCKED'}.`,
    'Vertical RESTRAINED supports only.',
    'Only retained W10.4 gravity load primitives are projected.',
  ]);
}
function beamAssumptions(profile) {
  return uniqueSorted([
    `Profile ${profile.profileId}@${profile.profileVersion}.`,
    `Kinematic model: ${profile.kinematicModel}.`,
    `Constraint method: ${profile.numericalSolverPolicy?.constraintMethod}.`,
    'Flexural rigidity follows the explicit evidence precedence retained by the profile.',
    'No imposed settlement, shear deformation or geometric stiffness.',
  ]);
}
function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((child) => walk(child, visit));
  if (!value || typeof value !== 'object') return;
  Object.entries(value).forEach(([key, child]) => { visit(key, child); walk(child, visit); });
}
