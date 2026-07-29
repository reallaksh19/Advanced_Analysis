/**
 * Immutable LFEA mesh editor store with bounded undo and redo history.
 *
 * Valid imports retain their declared semantic hash. Only explicit local edits
 * are resealed, and every committed edit must satisfy mesh-package validation.
 */
import { LFEA_RESULT_MODES } from './lfea-workbench-model.js';
import {
  assertResultMode,
  freeze,
  importedState,
} from './lfea-workbench-state.js';
import { createLfeaWorkbenchDocumentStore } from './lfea-workbench-document-store.js';
import { createLfeaWorkbenchRunStore } from './lfea-workbench-run-store.js';
import {
  assertDeformationScale,
  assertLfeaWorkbenchStateInvariants,
  cancellationDiagnostic,
  displayFailureState,
  hasQualifiedLfeaDisplacementResult,
  modelChangedCancellation,
} from './lfea-workbench-run-state.js';

export { assertLfeaWorkbenchStateInvariants } from './lfea-workbench-run-state.js';

const HISTORY_LIMIT = 50;
const DEFAULT_DEFORMATION_SCALE = 10;
const DEFORMATION_SCALE_SOURCE = 'LFEA_REVIEW_PROFILE';

/**
 * Create a standalone LFEA workbench store.
 *
 * @param {{initialDocument?:unknown,resultMode?:string,deformationScale?:number,pipelineOptions?:unknown,beforeCommittedMutation?:(activeRun:Readonly<Record<string,unknown>>)=>unknown}|undefined} options Explicit initial state.
 * @returns {Readonly<Record<string, Function>>} Store API.
 */
export function createLfeaWorkbenchStore(options) {
  const configuration = options ?? {};
  const resultMode = configuration.resultMode ?? 'MODEL';
  const deformationScale = configuration.deformationScale
    ?? DEFAULT_DEFORMATION_SCALE;
  assertResultMode(resultMode);
  assertDeformationScale(deformationScale);
  const beforeCommittedMutation = typeof configuration.beforeCommittedMutation === 'function'
    ? configuration.beforeCommittedMutation
    : () => null;
  let runSequence = 0;
  let state = freeze({
    schema: 'lfea-workbench-state/v2',
    status: 'EMPTY',
    packageValue: null,
    modelVersion: 0,
    activeRun: null,
    execution: null,
    progress: null,
    nodeDraft: null,
    display: {
      resultMode,
      deformationScale,
      deformationScaleSource: DEFORMATION_SCALE_SOURCE,
    },
    past: [],
    future: [],
    diagnostics: [],
  });
  const listeners = new Set();

  function publish(next) {
    assertLfeaWorkbenchStateInvariants(next);
    state = freeze(next);
    listeners.forEach((listener) => listener(state));
    return state;
  }

  function finalizeCommittedMutation(next, cancellation) {
    return {
      ...next,
      status: 'READY',
      modelVersion: state.modelVersion + 1,
      activeRun: null,
      execution: null,
      progress: null,
      nodeDraft: null,
      display: { ...state.display, resultMode: 'MODEL' },
      diagnostics: cancellation
        ? [cancellationDiagnostic(cancellation, 'LFEA_RUN_CANCELLED_MODEL_CHANGED')]
        : [],
    };
  }

  function commitTransition(next) {
    const activeRun = state.activeRun;
    const cancellation = activeRun
      ? beforeCommittedMutation(activeRun) ?? modelChangedCancellation(activeRun)
      : null;
    return publish(finalizeCommittedMutation(next, cancellation));
  }

  const documentStore = createLfeaWorkbenchDocumentStore({
    getState: () => state,
    publish,
    commitTransition,
    historyLimit: HISTORY_LIMIT,
  });
  const runStore = createLfeaWorkbenchRunStore({
    getState: () => state,
    publish,
    nextRunId: () => `lfea-run-${runSequence += 1}`,
    pipelineOptions: configuration.pipelineOptions,
  });

  if (configuration.initialDocument !== undefined) {
    const next = importedState(state, configuration.initialDocument, HISTORY_LIMIT);
    state = freeze(finalizeCommittedMutation(next, null));
    assertLfeaWorkbenchStateInvariants(state);
  }

  function setResultMode(mode) {
    assertResultMode(mode);
    if (mode === 'DEFORMED' && !hasQualifiedLfeaDisplacementResult(state.execution)) {
      return publish(displayFailureState(
        state,
        'LFEA_DEFORMED_UNAVAILABLE',
        'Deformed display is unavailable until a current qualified displacement result exists.',
      ));
    }
    if (mode === 'PROJECTED_STRESS' && !state.execution?.stressProjection) {
      return publish(displayFailureState(
        state,
        'LFEA_PROJECTED_STRESS_UNAVAILABLE',
        'Projected stress is unavailable until a qualified projection is generated.',
      ));
    }
    return publish({
      ...state,
      display: { ...state.display, resultMode: mode },
      diagnostics: [],
    });
  }

  function setDeformationScale(value) {
    const scale = typeof value === 'string' ? Number(value) : value;
    if (!(Number.isFinite(scale) && scale > 0)) {
      return publish(displayFailureState(
        state,
        'LFEA_DEFORMATION_SCALE_INVALID',
        'Deformation scale must be finite and greater than zero.',
      ));
    }
    return publish({
      ...state,
      display: { ...state.display, deformationScale: scale },
      diagnostics: [],
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('LFEA subscriber must be a function.');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({
    ...documentStore,
    ...runStore,
    setResultMode,
    setDeformationScale,
    subscribe,
    getState: () => state,
    destroy: () => listeners.clear(),
  });
}

export const LFEA_WORKBENCH_RESULT_MODES = LFEA_RESULT_MODES;
