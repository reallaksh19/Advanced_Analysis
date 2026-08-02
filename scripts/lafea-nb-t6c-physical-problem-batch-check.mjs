#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  createLafeaLugPinholePhysicalProblemProjection,
  executeLafeaLugPinholePhysicalProblemBatch,
  validateLafeaLugPinholePhysicalProblemProjection,
} from '../src/workspace/lafea-controlled-continuum-public.js';
import { createNbT6cFixture } from './lafea-nb-t6c-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT, encoding: 'utf8',
}).trim();
const fixture = createNbT6cFixture(ROOT, HEAD);
let negativeCount = 0;
sourceGuards();

const projection = createLafeaLugPinholePhysicalProblemProjection(
  fixture.projectionInput,
);
assert.equal(projection.status, 'PROJECTION_READY');
assert.equal(validateLafeaLugPinholePhysicalProblemProjection(projection).ok, true);
assert.deepEqual(
  projection.levels.map((row) => row.meshEvidence.mesh.elements.length),
  [16, 64, 256],
);
assert.equal(projection.mappingPackage.status, 'MAPPING_EVIDENCE_QUALIFIED');
assert.equal(projection.mappingPackage.boundBinding.status, 'BOUND');
assert.equal(projection.authority.productionMeshGenerated, true);
assert.equal(projection.authority.stageDocumentsGenerated, true);
assert.equal(projection.authority.generalT7dAuthorized, false);
assert.equal(projection.authority.releaseQualified, false);

const replay = createLafeaLugPinholePhysicalProblemProjection(
  fixture.projectionInput,
);
assert.equal(replay.projectionHash, projection.projectionHash);
assert.equal(replay.mappingPackage.semanticHash, projection.mappingPackage.semanticHash);

const benchmark = fixture.benchmark(projection.mappingPackage.semanticHash);
const executionInput = {
  schema: LAFEA_LUG_PINHOLE_EXECUTION_INTAKE_SCHEMA,
  projection,
  benchmarkQualification: benchmark,
  requestId: 'NB-T6C-C2D-LUG-PINHOLE-001',
  recoveryProfileHash: fixture.hash('NB-T6C-INTEGRATION-POINT-RECOVERY'),
  convergenceRequest: {
    quantityId: 'PINHOLE_MAX_RETAINED_VON_MISES',
    units: 'MPa', tolerance: 1e-8, loadCaseId: 'LC1',
    component: 'VON_MISES', reducer: 'MAXIMUM_SIGNED',
  },
};
const executed = executeLafeaLugPinholePhysicalProblemBatch(executionInput);
assert.equal(executed.status, 'ACCEPTED');
assert.equal(executed.accepted, true);
assert.equal(executed.controllerResult.receipt.resultReady, true);
assert.equal(executed.controllerResult.receipt.convergenceReady, true);
assert.equal(executed.controllerResult.receipt.codeReady, false);
assert.equal(executed.authority.selectedPilotExecution, true);
assert.equal(executed.authority.generalT7dAuthorized, false);
assert.equal(executed.authority.shellAuthorized, false);
assert.equal(executed.authority.releaseQualified, false);
const deterministic = executeLafeaLugPinholePhysicalProblemBatch(executionInput);
assert.equal(deterministic.executionHash, executed.executionHash);
assert.equal(
  deterministic.controllerResult.receipt.evidenceHash,
  executed.controllerResult.receipt.evidenceHash,
);

expectCode('invalid feature role', () =>
  createLafeaLugPinholePhysicalProblemProjection({
    ...fixture.projectionInput,
    featureProjection: {
      ...fixture.projectionInput.featureProjection,
      loadFeature: {
        ...fixture.projectionInput.featureProjection.loadFeature,
        role: 'DISPLAY_SELECTION',
      },
    },
  }), 'LAFEA_NB_T6C_FEATURE_DECLARATION_INVALID');
expectCode('non-integral feature refinement', () =>
  createLafeaLugPinholePhysicalProblemProjection({
    ...fixture.projectionInput,
    levels: [
      fixture.projectionInput.levels[0],
      { ...fixture.projectionInput.levels[1], circumferentialDivisions: 12 },
      { ...fixture.projectionInput.levels[2], circumferentialDivisions: 24 },
    ],
  }), 'LAFEA_NB_T6C_FEATURE_REFINEMENT_NOT_INTEGRAL');
expectCode('stale benchmark parent', () =>
  executeLafeaLugPinholePhysicalProblemBatch({
    ...executionInput,
    benchmarkQualification: fixture.benchmark(fixture.hash('STALE-MAPPING')),
  }), 'LAFEA_NB_T6C_BENCHMARK_MAPPING_PARENT_STALE');
const tamperedDeclaration = structuredClone(projection);
tamperedDeclaration.physicalProblemHash = fixture.hash('TAMPERED');
expectCode('tampered declaration', () =>
  executeLafeaLugPinholePhysicalProblemBatch({
    ...executionInput, projection: tamperedDeclaration,
  }), 'LAFEA_NB_T6C_PROJECTION_DECLARATION_TAMPERED');
const sourceDrift = structuredClone(projection);
sourceDrift.levels[1].document.nodes[0].x += 1;
expectCode('source mesh drift', () =>
  executeLafeaLugPinholePhysicalProblemBatch({
    ...executionInput, projection: sourceDrift,
  }), 'LAFEA_NB_T6C_PROJECTION_LEVEL_TAMPERED');

console.log(JSON.stringify({
  schema: 'lafea-nb-t6c-physical-problem-batch-check/v1',
  status: 'PASS', exactHead: HEAD,
  pilot: 'C2D-LUG-PINHOLE -> LAFEA.3',
  projectionHash: projection.projectionHash,
  requestHash: executed.request.semanticHash,
  executionHash: executed.executionHash,
  meshElementCounts: [16, 64, 256],
  mappingStatus: projection.mappingPackage.status,
  controllerStatus: executed.controllerResult.status,
  negativeTestCount: negativeCount,
  authority: {
    selectedPhysicalProblemProjection: true,
    selectedB7dHandoff: true,
    generalT7dAuthorized: false,
    arbitraryGeometrySupported: false,
    shellAuthorized: false,
    assessmentReady: false,
    codeReady: false,
    reportAuthority: false,
    releaseQualified: false,
  },
}));

function sourceGuards() {
  const production = fs.readFileSync(path.join(
    ROOT,
    'src/workspace/lafea-lug-pinhole-physical-problem-batch.js',
  ), 'utf8');
  assert.doesNotMatch(production, /from ['"][^'"]*local-continuum[^'"]*['"]/u);
  assert.doesNotMatch(production, /\bcalculateLocalContinuum\s*\(/u);
  assert.doesNotMatch(production, /\bexecuteLafeaStage\s*\(/u);
  assert.match(production, /lafea-controlled-continuum-execution-public\.js/u);
  assert.match(production, /executeControlledLafeaContinuumPilot/u);
  const publicSource = fs.readFileSync(path.join(
    ROOT,
    'src/workspace/lafea-controlled-continuum-public.js',
  ), 'utf8');
  for (const symbol of [
    'createLafeaLugPinholePhysicalProblemProjection',
    'executeLafeaLugPinholePhysicalProblemBatch',
    'validateLafeaLugPinholePhysicalProblemProjection',
  ]) assert.match(publicSource, new RegExp(symbol, 'u'));
  for (const file of walk(path.join(ROOT, 'src/workspace'))) {
    if (!file.endsWith('.js')
      || !/(?:wizard|panel|view|ui|import)/iu.test(path.basename(file))) continue;
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /lafea-lug-pinhole-physical-problem-batch\.js/u);
    assert.doesNotMatch(source, /\bexecuteLafeaLugPinholePhysicalProblemBatch\s*\(/u);
  }
}
function expectCode(label, body, code) {
  assert.throws(body, (error) => error?.code === code, label);
  negativeCount += 1;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
