/**
 * LFEA SVG Contract Check Script
 * Validates LFEA-SVG-T01, LFEA-SVG-T03, and LFEA SVG contract schemas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  asciiSort,
  createLfeaSvgCommand,
  createLfeaSvgDraft,
  createLfeaSvgEvidence,
  createLfeaSvgPatch,
  createLfeaSvgSelection,
  createLfeaSvgViewportState,
} from '../src/workspace/lfea-svg/lfea-svg-contracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('--- LFEA SVG contract check ---');

// LFEA-SVG-T01: Upstream provenance manifest exact
const provenancePath = path.join(projectRoot, 'src/workspace/lfea-svg/lfea-svg-upstream-provenance.json');
if (!fs.existsSync(provenancePath)) {
  console.error('FAIL: Provenance file missing at ' + provenancePath);
  process.exit(1);
}
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));

if (
  provenance.schema !== 'lfea-svg-upstream-provenance/v1' ||
  provenance.upstreamCommit !== '126df8acc370d22540cb129dce789ea04773ebaf' ||
  provenance.targetBase !== 'ea33e6aacc6a3328b648468dbd6a534bc9a4c867'
) {
  console.error('FAIL: LFEA-SVG-T01 Upstream provenance manifest values do not match requirements.');
  process.exit(1);
}
console.log('LFEA-SVG-T01 PASS upstream provenance manifest exact');

// LFEA-SVG-T03: ASCII ordering independent of locale
const unSorted = ['banana', 'Apple', '100', '20', '_z', 'apple'];
const expectedAscii = ['100', '20', 'Apple', '_z', 'apple', 'banana'];
const sorted = asciiSort(unSorted);

if (JSON.stringify(sorted) !== JSON.stringify(expectedAscii)) {
  console.error('FAIL: LFEA-SVG-T03 ASCII sort failed.', { actual: sorted, expected: expectedAscii });
  process.exit(1);
}
console.log('LFEA-SVG-T03 PASS ASCII ordering independent of locale');

// Contract Schema Verification
const draft = createLfeaSvgDraft({ baseRevision: 'rev-1', entities: ['node2', 'node1'] });
if (draft.entities[0] !== 'node1' || draft.entities[1] !== 'node2') {
  console.error('FAIL: LfeaSvgDraft entity sorting failed.');
  process.exit(1);
}

const command = createLfeaSvgCommand({
  operationId: 'op-01',
  baseRevision: 'rev-1',
  type: 'MOVE_PIPE',
});
if (command.schema !== 'LfeaSvgCommand.v1') {
  console.error('FAIL: LfeaSvgCommand schema validation failed.');
  process.exit(1);
}

const viewport = createLfeaSvgViewportState({ projection: 'ISO' });
if (viewport.projection !== 'ISO') {
  console.error('FAIL: LfeaSvgViewportState projection failed.');
  process.exit(1);
}

console.log('LFEA SVG contract check PASS');
