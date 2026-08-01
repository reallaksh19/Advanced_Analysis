#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

const diagnostic = read('../src/workspace/lafea-canvas/diagnostic-field-display.js');
const request = read('../src/workspace/lafea-canvas/result-render-request.js');
const renderer = read('../src/workspace/lafea-canvas/three-mesh-renderer-v2.js');
const fixture = read('../e2e/fixtures/lafea-hybrid-workbench-fixture.js');
const matrix = JSON.parse(read('../e2e/lafea-hybrid-validation-matrix.json'));
const prohibitedDisplayCalls = /\b(?:average|smooth|interpolate|recover|replaceMissing|nearest|neighbour|neighbor)\w*\s*\(/u;

assert.match(diagnostic, /VALID:\s*0/u);
assert.match(diagnostic, /UNRECOVERED:\s*1/u);
assert.match(diagnostic, /LAFEA-UNRECOVERED-VERTEX-MAGENTA-V1/u);
assert.match(diagnostic, /color:\s*\[1, 0, 1\]/u);
assert.match(diagnostic, /sha256:lafea-u4j-unrecovered-magenta-v1/u);
assert.match(diagnostic, /diagnosticVertexCount/u);
assert.match(diagnostic, /diagnosticColor \?\? colorMap/u);
assert.doesNotMatch(diagnostic, prohibitedDisplayCalls);
assert.doesNotMatch(diagnostic, /filter\([^)]*Number\.isFinite|reduce\(/u);

assert.match(request, /requireDiagnosticAuthority/u);
assert.match(request, /packet\.field\.valueRole === 'DIAGNOSTIC_VERTEX_FIELD'/u);
assert.match(request, /LAFEA_RESULT_RENDER_DIAGNOSTIC_FIELD_UNSUPPORTED/u);
assert.match(request, /LAFEA_RESULT_RENDER_DIAGNOSTIC_FLAG_REQUIRED/u);
assert.match(request, /diagnosticDisplay/u);
assert.doesNotMatch(request, prohibitedDisplayCalls);

assert.match(renderer, /createLafeaDiagnosticSafeVertexColors/u);
assert.match(renderer, /diagnosticVertexCount/u);
assert.match(renderer, /diagnosticPolicyId/u);
assert.match(renderer, /diagnosticPolicyHash/u);
assert.doesNotMatch(renderer, /fieldValues\[[^\]]+\]\s*=|qualityFlags\[[^\]]+\]\s*=/u);
assert.doesNotMatch(renderer, prohibitedDisplayCalls);

assert.match(fixture, /mountHcDiagnosticResult/u);
assert.match(fixture, /Number\.NaN/u);
assert.match(fixture, /qualityFlags:\s*new Uint8Array\(diagnostic \? \[0, 1, 0\]/u);
assert.match(fixture, /valueRole:\s*'DIAGNOSTIC_VERTEX_FIELD'/u);
assert.match(fixture, /QUALIFIED_RECOVERY_FINITE_FIELD_BOUNDS/u);
assert.doesNotMatch(fixture, /stage\.execution|executeLafeaStage|\bcalculate\w*\s*\(|\brecover\w*\s*\(/u);

const hc05 = matrix.cases.find((entry) => entry.testId === 'HC-UI-05');
assert.equal(hc05.implementationStatus, 'IMPLEMENTED_EXECUTION_REQUIRED');
assert.equal(hc05.spec, 'e2e/lafea-hybrid-workbench.spec.js');
assert.equal(hc05.expectedResult, 'Diagnostic colour, no averaging');

for (const [path, source, maximum] of [
  ['src/workspace/lafea-canvas/diagnostic-field-display.js', diagnostic, 180],
  ['src/workspace/lafea-canvas/result-render-request.js', request, 260],
  ['src/workspace/lafea-canvas/three-mesh-renderer-v2.js', renderer, 200],
  ['e2e/fixtures/lafea-hybrid-workbench-fixture.js', fixture, 300],
]) {
  assert.ok(source.split(/\r?\n/u).length <= maximum, `${path} exceeds ${maximum} lines.`);
}

assert.doesNotMatch(
  `${diagnostic}\n${request}\n${renderer}`,
  /initializeLifecycle|registerLifecycleArtifact|applyLifecycleEvent|stage\.execution/u,
);
assert.doesNotMatch(
  `${diagnostic}\n${request}\n${renderer}`,
  /from\s+['"][^'"]*(?:src\/core|local-shell|lafea-templates|benchmark-fixtures)[^'"]*['"]/u,
);

console.log(JSON.stringify({
  check: 'lafea-u4j-source-guard',
  status: 'PASS',
  qualityFlagCatalog: { VALID: 0, UNRECOVERED: 1 },
  diagnosticPolicy: 'LAFEA-UNRECOVERED-VERTEX-MAGENTA-V1',
  diagnosticFieldAuthorityRequired: true,
  originalValuesMutated: false,
  averagingPaths: 0,
  smoothingPaths: 0,
  recoveryPaths: 0,
  lifecycleMutationPaths: 0,
  numericalImports: 0,
  templateImports: 0,
  lafea6Enabled: false,
}));

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
