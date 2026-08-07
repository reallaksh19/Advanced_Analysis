import assert from 'node:assert/strict';
import {
  assessMethodConsumptionStaleness,
  commonMethodsForImplementation,
  createCommonInputBoundMethodAuthorization,
  createCommonInputBoundMethodExecution,
  requireCommonInputBoundMethodAuthorization,
  requireCommonInputBoundMethodExecution,
} from '../src/core/non-fea-method-consumption/index.js';
import {
  createNonFeaResultPackageEnvelope,
  requireNonFeaResultPackageEnvelope,
  validateNonFeaResultPackageEnvelope,
} from '../src/core/non-fea-method-consumption/result-package.js';
import {
  createNonFeaAuthorityRevisionVector,
  createNonFeaImplementationBinding,
  createNonFeaImplementationRegistry,
} from '../src/core/non-fea-analysis-plan/index.js';
import {
  compileNonFeaMassLedger,
  createNonFeaEngineeringFoundationBundle,
  createNonFeaEngineeringFoundationHandoff,
  requiredFoundationCapabilitiesForImplementation,
  requireNonFeaEngineeringFoundationHandoff,
} from '../src/core/non-fea-engineering-foundation/index.js';
import {
  createNonFeaEnrichedProjection,
  createNonFeaEnrichmentRecord,
  createNonFeaEnrichmentSidecar,
  resolveNonFeaEnrichment,
} from '../src/core/non-fea-enrichment/index.js';
import {
  createPreFeaPipingCheckRequest,
  runPreFeaPipingCheck,
  sealCommonEnrichedPipingInput,
} from '../src/core/non-fea-common-checker/index.js';
import { buildVerticalLoadPathFoundation } from '../src/core/support-load-screening/index.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createNonFeaLoadCaseAuthority } from '../src/workspace/project-data/non-fea-load-case-authority.js';
import { buildStraightFixture } from './w10.5-screening-fixtures.mjs';

const fixture = buildStraightFixture({
  lengthsM: [2],
  pipeMassKgM: 10,
  opeFluidKgM: 2,
  hydFluidKgM: 3,
});
const beamMethodIds = [
  'WEIGHT_AND_GRAVITY',
  'SUSTAINED_REACTIONS',
  'SUSTAINED_MEMBER_ACTIONS',
  'VERTICAL_CONTACT',
];
const commonInput = buildCommonInput(beamMethodIds, 'COMMON-A');
const beamFoundation = buildFoundation(commonInput);
const beamHandoff = createNonFeaEngineeringFoundationHandoff({
  implementationId: 'EMPIRICAL_BEAM_CONTACT_V1',
  commonInput,
  foundation: beamFoundation,
});

assert.deepEqual(
  commonMethodsForImplementation('CHAINAGE_TRIBUTARY_SPAN_V2'),
  ['WEIGHT_AND_GRAVITY', 'SUSTAINED_REACTIONS'],
);
assert.deepEqual(
  commonMethodsForImplementation('EMPIRICAL_BEAM_CONTACT_V1'),
  beamMethodIds,
);
assert.deepEqual(
  commonMethodsForImplementation('EMPIRICAL_RESTRAINT_NETWORK_V2'),
  ['THERMAL_FREE_DISPLACEMENT', 'RESTRAINT_REACTIONS'],
  'future implementation mapping is declarative and does not register the runtime',
);
assert.throws(
  () => commonMethodsForImplementation('UNKNOWN_EMPIRICAL_METHOD'),
  /No common-input method binding/u,
);
assert.equal(beamHandoff.commonInputSemanticHash, commonInput.semanticHash);
assert.equal(beamHandoff.engineeringFoundationSemanticHash, beamFoundation.semanticHash);
assert.deepEqual(
  beamHandoff.requiredCapabilityIds,
  requiredFoundationCapabilitiesForImplementation('EMPIRICAL_BEAM_CONTACT_V1'),
);
assert.equal(beamHandoff.requiredCapabilityIds.length, 9);

const beamBindings = bindingsFor('EMPIRICAL_BEAM_CONTACT_V1', 'QUALIFIED_RESTRICTED_DOMAIN');
const authorization = createCommonInputBoundMethodAuthorization({
  authorizationId: 'AUTH:SIMULATED',
  authorizedAt: '2026-08-06T00:00:00.000Z',
  implementationId: 'EMPIRICAL_BEAM_CONTACT_V1',
  scenarioId: 'SCENARIO:SIMULATED',
  methodRequestSemanticHash: semanticHash({ request: 'SIMULATED' }),
  implementationBindings: beamBindings,
  engineeringFoundationHandoff: beamHandoff,
  commonInput,
});
assert.equal(authorization.commonInputSemanticHash, commonInput.semanticHash);
assert.equal(authorization.implementationId, 'EMPIRICAL_BEAM_CONTACT_V1');
assert.equal(authorization.empiricalMethodId, authorization.implementationId);
assert.equal(authorization.policy.autoExecution, false);
assert.equal(authorization.policy.geometryMutationPermitted, false);
assert.equal(authorization.policy.qualifiedImplementationRequired, true);
assert.equal(authorization.policy.engineeringFoundationRequired, true);
assert.deepEqual(
  authorization.requiredCommonMethodIds,
  commonMethodsForImplementation('EMPIRICAL_BEAM_CONTACT_V1'),
);
assert.equal(
  authorization.authorityRevisionVectorSemanticHash,
  createNonFeaAuthorityRevisionVector(commonInput).semanticHash,
);
assert.equal(
  authorization.engineeringFoundationCapabilityBindingSemanticHash,
  beamHandoff.capabilityBindingSemanticHash,
);

const simulatedResultBase = {
  schema: 'simulated-empirical-beam-contact-result/v1',
  method: 'EMPIRICAL_BEAM_CONTACT_V1',
  executionId: 'EXEC:SIMULATED',
  executedAt: '2026-08-06T00:01:00.000Z',
  status: 'CALCULATED',
  loadCases: [{ loadCaseId: 'W-HOT', status: 'CALCULATED' }],
  evidence: { fixture: 'non-fea-method-consumption-check' },
};
const simulatedResult = {
  ...simulatedResultBase,
  semanticHash: semanticHash(simulatedResultBase),
};
const simulatedEngineExecutionBase = {
  schema: 'simulated-authorized-empirical-execution/v1',
  method: 'EMPIRICAL_BEAM_CONTACT_V1',
  executionId: 'EXEC:SIMULATED',
  executedAt: '2026-08-06T00:01:00.000Z',
  coreResultSemanticHash: simulatedResult.semanticHash,
};
const simulatedEngineExecution = {
  ...simulatedEngineExecutionBase,
  semanticHash: semanticHash(simulatedEngineExecutionBase),
};

const execution = createCommonInputBoundMethodExecution({
  executionId: 'EXEC:SIMULATED',
  executedAt: '2026-08-06T00:01:00.000Z',
  authorization,
  commonInput,
  engineeringFoundationHandoff: beamHandoff,
  engineExecutionSemanticHash: simulatedEngineExecution.semanticHash,
  resultSemanticHash: simulatedResult.semanticHash,
  status: 'CALCULATED',
});
assert.equal(execution.authorizationSemanticHash, authorization.semanticHash);
assert.equal(execution.commonInputSemanticHash, commonInput.semanticHash);
assert.equal(execution.implementationBindingSemanticHash, authorization.implementationBindingSemanticHash);
assert.equal(
  execution.engineeringFoundationCapabilityBindingSemanticHash,
  authorization.engineeringFoundationCapabilityBindingSemanticHash,
);

// Wave 15: retain method-specific payloads verbatim inside one common custody envelope.
const resultPackage = createNonFeaResultPackageEnvelope({
  packageId: 'RESULT-PACKAGE:SIMULATED',
  packagedAt: '2026-08-06T00:02:00.000Z',
  executionReceipt: execution,
  engineExecution: simulatedEngineExecution,
  resultPayload: simulatedResult,
  resultClassIds: ['VERTICAL_SCREENING_RESULT'],
  loadCaseIds: ['W-HOT'],
  preparationBindings: [{
    kind: 'ANALYSIS_TOPOLOGY',
    semanticHash: semanticHash({ topology: 'SIMULATED' }),
  }],
  limitations: ['SIMULATED_TEST_RESULT'],
});
const resultPackageAgain = createNonFeaResultPackageEnvelope({
  packageId: 'RESULT-PACKAGE:SIMULATED',
  packagedAt: '2026-08-06T00:02:00.000Z',
  executionReceipt: execution,
  engineExecution: simulatedEngineExecution,
  resultPayload: simulatedResult,
  resultClassIds: ['VERTICAL_SCREENING_RESULT'],
  loadCaseIds: ['W-HOT'],
  preparationBindings: [{
    kind: 'ANALYSIS_TOPOLOGY',
    semanticHash: semanticHash({ topology: 'SIMULATED' }),
  }],
  limitations: ['SIMULATED_TEST_RESULT'],
});
assert.equal(validateNonFeaResultPackageEnvelope(resultPackage).ok, true);
assert.equal(resultPackage.semanticHash, resultPackageAgain.semanticHash, 'result package must be deterministic');
assert.equal(resultPackage.executionReceiptSemanticHash, execution.semanticHash);
assert.equal(resultPackage.authorizationSemanticHash, execution.authorizationSemanticHash);
assert.equal(resultPackage.commonInputSemanticHash, execution.commonInputSemanticHash);
assert.equal(
  resultPackage.authorityRevisionVectorSemanticHash,
  execution.authorityRevisionVectorSemanticHash,
);
assert.equal(
  resultPackage.engineeringFoundationCapabilityBindingSemanticHash,
  execution.engineeringFoundationCapabilityBindingSemanticHash,
);
assert.deepEqual(resultPackage.engineExecution, simulatedEngineExecution);
assert.deepEqual(resultPackage.resultPayload, simulatedResult);
assert.deepEqual(resultPackage.resultDescriptor.resultClassIds, ['VERTICAL_SCREENING_RESULT']);
assert.deepEqual(resultPackage.resultDescriptor.loadCaseIds, ['W-HOT']);
assert.equal(resultPackage.policy.currentnessAssessmentRequiredBeforeReuse, true);
assert.equal(resultPackage.policy.resultSchemaTranslationPermitted, false);
assert.equal(resultPackage.policy.envelopeCalculationAuthority, false);
assert.equal(resultPackage.policy.envelopeAuthorizationAuthority, false);
assert.equal(resultPackage.policy.envelopeExecutionAuthority, false);
assert.equal(resultPackage.policy.geometryMutationPermitted, false);

assert.throws(() => createNonFeaResultPackageEnvelope({
  packageId: 'RESULT-PACKAGE:TAMPERED-PAYLOAD',
  packagedAt: '2026-08-06T00:02:00.000Z',
  executionReceipt: execution,
  engineExecution: simulatedEngineExecution,
  resultPayload: { ...simulatedResult, status: 'BLOCKED' },
  resultClassIds: ['VERTICAL_SCREENING_RESULT'],
  loadCaseIds: ['W-HOT'],
}), /semantic hash is stale/u);
const wrongEngineBase = {
  ...simulatedEngineExecutionBase,
  executionId: 'EXEC:OTHER',
};
const wrongEngine = { ...wrongEngineBase, semanticHash: semanticHash(wrongEngineBase) };
assert.throws(() => createNonFeaResultPackageEnvelope({
  packageId: 'RESULT-PACKAGE:WRONG-EXECUTION',
  packagedAt: '2026-08-06T00:02:00.000Z',
  executionReceipt: execution,
  engineExecution: wrongEngine,
  resultPayload: simulatedResult,
  resultClassIds: ['VERTICAL_SCREENING_RESULT'],
  loadCaseIds: ['W-HOT'],
}), /executionId differs/u);
const mismatchedDescriptor = structuredClone(resultPackage);
delete mismatchedDescriptor.semanticHash;
mismatchedDescriptor.resultDescriptor.loadCaseIds = ['OPE'];
mismatchedDescriptor.semanticHash = semanticHash(mismatchedDescriptor);
assert.throws(
  () => requireNonFeaResultPackageEnvelope(mismatchedDescriptor),
  /loadCaseIds differ/u,
);

assert.equal(
  assessMethodConsumptionStaleness(authorization, commonInput, beamHandoff).stale,
  false,
);
assert.equal(
  assessMethodConsumptionStaleness(execution, commonInput, beamHandoff).stale,
  false,
);
const missingFoundationFreshness = assessMethodConsumptionStaleness(
  authorization,
  commonInput,
);
assert.equal(missingFoundationFreshness.stale, true);
assert(missingFoundationFreshness.changes.some(
  (row) => row.code === 'METHOD_ENGINEERING_FOUNDATION_UNAVAILABLE',
));

const driftedBeamFoundation = buildFoundation(commonInput, {
  profileOptions: { absoluteToleranceN: 1e-7 },
});
const driftedBeamHandoff = createNonFeaEngineeringFoundationHandoff({
  implementationId: 'EMPIRICAL_BEAM_CONTACT_V1',
  commonInput,
  foundation: driftedBeamFoundation,
});
const foundationStale = assessMethodConsumptionStaleness(
  authorization,
  commonInput,
  driftedBeamHandoff,
);
assert.equal(foundationStale.stale, true);
assert(foundationStale.changes.some((row) => row.code === 'METHOD_ENGINEERING_FOUNDATION_CHANGED'));

const mismatchedAuthorityFoundation = buildFoundation(commonInput, {
  supportSiteModel: contract('support-site-model/v1', 'READY', 999),
});
assert.throws(
  () => createNonFeaEngineeringFoundationHandoff({
    implementationId: 'EMPIRICAL_BEAM_CONTACT_V1',
    commonInput,
    foundation: mismatchedAuthorityFoundation,
  }),
  /not current\/ready/u,
);

const networkCommonInput = buildCommonInput(
  ['THERMAL_FREE_DISPLACEMENT', 'RESTRAINT_REACTIONS'],
  'NETWORK-A',
);
const networkFoundation = buildFoundation(networkCommonInput);
const networkHandoff = createNonFeaEngineeringFoundationHandoff({
  implementationId: 'EMPIRICAL_RESTRAINT_NETWORK_V2',
  commonInput: networkCommonInput,
  foundation: networkFoundation,
});
const networkMassBlockedFoundation = buildFoundation(networkCommonInput, { massLedger: null });
const networkMassBlockedHandoff = createNonFeaEngineeringFoundationHandoff({
  implementationId: 'EMPIRICAL_RESTRAINT_NETWORK_V2',
  commonInput: networkCommonInput,
  foundation: networkMassBlockedFoundation,
});
assert.equal(networkMassBlockedFoundation.bundleState, 'PARTIALLY_READY');
assert.equal(
  networkMassBlockedHandoff.capabilityBindingSemanticHash,
  networkHandoff.capabilityBindingSemanticHash,
  'irrelevant mass capability changes must not invalidate restraint-network handoff',
);
assert.equal(
  requiredFoundationCapabilitiesForImplementation('EMPIRICAL_RESTRAINT_NETWORK_V2')
    .includes('MASS_LEDGER'),
  false,
);

const resealed = buildCommonInput(beamMethodIds, 'COMMON-B');
const resealedHandoff = createNonFeaEngineeringFoundationHandoff({
  implementationId: 'EMPIRICAL_BEAM_CONTACT_V1',
  commonInput: resealed,
  foundation: buildFoundation(resealed),
});
const staleAuthorization = assessMethodConsumptionStaleness(
  authorization,
  resealed,
  resealedHandoff,
);
assert.equal(staleAuthorization.stale, true);
assert(staleAuthorization.changes.some((row) => [
  'METHOD_COMMON_INPUT_RESEALED',
  'NON_FEA_AUTHORITY_REVISION_CHANGED',
].includes(row.code)));

const weightOnly = buildCommonInput(['WEIGHT_AND_GRAVITY'], 'WEIGHT-ONLY');
assert.throws(() => createCommonInputBoundMethodAuthorization({
  authorizationId: 'AUTH:BLOCKED',
  authorizedAt: '2026-08-06T00:00:00.000Z',
  implementationId: 'CHAINAGE_TRIBUTARY_SPAN_V2',
  scenarioId: 'SCENARIO:BLOCKED',
  methodRequestSemanticHash: semanticHash({ request: 'BLOCKED' }),
  implementationBindings: bindingsFor('CHAINAGE_TRIBUTARY_SPAN_V2', 'QUALIFIED'),
  commonInput: weightOnly,
}), /not sealed for SUSTAINED_REACTIONS/u);

assert.throws(
  () => requireCommonInputBoundMethodAuthorization({ ...authorization, scenarioId: 'TAMPERED' }),
  /hash is stale/u,
);
assert.throws(
  () => requireCommonInputBoundMethodExecution({ ...execution, status: 'TAMPERED' }),
  /hash is stale/u,
);
assert.throws(
  () => requireNonFeaEngineeringFoundationHandoff({
    ...beamHandoff,
    engineeringFoundationSemanticHash: semanticHash({ tampered: true }),
  }),
  /handoff hash is stale/u,
);
assert.throws(() => createCommonInputBoundMethodExecution({
  executionId: 'EXEC:WRONG-COMMON',
  executedAt: '2026-08-06T00:01:00.000Z',
  authorization,
  commonInput: resealed,
  engineeringFoundationHandoff: resealedHandoff,
  engineExecutionSemanticHash: semanticHash({ engine: 'SIMULATED' }),
  resultSemanticHash: null,
  status: 'CALCULATED',
}), /stale against the current engineering authority/u);

const scenarioControllerSource = await read('../src/workspace/engineering-loads/empirical-load-calc-scenario-controller.js');
const authorizedConsumerSource = await read('../src/workspace/enrichment/authorized-enrichment-consumer-controller.js');
const coordinatorSource = await read('../src/workspace/non-fea-method-execution-coordinator.js');
const runtimeCompositionSource = await read('../src/workspace/enrichment/authorized-enrichment-runtime.js');
const bootstrapSource = await read('../src/workspace/bootstrap.js');
const layoutSource = await read('../src/workspace/workspace-layout.js');
const resultPackageSource = await read('../src/core/non-fea-method-consumption/result-package.js');

for (const source of [scenarioControllerSource, authorizedConsumerSource]) {
  assert.match(source, /non-fea-method-execution-coordinator/u);
  assert.doesNotMatch(source, /createCommonInputBoundMethodAuthorization/u);
  assert.doesNotMatch(source, /createCommonInputBoundMethodExecution/u);
  assert.doesNotMatch(source, /assessMethodConsumptionStaleness/u);
}
assert.match(coordinatorSource, /createCommonInputBoundMethodAuthorization/u);
assert.match(coordinatorSource, /createCommonInputBoundMethodExecution/u);
assert.match(coordinatorSource, /assessMethodConsumptionStaleness/u);
assert.match(coordinatorSource, /requireCurrentNonFeaImplementationBindings/u);
assert.match(coordinatorSource, /buildCurrentNonFeaEngineeringFoundation/u);
assert.match(coordinatorSource, /createNonFeaEngineeringFoundationHandoff/u);
assert.doesNotMatch(coordinatorSource, /linear-fea|lafea|lfea|shell|continuum|solver/u);
assert.match(runtimeCompositionSource, /commonInputStore: nonFeaCommonInputStore/u);
assert.doesNotMatch(bootstrapSource, /FirstCutWorkbenchController|FirstCutWorkbenchLauncherController/u);
assert.doesNotMatch(layoutSource, /first-cut-workbench-root|First-Cut Load Enrichment/u);
assert.match(bootstrapSource, /getFirstCutCalculationPackage/u, 'historical results remain readable');
assert.doesNotMatch(
  resultPackageSource,
  /workspace|engineering-loads|linear-fea|lafea|lfea|solver|continuum/iu,
  'common result package must remain runtime-neutral and Non-FEA only',
);

console.log(JSON.stringify({
  phase: 'architecture-wave-15',
  authorizationBoundToCommonInput: true,
  authorizationBoundToQualifiedImplementation: true,
  authorityRevisionVectorBound: true,
  engineeringFoundationBound: true,
  engineeringFoundationDriftDetected: true,
  methodSpecificFoundationCapabilities: true,
  executionBoundToAuthorizationAndCommonInput: true,
  commonResultPackageEnvelope: true,
  methodPayloadPreservedVerbatim: true,
  resultPackageCurrentnessNotImplied: true,
  resultSchemaTranslationPermitted: false,
  resultPackageCalculationAuthority: false,
  staleHistoryDetected: true,
  missingSealedMethodBlocked: true,
  tamperingRejected: true,
  geometryMutationPermitted: false,
  autoExecution: false,
  unifiedExecutionCoordinator: true,
  activeFirstCutWorkbenchMounted: false,
  historicalFirstCutResultsReadable: true,
}, null, 2));

function bindingsFor(implementationId, qualificationState) {
  const commonMethodIds = commonMethodsForImplementation(implementationId);
  const registry = createNonFeaImplementationRegistry([{
    implementationId,
    commonMethodIds,
    runtimeState: 'REGISTERED',
    qualificationState,
    purpose: 'SIMULATED_METHOD_CONSUMPTION_CHECK',
    qualificationProfileId: null,
    qualificationProfileSemanticHash: null,
    sourceRegistry: 'SIMULATED',
  }]);
  return commonMethodIds.map((commonMethodId) => createNonFeaImplementationBinding({
    commonMethodId,
    implementationId,
    implementationRegistrySemanticHash: registry.semanticHash,
    runtimeState: 'REGISTERED',
    qualificationState,
    qualificationProfileId: null,
    qualificationProfileSemanticHash: null,
    purpose: 'SIMULATED_METHOD_CONSUMPTION_CHECK',
    selection: 'EXPLICIT',
  }));
}

function buildFoundation(commonInputValue, overrides = {}) {
  const loadCaseAuthority = createNonFeaLoadCaseAuthority(commonInputValue.projectDataProfile);
  const massLedger = Object.hasOwn(overrides, 'massLedger')
    ? overrides.massLedger
    : compileNonFeaMassLedger({
      sourceSemanticHash: commonInputValue.sourceModelSemanticHash,
      enrichmentProjectionSemanticHash: commonInputValue.enrichedProjectionSemanticHash,
      modelLoadFoundation: fixture.modelLoads,
    });
  const pathFoundation = buildVerticalLoadPathFoundation({
    sharedModel: fixture.sharedModel,
    topologyGraph: fixture.topologyGraph,
    attachmentModel: fixture.attachmentModel,
    restraintModel: fixture.restraintModel,
    loadFoundation: fixture.modelLoads,
  }, {
    profileOptions: overrides.profileOptions,
  });
  return createNonFeaEngineeringFoundationBundle({
    sourceModelSemanticHash: commonInputValue.sourceModelSemanticHash,
    enrichmentProjectionSemanticHash: commonInputValue.enrichedProjectionSemanticHash,
    projectDataRevision: commonInputValue.projectDataProfile.revision,
    loadCaseAuthority,
    modelLoadFoundation: fixture.modelLoads,
    massLedger,
    topologyGraph: fixture.topologyGraph,
    supportAttachmentModel: fixture.attachmentModel,
    restraintCapabilityModel: fixture.restraintModel,
    supportSiteModel: overrides.supportSiteModel || commonInputValue.authorityContracts.supportSiteModel,
    routePartitionModel: commonInputValue.authorityContracts.routePartitionModel,
    verticalLoadPathProfile: pathFoundation.profile,
    verticalLoadPathModel: pathFoundation.pathModel,
  });
}

function buildCommonInput(methodIds, confirmationId) {
  const model = fixture.sharedModel;
  const sidecar = createNonFeaEnrichmentSidecar({
    sourceSemanticHash: model.semanticHash,
    records: [
      record('OD', 'PIPE_OUTER_DIAMETER', 114.3, 'mm'),
      record('WT', 'PIPE_WALL_THICKNESS', 6.02, 'mm'),
      record('EI', 'FLEXURAL_RIGIDITY', 2500000, 'N*m2'),
    ],
  });
  const ledger = resolveNonFeaEnrichment({ sourceModel: model, sidecar });
  const projection = createNonFeaEnrichedProjection({ sourceModel: model, resolutionLedger: ledger });
  const projectDataProfile = profile();
  const qualificationProfile = {
    profileId: 'METHOD-CONSUMPTION',
    version: 1,
    methods: methodIds,
    qualification: 'QUALIFIED',
    locked: true,
    basis: { fixture: 'non-fea-method-consumption-check' },
  };
  const request = createPreFeaPipingCheckRequest({
    requestId: `PRE-FEA:${confirmationId}`,
    sourceDatasetSha256: 'b'.repeat(64),
    requestedMethods: methodIds,
    requestedLoadCases: ['EMPTY', 'OPE', 'HYD'],
    sourceModel: model,
    enrichmentSidecar: sidecar,
    resolutionLedger: ledger,
    enrichedProjection: projection,
    projectDataProfile,
    projectDataOrigin: { kind: 'SIMULATED', source: 'METHOD-CONSUMPTION-CHECK' },
    authorityContracts: {
      topologyGraph: fixture.topologyGraph,
      supportAttachmentModel: fixture.attachmentModel,
      restraintCapabilityModel: fixture.restraintModel,
      supportSiteModel: contract('support-site-model/v1', 'READY', 1),
      routePartitionModel: contract('route-partition-model/v1', 'READY', 2),
      loadPrimitiveSet: fixture.modelLoads.loadPrimitiveSet,
    },
    qualificationProfile,
    configuredDefaultUsageLedger: usageLedger(projectDataProfile.revision),
  });
  const report = runPreFeaPipingCheck(request);
  assert.equal(report.packageState, 'READY', report.blockers.map((row) => row.message).join('\n'));
  return sealCommonEnrichedPipingInput({
    request,
    report,
    confirmation: {
      confirmationId,
      confirmedAt: '2026-08-06T00:00:00.000Z',
      confirmedBy: 'SIMULATED-REVIEWER',
      acceptPartial: false,
      acknowledgedBlockedMethods: [],
      statement: 'Reviewed common-input method consumption fixture.',
    },
  });
}

function profile() {
  return {
    schema: 'project-data-profile/v1', projectId: 'SIMULATED-PROJECT', revision: 5,
    updatedAt: '2026-08-06T00:00:00.000Z',
    loadCalculation: { gravityMPerS2: evidence(9.80665), activeLoadCases: evidence(['EMPTY', 'OPE', 'HYD']) },
    thermoMechanicalBasis: {
      installationTemperatureC: evidence(20), operatingTemperaturesC: evidence({ OPE: 120 }),
      casePressuresPa: evidence({ EMPTY: 0, OPE: 1000000, HYD: 1500000 }),
      corrosionAllowancesMm: evidence({ DEFAULT: 1.5 }),
      materialElasticProperties: evidence({ DEFAULT: { elasticModulusMpa: 200000, thermalExpansionPerC: 0.000012 } }),
      stressCodeBasis: evidence({ code: 'B31.3' }), pressureBoundarySemantics: evidence({ method: 'CLOSED_END' }),
    },
    restraintPolicy: {
      restraintStiffnessNPerM: evidence({ DEFAULT: 100000000 }), restraintGapsMm: evidence({ DEFAULT: 0 }),
      frictionCoefficients: evidence({ DEFAULT: 0.3 }), contactPolicy: evidence({ unilateral: true }),
    },
    qualificationPolicy: {
      nonlinearApplicabilityPolicy: evidence({ domain: 'VERTICAL_PLANAR' }),
      superpositionPolicy: evidence({ explicitCombinedSolve: true }),
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
function record(recordId, fieldId, value, unit) {
  return createNonFeaEnrichmentRecord({
    recordId, selectorKind: 'ENTITY', selectorKey: 'COMP-1', fieldId, value, unit,
    authority: 'EXACT_APPROVED_MASTER', sourceId: 'SIMULATED-MASTER', revision: '1',
    evidence: { source: 'SIMULATED-MASTER', locator: recordId },
  });
}
function evidence(value) { return { value, evidence: { source: '[SIMULATED] fixture' }, approved: true }; }
function contract(schema, status, identity) {
  const base = { schema, status, identity };
  return { ...base, semanticHash: semanticHash(base) };
}
async function read(relativePath) {
  const { readFile } = await import('node:fs/promises');
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}
