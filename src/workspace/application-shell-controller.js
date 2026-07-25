import {
  APPLICATION_NAVIGATION_ORDER_V11,
  CONSUMER_IDS,
  IMPLEMENTATION_STATUS,
  READINESS_STATES,
  createApplicationViewStateV11,
  createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistryV11,
  refreshApplicationViewStateV11,
  transitionApplicationViewStateV11,
  workspaceConsumerDescriptor,
} from '../core/workspace-consumers/index.js';
import { EventBus } from './event-bus.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';
import { LoadCalcConsumerController } from './load-calc-consumer-controller.js';

/**
 * Owns only Advanced Analysis top-level navigation and view lifecycle.
 *
 * Workspace remains the authoritative context owner. Load Calc receives that
 * context through its existing controller, while both FEA controllers remain
 * dataset-independent and are injected through explicit options.
 */
export class ApplicationShellController {
  constructor(rootElement, consumerController, eventBus, options) {
    this.eventBus = eventBus;
    this.consumerController = consumerController;
    this.settingsController = options.settingsController;
    this.lafeaController = options.lafeaController;
    this.lfeaController = options.lfeaController;
    this.context = consumerController.getContext();
    this.registry = createWorkspaceConsumerRegistryV11();
    this.readiness = this.buildReadiness();
    this.state = createApplicationViewStateV11(this.readiness, {
      activeViewId: CONSUMER_IDS.WORKSPACE,
      version: 0,
    });
    this.view = new ApplicationShellView(rootElement, eventBus);
    this.loadCalcController = new LoadCalcConsumerController(
      rootElement?.querySelector('[data-role="load-calc-consumer-root"]'),
      consumerController,
      eventBus,
    );
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.view.init(this.registry);
    this.loadCalcController.init();
    this.lafeaController?.init();
    this.lfeaController?.init();
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(APPLICATION_EVENTS.CONTEXT_CHANGED, ({ context }) => this.handleContext(context)),
      this.eventBus.subscribe(APPLICATION_EVENTS.CHANGE_REQUESTED, (payload) => this.handleRequest(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOADED, () => this.handleDatasetReplacement()),
    ];
    this.view.render(this.state, this.readiness);
  }

  handleContext(context) {
    const previous = this.state.activeViewId;
    const datasetBoundary = isDatasetBoundary(this.context, context);
    const readinessChanged = this.context?.semanticHash !== context?.semanticHash;
    this.context = context;
    if (readinessChanged) this.readiness = this.buildReadiness();
    if (datasetBoundary && previous === CONSUMER_IDS.LOAD_CALC) {
      this.state = createApplicationViewStateV11(this.readiness, {
        activeViewId: CONSUMER_IDS.WORKSPACE,
        version: this.state.version + 1,
      });
    } else if (readinessChanged) {
      this.state = refreshApplicationViewStateV11(this.state, this.readiness);
    }
    if (datasetBoundary || readinessChanged) this.view.render(this.state, this.readiness);
    if (previous !== this.state.activeViewId) {
      this.publishChanged(previous, datasetBoundary ? 'dataset-replaced' : 'readiness-lost');
    }
  }

  handleDatasetReplacement() {
    if (this.state.activeViewId !== CONSUMER_IDS.LOAD_CALC) return;
    const previous = this.state.activeViewId;
    this.state = createApplicationViewStateV11(this.readiness, {
      activeViewId: CONSUMER_IDS.WORKSPACE,
      version: this.state.version + 1,
    });
    this.view.render(this.state, this.readiness);
    this.publishChanged(previous, 'dataset-replaced');
  }

  handleRequest({ viewId, source }) {
    const previous = this.state.activeViewId;
    try {
      const descriptor = workspaceConsumerDescriptor(this.registry, viewId);
      const readiness = this.getReadiness(viewId);
      assertImplementedAvailable(descriptor, readiness);
      const result = transitionApplicationViewStateV11(this.state, viewId, this.readiness);
      if (!result.activated) throw viewError('VIEW_NOT_AVAILABLE', `${descriptor.label} is unavailable.`);
      this.state = result.state;
      this.view.render(this.state, this.readiness);
      this.publishChanged(previous, source);
    } catch (error) {
      this.publishFailed(viewId, error);
    }
  }

  activate(viewId) {
    workspaceConsumerDescriptor(this.registry, viewId);
    this.eventBus.publish(APPLICATION_EVENTS.CHANGE_REQUESTED, { viewId, source: 'api' });
    return this.getPublicState();
  }

  publishChanged(previousViewId, reason) {
    this.eventBus.publish(APPLICATION_EVENTS.CHANGED, {
      state: this.state,
      previousViewId,
      reason,
    });
  }

  publishFailed(viewId, error) {
    const payload = {
      viewId,
      activeViewId: this.state.activeViewId,
      code: error.code || 'UNKNOWN_APPLICATION_VIEW',
      message: error instanceof Error ? error.message : String(error),
    };
    this.view.renderFailure(payload);
    this.eventBus.publish(APPLICATION_EVENTS.CHANGE_FAILED, payload);
  }

  buildReadiness() {
    return createWorkspaceConsumerReadinessRegistry(this.registry, this.context, {
      workspaceBooted: true,
      ...(this.settingsController?.getStatus() || {}),
    });
  }

  getState() { return this.state; }
  getPublicState() { return this.state; }
  getRegistry() { return this.registry; }
  listReadiness() { return this.readiness; }
  getReadiness(consumerId) {
    workspaceConsumerDescriptor(this.registry, consumerId);
    return this.readiness.find((row) => row.consumerId === consumerId);
  }
  getLoadCalculationReviewModel() { return this.loadCalcController.getReviewModel(); }
  getLafeaWorkbenchState() { return this.lafeaController?.getState() || null; }
  getLfeaWorkbenchState() { return this.lfeaController?.getState() || null; }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.lfeaController?.destroy();
    this.lafeaController?.destroy();
    this.loadCalcController.destroy();
    this.view.destroy();
    this.settingsController = null;
    this.lafeaController = null;
    this.lfeaController = null;
    this.context = null;
    this.state = null;
    this.readiness = Object.freeze([]);
  }
}

/**
 * Renders and keyboard-controls the exact v11 top-level navigation.
 */
export class ApplicationShellView {
  constructor(rootElement, eventBus) {
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.navElement = rootElement?.querySelector('[data-role="application-navigation"]') || null;
    this.statusElement = rootElement?.querySelector('[data-role="application-navigation-status"]') || null;
    this.views = new Map(APPLICATION_NAVIGATION_ORDER_V11.map((id) => [
      id,
      rootElement?.querySelector(`[data-application-view="${id}"]`) || null,
    ]));
    this.keydownHandler = (event) => this.handleKeydown(event);
  }

  init(registry) {
    if (!this.navElement) return;
    const byId = new Map(registry.consumers.map((row) => [row.consumerId, row]));
    this.navElement.replaceChildren(...APPLICATION_NAVIGATION_ORDER_V11.map((id) => this.navigationItem(byId.get(id))));
    this.navElement.addEventListener('keydown', this.keydownHandler);
  }

  render(state, readiness) {
    const byId = new Map(readiness.map((row) => [row.consumerId, row]));
    this.navElement?.querySelectorAll('[data-application-nav]').forEach((button) => {
      this.updateButton(button, state, byId.get(button.dataset.applicationNav));
    });
    this.views.forEach((element, id) => setViewVisibility(element, state?.activeViewId === id));
    if (this.statusElement) this.statusElement.textContent = '';
  }

  renderFailure(payload) {
    if (this.statusElement) this.statusElement.textContent = `${payload.code}: ${payload.message}`;
  }

  navigationItem(descriptor) {
    const documentRef = this.rootElement.ownerDocument;
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'application-navigation__item';
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.dataset.applicationNav = descriptor.consumerId;
    const icons = { WORKSPACE: 'W', LOAD_CALC: 'L', LAFEA: 'A', LFEA: 'F' };
    button.innerHTML = `<span class="nav-tab-icon" aria-hidden="true">${icons[descriptor.consumerId]}</span><span>${descriptor.label}</span>`;
    button.addEventListener('click', () => this.requestChange(descriptor.consumerId));
    const reason = documentRef.createElement('span');
    reason.id = `application-nav-reason-${descriptor.consumerId.toLowerCase()}`;
    reason.className = 'application-navigation__reason';
    reason.hidden = true;
    wrapper.append(button, reason);
    return wrapper;
  }

  updateButton(button, state, readiness) {
    const available = readiness?.readinessState === READINESS_STATES.AVAILABLE;
    const active = state?.activeViewId === button.dataset.applicationNav;
    const reason = button.parentElement?.querySelector('.application-navigation__reason');
    const message = readiness?.diagnostics?.[0]?.message || 'This view is unavailable.';
    button.removeAttribute('disabled');
    button.setAttribute('aria-disabled', String(!available));
    button.setAttribute('aria-current', active ? 'page' : 'false');
    button.tabIndex = active ? 0 : -1;
    button.classList.toggle('application-navigation__button--active', active);
    button.title = available ? '' : message;
    if (reason) {
      reason.textContent = available ? '' : message;
      reason.hidden = available;
      if (available) button.removeAttribute('aria-describedby');
      else button.setAttribute('aria-describedby', reason.id);
    }
  }

  requestChange(viewId) {
    this.eventBus.publish(APPLICATION_EVENTS.CHANGE_REQUESTED, { viewId, source: 'navigation' });
  }

  handleKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...this.navElement.querySelectorAll('button[data-application-nav]')];
    if (!buttons.length) return;
    const current = buttons.indexOf(this.rootElement.ownerDocument.activeElement);
    const target = keyboardTarget(event.key, current, buttons.length);
    event.preventDefault();
    buttons[target].focus();
  }

  destroy() {
    this.navElement?.removeEventListener('keydown', this.keydownHandler);
    this.navElement?.replaceChildren();
    this.views.forEach((element, id) => setViewVisibility(element, id === CONSUMER_IDS.WORKSPACE));
    if (this.statusElement) this.statusElement.textContent = '';
  }
}

function isDatasetBoundary(previous, current) {
  return Boolean(previous
    && current
    && previous.workspaceVersion !== current.workspaceVersion
    && current.selectedEntityId === null);
}

function assertImplementedAvailable(descriptor, readiness) {
  if (descriptor.implementationStatus === IMPLEMENTATION_STATUS.RECOVERY_PENDING) {
    throw viewError('VIEW_RECOVERY_PENDING', readiness?.diagnostics?.[0]?.message || `${descriptor.label} recovery is pending.`);
  }
  if (descriptor.implementationStatus === IMPLEMENTATION_STATUS.NOT_IMPLEMENTED) {
    throw viewError('VIEW_NOT_IMPLEMENTED', readiness?.diagnostics?.[0]?.message || `${descriptor.label} is not implemented.`);
  }
  if (readiness?.readinessState !== READINESS_STATES.AVAILABLE) {
    throw viewError('VIEW_NOT_AVAILABLE', readiness?.diagnostics?.[0]?.message || `${descriptor.label} is unavailable.`);
  }
}

function viewError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function keyboardTarget(key, current, length) {
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowLeft') return current <= 0 ? length - 1 : current - 1;
  return current < 0 || current === length - 1 ? 0 : current + 1;
}

function setViewVisibility(element, visible) {
  if (!element) return;
  element.hidden = !visible;
  element.setAttribute('aria-hidden', String(!visible));
}
