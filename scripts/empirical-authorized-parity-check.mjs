import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecution,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution.js';
import {
  EMPIRICAL_LOAD_METHOD,
  calculateSupportLoadDistribution,
} from '../src/workspace/engineering-loads/support-load-distribution-v3.js';

const fixture = makeFixture();
const immutableBefore = hashesOf(fixture);
const legacy = calculateSupportLoadDistribution({
  dataset: fixture.dataset,
  profile: fixture.profile,
  supportSiteModel: fixture.supportSiteModel,
  routePartitionModel: fixture.routePartitionModel,
  masterData: fixture.masterData,
});
const authorizedExecution = calculateAuthorizedEmpiricalLoadExecution({
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  executionId: 'EMP01-PARITY-EXECUTION',
  executedAt: '2026-08-04T12:21:00.000Z',
  authorizedInput: fixture.authorizedInput,
  dataset: fixture.dataset,
  profile: fixture.profile,
  supportSiteModel: fixture.supportSiteModel,
  routePartitionModel: fixture.routePartitionModel,
  masterData: fixture.masterData,
});
const repeated = calculateAuthorizedEmpiricalLoadExecution({
  schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  executionId: 'EMP01-PARITY-EXECUTION',
  executedAt: '2026-08-04T12:21:00.000Z',
  authorizedInput: fixture.authorizedInput,
  dataset: fixture.dataset,
  profile: fixture.profile,
  supportSiteModel: fixture.supportSiteModel,
  routePartitionModel: fixture.routePartitionModel,
  masterData: fixture.masterData,
});

assert.equal(legacy.method, EMPIRICAL_LOAD_METHOD);
assert.equal(authorizedExecution.distribution.method, EMPIRICAL_LOAD_METHOD);
assert.deepEqual(repeated, authorizedExecution, 'equal explicit inputs produced a different execution');
assert.equal(legacy.status, 'CALCULATED');
assert.equal(authorizedExecution.status, 'CALCULATED');
assert.deepEqual(numericalProjection(authorizedExecution.distribution), numericalProjection(legacy));
assert.deepEqual(hashesOf(fixture), immutableBefore, 'calculation mutated a governed input');

const cases = numericalProjection(legacy).loadCases;
for (const loadCase of cases) {
  assert.equal(loadCase.status, 'CALCULATED');
  assert.equal(loadCase.equilibrium.status, 'PASSED');
  assert.ok(Math.abs(loadCase.equilibrium.forceResidualN) <= 1e-8);
  assert.ok(Math.abs(loadCase.equilibrium.momentResidualNmm) <= 1e-5);
}

console.log(JSON.stringify({
  status: 'PASS',
  method: legacy.method,
  loadCaseCount: cases.length,
  legacyDistributionSemanticHash: semanticHash(legacy),
  authorizedDistributionSemanticHash: authorizedExecution.distributionSemanticHash,
  authorizedExecutionSemanticHash: authorizedExecution.semanticHash,
  numericalParity: true,
  deterministicRepeat: true,
  nonMutation: true,
  loadCases: cases.map((row) => ({
    loadCaseId: row.loadCaseId,
    status: row.status,
    supportResults: row.supportResults,
    forceResidualN: row.equilibrium.forceResidualN,
    momentResidualNmm: row.equilibrium.momentResidualNmm,
  })),
}, null, 2));

function numericalProjection(distribution) {
  return {
    method: distribution.method,
    datasetId: distribution.datasetId,
    datasetVersion: distribution.datasetVersion,
    sourceAxisBasis: distribution.sourceAxisBasis,
    verticalForceConvention: distribution.verticalForceConvention,
    status: distribution.status,
    loadCases: distribution.loadCases.map((loadCase) => ({
      loadCaseId: loadCase.loadCaseId,
      status: loadCase.status,
      supportResults: loadCase.supportResults.map((row) => ({
        supportSiteId: row.supportSiteId,
        status: row.status,
        verticalForceN: row.verticalForceN,
        qualifiedReactionCandidateN: row.qualifiedReactionCandidateN,
        contributorIds: row.contributorIds,
      })),
      contributionLedger: loadCase.contributionLedger.map((row) => ({
        contributionId: row.contributionId,
        routeId: row.routeId,
        entityId: row.entityId,
        massKg: row.massKg,
        verticalForceN: row.verticalForceN,
        chainageMm: row.chainageMm,
        allocations: row.allocations,
      })),
      excludedInputs: loadCase.excludedInputs,
      blockers: loadCase.blockers,
      equilibrium: loadCase.equilibrium,
      completenessAudit: loadCase.completenessAudit,
    })),
  };
}

function hashesOf(value) {
  return {
    dataset: semanticHash(value.dataset),
    profile: semanticHash(value.profile),
    supportSiteModel: semanticHash(value.supportSiteModel),
    routePartitionModel: semanticHash(value.routePartitionModel),
    masterData: semanticHash(value.masterData),
    authorizedInput: semanticHash(value.authorizedInput),
  };
}

function makeFixture() {
  const hashes = {
    dataset: '1'.repeat(64),
    lineList: '2'.repeat(64),
    pipingClass: '3'.repeat(64),
    componentWeight: '4'.repeat(64),
  };
  const authorizedInput = makeAuthorizedInput();
  const profile = makeProfile(hashes, authorizedInput.loadCalculationOverlay);
  const dataset = {
    datasetId: 'DATASET-EMP01-PARITY',
    version: 7,
    sourceSha256: hashes.dataset,
    entities: [
      {
        entityId: 'pipe-1', entityType: 'PIPE', lineKey: 'L-1',
        sourceEntityId: 'source-line-001', jsonPointer: '/items/0',
        componentReference: 'PIPE-1', properties: {},
      },
      {
        entityId: 'valve-1', entityType: 'VALVE', lineKey: 'L-1',
        sourceEntityId: 'source-component-001', jsonPointer: '/items/1',
        componentReference: 'VALVE-1',
        properties: { attributes: { CATALOG_KEY: 'VALVE-1' } },
      },
    ],
  };
  const site = (siteId, x) => ({
    siteId,
    tags: [siteId],
    positionMm: { x, y: 0, z: 0 },
    assemblyIds: [`assembly-${siteId}`],
    memberEntityIds: [`support-${siteId}`],
    assemblies: [{ members: [{ sourceType: 'REST' }] }],
  });
  const supportSiteModel = {
    schema: 'support-site-model/v1',
    status: 'READY',
    sites: [site('S-0', 0), site('S-1', 1000)],
  };
  const routePartitionModel = {
    schema: 'route-partition-model/v1',
    status: 'READY',
    routes: [{
      routeId: 'R-1', status: 'READY', blockers: [],
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
  const masterData = {
    lineList: { sourceHash: hashes.lineList },
    pipingClass: { sourceHash: hashes.pipingClass },
    weight: { sourceHash: hashes.componentWeight },
  };
  return { authorizedInput, profile, dataset, supportSiteModel, routePartitionModel, masterData };
}

function makeProfile(hashes, overlay) {
  const empty = createEmptyProjectDataProfile();
  const source = (value, sourceKey, sourceHash) => createEvidenceValue(
    value,
    { source: 'EMP01_FIXTURE_SOURCE', sourceKey, sourceHash },
    true,
  );
  const approved = (value, label) => createEvidenceValue(value, { source: label }, true);
  return {
    ...empty,
    projectId: 'PROJECT-EMP01',
    revision: 4,
    updatedAt: '2026-08-04T12:19:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: source({ sha256: hashes.lineList }, 'lineList', hashes.lineList),
      pipingClassSource: source({ sha256: hashes.pipingClass }, 'pipingClass', hashes.pipingClass),
      componentWeightSource: source({ sha256: hashes.componentWeight }, 'componentWeight', hashes.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP01_TOPOLOGY_POLICY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP01_TOPOLOGY_POLICY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP01_TOPOLOGY_POLICY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP01_TOPOLOGY_POLICY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP01_TOPOLOGY_POLICY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP01_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP01_LOAD_POLICY'),
      materialDensitiesKgPerM3: approved(overlay.materialDensitiesKgPerM3, 'EMP01_PARITY_INPUT'),
      pipeSectionProperties: approved(overlay.pipeSectionProperties, 'EMP01_PARITY_INPUT'),
      operatingFluidDensitiesKgPerM3: approved(overlay.operatingFluidDensitiesKgPerM3, 'EMP01_PARITY_INPUT'),
      hydroFluidDensitiesKgPerM3: approved(overlay.hydroFluidDensitiesKgPerM3, 'EMP01_PARITY_INPUT'),
      insulationDensitiesKgPerM3: approved(overlay.insulationDensitiesKgPerM3, 'EMP01_PARITY_INPUT'),
      componentWeightsKg: approved(overlay.componentWeightsKg, 'EMP01_PARITY_INPUT'),
      equilibriumTolerances: approved({ forceN: 1e-8, momentNmm: 1e-5 }, 'EMP01_LOAD_POLICY'),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD'], 'EMP01_LOAD_POLICY'),
    },
  };
}

function makeAuthorizedInput() {
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'INTAKE-EMP01-PARITY',
    projectId: 'PROJECT-EMP01',
    baselineId: 'BASELINE-EMP01-PARITY',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-04T12:18:00.000Z',
    lineBindings: [{
      targetId: 'line:001', sourceRecordId: 'source-line-001', lineKey: 'L-1',
      projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
    }],
    componentBindings: [{
      targetId: 'component:001', sourceRecordId: 'source-component-001', lineKey: 'L-1', catalogKey: 'VALVE-1',
      projectionRecordSemanticHash: 'fnv1a64:8888888888888888',
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
      componentWeightsKg: { 'VALVE-1': 10 },
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
