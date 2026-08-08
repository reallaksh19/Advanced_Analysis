#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const ENDS = Object.freeze(['I', 'J']);
const FIELDS = Object.freeze(['fx', 'fy', 'fz']);

function subtract(left, right) {
  return Object.fromEntries(['fx', 'fy', 'fz', 'mx', 'my', 'mz']
    .map((field) => [field, (left?.[field] ?? 0) - (right?.[field] ?? 0)]));
}
function pairKey(entry) {
  return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`;
}
function sourceActions(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const out = new Map();
  for (const sourceEntry of solved.authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M044A missing recovered source actions for ${sourceId}.`);
    out.set(pairKey(sourceEntry), Object.freeze({
      sourceId,
      fromNode: String(sourceEntry.sourceSegment.startNodeId),
      toNode: String(sourceEntry.sourceSegment.endNodeId),
      I: first.global.I,
      J: last.global.J,
    }));
  }
  return out;
}
function sourceCaseActions(solved) {
  const sus = sourceActions(solved, solved.sustained.recovery);
  const ope = sourceActions(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) {
    const cold = sus.get(key);
    if (!cold) throw new Error(`M044A missing SUS pair ${key}.`);
    exp.set(key, Object.freeze({
      sourceId: hot.sourceId,
      fromNode: hot.fromNode,
      toNode: hot.toNode,
      I: Object.freeze(subtract(hot.I, cold.I)),
      J: Object.freeze(subtract(hot.J, cold.J)),
    }));
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function compareValue(ours, cii) {
  const delta = ours - cii;
  const absDelta = Math.abs(delta);
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const absPercent = nearZero ? null : absDelta / Math.abs(cii) * 100;
  const passed = nearZero
    ? absDelta <= BM4_COMPARISON_POLICY.absoluteTolerance.force
    : absPercent <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  return Object.freeze({ ours, cii, delta, absDelta, absPercent, nearZeroReference: nearZero, passed });
}
function rows(oursByCase, cii) {
  const compared = [];
  const unmatched = [];
  for (const caseLabel of CASES) {
    const ours = oursByCase.get(caseLabel);
    for (const [key, authorityRows] of cii.globalForce.get(caseLabel).byPair) {
      if (authorityRows.length !== 1 || !ours.has(key)) {
        unmatched.push(Object.freeze({ caseLabel, pairKey: key, authorityRowCount: authorityRows.length, oursPresent: ours.has(key) }));
        continue;
      }
      const actual = ours.get(key);
      const reference = authorityRows[0];
      for (const end of ENDS) for (const field of FIELDS) {
        compared.push(Object.freeze({
          caseLabel,
          pairKey: key,
          sourceId: actual.sourceId,
          end,
          nodeId: end === 'I' ? actual.fromNode : actual.toNode,
          field,
          units: 'N',
          ...compareValue(actual[end][field], reference[end][field]),
        }));
      }
    }
  }
  return Object.freeze({ compared: Object.freeze(compared), unmatched: Object.freeze(unmatched) });
}
function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}
function stats(subset) {
  const n = subset.length;
  const passed = subset.filter((row) => row.passed).length;
  const abs = subset.map((row) => row.absDelta).sort((a, b) => a - b);
  const pct = subset.filter((row) => row.absPercent !== null).map((row) => row.absPercent).sort((a, b) => a - b);
  const bias = n ? subset.reduce((sum, row) => sum + row.delta, 0) / n : null;
  const mae = n ? subset.reduce((sum, row) => sum + row.absDelta, 0) / n : null;
  const rmse = n ? Math.sqrt(subset.reduce((sum, row) => sum + row.delta ** 2, 0) / n) : null;
  const worstAbsolute = [...subset].sort((a, b) => b.absDelta - a.absDelta || a.pairKey.localeCompare(b.pairKey))[0] ?? null;
  const worstPercent = [...subset].filter((row) => row.absPercent !== null)
    .sort((a, b) => b.absPercent - a.absPercent || a.pairKey.localeCompare(b.pairKey))[0] ?? null;
  return Object.freeze({
    compared: n,
    passed,
    failed: n - passed,
    passRate: n ? passed / n : null,
    signedBiasN: bias,
    meanAbsoluteErrorN: mae,
    rmseN: rmse,
    medianAbsoluteErrorN: percentile(abs, 0.5),
    p95AbsoluteErrorN: percentile(abs, 0.95),
    maxAbsoluteErrorN: abs.at(-1) ?? null,
    medianAbsolutePercentNonZero: percentile(pct, 0.5),
    p95AbsolutePercentNonZero: percentile(pct, 0.95),
    maxAbsolutePercentNonZero: pct.at(-1) ?? null,
    worstAbsolute,
    worstPercent,
  });
}
function vectorRows(componentRows) {
  const groups = new Map();
  for (const row of componentRows) {
    const key = `${row.caseLabel}:${row.pairKey}:${row.end}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    const deltaMagnitude = Math.hypot(...FIELDS.map((field) => group.find((row) => row.field === field).delta));
    const authorityMagnitude = Math.hypot(...FIELDS.map((field) => group.find((row) => row.field === field).cii));
    return Object.freeze({
      caseLabel: first.caseLabel,
      pairKey: first.pairKey,
      sourceId: first.sourceId,
      end: first.end,
      nodeId: first.nodeId,
      deltaMagnitudeN: deltaMagnitude,
      authorityMagnitudeN: authorityMagnitude,
      relativeVectorErrorPercent: authorityMagnitude > BM4_COMPARISON_POLICY.nearZeroReferenceThreshold
        ? deltaMagnitude / authorityMagnitude * 100 : null,
    });
  });
}
function vectorStats(subset) {
  const abs = subset.map((row) => row.deltaMagnitudeN).sort((a, b) => a - b);
  const rel = subset.filter((row) => row.relativeVectorErrorPercent !== null)
    .map((row) => row.relativeVectorErrorPercent).sort((a, b) => a - b);
  return Object.freeze({
    comparedEnds: subset.length,
    medianErrorMagnitudeN: percentile(abs, 0.5),
    p95ErrorMagnitudeN: percentile(abs, 0.95),
    maxErrorMagnitudeN: abs.at(-1) ?? null,
    medianRelativeVectorErrorPercent: percentile(rel, 0.5),
    p95RelativeVectorErrorPercent: percentile(rel, 0.95),
    maxRelativeVectorErrorPercent: rel.at(-1) ?? null,
    worst: [...subset].sort((a, b) => b.deltaMagnitudeN - a.deltaMagnitudeN || a.pairKey.localeCompare(b.pairKey))[0] ?? null,
  });
}

const solved = solveBm4M035M036Combined();
const cii = loadBm4CiiOutputCases1921();
const oursByCase = sourceCaseActions(solved);
const result = rows(oursByCase, cii);
const vectors = vectorRows(result.compared);
const byCaseAndField = Object.fromEntries(CASES.map((caseLabel) => [caseLabel,
  Object.fromEntries(FIELDS.map((field) => [field, stats(result.compared.filter((row) => row.caseLabel === caseLabel && row.field === field))]))
]));
const byField = Object.fromEntries(FIELDS.map((field) => [field, stats(result.compared.filter((row) => row.field === field))]));
const vectorByCase = Object.fromEntries(CASES.map((caseLabel) => [caseLabel, vectorStats(vectors.filter((row) => row.caseLabel === caseLabel))]));

assert.equal(result.compared.length, 1494, 'M044A expects 498 one-to-one element ends x 3 global force components.');
assert.equal(vectors.length, 498, 'M044A expects 498 one-to-one global force vectors.');
assert.equal(result.unmatched.length, 84, 'M044A must preserve the same 84 unmatched CAESAR station records as M042.');

const report = Object.freeze({
  schema: 'lfea-m044a-bm4-global-force-component-accuracy/v1',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  comparisonSpace: 'RAW_GLOBAL_FORCE_COMPONENTS_NO_LOCAL_AXIS_PROJECTION',
  endMapping: 'SOURCE_FROM_NODE=I_SOURCE_TO_NODE=J_NO_EXTRA_SIGN_FLIP',
  policy: BM4_COMPARISON_POLICY,
  componentComparisons: result.compared.length,
  vectorComparisons: vectors.length,
  unmatchedAuthorityPairRecords: result.unmatched.length,
  byCaseAndField: Object.freeze(byCaseAndField),
  byField: Object.freeze(byField),
  vectorByCase: Object.freeze(vectorByCase),
  unmatched: result.unmatched,
  rows: result.compared,
  vectors: Object.freeze(vectors),
  disposition: Object.freeze({ mechanicsChanged: false, outputFitUsed: false }),
});

const reportArg = process.argv.indexOf('--report');
if (reportArg >= 0) {
  const requested = process.argv[reportArg + 1];
  if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
for (const caseLabel of CASES) for (const field of FIELDS) {
  const s = report.byCaseAndField[caseLabel][field];
  console.log(`M044A ${caseLabel} ${field.toUpperCase()}: ${s.passed}/${s.compared} pass (${(100 * s.passRate).toFixed(2)}%); MAE=${s.meanAbsoluteErrorN.toFixed(3)} N; P95=${s.p95AbsoluteErrorN.toFixed(3)} N; MAX=${s.maxAbsoluteErrorN.toFixed(3)} N.`);
}
for (const caseLabel of CASES) {
  const s = report.vectorByCase[caseLabel];
  console.log(`M044A ${caseLabel} vector error: median=${s.medianErrorMagnitudeN.toFixed(3)} N; P95=${s.p95ErrorMagnitudeN.toFixed(3)} N; MAX=${s.maxErrorMagnitudeN.toFixed(3)} N.`);
}
