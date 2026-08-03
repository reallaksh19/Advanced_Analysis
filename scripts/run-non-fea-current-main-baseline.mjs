import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { WorkspaceState } from '../src/workspace/workspace-state.js';
import { projectDataStore } from '../src/workspace/project-data/project-data-store.js';
import { buildSupportSiteModel } from '../src/workspace/support-sites/support-site-model.js';
import { buildRoutePartitionModel } from '../src/workspace/routes/route-partition-model.js';
import { projectDatasetForModelZone } from '../src/workspace/model-zone-selector.js';
import {
  filterResolvedGeometryForModelZone,
  projectSupportSiteModelForModelZone,
} from '../src/workspace/model-zone-viewport-projection.js';
import { buildResolvedEngineeringGeometry } from '../src/workspace/resolved-engineering-geometry.js';
import { buildViewportRenderModel } from '../src/workspace/viewport-render-model.js';
import {
  NON_FEA_BASELINE_SCHEMA,
  NON_FEA_STAGE_IDS,
  codeUnitCompare,
  nonFeaFailure,
  roundMilliseconds,
} from './non-fea-baseline/contracts.mjs';
import { NON_FEA_PRODUCTION_ROUTE_INVENTORY, assertNonFeaRouteInventory } from './non-fea-baseline/production-route-inventory.mjs';
import { NonFeaStageRecorder } from './non-fea-baseline/stage-recorder.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FIXTURES = [
  'benchmarks/ATTRIBUTE-AML_ASIM-1835_managed_stage_enriched_stage.json',
  'benchmarks/Sjson.json',
  'benchmarks/1885Sjson/EnrichedSjson',
];
const REQUIRED_UNRESOLVED_FIXTURE_ROLES = [
  'TOPOLOGY_EDIT_20_OBJECT',
  'LARGE_MODEL_4884_ENTITY',
  'REAL_1885_SUPPORT_BRANCH',
];
import { NON_FEA_P0_COMMANDS, runNonFeaP0Command } from './non-fea-baseline/command-ladder.mjs';
import { summarizeNonFeaStages } from './non-fea-baseline/statistics.mjs';

const options = parseArguments(process.argv.slice(2));
const exactHeadSha = gitValue(['rev-parse', 'HEAD']);
const dirtyStatus = gitValue(['status', '--short']);
const executionId = options.executionId || `p0-${exactHeadSha.slice(0, 12) || 'unknown'}`;
const failures = [];
const fixtureRuns = [];
const fixtureLedger = [];

assertNonFeaRouteInventory();

for (const fixture of options.fixtures) {
  const fixturePath = path.resolve(ROOT, fixture);
  let metadata;
  try {
    const info = await stat(fixturePath);
    metadata = { path: normalizedPath(path.relative(ROOT, fixturePath)), byteLength: info.size, status: 'PRESENT' };
  } catch (error) {
    metadata = { path: normalizedPath(path.relative(ROOT, fixturePath)), byteLength: null, status: 'MISSING' };
    failures.push(nonFeaFailure({
      classification: 'MISSING_AUTHORITY',
      code: 'P0_REQUIRED_FIXTURE_MISSING',
      message: `Required fixture is missing: ${metadata.path}.`,
      details: { path: metadata.path },
    }));
  }
  if (metadata.status !== 'PRESENT') {
    fixtureLedger.push({ ...metadata, sourceSha256: null, declaredUse: [], realOrSimulated: 'UNRESOLVED', expectedIdentity: {}, authorityNotes: ['P0 owner adjudication required.'] });
    continue;
  }

  const first = await executeFixtureSample({ fixturePath, fixture: metadata.path, executionId, sampleKind: 'COLD', sampleIndex: 0 });
  fixtureRuns.push(first.run);
  failures.push(...first.run.failures);
  fixtureLedger.push({
    ...metadata,
    sourceSha256: first.fixture.sourceSha256,
    declaredUse: ['normalization', 'support-sites', 'route-partition', 'resolved-geometry', 'render-model'],
    realOrSimulated: 'REAL_REPOSITORY_FIXTURE',
    expectedIdentity: first.fixture.identity,
    authorityNotes: first.fixture.authorityNotes,
  });

  for (let sampleIndex = 1; sampleIndex < options.warmSamples + 1; sampleIndex += 1) {
    const warm = await executeFixtureSample({ fixturePath, fixture: metadata.path, executionId, sampleKind: 'WARM', sampleIndex });
    fixtureRuns.push(warm.run);
    failures.push(...warm.run.failures);
  }
}

for (const role of REQUIRED_UNRESOLVED_FIXTURE_ROLES) {
  fixtureLedger.push({
    path: null,
    sourceSha256: null,
    byteLength: null,
    declaredUse: [role],
    realOrSimulated: 'UNRESOLVED',
    expectedIdentity: {},
    authorityNotes: ['P0 must bind this role to one exact repository fixture before acceptance.'],
    status: 'MISSING_AUTHORITY',
  });
  failures.push(nonFeaFailure({
    classification: 'MISSING_AUTHORITY',
    code: 'P0_FIXTURE_ROLE_UNRESOLVED',
    message: `Required P0 fixture role is unresolved: ${role}.`,
    details: { role },
  }));
}

const commandRuns = options.runCommands ? NON_FEA_P0_COMMANDS.map((row) => runNonFeaP0Command(row, ROOT)) : [];
if (!options.runCommands) {
  failures.push(nonFeaFailure({
    classification: 'UNRESOLVED_GATE',
    code: 'P0_COMMAND_LADDER_NOT_EXECUTED',
    message: 'The exact-head P0 command ladder has not been executed by this run.',
  }));
}
for (const command of commandRuns.filter((row) => row.status !== 'PASS')) {
  failures.push(nonFeaFailure({
    classification: command.status === 'BLOCKED' ? 'INFRASTRUCTURE_BLOCKER' : 'PRE_EXISTING_CURRENT_MAIN_DEFECT',
    code: 'P0_COMMAND_FAILED',
    message: `${command.commandId} did not pass.`,
    details: { commandId: command.commandId, exitCode: command.exitCode },
  }));
}

const browserStageIds = ['THREE_MATERIALIZATION', 'GPU_SCENE_INSTALL', 'FIT', 'FIRST_MEANINGFUL_FRAME', 'SELECTION', 'ORBIT_PAN'];
for (const stageId of browserStageIds) {
  if (!commandRuns.some((row) => row.commandId === 'three-viewport-navigation-browser' && row.status === 'PASS')) {
    failures.push(nonFeaFailure({
      classification: 'INFRASTRUCTURE_BLOCKER',
      code: 'P0_BROWSER_STAGE_NOT_MEASURED',
      message: `${stageId} requires browser evidence and is not measured by the Node runner.`,
      stageId,
    }));
  }
}

const report = {
  schema: NON_FEA_BASELINE_SCHEMA,
  status: failures.length === 0 ? 'PASS' : 'UNRESOLVED_GATE',
  programmeBaseSha: '0bad5b4200a8e24a358e76b1ea8372da33485c87',
  exactHeadSha: exactHeadSha || null,
  dirtyStatus: dirtyStatus || '',
  executionId,
  generatedAt: new Date().toISOString(),
  routeInventory: NON_FEA_PRODUCTION_ROUTE_INVENTORY,
  fixtureLedger: fixtureLedger.sort((left, right) => codeUnitCompare(left.path || left.declaredUse[0], right.path || right.declaredUse[0])),
  fixtureRuns,
  stageStatistics: summarizeNonFeaStages(fixtureRuns),
  commandRuns,
  failures,
  observabilityGaps: [
    'SOURCE_SNAPSHOT, SOURCE_INDEX, entity normalization, and SHARED_MODD are currently measured only inside composite NORMALIZATION.',
    'Browser-only Three materialization, GPU install, fit, first meaningful frame, first pick, orbit/pan, and long tasks require the Playwright ledger.',
    'Canonical topology/checker/edit transactions are exercised by registered tests, not reconstructed from the normalization runner.',
  ],
  sourceMutationDisposition: failures.some((row) => row.code === 'P0_SOURCE_MUTATED') ? 'FAIL' : 'NO_MUTATION_OBSERVED_IN_COMPLETED_SAMPLES',
};

await mkdir(path.dirname(path.resolve(ROOT, options.output)), { recursive: true });
await writeFile(path.resolve(ROOT, options.output), ${JSON.stringify(report, null, 2)}\n, 'utf8');
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  exactHeadSha: report.exactHeadSha,
  executionId: report.executionId,
  fixtureCount: report.fixtureLedger.length,
  runCount: report.fixtureRuns.length,
  failureCount: report.failures.length,
  output: options.output,
}, null, 2));
if (options.failOnGate && report.status !== 'PASS') process.exitCode = 1;

async function executeFixtureSample({ fixturePath, fixture, executionId: id, sampleKind, sampleIndex }) {
  const recorder = new NonFeaStageRecorder({ executionId: id, fixturePath: fixture, sampleKind, sampleIndex });
  let bytes;
  let text;
  let raw;
  let dataset;
  let sourceSha256 = null;
  let rawBeforeHash = null;
  let rawAfterHash = null;
  let products = {};
  try {
    bytes = await recorder.capture('FILE_READ', () => readFile(fixturePath));
    sourceSha256 = sha256(bytes);
    text = await recorder.capture('UTF8_DECODE', () => bytes.toString('utf8'));
    raw = await recorder.capture('JSON_PARSE', () => JSON.parse(text));
    rawBeforeHash = semanticHash(raw);
    dataset = await recorder.capture('NORMALIZATION', () => normalizeWorkspaceDataset(raw, fixture, { sourceBytes: bytes, sourceSha256 }));
    products = { dataset: semanticHash(dataset), hierarchy: semanticHash(dataset.hierarchy), sharedModel: semanticHash(dataset.sharedModel) };
    rawAfterHash = semanticHash(raw);
    if (rawBeforeHash !== rawAfterHash || sha256(bytes) !== sourceSha256) {
      const error = new Error('Source package or bytes changed during read-only baseline execution.');
      error.code = 'P0_SOURCE_MUTATED';
      throw error;
    }
    await recorder.capture('WORKSPACE_SNAPSHOT', () => WorkspaceState.loadDataset(dataset));
    const profile = projectDataStore.getProfile();
    const supportSites = await recorder.capture('SUPPORT_SITES', () => buildSupportSiteModel(dataset, profile));
    const routes = await recorder.capture('ROUTE_PARTITION', () => buildRoutePartitionModel(dataset, profile));
    const zoneProjection = await recorder.capture('MODEL_ZONE_PROJECTION', () => projectDatasetForModelZone(dataset, null));
    const scopedSupports = projectSupportSiteModelForModelZone(supportSites, zoneProjection);
    const resolved = await recorder.capture('RESOLVED_GEOMETRY', () => filterResolvedGeometryForModelZone(
      buildResolvedEngineeringGeometry(dataset, profile, scopedSupports),
      zoneProjection,
      scopedSupports,
    ));
    const renderModel = await recorder.capture('RENDER_MODEL', () => buildViewportRenderModel(resolved));
    products = {
      ...products,
      supportSites: semanticHash(supportSites),
      routes: semanticHash(routes),
      zoneProjection: semanticHash(zoneProjection),
      resolvedGeometry: semanticHash(resolved),
      renderModel: semanticHash(renderModel),
      diagnostics: semanticHash({ skippedEntityIds: renderModel.skippedEntityIds, summary: renderModel.summary }),
    };
  } catch {
    // The recorder already retained the exact failure. P0 continues to write the complete ledger.
  } finally {
    try { WorkspaceState.clearDataset(); } catch { /* read-only cleanup best effort */ }
  }
  return {
    fixture: {
      sourceSha256,
      identity: dataset ? { datasetId: dataset.datasetId, entityCount: dataset.entities.length, sourceSchema: dataset.sourceSchema } : {},
      authorityNotes: dataset ? ['Normalized through production normalizeWorkspaceDataset.'] : ['Production normalization did not complete.'],
    },
    run: { ...recorder.snapshot(), products, sourceHashes: { before: rawBeforeHash, after: rawAfterHash, bytes: sourceSha256 } },
  };
}

function parseArguments(args) {
  const fixtures = [];
  let output = 'reports/non-fea-current-main-baseline.json';
  let warmSamples = 1;
  let executionId = '';
  let runCommands = false;
  let failOnGate = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--fixture') fixtures.push(args[index += 1]);
    else if (arg === '--output') output = args[index += 1];
    else if (arg === '--warm-samples') warmSamples = Number(args[index += 1]);
    else if (arg === '--execution-id') executionId = args[index += 1];
    else if (arg === '--run-commands') runCommands = true;
    else if (arg === '--fail-on-gate') failOnGate = true;
    else throw new TypeError(`Unsupported argument: ${arg}.`);
  }
  if (!Number.isInteger(warmSamples) || warmSamples < 0) throw new TypeError('--warm-samples must be a non-negative integer.');
  return { fixtures: fixtures.length ? fixtures : DEFAULT_FIXTURES, output, warmSamples, executionId, runCommands, failOnGate };
}

function gitValue(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}
function normalizedPath(value) { return value.split(path.sep).join('/'); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
