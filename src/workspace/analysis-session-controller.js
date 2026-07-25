import { normalizeOverride } from './analysis-input-evidence.js';
import { createAnalysisContext } from './analysis-context.js';
import { withAnalysisSession } from './analysis-session-context.js';
import { AnalysisSessions } from './analysis-session-store.js';
import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { WorkspaceState } from './workspace-state.js';

export class AnalysisSessionController {
  constructor(
    eventBus = EventBus,
    workspaceState = WorkspaceState,
    registry,
    sessionStore = AnalysisSessions,
  ) {
    if (!registry) throw new TypeError('AnalysisSessionController requires a capability registry.');
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.registry = registry;
    this.sessionStore = sessionStore;
    this.unsubscribers = [];
  }

  init() {
    if (this.unsubscribers.length) return;
    this.unsubscribers = [
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_SESSION_OPEN_REQUESTED, (payload) => this.open(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_SESSION_OVERRIDE_REQUESTED, (payload) => this.override(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_SESSION_RESET_REQUESTED, (payload) => this.reset(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_SESSION_CLOSE_REQUESTED, () => this.clear()),
      this.eventBus.subscribe(EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED, ({ entityId }) => this.selectionChanged(entityId)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.clear()),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_STARTED, (payload) => this.started(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_COMPLETED, (payload) => this.completed(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_FAILED, (payload) => this.failed(payload)),
    ];
  }

  open({ analysisType, targetId }) {
    const context = createAnalysisContext(this.workspaceState, targetId);
    const snapshot = this.workspaceState.getSnapshot();
    const inspection = this.registry.inspect(analysisType, context);
    if (!inspection.workspaceReadiness.readyToReview) return null;
    const session = this.sessionStore.open({
      targetId,
      analysisType,
      datasetId: snapshot.dataset.datasetId,
      workspaceVersion: snapshot.version,
      inspection,
    });
    this.publish();
    return session;
  }

  override({ sessionId, fieldKey, value }) {
    const session = this.sessionStore.require(sessionId);
    const field = session.inputs.find((item) => item.key === fieldKey);
    if (!field) {
      this.sessionStore.recordFieldError(sessionId, fieldKey, `Unknown analysis input: ${fieldKey}.`);
      this.publish();
      return;
    }

    let normalized;
    try {
      normalized = normalizeOverride(field, value);
    } catch (error) {
      this.sessionStore.recordFieldError(sessionId, fieldKey, error.message);
      this.publish();
      return;
    }

    const overrides = { ...session.overrides };
    if (normalized === null) delete overrides[fieldKey];
    else overrides[fieldKey] = normalized;
    this.reinspect(session, overrides);
  }

  reset({ sessionId }) {
    const session = this.sessionStore.require(sessionId);
    this.reinspect(session, {});
  }

  reinspect(session, overrides) {
    const context = createAnalysisContext(this.workspaceState, session.targetId);
    const candidate = { ...session, overrides };
    const inspection = this.registry.inspect(
      session.analysisType,
      withAnalysisSession(context, candidate),
    );
    this.sessionStore.revise(session.sessionId, {
      overrides,
      fieldErrors: {},
      inspection,
    });
    this.publish();
  }

  selectionChanged(entityId) {
    const session = this.sessionStore.getSnapshot().session;
    if (session && session.targetId !== entityId) this.clear();
  }

  started(payload) {
    if (!payload.sessionId || !this.sessionStore.getSession(payload.sessionId)) return;
    this.sessionStore.markRunning(payload.sessionId, payload.requestId);
    this.publish();
  }

  completed(payload) {
    if (!payload.sessionId || !this.sessionStore.getSession(payload.sessionId)) return;
    this.sessionStore.markCompleted(payload.sessionId, payload.requestId, payload.result);
    this.publish();
  }

  failed(payload) {
    if (!payload.sessionId || !this.sessionStore.getSession(payload.sessionId)) return;
    this.sessionStore.markFailed(payload.sessionId, payload.requestId, {
      code: payload.code,
      message: payload.message,
      details: payload.details || {},
    });
    this.publish();
  }

  clear() {
    if (this.sessionStore.getSnapshot().status === 'empty') return;
    this.sessionStore.clear();
    this.publish();
  }

  publish() {
    const snapshot = this.sessionStore.getSnapshot();
    this.eventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_CHANGED, {
      session: snapshot.session,
      version: snapshot.version,
    });
  }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.sessionStore.clear();
  }
}
