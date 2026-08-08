#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { BM4_M040_FRICTION_NODE_IDS } from './lfea-m040-bm4-friction-authority.mjs';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';
import { solveBm4M047PressureElongationCandidate } from './lfea-m047-bm4-pressure-elongation-runtime.mjs';

const PREFIX = 'BM4M035.N';
const CASES = Object.freeze(['SUS', 'OPE']);
const FAMILIES = Object.freeze(['BEND', 'FRICTION', 'CONTACT', 'RIGID', 'TEE']);

function sq(value) { return value * value; }
function norm(vector) { return Math.hypot(...vector); }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function cleanNodeId(value) { return String(value).replace(/^BM4M035\.N/u, ''); }
function displacementMap(execution) {
  const out = new Map();
  for (const row of execution.displacement) {
    const node = cleanNodeId(row.nodeId); const current = out.get(node) ?? { UX: 0, UY: 0, UZ: 0 };
    current[row.dof] = row.value * 1000; out.set(node, current);
  }
  return out;
}
function analysisGraph(authorities) {
  const graph = new Map(authorities.analysisGeometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const segment of authorities.analysisGeometry.segments) {
    const i = String(segment.startNodeId); const j = String(segment.endNodeId);
    if (!graph.has(i)) graph.set(i, new Set()); if (!graph.has(j)) graph.set(j, new Set());
    graph.get(i).add(j); graph.get(j).add(i);
  }
  return graph;
}
function distances(graph, seeds) {
  const result = new Map(); const queue = [];
  for (const seed of seeds) if (graph.has(String(seed)) && !result.has(String(seed))) {
    result.set(String(seed), 0); queue.push(String(seed));
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const node = queue[cursor];
    for (const next of graph.get(node) ?? []) if (!result.has(next)) {
      result.set(next, result.get(node) + 1); queue.push(next);
    }
  }
  return result;
}
function topology(authorities, inventory) {
  const graph = analysisGraph(authorities);
  const nodeSet = (entries) => new Set(entries.flatMap((entry) => [String(entry.segment.startNodeId), String(entry.segment.endNodeId)]));
  const bend = nodeSet(authorities.entries.filter((entry) => entry.bendComponent));
  const rigid = nodeSet(authorities.entries.filter((entry) => entry.sourceEntry.rigidAuthority));
  const tee = new Set(authorities.teeJunctions.map((entry) => String(entry.junctionNodeId)));
  const friction = new Set(BM4_M040_FRICTION_NODE_IDS);
  const contact = new Set(inventory.unilateral.map((entry) => cleanNodeId(entry.nodeId)));
  const seedSets = { BEND: bend, FRICTION: friction, CONTACT: contact, RIGID: rigid, TEE: tee };
  return Object.freeze({
    graph,
    seeds: Object.fromEntries(FAMILIES.map((family) => [family, Object.freeze([...seedSets[family]].sort())])),
    distance: Object.fromEntries(FAMILIES.map((family) => [family, distances(graph, seedSets[family])])),
  });
}
function authorityRows(solved, cii, caseLabel) {
  const ours = displacementMap(caseLabel === 'SUS' ? solved.sustained.execution : solved.operating.execution);
  return [...cii.displacement.get(caseLabel).values()].flatMap((authority) => {
    const actual = ours.get(String(authority.nodeId)); if (!actual) return [];
    const reference = [authority.DX, authority.DY, authority.DZ];
    if (!reference.every(Number.isFinite)) return [];
    return [{ nodeId: String(authority.nodeId), actual: [actual.UX, actual.UY, actual.UZ], reference }];
  });
}
function residualRows(baseline, candidate, cii, topo, caseLabel) {
  const base = new Map(authorityRows(baseline, cii, caseLabel).map((row) => [row.nodeId, row]));
  return authorityRows(candidate, cii, caseLabel).flatMap((cand) => {
    const cold = base.get(cand.nodeId); if (!cold) return [];
    const required = cold.reference.map((value, index) => value - cold.actual[index]);
    const shift = cand.actual.map((value, index) => value - cold.actual[index]);
    const remain = cand.reference.map((value, index) => value - cand.actual[index]);
    const requiredH = [required[0], required[2]]; const shiftH = [shift[0], shift[2]]; const remainH = [remain[0], remain[2]];
    const denom = dot(requiredH, requiredH);
    return [Object.freeze({
      caseLabel, nodeId: cand.nodeId,
      baseline: Object.freeze(cold.actual), candidate: Object.freeze(cand.actual), authority: Object.freeze(cand.reference),
      required: Object.freeze(required), candidateShift: Object.freeze(shift), remaining: Object.freeze(remain),
      baselineErrorAllMm: norm(required), candidateErrorAllMm: norm(remain),
      baselineErrorHorizontalMm: norm(requiredH), candidateErrorHorizontalMm: norm(remainH),
      horizontalAlignment: norm(requiredH) > 0 && norm(shiftH) > 0 ? dot(requiredH, shiftH) / (norm(requiredH) * norm(shiftH)) : null,
      horizontalProjectionFraction: denom > 0 ? dot(requiredH, shiftH) / denom : null,
      distances: Object.freeze(Object.fromEntries(FAMILIES.map((family) => [family, topo.distance[family].get(cand.nodeId) ?? null]))),
    })];
  });
}
function bucket(distance) { return distance === 0 ? 'AT' : distance === 1 ? 'NEAR_1' : distance === 2 ? 'NEAR_2' : 'FAR_3_PLUS'; }
function stats(rows) {
  if (!rows.length) return Object.freeze({ count: 0 });
  const baseH2 = rows.reduce((sum, row) => sum + sq(row.baselineErrorHorizontalMm), 0);
  const candH2 = rows.reduce((sum, row) => sum + sq(row.candidateErrorHorizontalMm), 0);
  const baseA2 = rows.reduce((sum, row) => sum + sq(row.baselineErrorAllMm), 0);
  const candA2 = rows.reduce((sum, row) => sum + sq(row.candidateErrorAllMm), 0);
  const aligned = rows.filter((row) => row.horizontalAlignment !== null);
  return Object.freeze({
    count: rows.length,
    baselineHorizontalRmsMm: Math.sqrt(baseH2 / rows.length), candidateHorizontalRmsMm: Math.sqrt(candH2 / rows.length),
    horizontalSseRemainingFraction: baseH2 > 0 ? candH2 / baseH2 : null,
    allSseRemainingFraction: baseA2 > 0 ? candA2 / baseA2 : null,
    horizontalImprovedCount: rows.filter((row) => row.candidateErrorHorizontalMm < row.baselineErrorHorizontalMm).length,
    meanHorizontalAlignment: aligned.length ? aligned.reduce((sum, row) => sum + row.horizontalAlignment, 0) / aligned.length : null,
    weightedHorizontalProjectionFraction: baseH2 > 0
      ? rows.reduce((sum, row) => sum + dot([row.required[0], row.required[2]], [row.candidateShift[0], row.candidateShift[2]]), 0) / baseH2 : null,
  });
}
function familyLocalization(rows, family) {
  const totalSse = rows.reduce((sum, row) => sum + sq(row.candidateErrorHorizontalMm), 0);
  const near = rows.filter((row) => row.distances[family] !== null && row.distances[family] <= 1);
  const nearSse = near.reduce((sum, row) => sum + sq(row.candidateErrorHorizontalMm), 0);
  const nodeShare = near.length / Math.max(rows.length, 1);
  return Object.freeze({
    family,
    byDistance: Object.fromEntries(['AT', 'NEAR_1', 'NEAR_2', 'FAR_3_PLUS'].map((key) => [key,
      stats(rows.filter((row) => bucket(row.distances[family]) === key))])),
    nearNodeShare: nodeShare,
    nearCandidateHorizontalSseShare: totalSse > 0 ? nearSse / totalSse : null,
    remainingResidualConcentrationIndex: totalSse > 0 && nodeShare > 0 ? (nearSse / totalSse) / nodeShare : null,
  });
}
function sourceActions(solved, recovery) {
  const actions = new Map(recovery.elementActions.map((row) => [row.elementId, row])); const out = new Map();
  for (const source of solved.authorities.base.entries) {
    const id = String(source.sourceSegment.id); const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === id);
    const first = actions.get(descendants[0]?.elementId); const last = actions.get(descendants.at(-1)?.elementId);
    if (first && last) out.set(pairKey(source), { source, I: first.local.I, J: last.local.J });
  }
  return out;
}
function axialDelta(baseline, candidate, cii) {
  const result = {};
  for (const caseLabel of CASES) {
    const b = sourceActions(baseline, caseLabel === 'SUS' ? baseline.sustained.recovery : baseline.operating.recovery);
    const c = sourceActions(candidate, caseLabel === 'SUS' ? candidate.sustained.recovery : candidate.operating.recovery);
    const rows = [];
    for (const [key, refs] of cii.localForce.get(caseLabel).byPair) {
      if (refs.length !== 1 || !b.has(key) || !c.has(key)) continue;
      for (const end of ['I', 'J']) {
        const reference = refs[0][end].fx; const baseError = Math.abs(b.get(key)[end].fx - reference); const candError = Math.abs(c.get(key)[end].fx - reference);
        rows.push({ pairKey: key, sourceId: String(b.get(key).source.sourceSegment.id), sourceType: b.get(key).source.sourceSegment.type,
          end, baseErrorN: baseError, candidateErrorN: candError, improvementN: baseError - candError });
      }
    }
    result[caseLabel] = Object.freeze({
      compared: rows.length, improved: rows.filter((row) => row.improvementN > 0).length, worsened: rows.filter((row) => row.improvementN < 0).length,
      totalAbsoluteErrorReductionN: rows.reduce((sum, row) => sum + row.improvementN, 0),
      topImproved: Object.freeze([...rows].sort((a, b2) => b2.improvementN - a.improvementN).slice(0, 10)),
      topWorsened: Object.freeze([...rows].sort((a, b2) => a.improvementN - b2.improvementN).slice(0, 10)),
    });
  }
  return Object.freeze(result);
}
function releasedPlusY(run) {
  return Object.freeze([...new Set(run.convergedState.filter((row) => row.status === 'RELEASED' && /BM4-C-/u.test(row.declarationId))
    .map((row) => cleanNodeId(row.nodeId)))].sort());
}

const baseline = solveBm4M035M036Combined(); const candidate = solveBm4M047PressureElongationCandidate();
const rawCii = loadBm4CiiOutputCases1921(); const normalized = normalizeBm4CiiLocalForceForM035(rawCii, baseline.authorities);
const topo = topology(candidate.authorities, candidate.inventory);
const cases = Object.fromEntries(CASES.map((caseLabel) => {
  const rows = residualRows(baseline, candidate, rawCii, topo, caseLabel);
  assert.ok(rows.length >= 100, `M048 ${caseLabel} expects at least 100 mapped displacement nodes.`);
  const families = FAMILIES.map((family) => familyLocalization(rows, family));
  return [caseLabel, Object.freeze({
    total: stats(rows),
    localization: Object.freeze(Object.fromEntries(families.map((entry) => [entry.family, entry]))),
    concentrationRanking: Object.freeze([...families].sort((a, b) => (b.remainingResidualConcentrationIndex ?? -Infinity) - (a.remainingResidualConcentrationIndex ?? -Infinity))
      .map((entry) => ({ family: entry.family, concentration: entry.remainingResidualConcentrationIndex }))),
    worstRemainingHorizontal: Object.freeze([...rows].sort((a, b) => b.candidateErrorHorizontalMm - a.candidateErrorHorizontalMm).slice(0, 15)),
  })];
}));
const report = Object.freeze({
  schema: 'lfea-m048-bm4-pressure-residual-localization/v1',
  topologySeeds: topo.seeds,
  cases: Object.freeze(cases),
  axial: axialDelta(baseline, candidate, normalized),
  plusYReleaseSets: Object.freeze({
    baseline: { SUS: releasedPlusY(baseline.sustainedRun), OPE: releasedPlusY(baseline.operatingRun) },
    candidate: { SUS: releasedPlusY(candidate.sustainedRun), OPE: releasedPlusY(candidate.operatingRun) },
  }),
  interpretationBoundary: Object.freeze({
    localizationIsDiagnosticNotMechanicsAuthority: true,
    overlappingTopologyFamiliesMayShareResidual: true,
    noBendPressureOpeningMechanicsActivated: true,
    noFrictionMechanicsActivated: true,
  }),
  disposition: Object.freeze({ mechanicsChangedByM048: false, outputFitUsed: false }),
});
const arg = process.argv.indexOf('--report'); if (arg >= 0) {
  const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.'); const path = resolve(requested);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
for (const caseLabel of CASES) {
  console.log(`M048 ${caseLabel} total horizontal SSE remaining fraction: ${report.cases[caseLabel].total.horizontalSseRemainingFraction.toFixed(4)}.`);
  console.log(`M048 ${caseLabel} residual concentration: ${JSON.stringify(report.cases[caseLabel].concentrationRanking)}.`);
  console.log(`M048 ${caseLabel} worst horizontal nodes: ${JSON.stringify(report.cases[caseLabel].worstRemainingHorizontal.slice(0, 5).map((row) => ({ nodeId: row.nodeId, errorMm: row.candidateErrorHorizontalMm, distances: row.distances })))}.`);
}
console.log(`M048 SUS axial improved/worsened: ${report.axial.SUS.improved}/${report.axial.SUS.worsened}; net abs-error reduction=${report.axial.SUS.totalAbsoluteErrorReductionN.toFixed(3)} N.`);
console.log(`M048 +Y releases: ${JSON.stringify(report.plusYReleaseSets)}.`);
