import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  EMPIRICAL_LOAD_COG_METHOD,
  EMPIRICAL_LOAD_METHOD,
  SUPPORT_LOAD_DISTRIBUTION_COG_SCHEMA,
  SUPPORT_LOAD_DISTRIBUTION_SCHEMA,
  calculateSupportLoadDistribution,
  calculateSupportLoadDistributionWithComponentCog,
} from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
});

const onRouteInput = fixture({
  cog: componentCog({ x: 250, y: 0, z: 0 }, 'mm', 'fixture.onRoute250'),
});
const before = semanticHash(onRouteInput);
const v2 = calculateSupportLoadDistribution(onRouteInput);
const v3 = calculateSupportLoadDistributionWithComponentCog(onRouteInput);
const v3Repeated = calculateSupportLoadDistributionWithComponentCog(onRouteInput);
assert.deepEqual(v3Repeated, v3);
assert.equal(semanticHash(onRouteInput), before, 'CoG-aware calculation mutated inputs');

assert.equal(v2.schema, SUPPORT_LOAD_DISTRIBUTION_SCHEMA);
assert.equal(v2.method, EMPIRICAL_LOAD_METHOD);
assert.equal(v2.status, 'CALCULATED');
assert.equal(v3.schema, SUPPORT_LOAD_DISTRIBUTION_COG_SCHEMA);
assert.equal(v3.method, EMPIRICAL_LOAD_COG_METHOD);
assert.equal(v3.baseMethod, EMPIRICAL_LOAD_METHOD);
assert.equal(
  v3.status,
  'CALCULATED',
  `on-route CoG calculation blocked:\n${JSON.stringify({
    componentLoadAuthority: v3.componentLoadAuthority,
    loadCases: v3.loadCases.map((row) => ({
      loadCaseId: row.loadCaseId,
      status: row.status,
      excludedInputs: row.excludedInputs,
      blockers: row.blockers,
      equilibrium: row.equilibrium,
      completenessAudit: row.completenessAudit,
      contributionLedger: row.contributionLedger,
    })),
  }, null, 2)}`,
);
assert.equal(v3.componentLoadAuthority.status, 'READY_FOR_INTEGRATION_DESIGN');
assert.equal(v3.componentLoadAuthority.summary.onRouteCogCount, 1);

const pipeMassKg = Math.PI * ((100 ** 2) - (90 ** 2)) / 4e6 * 1 * 7850;
const pipeForceN = pipeMassKg * 9.81;
const componentForceN = 10 * 9.81;
const expectedV2 = [
  pipeForceN / 2 + componentForceN / 2,
  pipeForceN / 2 + componentForceN / 2,
];
const expectedV3 = [
  pipeForceN / 2 + componentForceN * 0.75,
  pipeForceN / 2 + componentForceN * 0.25,
];
assertReactions(v2, expectedV2);
assertReactions(v3, expectedV3);
close(v3.loadCases[0].equilibrium.forceResidualN, 0);
close(v3.loadCases[0].equilibrium.momentResidualNmm, 0);
const valveContribution = v3.loadCases[0].contributionLedger
  .find((row) => row.entityId === 'VALVE-1');
assert.equal(valveContribution.chainageMm, 250);
assert.equal(valveContribution.currentMethodPointChainageMm, 500);
assert.equal(
  valveContribution.formula.applicationPointAuthority.classification,
  'ON_ROUTE_CHAINAGE_CANDIDATE',
);
assert.equal(
  valveContribution.formula.applicationPointAuthority.auditSemanticHash,
  v3.componentLoadAuthority.semanticHash,
);

const fallbackInput = fixture({ cog: null });
const fallbackV2 = calculateSupportLoadDistribution(fallbackInput);
const fallbackV3 = calculateSupportLoadDistributionWithComponentCog(fallbackInput);
assert.equal(fallbackV3.status, 'CALCULATED');
assert.deepEqual(reactions(fallbackV3), reactions(fallbackV2));
assert.equal(fallbackV3.componentLoadAuthority.summary.midpointFallbackCount, 1);
const fallbackContribution = fallbackV3.loadCases[0].contributionLedger
  .find((row) => row.entityId === 'VALVE-1');
assert.equal(fallbackContribution.chainageMm, 500);
assert.equal(
  fallbackContribution.formula.applicationPointAuthority.classification,
  'MIDPOINT_FALLBACK_CANDIDATE',
);

const offRouteInput = fixture({
  cog: componentCog({ x: 250, y: 25, z: 0 }, 'mm', 'fixture.offRoute25'),
});
const offRouteV2 = calculateSupportLoadDistribution(offRouteInput);
const offRouteV3 = calculateSupportLoadDistributionWithComponentCog(offRouteInput);
assert.equal(offRouteV2.status, 'CALCULATED', 'V2 behavior drifted because dormant CoG evidence exists');
assertBlocked(offRouteV3, 'EMPIRICAL_COMPONENT_COG_OFF_ROUTE');
assert.equal(offRouteV3.componentLoadAuthority.status, 'BLOCKED');
assert.equal(offRouteV3.componentLoadAuthority.summary.offRouteCogCount, 1);

const momentInput = fixture({
  cog: componentCog({ x: 250, y: 0, z: 0 }, 'mm', 'fixture.momentCog'),
  explicitMomentNm: 25,
  momentAxis: 'LOCAL_Z',
});
const momentV2 = calculateSupportLoadDistribution(momentInput);
const momentV3 = calculateSupportLoadDistributionWithComponentCog(momentInput);
assert.equal(momentV2.status, 'CALCULATED', 'V2 behavior drifted because dormant moment evidence exists');
assertBlocked(momentV3, 'EMPIRICAL_COMPONENT_EXPLICIT_MOMENT_UNSUPPORTED');
assert.equal(momentV3.componentLoadAuthority.summary.explicitPositiveMomentCount, 1);

const outsideInput = fixture({
  cog: componentCog({ x: -100, y: 0, z: 0 }, 'mm', 'fixture.outsideSpan'),
});
const outsideV3 = calculateSupportLoadDistributionWithComponentCog(outsideInput);
assertBlocked(outsideV3, 'EMPIRICAL_COMPONENT_COG_OFF_ROUTE');

const v2Repeat = calculateSupportLoadDistribution(onRouteInput);
assert.deepEqual(v2Repeat, v2);
assert.equal(v2.loadCases[0].contributionLedger.some((row) => (
  Object.prototype.hasOwnProperty.call(row, 'currentMethodPointChainageMm')
)), false, 'V2 ledger gained CoG-only fields');

console.log(JSON.stringify({
  status: 'PASS',
  v2Schema: v2.schema,
  v2Method: v2.method,
  v2SemanticHash: semanticHash(v2),
  v3Schema: v3.schema,
  v3Method: v3.method,
  v3SemanticHash: semanticHash(v3),
  componentLoadAuthoritySemanticHash: v3.componentLoadAuthority.semanticHash,
  currentMethodReactionsN: reactions(v2),
  cogAwareReactionsN: reactions(v3),
  cogChainageMm: valveContribution.chainageMm,
  forceResidualN: v3.loadCases[0].equilibrium.forceResidualN,
  momentResidualNmm: v3.loadCases[0].equilibrium.momentResidualNmm,
  offRouteStatus: offRouteV3.status,
  explicitMomentStatus: momentV3.status,
  numericalV2BehaviorChanged: false,
  ordinaryProductionCutover: false,
}, null, 2));

function fixture({ cog, explicitMomentNm = null, momentAxis = null }) {
  const profile = makeProfile();
  const sharedModel = sealSharedModel([
    sharedComponent('VALVE-1', cog, explicitMomentNm, momentAxis),
  ]);
  return {
    dataset: {
      schema: 'analysis-workspace-dataset/v1',
      datasetId: 'EMP-PROD-03B-DATASET',
      version: 1,
      sourceSha256: HASHES.dataset,
      sharedModel,
      entities: [
        {
          entityId: 'PIPE-1',
          entityType: 'PIPE',
          category: 'pipe',
          lineKey: 'L-1',
          sourceEntityId: 'SOURCE-PIPE-1',
          properties: {},
        },
        {
          entityId: 'VALVE-1',
          entityType: 'VALVE',
          category: 'component',
          lineKey: 'L-1',
          sourceEntityId: 'SOURCE-VALVE-1',
          properties: { attributes: { CATALOG_KEY: 'CV-1' } },
        },
      ],
    },
    profile,
    supportSiteModel: {
      schema: 'support-site-model/v1',
      sites: [support('S-0', 0), support('S-1', 1000)],
    },
    routePartitionModel: {
      schema: 'route-partition-model/v1',
      routes: [{
        routeId: 'ROUTE-1',
        status: 'READY',
        blockers: [],
        physicalEdgeIds: ['PIPE-1', 'VALVE-1'],
        entityChainages: [
          chainage('PIPE-1', 0, 1000, 500),
          chainage('VALVE-1', 500, 500, 500),
        ],
      }],
      edges: [
        {
          entityId: 'PIPE-1',
          entityType: 'PIPE',
          startMm: { x: 0, y: 0, z: 0 },
          endMm: { x: 1000, y: 0, z: 0 },
          lengthMm: 1000,
          pointComponent: false,
          topologyCarrier: false,
        },
        {
          entityId: 'VALVE-1',
          entityType: 'VALVE',
          startMm: { x: 500, y: 0, z: 0 },
          endMm: { x: 500, y: 0, z: 0 },
          lengthMm: 0,
          pointComponent: true,
          topologyCarrier: false,
        },
      ],
    },
    masterData: {
      lineList: { sourceHash: HASHES.lineList },
      pipingClass: { sourceHash: HASHES.pipingClass },
      weight: { sourceHash: HASHES.componentWeight },
    },
  };
}

function makeProfile() {
  const empty = createEmptyProjectDataProfile();
  const approved = (value, source) => createEvidenceValue(value, { source }, true);
  const source = (value, sourceKey, sourceHash) => createEvidenceValue(
    value,
    { source: 'EMP_PROD_03B_FIXTURE', sourceKey, sourceHash },
    true,
  );
  return {
    ...empty,
    projectId: 'EMP-PROD-03B-PROJECT',
    revision: 1,
    updatedAt: '2026-08-04T20:00:00.000Z',
    sourcesAndUnits: {
      ...empty.sourcesAndUnits,
      lineListSource: source({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: source({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: source({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    },
    topology: {
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_03B_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_03B_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_03B_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_03B_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_03B_TOPOLOGY'),
    },
    loadCalculation: {
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_03B_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_03B_LOAD_POLICY'),
      materialDensitiesKgPerM3: approved({ 'MAT-1': 7850 }, 'EMP_PROD_03B_MATERIAL'),
      pipeSectionProperties: approved({
        'L-1': {
          outsideDiameterMm: 100,
          wallThicknessMm: 5,
          materialCode: 'MAT-1',
          insulationCode: null,
          insulationThicknessMm: 0,
        },
      }, 'EMP_PROD_03B_SECTION'),
      operatingFluidDensitiesKgPerM3: approved({ 'L-1': 800 }, 'EMP_PROD_03B_FLUID'),
      hydroFluidDensitiesKgPerM3: approved({ 'L-1': 1000 }, 'EMP_PROD_03B_FLUID'),
      insulationDensitiesKgPerM3: approved({}, 'EMP_PROD_03B_INSULATION'),
      componentWeightsKg: approved({ 'CV-1': 10 }, 'EMP_PROD_03B_COMPONENT'),
      equilibriumTolerances: approved({ forceN: 1e-8, momentNmm: 1e-5 }, 'EMP_PROD_03B_EQUILIBRIUM'),
      activeLoadCases: approved(['EMPTY'], 'EMP_PROD_03B_CASES'),
    },
  };
}

function support(siteId, x) {
  return {
    siteId,
    tags: [siteId],
    positionMm: { x, y: 0, z: 0 },
    assemblies: [{ members: [{ sourceType: 'REST' }] }],
  };
}

function chainage(entityId, startMm, endMm, pointMm) {
  return {
    entityId,
    startMm,
    endMm,
    pointMm,
    sourceStartChainageMm: startMm,
    sourceEndChainageMm: endMm,
  };
}

function sharedComponent(componentKey, cog, explicitMomentNm, momentAxis) {
  const loadEvidence = {};
  if (cog) loadEvidence.componentCog = cog;
  if (explicitMomentNm !== null) {
    loadEvidence.explicitPointMomentNm = evidence(
      explicitMomentNm,
      'N*m',
      'fixture.explicitMoment',
    );
  }
  if (momentAxis !== null) {
    loadEvidence.momentAxis = evidence(momentAxis, '', 'fixture.momentAxis');
  }
  return {
    componentKey,
    sourceEntityId: `SOURCE-${componentKey}`,
    type: 'VALVE',
    loadEvidence,
  };
}

function componentCog(value, unit, sourcePath) {
  return {
    value,
    unit,
    sourceKind: 'COMPOSITE_EXPLICIT_SOURCE_EVIDENCE',
    sourcePath,
    axes: {
      x: evidence(value.x, unit, `${sourcePath}.x`),
      y: evidence(value.y, unit, `${sourcePath}.y`),
      z: evidence(value.z, unit, `${sourcePath}.z`),
    },
  };
}

function evidence(value, unit, sourcePath) {
  return {
    value,
    unit,
    sourcePath,
    sourceKind: 'EXPLICIT_SOURCE_EVIDENCE',
  };
}

function sealSharedModel(components) {
  const base = {
    schema: 'shared-piping-model/v1',
    units: { length: 'mm', force: 'N', mass: 'kg' },
    components,
    supports: [],
  };
  return { ...base, semanticHash: semanticHash(base) };
}

function assertBlocked(distribution, code) {
  assert.equal(distribution.status, 'BLOCKED');
  const loadCase = distribution.loadCases[0];
  assert.equal(loadCase.status, 'BLOCKED');
  assert.equal(loadCase.supportResults.every((row) => row.verticalForceN === null), true);
  assert.equal(loadCase.excludedInputs.some((row) => row.code === code), true);
}

function reactions(distribution) {
  return distribution.loadCases[0].supportResults.map((row) => row.verticalForceN);
}

function assertReactions(distribution, expected) {
  reactions(distribution).forEach((value, index) => close(value, expected[index]));
}

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, observed ${actual}`,
  );
}
