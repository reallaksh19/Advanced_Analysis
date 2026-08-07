import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  compileNonFeaMassLedger,
  computeNonFeaAssumptionEvidenceHash,
  createNonFeaApprovedAssumptionCustody,
  createNonFeaEngineeringFoundationBundle,
  createNonFeaQualificationCustody,
  normalizeNonFeaApprovedAssumptionRows,
  requiredFoundationCapabilitiesForImplementation,
  validateNonFeaApprovedAssumptionCustody,
  validateNonFeaEngineeringFoundationBundle,
  validateNonFeaQualificationCustody,
} from '../src/core/non-fea-engineering-foundation/index.js';
import { buildVerticalLoadPathFoundation } from '../src/core/support-load-screening/index.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createNonFeaLoadCaseAuthority } from '../src/workspace/project-data/non-fea-load-case-authority.js';
import { buildStraightFixture } from './w10.5-screening-fixtures.mjs';

const fixture = buildStraightFixture({ lengthsM: [1, 1], pipeMassKgM: 10, opeFluidKgM: 2, hydFluidKgM: 3 });
const sourceBefore = JSON.stringify(fixture.sharedModel);
const loadsBefore = JSON.stringify(fixture.modelLoads);
const projectionHash = 'fnv1a64:19d2f60c7a31be42';
const loadCaseAuthority = createNonFeaLoadCaseAuthority(projectProfile());
const massLedger = compileNonFeaMassLedger({
  sourceSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentProjectionSemanticHash: projectionHash,
  modelLoadFoundation: fixture.modelLoads,
});
const pathFoundation = buildVerticalLoadPathFoundation({
  sharedModel: fixture.sharedModel,
  topologyGraph: fixture.topologyGraph,
  attachmentModel: fixture.attachmentModel,
  restraintModel: fixture.restraintModel,
  loadFoundation: fixture.modelLoads,
});
const supportSiteModel = contract('support-site-model/v1', { datasetId: fixture.sharedModel.datasetId, count: 2 });
const routePartitionModel = contract('route-partition-model/v1', { datasetId: fixture.sharedModel.datasetId, count: 1 });

const ready = createNonFeaEngineeringFoundationBundle({
  sourceModelSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentProjectionSemanticHash: projectionHash,
  projectDataRevision: 11,
  loadCaseAuthority,
  modelLoadFoundation: fixture.modelLoads,
  massLedger,
  topologyGraph: fixture.topologyGraph,
  supportAttachmentModel: fixture.attachmentModel,
  restraintCapabilityModel: fixture.restraintModel,
  supportSiteModel,
  routePartitionModel,
  verticalLoadPathProfile: pathFoundation.profile,
  verticalLoadPathModel: pathFoundation.pathModel,
});
const readyAgain = createNonFeaEngineeringFoundationBundle({
  sourceModelSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentProjectionSemanticHash: projectionHash,
  projectDataRevision: 11,
  loadCaseAuthority,
  modelLoadFoundation: fixture.modelLoads,
  massLedger,
  topologyGraph: fixture.topologyGraph,
  supportAttachmentModel: fixture.attachmentModel,
  restraintCapabilityModel: fixture.restraintModel,
  supportSiteModel,
  routePartitionModel,
  verticalLoadPathProfile: pathFoundation.profile,
  verticalLoadPathModel: pathFoundation.pathModel,
});

assert.equal(ready.bundleState, 'READY', ready.blockers.map((row) => `${row.capabilityId}:${row.code}`).join('\n'));
assert.equal(validateNonFeaEngineeringFoundationBundle(ready).ok, true);
assert.equal(ready.semanticHash, readyAgain.semanticHash, 'foundation bundle must be deterministic');
assert.equal(ready.capabilities.length, 9);
assert(ready.capabilities.every((row) => row.state === 'READY'));
assert.equal(ready.massLedger.semanticHash, massLedger.semanticHash);
assert.equal(ready.verticalLoadPathModel.semanticHash, pathFoundation.pathModel.semanticHash);
assert.deepEqual(
  requiredFoundationCapabilitiesForImplementation('EMPIRICAL_BEAM_CONTACT_V1'),
  ready.capabilities.map((row) => row.capabilityId),
);
assert.equal(
  requiredFoundationCapabilitiesForImplementation('EMPIRICAL_RESTRAINT_NETWORK_V2')
    .includes('MASS_LEDGER'),
  false,
  'restraint-network foundation capability must not inherit mass authority',
);

const wrongMass = compileNonFeaMassLedger({
  sourceSemanticHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
  enrichmentProjectionSemanticHash: projectionHash,
  modelLoadFoundation: fixture.modelLoads,
});
const partial = createNonFeaEngineeringFoundationBundle({
  sourceModelSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentProjectionSemanticHash: projectionHash,
  projectDataRevision: 11,
  loadCaseAuthority,
  modelLoadFoundation: fixture.modelLoads,
  massLedger: wrongMass,
  topologyGraph: fixture.topologyGraph,
  supportAttachmentModel: fixture.attachmentModel,
  restraintCapabilityModel: fixture.restraintModel,
  supportSiteModel,
  routePartitionModel,
  verticalLoadPathProfile: pathFoundation.profile,
  verticalLoadPathModel: pathFoundation.pathModel,
});
assert.equal(partial.bundleState, 'PARTIALLY_READY');
assert.equal(capability(partial, 'MASS_LEDGER').state, 'BLOCKED');
assert.equal(capability(partial, 'TOPOLOGY_GRAPH').state, 'READY');
assert(partial.blockers.some((row) => row.code === 'MASS_LEDGER_SOURCE_MISMATCH'));

const missingRoute = createNonFeaEngineeringFoundationBundle({
  sourceModelSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentProjectionSemanticHash: projectionHash,
  projectDataRevision: 11,
  loadCaseAuthority,
  modelLoadFoundation: fixture.modelLoads,
  massLedger,
  topologyGraph: fixture.topologyGraph,
  supportAttachmentModel: fixture.attachmentModel,
  restraintCapabilityModel: fixture.restraintModel,
  supportSiteModel,
  routePartitionModel: null,
  verticalLoadPathProfile: pathFoundation.profile,
  verticalLoadPathModel: pathFoundation.pathModel,
});
assert.equal(missingRoute.bundleState, 'PARTIALLY_READY');
assert.equal(capability(missingRoute, 'ROUTE_PARTITIONS').state, 'BLOCKED');
assert.equal(capability(missingRoute, 'MASS_LEDGER').state, 'READY');

// Wave 10: neutralize approved-assumption custody without creating a second
// field-value authority. Legacy row normalization is retained as a neutral
// evidence kernel so historical First Cut packages can converge later without
// changing their engineering values or hash semantics.
const legacyRows = [
  legacyAssumption('B', 'AUTHORIZED_MASTER', ['B', 'A', 'A']),
  legacyAssumption('A', 'USER_APPROVED_APPROXIMATION', ['APPROXIMATION']),
];
const normalizedLegacyRows = normalizeNonFeaApprovedAssumptionRows(legacyRows);
assert.deepEqual(normalizedLegacyRows.map((row) => row.assumptionId), ['A', 'B']);
assert.deepEqual(normalizedLegacyRows[1].limitations, ['A', 'B']);
assert.equal(
  computeNonFeaAssumptionEvidenceHash(legacyRows),
  semanticHash(normalizedLegacyRows.map((row) => ({
    assumptionId: row.assumptionId,
    source: row.source,
    reason: row.reason,
    approver: row.approver,
  }))),
);

const assumptionLedger = resolutionLedger([
  resolution('COMPONENT|PIPE-A|MATERIAL_DENSITY', 'COMPONENT', 'PIPE-A', 'MATERIAL_DENSITY', {
    authority: 'ACCEPTED_OVERRIDE',
    recordId: 'APPROX-1',
    sourceId: 'LEGACY-MIGRATION',
    revision: '1',
    evidence: {
      source: 'Migrated First Cut sidecar',
      acceptanceBasis: 'Reviewed against vendor datasheet.',
    },
    migration: { legacyAuthority: 'USER_APPROVED_APPROXIMATION', reviewRequired: true },
  }),
  resolution('SUPPORT|SUP-1|SUPPORT_AVAILABILITY_SENSITIVITY', 'SUPPORT', 'SUP-1', 'SUPPORT_AVAILABILITY_SENSITIVITY', {
    authority: 'ACCEPTED_OVERRIDE',
    recordId: 'SENS-1',
    sourceId: 'ENGINEER-REVIEW',
    revision: '2',
    evidence: { source: 'Reviewed field note', acceptanceBasis: 'Support intentionally treated unavailable.' },
    migration: null,
  }),
  resolution('COMPONENT|PIPE-B|ELASTIC_MODULUS', 'COMPONENT', 'PIPE-B', 'ELASTIC_MODULUS', {
    authority: 'ACCEPTED_OVERRIDE',
    recordId: 'EXACT-OVERRIDE-1',
    sourceId: 'MATERIAL-CERT',
    revision: '3',
    evidence: { source: 'Material certificate', acceptanceBasis: 'Exact corrected value.' },
    migration: null,
  }),
]);
const assumptionCustody = createNonFeaApprovedAssumptionCustody({
  sourceModelSemanticHash: fixture.sharedModel.semanticHash,
  resolutionLedger: assumptionLedger,
});
assert.equal(assumptionCustody.state, 'READY');
assert.equal(validateNonFeaApprovedAssumptionCustody(assumptionCustody).ok, true);
assert.deepEqual(assumptionCustody.assumptions.map((row) => row.assumptionId), ['APPROX-1', 'SENS-1']);
assert.deepEqual(assumptionCustody.unclassifiedAcceptedOverrideRecordIds, ['EXACT-OVERRIDE-1']);
assert(assumptionCustody.assumptions.every((row) => !Object.hasOwn(row, 'value')));
assert.equal(assumptionCustody.policy.ownsFieldValues, false);
assert.equal(assumptionCustody.policy.resolverAuthority, false);
assert(assumptionCustody.assumptions.find((row) => row.assumptionId === 'SENS-1')
  .limitations.includes('DOES_NOT_IMPLY_THERMAL_LIFT_OFF'));

const reviewRequiredLedger = resolutionLedger([
  resolution('COMPONENT|PIPE-A|MATERIAL_DENSITY', 'COMPONENT', 'PIPE-A', 'MATERIAL_DENSITY', {
    authority: 'ACCEPTED_OVERRIDE',
    recordId: 'APPROX-BLOCKED',
    sourceId: 'LEGACY-MIGRATION',
    revision: '1',
    evidence: { source: 'Migrated First Cut sidecar' },
    migration: { legacyAuthority: 'USER_APPROVED_APPROXIMATION', reviewRequired: true },
  }),
]);
const blockedAssumptionCustody = createNonFeaApprovedAssumptionCustody({
  sourceModelSemanticHash: fixture.sharedModel.semanticHash,
  resolutionLedger: reviewRequiredLedger,
});
assert.equal(blockedAssumptionCustody.state, 'BLOCKED');
assert(blockedAssumptionCustody.blockers.some((row) => row.code === 'NON_FEA_ASSUMPTION_REVIEW_REQUIRED'));

// Project/application qualification custody remains distinct from empirical
// implementation/runtime-profile qualification.
const qualificationProfile = qualificationProfileRow();
const qualificationProjectData = projectProfileWithQualification(qualificationProfile);
const qualificationCustody = createNonFeaQualificationCustody({
  projectDataProfile: qualificationProjectData,
  qualificationProfile,
  qualificationRequired: true,
});
assert.equal(qualificationCustody.state, 'READY');
assert.equal(validateNonFeaQualificationCustody(qualificationCustody).ok, true);
assert.equal(qualificationCustody.profileIdentity, 'NONFEA-QA@3');
assert.equal(qualificationCustody.policy.projectApplicationAuthorityOnly, true);
assert.equal(qualificationCustody.policy.runtimeProfileAuthority, false);
assert.equal(qualificationCustody.policy.authorizationAuthority, false);
assert.equal(qualificationCustody.policy.executionAuthority, false);

const sealedQualificationCustody = createNonFeaQualificationCustody({
  projectDataProfile: projectProfile(),
  qualificationProfile,
  qualificationRequired: true,
  authorityMode: 'SEALED_COMMON_INPUT',
  sealedQualificationProfileSemanticHash: qualificationCustody.qualificationProfileSemanticHash,
});
assert.equal(sealedQualificationCustody.state, 'READY');
assert.equal(sealedQualificationCustody.authorityMode, 'SEALED_COMMON_INPUT');
assert.equal(sealedQualificationCustody.authorityEvidenceSemanticHash, null);
const sealedQualificationMismatch = createNonFeaQualificationCustody({
  projectDataProfile: projectProfile(),
  qualificationProfile,
  qualificationRequired: true,
  authorityMode: 'SEALED_COMMON_INPUT',
  sealedQualificationProfileSemanticHash: 'fnv1a64:9999999999999999',
});
assert.equal(sealedQualificationMismatch.state, 'BLOCKED');
assert(sealedQualificationMismatch.blockers.some((row) => row.code === 'NON_FEA_QUALIFICATION_SEAL_MISMATCH'));

const unlockedProfile = qualificationProfileRow({ locked: false });
const unlockedQualification = createNonFeaQualificationCustody({
  projectDataProfile: projectProfileWithQualification(unlockedProfile),
  qualificationProfile: unlockedProfile,
  qualificationRequired: true,
});
assert.equal(unlockedQualification.state, 'BLOCKED');
assert(unlockedQualification.blockers.some((row) => row.code === 'NON_FEA_QUALIFICATION_PROFILE_UNLOCKED'));

const staleQualification = createNonFeaQualificationCustody({
  projectDataProfile: projectProfileWithQualification(qualificationProfileRow({ basis: { revision: 4 } })),
  qualificationProfile: qualificationProfileRow({ basis: { revision: 3 } }),
  qualificationRequired: true,
});
assert.equal(staleQualification.state, 'BLOCKED');
assert(staleQualification.blockers.some((row) => row.code === 'NON_FEA_QUALIFICATION_PROFILE_STALE'));

const exportOnlyQualification = createNonFeaQualificationCustody({
  projectDataProfile: qualificationProjectData,
  qualificationProfile: null,
  qualificationRequired: false,
});
assert.equal(exportOnlyQualification.state, 'READY');
const missingQualification = createNonFeaQualificationCustody({
  projectDataProfile: qualificationProjectData,
  qualificationProfile: null,
  qualificationRequired: true,
});
assert.equal(missingQualification.state, 'BLOCKED');
assert(missingQualification.blockers.some((row) => row.code === 'NON_FEA_QUALIFICATION_PROFILE_REQUIRED'));

assert.equal(JSON.stringify(fixture.sharedModel), sourceBefore, 'foundation bundle mutated source model');
assert.equal(JSON.stringify(fixture.modelLoads), loadsBefore, 'foundation bundle mutated model-load foundation');

const bundleSource = await readFile(new URL('../src/core/non-fea-engineering-foundation/bundle.js', import.meta.url), 'utf8');
const handoffSource = await readFile(new URL('../src/core/non-fea-engineering-foundation/handoff.js', import.meta.url), 'utf8');
const governanceSource = await readFile(new URL('../src/core/non-fea-engineering-foundation/governance-custody.js', import.meta.url), 'utf8');
const runtimeSource = await readFile(new URL('../src/workspace/non-fea-engineering-foundation-runtime.js', import.meta.url), 'utf8');
assert.doesNotMatch(bundleSource, /first-cut/i, 'common foundation core must not depend on First Cut');
assert.doesNotMatch(handoffSource, /first-cut/i, 'common foundation handoff must not depend on First Cut');
assert.doesNotMatch(runtimeSource, /first-cut/i, 'common foundation runtime must not depend on First Cut');
assert.doesNotMatch(governanceSource, /from ['"][^'"]*first-cut-load-estimation/iu, 'common governance custody must not import First Cut');
const foundationModuleSpecifiers = [bundleSource, handoffSource, governanceSource, runtimeSource]
  .flatMap(importedModuleSpecifiers);
assert.doesNotMatch(
  foundationModuleSpecifiers.join('\n'),
  /linear-fea|lafea|lfea|solver|continuum/i,
  'common foundation must not import FEA, LAFEA, solver or continuum modules',
);

console.log(JSON.stringify({
  check: 'non-fea-engineering-foundation',
  status: 'PASS',
  bundleState: ready.bundleState,
  capabilities: ready.capabilities.map((row) => row.capabilityId),
  independentCapabilityBlocking: true,
  methodSpecificCapabilityBinding: true,
  massCogBound: true,
  topologyAttachmentRestraintChainBound: true,
  verticalLoadPathBound: true,
  approvedAssumptionCustodyNeutralized: true,
  ordinaryOverridesNotPromotedToAssumptions: true,
  migratedApproximationReviewFailsClosed: true,
  projectQualificationCustodySeparatedFromRuntimeProfile: true,
  deterministic: true,
  sourceImmutable: true,
  firstCutImports: 0,
  feaImports: 0,
}, null, 2));

function capability(bundle, id) {
  const row = bundle.capabilities.find((item) => item.capabilityId === id);
  assert.ok(row, `missing capability ${id}`);
  return row;
}
function projectProfile() {
  return {
    revision: 11,
    loadCalculation: {
      activeLoadCases: {
        value: ['EMPTY', 'OPE', 'HYD'],
        evidence: { source: 'PROJECT-DATA-LOAD-CASE-BASIS' },
        approved: true,
      },
    },
  };
}
function legacyAssumption(assumptionId, authorityLevel, limitations) {
  return {
    assumptionId,
    entityId: 'PIPE-A',
    fieldId: 'materialDensityKgM3',
    value: 7850,
    unit: 'kg/m3',
    source: 'SOURCE@1',
    reason: 'Reviewed engineering basis.',
    approver: 'ENGINEER',
    authorityLevel,
    limitations,
  };
}
function resolutionLedger(rows) {
  const base = {
    schema: 'non-fea-field-resolution-ledger/v1',
    sourceSemanticHash: fixture.sharedModel.semanticHash,
    sidecarSemanticHash: 'fnv1a64:3333333333333333',
    status: 'READY',
    rows,
    blockers: [],
  };
  return { ...base, semanticHash: semanticHash(base) };
}
function resolution(resolutionKey, targetKind, targetId, fieldId, selected) {
  const publicSelected = {
    targetKind,
    targetId,
    fieldId,
    propertyKey: fieldId.toLowerCase(),
    value: 1,
    unit: 'unit',
    authority: selected.authority,
    recordId: selected.recordId,
    sourceId: selected.sourceId,
    revision: selected.revision,
    evidence: selected.evidence,
    migration: selected.migration,
    fromSource: selected.authority === 'SOURCE_EXPLICIT',
  };
  return {
    resolutionKey,
    targetKind,
    targetId,
    fieldId,
    status: 'RESOLVED',
    selected: publicSelected,
    candidates: [publicSelected],
  };
}
function qualificationProfileRow(overrides = {}) {
  return {
    profileId: 'NONFEA-QA',
    version: 3,
    methods: ['VERTICAL_CONTACT', 'WEIGHT_AND_GRAVITY'],
    qualification: overrides.qualification || 'QUALIFIED',
    locked: overrides.locked ?? true,
    basis: overrides.basis || { revision: 3 },
  };
}
function projectProfileWithQualification(profile) {
  return {
    schema: 'project-data-profile/v1',
    projectId: 'P-1',
    revision: 7,
    qualificationPolicy: {
      qualificationProfiles: {
        value: {
          schema: 'non-fea-qualification-profile-set/v1',
          profiles: [profile],
        },
        evidence: { source: 'PROJECT-QA-REGISTER' },
        approved: true,
      },
    },
  };
}
function contract(schema, payload) {
  const base = { schema, ...payload };
  return { ...base, semanticHash: semanticHash(base) };
}
function importedModuleSpecifiers(source) {
  const rows = [];
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu)) rows.push(match[1]);
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu)) rows.push(match[1]);
  return rows;
}
