import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  auditEmpiricalComponentLoadAuthority,
} from '../src/workspace/engineering-loads/empirical-component-load-authority.js';
import {
  EMPIRICAL_COMPONENT_MOMENT_DEMAND_SCHEMA,
  EMPIRICAL_COMPONENT_MOMENT_DISPOSITION,
  captureEmpiricalComponentMomentDemand,
  requireEmpiricalComponentMomentDemand,
} from '../src/workspace/engineering-loads/empirical-component-moment-demand.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';

const explicitInput = fixture({
  cogMm: { x: 500, y: 0, z: 0 },
  explicitMomentNm: 25,
  momentAxis: 'LOCAL_Z',
});
const explicitBefore = semanticHash(explicitInput);
const explicitAudit = audit(explicitInput);
const explicitFirst = capture(explicitInput, explicitAudit);
const explicitSecond = capture(explicitInput, explicitAudit);
assert.deepEqual(explicitSecond, explicitFirst);
assert.equal(semanticHash(explicitInput), explicitBefore, 'moment capture mutated source input');
assert.equal(explicitFirst.schema, EMPIRICAL_COMPONENT_MOMENT_DEMAND_SCHEMA);
assert.equal(explicitFirst.status, 'CAPTURED');
assert.equal(explicitFirst.records.length, 1);
assert.equal(explicitFirst.records[0].demandKind, 'SOURCE_EXPLICIT_POINT_MOMENT');
assert.equal(explicitFirst.records[0].magnitudeNm, 25);
assert.equal(explicitFirst.records[0].axis, 'LOCAL_Z');
assert.equal(explicitFirst.records[0].applicationChainageMm, 500);
assert.equal(explicitFirst.records[0].disposition, EMPIRICAL_COMPONENT_MOMENT_DISPOSITION);
assert.equal(explicitFirst.records[0].verticalReactionDistribution, 'NOT_PERFORMED');
assert.equal(explicitFirst.numericalVerticalReactionMethodChanged, false);
assert.equal(explicitFirst.verticalReactionDistributionPerformed, false);
assert.equal(Object.isFrozen(explicitFirst), true);
assert.equal(Object.isFrozen(explicitFirst.records[0]), true);

const eccentricInput = fixture({ cogMm: { x: 500, y: 25, z: 0 } });
const eccentricAudit = audit(eccentricInput);
assert.equal(eccentricAudit.status, 'BLOCKED', 'V3 authority must remain fail-closed off route');
const eccentric = capture(eccentricInput, eccentricAudit);
assert.equal(eccentric.status, 'CAPTURED');
assert.equal(eccentric.records.length, 3);
assert.deepEqual(eccentric.records.map((row) => row.loadCaseId), ['EMPTY', 'HYD', 'OPE']);
for (const record of eccentric.records) {
  assert.equal(record.demandKind, 'COG_ECCENTRIC_GRAVITY_COUPLE');
  assert.equal(record.applicationChainageMm, 500);
  assert.deepEqual(record.offsetMm, { x: 0, y: 25, z: 0 });
  assert.equal(record.componentMassKg, 10);
  assert.ok(Math.abs(record.gravityForceN - 98.0665) < 1e-12);
  assert.ok(Math.abs(record.vectorNm.x + 2.4516625) < 1e-12);
  assert.ok(Math.abs(record.vectorNm.y) < 1e-12);
  assert.ok(Math.abs(record.vectorNm.z) < 1e-12);
  assert.ok(Math.abs(record.magnitudeNm - 2.4516625) < 1e-12);
  assert.equal(record.disposition, EMPIRICAL_COMPONENT_MOMENT_DISPOSITION);
  assert.equal(record.verticalReactionDistribution, 'NOT_PERFORMED');
}

const zeroInput = fixture({ cogMm: { x: 500, y: 0, z: 0 } });
const zero = capture(zeroInput, audit(zeroInput));
assert.equal(zero.status, 'NO_MOMENT_DEMAND');
assert.equal(zero.records.length, 0);
assert.equal(zero.summary.zeroEccentricityCount, 1);

const zeroExplicitInput = fixture({
  cogMm: { x: 500, y: 0, z: 0 },
  explicitMomentNm: 0,
  momentAxis: 'LOCAL_Z',
});
const zeroExplicit = capture(zeroExplicitInput, audit(zeroExplicitInput));
assert.equal(zeroExplicit.status, 'NO_MOMENT_DEMAND');
assert.equal(zeroExplicit.summary.sourceExplicitMomentCount, 0);

const invalidExplicitInput = fixture({
  cogMm: { x: 500, y: 0, z: 0 },
  explicitMomentNm: -1,
  momentAxis: 'LOCAL_Z',
});
const invalidExplicitAudit = audit(invalidExplicitInput);
assert.equal(invalidExplicitAudit.status, 'BLOCKED');
const invalidExplicit = capture(invalidExplicitInput, invalidExplicitAudit);
assert.equal(invalidExplicit.status, 'BLOCKED');
assert.equal(
  hasBlocker(invalidExplicit, 'EMPIRICAL_COMPONENT_EXPLICIT_MOMENT_INVALID'),
  true,
);

const ambiguousInput = ambiguousFixture();
const ambiguous = capture(ambiguousInput, audit(ambiguousInput));
assert.equal(ambiguous.status, 'BLOCKED');
assert.equal(ambiguous.records.length, 0);
assert.equal(hasBlocker(ambiguous, 'EMPIRICAL_MOMENT_ROUTE_PROJECTION_AMBIGUOUS'), true);

const missingMassInput = fixture({
  cogMm: { x: 500, y: 25, z: 0 },
  componentWeightsKg: {},
});
const missingMass = capture(missingMassInput, audit(missingMassInput));
assert.equal(missingMass.status, 'BLOCKED');
assert.equal(hasBlocker(missingMass, 'EMPIRICAL_MOMENT_COMPONENT_MASS_MISSING'), true);

const staleAuditInput = fixture({ cogMm: { x: 500, y: 25, z: 0 } });
const staleAudit = audit(staleAuditInput);
const changedProfile = profile({ componentWeightsKg: { 'VALVE-10KG': 11 } });
assert.throws(
  () => captureEmpiricalComponentMomentDemand({
    ...staleAuditInput,
    profile: changedProfile,
    authorityAudit: staleAudit,
  }),
  (error) => error.code === 'EMPIRICAL_COMPONENT_MOMENT_AUTHORITY_BINDING_MISMATCH',
);

const tampered = structuredClone(explicitFirst);
tampered.records[0].magnitudeNm = 30;
assert.throws(
  () => requireEmpiricalComponentMomentDemand(tampered),
  (error) => error.code === 'EMPIRICAL_COMPONENT_MOMENT_DEMAND_HASH_MISMATCH',
);

console.log(JSON.stringify({
  status: 'PASS',
  schema: explicitFirst.schema,
  explicitMomentSemanticHash: explicitFirst.semanticHash,
  explicitMomentNm: explicitFirst.records[0].magnitudeNm,
  explicitMomentDisposition: explicitFirst.records[0].disposition,
  eccentricMomentSemanticHash: eccentric.semanticHash,
  eccentricMomentVectorNm: eccentric.records[0].vectorNm,
  eccentricMomentMagnitudeNm: eccentric.records[0].magnitudeNm,
  eccentricLoadCases: eccentric.records.map((row) => row.loadCaseId),
  zeroMomentStatus: zero.status,
  invalidMomentBlocker: invalidExplicit.blockers[0].code,
  ambiguousBlocker: ambiguous.blockers[0].code,
  verticalReactionDistributionPerformed: explicitFirst.verticalReactionDistributionPerformed,
  numericalVerticalReactionMethodChanged: explicitFirst.numericalVerticalReactionMethodChanged,
}, null, 2));

function capture(input, authorityAudit) {
  return captureEmpiricalComponentMomentDemand({ ...input, authorityAudit });
}

function audit(input) {
  return auditEmpiricalComponentLoadAuthority({
    dataset: input.dataset,
    profile: input.profile,
    routePartitionModel: input.routePartitionModel,
  });
}

function fixture({
  cogMm,
  explicitMomentNm = null,
  momentAxis = null,
  componentWeightsKg = { 'VALVE-10KG': 10 },
}) {
  const component = sharedComponent(cogMm, explicitMomentNm, momentAxis);
  const sharedModel = sealSharedModel([component]);
  return {
    dataset: {
      schema: 'analysis-workspace-dataset/v1',
      datasetId: 'EMP-PROD-03D-DATASET',
      version: 1,
      sourceSha256: '1'.repeat(64),
      sharedModel,
      entities: [
        entity('PIPE-1', 'PIPE', 'pipe'),
        entity('VALVE-1', 'VALVE', 'component', 'VALVE-10KG'),
      ],
    },
    profile: profile({ componentWeightsKg }),
    routePartitionModel: routeModel(false),
  };
}

function ambiguousFixture() {
  const input = fixture({ cogMm: { x: 500, y: 0, z: 0 } });
  input.dataset.entities.splice(1, 0, entity('PIPE-2', 'PIPE', 'pipe'));
  input.routePartitionModel = routeModel(true);
  return input;
}

function profile({ componentWeightsKg }) {
  const base = createEmptyProjectDataProfile();
  return {
    ...base,
    projectId: 'EMP-PROD-03D-PROJECT',
    revision: 1,
    updatedAt: '2026-08-05T04:48:00.000Z',
    topology: {
      ...base.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_03D_TOLERANCE'),
    },
    loadCalculation: {
      ...base.loadCalculation,
      gravityMPerS2: approved(9.80665, 'EMP_PROD_03D_GRAVITY'),
      loadFactor: approved(1, 'EMP_PROD_03D_LOAD_FACTOR'),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD'], 'EMP_PROD_03D_CASES'),
      componentWeightsKg: approved(componentWeightsKg, 'EMP_PROD_03D_WEIGHTS'),
    },
  };
}

function approved(value, source) {
  return createEvidenceValue(value, { source }, true);
}

function sharedComponent(cogMm, explicitMomentNm, momentAxis) {
  const loadEvidence = {};
  if (cogMm) {
    loadEvidence.componentCog = {
      value: cogMm,
      unit: 'mm',
      sourceKind: 'COMPOSITE_EXPLICIT_SOURCE_EVIDENCE',
      sourcePath: 'fixture.componentCog',
      axes: {
        x: evidence(cogMm.x, 'mm', 'fixture.componentCog.x'),
        y: evidence(cogMm.y, 'mm', 'fixture.componentCog.y'),
        z: evidence(cogMm.z, 'mm', 'fixture.componentCog.z'),
      },
    };
  }
  if (explicitMomentNm !== null) {
    loadEvidence.explicitPointMomentNm = evidence(
      explicitMomentNm,
      'N*m',
      'fixture.explicitPointMomentNm',
    );
  }
  if (momentAxis !== null) {
    loadEvidence.momentAxis = evidence(momentAxis, '', 'fixture.momentAxis');
  }
  return {
    componentKey: 'VALVE-1',
    sourceEntityId: 'SOURCE-VALVE-1',
    type: 'VALVE',
    loadEvidence,
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

function entity(entityId, entityType, category, catalogKey = null) {
  return {
    entityId,
    entityType,
    category,
    sourceEntityId: `SOURCE-${entityId}`,
    properties: catalogKey
      ? { attributes: { CATALOG_KEY: catalogKey } }
      : {},
  };
}

function routeModel(ambiguous) {
  const physicalEdgeIds = ambiguous
    ? ['PIPE-1', 'PIPE-2', 'VALVE-1']
    : ['PIPE-1', 'VALVE-1'];
  const entityChainages = ambiguous
    ? [
      chainage('PIPE-1', 0, 1000, 500),
      chainage('PIPE-2', 1000, 2000, 1500),
      chainage('VALVE-1', 500, 500, 500),
    ]
    : [
      chainage('PIPE-1', 0, 1000, 500),
      chainage('VALVE-1', 500, 500, 500),
    ];
  const edges = ambiguous
    ? [
      edge('PIPE-1', { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }),
      edge('PIPE-2', { x: 500, y: -500, z: 0 }, { x: 500, y: 500, z: 0 }),
      pointEdge('VALVE-1', { x: 500, y: 0, z: 0 }),
    ]
    : [
      edge('PIPE-1', { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }),
      pointEdge('VALVE-1', { x: 500, y: 0, z: 0 }),
    ];
  return {
    schema: 'route-partition-model/v1',
    routes: [{
      routeId: 'ROUTE-1',
      status: 'READY',
      blockers: [],
      physicalEdgeIds,
      entityChainages,
    }],
    edges,
  };
}

function chainage(entityId, start, end, point) {
  return {
    entityId,
    sourceStartChainageMm: start,
    sourceEndChainageMm: end,
    startMm: start,
    endMm: end,
    pointMm: point,
  };
}

function edge(entityId, startMm, endMm) {
  return {
    entityId,
    entityType: 'PIPE',
    startMm,
    endMm,
    lengthMm: Math.hypot(
      endMm.x - startMm.x,
      endMm.y - startMm.y,
      endMm.z - startMm.z,
    ),
    pointComponent: false,
    topologyCarrier: false,
  };
}

function pointEdge(entityId, point) {
  return {
    entityId,
    entityType: 'VALVE',
    startMm: point,
    endMm: point,
    lengthMm: 0,
    pointComponent: true,
    topologyCarrier: false,
  };
}

function hasBlocker(value, code) {
  return value.blockers.some((row) => row.code === code);
}
