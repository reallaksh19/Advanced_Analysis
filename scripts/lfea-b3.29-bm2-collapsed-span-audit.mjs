#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  BM2_CII_OUTPUT_PATH,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';
import { buildBm2BendExpandedAuthorities } from './lfea-b3.29-bm2-bend-geometry-authority.mjs';

const output = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
const pairs = [...output.globalForce.get('OPE').keys()];
const relevantPairs = pairs.filter((pair) => (
  pair.split('-').some((nodeId) => ['120', '129', '130', '160', '168', '169', '170', '180', '190'].includes(nodeId))
));

let geometryError = null;
try {
  buildBm2BendExpandedAuthorities();
} catch (error) {
  geometryError = error instanceof Error ? error.message : String(error);
}

console.log(JSON.stringify({
  schema: 'lfea-bm2-collapsed-span-audit/v1',
  relevantPairs,
  geometryError,
}, null, 2));
