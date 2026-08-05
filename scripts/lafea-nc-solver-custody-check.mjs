import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateSolverCustody,
  REQUIRED_SOLVER_CUSTODY_EVIDENCE,
  validateSolverCustodyInventory,
} from '../src/core/nonlinear-shell-contact/solver-custody-evidence.js';

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key, rest.join('=')];
  }),
);
const inventoryPath = resolve(
  args.get('--inventory') || 'evidence/nonlinear-shell-contact/solver-custody/inventory.json',
);
const rootDir = resolve(args.get('--root') || '.');
const outputDir = resolve(args.get('--output-dir') || 'artifacts/lafea-nc-solver-custody');
const expectedStatus = args.get('--expect-status') || 'SOLVER_CUSTODY_BLOCKED';

const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
validateSolverCustodyInventory(inventory);
const first = await evaluateSolverCustody({ inventory, rootDir });
const second = await evaluateSolverCustody({ inventory, rootDir });
assert.deepEqual(second, first, 'Solver-custody evaluation must replay deterministically.');
assert.equal(first.status, expectedStatus, `Expected ${expectedStatus}, received ${first.status}.`);

if (expectedStatus === 'SOLVER_CUSTODY_BLOCKED') {
  assert.deepEqual(first.missingEvidence, [...REQUIRED_SOLVER_CUSTODY_EVIDENCE].sort());
  assert.equal(first.verifiedEvidenceCount, 0);
  assert.equal(first.authority.solverCustodyQualified, false);
}
assert.equal(first.authority.solverBridgeQualified, false);
assert.equal(first.authority.moduleQualified, false);
assert.equal(first.authority.productionExecutionAuthorized, false);
assert.equal(first.authority.mergeAuthorized, false);

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'solver-custody-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
await writeFile(resolve(outputDir, 'solver-custody-report.json'), `${JSON.stringify(first, null, 2)}\n`);
console.log(JSON.stringify(first));
