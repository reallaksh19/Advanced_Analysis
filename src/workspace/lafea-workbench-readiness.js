import { lafeaLifecycleReadiness } from './lafea-lifecycle.js';

export function projectLafeaWorkbenchReadiness(stageId, stage) {
  const calculationState = stage.execution?.status === 'QUALIFIED'
    ? 'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT'
    : stage.execution ? 'CALCULATION_NOT_ACCEPTED_BY_STAGE_CONTRACT' : 'CALCULATION_NOT_RUN';
  const lifecycle = stage.lifecycle;
  const binding = stage.lifecycleBinding;
  if (!lifecycle) return freeze({
    schema: 'lafea-workbench-lifecycle-readiness/v2',
    stageId,
    lifecycleInitialized: false,
    bindingStatus: binding.status,
    calculationState,
    resultState: 'RESULT_NOT_READY',
    codeState: 'CODE_NOT_READY',
    releaseState: 'RELEASE_NOT_QUALIFIED',
    sourceCurrent: false,
    modelCurrent: false,
    meshApplicable: false,
    meshGenerated: false,
    meshQualified: false,
    resultReady: false,
    assessmentApplicable: false,
    assessmentReady: false,
    convergenceApplicable: false,
    convergenceReady: false,
    codeAssessmentApplicable: false,
    codeReady: false,
    reportCurrent: false,
    reportQualified: false,
    blockingReasons: ['LIFECYCLE_NOT_INITIALIZED'],
  });
  const base = lafeaLifecycleReadiness(lifecycle);
  const current = binding.status === 'CURRENT';
  const resultReady = current && base.resultReady;
  const codeReady = current && base.codeReady;
  return freeze({
    ...base,
    schema: 'lafea-workbench-lifecycle-readiness/v2',
    lifecycleInitialized: true,
    bindingStatus: binding.status,
    calculationState,
    resultState: resultReady ? 'RESULT_READY' : 'RESULT_NOT_READY',
    codeState: codeReady ? 'CODE_READY' : 'CODE_NOT_READY',
    releaseState: 'RELEASE_NOT_QUALIFIED',
    sourceCurrent: current && base.sourceCurrent,
    modelCurrent: current && base.modelCurrent,
    meshQualified: current && base.meshQualified,
    resultReady,
    assessmentReady: current && base.assessmentReady,
    convergenceReady: current && base.convergenceReady,
    codeReady,
    reportCurrent: current && base.reportCurrent,
    reportQualified: current && base.reportQualified,
    blockingReasons: current ? [...base.blockingReasons] : [
      `LIFECYCLE_SOURCE_BINDING_${binding.status}`,
      ...base.blockingReasons,
    ],
  });
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
