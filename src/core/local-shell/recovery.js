import { FORMULA_IDS, SURFACES } from './constants.js';
import { matrixVector, quadratic } from './matrix.js';
import { cleanNumber, qualification } from './numeric.js';

export function recoverLoadCase(model, assembly, elements, loadEvidence, solution) {
  const elementResults = elements.map((element) => recoverElement(element, assembly, solution.displacement, loadEvidence));
  const energy = energyEvidence(model, assembly, elementResults, loadEvidence, solution);
  return {
    loadCaseId: loadEvidence.loadCaseId,
    nodalDisplacements: nodalDisplacements(model, solution.displacement),
    reactions: constrainedReactions(model, assembly, solution.reaction),
    freeDofIdentities: solution.freeDofIdentities,
    constrainedDofIdentities: solution.constrainedDofIdentities,
    solverEvidence: solution.solverEvidence,
    freeDofResiduals: solution.freeDofResiduals,
    freeDofResidualQualification: solution.freeDofResidualQualification,
    forceEquilibrium: solution.forceEquilibrium,
    momentEquilibrium: solution.momentEquilibrium,
    appliedLoadEvidence: loadEvidence,
    elementResults,
    membraneStrainEnergy: energy.membrane,
    bendingStrainEnergy: energy.bending,
    totalStrainEnergy: energy.total,
    globalStrainEnergy: energy.global,
    externalWorkIncludingPrescribedReactions: energy.externalWorkIncludingPrescribedReactions,
    energyQualification: energy.qualification,
    qualification: loadCaseQualification(solution, energy),
    formulaIds: uniqueFormulaIds([
      ...solution.formulaIds,
      ...loadEvidence.formulaIds,
      FORMULA_IDS.STRESS_RECOVERY,
      FORMULA_IDS.INVARIANTS,
      FORMULA_IDS.ENERGY,
    ]),
  };
}

function recoverElement(element, assembly, displacement, loadEvidence) {
  const indices = element.globalDofOrdering.map((identity) => assembly.dofIndex.get(identity));
  const global = indices.map((index) => displacement[index]);
  const local = matrixVector(element.nodalBasisTransformation.matrix, global);
  const membraneDofs = [local[0], local[1], local[5], local[6], local[10], local[11]];
  const bendingDofs = [local[2], local[3], local[4], local[7], local[8], local[9], local[12], local[13], local[14]];
  const membraneStrain = matrixVector(element.membraneBMatrix, membraneDofs);
  const membraneStress = matrixVector(element.membraneMaterialMatrix, membraneStrain);
  const integrationPoints = element.dktIntegrationPoints.map((point) => recoverPoint(element, point, bendingDofs, membraneStrain, membraneStress, loadEvidence));
  const membraneEnergy = cleanNumber(0.5 * quadratic(membraneDofs, element.membraneStiffness));
  const bendingEnergy = cleanNumber(0.5 * quadratic(bendingDofs, element.bendingStiffness));
  return {
    elementId: element.elementId,
    localGeneralizedDisplacement: local,
    membraneStrain: strainRecord(membraneStrain),
    membraneStress: stressRecord(membraneStress),
    integrationPoints,
    membraneStrainEnergy: membraneEnergy,
    bendingStrainEnergy: bendingEnergy,
    totalStrainEnergy: cleanNumber(membraneEnergy + bendingEnergy),
    sourceReferences: [...element.sourceReferences, loadEvidence.loadCaseId],
    formulaIds: [FORMULA_IDS.CST_MEMBRANE, FORMULA_IDS.DKT_CURVATURE, FORMULA_IDS.STRESS_RECOVERY, FORMULA_IDS.INVARIANTS, FORMULA_IDS.ENERGY],
  };
}

function recoverPoint(element, point, bendingDofs, membraneStrain, membraneStress, loadEvidence) {
  const curvature = matrixVector(point.bendingBMatrix, bendingDofs);
  const surfaces = SURFACES.map((surface) => recoverSurface(element, surface, curvature, membraneStrain, membraneStress));
  return {
    integrationPointId: point.integrationPointId,
    barycentric: [...point.barycentric],
    curvature: curvatureRecord(curvature),
    surfaces,
    sourceReferences: [...element.sourceReferences, loadEvidence.loadCaseId],
    formulaIds: [FORMULA_IDS.DKT_CURVATURE, FORMULA_IDS.STRESS_RECOVERY, FORMULA_IDS.INVARIANTS],
  };
}

function recoverSurface(element, surface, curvature, membraneStrain, membraneStress) {
  const z = surfaceCoordinate(surface, element.thickness);
  const bendingStrain = curvature.map((value) => cleanNumber(z * value));
  const bendingStress = matrixVector(element.membraneMaterialMatrix, bendingStrain);
  const combinedStrain = membraneStrain.map((value, index) => cleanNumber(value + bendingStrain[index]));
  const combinedStress = membraneStress.map((value, index) => cleanNumber(value + bendingStress[index]));
  const invariants = stressInvariants(combinedStress[0], combinedStress[1], combinedStress[2]);
  return {
    surface,
    z,
    membraneStrain: strainRecord(membraneStrain),
    bendingStrain: strainRecord(bendingStrain),
    combinedStrain: strainRecord(combinedStrain),
    membraneStress: stressRecord(membraneStress),
    bendingStress: stressRecord(bendingStress),
    combinedStress: stressRecord(combinedStress),
    ...invariants,
    formulaIds: [FORMULA_IDS.STRESS_RECOVERY, FORMULA_IDS.INVARIANTS],
  };
}

export function stressInvariants(sigmaX, sigmaY, tauXY) {
  const center = 0.5 * (sigmaX + sigmaY);
  const radius = Math.hypot(0.5 * (sigmaX - sigmaY), tauXY);
  const principalMaximum = cleanNumber(center + radius);
  const principalMinimum = cleanNumber(center - radius);
  const vonMises = cleanNumber(Math.sqrt(Math.max(0, sigmaX ** 2 - sigmaX * sigmaY + sigmaY ** 2 + 3 * tauXY ** 2)));
  return {
    principalMaximum,
    principalMinimum,
    maximumInPlaneShear: cleanNumber(radius),
    vonMises,
  };
}

function energyEvidence(model, assembly, elements, loads, solution) {
  const membrane = cleanNumber(elements.reduce((total, item) => total + item.membraneStrainEnergy, 0));
  const bending = cleanNumber(elements.reduce((total, item) => total + item.bendingStrainEnergy, 0));
  const total = cleanNumber(membrane + bending);
  const global = cleanNumber(0.5 * quadratic(solution.displacement, assembly.stiffness));
  const forcePlusReaction = loads.forceVector.map((value, index) => value + solution.reaction[index]);
  const work = cleanNumber(0.5 * solution.displacement.reduce((sum, value, index) => sum + value * forcePlusReaction[index], 0));
  const residual = Math.max(Math.abs(total - global), Math.abs(global - work));
  const scale = Math.max(1, Math.abs(total), Math.abs(global), Math.abs(work));
  return {
    membrane,
    bending,
    total,
    global,
    externalWorkIncludingPrescribedReactions: work,
    qualification: qualification(residual, scale, model.qualificationProfile.strainEnergyReconstruction),
  };
}

function nodalDisplacements(model, vector) {
  return model.nodes.map((node, index) => ({
    nodeId: node.nodeId,
    ux: cleanNumber(vector[5 * index]),
    uy: cleanNumber(vector[5 * index + 1]),
    uz: cleanNumber(vector[5 * index + 2]),
    r1: cleanNumber(vector[5 * index + 3]),
    r2: cleanNumber(vector[5 * index + 4]),
  }));
}

function constrainedReactions(model, assembly, reaction) {
  const constraints = new Map(model.constraints.map((item) => [`${item.nodeId}:${item.dof}`, item]));
  return assembly.dofOrdering.filter((identity) => constraints.has(identity)).map((identity) => {
    const [nodeId, dof] = identity.split(':');
    return {
      constraintId: constraints.get(identity).constraintId,
      nodeId,
      dof,
      kind: dof.startsWith('R') ? 'MOMENT' : 'FORCE',
      value: cleanNumber(reaction[assembly.dofIndex.get(identity)]),
    };
  });
}

function loadCaseQualification(solution, energy) {
  const checks = [
    solution.freeDofResidualQualification,
    solution.forceEquilibrium.qualification,
    solution.momentEquilibrium.qualification,
    energy.qualification,
  ];
  return { accepted: checks.every((check) => check.accepted), checks };
}

function surfaceCoordinate(surface, thickness) {
  if (surface === 'BOTTOM') return cleanNumber(-thickness / 2);
  if (surface === 'TOP') return cleanNumber(thickness / 2);
  return 0;
}

function strainRecord(values) {
  return { epsilonX: values[0], epsilonY: values[1], gammaXY: values[2] };
}

function curvatureRecord(values) {
  return { kappaX: values[0], kappaY: values[1], kappaXY: values[2] };
}

function stressRecord(values) {
  return { sigmaX: values[0], sigmaY: values[1], tauXY: values[2] };
}

function uniqueFormulaIds(values) {
  return [...new Set(values)].sort();
}
