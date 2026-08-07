import {
  createNonFeaAnalysisPlan,
  createNonFeaImplementationBinding,
  createNonFeaImplementationRegistry,
  evaluateNonFeaExecutionReadiness,
} from '../core/non-fea-analysis-plan/index.js';
import {
  evaluateNonFeaImplementationTopologyEligibility,
} from '../core/non-fea-analysis-plan/topology-eligibility.js';
import { createNonFeaWorkspaceStatusProjection } from '../core/non-fea-common-checker/workspace-status-projection.js';
import { commonMethodsForImplementation } from '../core/non-fea-method-consumption/index.js';
import { semanticHash } from '../core/shared-piping-model/index.js';
import { EMPIRICAL_METHOD_REGISTRY } from './engineering-loads/empirical-method-registry.js';
import { empiricalLoadCalcScenarioStore } from './engineering-loads/empirical-load-calc-scenario-store.js';
import { engineeringModelStore } from './engineering-model-store.js';
import { nonFeaEnrichmentStore } from './enrichment/non-fea-enrichment-store.js';
import { masterDataController } from './master-data-controller.js';
import { buildCurrentNonFeaAnalysisTopology } from './non-fea-engineering-foundation-runtime.js';
import { nonFeaCommonInputStore } from './non-fea-common-input-store.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { WorkspaceState } from './workspace-state.js';

const SPECIAL_IMPLEMENTATIONS = Object.freeze([
  Object.freeze({
    implementationId: 'AUTHORIZED_EMPIRICAL_SUPPORT_LOADS_V1',
    commonMethodIds: commonMethodsForImplementation('AUTHORIZED_EMPIRICAL_SUPPORT_LOADS_V1'),
    runtimeState: 'REGISTERED',
    qualificationState: 'QUALIFIED',
    purpose: 'AUTHORIZED_EXISTING_SUPPORT_LOAD_DISTRIBUTION',
    qualificationProfileId: null,
    qualificationProfileSemanticHash: null,
    sourceRegistry: 'authorized-enrichment-consumer/v2',
  }),
  Object.freeze({
    implementationId: 'COMMON_INPUT_EXPORT_V1',
    commonMethodIds: commonMethodsForImplementation('COMMON_INPUT_EXPORT_V1'),
    runtimeState: 'INTRINSIC',
    qualificationState: 'QUALIFIED',
    purpose: 'DETERMINISTIC_COMMON_INPUT_EXPORT',
    qualificationProfileId: null,
    qualificationProfileSemanticHash: null,
    sourceRegistry: 'non-fea-common-checker/v1',
  }),
]);

export function createCurrentNonFeaImplementationRegistry() {
  const empiricalRows = EMPIRICAL_METHOD_REGISTRY.methods.map((row) => ({
    implementationId: row.methodId,
    commonMethodIds: commonMethodsForImplementation(row.methodId),
    runtimeState: row.runtimeStatus === 'REGISTERED' ? 'REGISTERED' : 'NOT_REGISTERED',
    qualificationState: mapQualificationState(row.qualificationStatus),
    purpose: row.purpose,
    qualificationProfileId: null,
    qualificationProfileSemanticHash: null,
    sourceRegistry: EMPIRICAL_METHOD_REGISTRY.schema,
  }));
  return createNonFeaImplementationRegistry([...empiricalRows, ...SPECIAL_IMPLEMENTATIONS]);
}

export function requireCurrentNonFeaImplementationBindings(
  implementationId,
  requiredCommonMethodIds = commonMethodsForImplementation(implementationId),
) {
  const registry = createCurrentNonFeaImplementationRegistry();
  const row = registry.implementations.find((candidate) => candidate.implementationId === implementationId);
  if (!row) throw codedError(`Non-FEA implementation ${implementationId} is not registered in the implementation registry.`, 'NON_FEA_IMPLEMENTATION_BINDING_REQUIRED');
  if (!['REGISTERED', 'INTRINSIC'].includes(row.runtimeState)) {
    throw codedError(`Non-FEA implementation ${implementationId} is not registered for execution.`, 'NON_FEA_IMPLEMENTATION_NOT_REGISTERED');
  }
  if (!['QUALIFIED', 'QUALIFIED_RESTRICTED_DOMAIN'].includes(row.qualificationState)) {
    throw codedError(`Non-FEA implementation ${implementationId} is not qualified for execution.`, 'NON_FEA_IMPLEMENTATION_NOT_QUALIFIED');
  }
  const required = [...new Set(requiredCommonMethodIds)].sort(ascii);
  const missing = required.filter((methodId) => !row.commonMethodIds.includes(methodId));
  if (missing.length) {
    const error = codedError(
      `Implementation ${implementationId} does not implement ${missing.join(', ')}.`,
      'NON_FEA_IMPLEMENTATION_METHOD_COVERAGE_MISMATCH',
    );
    error.details = { implementationId, required, available: row.commonMethodIds, missing };
    throw error;
  }
  return required.map((commonMethodId) => createNonFeaImplementationBinding({
    commonMethodId,
    implementationId,
    implementationRegistrySemanticHash: registry.semanticHash,
    runtimeState: row.runtimeState,
    qualificationState: row.qualificationState,
    qualificationProfileId: row.qualificationProfileId,
    qualificationProfileSemanticHash: row.qualificationProfileSemanticHash,
    purpose: row.purpose,
    selection: 'EXPLICIT',
  }));
}

/**
 * Evaluates topology suitability independently from the common checker and
 * runtime qualification. This is a read-only selection aid; it does not alter
 * execution readiness or authorize a method.
 */
export function evaluateCurrentNonFeaTopologyEligibility() {
  const implementationRegistry = createCurrentNonFeaImplementationRegistry();
  const analysisTopology = buildCurrentNonFeaAnalysisTopology();
  const topologyEligibility = evaluateNonFeaImplementationTopologyEligibility({
    analysisTopology,
    implementationRegistry,
  });
  return Object.freeze({ analysisTopology, implementationRegistry, topologyEligibility });
}

export function evaluateCurrentNonFeaAnalysisPlan(options = {}) {
  const snapshot = nonFeaCommonInputStore.getSnapshot();
  const report = snapshot.report;
  if (!report) throw codedError('Evaluate the common checker before evaluating the analysis plan.', 'NON_FEA_ANALYSIS_PLAN_CHECKER_REQUIRED');
  const implementationRegistry = createCurrentNonFeaImplementationRegistry();
  const executionReadiness = evaluateNonFeaExecutionReadiness({
    report,
    implementationRegistry,
    selectedImplementations: options.selectedImplementations || {},
  });
  const configuration = snapshot.configuration;
  const analysisPlan = createNonFeaAnalysisPlan({
    planId: options.planId || `PLAN:${report.semanticHash}`,
    executionReadiness,
    requestedMethodIds: options.requestedMethodIds || configuration.requestedMethods,
    requestedLoadCaseIds: options.requestedLoadCases || configuration.requestedLoadCases,
    qualificationProfileSemanticHash: report.candidate?.qualificationProfileSemanticHash
      || snapshot.request?.qualificationProfile?.semanticHash
      || null,
  });
  return Object.freeze({ implementationRegistry, executionReadiness, analysisPlan });
}

/**
 * Composes one deterministic read-only status projection across the current
 * Non-FEA Load Calc workspace. Existing stores remain the sole owners of
 * engineering values, checker evaluation, sealing, authorization and execution.
 */
export function createCurrentNonFeaWorkspaceStatusProjection() {
  const workspace = WorkspaceState.getSnapshot();
  const dataset = workspace?.status === 'ready' ? workspace.dataset : null;
  const masters = masterDataController.getMasterData();
  const projectProfile = projectDataStore.getProfile();
  const projectOrigin = projectDataStore.getOrigin();
  const activeHashes = currentAuthorityHashes(dataset, masters);
  const common = nonFeaCommonInputStore.getSnapshot();
  const enrichment = nonFeaEnrichmentStore.getSnapshot();
  const supportSites = engineeringModelStore.getSupportSiteModel();
  const routes = engineeringModelStore.getRoutePartitionModel();
  const implementationRegistry = createCurrentNonFeaImplementationRegistry();
  const empiricalScenario = empiricalLoadCalcScenarioStore.getSnapshot();
  const empiricalAuthorization = engineeringModelStore.getEmpiricalAuthorizationState();

  return createNonFeaWorkspaceStatusProjection({
    source: {
      workspaceState: workspace?.status || 'empty',
      datasetId: dataset?.datasetId || null,
      sourceDatasetSha256: dataset?.sourceSha256 || null,
      sourceModelSemanticHash: dataset?.sharedModel?.semanticHash || null,
    },
    topology: {
      supportSiteStatus: supportSites?.status || null,
      supportSiteSemanticHash: authorityHash(supportSites),
      supportSiteCount: supportSites?.summary?.physicalLocationCount || 0,
      routePartitionStatus: routes?.status || null,
      routePartitionSemanticHash: authorityHash(routes),
      routeCount: routes?.summary?.routeCount || 0,
    },
    projectData: {
      revision: projectProfile?.revision ?? null,
      profileSemanticHash: projectDataStore.getSemanticHash(),
      originKind: projectOrigin?.kind || null,
      originSource: projectOrigin?.source || null,
      audits: Object.fromEntries(['normalization', 'topology', 'loads'].map((workflow) => {
        const audit = projectDataStore.validate(workflow, activeHashes);
        return [workflow, {
          valid: audit.valid === true,
          errorCodes: (audit.errors || []).map((row) => row.code || 'PROJECT_DATA_INVALID'),
        }];
      })),
    },
    masters: masterRows(masters),
    enrichment: {
      currentSourceSemanticHash: enrichment.currentSourceSemanticHash || null,
      boundSourceSemanticHash: enrichment.boundSourceSemanticHash || null,
      stale: enrichment.stale === true,
      proposalCount: enrichment.proposals?.length || 0,
      acceptedRecordCount: enrichment.acceptedRecords?.length || 0,
      migrationBlockerCodes: (enrichment.migrationReport?.blockers || []).map((row) => row.code || 'MIGRATION_BLOCKED'),
    },
    commonInput: commonInputStatus(common),
    implementation: {
      registrySemanticHash: implementationRegistry.semanticHash,
      implementations: implementationRegistry.implementations.map((row) => ({
        implementationId: row.implementationId,
        runtimeState: row.runtimeState,
        qualificationState: row.qualificationState,
        commonMethodIds: row.commonMethodIds,
      })),
    },
    execution: {
      empiricalScenarioState: empiricalScenario?.state || null,
      empiricalAuthorizationState: empiricalAuthorization?.state || null,
      empiricalAuthorizationReasonCode: empiricalAuthorization?.reasonCode || null,
    },
  });
}

function commonInputStatus(snapshot) {
  const report = snapshot.report;
  const request = snapshot.request;
  const commonInput = snapshot.commonInput;
  return {
    requestedMethodIds: snapshot.configuration?.requestedMethods || [],
    requestedLoadCaseIds: snapshot.configuration?.requestedLoadCases || [],
    error: snapshot.error || null,
    reportPackageState: report?.packageState || null,
    reportSemanticHash: report?.semanticHash || null,
    candidateSemanticHash: report?.candidateSemanticHash || null,
    readyMethodIds: report?.readyMethodIds || [],
    blockedMethodIds: report?.blockedMethodIds || [],
    methodRows: (report?.methodRows || []).map((row) => ({
      methodId: row.methodId,
      state: row.state,
      blockerCodes: (row.blockers || []).map((blocker) => blocker.code || 'METHOD_BLOCKED'),
    })),
    requestSourceModelSemanticHash: request?.sourceModel?.semanticHash || null,
    requestResolutionLedgerStatus: request?.resolutionLedger?.status || null,
    requestResolutionLedgerSemanticHash: request?.resolutionLedger?.semanticHash || null,
    requestEnrichmentSidecarSemanticHash: request?.enrichmentSidecar?.semanticHash || null,
    requestQualificationProfileSemanticHash: request?.qualificationProfile?.semanticHash || null,
    commonInputPackageState: commonInput?.packageState || null,
    commonInputSemanticHash: commonInput?.semanticHash || null,
    sealedMethodIds: commonInput?.sealedMethodIds || [],
    commonInputStale: snapshot.staleness?.stale === true,
    stalenessCodes: (snapshot.staleness?.changes || []).map((row) => row.code || 'COMMON_INPUT_STALE'),
    exportSemanticHash: snapshot.exportArtifact?.semanticHash
      || snapshot.exportArtifact?.exportSemanticHash
      || null,
    authorizationReceiptCount: snapshot.consumptionAuthorizations?.length || 0,
    executionReceiptCount: snapshot.consumptionExecutions?.length || 0,
  };
}
function masterRows(masters) {
  return [
    masterRow('lineList', masters?.lineList, true),
    masterRow('pipingClass', masters?.pipingClass, true),
    masterRow('weight', masters?.weight, true),
    masterRow('materialMap', masters?.materialMap, false),
  ];
}
function masterRow(masterKey, value, required) {
  return {
    masterKey,
    required,
    rowCount: Array.isArray(value?.normalizedRows) ? value.normalizedRows.length : 0,
    sourceHash: value?.sourceHash || null,
  };
}
function currentAuthorityHashes(dataset, masters) {
  return {
    dataset: dataset?.sourceSha256 ?? '',
    lineList: masters?.lineList?.sourceHash ?? '',
    pipingClass: masters?.pipingClass?.sourceHash ?? '',
    componentWeight: masters?.weight?.sourceHash ?? '',
    materialMap: masters?.materialMap?.sourceHash ?? '',
  };
}
function authorityHash(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return typeof value.semanticHash === 'string' && value.semanticHash
    ? value.semanticHash
    : semanticHash(value);
}
function mapQualificationState(value) {
  switch (value) {
    case 'QUALIFIED_EXISTING': return 'QUALIFIED';
    case 'QUALIFIED_RESTRICTED_DOMAIN': return 'QUALIFIED_RESTRICTED_DOMAIN';
    case 'FUTURE_RESTRICTED_DOMAIN': return 'FUTURE_RESTRICTED_DOMAIN';
    default: return 'UNQUALIFIED';
  }
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function codedError(message, code) { const error = new Error(message); error.code = code; return error; }
