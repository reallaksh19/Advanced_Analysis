#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildBm4SolveAuthorities } from './lfea-m034-bm4-solve-fixtures.mjs';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import {
  BM4_M038_FORCMNT_AUTHORITY,
  BM4_M038_FORCMNT_NODE_IDS,
  bm4TargetCaseIncludesForcmnt,
} from './lfea-m038-bm4-forcmnt-authority.mjs';

function realVector(vector) {
  return [
    vector?.force?.fx,
    vector?.force?.fy,
    vector?.force?.fz,
    vector?.moment?.mx,
    vector?.moment?.my,
    vector?.moment?.mz,
  ].some((value) => Number.isFinite(value));
}

function retainedForcmntRows(authorities) {
  const rows = [];
  const seen = new Set();
  for (const entry of authorities.entries) {
    const sourceSegment = entry.sourceSegment;
    for (const forceMoment of sourceSegment?.meta?.analysis?.forcesMoments ?? []) {
      for (const vector of forceMoment?.vectors ?? []) {
        if (!realVector(vector)) continue;
        const sourceNodeId = String(forceMoment.nodeId ?? sourceSegment.endNodeId);
        const key = `${forceMoment.forceMomentNumber}:${sourceNodeId}:${vector.number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(Object.freeze({
          sourceNodeId,
          forceMomentNumber: forceMoment.forceMomentNumber,
          vectorNumber: vector.number,
        }));
      }
    }
  }
  return rows.sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
}

function nodalForceCount(loadCase) {
  return loadCase.primitives.filter((primitive) => primitive.kind === 'NODAL_FORCE_MOMENT').length;
}

const authorities = buildBm4SolveAuthorities();
const retained = retainedForcmntRows(authorities);

assert.equal(retained.length, 12, 'BM4 must retain exactly 12 real FORCMNT vector rows.');
assert.deepEqual(retained.map((row) => row.sourceNodeId), [...BM4_M038_FORCMNT_NODE_IDS]);
assert.ok(retained.every((row) => row.forceMomentNumber === 1), 'All retained BM4 FORCMNT rows must belong to force set 1 / F1.');

assert.equal(BM4_M038_FORCMNT_AUTHORITY.retainedInput.caesarCaseToken, 'F1');
assert.equal(BM4_M038_FORCMNT_AUTHORITY.targetCases.sustained.expression, 'W+P1');
assert.equal(BM4_M038_FORCMNT_AUTHORITY.targetCases.operating.expression, 'W+T1+P1');
assert.equal(BM4_M038_FORCMNT_AUTHORITY.targetCases.expansion.expression, 'L21=L20-L19');
assert.equal(bm4TargetCaseIncludesForcmnt(19), false);
assert.equal(bm4TargetCaseIncludesForcmnt(20), false);
assert.ok(!/(^|\+)F1($|\+)/u.test(BM4_M038_FORCMNT_AUTHORITY.targetCases.sustained.expression));
assert.ok(!/(^|\+)F1($|\+)/u.test(BM4_M038_FORCMNT_AUTHORITY.targetCases.operating.expression));

const baseline = solveBm4InputXmlConditioned();
assert.equal(nodalForceCount(baseline.sustained.loadCase), 0, 'M034 CASE 19 surrogate must not compile F1.');
assert.equal(nodalForceCount(baseline.operating.loadCase), 0, 'M034 CASE 20 surrogate must not compile F1.');

const combined = solveBm4M035M036Combined();
assert.equal(nodalForceCount(combined.sustained.loadCase), 0, 'M035+M036 CASE 19 surrogate must not compile F1.');
assert.equal(nodalForceCount(combined.operating.loadCase), 0, 'M035+M036 CASE 20 surrogate must not compile F1.');

console.log(JSON.stringify({
  schema: 'm038-bm4-forcmnt-case-authority-check/v2',
  authority: BM4_M038_FORCMNT_AUTHORITY,
  retainedInput: {
    realVectorRows: retained.length,
    forceMomentNumbers: [...new Set(retained.map((row) => row.forceMomentNumber))],
    nodeIds: retained.map((row) => row.sourceNodeId),
  },
  targetCaseCompilation: {
    M034: {
      CASE19_SUS_nodalForceMomentCount: nodalForceCount(baseline.sustained.loadCase),
      CASE20_OPE_nodalForceMomentCount: nodalForceCount(baseline.operating.loadCase),
    },
    M035_M036: {
      CASE19_SUS_nodalForceMomentCount: nodalForceCount(combined.sustained.loadCase),
      CASE20_OPE_nodalForceMomentCount: nodalForceCount(combined.operating.loadCase),
    },
  },
  conclusion: 'F1 is retained source evidence but excluded from BM4 target CASE 19/20; CASE 21 remains derived L20-L19.',
}, null, 2));
