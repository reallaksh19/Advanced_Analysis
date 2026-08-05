import { APPLICATION_EVENTS, EVENT_TOPICS } from '../event-topics.js';
import {
  empiricalLoadCalcScenarioStore,
} from './empirical-load-calc-scenario-store.js';
import {
  empiricalResultOverlayStore,
} from './empirical-result-overlay-store.js';

export const EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS = Object.freeze({
  CONFIGURE_REQUESTED: 'empirical-load-calc-scenario:configure-requested',
  AUTHORIZE_REQUESTED: 'empirical-load-calc-scenario:authorize-requested',
  CALCULATE_REQUESTED: 'empirical-load-calc-scenario:calculate-requested',
  CLONE_PROFILE_REQUESTED: 'empirical-load-calc-scenario:clone-profile-requested',
  CHANGED: 'empirical-load-calc-scenario:changed',
  RESULT_OVERLAY_CHANGED: 'empirical-load-calc-scenario:result-overlay-changed',
  FAILED: 'empirical-load-calc-scenario:failed',
});

export class EmpiricalLoadCalcScenarioController {
  constructor(
    eventBus,
    authorityProvider = null,
    store = empiricalLoadCalcScenarioStore,
    resultOverlayStore = empiricalResultOverlayStore,
  ) {
    if (!eventBus || typeof eventBus.subscribe !== 'function'
      || typeof eventBus.publish !== 'function') {
      throw new TypeError('Empirical Load Calc scenario controller requires an event bus.');
    }
    this.eventBus = eventBus;
    this.authorityProvider = typeof authorityProvider === 'function'
      ? authorityProvider
      : () => null;
    this.store = store;
    this.resultOverlayStore = resultOverlayStore;
    this.unsubscribers = [];
  }

  init() {
    if (this.unsubscribers.length) return;
    this.unsubscribers = [
      this.eventBus.subscribe(
        EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CONFIGURE_REQUESTED,
        (payload) => this.configure(payload),
      ),
      this.eventBus.subscribe(
        EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.AUTHORIZE_REQUESTED,
        (payload) => this.authorize(payload),
      ),
      this.eventBus.subscribe(
        EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CALCULATE_REQUESTED,
        (payload) => this.calculate(payload),
      ),
      this.eventBus.subscribe(
        EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CLONE_PROFILE_REQUESTED,
        (payload) => this.cloneProfile(payload),
      ),
      this.eventBus.subscribe(
        EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED,
        () => this.refresh(),
      ),
      this.eventBus.subscribe(
        APPLICATION_EVENTS.CONTEXT_CHANGED,
        () => this.refresh(),
      ),
      this.store.subscribe((snapshot) => this.#publishScenarioState(snapshot)),
      this.resultOverlayStore.subscribe(({ snapshot, projection, details }) => {
        this.eventBus.publish(
          EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.RESULT_OVERLAY_CHANGED,
          { snapshot, projection, details },
        );
      }),
    ];
    this.#publishScenarioState(this.store.getSnapshot());
  }

  configure(value) {
    return this.#run('configure', () => this.store.configure(value));
  }

  authorize(value = {}) {
    this.refresh();
    return this.#run('authorize', () => this.store.authorize({
      authorizationId: value.authorizationId || generatedId('AUTH'),
      authorizedAt: value.authorizedAt || new Date().toISOString(),
    }));
  }

  calculate(value = {}) {
    this.refresh();
    return this.#run('calculate', () => this.store.execute({
      executionId: value.executionId || generatedId('EXEC'),
      executedAt: value.executedAt || new Date().toISOString(),
    }));
  }

  cloneProfile(value = {}) {
    return this.#run('clone-profile', () => {
      const profile = this.store.cloneProfile(value);
      this.eventBus.publish(
        EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CHANGED,
        {
          snapshot: this.store.getSnapshot(),
          overlaySnapshot: this.resultOverlayStore.getSnapshot(),
          clonedProfile: profile,
        },
      );
      return profile;
    });
  }

  refresh() {
    const proposal = this.store.getProposal();
    if (!proposal) return this.store.getSnapshot();
    try {
      const provided = this.authorityProvider(proposal);
      if (!provided) return this.store.getSnapshot();
      return this.store.refresh({
        datasetId: provided.datasetId,
        adaptedRequestSemanticHash: proposal.adaptedRequest.semanticHash,
        runtimeProfileSemanticHash: proposal.runtimeProfile.semanticHash,
        sharedModelSemanticHash: provided.sharedModel?.semanticHash || 'missing:shared-model',
        topologySemanticHash: provided.topologyGraph?.semanticHash || 'missing:topology',
        attachmentSemanticHash:
          provided.supportAttachmentModel?.semanticHash || 'missing:attachment',
        restraintSemanticHash:
          provided.restraintCapabilityModel?.semanticHash || 'missing:restraint',
        loadPrimitiveSetSemanticHash:
          provided.sourceLoadPrimitiveSet?.semanticHash || 'missing:load-primitives',
      });
    } catch (error) {
      this.#publishFailure('refresh', error);
      return this.store.getSnapshot();
    }
  }

  getSnapshot() { return this.store.getSnapshot(); }
  getProposal() { return this.store.getProposal(); }
  getAuthorization() { return this.store.getAuthorization(); }
  getExecution() { return this.store.getExecution(); }
  getResultOverlaySnapshot() { return this.resultOverlayStore.getSnapshot(); }
  getResultOverlayProjection() { return this.resultOverlayStore.getProjection(); }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.resultOverlayStore.clear('EMPIRICAL_SCENARIO_CONTROLLER_DESTROYED');
    this.store.clear('EMPIRICAL_SCENARIO_CONTROLLER_DESTROYED');
  }

  #publishScenarioState(snapshot) {
    const overlaySnapshot = this.resultOverlayStore.sync({
      snapshot,
      proposal: this.store.getProposal(),
      execution: this.store.getExecution(),
    });
    this.eventBus.publish(
      EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CHANGED,
      { snapshot, overlaySnapshot },
    );
  }

  #run(operation, callback) {
    try {
      return callback();
    } catch (error) {
      this.#publishFailure(operation, error);
      return null;
    }
  }

  #publishFailure(operation, error) {
    this.eventBus.publish(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.FAILED, {
      operation,
      code: error?.code || 'EMPIRICAL_SCENARIO_OPERATION_FAILED',
      message: error instanceof Error ? error.message : String(error),
      details: error?.details || null,
    });
  }
}

function generatedId(prefix) {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${random}`;
}
