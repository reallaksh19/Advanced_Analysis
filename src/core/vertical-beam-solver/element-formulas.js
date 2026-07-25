import { deepFreeze } from '../shared-piping-model/index.js';
import { FORMULA_IDS } from './constants.js';
import { finitePositive } from './numeric.js';

export function eulerBernoulliElementStiffness(lengthM, flexuralRigidityNm2) {
  const length = finitePositive(lengthM), rigidity = finitePositive(flexuralRigidityNm2);
  if (!length || !rigidity) throw new TypeError('Element stiffness requires positive finite length and EI.');
  const l2 = length ** 2, factor = rigidity / length ** 3;
  const matrix = [
    [12, 6 * length, -12, 6 * length],
    [6 * length, 4 * l2, -6 * length, 2 * l2],
    [-12, -6 * length, 12, -6 * length],
    [6 * length, 2 * l2, -6 * length, 4 * l2],
  ].map((row) => row.map((value) => value * factor));
  return deepFreeze({
    formulaId: FORMULA_IDS.ELEMENT_STIFFNESS, formulaVersion: '1.0.0',
    lengthM: length, flexuralRigidityNm2: rigidity, matrix,
  });
}

export function eulerBernoulliUniformLoadVector(forcePerLengthNM, lengthM) {
  const load = Number(forcePerLengthNM), length = finitePositive(lengthM);
  if (!Number.isFinite(load) || !length) throw new TypeError('Uniform load vector requires finite load and positive length.');
  const vector = [load * length / 2, load * length ** 2 / 12, load * length / 2, -load * length ** 2 / 12];
  return deepFreeze({
    formulaId: FORMULA_IDS.UNIFORM_LOAD, formulaVersion: '1.0.0',
    signConvention: 'POSITIVE_GRAVITY_DOWN_WITH_THETA_DV_DX',
    forcePerLengthNM: load, lengthM: length, vector,
  });
}

export function eulerBernoulliNodePointLoad(pointForceN, nodeId) {
  const force = Number(pointForceN);
  if (!Number.isFinite(force)) throw new TypeError('Point load requires finite force.');
  return deepFreeze({
    formulaId: FORMULA_IDS.POINT_LOAD, formulaVersion: '1.0.0', nodeId,
    signConvention: 'POSITIVE_GRAVITY_DOWN', verticalForceN: force,
  });
}
