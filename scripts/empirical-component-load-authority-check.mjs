import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  EMPIRICAL_COMPONENT_COG_CLASSIFICATION,
  EMPIRICAL_COMPONENT_LOAD_AUTHORITY_AUDIT_SCHEMA,
  auditEmpiricalComponentLoadAuthority,
  requireEmpiricalComponentLoadAuthorityAudit,
} from '../src/workspace/engineering-loads/empirical-component-load-authority.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';

const onRoute = fixture({
  cog: componentCog({ x: 0.5, y: 0, z: 0 }, 'm', 'fixture.onRouteCog'),
});
const before = semanticHash(onRoute);
const first = auditEmpiricalComponentLoadAuthority(onRoute);
const second = auditEmpiricalComponentLoadAuthority(onRoute);
assert.deepEqual(second, first);
assert.equal(semanticHash(onRoute), before, 'authority audit mutated its inputs');
assert.equal(first.schema, EMPIRICAL_COMPONENT_LOAD_AUTHORITY_AUDIT_SCHEMA);
assert.equal(first.status, 'READY_FOR_INTEGRATION_DESIGN');
assert.equal(first.numericalMethodChanged, false);
assert.equal(Object.isFrozen(first), true);
assert.equal(Object.isFrozen(first.records[0]), true);
assert.equal(first.records.length, 1);
assert.equal(first.records[0].entityId, 'VALVE-1');
assert.equal(first.records[0].cogClassification, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.ON_ROUTE);
assert.equal(first.records[0].candidateChainageMm, 500);
assert.equal(first.records[0].projection.nearestDistanceMm, 0);
assert.equal(first.records[0].integrationEligible, true);
assert.equal(first.records[0].integrationDisposition, 'COG_CHAINAGE_CANDIDATE_ONLY');
assert.equal(first.summary.onRouteCogCount, 1);
assert.equal(first.summary.integrationEligibleCount, 1);

const fallback = auditEmpiricalComponentLoadAuthority(fixture({ cog: null }));
assert.equal(fallback.status, 'READY_FOR_INTEGRATION_DESIGN');
assert.equal(fallback.records[0].cogClassification, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.MIDPOINT_FALLBACK);
assert.equal(fallback.records[0].candidateChainageMm, 500);
assert.equal(fallback.records[0].integrationDisposition, 'CURRENT_METHOD_MIDPOINT_PARITY_ONLY');
assert.equal(fallback.records[0].integrationEligible, true);

const offRoute = auditEmpiricalComponentLoadAuthority(fixture({
  cog: componentCog({ x: 500, y: 25, z: 0 }, 'mm', 'fixture.offRouteCog'),
}));
assert.equal(offRoute.status, 'BLOCKED');
assert.equal(offRoute.records[0].cogClassification, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.OFF_ROUTE);
assert.equal(offRoute.records[0].projection.nearestDistanceMm, 25);
assert.equal(offRoute.records[0].candidateChainageMm, null);
assert.equal(offRoute.records[0].integrationEligible, false);
assert.equal(hasBlocker(offRoute, 'EMPIRICAL_COMPONENT_COG_OFF_ROUTE'), true);

const explicitMoment = auditEmpiricalComponentLoadAuthority(fixture({
  cog: componentCog({ x: 500, y: 0, z: 0 }, 'mm', 'fixture.momentCog'),
  explicitMomentNm: 25,
  momentAxis: 'LOCAL_Z',
}));
assert.equal(explicitMoment.status, 'BLOCKED');
assert.equal(explicitMoment.records[0].explicitMoment.magnitudeNm, 25);
assert.equal(explicitMoment.records[0].explicitMoment.axis, 'LOCAL_Z');
assert.equal(explicitMoment.records[0].integrationEligible, false);
assert.equal(hasBlocker(explicitMoment, 'EMPIRICAL_COMPONENT_EXPLICIT_MOMENT_UNSUPPORTED'), true);

const explicitZero = auditEmpiricalComponentLoadAuthority(fixture({
  cog: componentCog({ x: 500, y: 0, z: 0 }, 'mm', 'fixture.zeroMomentCog'),
  explicitMomentNm: 0,
  momentAxis: 'LOCAL_Z',
}));
assert.equal(explicitZero.status, 'READY_FOR_INTEGRATION_DESIGN');
assert.equal(explicitZero.records[0].explicitMoment.magnitudeNm, 0);
assert.equal(explicitZero.records[0].integrationEligible, true);

const invalidUnit = auditEmpiricalComponentLoadAuthority(fixture({
  cog: componentCog({ x: 1, y: 0, z: 0 }, 'furlong', 'fixture.invalidUnit'),
}));
assert.equal(invalidUnit.status, 'BLOCKED');
assert.equal(invalidUnit.records[0].cogClassification, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.INVALID);
assert.equal(hasBlocker(invalidUnit, 'EMPIRICAL_COMPONENT_COG_UNIT_UNSUPPORTED'), true);

const ambiguous = auditEmpiricalComponentLoadAuthority(ambiguousFixture());
assert.equal(ambiguous.status, 'BLOCKED');
assert.equal(ambiguous.records[0].cogClassification, EMPIRICAL_COMPONENT_COG_CLASSIFICATION.AMBIGUOUS);
assert.deepEqual(
  ambiguous.records[0].projection.candidates.map((row) => row.chainageMm),
  [500, 1500],
);
assert.equal(hasBlocker(ambiguous, 'EMPIRICAL_COMPONENT_COG_ROUTE_AMBIGUOUS'), true);

const invalidMoment = auditEmpiricalComponentLoadAuthority(fixture({
  cog: componentCog({ x: 500, y: 0, z: 0 }, 'mm', 'fixture.invalidMomentCog'),
  explicitMomentNm: -1,
  momentAxis: 'LOCAL_Z',
}));
assert.equal(invalidMoment.status, 'BLOCKED');
assert.equal(hasBlocker(invalidMoment, 'EMPIRICAL_COMPONENT_EXPLICIT_MOMENT_INVALID'), true);

const missingIdentityInput = fixture({
  cog: componentCog({ x: 500, y: 0, z: 0 }, 'mm', 'fixture.missingIdentity'),
});
missingIdentityInput.dataset.sharedModel = sealSharedModel([]);
const missingIdentity = auditEmpiricalComponentLoadAuthority(missingIdentityInput);
assert.equal(missingIdentity.status, 'BLOCKED');
assert.equal(hasBlocker(missingIdentity, 'EMPIRICAL_COMPONENT_LOAD_IDENTITY_MISSING'), true);

const tampered = structuredClone(first);
tampered.records[0].candidateChainageMm = 600;
assert.throws(
  () => requireEmpiricalComponentLoadAuthorityAudit(tampered),
  (error) => error.code === 'EMPIRICAL_COMPONENT_LOAD_AUTHORITY_HASH_MISMATCH',
);

console.log(JSON.stringify({
  status: 'PASS',
  schema: first.schema,
  onRouteAuditSemanticHash: first.semanticHash,
  onRouteCandidateChainageMm: first.records[0].candidateChainageMm,
  fallbackClassification: fallback.records[0].cogClassification,
  offRouteBlocker: offRoute.records[0].blockers[0].code,
  offRouteEccentricityMm: offRoute.records[0].projection.nearestDistanceMm,
  ambiguousCandidateChainagesMm: ambiguous.records[0].projection.candidates.map((row) => row.chainageMm),
  explicitMomentBlocker: explicitMoment.records[0].blockers[0].code,
  explicitMomentNm: explicitMoment.records[0].explicitMoment.magnitudeNm,
  numericalMethodChanged: first.numericalMethodChanged,
}, null, 2));

function fixture({ cog, explicitMomentNm = null, momentAxis = null }) {
  const profile = profileWithTolerance(1);
  const component = sharedComponent('VALVE-1', cog, explicitMomentNm, momentAxis);
  const sharedModel = sealSharedModel([component]);
  return {
    dataset: {
      schema: 'analysis-workspace-dataset/v1',
      datasetId: 'EMP-PROD-03A-DATASET',
      version: 1,
      sourceSha256: '1'.repeat(64),
      sharedModel,
      entities: [
        entity('PIPE-1', 'PIPE', 'pipe'),
        entity('VALVE-1', 'VALVE', 'component'),
      ],
    },
    profile,
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
        edge('PIPE-1', 'PIPE', { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }, 1000),
        pointEdge('VALVE-1', 'VALVE', { x: 500, y: 0, z: 0 }),
      ],
    },
  };
}

function ambiguousFixture() {
  const input = fixture({
    cog: componentCog({ x: 500, y: 0, z: 0 }, 'mm', 'fixture.ambiguousCog'),
  });
  input.dataset.entities.splice(1, 0, entity('PIPE-2', 'PIPE', 'pipe'));
  input.routePartitionModel.routes[0].physicalEdgeIds = ['PIPE-1', 'PIPE-2', 'VALVE-1'];
  input.routePartitionModel.routes[0].entityChainages = [
    chainage('PIPE-1', 0, 1000, 500),
    chainage('PIPE-2', 1000, 2000, 1500),
    chainage('VALVE-1', 500, 500, 500),
  ];
  input.routePartitionModel.edges = [
    edge('PIPE-1', 'PIPE', { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }, 1000),
    edge('PIPE-2', 'PIPE', { x: 500, y: -500, z: 0 }, { x: 500, y: 500, z: 0 }, 1000),
    pointEdge('VALVE-1', 'VALVE', { x: 500, y: 0, z: 0 }),
  ];
  return input;
}

function profileWithTolerance(value) {
  const profile = createEmptyProjectDataProfile();
  return {
    ...profile,
    projectId: 'EMP-PROD-03A-PROJECT',
    revision: 1,
    updatedAt: '2026-08-04T19:45:00.000Z',
    topology: {
      ...profile.topology,
      portMatchToleranceMm: createEvidenceValue(
        value,
        { source: 'EMP_PROD_03A_TOLERANCE' },
        true,
      ),
    },
  };
}

function sharedComponent(componentKey, cog, explicitMomentNm, momentAxis) {
  const loadEvidence = {};
  if (cog) loadEvidence.componentCog = cog;
  if (explicitMomentNm !== null) {
    loadEvidence.explicitPointMomentNm = evidence(explicitMomentNm, 'N*m', 'fixture.explicitMoment');
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
  return { value, unit, sourcePath, sourceKind: 'EXPLICIT_SOURCE_EVIDENCE' };
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

function entity(entityId, entityType, category) {
  return {
    entityId,
    entityType,
    category,
    sourceEntityId: `SOURCE-${entityId}`,
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

function edge(entityId, entityType, startMm, endMm, lengthMm) {
  return {
    entityId,
    entityType,
    startMm,
    endMm,
    lengthMm,
    pointComponent: false,
    topologyCarrier: false,
  };
}

function pointEdge(entityId, entityType, point) {
  return {
    entityId,
    entityType,
    startMm: point,
    endMm: point,
    lengthMm: 0,
    pointComponent: true,
    topologyCarrier: false,
  };
}

function hasBlocker(audit, code) {
  return audit.records[0].blockers.some((row) => row.code === code);
}
