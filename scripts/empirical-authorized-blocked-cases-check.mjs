import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';
import {
  computeAuthorizedEmpiricalLoadInputSemanticHash,
  requireAuthorizedEmpiricalLoadInput,
} from '../src/workspace/engineering-loads/authorized-empirical-load-input.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalLoadExecution,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution.js';
import {
  calculateSupportLoadDistribution,
} from '../src/workspace/engineering-loads/support-load-distribution-v3.js';

const fixture = makeFixture();
const results = [];

runBlocked('missing-pipe-section', {
  profile: withLoadValue(fixture.profile, 'pipeSectionProperties', {
    OTHER: section(),
  }),
}, 'EMPTY', 'MISSING_PIPE_SECTION');

runBlocked('missing-material-density', {
  profile: withLoadValue(fixture.profile, 'materialDensitiesKgPerM3', { OTHER: 7850 }),
}, 'EMPTY', 'MISSING_MATERIAL_DENSITY');

runBlocked('missing-operating-fluid-density', {
  profile: withLoadValue(fixture.profile, 'operatingFluidDensitiesKgPerM3', { OTHER: 800 }),
}, 'OPE', 'MISSING_FLUID_DENSITY', 'loadCalculation.operatingFluidDensitiesKgPerM3');

runBlocked('missing-hydro-fluid-density', {
  profile: withLoadValue(fixture.profile, 'hydroFluidDensitiesKgPerM3', { OTHER: 1000 }),
}, 'HYD', 'MISSING_FLUID_DENSITY', 'loadCalculation.hydroFluidDensitiesKgPerM3');

runBlocked('missing-insulation-density', {
  profile: withLoadValue(fixture.profile, 'insulationDensitiesKgPerM3', { OTHER: 120 }),
}, 'EMPTY', 'MISSING_INSULATION_DENSITY');

runBlocked('missing-component-mass', {
  profile: withLoadValue(fixture.profile, 'componentWeightsKg', { OTHER: 10 }),
}, 'EMPTY', 'MISSING_COMPONENT_MASS');

runBlocked('invalid-inside-diameter', {
  profile: withLoadValue(fixture.profile, 'pipeSectionProperties', {
    'L-1': section({ wallThicknessMm: 50 }),
  }),
}, 'EMPTY', 'INVALID_PIPE_INSIDE_DIAMETER');

runBlocked('route-fewer-than-two-vertical-supports', {
  supportSiteModel: {
    ...fixture.supportSiteModel,
    sites: fixture.supportSiteModel.sites.slice(0, 1),
  },
}, 'EMPTY', 'ROUTE_REQUIRES_TWO_QUALIFIED_VERTICAL_SUPPORTS');

runBlocked('unbracketed-point-load', {
  routePartitionModel: pointOnlyRoute(1200, true),
}, 'EMPTY', 'UNBRACKETED_ROUTE_LOAD');

runBlocked('invalid-chainage', {
  routePartitionModel: pointOnlyRoute(null, false),
}, 'EMPTY', 'MISSING_ROUTE_CHAINAGE');

runBlocked('failed-equilibrium', {
  routePartitionModel: routeWithPipeAuditPoint(600),
}, 'EMPTY', 'EQUILIBRIUM_CHECK_FAILED');

const nonFinite = structuredClone(fixture.authorizedInput);
nonFinite.loadCalculationOverlay.materialDensitiesKgPerM3['MAT-1'] = Number.POSITIVE_INFINITY;
expectCode(
  () => requireAuthorizedEmpiricalLoadInput(nonFinite),
  'EMPIRICAL_INPUT_NUMBER_INVALID',
);
results.push({ id: 'non-finite-value', status: 'BLOCKED', code: 'EMPIRICAL_INPUT_NUMBER_INVALID' });

expectCode(
  () => calculateAuthorizedEmpiricalLoadExecution({
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
    executionId: 'EMP01-BLOCKED-WRONG-PROJECT',
    executedAt: '2026-08-04T16:16:00.000Z',
    authorizedInput: fixture.authorizedInput,
    dataset: fixture.dataset,
    profile: { ...fixture.profile, projectId: 'OTHER-PROJECT' },
    supportSiteModel: fixture.supportSiteModel,
    routePartitionModel: fixture.routePartitionModel,
    masterData: fixture.masterData,
  }),
  'EMPIRICAL_EXECUTION_PROJECT_MISMATCH',
);
results.push({ id: 'wrong-project', status: 'BLOCKED', code: 'EMPIRICAL_EXECUTION_PROJECT_MISMATCH' });

for (const [id, field, changedHash] of [
  ['stale-baseline', 'baselineSemanticHash', 'fnv1a64:aaaaaaaaaaaaaaaa'],
  ['payload-mismatch', 'projectionPayloadSemanticHash', 'fnv1a64:bbbbbbbbbbbbbbbb'],
  ['handoff-mismatch', 'handoffSemanticHash', 'fnv1a64:cccccccccccccccc'],
]) {
  expectCode(
    () => requireAuthorizedEmpiricalLoadInput({
      ...fixture.authorizedInput,
      [field]: changedHash,
    }),
    'EMPIRICAL_INPUT_HASH_MISMATCH',
  );
  results.push({ id, status: 'BLOCKED', code: 'EMPIRICAL_INPUT_HASH_MISMATCH', field });
}

assert.equal(results.length, 16);
console.log(JSON.stringify({
  status: 'PASS',
  matrix: 'EMP01_FAIL_CLOSED_BLOCKED_CASES',
  caseCount: results.length,
  results,
}, null, 2));

function runBlocked(id, overrides, loadCaseId, expectedCode, expectedPath = null) {
  const input = {
    dataset: overrides.dataset || fixture.dataset,
    profile: overrides.profile || fixture.profile,
    supportSiteModel: overrides.supportSiteModel || fixture.supportSiteModel,
    routePartitionModel: overrides.routePartitionModel || fixture.routePartitionModel,
    masterData: overrides.masterData || fixture.masterData,
  };
  const distribution = calculateSupportLoadDistribution(input);
  const loadCase = distribution.loadCases.find((row) => row.loadCaseId === loadCaseId);
  assert.ok(loadCase, `${id}: load case ${loadCaseId} missing`);
  const evidence = [
    ...(loadCase.excludedInputs || []),
    ...(loadCase.blockers || []),
    ...(loadCase.equilibrium?.blockers || []),
  ];
  const matched = evidence.find((row) => row.code === expectedCode
    && (!expectedPath || row.path === expectedPath || row.projectDataPath === expectedPath));
  assert.ok(matched, `${id}: expected ${expectedCode}${expectedPath ? ` at ${expectedPath}` : ''}; observed ${JSON.stringify(evidence)}`);
  assert.equal(distribution.status, 'BLOCKED', `${id}: distribution reported success`);
  assert.equal(loadCase.status, 'BLOCKED', `${id}: load case reported success`);
  assert.equal(loadCase.supportResults.every((row) => row.verticalForceN === null), true,
    `${id}: a blocked case exposed a production reaction`);
  results.push({ id, loadCaseId, status: loadCase.status, code: expectedCode });
}

function withLoadValue(profile, field, value) {
  return {
    ...profile,
    loadCalculation: {
      ...profile.loadCalculation,
      [field]: approved(value, `EMP01_BLOCKED_${field}`),
    },
  };
}

function pointOnlyRoute(pointMm, includePoint) {
  const valveChainage = {
    entityId: 'valve-1',
    startMm: pointMm ?? 1200,
    endMm: pointMm ?? 1200,
    sourceStartChainageMm: pointMm ?? 1200,
    sourceEndChainageMm: pointMm ?? 1200,
    ...(includePoint ? { pointMm } : {}),
  };
  return {
    ...fixture.routePartitionModel,
    routes: [{
      ...fixture.routePartitionModel.routes[0],
      physicalEdgeIds: ['valve-1'],
      entityChainages: [
        fixture.routePartitionModel.routes[0].entityChainages[0],
        valveChainage,
      ],
    }],
    edges: fixture.routePartitionModel.edges.map((edge) => edge.entityId === 'valve-1'
      ? {
        ...edge,
        startMm: { x: pointMm ?? 1200, y: 0, z: 0 },
        endMm: { x: pointMm ?? 1200, y: 0, z: 0 },
      }
      : edge),
  };
}

function routeWithPipeAuditPoint(pointMm) {
  return {
    ...fixture.routePartitionModel,
    routes: [{
      ...fixture.routePartitionModel.routes[0],
      entityChainages: fixture.routePartitionModel.routes[0].entityChainages.map((row) => (
        row.entityId === 'pipe-1' ? { ...row, pointMm } : row
      )),
    }],
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
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
    datasetId: 'DATASET-EMP01-BLOCKED',
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
  return {
    ...empty,
    projectId: 'PROJECT-EMP01',
    revision: 4,
    updatedAt: '2026-08-04T16:14:00.000Z',
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
      materialDensitiesKgPerM3: approved(overlay.materialDensitiesKgPerM3, 'EMP01_AUTHORIZED_INPUT'),
      pipeSectionProperties: approved(overlay.pipeSectionProperties, 'EMP01_AUTHORIZED_INPUT'),
      operatingFluidDensitiesKgPerM3: approved(overlay.operatingFluidDensitiesKgPerM3, 'EMP01_AUTHORIZED_INPUT'),
      hydroFluidDensitiesKgPerM3: approved(overlay.hydroFluidDensitiesKgPerM3, 'EMP01_AUTHORIZED_INPUT'),
      insulationDensitiesKgPerM3: approved(overlay.insulationDensitiesKgPerM3, 'EMP01_AUTHORIZED_INPUT'),
      componentWeightsKg: approved(overlay.componentWeightsKg, 'EMP01_AUTHORIZED_INPUT'),
      equilibriumTolerances: approved({ forceN: 1e-8, momentNmm: 1e-5 }, 'EMP01_LOAD_POLICY'),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD'], 'EMP01_LOAD_POLICY'),
    },
  };
}

function approved(value, source) {
  return createEvidenceValue(value, { source }, true);
}

function section(overrides = {}) {
  return {
    outsideDiameterMm: 100,
    wallThicknessMm: 5,
    materialCode: 'MAT-1',
    insulationCode: 'INS-1',
    insulationThicknessMm: 10,
    ...overrides,
  };
}

function makeAuthorizedInput() {
  const draft = {
    schema: 'authorized-empirical-load-input/v1',
    intakeId: 'INTAKE-EMP01-BLOCKED',
    projectId: 'PROJECT-EMP01',
    baselineId: 'BASELINE-EMP01-BLOCKED',
    baselineRevision: 1,
    baselineSemanticHash: 'fnv1a64:1111111111111111',
    readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
    readinessSemanticHash: 'fnv1a64:3333333333333333',
    handoffSemanticHash: 'fnv1a64:4444444444444444',
    projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
    adapterVersion: 'empirical-adapter/1.0.0',
    configurationHash: 'fnv1a64:6666666666666666',
    createdAt: '2026-08-04T16:13:00.000Z',
    lineBindings: [{
      targetId: 'line:001', sourceRecordId: 'source-line-001', lineKey: 'L-1',
      projectionRecordSemanticHash: 'fnv1a64:7777777777777777',
    }],
    componentBindings: [{
      targetId: 'component:001', sourceRecordId: 'source-component-001', lineKey: 'L-1', catalogKey: 'VALVE-1',
      projectionRecordSemanticHash: 'fnv1a64:8888888888888888',
    }],
    loadCalculationOverlay: {
      pipeSectionProperties: { 'L-1': section() },
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
