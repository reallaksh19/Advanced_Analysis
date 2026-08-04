export const INTERFACE_PROFILE_ID = 'BKT_B_CONFORMAL_INTERFACE_RESULTANTS_V2';
export function tractionFromStress(stress, normal) {
  const [nx, ny] = unit(normal); requireStress(stress);
  return Object.freeze([stress.sigmaX * nx + stress.tauXY * ny, stress.tauXY * nx + stress.sigmaY * ny]);
}
export function evaluateConformalInterface({ interfaceId, samples, normal, tangent, momentOrigin = { x: 0, y: 0 }, absoluteTolerance = 1e-10, relativeTolerance = 1e-8, compatibilityTolerance = 1e-9 } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) throw new TypeError('Interface requires at least two ordered samples.');
  if (!Number.isFinite(momentOrigin?.x) || !Number.isFinite(momentOrigin?.y)) throw new TypeError('momentOrigin must contain finite x and y.');
  const frame = orthonormalFrame(normal, tangent); const n = frame.normal; const t = frame.tangent;
  for (let i = 1; i < samples.length; i += 1) if (!(samples[i].position > samples[i - 1].position)) throw new TypeError('Interface samples must be strictly ordered.');
  const left = samples.map((row, i) => resolveSide(row.left, n, `samples[${i}].left`)); const right = samples.map((row, i) => resolveSide(row.right, [-n[0], -n[1]], `samples[${i}].right`));
  const positions = samples.map((row) => row.position); const points = samples.map((row) => requirePoint(row.point));
  const leftResultant = integrateVector(positions, left.map((row) => row.traction)); const rightResultant = integrateVector(positions, right.map((row) => row.traction));
  const forceResidual = [leftResultant[0] + rightResultant[0], leftResultant[1] + rightResultant[1]];
  const leftMoment = integrateScalar(positions, left.map((row, i) => crossMoment(points[i], row.traction, momentOrigin))); const rightMoment = integrateScalar(positions, right.map((row, i) => crossMoment(points[i], row.traction, momentOrigin))); const momentResidual = leftMoment + rightMoment;
  const compatibility = samples.map((row, i) => { const du = [left[i].displacement[0] - right[i].displacement[0], left[i].displacement[1] - right[i].displacement[1]]; return Object.freeze({ position: row.position, point: points[i], vector: Object.freeze(du), magnitude: Math.hypot(...du) }); });
  const maximumCompatibilityResidual = Math.max(...compatibility.map((row) => row.magnitude));
  const forceScale = Math.max(1, Math.hypot(...leftResultant), Math.hypot(...rightResultant)); const momentScale = Math.max(1, Math.abs(leftMoment), Math.abs(rightMoment)); const forceTolerance = absoluteTolerance + relativeTolerance * forceScale; const momentTolerance = absoluteTolerance + relativeTolerance * momentScale;
  return Object.freeze({ interfaceProfileId: INTERFACE_PROFILE_ID, interfaceId, normal: Object.freeze(n), tangent: Object.freeze(t), handedness: frame.handedness, tractionSignConvention: 'LEFT_STRESS_DOT_DECLARED_NORMAL; RIGHT_STRESS_DOT_OPPOSITE_NORMAL; RESULTANTS_SUM_TO_ZERO', leftForceResultant: Object.freeze(leftResultant), rightForceResultant: Object.freeze(rightResultant), forceEquilibriumResidual: Object.freeze(forceResidual), forceTolerance, leftMomentResultant: leftMoment, rightMomentResultant: rightMoment, momentEquilibriumResidual: momentResidual, momentTolerance, displacementCompatibility: Object.freeze(compatibility), maximumCompatibilityResidual, compatibilityTolerance, accepted: Math.hypot(...forceResidual) <= forceTolerance && Math.abs(momentResidual) <= momentTolerance && maximumCompatibilityResidual <= compatibilityTolerance });
}
export function runInterfaceManufacturedBenchmarks() {
  const positions = [0, 0.25, 0.5, 0.75, 1]; const normal = [1, 0]; const tangent = [0, 1];
  const make = (caseId, fieldAt) => evaluateConformalInterface({ interfaceId: caseId, normal, tangent, samples: positions.map((position) => { const field = fieldAt(position); return { position, point: { x: 0, y: position }, left: { stress: field.leftStress, displacement: field.leftDisplacement }, right: { stress: field.rightStress, displacement: field.rightDisplacement } }; }) });
  const cases = {
    UNIFORM_TENSION: make('UNIFORM_TENSION', (s) => ({ leftStress: stressFromTraction(10, 0), rightStress: stressFromTraction(10, 0), leftDisplacement: [0.01 * s, 0], rightDisplacement: [0.01 * s, 0] })),
    PURE_SHEAR: make('PURE_SHEAR', (s) => ({ leftStress: stressFromTraction(0, 6), rightStress: stressFromTraction(0, 6), leftDisplacement: [0, 0.02 * s], rightDisplacement: [0, 0.02 * s] })),
    BENDING: make('BENDING', (s) => ({ leftStress: stressFromTraction(20 * (s - 0.5), 0), rightStress: stressFromTraction(20 * (s - 0.5), 0), leftDisplacement: [0.01 * s, 0], rightDisplacement: [0.01 * s, 0] })),
    DISSIMILAR_MODULUS: make('DISSIMILAR_MODULUS', (s) => { const sigma = 8; const ELeft = 210000; const ERight = 70000; return { leftStress: { ...stressFromTraction(sigma, 2), materialId: 'LEFT', elasticModulus: ELeft, epsilonNormal: sigma / ELeft }, rightStress: { ...stressFromTraction(sigma, 2), materialId: 'RIGHT', elasticModulus: ERight, epsilonNormal: sigma / ERight }, leftDisplacement: [0.005 * s, -0.003 * s], rightDisplacement: [0.005 * s, -0.003 * s] }; }),
  };
  const incompatible = make('NEGATIVE_INCOMPATIBLE', (s) => ({ leftStress: stressFromTraction(10, 0), rightStress: stressFromTraction(10, 0), leftDisplacement: [0, 0], rightDisplacement: [s === 0.5 ? 1e-4 : 0, 0] }));
  const tractionMismatch = make('NEGATIVE_TRACTION_MISMATCH', () => ({ leftStress: stressFromTraction(10, 0), rightStress: stressFromTraction(9, 0), leftDisplacement: [0, 0], rightDisplacement: [0, 0] }));
  return Object.freeze({ benchmarkId: 'BKT-B-SH-INTERFACE-001', cases: Object.freeze(cases), negativeCases: Object.freeze({ incompatible, tractionMismatch }), accepted: Object.values(cases).every((row) => row.accepted) && !incompatible.accepted && !tractionMismatch.accepted });
}
function resolveSide(side, normal, path) { if (!side || side.traction !== undefined) throw new TypeError(`${path} must provide stress-derived traction evidence; direct traction input is forbidden.`); const traction = tractionFromStress(side.stress, normal); const displacement = [Number(side.displacement?.[0]), Number(side.displacement?.[1])]; if (!displacement.every(Number.isFinite)) throw new TypeError(`${path} displacement values must be finite.`); return { traction, displacement, stress: side.stress }; }
function stressFromTraction(normalTraction, shearTraction) { return { sigmaX: normalTraction, sigmaY: 0, sigmaZ: 0, tauXY: shearTraction }; }
function requireStress(stress) { if (!stress || !['sigmaX', 'sigmaY', 'sigmaZ', 'tauXY'].every((key) => Number.isFinite(stress[key]))) throw new TypeError('Interface stress tensor must contain finite sigmaX, sigmaY, sigmaZ and tauXY.'); }
function requirePoint(point) { if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new TypeError('Interface sample point must contain finite x and y.'); return Object.freeze({ x: point.x, y: point.y }); }
function orthonormalFrame(normal, tangent) { const n = unit(normal); const t = unit(tangent); const orthogonality = Math.abs(n[0] * t[0] + n[1] * t[1]); const handedness = n[0] * t[1] - n[1] * t[0]; if (orthogonality > 1e-10 || handedness <= 0) throw new TypeError('Interface normal and tangent must be orthonormal and positively handed.'); return { normal: n, tangent: t, handedness: 'POSITIVE_2D' }; }
function integrateVector(x, vectors) { return [integrateScalar(x, vectors.map((v) => v[0])), integrateScalar(x, vectors.map((v) => v[1]))]; }
function integrateScalar(x, y) { let total = 0; for (let i = 1; i < x.length; i += 1) total += (x[i] - x[i - 1]) * (y[i] + y[i - 1]) / 2; return total; }
function crossMoment(point, traction, origin) { return (point.x - origin.x) * traction[1] - (point.y - origin.y) * traction[0]; }
function unit(v) { const x = Number(v?.[0]); const y = Number(v?.[1]); const length = Math.hypot(x, y); if (!(length > 0)) throw new TypeError('Interface direction must be nonzero.'); return [x / length, y / length]; }
