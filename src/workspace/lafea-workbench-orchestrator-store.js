/** Canonical LAFEA workbench orchestrator with one public publication boundary. */
import { createLafeaLifecycleProducerBatch } from './lafea-lifecycle-producers.js';
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import {
  LAFEA_LIFECYCLE_BINDING_SCHEMA,
  LAFEA_LIFECYCLE_BINDING_STATUSES,
  LAFEA_WORKBENCH_STATE_SCHEMA,
  createLafeaWorkbenchStore as createRetainedStore,
} from './lafea-lifecycle-workbench-store-retained.js';
import { buildLafeaWorkbenchOrchestrationProjection } from './lafea-workbench-orchestration-projection.js';
import { createLafeaWorkbenchGeometryState } from './lafea-workbench-geometry-state.js';
import { buildLafeaDomainPreparationProjection } from './lafea-domain-first-requests.js';
import { createLafeaWorkbenchOrchestratorApi } from './lafea-workbench-orchestrator-api.js';
import { createLafeaWorkbenchMeshState } from './lafea-workbench-mesh-state.js';
import { createLafeaWorkbenchDomainFirstMeshState } from './lafea-workbench-domain-first-mesh-state.js';
import { createLafeaWorkbenchPreparationState } from './lafea-workbench-preparation-state.js';
import { projectLafeaWorkbenchReadiness } from './lafea-workbench-readiness.js';
import { createLafeaWorkbenchSourceState } from './lafea-workbench-source-state.js';

export { LAFEA_LIFECYCLE_BINDING_SCHEMA, LAFEA_LIFECYCLE_BINDING_STATUSES, LAFEA_WORKBENCH_STATE_SCHEMA };
export const LAFEA_CALCULATION_STATES = Object.freeze(['CALCULATION_NOT_RUN', 'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT', 'CALCULATION_NOT_ACCEPTED_BY_STAGE_CONTRACT']);
export const LAFEA_RESULT_STATES = Object.freeze(['RESULT_NOT_READY', 'RESULT_READY']);
export const LAFEA_CODE_STATES = Object.freeze(['CODE_NOT_READY', 'CODE_READY']);
export const LAFEA_RELEASE_STATES = Object.freeze(['RELEASE_NOT_QUALIFIED', 'RELEASE_QUALIFIED']);

const SOURCE_CHANGE_CLASSES = new Set(['MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA']);

export function createLafeaWorkbenchOrchestratorStore(options) {
  const retained = createRetainedStore(options);
  let retainedState = retained.getState();
  let suppressRetainedPublish = false;
  let orchestratorStatus = null;
  let orchestratorDiagnostics = null;
  const listeners = new Set();
  const stageIds = Object.keys(retainedState.stages);
  const source = createLafeaWorkbenchSourceState(stageIds, {
    getRetainedState: () => retainedState,
    getActiveStageId: () => retainedState.activeStageId,
    invokeRetained,
  });
  const geometry = createLafeaWorkbenchGeometryState(stageIds);
  const mesh = createLafeaWorkbenchMeshState(stageIds, {
    getActiveStageId: () => retainedState.activeStageId,
    readStageState,
    invokeRetained,
    publish,
  });
  const domainMesh = createLafeaWorkbenchDomainFirstMeshState(stageIds);
  const preparation = createLafeaWorkbenchPreparationState(stageIds);
  const unsubscribe = retained.subscribe((next) => {
    retainedState = next;
    if (!suppressRetainedPublish) publish();
  });

  function rawStage(stageId) {
    const stage = retainedState.stages[stageId];
    if (!stage) throw storeError('LAFEA_WORKBENCH_STAGE_NOT_FOUND');
    return freeze({
      ...stage, stageId, ...source.fields(stageId), ...mesh.fields(stageId),
      ...preparation.fields(stageId), ...geometry.fields(stageId), ...domainMesh.fields(stageId),
    });
  }

  function readStageState(stageId) {
    const raw = rawStage(stageId);
    const geometryProjected = freeze({ ...raw, ...geometry.buildProjections(raw) });
    const withGeometry = freeze({
      ...geometryProjected,
      ...domainMesh.lifecycleOverlay(geometryProjected),
    });
    const lifecycleReadiness = projectLafeaWorkbenchReadiness(stageId, withGeometry);
    const withReadiness = freeze({ ...withGeometry, lifecycleReadiness });
    const legacyCustody = mesh.buildAnalysisMeshCustodyProjection(
      withReadiness, withReadiness.retainedAnalysisMeshEvidence,
    );
    const analysisMeshCustodyProjection = withReadiness.domainFirstProfileActive
      ? domainMesh.buildProjection(withReadiness)
      : legacyCustody;
    const withMesh = freeze({ ...withReadiness, analysisMeshCustodyProjection });
    const preparationProjection = withMesh.domainFirstProfileActive
      ? buildLafeaDomainPreparationProjection(withMesh)
      : preparation.buildProjection(withMesh);
    return freeze({ ...withMesh, preparationProjection });
  }

  function deriveStage(stageId) {
    const stage = readStageState(stageId);
    return freeze({ ...stage, orchestration: buildLafeaWorkbenchOrchestrationProjection(stage) });
  }

  function deriveState() {
    return freeze({
      ...retainedState,
      stages: Object.fromEntries(stageIds.map((stageId) => [stageId, deriveStage(stageId)])),
      status: orchestratorStatus ?? retainedState.status,
      diagnostics: orchestratorDiagnostics ?? retainedState.diagnostics,
    });
  }

  function publish() {
    const state = deriveState();
    for (const listener of listeners) {
      try { listener(state); } catch { /* subscriber isolation */ }
    }
    return state;
  }

  function invokeRetained(method, args = []) {
    if (typeof retained[method] !== 'function') throw storeError(`LAFEA_RETAINED_METHOD_NOT_FOUND:${method}`);
    suppressRetainedPublish = true;
    try {
      const returned = retained[method](...args);
      retainedState = returned ?? retained.getState();
      return retainedState;
    } finally { suppressRetainedPublish = false; }
  }

  function mutateDocument(originRef, method, args, explicitClass = null) {
    const before = retainedState;
    const stageId = before.activeStageId;
    const beforeDocument = before.stages[stageId]?.document ?? null;
    invokeRetained(method, args);
    if (retainedState.status === 'FAILED') return publish();
    source.reconcileDocumentMutation(before, originRef, explicitClass);
    const afterDocument = retainedState.stages[stageId]?.document ?? null;
    if (documentDigest(beforeDocument) !== documentDigest(afterDocument)) geometry.invalidate(stageId);
    clearOrchestratorDiagnostic();
    return publish();
  }

  function run() {
    const stageId = retainedState.activeStageId;
    if (rawStage(stageId).domainFirstProfileActive) {
      failOrchestrator(storeError('LAFEA_DOMAIN_FIRST_SOLVER_MODEL_NOT_COMPILED'), 'LAFEA_DOMAIN_FIRST_SOLVER_MODEL_NOT_COMPILED');
      return publish();
    }
    invokeRetained('run');
    let stage = retainedState.stages[stageId];
    try {
      if (stage.execution?.status === 'QUALIFIED') {
        const authority = source.ensureRunAuthority(stageId, 'RUN_CALCULATION/SOURCE_AUTHORITY');
        stage = retainedState.stages[stageId];
        const batch = createLafeaLifecycleProducerBatch({ stageId, sourceAuthority: authority, execution: stage.execution });
        for (let index = 0; index < batch.records.length; index += 1) {
          invokeRetained('registerLifecycleArtifact', [batch.records[index], batch.registrations[index].registrationId]);
          if (retainedState.status === 'FAILED') throw storeError(retainedState.diagnostics?.[0]?.code ?? 'LAFEA_PRODUCER_REGISTRATION_REJECTED');
        }
      }
      clearOrchestratorDiagnostic();
    } catch (error) { failOrchestrator(error, 'LAFEA_PRODUCER_REGISTRATION_REJECTED'); }
    return publish();
  }

  function importDocument(value, stageId = retainedState.activeStageId, sourceHash = null) {
    invokeRetained('importDocument', [value, stageId, sourceHash]);
    if (retainedState.status !== 'FAILED') {
      source.clear(stageId);
      geometry.clear(stageId);
      clearOrchestratorDiagnostic();
    }
    return publish();
  }

  function initializeLifecycle(sourceHash, originRef = 'EXTERNAL_SOURCE_AUTHORITY') {
    const stageId = retainedState.activeStageId;
    source.clear(stageId);
    invokeRetained('initializeLifecycle', [sourceHash, originRef]);
    if (retainedState.status !== 'FAILED') geometry.invalidate(stageId);
    clearOrchestratorDiagnosticIfReady();
    return publish();
  }

  function applyLifecycleEvent(event) {
    invokeRetained('applyLifecycleEvent', [event]);
    const succeeded = retainedState.status !== 'FAILED';
    source.afterLifecycleEvent(event, succeeded);
    mesh.afterLifecycleEvent(event, succeeded);
    if (succeeded && SOURCE_CHANGE_CLASSES.has(event?.changeClass)) {
      geometry.invalidate(retainedState.activeStageId);
    }
    if (succeeded) clearOrchestratorDiagnostic();
    return publish();
  }

  function delegate(method, args = []) {
    invokeRetained(method, args);
    clearOrchestratorDiagnosticIfReady();
    return publish();
  }

  function registerPreparationEvidence(value) {
    if (rawStage(value?.request?.stageId ?? retainedState.activeStageId).domainFirstProfileActive) {
      throw storeError('LAFEA_DOMAIN_FIRST_PREPARATION_REQUIRES_V2_EVIDENCE');
    }
    const result = preparation.registerEvidence(value);
    const stageId = result.evidence.request.stageId;
    const projection = result.changed ? publish().stages[stageId].preparationProjection : deriveStage(stageId).preparationProjection;
    return freeze({ ...result, projection });
  }

  function registerPreparationApproval(value) {
    if (rawStage(value?.stageId ?? retainedState.activeStageId).domainFirstProfileActive) {
      throw storeError('LAFEA_DOMAIN_FIRST_PREPARATION_APPROVAL_NOT_QUALIFIED');
    }
    const result = preparation.registerApproval(value);
    const stageId = result.approval.stageId;
    const projection = result.changed ? publish().stages[stageId].preparationProjection : deriveStage(stageId).preparationProjection;
    return freeze({ ...result, projection });
  }

  function activateDomainFirstProfile(stageId = retainedState.activeStageId) {
    const result = geometry.activate(rawStage(stageId));
    if (result.changed) clearOrchestratorDiagnostic();
    return freeze({ ...result, stage: publish().stages[stageId] });
  }

  function registerAnalysisDomain(value) {
    const stageId = value?.stageId ?? retainedState.activeStageId;
    const result = geometry.registerDomain(value, readStageState(stageId));
    return freeze({ ...result, projection: (result.changed ? publish() : deriveState()).stages[stageId].analysisDomainProjection });
  }

  function registerAnalysisGeometryEvidence(value) {
    const stageId = value?.stageId ?? retainedState.activeStageId;
    const result = geometry.registerGeometryEvidence(value, readStageState(stageId));
    return freeze({ ...result, projection: (result.changed ? publish() : deriveState()).stages[stageId].analysisGeometryProjection });
  }

  function registerAnalysisMeshEvidence(value) {
    const stageId = value?.intent?.stageId ?? value?.stageId ?? retainedState.activeStageId;
    if (rawStage(stageId).domainFirstProfileActive) {
      const stage = readStageState(stageId);
      const prepared = domainMesh.prepareRegistration(value, stage);
      const receipt = domainMesh.commitRegistration(prepared, stage);
      const state = prepared.changed ? publish() : deriveState();
      return freeze({
        changed: prepared.changed,
        evidence: receipt.evidence,
        receipt,
        projection: state.stages[stageId].analysisMeshCustodyProjection,
      });
    }
    return mesh.registerAnalysisMeshEvidence(value);
  }

  function exportLifecycle() {
    const stage = deriveStage(retainedState.activeStageId);
    return freeze({
      ...retained.exportLifecycle(), schema: 'lafea-workbench-lifecycle-export/v2',
      sourceAuthority: stage.sourceAuthority,
      lastSourceAuthorityEvent: stage.lastSourceAuthorityEvent,
      readiness: stage.lifecycleReadiness,
      preparation: stage.preparationProjection,
      domainFirstLifecycle: stage.domainFirstLifecycle,
      analysisDomain: stage.analysisDomainProjection,
      analysisGeometry: stage.analysisGeometryProjection,
      analysisMesh: stage.analysisMeshCustodyProjection,
      orchestration: stage.orchestration,
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('LAFEA subscriber must be a function.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function clearOrchestratorDiagnosticIfReady() { if (retainedState.status !== 'FAILED') clearOrchestratorDiagnostic(); }
  function clearOrchestratorDiagnostic() { orchestratorStatus = null; orchestratorDiagnostics = null; }
  function failOrchestrator(error, fallbackCode) {
    orchestratorStatus = 'FAILED';
    orchestratorDiagnostics = [freeze({
      severity: 'ERROR', code: typeof error?.code === 'string' ? error.code : fallbackCode,
      path: 'orchestration', entityId: null,
      message: error instanceof Error ? error.message : String(error),
    })];
  }

  return createLafeaWorkbenchOrchestratorApi({
    retained, mesh, domainMesh, preparation, geometry, listeners, unsubscribe,
    getRetainedState: () => retainedState,
    readStageState, deriveStage, deriveState, publish, delegate, mutateDocument,
    importDocument, run, initializeLifecycle, applyLifecycleEvent,
    registerPreparationEvidence, registerPreparationApproval,
    activateDomainFirstProfile, registerAnalysisDomain,
    registerAnalysisGeometryEvidence, registerAnalysisMeshEvidence,
    subscribe, exportLifecycle,
  });
}

function documentDigest(value) { return value ? lafeaDocumentDigest(value) : null; }
function storeError(code) { const error = new Error(code); error.code = code; return error; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value); }
