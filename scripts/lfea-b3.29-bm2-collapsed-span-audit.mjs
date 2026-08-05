#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  BM2_CII_OUTPUT_PATH,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';
import { buildBm2BendExpandedAuthorities } from './lfea-b3.29-bm2-bend-geometry-authority-v2.mjs';

const output = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
const reportPairs = ['120-129', '129-130', '160-168', '168-169', '169-170', '170-180', '180-190'];
const reportNodes = ['120', '129', '130', '160', '168', '169', '170', '180', '190'];
const cases = {};
for (const label of ['OPE', 'SUS', 'EXP']) {
  const displacementReport = output.displacement.get(label);
  const globalReport = output.globalForce.get(label);
  const localReport = output.localForce.get(label);
  const displacements = Object.fromEntries(reportNodes.map((nodeId) => [
    nodeId,
    displacementReport.byNode.get(nodeId) ?? null,
  ]));
  const global = Object.fromEntries(reportPairs.map((pairKey) => [
    pairKey,
    globalReport.byPair.get(pairKey) ?? null,
  ]));
  const local = Object.fromEntries(reportPairs.map((pairKey) => [
    pairKey,
    localReport.byPair.get(pairKey) ?? null,
  ]));
  cases[label] = { displacements, global, local };
}

let geometryError = null;
try {
  buildBm2BendExpandedAuthorities();
} catch (error) {
  geometryError = error instanceof Error ? error.message : String(error);
}

console.log(JSON.stringify({
  schema: 'lfea-bm2-collapsed-span-audit/v4',
  rowCustodySchema: output.schema,
  reportPairs,
  reportNodes,
  cases,
  geometryError,
}, null, 2));
