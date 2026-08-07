#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const baselineRoot = process.env.LFEA_UI1_BASELINE_ROOT;
if (!baselineRoot) {
  throw new Error('LFEA_UI1_BASELINE_ROOT must point to the locked pre-UI-1 checkout.');
}

const headRoot = process.cwd();
const head = await loadAuthority(headRoot);
const baseline = await loadAuthority(path.resolve(baselineRoot));
const fixtureNames = ['rectangularQ4Package', 't3PlatePackage', 'sparseRoundTripPackage'];
const evidence = [];

for (const fixtureName of fixtureNames) {
  const headPackage = fixtureValue(head.fixtures, fixtureName);
  const baselinePackage = fixtureValue(baseline.fixtures, fixtureName);
  const headExecution = head.workbench.executeLfeaWorkbench(headPackage, {});
  const baselineExecution = baseline.workbench.executeLfeaWorkbench(baselinePackage, {});

  const actual = authorityHashes(headPackage, headExecution);
  const expected = authorityHashes(baselinePackage, baselineExecution);
  assert.deepEqual(
    actual,
    expected,
    `${fixtureName} semantic authority drifted from locked baseline`,
  );
  evidence.push({ fixtureName, ...actual });
}

console.log(JSON.stringify({
  check: 'lfea-shell-v2-baseline-hash',
  status: 'PASS',
  baselineRoot: path.resolve(baselineRoot),
  fixtures: evidence,
}));

async function loadAuthority(root) {
  const fixturesUrl = pathToFileURL(path.join(root, 'scripts', 'lfea-005-fixtures.mjs')).href;
  const workbenchUrl = pathToFileURL(path.join(root, 'src', 'workspace', 'lfea-workbench.js')).href;
  return {
    fixtures: await import(fixturesUrl),
    workbench: await import(workbenchUrl),
  };
}

function fixtureValue(fixtures, name) {
  if (name === 'sparseRoundTripPackage') return fixtures[name]();
  return fixtures[name]({});
}

function authorityHashes(packageValue, execution) {
  return {
    packageSemanticHash: packageValue.semanticHash,
    resultSemanticHash: execution.result?.semanticHash ?? null,
    reviewSemanticHash: execution.review?.semanticHash ?? null,
    evidenceExportSemanticHash: execution.evidenceExport?.semanticHash ?? null,
  };
}
