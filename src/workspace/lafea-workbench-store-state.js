import {
  LAFEA_STAGE_IDS,
  LAFEA_WORKBENCH_DOCUMENT_SCHEMA,
  normalizeLafeaStageDocument,
} from './lafea-workbench-model.js';
import { requireLafeaStageRegistryEntry } from './lafea-stage-registry.js';

export const HISTORY_LIMIT = 50;

export function initialState(activeStageId) {
  const stages = Object.fromEntries(LAFEA_STAGE_IDS.map((stageId) => [
    stageId,
    freeze({ document: null, execution: null, lastEditResult: null, past: [], future: [] }),
  ]));
  return freeze({
    schema: 'lafea-workbench-state/v1',
    activeStageId,
    status: 'EMPTY',
    stages,
    diagnostics: [],
  });
}

export function importIntoState(state, stageId, value) {
  assertStage(stageId);
  const envelope = isRecord(value) && value.schema === LAFEA_WORKBENCH_DOCUMENT_SCHEMA;
  const targetStage = envelope ? value.stageId : stageId;
  assertStage(targetStage);
  const document = normalizeLafeaStageDocument(targetStage, envelope ? value.document : value);
  const stage = state.stages[targetStage];
  const nextStage = {
    document,
    execution: null,
    lastEditResult: null,
    past: stage.document ? [...stage.past, stage.document].slice(-HISTORY_LIMIT) : stage.past,
    future: [],
  };
  return withStage({ ...state, activeStageId: targetStage }, targetStage, nextStage, 'READY', []);
}

export function commitDocument(state, document, editResult) {
  const stage = currentStage(state);
  const nextStage = {
    document,
    execution: null,
    lastEditResult: editResult,
    past: [...stage.past, stage.document].filter(Boolean).slice(-HISTORY_LIMIT),
    future: [],
  };
  return withCurrentStage(state, nextStage, 'READY', []);
}

export function withCurrentStage(state, stage, status, diagnostics) {
  return withStage(state, state.activeStageId, stage, status, diagnostics);
}

export function failedState(state, error, code) {
  return {
    ...state,
    status: 'FAILED',
    diagnostics: [{
      severity: 'ERROR',
      code: typeof error?.code === 'string' ? error.code : code,
      path: typeof error?.path === 'string' ? error.path : 'document',
      entityId: typeof error?.entityId === 'string' ? error.entityId : null,
      message: error instanceof Error ? error.message : 'Unknown LAFEA workbench failure.',
    }],
  };
}

export function currentStage(state) {
  return state.stages[state.activeStageId];
}

export function requireDocument(state) {
  const document = currentStage(state).document;
  if (!document) throw new TypeError(`Import a ${state.activeStageId} document before editing or calculating.`);
  return document;
}

export function assertStage(stageId) {
  requireLafeaStageRegistryEntry(stageId);
}

export function commandError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function withStage(state, stageId, stage, status, diagnostics) {
  return {
    ...state,
    status,
    stages: { ...state.stages, [stageId]: freeze(stage) },
    diagnostics: freeze([...diagnostics]),
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
