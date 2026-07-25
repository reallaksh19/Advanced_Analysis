import { DKT_FORMULATION, FORMULA_IDS } from './constants.js';
import { constitutiveEvidence } from './constitutive.js';
import { membraneStiffness } from './cst.js';
import { dktBendingEvidence } from './dkt.js';
import {
  bendingPatchEvidence,
  membranePatchEvidence,
  rigidRotationEvidence,
  rigidTranslationEvidence,
} from './element-qualification.js';
import { ShellNumericalError } from './errors.js';
import { canonicalFacet, frameResidual, localCoordinates, nodeBasisEvidence } from './geometry.js';
import {
  matrixScale,
  multiply,
  symmetryResidual,
  transpose,
  zeros,
} from './matrix.js';
import { qualification } from './numeric.js';
import { fiveDofTransformation } from './transformation.js';

export function buildShellElementEvidence(model) {
  const nodeMap = new Map(model.nodes.map((node) => [node.nodeId, node]));
  const materialMap = new Map(model.materials.map((material) => [material.materialId, material]));
  return model.elements.map((element) => buildElement(element, nodeMap, materialMap, model.qualificationProfile));
}

export function buildNodeBasisEvidence(model) {
  return model.nodes.map((node) => nodeBasisEvidence(node, model.qualificationProfile));
}

function buildElement(element, nodeMap, materialMap, profile) {
  const nodes = element.nodeIds.map((nodeId) => nodeMap.get(nodeId));
  const material = materialMap.get(element.materialId);
  const canonical = canonicalFacet(element.nodeIds, nodeMap, profile, element.elementId);
  const coordinates = localCoordinates(nodes, canonical.frame);
  const constitutive = constitutiveEvidence(material, element.thickness, profile);
  const membrane = membraneStiffness(coordinates, constitutive.membrane, canonical.frame.area);
  const bending = dktBendingEvidence(coordinates, constitutive.bending, canonical.frame.area);
  const combinedLocal = combinedLocalStiffness(membrane.stiffness, bending.stiffness);
  const transformation = fiveDofTransformation(nodes, canonical.frame, profile);
  const globalStiffness = multiply(transpose(transformation.matrix), multiply(combinedLocal, transformation.matrix));
  const context = qualificationContext(nodes, canonical, membrane, bending, transformation);
  const qualificationEvidence = elementQualification(context, constitutive, combinedLocal, globalStiffness, profile);
  rejectFailed(element.elementId, qualificationEvidence);
  return elementPayload({ element, nodes, material, canonical, coordinates, constitutive, membrane, bending, combinedLocal, transformation, globalStiffness, qualificationEvidence });
}

function elementPayload(context) {
  const { element, nodes, material, canonical, coordinates, constitutive, membrane, bending } = context;
  return {
    elementId: element.elementId,
    nodeIds: [...element.nodeIds],
    materialId: element.materialId,
    thickness: element.thickness,
    area: canonical.frame.area,
    geometryScale: canonical.geometryScale,
    localCoordinates: coordinates,
    localFrame: canonical.frame,
    frameResidual: frameResidual(canonical.frame),
    directorAlignment: canonical.alignments,
    areaQualification: canonical.areaQualification,
    membraneBMatrix: membrane.b,
    membraneMaterialMatrix: constitutive.membraneMaterial,
    membraneConstitutiveMatrix: constitutive.membrane,
    bendingConstitutiveMatrix: constitutive.bending,
    dktFormulation: DKT_FORMULATION,
    dktRotationInterpolation: bending.interpolation,
    dktIntegrationPoints: bending.integrationPoints,
    membraneStiffness: membrane.stiffness,
    bendingStiffness: bending.stiffness,
    combinedLocalStiffness: context.combinedLocal,
    nodalBasisTransformation: context.transformation,
    globalStiffness: context.globalStiffness,
    localDofOrdering: localDofOrdering(element.nodeIds),
    globalDofOrdering: globalDofOrdering(element.nodeIds),
    qualification: context.qualificationEvidence,
    sourceReferences: [element.sourceReference, ...nodes.map((node) => node.sourceReference), material.sourceReference],
    formulaIds: elementFormulaIds(),
  };
}

function elementFormulaIds() {
  return [
    FORMULA_IDS.FACET_FRAME,
    FORMULA_IDS.CST_MEMBRANE,
    FORMULA_IDS.DKT_EDGE,
    FORMULA_IDS.DKT_CURVATURE,
    FORMULA_IDS.DKT_INTEGRATION,
    FORMULA_IDS.BASIS_TRANSFORMATION,
  ];
}

function elementQualification(context, constitutive, combinedLocal, globalStiffness, profile) {
  return {
    membraneConstitutiveSymmetry: constitutive.membraneSymmetry,
    bendingConstitutiveSymmetry: constitutive.bendingSymmetry,
    localStiffnessSymmetry: qualification(symmetryResidual(combinedLocal), matrixScale(combinedLocal), profile.elementStiffnessSymmetry),
    globalStiffnessSymmetry: qualification(symmetryResidual(globalStiffness), matrixScale(globalStiffness), profile.elementStiffnessSymmetry),
    rigidTranslation: rigidTranslationEvidence(globalStiffness, profile),
    rigidRotation: rigidRotationEvidence(context, profile),
    membranePatch: membranePatchEvidence(context.coordinates, context.membraneB, profile),
    bendingPatch: bendingPatchEvidence(context.coordinates, context.integrationPoints, context.geometryScale, profile),
  };
}

function qualificationContext(nodes, canonical, membrane, bending, transformation) {
  return {
    nodes,
    coordinates: localCoordinates(nodes, canonical.frame),
    geometryScale: canonical.geometryScale,
    membraneB: membrane.b,
    integrationPoints: bending.integrationPoints,
    transformation: transformation.matrix,
  };
}

function rejectFailed(elementId, evidence) {
  const checks = [
    evidence.membraneConstitutiveSymmetry,
    evidence.bendingConstitutiveSymmetry,
    evidence.localStiffnessSymmetry,
    evidence.globalStiffnessSymmetry,
    evidence.rigidTranslation,
    evidence.rigidRotation.scaledQualification,
    evidence.membranePatch,
    evidence.bendingPatch,
  ];
  if (checks.some((check) => !check.accepted)) throw new ShellNumericalError(`Element ${elementId} failed numerical qualification`, evidence);
}

function combinedLocalStiffness(membrane, bending) {
  const matrix = zeros(15, 15);
  const membraneIndices = [0, 1, 5, 6, 10, 11];
  const bendingIndices = [2, 3, 4, 7, 8, 9, 12, 13, 14];
  embed(matrix, membrane, membraneIndices);
  embed(matrix, bending, bendingIndices);
  return matrix;
}

function embed(target, source, indices) {
  for (let row = 0; row < indices.length; row += 1) {
    for (let column = 0; column < indices.length; column += 1) {
      target[indices[row]][indices[column]] = source[row][column];
    }
  }
}

function localDofOrdering(nodeIds) {
  return nodeIds.flatMap((nodeId) => ['U_LOCAL_X', 'U_LOCAL_Y', 'W_LOCAL_Z', 'THETA_LOCAL_X', 'THETA_LOCAL_Y'].map((dof) => `${nodeId}:${dof}`));
}

function globalDofOrdering(nodeIds) {
  return nodeIds.flatMap((nodeId) => ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof) => `${nodeId}:${dof}`));
}
