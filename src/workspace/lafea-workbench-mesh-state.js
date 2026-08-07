/**
 * Analysis-mesh state slice owned by the canonical workbench orchestrator.
 *
 * This is not a store or decorator: it has no subscription/listener surface.
 * It owns per-stage custody state and hosts the merged WP-MC1 domain controller.
 */
import {
  createLafeaAnalysisMeshCustodyController,
} from './lafea-analysis-mesh-custody-controller.js';
import {
  buildAnalysisMeshCustodyProjection,
} from './lafea-analysis-mesh-custody-projection.js';
import { validateLafeaAnalysisMeshEvidence } from './lafea-analysis-mesh-evidence-validator.js';

export function createLafeaWorkbenchMeshState(stageIds, hostValue) {
  const host = requireHost(hostValue);
  const overlays = Object.fromEntries(stageIds.map((stageId) => [
    stageId,
    emptyOverlay(),
  ]));

  function fields(stageId) {
    const overlay = requireOverlay(stageId);
    return freeze({ ...overlay });
  }

  function afterLifecycleEvent(event, succeeded = true) {
    if (!succeeded
      || event?.changeClass !== 'ANALYSIS_MESH_PROFILE'
      || typeof event.profileHash !== 'string') return;
    const stageId = host.getActiveStageId();
    const previous = requireOverlay(stageId);
    overlays[stageId] = freeze({
      ...previous,
      analysisMeshCustodyVersion: previous.analysisMeshCustodyVersion + 1,
      analysisMeshProfileHash: event.profileHash,
      lastAnalysisMeshCustodyAction: 'BIND_ANALYSIS_MESH_PROFILE',
    });
  }

  function commitStageState(stageId, next, expectedVersion) {
    if (host.getActiveStageId() !== stageId) {
      throw meshError('LAFEA_ANALYSIS_MESH_ACTIVE_STAGE_MISMATCH');
    }
    const current = requireOverlay(stageId);
    if (current.analysisMeshCustodyVersion !== expectedVersion) {
      throw meshError('LAFEA_ANALYSIS_MESH_CUSTODY_STATE_CHANGED');
    }

    const previous = host.readStageState(stageId);
    const lifecycleChanged = JSON.stringify(previous.lifecycle)
      !== JSON.stringify(next.lifecycle);
    const nextOverlay = freeze({
      analysisMeshCustodyVersion: expectedVersion + 1,
      analysisMeshProfileHash: next.analysisMeshProfileHash ?? null,
      retainedAnalysisMeshEvidence: next.retainedAnalysisMeshEvidence ?? null,
      lastAnalysisMeshCustodyAction: next.lastAnalysisMeshCustodyAction ?? null,
    });

    if (lifecycleChanged) {
      const evidence = nextOverlay.retainedAnalysisMeshEvidence;
      if (!evidence) throw meshError('LAFEA_ANALYSIS_MESH_COMMIT_EVIDENCE_REQUIRED');
      const state = host.invokeRetained('registerLifecycleArtifact', [
        evidence.artifactRecord,
        evidence.registrationId,
      ]);
      if (state.status === 'FAILED') {
        throw meshError(
          state.diagnostics?.[0]?.code ?? 'LAFEA_ANALYSIS_MESH_ATOMIC_COMMIT_REJECTED',
        );
      }
    }
    overlays[stageId] = nextOverlay;
  }

  const custody = createLafeaAnalysisMeshCustodyController({
    getActiveStageId: host.getActiveStageId,
    readStageState: host.readStageState,
    commitStageState,
    publish: host.publish,
  });

  return Object.freeze({
    fields,
    afterLifecycleEvent,
    validateLafeaAnalysisMeshEvidence,
    buildAnalysisMeshCustodyProjection,
    registerAnalysisMeshEvidence: custody.registerAnalysisMeshEvidence,
    selectRetainedAnalysisMeshEvidence: custody.selectRetainedAnalysisMeshEvidence,
    exportAnalysisMeshEvidence: custody.exportAnalysisMeshEvidence,
    recoverAnalysisMeshEvidence: custody.recoverAnalysisMeshEvidence,
  });

  function requireOverlay(stageId) {
    const overlay = overlays[stageId];
    if (!overlay) throw meshError('LAFEA_ANALYSIS_MESH_STAGE_NOT_FOUND');
    return overlay;
  }
}

function emptyOverlay() {
  return freeze({
    analysisMeshCustodyVersion: 0,
    analysisMeshProfileHash: null,
    retainedAnalysisMeshEvidence: null,
    lastAnalysisMeshCustodyAction: null,
  });
}

function requireHost(value) {
  const methods = [
    'getActiveStageId', 'readStageState', 'invokeRetained', 'publish',
  ];
  if (!value || typeof value !== 'object'
    || methods.some((name) => typeof value[name] !== 'function')) {
    throw meshError('LAFEA_WORKBENCH_MESH_HOST_INVALID');
  }
  return value;
}

function meshError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
