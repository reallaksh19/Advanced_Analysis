import {
  validateSolverResultContract,
} from '../core/solvers/certification/solverResultContract.js';
import { createAnalysisContext } from './analysis-context.js';
import { AnalysisCapabilityError } from './analysis-capability-registry.js';
import {
  assertSessionMatchesContext,
  withAnalysisSession,
} from './analysis-session-context.js';
import { AnalysisSessions } from './analysis-session-store.js';
import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { WorkspaceState } from './workspace-state.js';

export class AnalysisCoordinator {
  constructor(
    eventBus = EventBus,
    workspaceState = WorkspaceState,
    registry,
    sessionStore = AnalysisSessions,
  ) {
    if (!registry) throw new TypeError('AnalysisCoordinator requires a capability registry.');
    this.eventBus = eventBus;
    this.workspaceState = workspaceState;
    this.registry = registry;
    this.sessionStore = sessionStore;
    this.unsubscribers = [];
    this.requestSequence = 0;
    this.selectionVersion = 0;
    this.destroyed = false;
  }

  init() {
    if (this.unsubscribers.length) return;
    this.destroyed = false;
    this.unsubscribers = [
      this.eventBus.subscribe(
        EVENT_TOPICS.VIEWPORT_ENTITY_SELECTED,
        ({ entityId }) => this.handleSelection(entityId),
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.ANALYSIS_REQUESTED,
        (payload) => { void this.run(payload); },
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.DATASET_CLEARED,
        () => this.handleClear(),
      ),
    ];
  }

  handleSelection(entityId) {
    const snapshot = this.workspaceState.getSnapshot();
    if (snapshot.selectedEntityId !== entityId) return;
    this.selectionVersion += 1;
    const context = createAnalysisContext(this.workspaceState, entityId);
    this.eventBus.publish(EVENT_TOPICS.ANALYSIS_CAPABILITIES_CHANGED, {
      targetId: entityId,
      capabilities: this.registry.list(context),
    });
  }

  async run({ analysisType, targetId, sessionId = '' }) {
    const requestId = `analysis-${++this.requestSequence}`;
    const selectionVersion = this.selectionVersion;
    const lifecycle = { requestId, analysisType, targetId, sessionId };
    this.eventBus.publish(EVENT_TOPICS.ANALYSIS_STARTED, lifecycle);

    try {
      const snapshot = this.workspaceState.getSnapshot();
      if (snapshot.selectedEntityId !== targetId) {
        throw new AnalysisCapabilityError(
          'STALE_ANALYSIS_TARGET',
          `Analysis target is not the active selection: ${targetId}.`,
        );
      }
      if (!sessionId) {
        throw new AnalysisCapabilityError(
          'UNREVIEWED_ANALYSIS_SESSION',
          'Workspace analysis requires an active reviewed input session.',
        );
      }
      let context = createAnalysisContext(this.workspaceState, targetId);
      const session = this.sessionStore.getSession(sessionId);
      assertSessionMatchesContext(session, context, analysisType);
      context = withAnalysisSession(context, session);
      const readiness = this.registry.readiness(analysisType, context);
      if (!readiness.readyToRun) {
        throw new AnalysisCapabilityError(
          'REVIEWED_INPUTS_NOT_RUNNABLE',
          readiness.diagnostics[0]?.message || 'Reviewed analysis inputs are not runnable.',
          { readiness },
        );
      }
      const result = await this.registry.execute(analysisType, context);
      if (this.shouldIgnore(selectionVersion, targetId, sessionId)) return;
      const validation = validateSolverResultContract(result);
      if (!validation.ok) {
        throw new AnalysisCapabilityError(
          'INVALID_SOLVER_RESULT',
          `Analysis result contract is invalid: ${validation.errors.join(' ')}`,
          { errors: validation.errors },
        );
      }
      this.eventBus.publish(EVENT_TOPICS.ANALYSIS_COMPLETED, {
        ...lifecycle,
        result,
      });
    } catch (error) {
      if (this.shouldIgnore(selectionVersion, targetId, sessionId, true)) return;
      this.eventBus.publish(EVENT_TOPICS.ANALYSIS_FAILED, {
        ...lifecycle,
        code: String(error?.code || 'ANALYSIS_EXECUTION_FAILED'),
        message: error instanceof Error ? error.message : String(error),
        details: error?.details && typeof error.details === 'object' ? error.details : {},
      });
    }
  }

  shouldIgnore(selectionVersion, targetId, sessionId = '', allowMissingSession = false) {
    if (this.destroyed || selectionVersion !== this.selectionVersion) return true;
    if (this.workspaceState.getSnapshot().selectedEntityId !== targetId) return true;
    if (sessionId && !allowMissingSession && !this.sessionStore.getSession(sessionId)) return true;
    return false;
  }

  handleClear() {
    this.selectionVersion += 1;
    this.eventBus.publish(EVENT_TOPICS.ANALYSIS_CAPABILITIES_CHANGED, {
      targetId: '',
      capabilities: [],
    });
  }

  destroy() {
    this.destroyed = true;
    this.selectionVersion += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }
}
