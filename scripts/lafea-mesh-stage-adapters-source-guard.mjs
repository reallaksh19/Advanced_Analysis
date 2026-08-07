import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adapter = await readFile(new URL('../src/workspace/lafea-mesh-stage-adapter.js', import.meta.url), 'utf8');
const request = await readFile(new URL('../src/workspace/lafea-mesh-stage-request.js', import.meta.url), 'utf8');
const sources = [adapter, request];
const prohibited = [
  'executeLafeaStage',
  'calculateLocalContinuum',
  'calculateLocalShell',
  'executeControlledLafea',
  'registerLifecycleArtifact',
  'registerLafeaArtifact',
  'createLafeaAnalysisMeshEvidence',
  'recoverAnalysisMeshEvidence',
  'solveInputXml',
];
for (const source of sources) {
  for (const token of prohibited) assert.equal(source.includes(token), false, `WP-MA1 imports/calls ${token}`);
}
assert.match(adapter, /requireLafeaStageAnalysisAdapter/u);
assert.doesNotMatch(adapter, /const\s+STAGE_ADAPTERS\s*=/u);
assert.match(adapter, /generationExecutionAuthorized:\s*discretization\.generationAuthorized\s*===\s*true/u);
assert.match(adapter, /refinementExecutionAuthorized:\s*discretization\.refinementAuthorized\s*===\s*true/u);
assert.doesNotMatch(request, /stageValue\.(?:sourceHash|canonicalModelHash|analysisGeometryHash)/u);

console.log(JSON.stringify({
  status: 'PASS',
  package: 'WP-MA1',
  canonicalStageAdapterConsumed: true,
  duplicateStageMeshAuthority: false,
  executionImportsPresent: false,
  lifecycleMutationImportsPresent: false,
}, null, 2));
