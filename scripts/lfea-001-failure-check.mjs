import assert from 'node:assert/strict';
import { qualifyContinuumModel, solveContinuumModel } from '../src/core/element-fea/index.js';
import {
  clone,
  edgeTraction,
  handCheckModel,
  loadCase,
  node,
  partiallyPrescribedModel,
  prescribed,
  restraint,
  squarePatch,
  unrestrainedModel,
} from './lfea-001-fixtures.mjs';

const rejected = (model, status = 'REJECTED_INVALID', loadCaseIdentity) => {
  const result = solveContinuumModel(model, loadCaseIdentity);
  assert.equal(result.status, status, JSON.stringify(result));
  assert.equal(result.qualifiedResults, null);
  for (const field of ['nodalDisplacements', 'reactions', 'elementStrains', 'elementStresses', 'strainEnergy']) {
    assert.equal(Object.hasOwn(result, field), false);
  }
  return result;
};

const disconnected = handCheckModel();
disconnected.nodes.push(node('N4', 4, 4));
rejected(disconnected);
rejected(unrestrainedModel(), 'REJECTED_SINGULAR');

const zeroArea = handCheckModel(); zeroArea.nodes[2].x = 200; zeroArea.nodes[2].y = 0; rejected(zeroArea);
const inverted = handCheckModel(); inverted.elements[0].nodeIds = ['N1', 'N3', 'N2']; rejected(inverted);
const repeatedNode = handCheckModel(); repeatedNode.elements[0].nodeIds = ['N1', 'N2', 'N2']; rejected(repeatedNode);
const missingNode = handCheckModel(); missingNode.elements[0].nodeIds = ['N1', 'N2', 'MISSING']; rejected(missingNode);
const unsupportedElement = handCheckModel(); unsupportedElement.elements[0].type = 'Q4'; rejected(unsupportedElement);

const invalidE = handCheckModel(); invalidE.materials[0].E = 0; rejected(invalidE);
const invalidNuHigh = handCheckModel(); invalidNuHigh.materials[0].nu = 0.5; rejected(invalidNuHigh);
const invalidNuLow = handCheckModel(); invalidNuLow.materials[0].nu = -1; rejected(invalidNuLow);
const invalidThickness = handCheckModel(); invalidThickness.elements[0].thickness = 0; rejected(invalidThickness);
const planeStrainThickness = handCheckModel();
planeStrainThickness.solverProfile.formulation = 'PLANE_STRAIN';
planeStrainThickness.solverProfile.profileIdentity = 'plane-strain-profile';
planeStrainThickness.solverProfile.vonMisesConvention = 'THREE_DIMENSIONAL_WITH_RECOVERED_SIGMA_Z';
planeStrainThickness.solverProfileIdentity = 'plane-strain-profile';
rejected(planeStrainThickness);

for (const mutate of [
  (value) => { value.nodes[0].sourceSemanticHash = 'stale'; },
  (value) => { value.materials[0].sourceSemanticHash = 'stale'; },
  (value) => { value.elements[0].sourceSemanticHash = 'stale'; },
  (value) => { value.prescribedDisplacements[0].sourceSemanticHash = 'stale'; },
  (value) => { value.loadCases[0].sourceSemanticHash = 'stale'; },
  (value) => { value.sourceReferences[0].sourceSemanticHash = 'stale'; },
]) {
  const value = handCheckModel(); mutate(value); rejected(value);
}
const staleRestraint = partiallyPrescribedModel(); staleRestraint.restraints[0].sourceSemanticHash = 'stale'; rejected(staleRestraint);
const staleNodal = partiallyPrescribedModel(); staleNodal.loadCases[0].nodalForces = [{ loadId: 'F1', nodeId: 'N3', fx: 1, fy: 0, sourceSemanticHash: 'stale' }]; rejected(staleNodal);
const staleEdge = partiallyPrescribedModel(); staleEdge.loadCases[0].edgeLoads = [edgeTraction('T1', 'E1', ['N2', 'N3'], 1, 0)]; staleEdge.loadCases[0].edgeLoads[0].sourceSemanticHash = 'stale'; rejected(staleEdge);

const duplicateNode = handCheckModel(); duplicateNode.nodes.push(clone(duplicateNode.nodes[0])); rejected(duplicateNode);
const duplicateConstraint = handCheckModel(); duplicateConstraint.prescribedDisplacements[1].constraintId = duplicateConstraint.prescribedDisplacements[0].constraintId; rejected(duplicateConstraint);
const crossConstraintIdentity = partiallyPrescribedModel(); crossConstraintIdentity.prescribedDisplacements[0].constraintId = crossConstraintIdentity.restraints[0].constraintId; rejected(crossConstraintIdentity);
const contradictoryDof = partiallyPrescribedModel(); contradictoryDof.prescribedDisplacements.push(prescribed('P2', 'N2', 'UX', 0.02)); rejected(contradictoryDof);
const fixedAndPrescribed = partiallyPrescribedModel(); fixedAndPrescribed.restraints.push(restraint('R4', 'N2', 'UX')); rejected(fixedAndPrescribed);
const nonzeroRestraint = partiallyPrescribedModel(); nonzeroRestraint.restraints[0].value = 1; rejected(nonzeroRestraint);
const signedAreaMismatch = handCheckModel(); signedAreaMismatch.elements[0].signedArea = 1; rejected(signedAreaMismatch);

const nonfiniteCoordinate = handCheckModel(); nonfiniteCoordinate.nodes[0].x = Number.NaN; rejected(nonfiniteCoordinate);
const numericString = handCheckModel(); numericString.nodes[0].x = '0'; rejected(numericString);
const nonfiniteLoad = partiallyPrescribedModel(); nonfiniteLoad.loadCases[0].nodalForces = [{ loadId: 'F1', nodeId: 'N3', fx: Number.POSITIVE_INFINITY, fy: 0, sourceSemanticHash: nonfiniteLoad.sourceSemanticHash }]; rejected(nonfiniteLoad);
const unknownPhysicsField = handCheckModel(); unknownPhysicsField.loadCases[0].nodalForces = [{ loadId: 'F-UNKNOWN', nodeId: 'N1', fx: 0, fy: 0, fz: 1, sourceSemanticHash: unknownPhysicsField.sourceSemanticHash }]; rejected(unknownPhysicsField);

const wrongProfileIdentity = handCheckModel(); wrongProfileIdentity.solverProfileIdentity = 'wrong'; rejected(wrongProfileIdentity);
const missingProfileConvention = handCheckModel(); delete missingProfileConvention.solverProfile.shearConvention; rejected(missingProfileConvention);
const badOrder = handCheckModel(); badOrder.solverProfile.dofOrder = ['UY', 'UX']; rejected(badOrder);
const capacity = handCheckModel(); capacity.solverProfile.referenceBackendMaxDofs = 4; rejected(capacity);
const hashMismatch = handCheckModel(); hashMismatch.semanticHash = 'fnv1a64:0000000000000000'; rejected(hashMismatch);

const multipleCases = handCheckModel(); multipleCases.loadCases.push(loadCase('LC2'));
rejected(multipleCases);
assert.equal(solveContinuumModel(multipleCases, 'LC2').status, 'QUALIFIED');
rejected(multipleCases, 'REJECTED_INVALID', 'MISSING');

const patch = squarePatch((x, y) => [0.01 * x, 0.01 * y]);
patch.loadCases[0].edgeLoads = [edgeTraction('T1', 'E1', ['N1', 'N3'], 1, 0)];
rejected(patch);
const duplicateEdge = handCheckModel();
duplicateEdge.loadCases[0].edgeLoads = [
  edgeTraction('T1', 'E1', ['N2', 'N3'], 1, 0),
  edgeTraction('T2', 'E1', ['N3', 'N2'], 2, 0),
];
rejected(duplicateEdge);
const duplicateLoadsAcrossCases = handCheckModel();
duplicateLoadsAcrossCases.loadCases = [
  loadCase('LC1', [{ loadId: 'F1', nodeId: 'N1', fx: 0, fy: 0, sourceSemanticHash: duplicateLoadsAcrossCases.sourceSemanticHash }]),
  loadCase('LC2', [{ loadId: 'F1', nodeId: 'N2', fx: 0, fy: 0, sourceSemanticHash: duplicateLoadsAcrossCases.sourceSemanticHash }]),
];
rejected(duplicateLoadsAcrossCases, 'REJECTED_INVALID', 'LC1');

const illConditioned = partiallyPrescribedModel(); illConditioned.materials[0].E = 1e-14;
rejected(illConditioned, 'QUARANTINED_NUMERICAL');

const qualification = qualifyContinuumModel(handCheckModel());
assert.equal(qualification.ok, true);
assert.ok(Object.isFrozen(qualification));
assert.ok(Object.isFrozen(qualification.model));
console.log('LFEA-001 fail-closed, ancestry, singularity and numerical-quarantine fixtures passed.');
