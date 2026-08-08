#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  BM4_COMPARISON_POLICY,
  loadBm4CiiOutputCases1921,
} from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import {
  auditBm4CiiGlobalLocalVectorParity,
  normalizeBm4CiiLocalForceForM035,
} from './lfea-bm4-local-force-reference-normalization.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const ENDS = Object.freeze(['I', 'J']);
const ACTIONS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const LEVELS = Object.freeze([
  Object.freeze({ level: 1, name: 'AXIAL_FORCE', fields: Object.freeze(['fx']), units: 'N' }),
  Object.freeze({ level: 2, name: 'SHEAR_FORCE', fields: Object.freeze(['fy', 'fz']), units: 'N' }),
  Object.freeze({ level: 3, name: 'TORSION', fields: Object.freeze(['mx']), units: 'N*m' }),
  Object.freeze({ level: 4, name: 'BENDING_MOMENT', fields: Object.freeze(['my', 'mz']), units: 'N*m' }),
  Object.freeze({ level: 5, name: 'SIF_IN_PLANE_OUT_OF_PLANE', fields: Object.freeze([]), units: 'dimensionless' }),
  Object.freeze({ level: 6, name: 'FLEXIBILITY_FACTOR_K', fields: Object.freeze([]), units: 'dimensionless' }),
  Object.freeze({ level: 7, name: 'FINAL_CODE_BEND_STRESS', fields: Object.freeze([]), units: 'Pa' }),
]);
const FIELD_TO_LEVEL = new Map(LEVELS.flatMap((row) => row.fields.map((field) => [field, row])));

function subtract(left, right) {
  return Object.fromEntries(ACTIONS.map((field) => [field, (left?.[field] ?? 0) - (right?.[field] ?? 0)]));
}
function magnitude(action, fields) {
  return Math.hypot(...fields.map((field) => action?.[field] ?? 0));
}
function sourceActions(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const result = new Map();
  for (const sourceEntry of solved.authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M042 missing recovered source actions for ${sourceId}.`);
    const pairKey = `${sourceEntry.sourceSegment.startNodeId}-${sourceEntry.sourceSegment.endNodeId}`;
    result.set(pairKey, Object.freeze({
      sourceId,
      fromNode: String(sourceEntry.sourceSegment.startNodeId),
      toNode: String(sourceEntry.sourceSegment.endNodeId),
      local: Object.freeze({ I: first.local.I, J: last.local.J }),
      global: Object.freeze({ I: first.global.I, J: last.global.J }),
    }));
  }
  return result;
}
function sourceCaseActions(solved) {
  const sus = sourceActions(solved, solved.sustained.recovery);
  const ope = sourceActions(solved, solved.operating.recovery);
  const result = new Map([['SUS', sus], ['OPE', ope], ['EXP', new Map()]]);
  for (const [pairKey, operating] of ope) {
    const sustained = sus.get(pairKey);
    if (!sustained) throw new Error(`M042 missing SUS source pair ${pairKey}.`);
    result.get('EXP').set(pairKey, Object.freeze({
      sourceId: operating.sourceId,
      fromNode: operating.fromNode,
      toNode: operating.toNode,
      local: Object.freeze({ I: subtract(operating.local.I, sustained.local.I), J: subtract(operating.local.J, sustained.local.J) }),
      global: Object.freeze({ I: subtract(operating.global.I, sustained.global.I), J: subtract(operating.global.J, sustained.global.J) }),
    }));
  }
  return result;
}
function absoluteTolerance(field) {
  return ['fx', 'fy', 'fz'].includes(field)
    ? BM4_COMPARISON_POLICY.absoluteTolerance.force
    : BM4_COMPARISON_POLICY.absoluteTolerance.moment;
}
function comparison(ours, cii, field) {
  const delta = ours - cii;
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const limit = nearZero ? absoluteTolerance(field) : null;
  const percentDifference = nearZero ? null : delta / Math.abs(cii) * 100;
  const passed = nearZero
    ? Math.abs(delta) <= limit
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  const targetWidth = nearZero ? limit : Math.abs(cii) * BM4_COMPARISON_POLICY.targetTolerancePercent / 100;
  return Object.freeze({
    ours, cii, delta, percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT',
    targetWidth,
    passed,
    normalizedSeverity: targetWidth > 0 ? Math.abs(delta) / targetWidth : Number.POSITIVE_INFINITY,
  });
}
function compareElementEnds(oursByCase, cii) {
  const rows = [];
  const unmatchedAuthorityPairs = [];
  for (const caseLabel of CASES) {
    const ours = oursByCase.get(caseLabel);
    const authority = cii.localForce.get(caseLabel);
    for (const [pairKey, authorityRows] of authority.byPair) {
      if (authorityRows.length !== 1 || !ours.has(pairKey)) {
        unmatchedAuthorityPairs.push(Object.freeze({ caseLabel, pairKey, authorityRowCount: authorityRows.length, oursPresent: ours.has(pairKey) }));
        continue;
      }
      const actual = ours.get(pairKey);
      const reference = authorityRows[0];
      for (const end of ENDS) for (const field of ACTIONS) {
        const level = FIELD_TO_LEVEL.get(field);
        rows.push(Object.freeze({
          caseLabel, level: level.level, levelName: level.name, pairKey, sourceId: actual.sourceId,
          end, nodeId: end === 'I' ? actual.fromNode : actual.toNode, field, units: level.units,
          ...comparison(actual.local[end][field], reference[end][field], field),
        }));
      }
    }
  }
  return Object.freeze({ rows: Object.freeze(rows), unmatchedAuthorityPairs: Object.freeze(unmatchedAuthorityPairs) });
}
function auditOurLocalGlobalMagnitude(oursByCase) {
  let comparedEnds = 0;
  let maxForceAbsoluteDifference = 0;
  let maxMomentAbsoluteDifference = 0;
  for (const caseLabel of CASES) for (const action of oursByCase.get(caseLabel).values()) for (const end of ENDS) {
    maxForceAbsoluteDifference = Math.max(maxForceAbsoluteDifference,
      Math.abs(magnitude(action.local[end], ['fx', 'fy', 'fz']) - magnitude(action.global[end], ['fx', 'fy', 'fz'])));
    maxMomentAbsoluteDifference = Math.max(maxMomentAbsoluteDifference,
      Math.abs(magnitude(action.local[end], ['mx', 'my', 'mz']) - magnitude(action.global[end], ['mx', 'my', 'mz'])));
    comparedEnds += 1;
  }
  return Object.freeze({ comparedEnds, maxForceAbsoluteDifference, maxMomentAbsoluteDifference });
}
function summarizeLevels(rows) {
  const firstFailed = LEVELS.slice(0, 4).find((level) => rows.some((row) => row.level === level.level && !row.passed));
  return LEVELS.map((level) => {
    if (level.level > 4) return Object.freeze({
      level: level.level, name: level.name, status: firstFailed
        ? `NOT_REACHED_FIRST_UPSTREAM_DIVERGENCE_AT_LEVEL_${firstFailed.level}`
        : 'PENDING_ONLY_IF_LEVELS_1_TO_4_PASS',
    });
    const levelRows = rows.filter((row) => row.level === level.level);
    const failed = levelRows.filter((row) => !row.passed);
    return Object.freeze({
      level: level.level, name: level.name, status: failed.length ? 'DIVERGED' : 'MATCHED_AT_LOCKED_TARGET',
      comparedRows: levelRows.length, failedRows: failed.length,
      byCase: Object.fromEntries(CASES.map((caseLabel) => [caseLabel, Object.freeze({
        comparedRows: levelRows.filter((row) => row.caseLabel === caseLabel).length,
        failedRows: failed.filter((row) => row.caseLabel === caseLabel).length,
      })])),
    });
  });
}
function deterministicSort(left, right) {
  return CASES.indexOf(left.caseLabel) - CASES.indexOf(right.caseLabel)
    || Number(left.sourceId) - Number(right.sourceId)
    || left.pairKey.localeCompare(right.pairKey)
    || ENDS.indexOf(left.end) - ENDS.indexOf(right.end)
    || left.field.localeCompare(right.field);
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const authorityVectorParity = auditBm4CiiGlobalLocalVectorParity(rawCii);
const cii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const oursByCase = sourceCaseActions(solved);
const compared = compareElementEnds(oursByCase, cii);
const ourVectorParity = auditOurLocalGlobalMagnitude(oursByCase);
const levelSummary = summarizeLevels(compared.rows);
const firstLevel = levelSummary.find((row) => row.status === 'DIVERGED') ?? null;
const firstLevelFailures = firstLevel
  ? compared.rows.filter((row) => row.level === firstLevel.level && !row.passed).sort(deterministicSort)
  : [];
const highestSeverity = [...firstLevelFailures].sort((a, b) => b.normalizedSeverity - a.normalizedSeverity || deterministicSort(a, b))[0] ?? null;

assert.equal(compared.unmatchedAuthorityPairs.length, 0, 'M042 requires one-to-one authority/source element-end attribution.');
assert.ok(authorityVectorParity.comparedEnds > 0, 'M042 authority global/local parity audit must execute.');
assert.ok(ourVectorParity.comparedEnds > 0, 'M042 LFEA global/local parity audit must execute.');
assert.ok(firstLevel, 'M042 expected at least one BM4 upstream element-end divergence at the locked 5% target.');

const report = Object.freeze({
  schema: 'lfea-m042-bm4-first-divergence-rca/v1',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  comparisonPolicy: BM4_COMPARISON_POLICY,
  rcaHierarchy: LEVELS,
  conventionAuthority: Object.freeze({
    axes: 'CAESAR_GLOBAL_RESULTANTS_PROJECTED_TO_LFEA_QUALIFIED_LOCAL_AXES',
    endMapping: 'SOURCE_FROM_NODE=I_SOURCE_TO_NODE=J_NO_EXTRA_SIGN_FLIP',
    stationAttribution: 'ONE_TO_ONE_SOURCE_SEGMENT_ENDPOINTS_ONLY_NO_INTERPOLATION',
    forceUnits: 'N', momentUnits: 'N*m',
    pressureAxialThrust: 'CURRENT_QUALIFIED_M035_M036_PRESSURE_PRIMITIVE_HAS_AXIAL_THRUST_FALSE',
  }),
  parityAudits: Object.freeze({ authorityGlobalLocal: authorityVectorParity, lfeaGlobalLocal: ourVectorParity }),
  comparedElementEndRows: compared.rows.length,
  unmatchedAuthorityPairs: compared.unmatchedAuthorityPairs,
  levels: Object.freeze(levelSummary),
  firstDivergence: Object.freeze({
    level: firstLevel.level, levelName: firstLevel.name,
    mismatchCount: firstLevelFailures.length,
    deterministicFirstRow: firstLevelFailures[0],
    highestSeverityRow: highestSeverity,
    allRows: Object.freeze(firstLevelFailures),
  }),
  disposition: Object.freeze({
    bourdonErrorConcluded: false,
    finalStressRcaPermittedBeforeUpstreamClosure: false,
    mechanicsChangedByM042: false,
    conclusion: `FIRST_UPSTREAM_NUMERICAL_DIVERGENCE_AT_LEVEL_${firstLevel.level}_${firstLevel.name}`,
  }),
});

const reportArg = process.argv.indexOf('--report');
if (reportArg >= 0) {
  const requested = process.argv[reportArg + 1];
  if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`M042 first divergence: level ${report.firstDivergence.level} ${report.firstDivergence.levelName}; ${report.firstDivergence.mismatchCount} mismatched element-end rows.`);
console.log(`M042 deterministic first row: ${JSON.stringify(report.firstDivergence.deterministicFirstRow)}`);
console.log(`M042 highest severity row: ${JSON.stringify(report.firstDivergence.highestSeverityRow)}`);
console.log('M042 disposition: Bourdon not concluded; downstream stress RCA blocked until upstream divergence is resolved.');
