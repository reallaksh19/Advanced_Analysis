import { APPLICATION_EVENTS, EVENT_TOPICS } from '../event-topics.js';
import {
  empiricalLoadCalcScenarioStore,
} from './empirical-load-calc-scenario-store.js';

export const EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS = Object.freeze({
  CONFIGURE_REQUESTED: 'empirical-load-calc-scenario:configure-requested',
  AUTHORIZE_REQUESTED: 'empirical-load-calc-scenario:authorize-requested',
  CALCULATE_REQUESTED: 'empirical-load-calc-scenario:calculate-requested',
  CLONE_PROFILE_REQUESTED: 'empirical-load-calc-scenario:clone-profile-requested',
  CHANGED: 'empirical-load-calc-scenario:changed',
  FAILED: 'empirical-load-calc-scenario:failed',
});

export class EmpiricalLoadCalcScenarioController {
  constructor(eventBus, authorityProvider = null, store = empiricalLoadCalcScenarioStore) {
    if (!eventBus || typeof eventBus.subscribe !== 'function'
      || typeof eventBus.publish !== 'function') {
      throw new TypeError('Empirical Load Calc scenario controller requires an event bus.');
    }
    this.eventBus = eventBus;
    this.authorityProvider = typeof authorityProvider === 'function'
      ? authorityProvider
      : () => null;
    this.store = store;
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
      this.store.subscribe((snapshot) => this.eventBus.publish(
        EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CHANGED,
        { snapshot },
      )),
    ];
    this.eventBus.publish(
      EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CHANGED,
      { snapshot: this.store.getSnapshot() },
    );
  }

  configure(value) {
    return this.#run('configure', () => this.store.configure(value));
  }

  authorize(value = {}) {
    return this.#run('authorize', () => this.store.authorize({
      authorizationId: value.authorizationId || generatedId('AUTH'),
      authorizedAt: value.authorizedAt || new Date().toISOString(),
    }));
  }

  calculate(value = {}) {
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
        { snapshot: this.store.getSnapshot(), clonedProfile: profile },
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

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.store.clear('EMPIRICAL_SCENARIO_CONTROLLER_DESTROYED');
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
