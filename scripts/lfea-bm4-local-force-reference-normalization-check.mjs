#!/usr/bin/env node
import assert from 'node:assert/strict';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import {
  auditBm4CiiGlobalLocalVectorParity,
  normalizeBm4CiiLocalForceForM034,
  normalizeBm4CiiLocalForceForM035,
} from './lfea-bm4-local-force-reference-normalization.mjs';

const raw = loadBm4CiiOutputCases1921();
const audit = auditBm4CiiGlobalLocalVectorParity(raw);
assert.equal(audit.comparedEnds, 666, 'three cases should audit 222 CAESAR element ends each');
assert.ok(audit.maxForceAbsoluteDifference < 1e-3, 'CAESAR global/local force magnitudes must agree within output rounding');
assert.ok(audit.maxMomentAbsoluteDifference < 1e-3, 'CAESAR global/local moment magnitudes must agree within output rounding');

const m034 = solveBm4InputXmlConditioned();
const m035 = solveBm4M035FeatureCases();
const normalized034 = normalizeBm4CiiLocalForceForM034(raw, m034);
const normalized035 = normalizeBm4CiiLocalForceForM035(raw, m035.authorities);
assert.strictEqual(normalized034.globalForce, raw.globalForce, 'normalization must not alter CAESAR global reference');
assert.strictEqual(normalized035.globalForce, raw.globalForce, 'normalization must not alter CAESAR global reference');
assert.equal(normalized035.localForceReferenceNormalization.normalizedRows, 249, 'M035 should normalize 83 source-mapped CAESAR rows in each of three cases');
assert.equal(normalized035.localForceReferenceNormalization.preservedRawRows, 84, 'M035 must preserve 28 unmatched/internal-station rows per case without inventing mapping');

const pair = '20580-20640';
const rawLocal = raw.localForce.get('OPE').byPair.get(pair)[0];
const normalizedLocal = normalized035.localForce.get('OPE').byPair.get(pair)[0];
assert.ok(Math.sign(rawLocal.I.fy) !== Math.sign(normalizedLocal.I.fy), 'known +Z straight-pipe case must expose CAESAR/LFEA transverse-axis sign difference');
assert.ok(Math.sign(rawLocal.I.fz) !== Math.sign(normalizedLocal.I.fz), 'known +Z straight-pipe case must expose CAESAR/LFEA transverse-axis sign difference');
const global = raw.globalForce.get('OPE').byPair.get(pair)[0];
assert.ok(Math.abs(Math.hypot(global.I.fx, global.I.fy, global.I.fz)
  - Math.hypot(normalizedLocal.I.fx, normalizedLocal.I.fy, normalizedLocal.I.fz)) < 1e-9,
'normalized force must preserve physical vector magnitude');

console.log(JSON.stringify({
  check: 'lfea-bm4-local-force-reference-normalization',
  status: 'PASS',
  audit,
  m034: normalized034.localForceReferenceNormalization,
  m035: normalized035.localForceReferenceNormalization,
  knownPair: { pair, rawLocalI: rawLocal.I, normalizedLocalI: normalizedLocal.I, globalI: global.I },
}, null, 2));
