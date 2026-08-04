import { createLoadCalculationReviewModel, validateLoadCalculationReviewModel } from '../core/load-calculation-consumer/index.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';
import { ENGINEERING_MODEL_EVENTS } from './engineering-model-controller.js';
import { engineeringModelStore } from './engineering-model-store.js';
import { renderEngineeringLoadPane, renderLoadCalcConsumer } from './load-calc-consumer-view.js';

/** Coordinates the real empirical load workflow without generating inputs. */
export class LoadCalcConsumerController {
  constructor(rootElement, consumerController, eventBus) {
    if (!rootElement) throw new TypeError('Load Calc requires a stable root element.');
    this.rootElement = rootElement;
    this.consumerController = consumerController;
    this.eventBus = eventBus;
    this.context = consumerController?.getContext() || null;
    this.reviewModel = buildReviewModel(this.context);
    this.activeTab = 'loads';
    this.message = '';
    this.unsubscribers = [];
    this.renderRevision = 0;
    this.topologyEdit3DController = null;
    this.clickHandler = (event) => this.handleClick(event);
  }

  init() {
    if (this.unsubscribers.length) return;
    this.rootElement.addEventListener('click', this.clickHandler);
    this.unsubscribers = [
      this.eventBus.subscribe(APPLICATION_EVENTS.CONTEXT_CHANGED, ({ context }) => this.handleContext(context)),
      this.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, () => this.render()),
      this.eventBus.subscribe(ENGINEERING_MODEL_EVENTS.CHANGED, ({ reason, distribution }) => this.handleEngineeringChange(reason, distribution)),
      this.eventBus.subscribe(ENGINEERING_MODEL_EVENTS.FAILED, ({ message }) => this.handleFailure(message)),
      this.eventBus.subscribe(EVENT_TOPICS.LOAD_CALC_SUBTAB_REQUESTED, ({ tab }) => { this.activeTab = tab; this.render(); }),
    ];
    this.render();
  }

  handleContext(context) {
    this.context = context;
    this.reviewModel = buildReviewModel(context);
    this.render();
  }

  handleEngineeringChange(reason, distribution) {
    if (reason === 'calculated') this.message = distribution?.status === 'CALCULATED' ? 'Authorized calculation complete.' : 'Authorized calculation blocked; review the listed inputs.';
    if (reason === 'project-data-changed') this.message = 'Project Data changed; authorization and previous calculations are stale.';
    if (reason === 'master-data-changed') this.message = 'Master data changed; authorization and previous calculations are stale.';
    if (reason === 'authorization-changed') this.message = availabilityMessage(engineeringModelStore.getEmpiricalAuthorizationState());
    this.render();
  }

  handleFailure(message) {
    this.message = message || 'Load calculation failed.';
    this.render();
  }

  handleClick(event) {
    const supportEntityId = event.target.closest('[data-load-support-entity-id]')?.dataset.loadSupportEntityId;
    if (supportEntityId) { this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, { entityId: supportEntityId, source: 'load-table' }); return; }
    const tab = event.target.closest('[data-load-calc-tab]')?.dataset.loadCalcTab;
    if (tab) { this.activeTab = tab; this.render(); return; }
    if (event.target.closest('[data-engineering-load-calculate]')) {
      const authorization = engineeringModelStore.getEmpiricalAuthorizationState();
      if (!authorization.calculationEligible) {
        this.message = availabilityMessage(authorization);
        this.render();
        return;
      }
      this.message = 'Executing current authorized empirical package…';
      this.eventBus.publish(ENGINEERING_MODEL_EVENTS.CALCULATE_REQUESTED, { source: 'load-calc' });
    }
  }

  render() {
    if (this.activeTab !== '3d' && this.topologyEdit3DController) {
      this.topologyEdit3DController.deactivate();
      this.topologyEdit3DController = null;
      resetTopologyEditCleanShell(this.rootElement.ownerDocument);
    }
    this.renderRevision += 1;
    const revision = this.renderRevision;
    const authorizationState = engineeringModelStore.getEmpiricalAuthorizationState();
    const view = renderLoadCalcConsumer(this.rootElement.ownerDocument, {
      activeTab: this.activeTab,
      message: this.message,
      distribution: engineeringModelStore.getDistribution(),
      authorizedExecution: engineeringModelStore.getAuthorizedExecution(),
      authorizationState,
      supportSiteModel: engineeringModelStore.getSupportSiteModel(),
      routePartitionModel: engineeringModelStore.getRoutePartitionModel(),
    });
    this.rootElement.replaceChildren(view);
    const pane = view.querySelector('[data-load-calc-pane]');
    if (this.activeTab === 'loads') renderEngineeringLoadPane(
      pane,
      engineeringModelStore.getDistribution(),
      engineeringModelStore.getSupportSiteModel(),
      engineeringModelStore.getRoutePartitionModel(),
      engineeringModelStore.getAuthorizedExecution(),
      authorizationState,
    );
    else this.renderDeferredPane(this.activeTab, pane, revision);
  }

  async renderDeferredPane(tab, pane, revision) {
    try {
      if (tab === 'preflight') {
        const { renderEmpiricalPreflightView } = await import('./empirical-preflight-view.js');
        if (revision === this.renderRevision) renderEmpiricalPreflightView(pane, this.context);
      } else if (tab === 'project-data') {
        const { renderProjectDataView } = await import('./project-data/project-data-view.js');
        if (revision === this.renderRevision) renderProjectDataView(pane, () => this.render());
      } else if (tab === 'masters') {
        const { renderMasterDataUI } = await import('./master-data-ui.js');
        if (revision === this.renderRevision) pane.replaceChildren(renderMasterDataUI(pane.ownerDocument));
      } else if (tab === 'json-trace') {
        const { renderJsonTraceUI } = await import('./json-trace-ui.js');
        if (revision === this.renderRevision) pane.replaceChildren(renderJsonTraceUI(pane.ownerDocument));
      } else if (tab === '3d') {
        const { TopologyEdit3DViewController } = await import('./topology-edit-3d-professional-controller.js');
        if (revision !== this.renderRevision) return;
        if (!this.topologyEdit3DController?.hostElement) {
          resetTopologyEditCleanShell(this.rootElement.ownerDocument);
          const controller = new TopologyEdit3DViewController(this.eventBus);
          this.topologyEdit3DController = controller;
          await controller.activate();
          if (revision !== this.renderRevision) {
            controller.deactivate();
            if (this.topologyEdit3DController === controller) this.topologyEdit3DController = null;
            resetTopologyEditCleanShell(this.rootElement.ownerDocument);
            return;
          }
        }
        if (revision === this.renderRevision) this.topologyEdit3DController.renderPane(pane);
      } else {
        throw new RangeError(`Unknown Load Calc tab: ${tab}.`);
      }
    } catch (error) {
      if (revision === this.renderRevision) pane.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  getReviewModel() {
    return this.reviewModel && validateLoadCalculationReviewModel(this.reviewModel).ok ? this.reviewModel : null;
  }

  destroy() {
    this.topologyEdit3DController?.deactivate();
    this.topologyEdit3DController = null;
    resetTopologyEditCleanShell(this.rootElement.ownerDocument);
    this.rootElement.removeEventListener('click', this.clickHandler);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.rootElement.replaceChildren();
    this.context = null;
    this.reviewModel = null;
  }
}

/** Preserves the prior public W10.9 readiness contract. */
export function createLoadCalcActionAvailability(context, reviewModel) {
  const contracts = context?.contracts || {};
  const hasModelLoads = Boolean(reviewModel);
  const canRebuildModelLoads = Boolean(contracts.topologyGraph);
  const hasPathInputs = Boolean(hasModelLoads && contracts.sharedModel && contracts.topologyGraph && contracts.supportAttachmentModel && contracts.restraintCapabilityModel);
  const hasPathModel = Boolean(hasModelLoads && contracts.verticalLoadPathModel);
  return Object.freeze({
    rebuildModelLoads: canRebuildModelLoads,
    exportModelLoads: hasModelLoads,
    rebuildPaths: hasPathInputs,
    runScreening: hasPathModel,
    exportScreening: Boolean(reviewModel?.summary.screeningIncluded),
  });
}

function availabilityMessage(state) {
  const reason = state?.reasonCode || state?.state || 'EMPIRICAL_PACKAGE_REQUIRED';
  const messages = {
    NO_ACTIVE_DATASET: 'Load calculation requires an active normalized dataset.',
    EMPIRICAL_PACKAGE_REQUIRED: 'Load calculation requires an explicitly authorized empirical package.',
    AUTHORIZATION_BINDINGS_CHANGED: 'The authorized empirical package is stale; authorize a package for the current dataset and evidence.',
    PROJECT_DATA_CHANGED: 'Project Data changed; a new authorized empirical package is required.',
    MASTER_DATA_CHANGED: 'Master data changed; a new authorized empirical package is required.',
    DATASET_EDITED: 'The dataset changed; a new authorized empirical package is required.',
    DATASET_REBUILT: 'The dataset model was rebuilt; a new authorized empirical package is required.',
    DATASET_REPLACED: 'The active dataset changed; a new authorized empirical package is required.',
  };
  return messages[reason] || `Load calculation is disabled: ${reason}.`;
}

function resetTopologyEditCleanShell(documentRef) {
  const host = documentRef?.querySelector('[data-role="topology-edit-render-host"]');
  if (!host) return;
  const mountedWorkspace = host.querySelector('[data-role="topology-edit-workspace"]');
  if (mountedWorkspace?.isConnected) return;
  delete host.dataset.topologyEditCleanShell;
  host.classList.remove('topology-edit-clean-shell');
}

function buildReviewModel(context) {
  const contracts = context?.contracts || {};
  if (!context || !contracts.sharedModel || !contracts.loadCaseSet || !contracts.loadPrimitiveSet || !contracts.modelLoadReadinessAudit) return null;
  try { return createLoadCalculationReviewModel(context); } catch { return null; }
}