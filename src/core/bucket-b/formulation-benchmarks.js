import { Q8_GAUSS_POINTS, constitutiveMatrix, matrixVector, q8BMatrix, q8Shape } from './q8-kernel.js';

export const FORMULATION_BENCHMARK_IDS = Object.freeze({
  PLANE_STRESS: 'BKT-B-SH-Q8-PS-PATCH-001',
  PLANE_STRAIN: 'BKT-B-SH-Q8-PE-PATCH-001',
  DISTORTED: 'BKT-B-SH-Q8-DISTORTED-PATCH-001',
});
export function runQ8FormulationBenchmark({ benchmarkId, nodes, formulationProfile, youngsModulus = 210000, poissonRatio = 0.3, thickness = 1, tolerance = 1e-9 } = {}) {
  if (!Object.values(FORMULATION_BENCHMARK_IDS).includes(benchmarkId)) throw new TypeError('Unregistered Q8 formulation benchmark ID.');
  if (benchmarkId === FORMULATION_BENCHMARK_IDS.PLANE_STRESS && formulationProfile !== 'PLANE_STRESS') throw new TypeError('Plane-stress benchmark requires PLANE_STRESS.');
  if (benchmarkId === FORMULATION_BENCHMARK_IDS.PLANE_STRAIN && formulationProfile !== 'PLANE_STRAIN') throw new TypeError('Plane-strain benchmark requires PLANE_STRAIN.');
  const D = constitutiveMatrix({ youngsModulus, poissonRatio, formulationProfile });
  const fields = [
    { id: 'TRANSLATION_X', expected: [0, 0, 0], dofs: nodes.flatMap(() => [1, 0]) },
    { id: 'TRANSLATION_Y', expected: [0, 0, 0], dofs: nodes.flatMap(() => [0, 1]) },
    { id: 'RIGID_ROTATION', expected: [0, 0, 0], dofs: nodes.flatMap((n) => [-n.y, n.x]) },
    { id: 'EPSILON_X', expected: [1, 0, 0], dofs: nodes.flatMap((n) => [n.x, 0]) },
    { id: 'EPSILON_Y', expected: [0, 1, 0], dofs: nodes.flatMap((n) => [0, n.y]) },
    { id: 'GAMMA_XY', expected: [0, 0, 1], dofs: nodes.flatMap((n) => [n.y / 2, n.x / 2]) },
  ];
  let maximumPartitionResidual = 0; let maximumStrainResidual = 0; let minimumDeterminant = Infinity; let integratedArea = 0;
  const stiffness = zeros(16, 16); const pointEvidence = [];
  for (const gp of Q8_GAUSS_POINTS) {
    const shape = q8Shape(gp.xi, gp.eta); const partitionResidual = Math.abs(shape.N.reduce((a, b) => a + b, 0) - 1);
    maximumPartitionResidual = Math.max(maximumPartitionResidual, partitionResidual);
    const { B, determinant } = q8BMatrix(nodes, gp.xi, gp.eta); minimumDeterminant = Math.min(minimumDeterminant, determinant); integratedArea += determinant * gp.weight;
    addBtDB(stiffness, B, D, thickness * determinant * gp.weight);
    const fieldEvidence = fields.map((field) => { const strain = matrixVector(B, field.dofs); const residual = maxAbs(strain.map((value, i) => value - field.expected[i])); maximumStrainResidual = Math.max(maximumStrainResidual, residual); return Object.freeze({ fieldId: field.id, strain, expected: field.expected, residual, stress: matrixVector(D, strain) }); });
    pointEvidence.push(Object.freeze({ pointId: gp.pointId, determinant, partitionResidual, fieldEvidence: Object.freeze(fieldEvidence), B: Object.freeze(B.map(Object.freeze)) }));
  }
  const stiffnessSymmetryResidual = symmetryResidual(stiffness);
  const affineEvidence = fields.filter((f) => !f.id.startsWith('TRANSLATION') && f.id !== 'RIGID_ROTATION').map((field) => {
    const reactions = matrixVector(stiffness, field.dofs); const strainEnergy = 0.5 * dot(field.dofs, reactions); const stress = matrixVector(D, field.expected); const exactEnergy = 0.5 * dot(field.expected, stress) * integratedArea * thickness;
    return Object.freeze({ fieldId: field.id, reactions: Object.freeze(reactions), reactionEquilibriumResidual: Object.freeze([sumEven(reactions), sumOdd(reactions)]), strainEnergy, exactStrainEnergy: exactEnergy, energyResidual: strainEnergy - exactEnergy, stress: Object.freeze(stress), sigmaZ: formulationProfile === 'PLANE_STRAIN' ? poissonRatio * (stress[0] + stress[1]) : 0 });
  });
  const maximumEnergyResidual = maxAbs(affineEvidence.map((row) => row.energyResidual)); const maximumReactionResidual = maxAbs(affineEvidence.flatMap((row) => row.reactionEquilibriumResidual));
  const constitutiveConstraint = formulationProfile === 'PLANE_STRESS' ? Object.freeze({ sigmaZ: 0, constraint: 'sigmaZ = 0' }) : Object.freeze({ epsilonZ: 0, sigmaZRule: 'nu * (sigmaX + sigmaY)', poissonRatioScope: poissonRatio <= 0.45 ? 'QUALIFIED' : 'LOCKING_NOT_QUALIFIED' });
  const accepted = maximumPartitionResidual <= tolerance && maximumStrainResidual <= tolerance && stiffnessSymmetryResidual <= tolerance * Math.max(1, maxAbs(stiffness.flat())) && maximumEnergyResidual <= tolerance * Math.max(1, ...affineEvidence.map((row) => Math.abs(row.exactStrainEnergy))) && maximumReactionResidual <= tolerance * Math.max(1, ...affineEvidence.flatMap((row) => row.reactions.map(Math.abs))) && minimumDeterminant > 0 && constitutiveConstraint.poissonRatioScope !== 'LOCKING_NOT_QUALIFIED';
  return Object.freeze({ benchmarkId, formulationProfile, elementProfile: 'Q8_FULL_3X3', maximumPartitionResidual, maximumStrainResidual, minimumDeterminant, integratedArea, stiffnessSymmetryResidual, maximumReactionResidual, maximumEnergyResidual, constitutiveConstraint, accepted, localStiffnessMatrix: Object.freeze(stiffness.map(Object.freeze)), affineEvidence: Object.freeze(affineEvidence), pointEvidence: Object.freeze(pointEvidence) });
}

export function compareQ8OracleToExecutable({ oracle, executable, relativeTolerance = 1e-10 } = {}) {
  if (!oracle?.localStiffnessMatrix || !executable?.localStiffnessMatrix) throw new TypeError('Oracle and executable Q8 evidence are required.');
  const stiffnessError = matrixRelativeError(oracle.localStiffnessMatrix, executable.localStiffnessMatrix);
  const oraclePoints = new Map(oracle.pointEvidence.map((row) => [row.pointId, row]));
  const executablePoints = executable.gaussEvidence ?? executable.pointEvidence;
  if (!Array.isArray(executablePoints) || executablePoints.length !== 9) throw new TypeError('Executable Q8 evidence must retain nine Gauss points.');
  const pointErrors = executablePoints.map((row) => {
    const expected = oraclePoints.get(row.pointId); if (!expected) throw new TypeError(`Unexpected executable Gauss point ${row.pointId}.`);
    return Object.freeze({ pointId: row.pointId, determinantRelativeError: scalarRelativeError(expected.determinant, row.jacobianDeterminant ?? row.determinant), bMatrixRelativeError: matrixRelativeError(expected.B, row.B) });
  });
  const maximumPointError = Math.max(...pointErrors.flatMap((row) => [row.determinantRelativeError, row.bMatrixRelativeError]));
  return Object.freeze({ benchmarkId: 'BKT-B-SH-Q8-ORACLE-EXECUTABLE-DIFFERENTIAL-001', stiffnessRelativeError: stiffnessError, maximumPointRelativeError: maximumPointError, pointErrors: Object.freeze(pointErrors), relativeTolerance, accepted: stiffnessError <= relativeTolerance && maximumPointError <= relativeTolerance });
}
export function standardQ8Rectangle(width = 2, height = 1) { return Object.freeze([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }, { x: width / 2, y: 0 }, { x: width, y: height / 2 }, { x: width / 2, y: height }, { x: 0, y: height / 2 }].map(Object.freeze)); }
export function distortedQ8Patch() { return Object.freeze([{ x: 0, y: 0 }, { x: 2.2, y: 0.15 }, { x: 1.85, y: 1.2 }, { x: -0.15, y: 0.9 }, { x: 1.05, y: -0.05 }, { x: 2.1, y: 0.68 }, { x: 0.82, y: 1.12 }, { x: -0.12, y: 0.42 }].map(Object.freeze)); }
function addBtDB(K, B, D, scale) { const DB = D.map((row) => Array.from({ length: 16 }, (_, j) => row.reduce((sum, value, k) => sum + value * B[k][j], 0))); for (let i = 0; i < 16; i += 1) for (let j = 0; j < 16; j += 1) { let value = 0; for (let k = 0; k < 3; k += 1) value += B[k][i] * DB[k][j]; K[i][j] += value * scale; } }
function zeros(r, c) { return Array.from({ length: r }, () => new Array(c).fill(0)); }
function symmetryResidual(matrix) { let result = 0; for (let i = 0; i < matrix.length; i += 1) for (let j = 0; j < matrix.length; j += 1) result = Math.max(result, Math.abs(matrix[i][j] - matrix[j][i])); return result; }
function matrixRelativeError(a, b) { if (!Array.isArray(b) || a.length !== b.length) return Infinity; let error = 0; for (let i = 0; i < a.length; i += 1) { if (!Array.isArray(b[i]) || a[i].length !== b[i].length) return Infinity; for (let j = 0; j < a[i].length; j += 1) error = Math.max(error, scalarRelativeError(a[i][j], b[i][j])); } return error; }
function scalarRelativeError(a, b) { if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity; return Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)); }
function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function sumEven(v) { return v.reduce((s, x, i) => s + (i % 2 === 0 ? x : 0), 0); }
function sumOdd(v) { return v.reduce((s, x, i) => s + (i % 2 === 1 ? x : 0), 0); }
function maxAbs(values) { return Math.max(0, ...values.map((value) => Math.abs(value))); }
