import { recoverAtPhysicalCoordinate } from './fixed-coordinate-recovery.js';

export const PATH_EXTRACTION_PROFILE_ID = 'Q8_GEOMETRY_PATH_TO_AUTHORITATIVE_SAMPLE_V1';
export const SCL_PROFILE_ID = 'COMPONENT_WISE_MEMBRANE_BENDING_PEAK_V1';
const COMPONENTS = Object.freeze(['sigmaX', 'sigmaY', 'sigmaZ', 'tauXY']);

export function extractQ8Path({ pathId, points, elements, localFrameAt } = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new TypeError('Path requires at least two points.');
  let position = 0;
  const samples = points.map((point, index) => {
    if (index > 0) position += Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y);
    const candidates = elements.filter((element) => inBoundingBox(point, element.nodes));
    let recovered = null;
    for (const element of candidates) {
      try {
        recovered = recoverAtPhysicalCoordinate({ elementId: element.elementId, nodes: element.nodes, point, gaussPointResults: element.gaussPointResults });
        break;
      } catch { /* try next candidate */ }
    }
    if (!recovered) throw new RangeError(`No containing Q8 element found for path point ${index}.`);
    const frame = normalizeFrame(typeof localFrameAt === 'function' ? localFrameAt(point, index) : { tangent: [1, 0], normal: [0, 1] });
    const rotated = rotateStress(recovered.recoveredTensor, frame.tangent, frame.normal);
    return Object.freeze({
      pathId,
      stationId: `${pathId}:S${index + 1}`,
      position,
      point: Object.freeze({ x: point.x, y: point.y }),
      containingElementId: recovered.containingElementId,
      naturalCoordinates: recovered.naturalCoordinates,
      mappingResidual: recovered.mappingResidual,
      distanceFromElementBoundary: recovered.distanceFromElementBoundary,
      sourceGaussPointIds: recovered.sourceGaussPointIds,
      interpolationWeights: recovered.interpolationWeights,
      stress: Object.freeze({ ...recovered.recoveredTensor, sigmaNormal: rotated.sigmaNormal, sigmaTangent: rotated.sigmaTangent, tauTangentNormal: rotated.tauTangentNormal }),
      authority: 'INTEGRATION_POINT_INTERPOLATED',
    });
  });
  return Object.freeze({ pathExtractionProfileId: PATH_EXTRACTION_PROFILE_ID, pathId, samples: Object.freeze(samples) });
}

export function linearizeStressComponents(samples, { lineIdentity, pressureCorrection = null } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) throw new TypeError('SCL requires at least two ordered samples.');
  for (let i = 1; i < samples.length; i += 1) if (!(samples[i].position > samples[i - 1].position)) throw new TypeError('SCL samples must be strictly ordered.');
  const z0 = samples[0].position; const z1 = samples.at(-1).position; const length = z1 - z0; const mid = (z0 + z1) / 2;
  const membrane = {}; const bending = {};
  COMPONENTS.forEach((component) => {
    const values = samples.map((row) => Number(row.stress[component] ?? 0));
    membrane[component] = trapezoid(samples.map((r) => r.position), values) / length;
    bending[component] = 6 * firstMoment(samples.map((r) => r.position), values, mid) / length ** 2;
  });
  if (pressureCorrection) {
    for (const [component, correction] of Object.entries(pressureCorrection)) {
      if (component in membrane) membrane[component] += Number(correction);
    }
  }
  const peakStations = samples.map((row) => {
    const factor = 2 * (row.position - mid) / length;
    return Object.freeze({
      position: row.position,
      throughThicknessFactor: factor,
      peak: Object.freeze(Object.fromEntries(COMPONENTS.map((component) => [component, Number(row.stress[component] ?? 0) - membrane[component] - bending[component] * factor]))),
    });
  });
  return Object.freeze({
    sclProfileId: SCL_PROFILE_ID,
    lineIdentity,
    lineLength: length,
    membrane: Object.freeze(membrane),
    bending: Object.freeze(bending),
    peakStations: Object.freeze(peakStations),
    pressureCorrection: pressureCorrection ? Object.freeze({ ...pressureCorrection }) : null,
    derivedStressCalculationOrder: 'AFTER_COMPONENT_LINEARIZATION',
  });
}

export function runSclManufacturedBenchmarks() {
  const z = [-1, -0.5, 0, 0.5, 1];
  const scalarCases = [
    ['CONSTANT_MEMBRANE', (x) => 10, null],
    ['PURE_LINEAR_BENDING', (x) => 20 * x, null],
    ['MEMBRANE_PLUS_BENDING', (x) => 10 + 20 * x, null],
    ['NONLINEAR_RESIDUAL_PEAK', (x) => 10 + 20 * x + 5 * (1 - x * x), null],
    ['PRESSURE_UNCORRECTED', (x) => 10 + 20 * x, null],
    ['PRESSURE_CORRECTED', (x) => 10 + 20 * x, { sigmaX: -2 }],
  ];
  const results = scalarCases.map(([caseId, fn, pressureCorrection]) => {
    const samples = z.map((position) => ({ position, stress: { sigmaX: fn(position), sigmaY: 0, sigmaZ: 0, tauXY: 0 } }));
    return Object.freeze({ caseId, result: linearizeStressComponents(samples, { lineIdentity: caseId, pressureCorrection }) });
  });
  const angle = Math.PI / 6; const c = Math.cos(angle); const sn = Math.sin(angle);
  const rotatedSamples = z.map((position) => {
    const localNormal = 10 + 20 * position; const localTangent = 4; const localShear = 3;
    const sigmaX = localTangent * c * c + localNormal * sn * sn - 2 * localShear * sn * c;
    const sigmaY = localTangent * sn * sn + localNormal * c * c + 2 * localShear * sn * c;
    const tauXY = (localTangent - localNormal) * sn * c + localShear * (c * c - sn * sn);
    return { position, stress: { sigmaX, sigmaY, sigmaZ: 0, tauXY } };
  });
  results.push(Object.freeze({ caseId: 'ROTATED_TENSOR_FIELD', result: linearizeStressComponents(rotatedSamples, { lineIdentity: 'ROTATED_TENSOR_FIELD' }) }));
  return Object.freeze(results);
}

function normalizeFrame(frame) {
  const tLength = Math.hypot(frame.tangent?.[0], frame.tangent?.[1]); const nLength = Math.hypot(frame.normal?.[0], frame.normal?.[1]);
  if (!(tLength > 0) || !(nLength > 0)) throw new TypeError('Path local frame must contain nonzero tangent and normal vectors.');
  return { tangent: [frame.tangent[0] / tLength, frame.tangent[1] / tLength], normal: [frame.normal[0] / nLength, frame.normal[1] / nLength] };
}
function rotateStress(stress, tangent, normal) {
  const tx = tangent[0]; const ty = tangent[1]; const nx = normal[0]; const ny = normal[1];
  const sx = Number(stress.sigmaX ?? 0); const sy = Number(stress.sigmaY ?? 0); const txy = Number(stress.tauXY ?? 0);
  return {
    sigmaTangent: sx * tx * tx + 2 * txy * tx * ty + sy * ty * ty,
    sigmaNormal: sx * nx * nx + 2 * txy * nx * ny + sy * ny * ny,
    tauTangentNormal: sx * tx * nx + txy * (tx * ny + ty * nx) + sy * ty * ny,
  };
}
function inBoundingBox(point, nodes) { const xs = nodes.map((n) => n.x); const ys = nodes.map((n) => n.y); const e = 1e-9; return point.x >= Math.min(...xs) - e && point.x <= Math.max(...xs) + e && point.y >= Math.min(...ys) - e && point.y <= Math.max(...ys) + e; }
function trapezoid(x, y) { let total = 0; for (let i = 1; i < x.length; i += 1) total += (x[i] - x[i - 1]) * (y[i] + y[i - 1]) / 2; return total; }
function firstMoment(x, y, mid) { let total = 0; for (let i = 1; i < x.length; i += 1) { const z0 = x[i - 1] - mid; const w = x[i] - x[i - 1]; const a = y[i - 1]; const d = y[i] - a; total += w * (a * z0 + a * w / 2 + d * z0 / 2 + d * w / 3); } return total; }
