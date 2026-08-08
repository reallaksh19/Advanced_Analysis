#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const FIELDS = Object.freeze([
  ['fx', 1, 'AXIAL_FORCE', 'N'], ['fy', 2, 'SHEAR_FORCE', 'N'], ['fz', 2, 'SHEAR_FORCE', 'N'],
  ['mx', 3, 'TORSION', 'N*m'], ['my', 4, 'BENDING_MOMENT', 'N*m'], ['mz', 4, 'BENDING_MOMENT', 'N*m'],
]);
const CLUSTER_NODES = new Set(['22070', '22100', '22110', '22115', '22120', '22125', '22130', '22140']);

function add(a, b) { return a.map((value, index) => value + b[index]); }
function sub(a, b) { return a.map((value, index) => value - b[index]); }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function scale(a, factor) { return a.map((value) => value * factor); }
function norm(a) { return Math.hypot(...a); }
function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function point(geometry, nodeId) {
  const row = geometry.nodes.find((node) => String(node.id) === String(nodeId));
  if (!row) throw new Error(`M046 missing node ${nodeId}.`);
  return [row.x, row.y, row.z];
}
function vector12Parts(vector) {
  return { fI: vector.slice(0, 3), mI: vector.slice(3, 6), fJ: vector.slice(6, 9), mJ: vector.slice(9, 12) };
}
function contributions(analysis) {
  return new Map([
    ...analysis.frames.map(elementContributionFromFrameElement),
    ...analysis.pipingComponents.flatMap(elementContributionsFromPipingComponent),
  ].map((row) => [row.elementId, row]));
}
function loadInvariant(entry, contribution, geometry) {
  const { fI, mI, fJ, mJ } = vector12Parts(contribution.equivalentLoadGlobal);
  const rI = point(geometry, entry.segment.startNodeId);
  const rJ = point(geometry, entry.segment.endNodeId);
  const force = add(fI, fJ);
  const momentOrigin = add(add(mI, mJ), add(cross(rI, fI), cross(rJ, fJ)));
  const expectedMomentOrigin = cross(scale(add(rI, rJ), 0.5), force);
  const momentResidual = sub(momentOrigin, expectedMomentOrigin);
  const directMoment = add(mI, mJ);
  const thermal = vector12Parts(contribution.initialStrainLoadGlobal);
  const thermalForce = add(thermal.fI, thermal.fJ);
  const thermalMomentOrigin = add(add(thermal.mI, thermal.mJ), add(cross(rI, thermal.fI), cross(rJ, thermal.fJ)));
  return Object.freeze({
    elementId: entry.elementId,
    sourceId: entry.sourceSegmentId,
    fromNode: String(entry.segment.startNodeId),
    toNode: String(entry.segment.endNodeId),
    force: Object.freeze(force),
    directMoment: Object.freeze(directMoment),
    momentOrigin: Object.freeze(momentOrigin),
    expectedMomentOrigin: Object.freeze(expectedMomentOrigin),
    momentInvariantResidual: Object.freeze(momentResidual),
    momentInvariantRelative: norm(momentResidual) / Math.max(norm(momentOrigin), norm(expectedMomentOrigin), 1),
    thermalForceResidual: Object.freeze(thermalForce),
    thermalMomentOriginResidual: Object.freeze(thermalMomentOrigin),
    thermalResidualRelative: Math.max(norm(thermalForce), norm(thermalMomentOrigin))
      / Math.max(norm(contribution.initialStrainLoadGlobal), 1),
  });
}
function rigidLoadAudit(solved) {
  const map = contributions(solved.operating);
  const rows = solved.authorities.entries.filter((entry) => entry.sourceEntry.rigidAuthority).map((entry) => {
    assert.equal(entry.teeModifier, null, `M046 rigid ${entry.sourceSegmentId} unexpectedly carries a tee modifier.`);
    const row = loadInvariant(entry, map.get(entry.elementId), solved.authorities.analysisGeometry);
    const authority = entry.sourceEntry.rigidAuthority;
    const expectedWeight = authority.gravity.totalWeight;
    return Object.freeze({
      ...row,
      rigidType: entry.sourceEntry.sourceSegment.meta.analysis.rigid.type,
      enteredRigidWeight: authority.gravity.enteredRigidWeight,
      totalWeight: expectedWeight,
      forceExpected: Object.freeze([0, -expectedWeight, 0]),
      forceResidual: Object.freeze(sub(row.force, [0, -expectedWeight, 0])),
      forceRelative: norm(sub(row.force, [0, -expectedWeight, 0])) / Math.max(expectedWeight, 1),
    });
  });
  const total = (selector) => rows.reduce((sum, row) => sum + selector(row), 0);
  return Object.freeze({
    count: rows.length,
    maximumForceRelative: Math.max(...rows.map((row) => row.forceRelative)),
    maximumMomentInvariantRelative: Math.max(...rows.map((row) => row.momentInvariantRelative)),
    maximumThermalResidualRelative: Math.max(...rows.map((row) => row.thermalResidualRelative)),
    sumDirectMoment: Object.freeze([0, 1, 2].map((axis) => rows.reduce((sum, row) => sum + row.directMoment[axis], 0))),
    sumWeight: total((row) => row.totalWeight),
    rows: Object.freeze(rows),
  });
}
function sourceActions(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const out = new Map();
  for (const source of solved.authorities.base.entries) {
    const sourceId = String(source.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M046 missing source recovery ${sourceId}.`);
    out.set(pairKey(source), Object.freeze({ sourceId, I: first.local.I, J: last.local.J }));
  }
  return out;
}
function sourceCases(solved) {
  const sus = sourceActions(solved, solved.sustained.recovery);
  const ope = sourceActions(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    const end = (which) => Object.fromEntries(FIELDS.map(([field]) => [field, hot[which][field] - cold[which][field]]));
    exp.set(key, Object.freeze({ sourceId: hot.sourceId, I: Object.freeze(end('I')), J: Object.freeze(end('J')) }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function rigidDistances(solved) {
  const entries = solved.authorities.base.entries;
  const byId = new Map(entries.map((entry) => [String(entry.sourceSegment.id), entry]));
  const atNode = new Map();
  for (const entry of entries) for (const node of [entry.sourceSegment.startNodeId, entry.sourceSegment.endNodeId]) {
    const key = String(node); if (!atNode.has(key)) atNode.set(key, []); atNode.get(key).push(String(entry.sourceSegment.id));
  }
  const neighbors = new Map(entries.map((entry) => [String(entry.sourceSegment.id), new Set()]));
  for (const ids of atNode.values()) for (const a of ids) for (const b of ids) if (a !== b) neighbors.get(a).add(b);
  const distance = new Map();
  const queue = entries.filter((entry) => entry.rigidAuthority).map((entry) => String(entry.sourceSegment.id));
  for (const id of queue) distance.set(id, 0);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    for (const next of neighbors.get(id)) if (!distance.has(next)) { distance.set(next, distance.get(id) + 1); queue.push(next); }
  }
  assert.equal(distance.size, byId.size, 'M046 expects every BM4 source component connected to a rigid-distance seed.');
  return distance;
}
function compare(ours, cii, field) {
  const delta = ours - cii;
  const absDelta = Math.abs(delta);
  const isForce = ['fx', 'fy', 'fz'].includes(field);
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const absPercent = nearZero ? null : absDelta / Math.abs(cii) * 100;
  const severity = nearZero
    ? absDelta / (isForce ? BM4_COMPARISON_POLICY.absoluteTolerance.force : BM4_COMPARISON_POLICY.absoluteTolerance.moment)
    : absPercent / BM4_COMPARISON_POLICY.targetTolerancePercent;
  return Object.freeze({ ours, cii, delta, absDelta, absPercent, normalizedSeverity: severity, passed: severity <= 1 });
}
function mechanicalAudit(solved, cii, distance) {
  const ours = sourceCases(solved);
  const meta = new Map(solved.authorities.base.entries.map((entry) => [pairKey(entry), Object.freeze({
    sourceId: String(entry.sourceSegment.id), pairKey: pairKey(entry), sourceType: entry.sourceSegment.type,
    fromNode: String(entry.sourceSegment.startNodeId), toNode: String(entry.sourceSegment.endNodeId),
    rigid: Boolean(entry.rigidAuthority), rigidDistance: distance.get(String(entry.sourceSegment.id)),
  })]));
  const rows = [];
  for (const caseLabel of CASES) for (const [key, refs] of cii.localForce.get(caseLabel).byPair) {
    if (refs.length !== 1 || !ours.get(caseLabel).has(key) || !meta.has(key)) continue;
    const actual = ours.get(caseLabel).get(key); const ref = refs[0]; const source = meta.get(key);
    for (const end of ['I', 'J']) for (const [field, level, levelName, units] of FIELDS) rows.push(Object.freeze({
      ...source, caseLabel, end, field, level, levelName, units, ...compare(actual[end][field], ref[end][field], field),
    }));
  }
  const bucket = (d) => d === 0 ? 'RIGID' : d === 1 ? 'ADJACENT' : d === 2 ? 'DISTANCE_2' : 'DISTANCE_3_PLUS';
  const groups = {};
  for (const key of ['RIGID', 'ADJACENT', 'DISTANCE_2', 'DISTANCE_3_PLUS']) {
    const subset = rows.filter((row) => bucket(row.rigidDistance) === key);
    const severities = subset.map((row) => row.normalizedSeverity).sort((a, b) => a - b);
    groups[key] = Object.freeze({
      compared: subset.length, passed: subset.filter((row) => row.passed).length,
      meanSeverity: subset.reduce((sum, row) => sum + row.normalizedSeverity, 0) / Math.max(subset.length, 1),
      medianSeverity: severities[Math.floor(severities.length / 2)] ?? null,
      p95Severity: severities[Math.floor(0.95 * Math.max(severities.length - 1, 0))] ?? null,
    });
  }
  const cluster = rows.filter((row) => CLUSTER_NODES.has(row.fromNode) && CLUSTER_NODES.has(row.toNode));
  return Object.freeze({ rows: Object.freeze(rows), distanceGroups: Object.freeze(groups), cluster: Object.freeze(cluster) });
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const rigidLoad = rigidLoadAudit(solved);
const distances = rigidDistances(solved);
const mechanics = mechanicalAudit(solved, cii, distances);

assert.equal(rigidLoad.count, 20, 'M046 expects 20 BM4 rigid source elements.');
assert.ok(rigidLoad.maximumForceRelative <= 1e-12, 'M046 rigid gravity resultant must reproduce the sealed rigid weight.');
assert.ok(rigidLoad.maximumMomentInvariantRelative <= 1e-12, 'M046 rigid gravity equivalent load must preserve centroid moment.');
assert.ok(rigidLoad.maximumThermalResidualRelative <= 1e-10, 'M046 rigid thermal initial strain must remain self-equilibrating.');
assert.ok(mechanics.cluster.some((row) => row.fromNode === '22100' || row.toNode === '22100'), 'M046 must retain node 22100 cluster evidence.');

const report = Object.freeze({
  schema: 'lfea-m046-bm4-rigid-boundary-rca/v1',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  rigidLoad,
  mechanics: Object.freeze({ distanceGroups: mechanics.distanceGroups, cluster: mechanics.cluster }),
  interpretationBoundary: Object.freeze({
    distanceCorrelationIsDiagnosticNotCausalProof: true,
    rigidEquivalentLoadConservationCanFalsifyAssemblyErrorsButCannotProveCaesarUsesIdenticalInternalNodalRepresentation: true,
    caesarSummedMyFromPriorInstrumentMayNotBeComparedToWeightCentroidMomentWithoutMatchingLoadVectorDefinition: true,
  }),
  disposition: Object.freeze({ mechanicsChangedByM046: false, outputFitUsed: false, bourdonTestRunByM046: false }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) { const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`); }
console.log(`M046 rigid elements: ${rigidLoad.count}; gravity force residual=${rigidLoad.maximumForceRelative}; moment invariant=${rigidLoad.maximumMomentInvariantRelative}; thermal residual=${rigidLoad.maximumThermalResidualRelative}.`);
console.log(`M046 rigid direct nodal moment sum: ${JSON.stringify(rigidLoad.sumDirectMoment)} N*m.`);
console.log(`M046 error severity by rigid distance: ${JSON.stringify(mechanics.distanceGroups)}.`);
console.log(`M046 22100 rigid-cluster comparison rows: ${mechanics.cluster.length}.`);
