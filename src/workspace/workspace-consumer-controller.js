import {
  createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistryV11,
  workspaceConsumerDescriptor,
} from '../core/workspace-consumers/index.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';
import { EventBus } from './event-bus.js';
import { ModelCalculationStore } from './model-calculation-store.js';
import { MODEL_CALCULATION_EVENTS } from './model-calculation-events.js';
import { ModelLoadStore } from './model-load-store.js';
import { MODEL_LOAD_EVENTS } from './model-load-events.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { SupportLoadScreeningStore } from './support-load-screening-store.js';
import { SUPPORT_LOAD_SCREENING_EVENTS } from './support-load-screening-events.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { SUPPORT_RESTRAINT_EVENTS } from './support-restraint-events.js';
import { TopologyStore } from './topology-store.js';
import { TOPOLOGY_EVENTS } from './topology-events.js';
import { VerticalBeamStore } from './vertical-beam-store.js';
import { VERTICAL_BEAM_EVENTS } from './vertical-beam-events.js';
import { WorkspaceState } from './workspace-state.js';

export class WorkspaceConsumerController {
  constructor(eventBus = EventBus) {
    this.eventBus = eventBus;
    this.registry = createWorkspaceConsumerRegistryV11();
    this.context = this.buildContext();
    this.readiness = this.buildReadiness();
    this.unsubscribeCallbacks = [];
  }
  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = contextTopics().map((topic) => this.eventBus.subscribe(topic, () => this.refresh(topic)));
    this.publishChanged('initialized');
  }
  refresh(reason) {
    const nextContext = this.buildContext();
    const nextReadiness = createWorkspaceConsumerReadinessRegistry(this.registry, nextContext, { workspaceBooted: true });
    this.context = nextContext;
    this.readiness = nextReadiness;
    this.publishChanged(reason);
  }
  buildContext() {
    const snapshot = WorkspaceState.getSnapshot();
    return createWorkspaceConsumerContext({
      datasetId: snapshot.dataset?.datasetId || null,
      workspaceVersion: snapshot.version,
      selectedEntityId: snapshot.selectedEntityId || null,
      contracts: sourceContracts(snapshot),
    });
  }
  buildReadiness() { return createWorkspaceConsumerReadinessRegistry(this.registry, this.context, { workspaceBooted: true }); }
  publishChanged(reason) {
    this.eventBus.publish(APPLICATION_EVENTS.CONTEXT_CHANGED, { context: this.context, readiness: this.readiness, reason });
  }
  getContext() { return this.context; }
  getRegistry() { return this.registry; }
  listConsumers() { return this.registry.consumers; }
  listReadiness() { return this.readiness; }
  getReadiness(consumerId) {
    workspaceConsumerDescriptor(this.registry, consumerId);
    return this.readiness.find((row) => row.consumerId === consumerId);
  }
  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.context = null;
    this.readiness = Object.freeze([]);
  }
}

function sourceContracts(snapshot) {
  return {
    sharedModel: snapshot.status === 'ready' ? snapshot.dataset?.sharedModel || null : null,
    topologyGraph: TopologyStore.getGraph(), topologyAudit: TopologyStore.getAudit(),
    supportAttachmentModel: SupportRestraintStore.getAttachmentModel(), supportAttachmentAudit: SupportRestraintStore.getAttachmentAudit(),
    restraintCapabilityModel: SupportRestraintStore.getRestraintModel(), restraintCapabilityAudit: SupportRestraintStore.getRestraintAudit(),
    loadCaseSet: ModelLoadStore.getLoadCaseSet(), loadPrimitiveSet: ModelLoadStore.getLoadPrimitiveSet(), modelLoadReadinessAudit: ModelLoadStore.getReadinessAudit(),
    verticalLoadPathModel: SupportLoadScreeningStore.getPathModel(), supportLoadScreening: SupportLoadScreeningStore.getScreening(), supportLoadScreeningAudit: SupportLoadScreeningStore.getAudit(),
    flexuralPropertyProjection: VerticalBeamStore.getFlexuralProjection(), verticalBeamModel: VerticalBeamStore.getBeamModel(),
    verticalBeamSolution: VerticalBeamStore.getSolution(), verticalBeamSolverAudit: VerticalBeamStore.getAudit(),
    modelCalculationLedger: ModelCalculationStore.getLedger(), activeModelCalculationPackage: ModelCalculationStore.getActivePackage(), activeModelCalculationReport: ModelCalculationStore.getActiveReport(),
  };
}
function contextTopics() {
  return [EVENT_TOPICS.DATASET_LOADED, EVENT_TOPICS.DATASET_CLEARED, EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED,
    SHARED_MODEL_EVENTS.CHANGED, TOPOLOGY_EVENTS.CHANGED, SUPPORT_RESTRAINT_EVENTS.CHANGED, MODEL_LOAD_EVENTS.CHANGED,
    SUPPORT_LOAD_SCREENING_EVENTS.CHANGED, VERTICAL_BEAM_EVENTS.CHANGED, MODEL_CALCULATION_EVENTS.CHANGED];
}
