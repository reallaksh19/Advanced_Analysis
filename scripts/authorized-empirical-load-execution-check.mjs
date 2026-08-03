import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
  projectDataValue,
} from '../src/workspace/project-data/project-data-contract.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  buildAuthorizedEmpiricalLoadProfile,
  calculateAuthorizedEmpiricalLoadExecution,
  requireAuthorizedEmpiricalLoadExecution,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution.js';
import { EngineeringSupportLoadStore } from '../src/workspace/engineering-loads/engineering-support-load-store.js';

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
});
const SH = Object.freeze({
  baseline: 'fnv1a64:1111111111111111',
  readinessEvaluation: 'fnv1a64:2222222222222222',
  readiness: 'fnv1a64:3333333333333333',
  handoff: 'fnv1a64:4444444444444444',
  payload: 'fnv1a64:5555555555555555',
  configuration: 'fnv1a64:6666666666666666',
  lineRecord: 'fnv1a64:7777777777777777',
  componentRecord: 'fnv1a64:8888888888888888',
});

const authorizedInput = makeAuthorizedInput();
const profile = makeProfile();
const dataset = makeDataset();
const supportSiteModel = makeSupportSiteModel();
const routePartitionModel = makeRoutePartitionModel();
const masterData = {
  lineList: { sourceHash: HASHES.lineList },
  pipingClass: { sourceHash: HASHES.pipingClass },
  weight: { sourceHash: HASHES.componentWeight },
};
const request = {
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  executionId: 'empirical-execution-001',
  executedAt: '2026-08-03T00:54:00.000Z',
  authorizedInput,
  dataset,
  profile,
  supportSiteModel,
  routePartitionModel,
  masterData,
};

const profileHashBefore = semanticHash(profile);
const ephemeral = buildAuthorizedEmpiricalLoadProfile(profile, authorizedInput);
assert.equal(semanticHash(profile), profileHashBefore, 'base Project Data profile mutated');
assert.notEqual(ephemeral, profile);
assert.equal(projectDataValue(ephemeral, 'loadCalculation.pipeSectionProperties')['L-1'].outsideDiameterMm, 100);
assert.equal(projectDataValue(ephemeral, 'loadCalculation.componentWeightsKg')['CV-1'], 10);
assert.equal(projectDataValue(profile, 'loadCalculation.pipeSectionProperties').LEGACY.outsideDiameterMm, 10);
assert.equal(ephemeral.loadCalculation.pipeSectionProperties.evidence.source, 'AUTHORIZED_EMPIRICAL_LOAD_INPUT');
assert.equal(ephemeral.loadCalculation.pipeSectionProperties.evidence.sourceSemanticHash, authorizedInput.semanticHash);
assert.equal(Object.isFrozen(ephemeral), true);
assert.equal(Object.isFrozen(ephemeral.loadCalculation.pipeSectionProperties), true);

const execution = calculateAuthorizedEmpiricalLoadExecution(request);
const repeated = calculateAuthorizedEmpiricalLoadExecution(request);
assert.deepEqual(repeated, execution);
assert.equal(execution.status, 'CALCULATED');
assert.equal(execution.summary.loadCaseCount, 1);
assert.equal(execution.summary.calculatedCaseCount, 1);
assert.equal(execution.summary.blockedCaseCount, 0);
assert.equal(execution.summary.contributionCount, 2);
assert.equal(execution.summary.excludedInputCount, 0);
assert.equal(execution.distribution.status, 'CALCULATED');
assert.equal(execution.distribution.loadCases[0].status, 'CALCULATED');
assert.equal(execution.distribution.loadCases[0].contributionLedger.length, 2);
assert.equal(execution.distribution.loadCases[0].equilibrium.passed, true);
assert.equal(execution.authorizedInputSemanticHash, authorizedInput.semanticHash);
assert.equal(execution.ephemeralProfileSemanticHash, semanticHash(ephemeral));
assert.equal(execution.distributionSemanticHash, semanticHash(execution.distribution));
assert.equal(Object.isFrozen(execution), true);
assert.equal(Object.isFrozen(execution.distribution), true);

const pipeContribution = execution.distribution.loadCases[0].contributionLedger.find((row) => row.entityId === 'pipe-1');
const componentContribution = execution.distribution.loadCases[0].contributionLedger.find((row) => row.entityId === 'valve-1');
assert.ok(pipeContribution);
assert.ok(componentContribution);
assert.equal(pipeContribution.formula.projectDataSources[0].evidence.source, 'AUTHORIZED_EMPIRICAL_LOAD_INPUT');
assert.equal(componentContribution.formula.projectDataSources[0].evidence.source, 'AUTHORIZED_EMPIRICAL_LOAD_INPUT');

const store = new EngineeringSupportLoadStore();
const storedExecution = store.calculateAuthorized(request);
assert.equal(store.getAuthorizedExecution().semanticHash, storedExecution.semanticHash);
assert.equal(store.getDistribution().status, 'CALCULATED');
store.markStale('DATASET_EDITED', 8);
assert.equal(store.getAuthorizedExecution(), null);
assert.equal(store.getDistribution().freshness.status, 'STALE');
store.clear();
assert.equal(store.getDistribution(), null);

assert.throws(
  () => buildAuthorizedEmpiricalLoadProfile({ ...profile, projectId: 'other-project' }, authorizedInput),
  (error) => error.code === 'EMPIRICAL_EXECUTION_PROJECT_MISMATCH',
);

const blockedProfile = {
  ...profile,
  topology: {
    ...profile.topology,
    supportTypeCapabilities: createEvidenceValue(null, null, false),
  },
};
assert.throws(
  () => calculateAuthorizedEmpiricalLoadExecution({ ...request, profile: blockedProfile }),
  (error) => error.code === 'EMPIRICAL_EXECUTION_PROFILE_BLOCKED'
    && error.details.errors.some((row) => row.path === 'topology.supportTypeCapabilities'),
);

const tampered = {
  ...execution,
  distribution: {
    ...execution.distribution,
    status: 'BLOCKED',
  },
};
assert.throws(
  () => requireAuthorizedEmpiricalLoadExecution(tampered),
  (error) => ['EMPIRICAL_EXECUTION_STATUS_MISMATCH', 'EMPIRICAL_EXECUTION_HASH_MISMATCH'].includes(error.code),
);

console.log(JSON.stringify({
  status: 'PASS',
  schema: execution.schema,
  semanticHash: execution.semanticHash,
  authorizedInputSemanticHash: execution.authorizedInputSemanticHash,
  ephemeralProfileSemanticHash: execution.ephemeralProfileSemanticHash,
  distributionSemanticHash: execution.distributionSemanticHash,
  summary: execution.summary,
}, null, 2));

function makeAuthorizedInput() {
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'empirical-intake-001',
    projectId: 'project-001',
    baselineId: 'baseline-001',
    baselineRevision: 1,
    baselineSemanticHash: SH.baseline,
    readinessEvaluationSemanticHash: SH.readinessEvaluation,
    readinessSemanticHash: SH.readiness,
    handoffSemanticHash: SH.handoff,
    projectionPayloadSemanticHash: SH.payload,
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: SH.configuration,
    createdAt: '2026-08-03T00:53:00.000Z',
    lineBindings: [{
      targetId: 'line:001',
      sourceRecordId: 'src-line-001',
      lineKey: 'L-1',
      projectionRecordSemanticHash: SH.lineRecord,
    }],
    componentBindings: [{
      targetId: 'component:001',
      sourceRecordId: 'src-valve-001',
      lineKey: 'L-1',
      catalogKey: 'CV-1',
      projectionRecordSemanticHash: SH.componentRecord,
    }],
    loadCalculationOverlay: {
      pipeSectionProperties: {
        'L-1': {
          outsideDiameterMm: 100,
          wallThicknessMm: 5,
          materialCode: 'MAT-1',
          insulationCode: 'INS-1',
          insulationThicknessMm: 10,
        },
      },
      materialDensitiesKgPerM3: { 'MAT-1': 7850 },
      operatingFluidDensitiesKgPerM3: { 'L-1': 800 },
      hydroFluidDensitiesKgPerM3: { 'L-1': 1000 },
      insulationDensitiesKgPerM3: { 'INS-1': 120 },
      componentWeightsKg: { 'CV-1': 10 },
    },
    overlaySemanticHash: '',
    summary: {
      lineCount: 1,
      componentCount: 1,
      materialCodeCount: 1,
      insulationCodeCount: 1,
      componentCatalogCount: 1,
    },
    semanticHash: 'fnv1a64:0000000000000000',
  };
  draft.overlaySemanticHash = semanticHash(draft.loadCalculationOverlay);
  draft.semanticHash = computeAuthorizedEmpiricalLoadInputSemanticHash(draft);
  return draft;
}

function makeProfile() {
  const empty = createEmptyProjectDataProfile();
  const source = (value, sourceKey, sourceHash) => createEvidenceValue(
    value,
    { source: 'FIXTURE_CONTROLLED_SOURCE', sourceKey, sourceHash },
    true,
  );
  const approved = (value, label) => createEvidenceValue(value, { source: label }, true);
  return {
    ...empty,
    projectId: 'project-001',
    revision: 4,
    updatedAt: '2026-08-03T00:52:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: source({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: source({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: source({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'FIXTURE_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'FIXTURE_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'FIXTURE_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'FIXTURE_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'FIXTURE_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'FIXTURE_LOAD_POLICY'),
      loadFactor: approved(1, 'FIXTURE_LOAD_POLICY'),
      materialDensitiesKgPerM3: approved({ LEGACY: 1 }, 'LEGACY_PROJECT_DATA'),
      pipeSectionProperties: approved({ LEGACY: { outsideDiameterMm: 10, wallThicknessMm: 1, materialCode: 'LEGACY', insulationCode: 'LEGACY-I', insulationThicknessMm: 1 } }, 'LEGACY_PROJECT_DATA'),
      operatingFluidDensitiesKgPerM3: approved({ LEGACY: 1 }, 'LEGACY_PROJECT_DATA'),
      hydroFluidDensitiesKgPerM3: approved({ LEGACY: 1 }, 'LEGACY_PROJECT_DATA'),
      insulationDensitiesKgPerM3: approved({ 'LEGACY-I': 1 }, 'LEGACY_PROJECT_DATA'),
      componentWeightsKg: approved({ LEGACY: 1 }, 'LEGACY_PROJECT_DATA'),
      equilibriumTolerances: approved({ forceN: 1e-8, momentNmm: 1e-5 }, 'FIXTURE_LOAD_POLICY'),
      activeLoadCases: approved(['EMPTY'], 'FIXTURE_LOAD_POLICY'),
    },
  };
}

function makeDataset() {
  return {
    datasetId: 'dataset-001',
    version: 7,
    sourceSha256: HASHES.dataset,
    entities: [
      {
        entityId: 'pipe-1', entityType: 'PIPE', lineKey: 'L-1',
        sourceEntityId: 'src-line-001', jsonPointer: '/items/0', componentReference: 'PIPE-1', properties: {},
      },
      {
        entityId: 'valve-1', entityType: 'VALVE', lineKey: 'L-1',
        sourceEntityId: 'src-valve-001', jsonPointer: '/items/1', componentReference: 'VALVE-1',
        properties: { attributes: { CATALOG_KEY: 'CV-1' } },
      },
    ],
  };
}

function makeSupportSiteModel() {
  const site = (siteId, x) => ({
    siteId,
    tags: [siteId],
    positionMm: { x, y: 0, z: 0 },
    assemblyIds: [`assembly-${siteId}`],
    memberEntityIds: [`support-${siteId}`],
    assemblies: [{ members: [{ sourceType: 'REST' }] }],
  });
  return { schema: 'support-site-model/v1', sites: [site('S-0', 0), site('S-1', 1000)] };
}

function makeRoutePartitionModel() {
  return {
    schema: 'route-partition-model/v1',
    routes: [{
      routeId: 'R-1',
      status: 'READY',
      blockers: [],
      physicalEdgeIds: ['pipe-1', 'valve-1'],
      entityChainages: [
        { entityId: 'pipe-1', startMm: 0, endMm: 1000, pointMm: 500, sourceStartChainageMm: 0, sourceEndChainageMm: 1000 },
        { entityId: 'valve-1', startMm: 500, endMm: 500, pointMm: 500, sourceStartChainageMm: 500, sourceEndChainageMm: 500 },
      ],
    }],
    edges: [
      { entityId: 'pipe-1', entityType: 'PIPE', lengthMm: 1000, pointComponent: false, topologyCarrier: false, startMm: { x: 0, y: 0, z: 0 }, endMm: { x: 1000, y: 0, z: 0 } },
      { entityId: 'valve-1', entityType: 'VALVE', lengthMm: 0, pointComponent: true, topologyCarrier: false, startMm: { x: 500, y: 0, z: 0 }, endMm: { x: 500, y: 0, z: 0 } },
    ],
  };
}
