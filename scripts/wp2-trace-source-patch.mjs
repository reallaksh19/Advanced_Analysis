import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../src/workspace/engineering-loads/empirical-beam-contact-runtime.js', import.meta.url);
let source = readFileSync(path, 'utf8');
source = replaceOnce(
  source,
  "      ...internalExtrema.flatMap((row) => row.formulaTrace),\n      ...equilibrium.formulaTrace,\n",
  "      ...internalExtrema.flatMap((row) => row.formulaTrace),\n      ...compilation.componentStationEvidence.flatMap((row) => row.formulaTrace || []),\n      ...equilibrium.formulaTrace,\n",
  'region formula trace',
);
source = replaceOnce(
  source,
  "    physicalArcLengthM: elbow.physicalArcLengthM,\n    nodeIds: elbow.nodes.map((row) => row.id),\n",
  "    physicalArcLengthM: elbow.physicalArcLengthM,\n    nodeIds: elbow.nodes.map((row) => row.id),\n    formulaTrace: elbow.formulaTrace,\n",
  'elbow evidence trace',
);
writeFileSync(path, source);
console.log('wp2-trace-source-patch: APPLIED');

function replaceOnce(value, before, after, label) {
  const count = value.split(before).length - 1;
  assert.equal(count, 1, `${label}: expected one source match, found ${count}`);
  return value.replace(before, after);
}
