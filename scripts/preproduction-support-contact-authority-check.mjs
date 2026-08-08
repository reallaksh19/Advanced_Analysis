import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { createNonFeaAnalysisTopology } from '../src/core/non-fea-engineering-foundation/analysis-topology.js';
import { createNonFeaEffectiveRestraintCapabilityModel } from '../src/core/non-fea-engineering-foundation/effective-restraint-capability.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import {
  buildPreproductionSupportContactAuthority,
  createPreproductionSupportContactSemantics,
  evaluatePreproductionSupportContactAuthorityCurrentness,
  requirePreproductionSupportContactAuthority,
} from '../src/workspace/engineering-loads/preproduction-support-contact-authority.js';
import {
  buildPreproductionThermalLiftoffContactBridge,
  requireThermalLiftoffSupportContactAuthorityV1,
} from '../src/workspace/engineering-loads/preproduction-support-contact-tl-bridge.js';
import {
  exactTopology,
  pipeComponent,
  point,
  sharedFixture,
  supportEvidence,
  supportRecord,
} from './w10.3-support-restraint-fixtures.mjs';

const fixture = createFixture();
const authority = buildPreproductionSupportContactAuthority(fixture);

assert.equal(authority.schema, 'engineering-preproduction-support-contact-authority/v1');
assert.equal(authority.status, 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY');
assert.equal(authority.rows.length, 3);
assert.deepEqual(authority.rows.map((row) => row.supportSiteId), ['SITE-0', 'SITE-1000', 'SITE-500']);
assert.deepEqual(authority.rows.map((row) => row.routeChainageMm), [1000, 0, 500]);
assert.ok(authority.rows.every((row) => row.authorityStatus === 'QUALIFIED_SOURCE_BOUND'));
assert.ok(authority.rows.every((row) => row.tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE'));
assert.ok(authority.rows.every((row) => row.coldGapM === 0));
assert.ok(authority.rows.every((row) => row.effectiveType === 'UNILATERAL_REST'));
assert.ok(authority.rows.every((row) => row.effectiveDirection === 'VERTICAL'));
assert.ok(authority.rows.every((row) => JSON.stringify(row.effectiveAxis) === JSON.stringify([0, 0, 1])));
assert.equal(authority.policy.productionCalculationConsumptionEnabled, false);
assert.equal(authority.policy.gravityMutationPermitted, false);
assert.equal(authority.policy.gapMechanicsExecuted, false);
assert.equal(authority.policy.springMechanicsExecuted, false);
assert.equal(authority.policy.frictionMechanicsExecuted, false);
assert.equal(authority.policy.liftOffExecuted, false);
assert.equal(authority.policy.activeSetRedistributionEnabled, false);
assert.equal(authority.policy.tl02StiffnessPromotionPermitted, false);
assert.equal(authority.policy.reactionToleranceAuthorityCreated, false);
assert.equal(authority.policy.supportMovementAuthorityCreated, false);

const middle = authority.rows.find((row) => row.supportKey === 'SUP-500');
assert.equal(middle.restraintStiffnessEvidenceValue, 50);
assert.equal(middle.evidenceOnly.tl02EffectiveStiffnessAuthority, 'UNQUALIFIED_APPLICABILITY_REQUIRED');
assert.equal(middle.frictionCoefficient, 0.2);
assert.equal(middle.evidenceOnly.frictionMechanics, 'EVIDENCE_ONLY_NOT_EXECUTED');
assert.equal(middle.evidenceOnly.springMechanics, 'EVIDENCE_ONLY_NOT_EXECUTED');

const bridge = buildPreproductionThermalLiftoffContactBridge(authority);
assert.equal(bridge.schema, 'engineering-preproduction-thermal-liftoff-contact-bridge/v1');
assert.equal(bridge.status, 'READY_FOR_TL03_CONTACT_INTAKE');
assert.equal(bridge.qualifiedContacts.length, 3);
assert.equal(bridge.unresolved.length, 0);
assert.equal(bridge.policy.localScreenExecutionPerformed, false);
assert.equal(bridge.policy.fullCaseExecutionPermitted, false);
assert.equal(bridge.policy.displacementAuthorityCreated, false);
assert.equal(bridge.policy.tl02StiffnessAuthorityCreated, false);
assert.equal(bridge.policy.reactionToleranceAuthorityCreated, false);
assert.equal(bridge.policy.activeSetRedistributionPerformed, false);
assert.equal(bridge.policy.finalHotReactionPublicationPermitted, false);
assert.equal(bridge.policy.productionMethodRegistrationPermitted, false);
assert.equal(bridge.policy.gravityMutationPermitted, false);
for (const contact of bridge.qualifiedContacts) {
  requireThermalLiftoffSupportContactAuthorityV1(contact);
  assert.deepEqual(Object.keys(contact).sort(), [
    'blockers', 'capability', 'coldGapM', 'gapConvention', 'initialState',
    'qualification', 'routeChainageMm', 'schema', 'semanticHash', 'source',
    'supportSiteId', 'tensileReactionPermitted', 'verticalContactDirection',
  ].sort());
  assert.equal(contact.schema, 'empirical-thermal-liftoff-support-contact-authority/v1');
  assert.equal(contact.capability, 'UNILATERAL_REST');
  assert.equal(contact.verticalContactDirection, 'GLOBAL_Z_PLUS');
  assert.equal(contact.tensileReactionPermitted, false);
  assert.equal(contact.initialState, 'CONTACTING');
  assert.equal(contact.qualification, 'QUALIFIED');
  assert.deepEqual(contact.blockers, []);
  assert.ok(!Object.hasOwn(contact, 'stiffness'));
  assert.ok(!Object.hasOwn(contact, 'reactionToleranceN'));
  assert.ok(!Object.hasOwn(contact, 'finalReactionN'));
}

const bridgeTamper = structuredClone(bridge.qualifiedContacts[0]);
bridgeTamper.coldGapM = 0.001;
assert.throws(
  () => requireThermalLiftoffSupportContactAuthorityV1(bridgeTamper),
  (error) => error.code === 'PREPRODUCTION_TL03_CONTACT_HASH_MISMATCH',
);

const springEffective = effectiveAuthority(fixture.restraintCapabilityModel, {
  typeFor: (supportKey) => supportKey === 'SUP-500' ? 'SPRING' : 'UNILATERAL_REST',
});
const springSemantics = fixture.contactSemantics.map((row) => row.supportKey === 'SUP-500'
  ? createSemantics('SUP-500', { capability: 'SPRING' })
  : row);
const mixedAuthority = buildPreproductionSupportContactAuthority({
  ...fixture,
  effectiveRestraintCapabilityModel: springEffective,
  contactSemantics: springSemantics,
});
assert.equal(mixedAuthority.status, 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY');
assert.equal(mixedAuthority.rows.find((row) => row.supportKey === 'SUP-500').tl03Status, 'UNRESOLVED_GATE');
const mixedBridge = buildPreproductionThermalLiftoffContactBridge(mixedAuthority);
assert.equal(mixedBridge.status, 'PARTIAL_CONTACT_INTAKE_ONLY');
assert.equal(mixedBridge.qualifiedContacts.length, 2);
assert.equal(mixedBridge.unresolved.length, 1);
assert.equal(mixedBridge.policy.fullCaseExecutionPermitted, false);

const currentness = evaluatePreproductionSupportContactAuthorityCurrentness({
  authority,
  ...fixture,
});
assert.equal(currentness.status, 'CURRENT');
assert.deepEqual(currentness.differences, []);
assert.equal(currentness.productionCalculationConsumptionEnabled, false);

const revisedSemantics = fixture.contactSemantics.map((row) => row.supportKey === 'SUP-500'
  ? createSemantics('SUP-500', { sourceRevision: 'REV-B' })
  : row);
const stale = evaluatePreproductionSupportContactAuthorityCurrentness({
  authority,
  ...fixture,
  contactSemantics: revisedSemantics,
});
assert.equal(stale.status, 'STALE_REBUILD_REQUIRED');
assert.ok(stale.differences.includes('authoritySemanticHash'));
assert.ok(stale.differences.includes('contactSemanticsSemanticHashes'));

const missingSemantics = buildPreproductionSupportContactAuthority({
  ...fixture,
  contactSemantics: fixture.contactSemantics.filter((row) => row.supportKey !== 'SUP-500'),
});
assert.equal(missingSemantics.status, 'BLOCKED');
assert.ok(missingSemantics.blockers.some((row) => row.code === 'PREPRODUCTION_SUPPORT_CONTACT_SEMANTICS_COVERAGE_MISMATCH'));
assert.equal(missingSemantics.rows.find((row) => row.supportKey === 'SUP-500').authorityStatus, 'BLOCKED');

const wrongAxisEffective = effectiveAuthority(fixture.restraintCapabilityModel, {
  axisFor: (supportKey) => supportKey === 'SUP-500' ? [0, 1, 0] : [0, 0, 1],
});
const wrongAxis = buildPreproductionSupportContactAuthority({
  ...fixture,
  effectiveRestraintCapabilityModel: wrongAxisEffective,
});
assert.equal(wrongAxis.status, 'BLOCKED');
assert.ok(wrongAxis.rows.find((row) => row.supportKey === 'SUP-500').blockers
  .some((row) => row.code === 'PREPRODUCTION_SUPPORT_CONTACT_DIRECTION_UNRESOLVED'));

const typeMismatchSemantics = fixture.contactSemantics.map((row) => row.supportKey === 'SUP-500'
  ? createSemantics('SUP-500', { capability: 'SPRING' })
  : row);
const typeMismatch = buildPreproductionSupportContactAuthority({
  ...fixture,
  contactSemantics: typeMismatchSemantics,
});
assert.equal(typeMismatch.status, 'BLOCKED');
assert.ok(typeMismatch.rows.find((row) => row.supportKey === 'SUP-500').blockers
  .some((row) => row.code === 'PREPRODUCTION_SUPPORT_CONTACT_CAPABILITY_MISMATCH'));

const sourceSnapshot = JSON.stringify(fixture.restraintCapabilityModel);
const effectiveSnapshot = JSON.stringify(fixture.effectiveRestraintCapabilityModel);
const analysisSnapshot = JSON.stringify(fixture.analysisTopology);
const semanticsSnapshot = JSON.stringify(fixture.contactSemantics);
requirePreproductionSupportContactAuthority(authority);
assert.equal(JSON.stringify(fixture.restraintCapabilityModel), sourceSnapshot);
assert.equal(JSON.stringify(fixture.effectiveRestraintCapabilityModel), effectiveSnapshot);
assert.equal(JSON.stringify(fixture.analysisTopology), analysisSnapshot);
assert.equal(JSON.stringify(fixture.contactSemantics), semanticsSnapshot);

const tampered = structuredClone(authority);
tampered.rows[0].coldGapM = 0.001;
assert.throws(
  () => requirePreproductionSupportContactAuthority(tampered),
  (error) => error.code === 'PREPRODUCTION_SUPPORT_CONTACT_ROW_HASH_MISMATCH',
);

console.log(JSON.stringify({
  check: 'preproduction-support-contact-authority',
  status: 'PASS',
  schema: authority.schema,
  authorityStatus: authority.status,
  supportCount: authority.summary.supportCount,
  tl03ReadyCount: authority.summary.tl03ReadyCount,
  exactSupportSites: authority.rows.map((row) => ({
    supportKey: row.supportKey,
    supportSiteId: row.supportSiteId,
    routeChainageMm: row.routeChainageMm,
    coldGapM: row.coldGapM,
  })),
  numericStiffnessRetainedButNotPromoted: middle.restraintStiffnessEvidenceValue === 50
    && middle.evidenceOnly.tl02EffectiveStiffnessAuthority === 'UNQUALIFIED_APPLICABILITY_REQUIRED',
  springAndFrictionEvidenceNonExecuting: middle.evidenceOnly.springMechanics === 'EVIDENCE_ONLY_NOT_EXECUTED'
    && middle.evidenceOnly.frictionMechanics === 'EVIDENCE_ONLY_NOT_EXECUTED',
  missingSemanticsFailsClosed: missingSemantics.status === 'BLOCKED',
  axisMismatchFailsClosed: wrongAxis.status === 'BLOCKED',
  capabilityMismatchFailsClosed: typeMismatch.status === 'BLOCKED',
  currentnessDetectsSemanticsRevision: stale.status === 'STALE_REBUILD_REQUIRED',
  tl03SchemaCompatibilityQualified: bridge.qualifiedContacts.length === 3,
  unsupportedSpringRemainsPreproductionOnly: mixedBridge.status === 'PARTIAL_CONTACT_INTAKE_ONLY'
    && mixedBridge.policy.fullCaseExecutionPermitted === false,
  sourceImmutable: true,
}, null, 2));

function createFixture() {
  const pipe = pipeComponent('PIPE-1', point(0), point(1000), {
    sourceEntityId: 'PIPE-SOURCE-1',
    identity: { lineId: 'L-1', branchId: 'B-1' },
  });
  const supports = [
    supportRecord('SUP-0', point(0), supportOptions('SOURCE-SUP-0', false)),
    supportRecord('SUP-500', point(500), supportOptions('SOURCE-SUP-500', true)),
    supportRecord('SUP-1000', point(1000), supportOptions('SOURCE-SUP-1000', false)),
  ];
  const sharedModel = sharedFixture({
    datasetId: 'PREPRODUCTION-CONTACT-FIXTURE',
    components: [pipe],
    supports,
  });
  const topologyGraph = exactTopology(sharedModel);
  const attachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
  const restraintCapabilityModel = buildRestraintCapabilityModel(attachmentModel);
  const effectiveRestraintCapabilityModel = effectiveAuthority(restraintCapabilityModel);
  const supportSiteModel = supportSites(sharedModel.project.datasetId);
  const routePartitionModel = routePartition(sharedModel.project.datasetId);
  const analysisTopology = createNonFeaAnalysisTopology({
    topologyGraph,
    supportAttachmentModel: attachmentModel,
    restraintCapabilityModel,
    supportSiteModel,
    routePartitionModel,
  });
  assert.equal(analysisTopology.state, 'READY');
  assert.deepEqual(analysisTopology.supportStations.map((row) => [row.supportKey, row.supportSiteId, row.chainageMm]), [
    ['SUP-1000', 'SITE-1000', 0],
    ['SUP-500', 'SITE-500', 500],
    ['SUP-0', 'SITE-0', 1000],
  ]);
  return {
    analysisTopology,
    restraintCapabilityModel,
    effectiveRestraintCapabilityModel,
    contactSemantics: ['SUP-0', 'SUP-500', 'SUP-1000'].map((key) => createSemantics(key)),
  };
}

function supportOptions(sourceEntityId, richEvidence) {
  return {
    sourceEntityId,
    sourceType: 'REST',
    identity: { lineId: 'L-1', branchId: 'B-1' },
    supportEvidence: supportEvidence({
      componentReferences: 'PIPE-1',
      supportTypes: 'REST',
      verticalGaps: 0,
      stiffness: richEvidence ? 50 : undefined,
      springRate: richEvidence ? 12 : undefined,
      friction: richEvidence ? 0.2 : undefined,
    }),
  };
}

function effectiveAuthority(restraintCapabilityModel, options = {}) {
  return createNonFeaEffectiveRestraintCapabilityModel({
    restraintCapabilityModel,
    overrides: restraintCapabilityModel.restraints.map((row) => ({
      overrideId: `CONTACT-OVERRIDE:${row.supportKey}`,
      supportSiteId: row.supportKey,
      restraintId: row.restraintId,
      sourceType: row.supportType,
      effectiveType: options.typeFor?.(row.supportKey) || 'UNILATERAL_REST',
      sourceDirection: null,
      effectiveDirection: 'VERTICAL',
      sourceAxis: null,
      effectiveAxis: options.axisFor?.(row.supportKey) || [0, 0, 1],
      sourceGapMm: 0,
      effectiveGapMm: 0,
      sourceStiffnessNPerM: row.supportKey === 'SUP-500' ? 50 : null,
      effectiveStiffnessNPerM: row.supportKey === 'SUP-500' ? 50 : null,
      sourceFriction: row.supportKey === 'SUP-500' ? 0.2 : null,
      effectiveFriction: row.supportKey === 'SUP-500' ? 0.2 : null,
      reason: 'Explicit reviewed contact semantics for preproduction TL intake.',
      geometryMutation: false,
    })),
  });
}

function createSemantics(supportKey, overrides = {}) {
  const capability = overrides.capability || 'UNILATERAL_REST';
  const sourceRevision = overrides.sourceRevision || 'REV-A';
  const sourceMaterial = {
    supportKey,
    capability,
    verticalContactDirection: 'GLOBAL_Z_PLUS',
    tensileReactionPermitted: capability === 'BILATERAL',
    initialState: 'CONTACTING',
    sourceRevision,
  };
  return createPreproductionSupportContactSemantics({
    supportKey,
    capability,
    verticalContactDirection: 'GLOBAL_Z_PLUS',
    tensileReactionPermitted: capability === 'BILATERAL',
    initialState: 'CONTACTING',
    source: {
      sourceId: `CONTACT-SEMANTICS:${supportKey}`,
      sourceRevision,
      sourceSemanticHash: semanticHash(sourceMaterial),
    },
  });
}

function supportSites(datasetId) {
  const defs = [
    ['SITE-0', 0, 'SOURCE-SUP-0'],
    ['SITE-500', 500, 'SOURCE-SUP-500'],
    ['SITE-1000', 1000, 'SOURCE-SUP-1000'],
  ];
  return {
    schema: 'support-site-model/v1',
    datasetId,
    sourceAxisBasis: 'Z_UP',
    groupingToleranceMm: 0,
    status: 'READY',
    blockers: [],
    members: [],
    assemblies: [],
    sites: defs.map(([siteId, x, sourceEntityId]) => ({
      siteId,
      positionMm: point(x),
      tags: [siteId],
      assemblyIds: [`ASM:${siteId}`],
      memberEntityIds: [`MEM:${siteId}`],
      primaryEntityId: `MEM:${siteId}`,
      branchIds: ['B-1'],
      assemblies: [{
        assemblyId: `ASM:${siteId}`,
        tag: siteId,
        branchId: 'B-1',
        lineKey: 'L-1',
        positionMm: point(x),
        memberEntityIds: [`MEM:${siteId}`],
        members: [{
          entityId: `MEM:${siteId}`,
          sourceEntityId,
          sourceType: 'REST',
          lineKey: 'L-1',
          positionMm: point(x),
        }],
      }],
    })),
    summary: {
      sourceSupportRecordCount: 3,
      supportAssemblyCount: 3,
      physicalLocationCount: 3,
    },
  };
}

function routePartition(datasetId) {
  return {
    schema: 'route-partition-model/v1',
    datasetId,
    portMatchToleranceMm: 0,
    routeJoiningRules: { partition: 'branch-scoped-connected-components', chainage: 'exact-port-topology', sourceOrderAllowed: false, degreeAboveTwo: 'BLOCKED' },
    status: 'READY',
    blockers: [],
    routes: [{
      routeId: 'ROUTE-1',
      branchId: 'B-1',
      lineKey: 'L-1',
      status: 'READY',
      blockers: [],
      nodes: [],
      edgeIds: ['PIPE-1'],
      physicalEdgeIds: ['PIPE-1'],
      entityChainages: [{
        entityId: 'PIPE-1', startMm: 0, endMm: 1000,
        sourceStartChainageMm: 0, sourceEndChainageMm: 1000, pointMm: 500,
      }],
      totalLengthMm: 1000,
    }],
    edges: [{
      edgeId: 'PIPE-1',
      entityId: 'PIPE-1',
      branchId: 'B-1',
      lineKey: 'L-1',
      entityType: 'PIPE',
      startMm: point(0),
      endMm: point(1000),
      lengthMm: 1000,
      pointComponent: false,
      autoGenerated: false,
      topologyCarrier: false,
      physical: true,
      source: {
        sourceEntityId: 'PIPE-SOURCE-1',
        jsonPointer: '/PIPE-1',
        componentReference: 'PIPE-1',
      },
    }],
    summary: {
      routeCount: 1,
      edgeCount: 1,
      physicalEdgeCount: 1,
      autoCarrierCount: 0,
    },
  };
}
