import {
  createLoadCalculationReviewModel,
  validateLoadCalculationReviewModel,
} from '../core/load-calculation-consumer/index.js';
import { EventBus } from './event-bus.js';
import { WorkspaceState } from './workspace-state.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';
import { MODEL_LOAD_EVENTS } from './model-load-events.js';
import { SUPPORT_LOAD_SCREENING_EVENTS } from './support-load-screening-events.js';
import { SHARED_MODEL_EVENTS } from './shared-model-events.js';
import { TOPOLOGY_EVENTS } from './topology-events.js';
import { renderLoadCalcConsumer } from './load-calc-consumer-view.js';
import { renderProjectConfiguration, renderPreflightGrid } from './lfea-preflight-ui.js';
import { renderMasterDataUI } from './master-data-ui.js';
import { renderJsonTraceUI } from './json-trace-ui.js';
import { SequentialSketcherView } from './sequential-sketcher/sequential-sketcher-view.js';
import { buildSequentialEngineeringSvgSceneFromTopology } from './sequential-sketcher/sequential-engineering-svg-scene.js';
import { PropertiesPanel } from './properties-panel.js';

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
      activeTab: 'load-cases',
      activeLoadCase: '',
      searchQuery: '',
      qualificationFilter: 'ALL',
      typeFilter: 'ALL',
      selectedPrimitiveId: '',
      gridsCollapsed: false,
      sidebarCollapsed: false,
      sidebarWidth: 280
    };
    this.unsubscribeCallbacks = [];
    this.sketcherView = null;
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
    
    // Inject preflight/config tabs if active
    const mainContent = view.querySelector('#load-calc-main-content');
    if (mainContent) {
      if (this.uiState.activeTab === 'preflight') {
        renderPreflightGrid(mainContent, { ...this.reviewModel, _context: this.context }, () => this.render());
      } else if (this.uiState.activeTab === 'project-config') {
        renderProjectConfiguration(mainContent, () => this.render());
      } else if (this.uiState.activeTab === 'master-data') {
        const mdContainer = mainContent.querySelector('#master-data-container');
        if (mdContainer) {
          const mdView = renderMasterDataUI();
          mdContainer.replaceChildren(mdView);
        }
      } else if (this.uiState.activeTab === 'json-trace') {
        const jtContainer = mainContent.querySelector('#json-trace-container');
        if (jtContainer) {
          jtContainer.replaceChildren(renderJsonTraceUI());
        }
      }
    }
    
    // Instantiate Canvas Preview
    const canvasHost = view.querySelector('#load-calc-canvas-host');
    if (canvasHost) {
      if (!this.sketcherView) {
         this.sketcherView = new SequentialSketcherView(canvasHost, null);
      }
      this.sketcherView.rootElement = canvasHost;
      
      const snapshot = WorkspaceState.getSnapshot();
      let dataset = snapshot?.dataset || null;
      
      // If we have parsed supports from context, overlay them on the raw dataset
      // so they show up in the preview without mutating the global state yet.
      if (dataset && this.context?.contracts?.supportAttachmentModel?.supports) {
          const supports = this.context.contracts.supportAttachmentModel.supports.map(supp => ({
              entityId: supp.id || supp.supportId,
              entityType: 'SUPPORT',
              category: 'support',
              name: supp.id || supp.supportId,
              properties: {
                  supportType: supp.type || 'REST',
                  attributes: {
                      center: supp.position || supp.point,
                  }
              }
          }));
          
          // Merge supports, avoiding duplicates by entityId
          const existingIds = new Set(dataset.entities.map(e => e.entityId));
          const newSupports = supports.filter(s => !existingIds.has(s.entityId));
          
          if (newSupports.length > 0) {
              dataset = { ...dataset, entities: [...dataset.entities, ...newSupports] };
          }
      }
      this.sketcherView.render(dataset);
    }

    bind(view, 'load-mock-data', () => this.loadMockData());
    bind(view, 'rebuild-model-loads', () => {
      this.eventBus.publish(TOPOLOGY_EVENTS.REBUILD_EXACT_REQUESTED, {});
      setTimeout(() => {
        this.publishAction('rebuildModelLoads', MODEL_LOAD_EVENTS.REBUILD_REQUESTED);
      }, 60);
    });
    bind(view, 'export-model-loads', () => this.publishAction('exportModelLoads', MODEL_LOAD_EVENTS.EXPORT_REQUESTED));
    bind(view, 'rebuild-paths', () => this.publishAction('rebuildPaths', SUPPORT_LOAD_SCREENING_EVENTS.REBUILD_PATHS_REQUESTED));
    bind(view, 'run-screening', () => this.publishAction('runScreening', SUPPORT_LOAD_SCREENING_EVENTS.RUN_REQUESTED));
    bind(view, 'export-screening', () => this.publishAction('exportScreening', SUPPORT_LOAD_SCREENING_EVENTS.EXPORT_REQUESTED));
    
    // Listen for professional Autofix integration
    const globalRebuildHandler = () => {
      console.log('Topology autofix accepted. Requesting Model Loads Rebuild...');
      if (this.context?.contracts?.sharedModel) {
        // Patch the global workspace state and push it to the backend so everything synchronizes
        const snapshot = WorkspaceState.patchSharedModel(this.context.contracts.sharedModel);
        if (snapshot) {
          this.eventBus.publish(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, { snapshot });
        }
      }
      this.publishAction('rebuildModelLoads', MODEL_LOAD_EVENTS.REBUILD_REQUESTED);
    };
    document.addEventListener('topology:rebuild-requested', globalRebuildHandler);
    this.unsubscribeCallbacks.push(() => document.removeEventListener('topology:rebuild-requested', globalRebuildHandler));
    
    // Bind UI state events
    view.querySelectorAll('[data-action="tab-main"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.tab;
        // If clicking the already active tab, toggle it back to load-cases (close window)
        if (this.uiState.activeTab === targetTab) {
          this.uiState.activeTab = 'load-cases';
        } else {
          this.uiState.activeTab = targetTab;
        }
        this.render();
      });
    });
    
    view.querySelectorAll('[data-action="close-active-tab"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.uiState.activeTab = 'load-cases';
        this.render();
      });
    });

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

    // Sidebar collapse/expand binding
    view.querySelectorAll('[data-action="toggle-load-calc-sidebar"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.uiState.sidebarCollapsed = !this.uiState.sidebarCollapsed;
        this.render();
      });
    });

    view.querySelectorAll('[data-action="toggle-grids"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.uiState.gridsCollapsed = !this.uiState.gridsCollapsed;
        this.render();
      });
    });

    // Left Sidebar drag-resize binding
    const resizerLeft = view.querySelector('[data-action="resize-load-calc-left"]');
    if (resizerLeft) {
      resizerLeft.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const pointerId = e.pointerId;
        resizerLeft.setPointerCapture(pointerId);
        const startX = e.clientX;
        const startWidth = this.uiState.sidebarWidth || 280;
        const sidebar = this.rootElement.querySelector('#load-calc-left-sidebar');
        
        const onMove = (moveEvt) => {
          const delta = moveEvt.clientX - startX;
          const newWidth = Math.max(180, Math.min(600, startWidth + delta));
          this.uiState.sidebarWidth = newWidth;
          if (sidebar) sidebar.style.flex = `0 0 ${newWidth}px`;
        };
        const onUp = () => {
          resizerLeft.releasePointerCapture(pointerId);
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    }

    // Right Sidebar drag-resize binding
    const resizerRight = view.querySelector('[data-action="resize-load-calc-right"]');
    if (resizerRight) {
      resizerRight.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const pointerId = e.pointerId;
        resizerRight.setPointerCapture(pointerId);
        const startX = e.clientX;
        const startWidth = this.uiState.rightWidth || 300;
        const sidebar = this.rootElement.querySelector('#load-calc-right-sidebar');
        
        const onMove = (moveEvt) => {
          const delta = startX - moveEvt.clientX;
          const newWidth = Math.max(200, Math.min(700, startWidth + delta));
          this.uiState.rightWidth = newWidth;
          if (sidebar) sidebar.style.flex = `0 0 ${newWidth}px`;
        };
        const onUp = () => {
          resizerRight.releasePointerCapture(pointerId);
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    }

    // Bottom Panel drag-resize binding
    const resizerBottom = view.querySelector('[data-action="resize-load-calc-bottom"]');
    if (resizerBottom) {
      resizerBottom.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const pointerId = e.pointerId;
        resizerBottom.setPointerCapture(pointerId);
        const startY = e.clientY;
        const startHeight = this.uiState.gridsHeight || 300;
        const gridsPane = this.rootElement.querySelector('#load-calc-grids-pane');
        
        const onMove = (moveEvt) => {
          const delta = startY - moveEvt.clientY;
          const newHeight = Math.max(100, Math.min(800, startHeight + delta));
          this.uiState.gridsHeight = newHeight;
          if (gridsPane) gridsPane.style.flex = `0 0 ${newHeight}px`;
        };
        const onUp = () => {
          resizerBottom.releasePointerCapture(pointerId);
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    }

    // Mount PropertiesPanel
    const propsHost = view.querySelector('#load-calc-properties-host');
    if (propsHost) {
      if (this.propertiesPanel) {
        this.propertiesPanel.destroy();
      }
      this.propertiesPanel = new PropertiesPanel(propsHost, this.eventBus);
      this.propertiesPanel.init();
    }
  }
  publishAction(actionKey, topic) {
    if (!this.actionAvailability[actionKey]) return this.handleFailure(ACTION_FAILURES[actionKey]);
    this.status = { message: `Requesting ${actionKey}...` };
    this.render();
    setTimeout(() => {
      this.eventBus.publish(topic, {});
    }, 50);
  }
  async loadMockData() {
    const { createWorkspaceMockPackage } = await import('./advanced-mock-data.js');
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
    if (this.sketcherView) {
       this.sketcherView = null;
    }
    this.rootElement?.replaceChildren();
  }
}

export function createLoadCalcActionAvailability(context, reviewModel) {
  const contracts = context?.contracts || {};
  const hasModelLoads = Boolean(reviewModel);
  const snapshot = WorkspaceState.getSnapshot();
  const canRebuildModelLoads = Boolean(contracts.sharedModel || contracts.topologyGraph || snapshot?.dataset);
  const hasPathInputs = Boolean(hasModelLoads
    && contracts.sharedModel
    && contracts.topologyGraph
    && contracts.supportAttachmentModel
    && contracts.restraintCapabilityModel);
  const hasPathModel = Boolean(hasModelLoads && contracts.verticalLoadPathModel);
  return Object.freeze({
    rebuildModelLoads: canRebuildModelLoads,
    exportModelLoads: hasModelLoads || Boolean(snapshot?.dataset),
    rebuildPaths: hasPathInputs || canRebuildModelLoads,
    runScreening: hasPathModel || canRebuildModelLoads,
    exportScreening: Boolean(reviewModel?.summary.screeningIncluded),
  });
}

function buildReviewModel(context) {
  if (!context || !hasRequiredLoadCalcContracts(context)) return null;
  try { return createLoadCalculationReviewModel(context); }
  catch (error) {
    console.error('[LoadCalc] buildReviewModel failed:', error);
    return null;
  }
}

function hasRequiredLoadCalcContracts(context) {
  const missing = getMissingLoadCalcContracts(context);
  return !Object.values(missing).some(Boolean);
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

