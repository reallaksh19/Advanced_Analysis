import {
  deepFreeze,
  requireStage,
} from './lafea-lifecycle-contracts.js';
import {
  validateLifecycle,
} from './lafea-lifecycle-validation.js';

/** Derive truthful UI/readiness states without promoting blocked evidence. */
export function lafeaLifecycleReadiness(lifecycleValue) {
  const lifecycle = validateLifecycle(lifecycleValue);
  const stage = requireStage(lifecycle.stageId);
  const currentPass = (kind) => isCurrentPass(lifecycle, kind);
  const mesh = lifecycle.artifacts.ANALYSIS_MESH;
  const report = lifecycle.artifacts.REPORT_EVIDENCE;
  const reasons = blockingReasons(stage, currentPass);
  return deepFreeze({
    schema: 'lafea-lifecycle-readiness/v1',
    stageId: lifecycle.stageId,
    sourceCurrent: lifecycle.source.status === 'CURRENT',
    modelCurrent: currentPass('CANONICAL_MODEL'),
    meshGenerated: ['CURRENT', 'BLOCKED'].includes(mesh.status),
    meshQualified: currentPass('ANALYSIS_MESH'),
    resultReady: resultReady(currentPass),
    codeReady: codeReady(currentPass),
    reportCurrent: report.status === 'CURRENT',
    blockingReasons: Object.freeze(reasons),
  });
}

function isCurrentPass(lifecycle, kind) {
  const artifact = lifecycle.artifacts[kind];
  return artifact.status === 'CURRENT' && artifact.qualification === 'PASS';
}

function resultReady(currentPass) {
  return currentPass('ANALYSIS_MESH')
    && currentPass('EXECUTION')
    && currentPass('RECOVERY');
}

function codeReady(currentPass) {
  return resultReady(currentPass)
    && currentPass('CONVERGENCE')
    && currentPass('CODE_ASSESSMENT');
}

function blockingReasons(stage, currentPass) {
  const reasons = [];
  if (stage.engineState === 'ENGINE_NOT_IMPLEMENTED') {
    reasons.push('STAGE_ENGINE_NOT_IMPLEMENTED');
  }
  addMissingReason(
    reasons,
    currentPass('CANONICAL_MODEL'),
    'MODEL_NOT_CURRENT_AND_QUALIFIED',
  );
  addMissingReason(
    reasons,
    currentPass('ANALYSIS_MESH'),
    'MESH_NOT_CURRENT_AND_QUALIFIED',
  );
  addMissingReason(
    reasons,
    currentPass('EXECUTION'),
    'EXECUTION_NOT_CURRENT_AND_QUALIFIED',
  );
  addMissingReason(
    reasons,
    currentPass('RECOVERY'),
    'RECOVERY_NOT_CURRENT_AND_QUALIFIED',
  );
  addMissingReason(
    reasons,
    currentPass('CONVERGENCE'),
    'CONVERGENCE_NOT_CURRENT_AND_QUALIFIED',
  );
  addMissingReason(
    reasons,
    currentPass('CODE_ASSESSMENT'),
    'CODE_ASSESSMENT_NOT_CURRENT_AND_QUALIFIED',
  );
  return reasons;
}

function addMissingReason(reasons, condition, reason) {
  if (!condition) reasons.push(reason);
}
