export const INTERFACE_PROFILE_ID = 'BKT_B_CONFORMAL_INTERFACE_RESULTANTS_V1';

export function tractionFromStress(stress, normal) {
  const [nx, ny] = unit(normal);
  return Object.freeze([
    Number(stress.sigmaX ?? 0) * nx + Number(stress.tauXY ?? 0) * ny,
    Number(stress.tauXY ?? 0) * nx + Number(stress.sigmaY ?? 0) * ny,
  ]);
}

export function evaluateConformalInterface({ interfaceId, samples, normal, tangent, momentOrigin = 0, compatibilityTolerance = 1e-9 } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) throw new TypeError('Interface requires at least two ordered samples.');
  const n = unit(normal); const t = unit(tangent);
  for (let i = 1; i < samples.length; i += 1) if (!(samples[i].position > samples[i - 1].position)) throw new TypeError('Interface samples must be strictly ordered.');
  const left = samples.map((row) => resolveSide(row.left, n));
  const right = samples.map((row) => resolveSide(row.right, [-n[0], -n[1]]));
  const positions = samples.map((row) => row.position);
  const leftResultant = integrateVector(positions, left.map((row) => row.traction));
  const rightResultant = integrateVector(positions, right.map((row) => row.traction));
  const equilibriumResidual = Object.freeze([leftResultant[0] + rightResultant[0], leftResultant[1] + rightResultant[1]]);
  const leftMoment = integrateScalar(positions, left.map((row, i) => (positions[i] - momentOrigin) * dot(row.traction, t)));
  const rightMoment = integrateScalar(positions, right.map((row, i) => (positions[i] - momentOrigin) * dot(row.traction, t)));
  const compatibility = samples.map((row, i) => {
    const du = [left[i].displacement[0] - right[i].displacement[0], left[i].displacement[1] - right[i].displacement[1]];
    return Object.freeze({ position: row.position, vector: Object.freeze(du), magnitude: Math.hypot(...du) });
  });
  const maximumCompatibilityResidual = Math.max(...compatibility.map((row) => row.magnitude));
  return Object.freeze({
    interfaceProfileId: INTERFACE_PROFILE_ID,
    interfaceId,
    normal: Object.freeze(n),
    tangent: Object.freeze(t),
    tractionSignConvention: 'LEFT_USES_DECLARED_NORMAL; RIGHT_USES_OPPOSITE_NORMAL; RESULTANTS_SUM_TO_ZERO',
    leftForceResultant: Object.freeze(leftResultant),
    rightForceResultant: Object.freeze(rightResultant),
    forceEquilibriumResidual: equilibriumResidual,
    leftMomentResultant: leftMoment,
    rightMomentResultant: rightMoment,
    momentEquilibriumResidual: leftMoment + rightMoment,
    displacementCompatibility: Object.freeze(compatibility),
    maximumCompatibilityResidual,
    compatibilityTolerance,
    accepted: Math.hypot(...equilibriumResidual) <= 1e-8 && Math.abs(leftMoment + rightMoment) <= 1e-8 && maximumCompatibilityResidual <= compatibilityTolerance,
  });
}

export function runInterfaceManufacturedBenchmarks() {
  const positions = [0, 0.5, 1];
  const make = (caseId, tractionAt, displacementAt) => evaluateConformalInterface({
    interfaceId: caseId, normal: [1, 0], tangent: [0, 1],
    samples: positions.map((position) => {
      const traction = tractionAt(position); const displacement = displacementAt(position);
      return { position, left: { traction, displacement }, right: { traction: [-traction[0], -traction[1]], displacement } };
    }),
  });
  const cases = Object.freeze({
    UNIFORM_TENSION: make('UNIFORM_TENSION', () => [10, 0], (s) => [0.01 * s, 0]),
    PURE_SHEAR: make('PURE_SHEAR', () => [0, 6], (s) => [0, 0.02 * s]),
    BENDING: make('BENDING', (s) => [20 * (s - 0.5), 0], (s) => [0.01 * s, 0]),
    DISSIMILAR_MODULUS: make('DISSIMILAR_MODULUS', () => [8, 2], (s) => [0.005 * s, -0.003 * s]),
  });
  return Object.freeze({ benchmarkId: 'BKT-B-SH-INTERFACE-001', cases, accepted: Object.values(cases).every((row) => row.accepted) });
}

function resolveSide(side, normal) {
  if (!side) throw new TypeError('Both interface sides are required.');
  const traction = side.traction ? [Number(side.traction[0]), Number(side.traction[1])] : tractionFromStress(side.stress, normal);
  const displacement = [Number(side.displacement?.[0] ?? 0), Number(side.displacement?.[1] ?? 0)];
  if (![...traction, ...displacement].every(Number.isFinite)) throw new TypeError('Interface traction and displacement values must be finite.');
  return { traction, displacement };
}
function integrateVector(x, vectors) { return [integrateScalar(x, vectors.map((v) => v[0])), integrateScalar(x, vectors.map((v) => v[1]))]; }
function integrateScalar(x, y) { let total = 0; for (let i = 1; i < x.length; i += 1) total += (x[i] - x[i - 1]) * (y[i] + y[i - 1]) / 2; return total; }
function unit(v) { const x = Number(v?.[0]); const y = Number(v?.[1]); const length = Math.hypot(x, y); if (!(length > 0)) throw new TypeError('Interface direction must be nonzero.'); return [x / length, y / length]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
