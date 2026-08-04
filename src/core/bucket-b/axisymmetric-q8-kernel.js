import { deepFreeze } from '../shared-piping-model/index.js';
import { Q8_GAUSS_POINTS, q8Shape } from './q8-kernel.js';

export const AXISYMMETRIC_Q8_FORMULATION_PROFILE = 'AXISYMMETRIC';
export const AXISYMMETRIC_Q8_ELEMENT_PROFILE = 'AXI_Q8_FULL_3X3';
export const AXISYMMETRIC_Q8_STRAIN_ORDER = Object.freeze(['epsilonR', 'epsilonZ', 'epsilonTheta', 'gammaRZ']);
export const AXISYMMETRIC_Q8_STRESS_ORDER = Object.freeze(['sigmaR', 'sigmaZ', 'sigmaTheta', 'tauRZ']);
export const DEFAULT_AXIS_RADIUS_TOLERANCE = 1e-9;

export function axisymmetricQ8Map(nodes, xi, eta, { radiusTolerance = DEFAULT_AXIS_RADIUS_TOLERANCE } = {}) {
  const physicalNodes = requireAxisymmetricNodes(nodes);
  requireNaturalCoordinate(xi, 'xi');
  requireNaturalCoordinate(eta, 'eta');
  const { N, dNdXi, dNdEta } = q8Shape(xi, eta);
  let r = 0; let z = 0;
  let drDxi = 0; let dzDxi = 0; let drDeta = 0; let dzDeta = 0;
  for (let index = 0; index < 8; index += 1) {
    const node = physicalNodes[index];
    r += N[index] * node.r;
    z += N[index] * node.z;
    drDxi += dNdXi[index] * node.r;
    dzDxi += dNdXi[index] * node.z;
    drDeta += dNdEta[index] * node.r;
    dzDeta += dNdEta[index] * node.z;
  }
  const determinant = drDxi * dzDeta - drDeta * dzDxi;
  if (!Number.isFinite(determinant) || !(determinant > 0)) {
    throw new RangeError(`AXI_Q8_NONPOSITIVE_JACOBIAN:${xi}:${eta}`);
  }
  const tolerance = finiteNonnegative(radiusTolerance, 'radiusTolerance');
  if (!Number.isFinite(r) || !(r > tolerance)) {
    throw new RangeError(`AXI_Q8_INVALID_INTEGRATION_RADIUS:${r}`);
  }
  return deepFreeze({
    r, z, N: [...N], dNdXi: [...dNdXi], dNdEta: [...dNdEta],
    drDxi, dzDxi, drDeta, dzDeta, determinant,
  });
}

export function axisymmetricQ8BMatrix(nodes, xi, eta, options = {}) {
  const mapped = axisymmetricQ8Map(nodes, xi, eta, options);
  const inverse = 1 / mapped.determinant;
  const B = Array.from({ length: 4 }, () => new Array(16).fill(0));
  const dNdr = new Array(8);
  const dNdz = new Array(8);
  for (let index = 0; index < 8; index += 1) {
    dNdr[index] = inverse * (
      mapped.dzDeta * mapped.dNdXi[index]
      - mapped.dzDxi * mapped.dNdEta[index]
    );
    dNdz[index] = inverse * (
      -mapped.drDeta * mapped.dNdXi[index]
      + mapped.drDxi * mapped.dNdEta[index]
    );
    const radialDof = 2 * index;
    const axialDof = radialDof + 1;
    B[0][radialDof] = dNdr[index];
    B[1][axialDof] = dNdz[index];
    B[2][radialDof] = mapped.N[index] / mapped.r;
    B[3][radialDof] = dNdz[index];
    B[3][axialDof] = dNdr[index];
  }
  return deepFreeze({
    B,
    radius: mapped.r,
    mappedCoordinates: { r: mapped.r, z: mapped.z },
    determinant: mapped.determinant,
    N: mapped.N,
    dNdr,
    dNdz,
  });
}

export function axisymmetricConstitutiveMatrix({ youngsModulus, poissonRatio } = {}) {
  const E = finitePositive(youngsModulus, 'youngsModulus');
  const nu = Number(poissonRatio);
  if (!Number.isFinite(nu) || nu <= -1 || nu >= 0.5) {
    throw new RangeError('AXI_Q8_INVALID_POISSON_RATIO');
  }
  const G = E / (2 * (1 + nu));
  const lambda = E * nu / ((1 + nu) * (1 - 2 * nu));
  const diagonal = lambda + 2 * G;
  return deepFreeze([
    [diagonal, lambda, lambda, 0],
    [lambda, diagonal, lambda, 0],
    [lambda, lambda, diagonal, 0],
    [0, 0, 0, G],
  ]);
}

export function axisymmetricQ8Element({
  elementId,
  nodes,
  material,
  radiusTolerance = DEFAULT_AXIS_RADIUS_TOLERANCE,
} = {}) {
  const physicalNodes = requireAxisymmetricNodes(nodes);
  const tolerance = finiteNonnegative(radiusTolerance, 'radiusTolerance');
  if (physicalNodes.some((node) => !(node.r > tolerance))) {
    throw new RangeError('AXI_Q8_AXIS_RADIUS_TOUCHING_OR_CROSSING_ELEMENT_NOT_REGISTERED');
  }
  const D = axisymmetricConstitutiveMatrix(material);
  const stiffness = zeroMatrix(16, 16);
  const gaussPoints = [];
  for (const station of Q8_GAUSS_POINTS) {
    const evidence = axisymmetricQ8BMatrix(
      physicalNodes,
      station.xi,
      station.eta,
      { radiusTolerance },
    );
    const integrationMeasure = 2 * Math.PI * evidence.radius
      * evidence.determinant * station.weight;
    addBtDB(stiffness, evidence.B, D, integrationMeasure);
    gaussPoints.push(deepFreeze({
      pointId: station.pointId,
      xi: station.xi,
      eta: station.eta,
      quadratureWeight: station.weight,
      radius: evidence.radius,
      mappedCoordinates: evidence.mappedCoordinates,
      determinant: evidence.determinant,
      circumferenceFactor: 2 * Math.PI * evidence.radius,
      integrationMeasure,
      B: evidence.B,
    }));
  }
  return deepFreeze({
    elementId: requiredText(elementId ?? 'AXI-Q8', 'elementId'),
    formulationProfile: AXISYMMETRIC_Q8_FORMULATION_PROFILE,
    elementProfile: AXISYMMETRIC_Q8_ELEMENT_PROFILE,
    strainOrder: AXISYMMETRIC_Q8_STRAIN_ORDER,
    stressOrder: AXISYMMETRIC_Q8_STRESS_ORDER,
    D,
    stiffness,
    gaussPoints,
    stiffnessSymmetryResidual: symmetryResidual(stiffness),
  });
}

export function evaluateAxisymmetricQ8State({
  nodes,
  material,
  displacementVector,
  radiusTolerance = DEFAULT_AXIS_RADIUS_TOLERANCE,
} = {}) {
  const u = requireDofVector(displacementVector);
  const D = axisymmetricConstitutiveMatrix(material);
  return deepFreeze(Q8_GAUSS_POINTS.map((station) => {
    const evidence = axisymmetricQ8BMatrix(nodes, station.xi, station.eta, { radiusTolerance });
    const strain = matrixVector(evidence.B, u);
    const stress = matrixVector(D, strain);
    return deepFreeze({
      pointId: station.pointId,
      xi: station.xi,
      eta: station.eta,
      quadratureWeight: station.weight,
      mappedCoordinates: evidence.mappedCoordinates,
      radius: evidence.radius,
      determinant: evidence.determinant,
      circumferenceFactor: 2 * Math.PI * evidence.radius,
      B: evidence.B,
      strain: vectorRecord(AXISYMMETRIC_Q8_STRAIN_ORDER, strain),
      stress: vectorRecord(AXISYMMETRIC_Q8_STRESS_ORDER, stress),
      strainVector: strain,
      stressVector: stress,
    });
  }));
}

export function axisymmetricQ8InternalForce({ nodes, material, displacementVector, radiusTolerance } = {}) {
  const element = axisymmetricQ8Element({ nodes, material, radiusTolerance });
  const u = requireDofVector(displacementVector);
  return deepFreeze(matrixVector(element.stiffness, u));
}

export function axisymmetricQ8StrainEnergy({ nodes, material, displacementVector, radiusTolerance } = {}) {
  const states = evaluateAxisymmetricQ8State({
    nodes,
    material,
    displacementVector,
    radiusTolerance,
  });
  return states.reduce((total, state) => total + 0.5
    * dot(state.strainVector, state.stressVector)
    * state.circumferenceFactor
    * state.determinant
    * state.quadratureWeight, 0);
}

export function matrixVector(matrix, vector) {
  if (!Array.isArray(matrix) || !Array.isArray(vector)) throw new TypeError('Matrix and vector are required.');
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

export function zeroMatrix(rows, columns) {
  return Array.from({ length: rows }, () => new Array(columns).fill(0));
}

function addBtDB(target, B, D, factor) {
  if (!Number.isFinite(factor) || !(factor > 0)) throw new RangeError('AXI_Q8_INVALID_INTEGRATION_MEASURE');
  const DB = Array.from({ length: 4 }, (_, row) => Array.from({ length: 16 }, (_, column) => (
    D[row].reduce((sum, value, index) => sum + value * B[index][column], 0)
  )));
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      let value = 0;
      for (let component = 0; component < 4; component += 1) {
        value += B[component][row] * DB[component][column];
      }
      target[row][column] += value * factor;
    }
  }
}

function vectorRecord(keys, values) {
  return Object.fromEntries(keys.map((key, index) => [key, cleanNumber(values[index])]));
}
function requireAxisymmetricNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length !== 8) throw new TypeError('AXI_Q8_REQUIRES_EIGHT_NODES');
  return nodes.map((node, index) => {
    const r = Number(node?.r);
    const z = Number(node?.z);
    if (!Number.isFinite(r) || !Number.isFinite(z)) throw new TypeError(`AXI_Q8_INVALID_NODE_${index + 1}`);
    return { nodeId: node.nodeId ?? `N${index + 1}`, r, z };
  });
}
function requireDofVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 16 || vector.some((value) => !Number.isFinite(value))) {
    throw new TypeError('AXI_Q8_REQUIRES_SIXTEEN_FINITE_DOFS');
  }
  return [...vector];
}
function requireNaturalCoordinate(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`AXI_Q8_INVALID_${label.toUpperCase()}`);
}
function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw new RangeError(`AXI_Q8_INVALID_${label.toUpperCase()}`);
  return number;
}
function finiteNonnegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`AXI_Q8_INVALID_${label.toUpperCase()}`);
  return number;
}
function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`AXI_Q8_INVALID_${label.toUpperCase()}`);
  return value;
}
function symmetryResidual(matrix) {
  let maximum = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = row + 1; column < matrix.length; column += 1) {
      maximum = Math.max(maximum, Math.abs(matrix[row][column] - matrix[column][row]));
    }
  }
  return maximum;
}
function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
function cleanNumber(value) { return Object.is(value, -0) || Math.abs(value) < 1e-15 ? 0 : value; }
