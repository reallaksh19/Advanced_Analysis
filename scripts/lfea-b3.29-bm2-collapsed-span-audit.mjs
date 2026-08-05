#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  BM2_CII_OUTPUT_PATH,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';
import { buildBm2BendExpandedAuthorities } from './lfea-b3.29-bm2-bend-geometry-authority.mjs';

const output = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
const reportPairs = ['120-129', '129-130', '160-168', '168-169', '169-170', '170-180', '180-190'];
const cases = {};
for (const label of ['OPE', 'SUS', 'EXP']) {
  const displacements = Object.fromEntries(['120', '129', '130', '160', '168', '169', '170', '180', '190'].map(
    (nodeId) => [nodeId, output.displacement.get(label).get(nodeId) ?? null],
  ));
  const global = Object.fromEntries(reportPairs.map(
    (pairKey) => [pairKey, output.globalForce.get(label).get(pairKey) ?? null],
  ));
  const local = Object.fromEntries(reportPairs.map(
    (pairKey) => [pairKey, output.localForce.get(label).get(pairKey) ?? null],
  ));
  cases[label] = { displacements, global, local };
}

let geometryError = null;
try {
  buildBm2BendExpandedAuthorities();
} catch (error) {
  geometryError = error instanceof Error ? error.message : String(error);
}

console.log(JSON.stringify({
  schema: 'lfea-bm2-collapsed-span-audit/v2',
  reportPairs,
  cases,
  geometryError,
}, null, 2));
