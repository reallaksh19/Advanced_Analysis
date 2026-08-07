import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createNonFeaEnrichedProjection,
  createNonFeaEnrichmentSidecar,
  resolveNonFeaEnrichment,
} from '../src/core/non-fea-enrichment/index.js';
import {
  assessCommonInputStaleness,
  createEnrichedStagedJsonExport,
  createPreFeaPipingCheckRequest,
  reimportEnrichedStagedJsonExport,
  runPreFeaPipingCheck,
  sealCommonEnrichedPipingInput,
} from '../src/core/non-fea-common-checker/index.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';
import { buildStraightFixture } from './w10.5-screening-fixtures.mjs';

const COMPONENT_COUNT = 1885;
const SUPPORT_COUNT = 163;
const ITERATIONS = 3;
const MAX_TOTAL_MS = 30000;
const sourceModel = buildGeneratedLargeModel();
const sourceBefore = JSON.stringify(sourceModel);
const startHeap = process.memoryUsage().heapUsed;
const start = performance.now();
const runs = [];

for (let index = 0; index < ITERATIONS; index += 1) runs.push(runQualification(index));

const elapsedMs = performance.now() - start;
const endHeap = process.memoryUsage().heapUsed;
assert.ok(elapsedMs < MAX_TOTAL_MS, `Generated large-model qualification exceeded ${MAX_TOTAL_MS} ms: ${elapsedMs.toFixed(1)} ms.`);
assert.equal(JSON.stringify(sourceModel), sourceBefore, 'qualification mutated the source model');
assert.equal(sourceModel.components.length, COMPONENT_COUNT);
assert.equal(sourceModel.supports.length, SUPPORT_COUNT);
assert(runs.every((row) => row.report.methodRows.length === 2), 'qualification must execute two method rows');
assert(runs.every((row) => row.report.methodRows.every((method) => method.requirements.length > 0)), 'zero-step method row detected');
assert(runs.every((row) => row.report.methodRows.every((method) => method.state === 'READY')));
assert(runs.every((row) => row.report.packageState === 'READY'));
assert(runs.every((row) => row.request.semanticHash === runs[0].request.semanticHash));
assert(runs.every((row) => row.report.semanticHash === runs[0].report.semanticHash));
assert(runs.every((row) => row.commonInput.semanticHash === runs[0].commonInput.semanticHash));
assert(runs.every((row) => row.artifact.text === runs[0].artifact.text));
assert(runs.every((row) => row.artifact.semanticHash === runs[0].artifact.semanticHash));

const imported = reimportEnrichedStagedJsonExport(runs[0].artifact.text);
assert.equal(imported.commonInput.semanticHash, runs[0].commonInput.semanticHash);
assert.equal(imported.export.semanticHash, runs[0].artifact.exportSemanticHash);

const currentBindings = bindings(runs[0].commonInput);
assert.equal(assessCommonInputStaleness(runs[0].commonInput, currentBindings).stale, false);
const changedBindings = {
  ...currentBindings,
  sourceModelSemanticHash: semanticHash({ sourceModelChanged: true }),
};
const stale = assessCommonInputStaleness(runs[0].commonInput, changedBindings);
assert.equal(stale.stale, true);
assert(stale.changes.some((row) => row.path === 'sourceModelSemanticHash'));

const sourceGuardFiles = await Promise.all([
  read('../src/core/non-fea-enrichment/index.js'),
  read('../src/core/non-fea-common-checker/index.js'),
  read('../src/core/non-fea-method-consumption/index.js'),
  read('../src/workspace/non-fea-common-input-runtime.js'),
  read('../src/workspace/non-fea-method-basis-view.js'),
  read('../src/workspace/non-fea-seal-export-view.js'),
]);
const productionImports = sourceGuardFiles
  .flatMap((source) => source.split(/\r?\n/u).filter((line) => line.startsWith('import ')))
  .join('\n');
assert.doesNotMatch(productionImports, /(linear-fea|lafea|lfea|shell|continuum|solver)/iu);

const browserSpec = await read('../e2e/non-fea-input-check-load-calc.spec.js');
assert.doesNotMatch(browserSpec, /test\.skip|test\.fixme|\.only\(/u);
assert.doesNotMatch(browserSpec, /\.click\(\{\s*force:\s*true/u);
assert.match(browserSpec, /non-fea-method-basis/u);
assert.match(browserSpec, /non-fea-seal-export/u);

console.log(JSON.stringify({
  phase: 6,
  fixture: 'GENERATED-1885-COMPONENT-163-SUPPORT',
  componentCount: COMPONENT_COUNT,
  supportCount: SUPPORT_COUNT,
  iterations: ITERATIONS,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  averageMs: Number((elapsedMs / ITERATIONS).toFixed(3)),
  heapDeltaBytes: endHeap - startHeap,
  requestSemanticHash: runs[0].request.semanticHash,
  reportSemanticHash: runs[0].report.semanticHash,
  commonInputSemanticHash: runs[0].commonInput.semanticHash,
  exportSemanticHash: runs[0].artifact.exportSemanticHash,
  exportByteLength: runs[0].artifact.byteLength,
  sourceImmutable: true,
  topologyMembershipPreserved: true,
  methodRowsExecuted: 2,
  zeroStepPassProhibited: true,
  staleLineageDetected: true,
  deterministicAcrossRuns: true,
  exportReimportEquivalent: true,
  feaImports: 0,
  browserSkipMarkers: 0,
}, null, 2));

function runQualification(index) {
  const sidecar = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: sourceModel.semanticHash,
    records: [],
  });
  const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
  assert.equal(ledger.status, 'READY');
  const projection = createNonFeaEnrichedProjection({ sourceModel, resolutionLedger: ledger });
  assert.equal(projection.enrichedModel.components.length, COMPONENT_COUNT);
  assert.equal(projection.enrichedModel.supports.length, SUPPORT_COUNT);
  const projectDataProfile = projectProfile();
  const request = createPreFeaPipingCheckRequest({
    requestId: 'PRE-FEA:GENERATED-LARGE-MODEL',
    sourceDatasetSha256: 'c'.repeat(64),
    requestedMethods: index % 2
      ? ['ENRICHED_STAGED_JSON_EXPORT', 'WEIGHT_AND_GRAVITY']
      : ['WEIGHT_AND_GRAVITY', 'ENRICHED_STAGED_JSON_EXPORT'],
    requestedLoadCases: index % 2 ? ['HYD', 'OPE', 'EMPTY'] : ['EMPTY', 'OPE', 'HYD'],
    sourceModel,
    enrichmentSidecar: sidecar,
    resolutionLedger: ledger,
    enrichedProjection: projection,
    projectDataProfile,
    projectDataOrigin: { kind: 'GENERATED_QUALIFICATION', source: 'non-fea-release-qualification-check' },
    authorityContracts: {},
    qualificationProfile: {
      profileId: 'GENERATED-LARGE-MODEL-WEIGHT',
      version: 1,
      methods: ['WEIGHT_AND_GRAVITY'],
      qualification: 'QUALIFIED',
      locked: true,
      basis: { componentCount: COMPONENT_COUNT, supportCount: SUPPORT_COUNT },
    },
    configuredDefaultUsageLedger: usageLedger(projectDataProfile.revision),
  });
  const report = runPreFeaPipingCheck(request);
  const commonInput = sealCommonEnrichedPipingInput({
    request,
    report,
    confirmation: {
      confirmationId: 'GENERATED-LARGE-MODEL-SEAL',
      confirmedAt: '2026-08-06T00:00:00.000Z',
      confirmedBy: 'AUTOMATED-QUALIFICATION',
      acceptPartial: false,
      acknowledgedBlockedMethods: [],
      statement: 'Generated large-model deterministic qualification reviewed by executable contract checks.',
    },
  });
  const artifact = createEnrichedStagedJsonExport(commonInput);
  return { request, report, commonInput, artifact };
}

function buildGeneratedLargeModel() {
  const seed = buildStraightFixture({ lengthsM: [1] }).sharedModel;
  const componentTemplate = seed.components[0];
  const supportTemplate = seed.supports[0];
  const components = Array.from({ length: COMPONENT_COUNT }, (_, index) => {
    const key = `PIPE-${String(index + 1).padStart(4, '0')}`;
    const start = point(index, 0, 0);
    const end = point(index + 1, 0, 0);
    return {
      ...structuredClone(componentTemplate),
      componentKey: key,
      sourceEntityId: key,
      name: key,
      identity: { lineId: 'LINE-1885', branchId: '', systemId: 'SYS-1885', zoneId: '' },
      geometry: {
        ...structuredClone(componentTemplate.geometry),
        start,
        end,
        center: point(index + 0.5, 0, 0),
        points: [start, end],
        branchPoints: [],
        boreMm: 102.26,
        ports: [port(key, 'start', start), port(key, 'end', end)],
        sources: {
          start: `${key}.start`, end: `${key}.end`, center: `${key}.center`, branches: [],
        },
      },
      engineeringProperties: {
        unitPipeWeightKgPerM: evidenceValue(10, 'kg/m', `${key}.unitPipeWeight`),
        fluidWeightOpeKgPerM: evidenceValue(2, 'kg/m', `${key}.opeFluidWeight`),
        fluidWeightHydKgPerM: evidenceValue(3, 'kg/m', `${key}.hydFluidWeight`),
        insulationThicknessMm: evidenceValue(0, 'mm', `${key}.insulationThickness`),
        outerDiameterMm: evidenceValue(114.3, 'mm', `${key}.outerDiameter`),
        wallThicknessMm: evidenceValue(6.02, 'mm', `${key}.wallThickness`),
        flexuralRigidityNm2: evidenceValue(2500000, 'N*m2', `${key}.flexuralRigidity`),
      },
      sourceReferences: sourceReferences(key),
      diagnostics: [],
    };
  });
  const supports = Array.from({ length: SUPPORT_COUNT }, (_, index) => {
    const componentIndex = Math.round(index * (COMPONENT_COUNT - 1) / (SUPPORT_COUNT - 1));
    const component = components[componentIndex];
    const key = `SUP-${String(index + 1).padStart(3, '0')}`;
    const position = component.geometry.start;
    return {
      ...structuredClone(supportTemplate),
      supportKey: key,
      sourceEntityId: key,
      name: key,
      identity: { lineId: 'LINE-1885', branchId: '', systemId: 'SYS-1885', zoneId: '' },
      position,
      supportEvidence: {
        supportTypes: [evidenceValue('ANCHOR', '1', `${key}.supportType`)],
        verticalCapabilities: [evidenceValue('RESTRAINED', '1', `${key}.verticalCapability`)],
        attachedPortReferences: [evidenceValue(`${component.componentKey}:port:start`, '1', `${key}.attachedPort`)],
      },
      sourceReferences: sourceReferences(key),
      diagnostics: [],
    };
  });
  return createSharedPipingModel({
    project: { datasetId: 'GENERATED-1885S', name: 'Generated 1885 component regression', sourceName: 'non-fea-release-qualification-check' },
    units: seed.units,
    sourceSnapshotRef: seed.sourceSnapshotRef,
    components,
    supports,
    sourceReferences: { nodes: [] },
    diagnostics: [],
  });
}

function projectProfile() {
  return {
    schema: 'project-data-profile/v1',
    projectId: 'GENERATED-1885S',
    revision: 6,
    updatedAt: '2026-08-06T00:00:00.000Z',
    loadCalculation: {
      gravityMPerS2: approved(9.80665),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD']),
    },
  };
}
function usageLedger(revision) {
  const base = {
    schema: 'non-fea-configured-default-usage-ledger/v1',
    projectDataRevision: revision,
    configuredDefaultPolicyHash: null,
    rows: [],
  };
  return { ...base, semanticHash: semanticHash(base) };
}
function bindings(value) {
  return {
    sourceDatasetSha256: value.sourceDatasetSha256,
    sourceModelSemanticHash: value.sourceModelSemanticHash,
    enrichmentSidecarSemanticHash: value.enrichmentSidecarSemanticHash,
    resolutionLedgerSemanticHash: value.resolutionLedgerSemanticHash,
    projectDataProfileSemanticHash: value.projectDataProfileSemanticHash,
    configuredDefaultUsageLedgerSemanticHash: value.configuredDefaultUsageLedgerSemanticHash,
    qualificationProfileSemanticHash: value.qualificationProfileSemanticHash,
    authorityContractSemanticHashes: Object.fromEntries(Object.entries(value.authorityContracts).map(([key, row]) => [key, row?.semanticHash || null])),
  };
}
function approved(value) { return { value, evidence: { source: '[GENERATED] executable qualification' }, approved: true }; }
function point(x, y, z) { return { x, y, z, unit: 'm' }; }
function port(componentKey, role, position) {
  return { portKey: `${componentKey}:port:${role}`, role, position, sourceReference: { sourcePath: `${componentKey}.${role}` } };
}
function evidenceValue(value, unit, sourcePath) {
  return { value, unit, sourceKind: 'EXPLICIT_SOURCE', sourcePath, sourceRoot: 'GENERATED-QUALIFICATION' };
}
function sourceReferences(key) {
  return { sourceNodeKey: key, sourceEntityId: key, jsonPointer: `/generated/${key}`, sourcePath: `/generated/${key}` };
}
async function read(relativePath) {
  const { readFile } = await import('node:fs/promises');
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}
