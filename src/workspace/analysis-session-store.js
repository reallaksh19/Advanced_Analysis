import { freezeDeep } from './dataset-utils.js';

export const ANALYSIS_SESSION_SCHEMA = 'analysis-session/v1';

export class AnalysisSessionStore {
  #snapshot = emptySnapshot(0);
  #sequence = 0;

  open({ targetId, analysisType, datasetId, workspaceVersion, inspection }) {
    assertInspection(inspection);
    const readyToRun = inspection.workspaceReadiness?.readyToRun ?? inspection.readiness.enabled;
    const session = freezeDeep({
      schema: ANALYSIS_SESSION_SCHEMA,
      sessionId: `analysis-session-${++this.#sequence}`,
      targetId: nonEmptyString(targetId, 'targetId'),
      analysisType: nonEmptyString(analysisType, 'analysisType'),
      datasetId: nonEmptyString(datasetId, 'datasetId'),
      workspaceVersion: integerValue(workspaceVersion, 'workspaceVersion'),
      version: 1,
      status: readyToRun ? 'ready' : 'draft',
      inputs: inspection.fields,
      overrides: {},
      fieldErrors: {},
      readiness: inspection.readiness,
      workspaceReadiness: inspection.workspaceReadiness || null,
      result: null,
      failure: null,
    });
    this.#snapshot = freezeDeep({
      status: 'active',
      session,
      version: this.#snapshot.version + 1,
    });
    return session;
  }

  revise(sessionId, { overrides, fieldErrors = {}, inspection }) {
    const current = this.require(sessionId);
    assertInspection(inspection);
    const readyToRun = inspection.workspaceReadiness?.readyToRun ?? inspection.readiness.enabled;
    const session = freezeDeep({
      ...current,
      version: current.version + 1,
      status: readyToRun ? 'ready' : 'draft',
      inputs: inspection.fields,
      overrides: { ...(overrides || {}) },
      fieldErrors: { ...fieldErrors },
      readiness: inspection.readiness,
      workspaceReadiness: inspection.workspaceReadiness || null,
      result: null,
      failure: null,
    });
    return this.#replace(session);
  }

  recordFieldError(sessionId, fieldKey, message) {
    const current = this.require(sessionId);
    const session = freezeDeep({
      ...current,
      version: current.version + 1,
      fieldErrors: {
        ...current.fieldErrors,
        [nonEmptyString(fieldKey, 'fieldKey')]: nonEmptyString(message, 'message'),
      },
    });
    return this.#replace(session);
  }

  markRunning(sessionId, requestId) {
    return this.#transition(sessionId, {
      status: 'running',
      requestId: nonEmptyString(requestId, 'requestId'),
      result: null,
      failure: null,
    });
  }

  markCompleted(sessionId, requestId, result) {
    if (!result || typeof result !== 'object') throw new TypeError('Session result must be an object.');
    return this.#transition(sessionId, {
      status: 'completed',
      requestId: nonEmptyString(requestId, 'requestId'),
      result,
      failure: null,
    });
  }

  markFailed(sessionId, requestId, failure) {
    if (!failure || typeof failure !== 'object') throw new TypeError('Session failure must be an object.');
    return this.#transition(sessionId, {
      status: 'failed',
      requestId: nonEmptyString(requestId, 'requestId'),
      result: null,
      failure,
    });
  }

  clear() {
    this.#snapshot = emptySnapshot(this.#snapshot.version + 1);
    return this.#snapshot;
  }

  getSnapshot() {
    return this.#snapshot;
  }

  getSession(sessionId = '') {
    const session = this.#snapshot.session;
    return session?.sessionId === String(sessionId || '') ? session : null;
  }

  require(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Analysis session is not active: ${sessionId}.`);
    return session;
  }

  #transition(sessionId, changes) {
    const current = this.require(sessionId);
    return this.#replace(freezeDeep({
      ...current,
      ...changes,
      version: current.version + 1,
    }));
  }

  #replace(session) {
    this.#snapshot = freezeDeep({
      status: 'active',
      session,
      version: this.#snapshot.version + 1,
    });
    return session;
  }
}

function emptySnapshot(version) {
  return freezeDeep({ status: 'empty', session: null, version });
}

function assertInspection(inspection) {
  if (!inspection || typeof inspection !== 'object') {
    throw new TypeError('Analysis session requires an input inspection.');
  }
  if (!Array.isArray(inspection.fields) || !inspection.readiness) {
    throw new TypeError('Analysis session inspection is invalid.');
  }
  if (inspection.workspaceReadiness && inspection.workspaceReadiness.readyToReview !== true) {
    throw new TypeError('Analysis session inspection is not reviewable.');
  }
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Analysis session ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function integerValue(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`Analysis session ${field} must be a non-negative integer.`);
  }
  return value;
}

export const AnalysisSessions = new AnalysisSessionStore();
