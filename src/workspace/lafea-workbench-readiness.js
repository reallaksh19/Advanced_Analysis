import { lafeaLifecycleReadiness } from './lafea-lifecycle.js';

export function projectLafeaWorkbenchReadiness(stageId, stage) {
  const calculationState = stage.execution?.status === 'QUALIFIED'
    ? 'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT'
    : stage.execution ? 'CALCULATION_NOT_ACCEPTED_BY_STAGE_CONTRACT' : 'CALCULATION_NOT_RUN';
  const lifecycle = stage.lifecycle;
  const binding = stage.lifecycleBinding;
  const domainFirst = stage.domainFirstProfileActive === true;
  const domainCurrent = domainFirst && stage.analysisDomainProjection?.state === 'CURRENT_PASS';
  const geometryCurrent = domainFirst && stage.analysisGeometryProjection?.state === 'CURRENT_PASS';
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
    preMeshModelCurrent: domainCurrent,
    domainFirstProfileActive: domainFirst,
    domainCurrent,
    geometryCurrent,
    solverModelCurrent: false,
    meshApplicable: domainFirst,
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
  const resultReady = current && base.resultReady && !domainFirst;
  const codeReady = current && base.codeReady && !domainFirst;
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
    preMeshModelCurrent: domainFirst ? current && domainCurrent : current && base.modelCurrent,
    domainFirstProfileActive: domainFirst,
    domainCurrent: current && domainCurrent,
    geometryCurrent: current && geometryCurrent,
    solverModelCurrent: current && base.modelCurrent,
    meshQualified: domainFirst ? false : current && base.meshQualified,
    resultReady,
    assessmentReady: !domainFirst && current && base.assessmentReady,
    convergenceReady: !domainFirst && current && base.convergenceReady,
    codeReady,
    reportCurrent: !domainFirst && current && base.reportCurrent,
    reportQualified: !domainFirst && current && base.reportQualified,
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
