import { freezeDeep } from './dataset-utils.js';

export function withAnalysisSession(context, session) {
  if (!context || typeof context !== 'object') {
    throw new TypeError('Analysis context must be an object.');
  }
  if (!session) return context;
  return freezeDeep({
    ...context,
    analysisSession: {
      schema: session.schema,
      sessionId: session.sessionId,
      targetId: session.targetId,
      analysisType: session.analysisType,
      datasetId: session.datasetId,
      workspaceVersion: session.workspaceVersion,
      version: session.version,
      overrides: { ...(session.overrides || {}) },
    },
  });
}

export function assertSessionMatchesContext(session, context, analysisType) {
  if (!session) throw sessionError('ANALYSIS_SESSION_NOT_FOUND', 'Analysis session is not active.');
  if (session.targetId !== context.targetId) {
    throw sessionError('ANALYSIS_SESSION_TARGET_MISMATCH', 'Analysis session target does not match the active selection.');
  }
  if (session.analysisType !== analysisType) {
    throw sessionError('ANALYSIS_SESSION_CAPABILITY_MISMATCH', 'Analysis session capability does not match the requested analysis.');
  }
  if (session.datasetId !== context.dataset.datasetId) {
    throw sessionError('ANALYSIS_SESSION_DATASET_MISMATCH', 'Analysis session belongs to a different dataset.');
  }
  if (session.workspaceVersion !== context.version) {
    throw sessionError('ANALYSIS_SESSION_STALE', 'Analysis session workspace version is stale.');
  }
}

function sessionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
