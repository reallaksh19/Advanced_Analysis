/** Public method-surface assembly for the canonical orchestrator; owns no state or listeners. */
import {
  buildLafeaMeshGenerationIntentV2FromStage,
  buildLafeaPreparationRequestV2FromStage,
} from './lafea-domain-first-requests.js';
import { lafeaDomainFirstMeshProfileHash } from './lafea-domain-first-mesh-profile.js';
import {
  executeLafeaDomainFirstT6Mesh,
  planLafeaDomainFirstT6Mesh,
} from './lafea-domain-first-t6-producer.js';

export function createLafeaWorkbenchOrchestratorApi(context) {
  const c = requireContext(context);
  const activeStageId = () => c.getRetainedState().activeStageId;
  const domainFirst = (stageId = activeStageId()) => c.readStageState(stageId).domainFirstProfileActive;

  function domainT6Input(configuration, meshProfile, stageId = activeStageId()) {
    const stage = c.readStageState(stageId);
    const meshProfileHash = lafeaDomainFirstMeshProfileHash(meshProfile);
    const intent = buildLafeaMeshGenerationIntentV2FromStage(
      stage,
      { ...configuration, meshProfileHash },
    );
    return {
      intent,
      meshProfile,
      analysisDomain: stage.retainedAnalysisDomain,
      analysisGeometryEvidence: stage.retainedAnalysisGeometryEvidence,
    };
  }

  return Object.freeze({
    selectStage: (stageId) => c.delegate('selectStage', [stageId]),
    importDocument: c.importDocument,
    applyEditCommand: (command) => c.mutateDocument(
      command?.commandId ?? 'APPLY_EDIT_COMMAND', 'applyEditCommand', [command],
    ),
    setScalar: (descriptorId, entityId, rawText, surface) => c.mutateDocument(
      `SET_SCALAR:${descriptorId}`, 'setScalar', [descriptorId, entityId, rawText, surface],
    ),
    replaceDocument: (value, surface) => c.mutateDocument(
      'REPLACE_DOCUMENT', 'replaceDocument', [value, surface], 'GEOMETRY',
    ),
    moveNode: (path, nodeId, x, y) => c.mutateDocument(
      `MOVE_NODE:${nodeId}`, 'moveNode', [path, nodeId, x, y], 'GEOMETRY',
    ),
    reportEditError: (...args) => c.delegate('reportEditError', args),
    run: c.run,
    undo: () => c.mutateDocument('UNDO', 'undo', []),
    redo: () => c.mutateDocument('REDO', 'redo', []),
    exportDocument: () => c.retained.exportDocument(),
    initializeLifecycle: c.initializeLifecycle,
    applyLifecycleEvent: c.applyLifecycleEvent,
    registerLifecycleArtifact: (...args) => c.delegate('registerLifecycleArtifact', args),
    revalidateLifecycleBinding: (...args) => c.delegate('revalidateLifecycleBinding', args),
    exportLifecycle: c.exportLifecycle,
    validateLafeaAnalysisMeshEvidence: (value) => domainFirst(value?.stageId)
      ? c.domainMesh.validateEvidence(value)
      : c.mesh.validateLafeaAnalysisMeshEvidence(value),
    registerAnalysisMeshEvidence: c.registerAnalysisMeshEvidence,
    selectRetainedAnalysisMeshEvidence: (stageId = activeStageId()) => domainFirst(stageId)
      ? c.domainMesh.select(stageId)
      : c.mesh.selectRetainedAnalysisMeshEvidence(stageId),
    buildAnalysisMeshCustodyProjection: (stageId = activeStageId()) => {
      const stage = c.readStageState(stageId);
      return stage.domainFirstProfileActive
        ? c.domainMesh.buildProjection(stage)
        : c.mesh.buildAnalysisMeshCustodyProjection(stage, stage.retainedAnalysisMeshEvidence);
    },
    exportAnalysisMeshEvidence: (stageId = activeStageId()) => domainFirst(stageId)
      ? c.domainMesh.exportEvidence(stageId)
      : c.mesh.exportAnalysisMeshEvidence(stageId),
    recoverAnalysisMeshEvidence: (value) => {
      const stageId = value?.stageId ?? activeStageId();
      if (domainFirst(stageId)) return c.registerAnalysisMeshEvidence(value);
      return c.mesh.recoverAnalysisMeshEvidence(value);
    },
    buildPreparationRequest: (caseIds = [], stageId = activeStageId()) => {
      const stage = c.readStageState(stageId);
      if (stage.domainFirstProfileActive) {
        throw apiError('LAFEA_DOMAIN_FIRST_PREPARATION_REQUIRES_V2_REQUEST');
      }
      return c.preparation.buildRequest(stage, caseIds);
    },
    registerPreparationEvidence: c.registerPreparationEvidence,
    selectRetainedPreparationEvidence: (stageId = activeStageId()) =>
      c.preparation.selectEvidence(stageId),
    registerPreparationApproval: c.registerPreparationApproval,
    selectRetainedPreparationApproval: (stageId = activeStageId()) =>
      c.preparation.selectApproval(stageId),
    buildPreparationProjection: (stageId = activeStageId()) =>
      c.deriveStage(stageId).preparationProjection,
    activateDomainFirstProfile: c.activateDomainFirstProfile,
    registerAnalysisDomain: c.registerAnalysisDomain,
    selectRetainedAnalysisDomain: (stageId = activeStageId()) =>
      c.geometry.selectDomain(stageId),
    registerAnalysisGeometryEvidence: c.registerAnalysisGeometryEvidence,
    selectRetainedAnalysisGeometryEvidence: (stageId = activeStageId()) =>
      c.geometry.selectGeometryEvidence(stageId),
    exportAnalysisGeometryEvidence: (stageId = activeStageId()) =>
      c.geometry.exportGeometryEvidence(stageId),
    recoverAnalysisGeometryEvidence: (value, stageId = activeStageId()) => {
      const result = c.geometry.recoverGeometryEvidence(value, c.readStageState(stageId));
      const state = result.changed ? c.publish() : c.deriveState();
      return freeze({ ...result, projection: state.stages[stageId].analysisGeometryProjection });
    },
    buildDomainPreparationRequest: (caseIds = [], stageId = activeStageId()) =>
      buildLafeaPreparationRequestV2FromStage(c.readStageState(stageId), caseIds),
    buildDomainMeshGenerationIntent: (configuration, stageId = activeStageId()) =>
      buildLafeaMeshGenerationIntentV2FromStage(c.readStageState(stageId), configuration),
    planDomainT6Mesh: (configuration, meshProfile, stageId = activeStageId()) =>
      planLafeaDomainFirstT6Mesh(domainT6Input(configuration, meshProfile, stageId)),
    generateDomainT6Mesh: (configuration, meshProfile, stageId = activeStageId()) => {
      const execution = executeLafeaDomainFirstT6Mesh(
        domainT6Input(configuration, meshProfile, stageId),
      );
      if (!execution.custodyEligible) return execution;
      return freeze({
        ...execution,
        custody: c.registerAnalysisMeshEvidence(execution.evidence),
      });
    },
    buildOrchestrationProjection: (stageId = activeStageId()) =>
      c.deriveStage(stageId).orchestration,
    subscribe: c.subscribe,
    getState: c.deriveState,
    destroy: () => {
      c.unsubscribe();
      c.retained.destroy();
      c.listeners.clear();
    },
  });
}

function apiError(code) { const error = new TypeError(code); error.code = code; return error; }
function requireContext(value) {
  if (!value || typeof value !== 'object') throw new TypeError('LAFEA_ORCHESTRATOR_API_CONTEXT_INVALID');
  return value;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
