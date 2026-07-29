import { ELEMENT_TYPES, FORMULA_IDS } from './constants.js';
import { numericalError } from './errors.js';
import {
  matrixScale, matrixVector, multiply, scaleMatrix, symmetryResidual, transpose,
} from './matrix.js';
import { canonicalNumber, maxAbs, tolerance } from './numeric.js';
import { constitutiveEvidence } from './constitutive.js';
import { t6ElementEvidence } from './t6-element.js';
import { q8ElementEvidence } from './q8-element.js';

/**
 * Dispatches by `element.elementType`. T3 uses the original single-Gauss
 * -point (constant-strain) evidence path, byte-for-byte unchanged. T6/Q8
 * use the Gauss-integrated formulations in `t6-element.js`/`q8-element.js`,
 * normalized here to the same physical-node-coordinate shape those
 * formulations expect.
 */
export function buildElementEvidence(model) {
  const nodes = new Map(model.nodes.map((row) => [row.nodeId, row]));
  const materials = new Map(model.materials.map((row) => [row.materialId, row]));
  return model.elements.map((element) => (
    dispatchElementEvidence(element, nodes, materials.get(element.materialId), model)
  ));
}

function dispatchElementEvidence(element, nodeMap, material, model) {
  if (element.elementType === ELEMENT_TYPES.T6 || element.elementType === ELEMENT_TYPES.Q8) {
    const physicalNodes = element.nodeIds.map((id) => nodeMap.get(id));
    const builder = element.elementType === ELEMENT_TYPES.T6 ? t6ElementEvidence : q8ElementEvidence;
    const evidence = builder(element.elementId, physicalNodes, material, model.formulation, element.thickness, model.qualificationProfile);
    return {
      ...evidence,
      nodeIds: element.nodeIds,
      materialId: element.materialId,
      thickness: element.thickness,
      canonicalArea: element.canonicalArea,
      localDofOrdering: element.nodeIds.flatMap((id) => [`${id}:UX`, `${id}:UY`]),
      sourceReferences: {
        element: element.sourceReference,
        material: material.sourceReference,
        nodes: physicalNodes.map((node) => node.sourceReference),
      },
    };
  }
  return elementEvidence(element, nodeMap, material, model);
}

export function elementEvidence(element, nodeMap, material, model) {
  const coordinates = element.nodeIds.map((id) => nodeMap.get(id));
  const b = bMatrix(coordinates, element.canonicalArea);
  const constitutive = constitutiveEvidence(material, model.formulation, model.qualificationProfile);
  const stiffness = stiffnessMatrix(b, constitutive.matrix, element);
  const stiffnessQualification = qualifyStiffness(stiffness, element, model.qualificationProfile);
  const rigidBodyQualification = qualifyRigidBody(b, coordinates, model.qualificationProfile);
  const affinePatchQualification = qualifyAffinePatch(b, constitutive.matrix, coordinates, model.qualificationProfile);
  return evidenceRecord(element, coordinates, material, b, constitutive, stiffness, {
    stiffnessQualification, rigidBodyQualification, affinePatchQualification,
  });
}

export function bMatrix(nodes, area) {
  const [a, b, c] = nodes;
  const beta = [b.y - c.y, c.y - a.y, a.y - b.y];
  const gamma = [c.x - b.x, a.x - c.x, b.x - a.x];
  const factor = 1 / (2 * area);
  const matrix = [
    [beta[0], 0, beta[1], 0, beta[2], 0],
    [0, gamma[0], 0, gamma[1], 0, gamma[2]],
    [gamma[0], beta[0], gamma[1], beta[1], gamma[2], beta[2]],
  ];
  return matrix.map((row) => row.map((value) => canonicalNumber(value * factor, 'B matrix')));
}

function stiffnessMatrix(b, d, element) {
  return scaleMatrix(
    multiply(multiply(transpose(b), d), b),
    element.thickness * element.canonicalArea,
  );
}

function qualifyStiffness(stiffness, element, profile) {
  const residual = symmetryResidual(stiffness);
  const scale = matrixScale(stiffness);
  const limit = tolerance(profile, 'stiffnessSymmetry', scale);
  if (residual > limit) {
    throw numericalError(
      'ELEMENT_STIFFNESS_SYMMETRY_FAILURE',
      `elements.${element.elementId}`,
      'Element stiffness symmetry did not qualify.',
    );
  }
  return { residual, scale, tolerance: limit, accepted: true };
}

function qualifyRigidBody(b, nodes, profile) {
  const translationX = nodes.flatMap(() => [1, 0]);
  const translationY = nodes.flatMap(() => [0, 1]);
  const rotation = nodes.flatMap((node) => [-node.y, node.x]);
  const strains = [translationX, translationY, rotation].map((field) => matrixVector(b, field));
  const residual = maxAbs(strains);
  const scale = Math.max(1, ...nodes.flatMap((node) => [Math.abs(node.x), Math.abs(node.y)]));
  const limit = tolerance(profile, 'rigidBodyStrain', scale);
  if (residual > limit) {
    throw numericalError('RIGID_BODY_STRAIN_FAILURE', 'element formulation', 'Rigid-body strain did not qualify.');
  }
  return { maximumStrainResidual: residual, scale, tolerance: limit, accepted: true };
}

function qualifyAffinePatch(b, d, nodes, profile) {
  const fields = affineFields(nodes);
  const expected = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const stressResiduals = fields.map((field, index) => {
    const actual = matrixVector(d, matrixVector(b, field));
    const target = matrixVector(d, expected[index]);
    return actual.map((value, component) => value - target[component]);
  });
  const residual = maxAbs(stressResiduals);
  const scale = Math.max(1, matrixScale(d));
  const limit = tolerance(profile, 'patchTestStress', scale);
  if (residual > limit) {
    throw numericalError('AFFINE_PATCH_STRESS_FAILURE', 'element formulation', 'Affine patch stress did not qualify.');
  }
  return { maximumStressResidual: canonicalNumber(residual), scale, tolerance: limit, accepted: true };
}

function affineFields(nodes) {
  return [
    nodes.flatMap((node) => [node.x, 0]),
    nodes.flatMap((node) => [0, node.y]),
    nodes.flatMap((node) => [node.y / 2, node.x / 2]),
  ];
}

function evidenceRecord(element, coordinates, material, b, constitutive, stiffness, qualifications) {
  return {
    elementId: element.elementId,
    elementType: element.elementType,
    nodeIds: element.nodeIds,
    materialId: element.materialId,
    thickness: element.thickness,
    signedAreaBeforeNormalization: element.signedAreaBeforeNormalization,
    canonicalArea: element.canonicalArea,
    orientation: element.orientation,
    areaQualification: element.areaQualification,
    bMatrix: b,
    dMatrix: constitutive.matrix,
    localDofOrdering: element.nodeIds.flatMap((id) => [`${id}:UX`, `${id}:UY`]),
    localStiffnessMatrix: stiffness,
    conditioning: geometryCondition(coordinates, element.canonicalArea),
    constitutiveSymmetry: constitutive.symmetry,
    stiffnessSymmetry: qualifications.stiffnessQualification,
    rigidBodyQualification: qualifications.rigidBodyQualification,
    affinePatchQualification: qualifications.affinePatchQualification,
    sourceReferences: {
      element: element.sourceReference,
      material: material.sourceReference,
      nodes: coordinates.map((row) => row.sourceReference),
    },
    formulaIds: [
      FORMULA_IDS.ORIENTATION, FORMULA_IDS.B_MATRIX,
      ...constitutive.formulaIds, FORMULA_IDS.STIFFNESS,
    ].sort(),
  };
}

function geometryCondition(nodes, area) {
  const lengths = [];
  for (let index = 0; index < 3; index += 1) {
    const left = nodes[index];
    const right = nodes[(index + 1) % 3];
    lengths.push(Math.hypot(left.x - right.x, left.y - right.y));
  }
  const maximum = Math.max(...lengths);
  const minimum = Math.min(...lengths);
  return {
    minimumEdge: canonicalNumber(minimum),
    maximumEdge: canonicalNumber(maximum),
    edgeRatio: canonicalNumber(minimum / maximum),
    normalizedDoubleArea: canonicalNumber(2 * area / maximum ** 2),
  };
}
