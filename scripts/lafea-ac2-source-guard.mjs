#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const production = [
  'src/workspace/lafea-preparation-contract.js',
  'src/workspace/lafea-preparation-profile.js',
  'src/workspace/lafea-preparation-projection.js',
  'src/workspace/lafea-workbench-preparation-state.js',
  'src/workspace/lafea-stage-analysis-adapter.js',
  'src/workspace/lafea-workbench-orchestration-projection.js',
];
const forbidden = [
  /inputxml/iu,
  /executeLafeaStage/u,
  /solveInputXml/u,
  /calculateLocalContinuum/u,
  /calculateLocalShell/u,
  /executeControlledLafea/u,
  /registerLafeaArtifact/u,
  /registerLifecycleArtifact/u,
  /createLafeaAnalysisMeshEvidence/u,
  /meshGeneration\s*=\s*true/u,
  /releaseQualified\s*=\s*true/u,
];
for (const path of production) {
  const source = fs.readFileSync(path, 'utf8');
  for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${path} violates ${pattern}`);
}
const all = [...production, 'src/workspace/lafea-workbench-orchestrator-store.js',
  'scripts/lafea-ac2-preparation-check.mjs', 'scripts/lafea-ac2-source-guard.mjs'];
for (const path of all) {
  const lines = fs.readFileSync(path, 'utf8').trimEnd().split('\n').length;
  assert.ok(lines < 300, `${path} has ${lines} lines`);
}
console.log(JSON.stringify({ check: 'lafea-ac2-source-guard', status: 'PASS', files: all.length }));
