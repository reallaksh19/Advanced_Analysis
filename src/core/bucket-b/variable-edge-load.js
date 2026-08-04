export const LOAD_INTEGRATION_PROFILE_ID = 'Q8_QUADRATIC_EDGE_GAUSS_3_LOAD_INTEGRATION_V1';
export const LOAD_REFERENCE_PROFILE_ID = 'Q8_EDGE_COMPOSITE_SIMPSON_REFERENCE_V1';
export const VARIABLE_EDGE_LOAD_FORMULA_IDS = Object.freeze({ TRACTION: 'Q8_VARIABLE_EDGE_TRACTION_CONSISTENT_LOAD_V1', PRESSURE: 'Q8_VARIABLE_EDGE_PRESSURE_CONSISTENT_LOAD_V1', RESULTANT: 'Q8_EDGE_LOAD_RESULTANT_AND_MOMENT_NORMALIZATION_V2' });
const A = Math.sqrt(3 / 5);
const GAUSS = Object.freeze([[-A, 5 / 9], [0, 8 / 9], [A, 5 / 9]].map(([s, weight], i) => Object.freeze({ id: `EGP${i + 1}`, s, weight })));

export function integrateVariableEdgeLoad({ nodes, thickness = 1, tractionAt, pressureAt, momentOrigin = { x: 0, y: 0 } } = {}) {
  validateInputs(nodes, tractionAt, pressureAt, momentOrigin);
  const t = finitePositive(thickness, 'thickness'); const forces = nodes.map(() => [0, 0]); const resultant = [0, 0]; let moment = 0; let arcLength = 0; const gaussEvidence = [];
  for (const gp of GAUSS) {
    const { N, dNds } = edgeShape(gp.s, nodes.length); const geometry = edgeGeometry(nodes, N, dNds, gp.s);
    const traction = resolveTraction({ tractionAt, pressureAt, gp: gp.s, geometry }); const scale = gp.weight * geometry.jacobian * t;
    arcLength += gp.weight * geometry.jacobian; resultant[0] += traction[0] * scale; resultant[1] += traction[1] * scale;
    moment += crossMoment(geometry.x, geometry.y, traction[0] * scale, traction[1] * scale, momentOrigin);
    N.forEach((shape, i) => { forces[i][0] += shape * traction[0] * scale; forces[i][1] += shape * traction[1] * scale; });
    gaussEvidence.push(Object.freeze({ ...geometry, pointId: gp.id, weight: gp.weight, traction: Object.freeze(traction), scale }));
  }
  const nodalResultant = forces.reduce((sum, row) => [sum[0] + row[0], sum[1] + row[1]], [0, 0]);
  const nodalMoment = forces.reduce((sum, row, i) => sum + crossMoment(nodes[i].x, nodes[i].y, row[0], row[1], momentOrigin), 0);
  return Object.freeze({ loadIntegrationProfileId: LOAD_INTEGRATION_PROFILE_ID, arcLength, forces: Object.freeze(forces.map((row) => Object.freeze(row))), resultant: Object.freeze(resultant), moment, nodalResultant: Object.freeze(nodalResultant), nodalMoment, normalizationResidual: Object.freeze([nodalResultant[0] - resultant[0], nodalResultant[1] - resultant[1], nodalMoment - moment]), gaussEvidence: Object.freeze(gaussEvidence) });
}

export function independentlyReferenceEdgeLoad({ nodes, thickness = 1, tractionAt, pressureAt, momentOrigin = { x: 0, y: 0 }, intervals = 4096 } = {}) {
  validateInputs(nodes, tractionAt, pressureAt, momentOrigin); if (!Number.isInteger(intervals) || intervals < 32 || intervals % 2 !== 0) throw new TypeError('Reference intervals must be an even integer >= 32.');
  const t = finitePositive(thickness, 'thickness'); const h = 2 / intervals; const accumulated = [0, 0, 0, 0];
  for (let i = 0; i <= intervals; i += 1) {
    const s = -1 + i * h; const { N, dNds } = edgeShape(s, nodes.length); const geometry = edgeGeometry(nodes, N, dNds, s); const traction = resolveTraction({ tractionAt, pressureAt, gp: s, geometry });
    const coefficient = i === 0 || i === intervals ? 1 : i % 2 === 0 ? 2 : 4;
    accumulated[0] += coefficient * geometry.jacobian;
    accumulated[1] += coefficient * traction[0] * geometry.jacobian * t;
    accumulated[2] += coefficient * traction[1] * geometry.jacobian * t;
    accumulated[3] += coefficient * ((geometry.x - momentOrigin.x) * traction[1] - (geometry.y - momentOrigin.y) * traction[0]) * geometry.jacobian * t;
  }
  return Object.freeze({ referenceProfileId: LOAD_REFERENCE_PROFILE_ID, intervals, arcLength: accumulated[0] * h / 3, resultant: Object.freeze([accumulated[1] * h / 3, accumulated[2] * h / 3]), moment: accumulated[3] * h / 3 });
}

export function compareEdgeLoadToReference(observed, reference, tolerance = 2e-8) {
  const errors = Object.freeze({ arcLength: relativeError(observed.arcLength, reference.arcLength), resultantX: relativeError(observed.resultant[0], reference.resultant[0]), resultantY: relativeError(observed.resultant[1], reference.resultant[1]), moment: relativeError(observed.moment, reference.moment), nodalResultantX: relativeError(observed.nodalResultant[0], reference.resultant[0]), nodalResultantY: relativeError(observed.nodalResultant[1], reference.resultant[1]), nodalMoment: relativeError(observed.nodalMoment, reference.moment) });
  return Object.freeze({ tolerance, errors, maximumRelativeError: Math.max(...Object.values(errors)), accepted: Object.values(errors).every((value) => value <= tolerance) });
}
export function cosinePressureLaw({ amplitude, direction = [1, 0], center = { x: 0, y: 0 }, compressiveOnly = false } = {}) { const p0 = Number(amplitude); const unit = normalize(direction); if (!Number.isFinite(p0)) throw new TypeError('Cosine pressure amplitude must be finite.'); return (_s, x, y) => { const radial = normalize([x - center.x, y - center.y]); const cosine = radial[0] * unit[0] + radial[1] * unit[1]; return p0 * (compressiveOnly ? Math.max(0, cosine) : cosine); }; }
export function kirschTractionLaw({ sigma0, holeRadius, center = { x: 0, y: 0 } } = {}) {
  const s0 = Number(sigma0); const a = Number(holeRadius); if (!Number.isFinite(s0) || !(a > 0)) throw new TypeError('Kirsch traction requires finite sigma0 and positive holeRadius.');
  return (_s, x, y, normal) => { const dx = x - center.x; const dy = y - center.y; const r = Math.hypot(dx, dy); if (!(r >= a)) throw new RangeError('Kirsch traction is only defined at or outside the hole radius.'); const theta = Math.atan2(dy, dx); const c2 = Math.cos(2 * theta); const s2 = Math.sin(2 * theta); const ar2 = (a * a) / (r * r); const ar4 = ar2 * ar2; const sigmaR = 0.5 * s0 * (1 - ar2) + 0.5 * s0 * (1 - 4 * ar2 + 3 * ar4) * c2; const sigmaTheta = 0.5 * s0 * (1 + ar2) - 0.5 * s0 * (1 + 3 * ar4) * c2; const tauRTheta = -0.5 * s0 * (1 + 2 * ar2 - 3 * ar4) * s2; const c = Math.cos(theta); const sn = Math.sin(theta); const sigmaX = sigmaR * c * c + sigmaTheta * sn * sn - 2 * tauRTheta * sn * c; const sigmaY = sigmaR * sn * sn + sigmaTheta * c * c + 2 * tauRTheta * sn * c; const tauXY = (sigmaR - sigmaTheta) * sn * c + tauRTheta * (c * c - sn * sn); return [sigmaX * normal[0] + tauXY * normal[1], tauXY * normal[0] + sigmaY * normal[1]]; };
}
export function runCurvedEdgeLoadBenchmarks() {
  const r = 2;
  const straightDefinition = { nodes: [{ x: 0, y: 0 }, { x: 2, y: 0 }], thickness: 3, tractionAt: () => [5, -2] };
  const straightObserved = integrateVariableEdgeLoad(straightDefinition); const straightReference = independentlyReferenceEdgeLoad(straightDefinition); const straightComparison = compareEdgeLoadToReference(straightObserved, straightReference);
  const cases = {
    CONSTANT_TRACTION: Object.freeze({ caseId: 'CONSTANT_TRACTION', observed: straightObserved, reference: straightReference, comparison: straightComparison, accepted: straightComparison.accepted && Math.hypot(...straightObserved.normalizationResidual) <= 1e-10 }),
    UNIFORM_CURVED_PRESSURE: boundaryCase('UNIFORM_CURVED_PRESSURE', quadraticArcEdges(r, 0, Math.PI / 2, 16), { pressureAt: () => 4 }),
    COSINE_BEARING_PRESSURE: boundaryCase('COSINE_BEARING_PRESSURE', quadraticArcEdges(r, 0, Math.PI / 2, 16), { pressureAt: cosinePressureLaw({ amplitude: 4, direction: [1, 0] }) }),
    KIRSCH_ANALYTICAL_TRACTION: boundaryCase('KIRSCH_ANALYTICAL_TRACTION', quadraticArcEdges(r, 0, Math.PI / 2, 16), { tractionAt: kirschTractionLaw({ sigma0: 100, holeRadius: 1 }) }),
  };
  return Object.freeze({ benchmarkId: 'BKT-B-SH-Q8-CURVED-LOAD-001', cases: Object.freeze(cases), accepted: Object.values(cases).every((row) => row.accepted) });
}
function boundaryCase(caseId, edges, definition) {
  const observedRows = edges.map((nodes) => integrateVariableEdgeLoad({ ...definition, nodes })); const referenceRows = edges.map((nodes) => independentlyReferenceEdgeLoad({ ...definition, nodes, intervals: 512 }));
  const observed = aggregateObserved(observedRows); const reference = aggregateReference(referenceRows); const comparison = compareEdgeLoadToReference(observed, reference);
  return Object.freeze({ caseId, edgeCount: edges.length, observed, reference, comparison, accepted: comparison.accepted && Math.hypot(...observed.normalizationResidual) <= 1e-10 });
}
function quadraticArcEdges(radius, startAngle, endAngle, segmentCount) { return Array.from({ length: segmentCount }, (_, index) => { const a0 = startAngle + (endAngle - startAngle) * index / segmentCount; const a1 = startAngle + (endAngle - startAngle) * (index + 1) / segmentCount; const am = (a0 + a1) / 2; const point = (angle) => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) }); return Object.freeze([point(a0), point(am), point(a1)].map(Object.freeze)); }); }
function aggregateObserved(rows) {
  const observed = { arcLength: 0, resultant: [0, 0], moment: 0, nodalResultant: [0, 0], nodalMoment: 0, normalizationResidual: [0, 0, 0] };
  rows.forEach((row) => { observed.arcLength += row.arcLength; observed.resultant[0] += row.resultant[0]; observed.resultant[1] += row.resultant[1]; observed.moment += row.moment; observed.nodalResultant[0] += row.nodalResultant[0]; observed.nodalResultant[1] += row.nodalResultant[1]; observed.nodalMoment += row.nodalMoment; });
  observed.normalizationResidual = [observed.nodalResultant[0] - observed.resultant[0], observed.nodalResultant[1] - observed.resultant[1], observed.nodalMoment - observed.moment];
  return Object.freeze({ ...observed, resultant: Object.freeze(observed.resultant), nodalResultant: Object.freeze(observed.nodalResultant), normalizationResidual: Object.freeze(observed.normalizationResidual) });
}
function aggregateReference(rows) { const reference = { referenceProfileId: LOAD_REFERENCE_PROFILE_ID, arcLength: 0, resultant: [0, 0], moment: 0 }; rows.forEach((row) => { reference.arcLength += row.arcLength; reference.resultant[0] += row.resultant[0]; reference.resultant[1] += row.resultant[1]; reference.moment += row.moment; }); return Object.freeze({ ...reference, resultant: Object.freeze(reference.resultant) }); }
function resolveTraction({ tractionAt, pressureAt, gp, geometry }) { if (typeof tractionAt === 'function') return requireVector(tractionAt(gp, geometry.x, geometry.y, geometry.outwardNormal, geometry.tangent), 'tractionAt'); const pressure = Number(pressureAt(gp, geometry.x, geometry.y)); if (!Number.isFinite(pressure)) throw new TypeError('pressureAt must return a finite number.'); return [-pressure * geometry.outwardNormal[0], -pressure * geometry.outwardNormal[1]]; }
function validateInputs(nodes, tractionAt, pressureAt, momentOrigin) { if (!Array.isArray(nodes) || ![2, 3].includes(nodes.length) || !nodes.every((n) => Number.isFinite(n?.x) && Number.isFinite(n?.y))) throw new TypeError('Boundary edge requires two or three finite nodes.'); if ((typeof tractionAt === 'function') === (typeof pressureAt === 'function')) throw new TypeError('Provide exactly one of tractionAt or pressureAt.'); if (!Number.isFinite(momentOrigin?.x) || !Number.isFinite(momentOrigin?.y)) throw new TypeError('momentOrigin must contain finite x and y.'); }
function edgeShape(s, count) { if (count === 2) return { N: [(1 - s) / 2, (1 + s) / 2], dNds: [-0.5, 0.5] }; return { N: [s * (s - 1) / 2, 1 - s * s, s * (s + 1) / 2], dNds: [s - 0.5, -2 * s, s + 0.5] }; }
function edgeGeometry(nodes, N, dNds, s) { let x = 0; let y = 0; let dxds = 0; let dyds = 0; nodes.forEach((node, i) => { x += N[i] * node.x; y += N[i] * node.y; dxds += dNds[i] * node.x; dyds += dNds[i] * node.y; }); const jacobian = Math.hypot(dxds, dyds); if (!(jacobian > 0)) throw new RangeError(`Degenerate edge Jacobian at s=${s}.`); const tangent = [dxds / jacobian, dyds / jacobian]; return { s, x, y, jacobian, tangent: Object.freeze(tangent), outwardNormal: Object.freeze([tangent[1], -tangent[0]]) }; }
function crossMoment(x, y, fx, fy, origin) { return (x - origin.x) * fy - (y - origin.y) * fx; }
function relativeError(a, b) { return Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b)); }
function normalize(v) { const x = Number(v?.[0]); const y = Number(v?.[1]); const n = Math.hypot(x, y); if (!(n > 0)) throw new TypeError('Direction must be nonzero.'); return [x / n, y / n]; }
function requireVector(v, name) { if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) throw new TypeError(`${name} must return [tx, ty].`); return [v[0], v[1]]; }
function finitePositive(value, name) { const n = Number(value); if (!(n > 0) || !Number.isFinite(n)) throw new TypeError(`${name} must be finite and positive.`); return n; }
