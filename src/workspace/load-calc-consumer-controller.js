import {
  createLoadCalculationReviewModel,
  validateLoadCalculationReviewModel,
} from '../core/load-calculation-consumer/index.js';
import { EventBus } from './event-bus.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';
import { MODEL_LOAD_EVENTS } from './model-load-events.js';
import { SUPPORT_LOAD_SCREENING_EVENTS } from './support-load-screening-events.js';
import { renderLoadCalcConsumer } from './load-calc-consumer-view.js';
import { createWorkspaceMockPackage } from './advanced-mock-data.js';

const ACTION_FAILURES = Object.freeze({
  rebuildModelLoads: 'Complete validated W10.4 evidence is required.',
  exportModelLoads: 'Complete validated W10.4 evidence is required for export.',
  rebuildPaths: 'Validated topology and support/restraint evidence is required to rebuild vertical load paths.',
  runScreening: 'A validated vertical-load-path model and W10.4 model-load evidence are required for screening.',
  exportScreening: 'Complete linked W10.5 screening evidence is required for export.',
});

export class LoadCalcConsumerController {
  constructor(rootElement, consumerController, eventBus = EventBus) {
    this.rootElement = rootElement;
    this.consumerController = consumerController;
    this.eventBus = eventBus;
    this.context = consumerController?.getContext() || null;
    this.reviewModel = buildReviewModel(this.context);
    this.actionAvailability = createLoadCalcActionAvailability(this.context, this.reviewModel);
    this.status = {};
    this.uiState = {
      activeLoadCase: '',
      searchQuery: '',
      qualificationFilter: 'ALL',
      typeFilter: 'ALL',
      selectedPrimitiveId: ''
    };
    this.unsubscribeCallbacks = [];
  }
  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(APPLICATION_EVENTS.CONTEXT_CHANGED, ({ context }) => this.handleContext(context)),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.CHANGED, ({ reason }) => this.handleChanged(reason, 'Model-load evidence updated.')),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.REBUILD_FAILED, ({ message }) => this.handleFailure(message)),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleExport(artifact)),
      this.eventBus.subscribe(MODEL_LOAD_EVENTS.EXPORT_FAILED, ({ message }) => this.handleFailure(message)),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.CHANGED, ({ reason }) => this.handleChanged(reason, 'Tributary-screening evidence updated.')),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.PATH_REBUILD_FAILED, ({ message }) => this.handleFailure(message)),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.RUN_FAILED, ({ message }) => this.handleFailure(message)),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_COMPLETED, ({ artifact }) => this.handleExport(artifact)),
      this.eventBus.subscribe(SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_FAILED, ({ message }) => this.handleFailure(message)),
    ];
    this.render();
  }
  handleContext(context) {
    this.context = context;
    this.reviewModel = buildReviewModel(context);
    this.actionAvailability = createLoadCalcActionAvailability(context, this.reviewModel);
    // Reset selected case if it no longer exists
    if (this.reviewModel && this.reviewModel.loadCases.length > 0) {
      if (!this.reviewModel.loadCases.find(c => c.loadCaseId === this.uiState.activeLoadCase)) {
        this.uiState.activeLoadCase = this.reviewModel.loadCases[0].loadCaseId;
        this.uiState.selectedPrimitiveId = '';
      }
    }
    this.render();
  }
  handleChanged(reason, fallback) {
    if (reason === 'explicit' || reason === 'screened') this.status = { message: fallback };
    this.render();
  }
  handleFailure(message) { this.status = { message: message || 'Load Calc action failed.' }; this.render(); }
  handleExport(artifact) { this.status = { message: `Exported ${artifact.filename}` }; this.render(); }
  render() {
    if (!this.rootElement) return;
    const missingContracts = getMissingLoadCalcContracts(this.context);
    
    // Default active case if empty
    if (!this.uiState.activeLoadCase && this.reviewModel && this.reviewModel.loadCases.length > 0) {
      this.uiState.activeLoadCase = this.reviewModel.loadCases[0].loadCaseId;
    }
    
    const view = renderLoadCalcConsumer(
      this.rootElement.ownerDocument,
      this.reviewModel,
      this.status,
      this.actionAvailability,
      missingContracts,
      this.uiState
    );
    this.rootElement.replaceChildren(view);
    bind(view, 'load-mock-data', () => this.loadMockData());
    bind(view, 'rebuild-model-loads', () => this.publishAction('rebuildModelLoads', MODEL_LOAD_EVENTS.REBUILD_REQUESTED));
    bind(view, 'export-model-loads', () => this.publishAction('exportModelLoads', MODEL_LOAD_EVENTS.EXPORT_REQUESTED));
    bind(view, 'rebuild-paths', () => this.publishAction('rebuildPaths', SUPPORT_LOAD_SCREENING_EVENTS.REBUILD_PATHS_REQUESTED));
    bind(view, 'run-screening', () => this.publishAction('runScreening', SUPPORT_LOAD_SCREENING_EVENTS.RUN_REQUESTED));
    bind(view, 'export-screening', () => this.publishAction('exportScreening', SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_REQUESTED));
    
    // Bind UI state events
    const documentRef = this.rootElement.ownerDocument;
    view.querySelectorAll('[data-action="tab-load-case"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.uiState.activeLoadCase = e.currentTarget.dataset.case;
        this.uiState.selectedPrimitiveId = ''; // Clear selection on tab switch
        this.render();
      });
    });
    
    const searchInput = view.querySelector('[data-role="filter-search"]');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.uiState.searchQuery = e.target.value;
        this.render();
        // Restore focus to search input after render
        const newSearchInput = this.rootElement.querySelector('[data-role="filter-search"]');
        if (newSearchInput) {
          newSearchInput.focus();
          newSearchInput.setSelectionRange(newSearchInput.value.length, newSearchInput.value.length);
        }
      });
    }
    
    const qualFilter = view.querySelector('[data-role="filter-qualification"]');
    if (qualFilter) qualFilter.addEventListener('change', (e) => { this.uiState.qualificationFilter = e.target.value; this.render(); });
    
    const typeFilter = view.querySelector('[data-role="filter-type"]');
    if (typeFilter) typeFilter.addEventListener('change', (e) => { this.uiState.typeFilter = e.target.value; this.render(); });
    
    const tableRows = view.querySelectorAll('.load-calc-table tbody tr[data-primitive-id]');
    tableRows.forEach(row => {
      row.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.primitiveId;
        this.uiState.selectedPrimitiveId = this.uiState.selectedPrimitiveId === id ? '' : id;
        this.render();
      });
    });
  }
  publishAction(actionKey, topic) {
    if (!this.actionAvailability[actionKey]) return this.handleFailure(ACTION_FAILURES[actionKey]);
    this.eventBus.publish(topic, {});
  }
  loadMockData() {
    this.status = { message: 'Loading [SIMULATED] Workspace and Load Calc inputs.' };
    this.render();
    this.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, {
      rawPackage: createWorkspaceMockPackage(),
      sourceName: '[SIMULATED]-advanced-load-calc.json',
    });
  }
  getReviewModel() {
    return validateLoadCalculationReviewModel(this.reviewModel).ok ? this.reviewModel : null;
  }
  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.context = null;
    this.reviewModel = null;
    this.actionAvailability = Object.freeze({});
    this.consumerController = null;
    this.status = {};
    this.uiState = {};
    this.rootElement?.replaceChildren();
  }
}

export function createLoadCalcActionAvailability(context, reviewModel) {
  const contracts = context?.contracts || {};
  const hasModelLoads = Boolean(reviewModel);
  const canRebuildModelLoads = Boolean(contracts.topologyGraph);
  const hasPathInputs = Boolean(hasModelLoads
    && contracts.sharedModel
    && contracts.topologyGraph
    && contracts.supportAttachmentModel
    && contracts.restraintCapabilityModel);
  const hasPathModel = Boolean(hasModelLoads && contracts.verticalLoadPathModel);
  return Object.freeze({
    rebuildModelLoads: canRebuildModelLoads,
    exportModelLoads: hasModelLoads,
    rebuildPaths: hasPathInputs,
    runScreening: hasPathModel,
    exportScreening: Boolean(reviewModel?.summary.screeningIncluded),
  });
}

function buildReviewModel(context) {
  try { return context ? createLoadCalculationReviewModel(context) : null; }
  catch (error) {
    console.error('[LoadCalc] buildReviewModel failed:', error);
    return null;
  }
}

function getMissingLoadCalcContracts(context) {
  const contracts = context?.contracts || {};
  return {
    sharedModel: !contracts.sharedModel,
    loadCaseSet: !contracts.loadCaseSet,
    loadPrimitiveSet: !contracts.loadPrimitiveSet,
    modelLoadReadinessAudit: !contracts.modelLoadReadinessAudit,
  };
}

function bind(view, action, callback) {
  view.querySelector(`[data-load-calc-action="${action}"]`)?.addEventListener('click', callback);
}
