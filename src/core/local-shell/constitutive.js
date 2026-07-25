import { scaleMatrix, symmetryResidual, matrixScale } from './matrix.js';
import { qualification } from './numeric.js';

export function planeStressMatrix(material) {
  const factor = material.elasticModulus / (1 - material.poissonRatio ** 2);
  const nu = material.poissonRatio;
  return [
    [factor, factor * nu, 0],
    [factor * nu, factor, 0],
    [0, 0, factor * (1 - nu) / 2],
  ];
}

export function constitutiveEvidence(material, thickness, profile) {
  const membraneMaterial = planeStressMatrix(material);
  const membrane = scaleMatrix(membraneMaterial, thickness);
  const bending = scaleMatrix(membraneMaterial, thickness ** 3 / 12);
  const membraneSymmetry = qualification(
    symmetryResidual(membrane),
    matrixScale(membrane),
    profile.membraneConstitutiveSymmetry,
  );
  const bendingSymmetry = qualification(
    symmetryResidual(bending),
    matrixScale(bending),
    profile.bendingConstitutiveSymmetry,
  );
  return { membraneMaterial, membrane, bending, membraneSymmetry, bendingSymmetry };
}
