import assert from 'node:assert/strict';
import {
  createNonFeaEnrichedProjection,
  createNonFeaEnrichmentRecord,
  createNonFeaEnrichmentSidecar,
  resolveNonFeaEnrichment,
} from '../src/core/non-fea-enrichment/index.js';
import {
  NON_FEA_COMMON_METHOD_IDS,
  assessCommonInputStaleness,
  createEnrichedStagedJsonExport,
  createPreFeaPipingCheckRequest,
  reimportEnrichedStagedJsonExport,
  requireCommonEnrichedPipingInput,
  runPreFeaPipingCheck,
  sealCommonEnrichedPipingInput,
} from '../src/core/non-fea-common-checker/index.js';
import {
  assertCanonicalStagedJsonText,
  assertCommonCheckerDependencyIntegrity,
  assertCommonInputMethodPartition,
} from '../src/core/non-fea-common-checker/integrity.js';
import {
  createNonFeaWorkspaceStatusProjection,
  validateNonFeaWorkspaceStatusProjection,
} from '../src/core/non-fea-common-checker/workspace-status-projection.js';
import {
  createSharedPipingModel,
  semanticHash,
} from '../src/core/shared-piping-model/index.js';
import { buildStraightFixture } from './w10.5-screening-fixtures.mjs';

const fixture = buildStraightFixture({ lengthsM: [2], pipeMassKgM: 10, opeFluidKgM: 2, hydFluidKgM: 3 });
const sourceModel = fixture.sharedModel;
const sourceBefore = JSON.stringify(sourceModel);
const enrichment = buildEnrichment(sourceModel);
const fullProfile = projectProfile();
const qualificationProfile = {
  profileId: 'NON-FEA-FULL',
  version: 1,
  methods: [...NON_FEA_COMMON_METHOD_IDS],
  qualification: 'QUALIFIED',
  locked: true,
  basis: { fixture: 'non-fea-common-checker-check' },
};

const request = createRequest({ projectDataProfile: fullProfile, qualificationProfile });
const reordered = createRequest({
  projectDataProfile: fullProfile,
  qualificationProfile,
  requestedMethods: [...NON_FEA_COMMON_METHOD_IDS].reverse(),
  requestedLoadCases: ['HYD', 'EMPTY', 'OPE'],
});
assert.equal(request.semanticHash, reordered.semanticHash, 'request identity must be order deterministic');
assert.deepEqual(assertCommonCheckerDependencyIntegrity({
  enrichmentSidecar: request.enrichmentSidecar,
  resolutionLedger: request.resolutionLedger,
  enrichedProjection: request.enrichedProjection,
  configuredDefaultUsageLedger: request.configuredDefaultUsageLedger,
}), { valid: true });

const report = runPreFeaPipingCheck(request);
assert.equal(report.packageState, 'READY', report.blockers.map((row) => row.message).join('\n'));
assert.deepEqual(report.readyMethodIds, [...NON_FEA_COMMON_METHOD_IDS].sort());
assert.equal(report.blockedMethodIds.length, 0);
assert(report.methodRows.every((row) => row.state === 'READY'));
assert(report.methodRows.every((row) => row.requirements.length > 0), 'zero-step method receipt');

const commonInput = sealCommonEnrichedPipingInput({
  request,
  report,
  confirmation: confirmation(false, []),
});
assert.equal(commonInput.schema, 'common-enriched-piping-input/v1');
assert.equal(commonInput.packageState, 'READY');
assert.equal(commonInput.sealedMethodIds.length, NON_FEA_COMMON_METHOD_IDS.length);
assert.deepEqual(assertCommonInputMethodPartition(commonInput), {
  valid: true,
  ready: [...NON_FEA_COMMON_METHOD_IDS].sort(),
  blocked: [],
});
assert.equal(JSON.stringify(sourceModel), sourceBefore, 'source model was mutated by checker or seal');

const artifactA = createEnrichedStagedJsonExport(commonInput);
const artifactB = createEnrichedStagedJsonExport(commonInput);
assert.equal(artifactA.text, artifactB.text, 'staged JSON must be byte deterministic');
assert.equal(artifactA.semanticHash, artifactB.semanticHash, 'staged artifact hash must be deterministic');
assert.doesNotThrow(() => assertCanonicalStagedJsonText(artifactA.text));
const reimported = reimportEnrichedStagedJsonExport(artifactA.text);
assert.equal(reimported.commonInput.semanticHash, commonInput.semanticHash, 're-import changed common-input identity');
assert.deepEqual(reimported.commonInput, commonInput, 're-import changed common-input content');

const noncanonical = JSON.stringify(JSON.parse(artifactA.text));
assert.throws(
  () => assertCanonicalStagedJsonText(noncanonical),
  /not the deterministic canonical artifact/u,
  'semantically equivalent noncanonical JSON must not be accepted as the deterministic artifact',
);

const currentBindings = bindings(commonInput);
const current = assessCommonInputStaleness(commonInput, currentBindings);
assert.equal(current.stale, false);
const stale = assessCommonInputStaleness(commonInput, {
  ...currentBindings,
  projectDataProfileSemanticHash: semanticHash({ changed: true }),
});
assert.equal(stale.stale, true);
assert(stale.changes.some((row) => row.path === 'projectDataProfileSemanticHash'));

assert.throws(
  () => requireCommonEnrichedPipingInput({ ...commonInput, blockedMethodIds: ['SUSTAINED_STRESS'] }),
  /hash is stale/u,
  'tampered common input must fail',
);
assert.throws(
  () => assertCommonInputMethodPartition({
    ...commonInput,
    blockedMethodIds: [commonInput.sealedMethodIds[0]],
  }),
  /both sealed and blocked/u,
);

const tamperedExport = JSON.parse(artifactA.text);
tamperedExport.commonInput.projectDataProfile.projectId = 'TAMPERED';
assert.throws(
  () => reimportEnrichedStagedJsonExport(JSON.stringify(tamperedExport)),
  /export hash is stale/u,
  'tampered staged JSON must fail',
);

const tamperedLedger = {
  ...request.resolutionLedger,
  rows: request.resolutionLedger.rows.map((row, index) => (
    index === 0 ? { ...row, status: 'TAMPERED' } : row
  )),
};
assert.throws(
  () => assertCommonCheckerDependencyIntegrity({
    enrichmentSidecar: request.enrichmentSidecar,
    resolutionLedger: tamperedLedger,
    enrichedProjection: request.enrichedProjection,
    configuredDefaultUsageLedger: request.configuredDefaultUsageLedger,
  }),
  /semantic hash is invalid/u,
  'tampered dependency must fail before checker evaluation',
);

checkPartialSeal();
checkMissingEvidenceDoesNotBecomeZero();
checkExplicitZeroRemainsEvidence();
checkWorkspaceStatusProjection();

console.log(JSON.stringify({
  phase: 4,
  fullPackage: report.packageState,
  readyMethods: report.readyMethodIds.length,
  deterministicRequest: true,
  dependencyIntegrityVerified: true,
  commonMethodPartitionVerified: true,
  zeroStepReceiptProhibited: true,
  explicitPartialAcceptance: true,
  missingToZeroProhibited: true,
  explicitZeroRetained: true,
  sourceImmutable: true,
  sealMutationRejected: true,
  staleLineageDetected: true,
  exportByteDeterministic: true,
  canonicalExportRequired: true,
  reimportEquivalent: true,
  workspaceStatusProjection: 'non-fea-workspace-status-projection/v1',
  workspaceStatusReadOnly: true,
  workspaceStatusEightGates: true,
}, null, 2));

function checkPartialSeal() {
  const blockedProfile = structuredClone(fullProfile);
  blockedProfile.thermoMechanicalBasis.stressCodeBasis = evidence(null, false);
  const partialRequest = createRequest({
    projectDataProfile: blockedProfile,
    qualificationProfile,
    requestedMethods: ['WEIGHT_AND_GRAVITY', 'SUSTAINED_STRESS', 'ENRICHED_STAGED_JSON_EXPORT'],
  });
  const partialReport = runPreFeaPipingCheck(partialRequest);
  assert.equal(partialReport.packageState, 'PARTIALLY_READY');
  assert(partialReport.readyMethodIds.includes('WEIGHT_AND_GRAVITY'));
  assert(partialReport.blockedMethodIds.includes('SUSTAINED_STRESS'));
  assert.throws(() => sealCommonEnrichedPipingInput({
    request: partialRequest,
    report: partialReport,
    confirmation: confirmation(false, partialReport.blockedMethodIds),
  }), /partial acceptance/u);
  assert.throws(() => sealCommonEnrichedPipingInput({
    request: partialRequest,
    report: partialReport,
    confirmation: confirmation(true, []),
  }), /acknowledgement/u);
  const sealed = sealCommonEnrichedPipingInput({
    request: partialRequest,
    report: partialReport,
    confirmation: confirmation(true, partialReport.blockedMethodIds),
  });
  assert.equal(sealed.packageState, 'PARTIALLY_READY');
  assert.deepEqual(sealed.blockedMethodIds, partialReport.blockedMethodIds);
  assert.doesNotThrow(() => assertCommonInputMethodPartition(sealed));
}

function checkMissingEvidenceDoesNotBecomeZero() {
  const missingModel = structuredClone(sourceModel);
  delete missingModel.components[0].engineeringProperties.fluidWeightOpeKgPerM;
  const rebuilt = rebuildSharedModel(missingModel);
  const localEnrichment = buildEnrichment(rebuilt);
  const missingRequest = createRequest({
    sourceModel: rebuilt,
    enrichment: localEnrichment,
    projectDataProfile: fullProfile,
    qualificationProfile,
    requestedMethods: ['WEIGHT_AND_GRAVITY'],
    requestedLoadCases: ['OPE'],
  });
  const missingReport = runPreFeaPipingCheck(missingRequest);
  assert.equal(missingReport.packageState, 'BLOCKED');
  assert(missingReport.blockers.some((row) => row.code === 'MASS_COVERAGE_INCOMPLETE'));
}

function checkExplicitZeroRemainsEvidence() {
  const zeroModel = structuredClone(sourceModel);
  zeroModel.components[0].engineeringProperties.fluidWeightOpeKgPerM.value = 0;
  const rebuilt = rebuildSharedModel(zeroModel);
  const localEnrichment = buildEnrichment(rebuilt);
  const zeroRequest = createRequest({
    sourceModel: rebuilt,
    enrichment: localEnrichment,
    projectDataProfile: fullProfile,
    qualificationProfile,
    requestedMethods: ['WEIGHT_AND_GRAVITY'],
    requestedLoadCases: ['OPE'],
  });
  const zeroReport = runPreFeaPipingCheck(zeroRequest);
  assert.equal(zeroReport.packageState, 'READY', zeroReport.blockers.map((row) => row.message).join('\n'));
}

function checkWorkspaceStatusProjection() {
  const base = {
    source: {
      workspaceState: 'ready',
      datasetId: sourceModel.project.datasetId,
      sourceDatasetSha256: request.sourceDatasetSha256,
      sourceModelSemanticHash: sourceModel.semanticHash,
    },
    topology: {
      supportSiteStatus: 'READY',
      supportSiteSemanticHash: request.authorityContracts.supportSiteModel.semanticHash,
      supportSiteCount: 2,
      routePartitionStatus: 'READY',
      routePartitionSemanticHash: request.authorityContracts.routePartitionModel.semanticHash,
      routeCount: 1,
    },
    projectData: {
      revision: fullProfile.revision,
      profileSemanticHash: semanticHash(fullProfile),
      originKind: 'SIMULATED',
      originSource: 'non-fea-common-checker-check',
      audits: {
        normalization: { valid: true, errorCodes: [] },
        topology: { valid: true, errorCodes: [] },
        loads: { valid: true, errorCodes: [] },
      },
    },
    masters: [
      { masterKey: 'lineList', required: true, rowCount: 1, sourceHash: 'line-list-hash' },
      { masterKey: 'pipingClass', required: true, rowCount: 1, sourceHash: 'piping-class-hash' },
      { masterKey: 'weight', required: true, rowCount: 1, sourceHash: 'weight-hash' },
      { masterKey: 'materialMap', required: false, rowCount: 0, sourceHash: null },
    ],
    enrichment: {
      currentSourceSemanticHash: sourceModel.semanticHash,
      boundSourceSemanticHash: sourceModel.semanticHash,
      stale: false,
      proposalCount: 0,
      acceptedRecordCount: enrichment.sidecar.records.length,
      migrationBlockerCodes: [],
    },
    commonInput: {
      requestedMethodIds: request.requestedMethods,
      requestedLoadCaseIds: request.requestedLoadCases,
      error: null,
      reportPackageState: report.packageState,
      reportSemanticHash: report.semanticHash,
      candidateSemanticHash: report.candidateSemanticHash,
      readyMethodIds: report.readyMethodIds,
      blockedMethodIds: report.blockedMethodIds,
      methodRows: report.methodRows.map((row) => ({ methodId: row.methodId, state: row.state, blockerCodes: row.blockers.map((blocker) => blocker.code) })),
      requestSourceModelSemanticHash: request.sourceModel.semanticHash,
      requestResolutionLedgerStatus: request.resolutionLedger.status,
      requestResolutionLedgerSemanticHash: request.resolutionLedger.semanticHash,
      requestEnrichmentSidecarSemanticHash: request.enrichmentSidecar.semanticHash,
      requestQualificationProfileSemanticHash: request.qualificationProfile.semanticHash,
      commonInputPackageState: null,
      commonInputSemanticHash: null,
      sealedMethodIds: [],
      commonInputStale: false,
      stalenessCodes: [],
      exportSemanticHash: null,
      authorizationReceiptCount: 0,
      executionReceiptCount: 0,
    },
    implementation: {
      registrySemanticHash: 'fnv1a64:aaaaaaaaaaaaaaaa',
      implementations: [
        { implementationId: 'COMMON_INPUT_EXPORT_V1', runtimeState: 'INTRINSIC', qualificationState: 'QUALIFIED', commonMethodIds: ['ENRICHED_STAGED_JSON_EXPORT'] },
      ],
    },
    execution: {
      empiricalScenarioState: 'NOT_EVALUATED',
      empiricalAuthorizationState: 'NOT_AUTHORIZED',
      empiricalAuthorizationReasonCode: 'COMMON_INPUT_REQUIRED',
    },
  };
  const status = createNonFeaWorkspaceStatusProjection(base);
  const reorderedStatus = createNonFeaWorkspaceStatusProjection({
    ...base,
    masters: [...base.masters].reverse(),
    commonInput: {
      ...base.commonInput,
      requestedMethodIds: [...base.commonInput.requestedMethodIds].reverse(),
      readyMethodIds: [...base.commonInput.readyMethodIds].reverse(),
      methodRows: [...base.commonInput.methodRows].reverse(),
    },
  });
  assert.equal(status.semanticHash, reorderedStatus.semanticHash, 'workspace status projection must be deterministic');
  assert.equal(status.gates.length, 8);
  assert.equal(status.lifecycleState, 'READY_FOR_SEAL');
  assert.equal(status.policy.readOnly, true);
  assert.equal(status.policy.engineeringAuthority, false);
  assert.equal(status.policy.sealingAuthority, false);
  assert.equal(status.policy.authorizationAuthority, false);
  assert.equal(status.policy.executionAuthority, false);
  assert.equal(status.policy.implementationQualificationIsInputReadiness, false);
  assert.equal(validateNonFeaWorkspaceStatusProjection(status), status);
  assert.ok(Object.isFrozen(status));

  const staleStatus = createNonFeaWorkspaceStatusProjection({
    ...base,
    commonInput: {
      ...base.commonInput,
      commonInputPackageState: commonInput.packageState,
      commonInputSemanticHash: commonInput.semanticHash,
      sealedMethodIds: commonInput.sealedMethodIds,
      commonInputStale: true,
      stalenessCodes: ['PROJECT_DATA_CHANGED'],
    },
  });
  assert.equal(staleStatus.overallState, 'STALE');
  assert.equal(staleStatus.lifecycleState, 'SEALED_STALE');
}

function createRequest(options) {
  const model = options.sourceModel || sourceModel;
  const localEnrichment = options.enrichment || enrichment;
  const configuredDefaultUsageLedger = usageLedger(options.projectDataProfile.revision);
  assertCommonCheckerDependencyIntegrity({
    enrichmentSidecar: localEnrichment.sidecar,
    resolutionLedger: localEnrichment.ledger,
    enrichedProjection: localEnrichment.projection,
    configuredDefaultUsageLedger,
  });
  return createPreFeaPipingCheckRequest({
    requestId: 'PRE-FEA:SIMULATED:FULL',
    sourceDatasetSha256: 'a'.repeat(64),
    requestedMethods: options.requestedMethods || NON_FEA_COMMON_METHOD_IDS,
    requestedLoadCases: options.requestedLoadCases || ['EMPTY', 'OPE', 'HYD'],
    sourceModel: model,
    enrichmentSidecar: localEnrichment.sidecar,
    resolutionLedger: localEnrichment.ledger,
    enrichedProjection: localEnrichment.projection,
    projectDataProfile: options.projectDataProfile,
    projectDataOrigin: { kind: 'SIMULATED', source: 'non-fea-common-checker-check' },
    authorityContracts: authorityContracts(fixture),
    qualificationProfile: options.qualificationProfile,
    configuredDefaultUsageLedger,
  });
}

function buildEnrichment(model) {
  const records = [
    record('OD', 'PIPE_OUTER_DIAMETER', 114.3, 'mm'),
    record('WT', 'PIPE_WALL_THICKNESS', 6.02, 'mm'),
    record('EI', 'FLEXURAL_RIGIDITY', 2500000, 'N*m2'),
  ];
  const sidecar = createNonFeaEnrichmentSidecar({ sourceSemanticHash: model.semanticHash, records });
  const ledger = resolveNonFeaEnrichment({ sourceModel: model, sidecar });
  assert.equal(ledger.status, 'READY', ledger.blockers.map((row) => row.message).join('\n'));
  const projection = createNonFeaEnrichedProjection({ sourceModel: model, resolutionLedger: ledger });
  return { sidecar, ledger, projection };
}

function record(recordId, fieldId, value, unit) {
  return createNonFeaEnrichmentRecord({
    recordId,
    selectorKind: 'ENTITY',
    selectorKey: 'COMP-1',
    fieldId,
    value,
    unit,
    authority: 'EXACT_APPROVED_MASTER',
    sourceId: 'SIMULATED-MASTER',
    revision: '1',
    evidence: { source: 'SIMULATED-MASTER', locator: recordId },
  });
}

function projectProfile() {
  return {
    schema: 'project-data-profile/v1',
    projectId: 'SIMULATED-PROJECT',
    revision: 4,
    updatedAt: '2026-08-06T00:00:00.000Z',
    loadCalculation: {
      gravityMPerS2: evidence(9.80665),
      activeLoadCases: evidence(['EMPTY', 'OPE', 'HYD']),
    },
    thermoMechanicalBasis: {
      installationTemperatureC: evidence(20),
      operatingTemperaturesC: evidence({ OPE: 120, HYD: 20 }),
      casePressuresPa: evidence({ OPE: 1000000, HYD: 1500000, EMPTY: 0 }),
      corrosionAllowancesMm: evidence({ DEFAULT: 1.5 }),
      materialElasticProperties: evidence({ DEFAULT: { elasticModulusMpa: 200000, thermalExpansionPerC: 0.000012 } }),
      stressCodeBasis: evidence({ code: 'B31.3', edition: 'SIMULATED' }),
      pressureBoundarySemantics: evidence({ method: 'CLOSED_END_EFFECTIVE_AREA' }),
    },
    restraintPolicy: {
      restraintStiffnessNPerM: evidence({ DEFAULT: 100000000 }),
      restraintGapsMm: evidence({ DEFAULT: 0 }),
      frictionCoefficients: evidence({ DEFAULT: 0.3 }),
      contactPolicy: evidence({ unilateral: true, liftOff: true }),
    },
    qualificationPolicy: {
      nonlinearApplicabilityPolicy: evidence({ allowed: true, domain: 'VERTICAL_PLANAR' }),
      superpositionPolicy: evidence({ permitted: false, explicitCombinedSolve: true }),
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

function evidence(value, approved = true) {
  return { value, evidence: { source: '[SIMULATED] qualification fixture' }, approved };
}

function authorityContracts(value) {
  return {
    topologyGraph: value.topologyGraph,
    supportAttachmentModel: value.attachmentModel,
    restraintCapabilityModel: value.restraintModel,
    supportSiteModel: contract('support-site-model/v1', 'READY', 1),
    routePartitionModel: contract('route-partition-model/v1', 'READY', 2),
    loadPrimitiveSet: value.modelLoads.loadPrimitiveSet,
  };
}

function contract(schema, status, identity) {
  const base = { schema, status, identity };
  return { ...base, semanticHash: semanticHash(base) };
}

function confirmation(acceptPartial, blockedMethods) {
  return {
    confirmationId: `CONFIRM:${acceptPartial ? 'PARTIAL' : 'FULL'}`,
    confirmedAt: '2026-08-06T00:00:00.000Z',
    confirmedBy: 'SIMULATED-REVIEWER',
    acceptPartial,
    acknowledgedBlockedMethods: blockedMethods,
    statement: 'Reviewed exact source, enrichment, method requirements and blocked scope.',
  };
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

function rebuildSharedModel(value) {
  return createSharedPipingModel({
    project: value.project,
    units: value.units,
    sourceSnapshotRef: value.sourceSnapshotRef,
    components: value.components,
    supports: value.supports,
    sourceReferences: value.sourceReferences,
    diagnostics: value.diagnostics,
  });
}
