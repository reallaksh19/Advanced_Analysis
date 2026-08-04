import { recoverAtPhysicalCoordinate } from './fixed-coordinate-recovery.js';
export const PATH_EXTRACTION_PROFILE_ID = 'Q8_GEOMETRY_PATH_TO_AUTHORITATIVE_SAMPLE_V2';
export const SCL_PROFILE_ID = 'COMPONENT_WISE_MEMBRANE_BENDING_PEAK_V2';
const COMPONENTS = Object.freeze(['sigmaX', 'sigmaY', 'sigmaZ', 'tauXY']);
const AUTHORITIES = new Set(['INTEGRATION_POINT_INTERPOLATED', 'INTEGRATION_POINT', 'MANUFACTURED_AUTHORITATIVE']);
export function extractQ8Path({ pathId, points, elements, localFrameAt, elementSelector } = {}) {
  if (typeof pathId !== 'string' || !pathId) throw new TypeError('pathId is required.');
  if (!Array.isArray(points) || points.length < 2) throw new TypeError('Path requires at least two points.');
  if (!Array.isArray(elements) || elements.length === 0) throw new TypeError('Path extraction requires Q8 elements.');
  let position = 0;
  const samples = points.map((point, index) => {
    if (index > 0) position += Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y);
    const candidates = elements.filter((element) => inBoundingBox(point, element.nodes)); const recoveries = [];
    for (const element of candidates) {
      try { recoveries.push({ element, recovered: recoverAtPhysicalCoordinate({ elementId: element.elementId, nodes: element.nodes, point, gaussPointResults: element.gaussPointResults }) }); }
      catch (error) { if (!(error instanceof RangeError && /not contained/.test(error.message))) throw error; }
    }
    if (recoveries.length === 0) throw new RangeError(`No containing Q8 element found for path point ${index}.`);
    let selected;
    if (recoveries.length === 1) selected = recoveries[0];
    else {
      if (typeof elementSelector !== 'function') throw new RangeError(`AMBIGUOUS_Q8_PATH_CONTAINMENT at path point ${index}.`);
      const selectedId = elementSelector({ point, index, candidates: recoveries.map((row) => ({ elementId: row.element.elementId, regionId: row.element.regionId ?? null, minimumNaturalCoordinateMargin: row.recovered.minimumNaturalCoordinateMargin })) });
      selected = recoveries.find((row) => row.element.elementId === selectedId); if (!selected) throw new RangeError(`Element selector returned an invalid element at path point ${index}.`);
    }
    const recovered = selected.recovered; const frame = normalizeFrame(typeof localFrameAt === 'function' ? localFrameAt(point, index) : { tangent: [1, 0], normal: [0, 1] }); const rotated = rotateStress(recovered.recoveredTensor, frame.tangent, frame.normal);
    return Object.freeze({ pathId, stationId: `${pathId}:S${index + 1}`, position, point: Object.freeze({ x: point.x, y: point.y }), containingElementId: recovered.containingElementId, naturalCoordinates: recovered.naturalCoordinates, mappingResidual: recovered.mappingResidual, minimumNaturalCoordinateMargin: recovered.minimumNaturalCoordinateMargin, sourceGaussPointIds: recovered.sourceGaussPointIds, interpolationWeights: recovered.interpolationWeights, localFrame: frame, stress: Object.freeze({ ...recovered.recoveredTensor, sigmaNormal: rotated.sigmaNormal, sigmaTangent: rotated.sigmaTangent, tauTangentNormal: rotated.tauTangentNormal }), authority: 'INTEGRATION_POINT_INTERPOLATED' });
  });
  return Object.freeze({ pathExtractionProfileId: PATH_EXTRACTION_PROFILE_ID, pathId, samples: Object.freeze(samples) });
}
export function linearizeStressComponents(samples, { lineIdentity, pressureCorrection = null } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) throw new TypeError('SCL requires at least two ordered samples.');
  samples.forEach((row, index) => { if (!AUTHORITIES.has(row.authority)) throw new TypeError(`SCL sample ${index} lacks authoritative recovery custody.`); requireStress(row.stress, `samples[${index}]`); });
  for (let i = 1; i < samples.length; i += 1) if (!(samples[i].position > samples[i - 1].position)) throw new TypeError('SCL samples must be strictly ordered.');
  const z0 = samples[0].position; const z1 = samples.at(-1).position; const length = z1 - z0; if (!(length > 0)) throw new TypeError('SCL length must be positive.'); const mid = (z0 + z1) / 2;
  const membrane = {}; const bending = {}; const positions = samples.map((r) => r.position);
  COMPONENTS.forEach((component) => { const values = samples.map((row) => row.stress[component]); membrane[component] = trapezoid(positions, values) / length; bending[component] = 6 * firstMoment(positions, values, mid) / length ** 2; });
  const correction = normalizePressureCorrection(pressureCorrection); Object.entries(correction.componentCorrections).forEach(([component, value]) => { membrane[component] += value; });
  const peakStations = samples.map((row) => { const factor = 2 * (row.position - mid) / length; return Object.freeze({ position: row.position, throughThicknessFactor: factor, peak: Object.freeze(Object.fromEntries(COMPONENTS.map((component) => [component, row.stress[component] - membrane[component] - bending[component] * factor]))) }); });
  return Object.freeze({ sclProfileId: SCL_PROFILE_ID, lineIdentity, lineLength: length, membrane: Object.freeze(membrane), bending: Object.freeze(bending), peakStations: Object.freeze(peakStations), pressureCorrection: correction.conventionId ? Object.freeze(correction) : null, derivedStressCalculationOrder: 'AFTER_COMPONENT_LINEARIZATION' });
}
export function runSclManufacturedBenchmarks() {
  const z = [-1, -0.5, 0, 0.5, 1]; const cases = [];
  const add = (caseId, fn, expectedMembrane, expectedBending, pressureCorrection = null) => { const samples = z.map((position) => ({ position, authority: 'MANUFACTURED_AUTHORITATIVE', stress: { sigmaX: fn(position), sigmaY: 0, sigmaZ: 0, tauXY: 0 } })); const result = linearizeStressComponents(samples, { lineIdentity: caseId, pressureCorrection }); const accepted = close(result.membrane.sigmaX, expectedMembrane) && close(result.bending.sigmaX, expectedBending); cases.push(Object.freeze({ caseId, result, expected: Object.freeze({ membraneSigmaX: expectedMembrane, bendingSigmaX: expectedBending }), accepted })); };
  add('CONSTANT_MEMBRANE', () => 10, 10, 0); add('PURE_LINEAR_BENDING', (x) => 20 * x, 0, 20); add('MEMBRANE_PLUS_BENDING', (x) => 10 + 20 * x, 10, 20); add('NONLINEAR_RESIDUAL_PEAK', (x) => 10 + 20 * x + 5 * (1 - x * x), 13.125, 20); add('PRESSURE_UNCORRECTED', (x) => 10 + 20 * x, 10, 20); add('PRESSURE_CORRECTED', (x) => 10 + 20 * x, 8, 20, { conventionId: 'SUBTRACT_2_FROM_SIGMA_X_MEMBRANE', componentCorrections: { sigmaX: -2 } });
  const angle = Math.PI / 6; const c = Math.cos(angle); const sn = Math.sin(angle); const rotatedSamples = z.map((position) => { const localNormal = 10 + 20 * position; const localTangent = 4; const localShear = 3; const sigmaX = localTangent * c * c + localNormal * sn * sn - 2 * localShear * sn * c; const sigmaY = localTangent * sn * sn + localNormal * c * c + 2 * localShear * sn * c; const tauXY = (localTangent - localNormal) * sn * c + localShear * (c * c - sn * sn); return { position, authority: 'MANUFACTURED_AUTHORITATIVE', stress: { sigmaX, sigmaY, sigmaZ: 0, tauXY } }; }); const rotated = linearizeStressComponents(rotatedSamples, { lineIdentity: 'ROTATED_TENSOR_FIELD' }); cases.push(Object.freeze({ caseId: 'ROTATED_TENSOR_FIELD', result: rotated, accepted: Object.values(rotated.membrane).every(Number.isFinite) && Object.values(rotated.bending).every(Number.isFinite) }));
  return Object.freeze({ benchmarkId: 'BKT-B-SH-SCL-001', cases: Object.freeze(cases), accepted: cases.every((row) => row.accepted) });
}
function normalizeFrame(frame) { const tLength = Math.hypot(frame.tangent?.[0], frame.tangent?.[1]); const nLength = Math.hypot(frame.normal?.[0], frame.normal?.[1]); if (!(tLength > 0) || !(nLength > 0)) throw new TypeError('Path local frame must contain nonzero tangent and normal vectors.'); const tangent = [frame.tangent[0] / tLength, frame.tangent[1] / tLength]; const normal = [frame.normal[0] / nLength, frame.normal[1] / nLength]; const orthogonality = Math.abs(tangent[0] * normal[0] + tangent[1] * normal[1]); const handedness = tangent[0] * normal[1] - tangent[1] * normal[0]; if (orthogonality > 1e-10 || handedness <= 0) throw new TypeError('Path local frame must be orthonormal and positively handed.'); return Object.freeze({ tangent: Object.freeze(tangent), normal: Object.freeze(normal), handedness: 'POSITIVE_2D' }); }
function rotateStress(stress, tangent, normal) { requireStress(stress, 'recoveredTensor'); const tx = tangent[0]; const ty = tangent[1]; const nx = normal[0]; const ny = normal[1]; const { sigmaX: sx, sigmaY: sy, tauXY: txy } = stress; return { sigmaTangent: sx * tx * tx + 2 * txy * tx * ty + sy * ty * ty, sigmaNormal: sx * nx * nx + 2 * txy * nx * ny + sy * ny * ny, tauTangentNormal: sx * tx * nx + txy * (tx * ny + ty * nx) + sy * ty * ny }; }
function requireStress(stress, path) { if (!stress || typeof stress !== 'object') throw new TypeError(`Missing stress at ${path}.`); COMPONENTS.forEach((component) => { if (!Number.isFinite(stress[component])) throw new TypeError(`Stress component ${component} must be finite at ${path}.`); }); }
function normalizePressureCorrection(value) { if (value === null) return { conventionId: null, componentCorrections: {} }; if (!value || typeof value.conventionId !== 'string' || !value.conventionId || !value.componentCorrections || typeof value.componentCorrections !== 'object') throw new TypeError('Pressure correction requires conventionId and componentCorrections.'); const corrections = {}; Object.entries(value.componentCorrections).forEach(([key, correction]) => { if (!COMPONENTS.includes(key) || !Number.isFinite(correction)) throw new TypeError(`Invalid pressure correction for ${key}.`); corrections[key] = correction; }); return { conventionId: value.conventionId, componentCorrections: corrections }; }
function inBoundingBox(point, nodes) { const xs = nodes.map((n) => n.x); const ys = nodes.map((n) => n.y); const e = 1e-9; return point.x >= Math.min(...xs) - e && point.x <= Math.max(...xs) + e && point.y >= Math.min(...ys) - e && point.y <= Math.max(...ys) + e; }
function trapezoid(x, y) { let total = 0; for (let i = 1; i < x.length; i += 1) total += (x[i] - x[i - 1]) * (y[i] + y[i - 1]) / 2; return total; }
function firstMoment(x, y, mid) { let total = 0; for (let i = 1; i < x.length; i += 1) { const z0 = x[i - 1] - mid; const w = x[i] - x[i - 1]; const a = y[i - 1]; const d = y[i] - a; total += w * (a * z0 + a * w / 2 + d * z0 / 2 + d * w / 3); } return total; }
function close(a, b) { return Math.abs(a - b) <= 1e-11 * Math.max(1, Math.abs(a), Math.abs(b)); }
