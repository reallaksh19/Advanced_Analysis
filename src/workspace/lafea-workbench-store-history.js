import {
  HISTORY_LIMIT,
  currentStage,
  withCurrentStage,
} from './lafea-workbench-store-state.js';

/** Create bounded document-level undo/redo actions for one workbench store. */
export function createLafeaWorkbenchHistoryActions({ getState, publish }) {
  function undo() {
    const state = getState();
    const stage = currentStage(state);
    if (!stage.past.length) return state;
    const document = stage.past.at(-1);
    const nextStage = {
      ...stage,
      document,
      execution: null,
      lastEditResult: null,
      past: stage.past.slice(0, -1),
      future: [stage.document, ...stage.future]
        .filter(Boolean)
        .slice(0, HISTORY_LIMIT),
    };
    return publish(withCurrentStage(state, nextStage, 'READY', []));
  }

  function redo() {
    const state = getState();
    const stage = currentStage(state);
    if (!stage.future.length) return state;
    const document = stage.future[0];
    const nextStage = {
      ...stage,
      document,
      execution: null,
      lastEditResult: null,
      past: [...stage.past, stage.document]
        .filter(Boolean)
        .slice(-HISTORY_LIMIT),
      future: stage.future.slice(1),
    };
    return publish(withCurrentStage(state, nextStage, 'READY', []));
  }

  return Object.freeze({ undo, redo });
}
