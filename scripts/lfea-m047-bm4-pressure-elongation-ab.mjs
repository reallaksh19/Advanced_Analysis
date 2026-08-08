#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';
import { solveBm4M047PressureElongationCandidate } from './lfea-m047-bm4-pressure-elongation-runtime.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const AXES = Object.freeze([
  Object.freeze({ source: 'DX', dof: 'UX', group: 'HORIZONTAL_XZ' }),
  Object.freeze({ source: 'DY', dof: 'UY', group: 'VERTICAL_Y' }),
  Object.freeze({ source: 'DZ', dof: 'UZ', group: 'HORIZONTAL_XZ' }),
]);
const NODE_PREFIX = 'BM4M035.N';
const UNITY_TARGET_BAND = 0.2;

function displacementVector(execution) {
  return new Map(execution.displacement.map((row) => [`${row.nodeId}:${row.dof}`, row.value]));
}
function caseDisplacements(solved) {
  const sus = displacementVector(solved.sustained.execution);
  const ope = displacementVector(solved.operating.execution);
  const exp = new Map();
  for (const [key, value] of ope) exp.set(key, value - (sus.get(key) ?? 0));
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function displacementRows(solved, cii) {
  const values = caseDisplacements(solved);
  const rows = [];
  for (const caseLabel of CASES) for (const authority of cii.displacement.get(caseLabel).values()) {
    for (const axis of AXES) {
      const key = `${NODE_PREFIX}${authority.nodeId}:${axis.dof}`;
      if (!values.get(caseLabel).has(key)) continue;
      rows.push(Object.freeze({
        caseLabel, nodeId: authority.nodeId, axis: axis.source, group: axis.group,
        oursMm: values.get(caseLabel).get(key) * 1000,
        ciiMm: authority[axis.source],
      }));
    }
  }
  return Object.freeze(rows);
}
function regression(rows) {
  const significant = rows.filter((row) => Math.abs(row.ciiMm) > 1e-9);
  const denominator = significant.reduce((sum, row) => sum + row.ciiMm ** 2, 0);
  const slope = denominator === 0 ? null : significant.reduce((sum, row) => sum + row.ciiMm * row.oursMm, 0) / denominator;
  const signAgreement = significant.length === 0 ? null
    : significant.filter((row) => Math.sign(row.oursMm) === Math.sign(row.ciiMm)).length / significant.length;
  const mae = significant.length === 0 ? null
    : significant.reduce((sum, row) => sum + Math.abs(row.oursMm - row.ciiMm), 0) / significant.length;
  return Object.freeze({ compared: significant.length, slopeThroughOrigin: slope, signAgreement, meanAbsoluteErrorMm: mae });
}
function displacementSummary(rows) {
  return Object.fromEntries(CASES.map((caseLabel) => {
    const own = rows.filter((row) => row.caseLabel === caseLabel);
    return [caseLabel, Object.freeze({
      ALL: regression(own),
      HORIZONTAL_XZ: regression(own.filter((row) => row.group === 'HORIZONTAL_XZ')),
      VERTICAL_Y: regression(own.filter((row) => row.group === 'VERTICAL_Y')),
      DX: regression(own.filter((row) => row.axis === 'DX')),
      DY: regression(own.filter((row) => row.axis === 'DY')),
      DZ: regression(own.filter((row) => row.axis === 'DZ')),
    })];
  }));
}
function pairKey(entry) { return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`; }
function sourceActions(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const map = new Map();
  for (const source of solved.authorities.base.entries) {
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === String(source.sourceSegment.id));
    const first = recovered.get(descendants[0]?.elementId); const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M047 missing source action ${source.sourceSegment.id}.`);
    map.set(pairKey(source), Object.freeze({ sourceId: String(source.sourceSegment.id), I: first.local.I, J: last.local.J }));
  }
  return map;
}
function sourceCases(solved) {
  const sus = sourceActions(solved, solved.sustained.recovery);
  const ope = sourceActions(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    exp.set(key, Object.freeze({ sourceId: hot.sourceId, I: { fx: hot.I.fx - cold.I.fx }, J: { fx: hot.J.fx - cold.J.fx } }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function axialSummary(solved, cii) {
  const ours = sourceCases(solved); const rows = [];
  for (const caseLabel of CASES) for (const [key, refs] of cii.localForce.get(caseLabel).byPair) {
    if (refs.length !== 1 || !ours.get(caseLabel).has(key)) continue;
    for (const end of ['I', 'J']) {
      const actual = ours.get(caseLabel).get(key)[end].fx; const reference = refs[0][end].fx;
      const delta = actual - reference; const absDelta = Math.abs(delta);
      const nearZero = Math.abs(reference) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
      const passed = nearZero ? absDelta <= BM4_COMPARISON_POLICY.absoluteTolerance.force
        : absDelta / Math.abs(reference) * 100 <= BM4_COMPARISON_POLICY.targetTolerancePercent;
      rows.push(Object.freeze({ caseLabel, pairKey: key, end, actual, reference, delta, absDelta, passed }));
    }
  }
  const aggregate = (subset) => Object.freeze({
    compared: subset.length, passed: subset.filter((row) => row.passed).length,
    meanAbsoluteErrorN: subset.reduce((sum, row) => sum + row.absDelta, 0) / Math.max(subset.length, 1),
    maxAbsoluteErrorN: Math.max(...subset.map((row) => row.absDelta)),
  });
  return Object.freeze({
    byCase: Object.fromEntries(CASES.map((label) => [label, aggregate(rows.filter((row) => row.caseLabel === label))])),
    all: aggregate(rows),
  });
}
function released(run) {
  return run.convergedState.filter((row) => row.status === 'RELEASED').map((row) => row.nodeId.replace(NODE_PREFIX, '')).sort();
}

const baseline = solveBm4M035M036Combined();
const candidate = solveBm4M047PressureElongationCandidate();
const rawCii = loadBm4CiiOutputCases1921();
const ciiBaseline = normalizeBm4CiiLocalForceForM035(rawCii, baseline.authorities);
const ciiCandidate = normalizeBm4CiiLocalForceForM035(rawCii, candidate.authorities);
const baselineDisplacement = displacementSummary(displacementRows(baseline, rawCii));
const candidateDisplacement = displacementSummary(displacementRows(candidate, rawCii));
const baselineAxial = axialSummary(baseline, ciiBaseline);
const candidateAxial = axialSummary(candidate, ciiCandidate);
const susBase = baselineDisplacement.SUS.ALL.slopeThroughOrigin;
const susCandidate = candidateDisplacement.SUS.ALL.slopeThroughOrigin;
const horizontalBase = baselineDisplacement.SUS.HORIZONTAL_XZ.slopeThroughOrigin;
const horizontalCandidate = candidateDisplacement.SUS.HORIZONTAL_XZ.slopeThroughOrigin;
const reachesUnityBand = Math.abs(1 - susCandidate) <= UNITY_TARGET_BAND;
const improvesDistanceToUnity = Math.abs(1 - susCandidate) < Math.abs(1 - susBase);
const horizontalImproves = Math.abs(1 - horizontalCandidate) < Math.abs(1 - horizontalBase);
const conclusion = reachesUnityBand && improvesDistanceToUnity && horizontalImproves
  ? 'PRESSURE_ELONGATION_CANDIDATE_SURVIVES_TRANSLATION_FALSIFICATION'
  : 'PRESSURE_ELONGATION_CANDIDATE_FAILS_TRANSLATION_FALSIFICATION';

assert.equal(candidate.sustained.activated, candidate.operating.activated, 'M047 eligible-span count must not depend on thermal case.');
assert.ok(candidate.sustained.activated > 0, 'M047 counterfactual must activate at least one straight span.');
assert.equal(baselineDisplacement.SUS.ALL.compared, candidateDisplacement.SUS.ALL.compared, 'M047 A/B displacement population drift.');

const report = Object.freeze({
  schema: 'lfea-m047-bm4-pressure-elongation-ab/v1',
  intervention: Object.freeze({
    kind: 'COUNTERFACTUAL_CLOSED_END_STRAIGHT_SPAN_PRESSURE_ELONGATION',
    formula: '(1-2nu)*P*Di^2/(E*(Do^2-Di^2))',
    eligibleAnalysisFrames: candidate.sustained.activated,
    bendArcPressureOpeningIncluded: false,
    rigidPressureStrainIncluded: false,
    bm4BourdonOptionAuthorityResolved: false,
    productionActivationAuthorized: false,
  }),
  predeclaredFalsification: Object.freeze({ targetSlope: 1, acceptableAbsoluteDistance: UNITY_TARGET_BAND }),
  baseline: Object.freeze({ displacement: baselineDisplacement, axial: baselineAxial, released: { SUS: released(baseline.sustainedRun), OPE: released(baseline.operatingRun) } }),
  candidate: Object.freeze({ displacement: candidateDisplacement, axial: candidateAxial, released: { SUS: released(candidate.sustainedRun), OPE: released(candidate.operatingRun) } }),
  delta: Object.freeze({
    susAllSlope: susCandidate - susBase,
    susHorizontalSlope: horizontalCandidate - horizontalBase,
    susAxialMaeN: candidateAxial.byCase.SUS.meanAbsoluteErrorN - baselineAxial.byCase.SUS.meanAbsoluteErrorN,
    opeAxialMaeN: candidateAxial.byCase.OPE.meanAbsoluteErrorN - baselineAxial.byCase.OPE.meanAbsoluteErrorN,
  }),
  conclusion,
  disposition: Object.freeze({ mechanicsChangedByM047: false, outputFitUsed: false, productionActivationAuthorized: false }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) { const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.'); const path = resolve(requested); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`); }
console.log(`M047 SUS displacement slope ALL: baseline=${susBase.toFixed(6)}, candidate=${susCandidate.toFixed(6)}; horizontal=${horizontalBase.toFixed(6)} -> ${horizontalCandidate.toFixed(6)}.`);
console.log(`M047 SUS sign agreement ALL: baseline=${baselineDisplacement.SUS.ALL.signAgreement.toFixed(4)}, candidate=${candidateDisplacement.SUS.ALL.signAgreement.toFixed(4)}.`);
console.log(`M047 axial MAE SUS: ${baselineAxial.byCase.SUS.meanAbsoluteErrorN.toFixed(3)} -> ${candidateAxial.byCase.SUS.meanAbsoluteErrorN.toFixed(3)} N; OPE: ${baselineAxial.byCase.OPE.meanAbsoluteErrorN.toFixed(3)} -> ${candidateAxial.byCase.OPE.meanAbsoluteErrorN.toFixed(3)} N.`);
console.log(`M047 releases SUS: ${JSON.stringify(released(baseline.sustainedRun))} -> ${JSON.stringify(released(candidate.sustainedRun))}.`);
console.log(`M047 conclusion: ${conclusion}.`);
