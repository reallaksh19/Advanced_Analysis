#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const facade = read('../src/workspace/lafea-lifecycle-workbench-store.js');
const publicSurface = read('../src/workspace/lafea-workbench.js');
const orchestrator = read('../src/workspace/lafea-workbench-orchestrator-store.js');
const sourceState = read('../src/workspace/lafea-workbench-source-state.js');
const meshState = read('../src/workspace/lafea-workbench-mesh-state.js');
const preparationState = read('../src/workspace/lafea-workbench-preparation-state.js');
const preparationProfile = read('../src/workspace/lafea-preparation-profile.js');
const projection = read('../src/workspace/lafea-workbench-orchestration-projection.js');
const adapter = read('../src/workspace/lafea-stage-analysis-adapter.js');
const legacyCore = read('../src/workspace/lafea-lifecycle-workbench-store-core.js');
const legacyMesh = read('../src/workspace/lafea-analysis-mesh-workbench-store.js');

assert.doesNotMatch(facade, /lafea-lifecycle-workbench-store-core/u);
assert.doesNotMatch(facade, /lafea-analysis-mesh-workbench-store/u);
assert.match(facade, /createLafeaWorkbenchOrchestratorStore/u);
assert.match(publicSurface, /LAFEA_WORKBENCH_ORCHESTRATION_SCHEMA/u);
assert.match(publicSurface, /requireLafeaStageAnalysisAdapter/u);
assert.match(orchestrator, /createRetainedStore/u);
assert.match(orchestrator, /createLafeaWorkbenchSourceState/u);
assert.match(orchestrator, /createLafeaWorkbenchMeshState/u);
assert.match(orchestrator, /createLafeaWorkbenchPreparationState/u);
assert.match(orchestrator, /buildLafeaWorkbenchOrchestrationProjection/u);
assert.equal((orchestrator.match(/new Set\(\)/gu) ?? []).length, 1, 'Only the canonical orchestrator may own a public listener set.');
for (const stateSource of [sourceState, meshState, preparationState]) {
  assert.equal(stateSource.includes('.subscribe('), false);
  assert.equal(stateSource.includes('new Set()'), false);
}
assert.doesNotMatch(projection, /document\.querySelector|HTMLElement|addEventListener/u);
assert.doesNotMatch(adapter, /executeControlledLafea|registerLifecycleArtifact|createLafeaAnalysisMeshEvidence|(?:generate|refine)[A-Z][A-Za-z0-9_]*\s*\(/u);
assert.match(adapter, /generationAuthorized:\s*false/u);
assert.match(adapter, /refinementAuthorized:\s*false/u);
assert.match(projection, /RELEASE_NOT_QUALIFIED/u);
assert.match(preparationProfile, /LAFEA_PREPARATION_PRODUCER_NOT_QUALIFIED/u);
assert.match(projection, /preparation\?\.usableForAuthorization/u);

for (const compatibilitySource of [legacyCore, legacyMesh]) {
  assert.doesNotMatch(compatibilitySource, /new Set\(\)|\.subscribe\(|function publish\s*\(/u);
  assert.doesNotMatch(compatibilitySource, /suppressBasePublish|suppressRetainedPublish/u);
}
assert.match(legacyCore, /Deprecated compatibility alias/u);
assert.match(legacyCore, /createLafeaWorkbenchOrchestratorStore as createLafeaWorkbenchStoreCore/u);
assert.match(legacyMesh, /Deprecated compatibility surface/u);
assert.match(legacyMesh, /createLafeaWorkbenchMeshState/u);
assert.doesNotMatch(legacyMesh, /decorateLafeaAnalysisMeshWorkbenchStore/u);

for (const path of [
  '../src/workspace/lafea-stage-analysis-adapter.js',
  '../src/workspace/lafea-preparation-contract.js',
  '../src/workspace/lafea-preparation-profile.js',
  '../src/workspace/lafea-preparation-projection.js',
  '../src/workspace/lafea-workbench-preparation-state.js',
  '../src/workspace/lafea-workbench-orchestration-projection.js',
  '../src/workspace/lafea-workbench-source-state.js',
  '../src/workspace/lafea-workbench-mesh-state.js',
  '../src/workspace/lafea-workbench-orchestrator-store.js',
  '../src/workspace/lafea-lifecycle-workbench-store.js',
  '../src/workspace/lafea-lifecycle-workbench-store-core.js',
  '../src/workspace/lafea-analysis-mesh-workbench-store.js',
  '../src/workspace/lafea-workbench.js',
  './lafea-architecture-convergence-check.mjs',
  './lafea-architecture-convergence-source-guard.mjs',
  './lafea-u3b-live-lifecycle-check.mjs',
]) {
  const lines = read(path).trimEnd().split('\n').length;
  assert.ok(lines < 300, `${path} exceeds the 299-line architectural limit`);
}
console.log(JSON.stringify({
  check: 'lafea-architecture-convergence-source-guard', status: 'PASS',
  facadeOnFacadeStoreComposition: false, publicListenerSets: 1,
  sourceStatePublishes: false, meshStatePublishes: false, preparationStatePublishes: false,
  legacyCoreImplementationRetained: false, legacyMeshDecoratorRetained: false,
  centralPublicOrchestrationSurface: true, domAuthorityInputs: false,
  preparationDiagnosticAuthorityManufactured: false, meshExecutionAuthorityAdded: false,
  releaseQualified: false,
}));
function read(relativePath) { return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'); }
