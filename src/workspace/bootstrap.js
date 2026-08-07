import { createDefaultAnalysisCapabilityRegistry } from './analysis-capabilities.js';
import { AnalysisCoordinator } from './analysis-coordinator.js';
import { AnalysisLedgerController } from './analysis-ledger-controller.js';
import { AnalysisLedger } from './analysis-ledger-store.js';
import { AnalysisSessionController } from './analysis-session-controller.js';
import { AnalysisSessions } from './analysis-session-store.js';
import { ApplicationShellController } from './application-shell-controller.js';
import { DatasetController } from './dataset-controller.js';
import { EventBus } from './event-bus.js';
import { FirstCutResultStore } from './first-cut-result-store.js';
import { LafeaWorkbenchController } from './lafea-workbench-controller.js';
import { LfeaWorkbenchController } from './lfea-workbench-controller.js';
import { ModelCalculationController } from './model-calculation-controller.js';
import { ModelCalculationPanel } from './model-calculation-panel.js';
import { ModelCalculationStore } from './model-calculation-store.js';
import { ModelLoadController } from './model-load-controller.js';
import { ModelLoadPanel } from './model-load-panel.js';
import { ModelLoadStore } from './model-load-store.js';
import { ModelSupportLoadController } from './model-support-load-controller.js';
import { assessModelSupportLoadReadiness } from './model-support-load-readiness.js';
import { PropertiesPanel } from './properties-panel.js';
import { SettingsController } from './settings-controller.js';
import { SettingsPersistenceAdapter } from './settings-persistence-adapter.js';
import { SharedModelController } from './shared-model-controller.js';
import { SharedModelPanel } from './shared-model-panel.js';
import { SupportLoadScreeningController } from './support-load-screening-controller.js';
import { SupportLoadScreeningPanel } from './support-load-screening-panel.js';
import { SupportLoadScreeningStore } from './support-load-screening-store.js';
import { SupportRestraintController } from './support-restraint-controller.js';
import { SupportRestraintPanel } from './support-restraint-panel.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { TopologyController } from './topology-controller.js';
import { TopologyPanel } from './topology-panel.js';
import { TopologyStore } from './topology-store.js';
import { TreePanel } from './tree-panel.js';
import { VerticalBeamController } from './vertical-beam-controller.js';
import { VerticalBeamPanel } from './vertical-beam-panel.js';
import { VerticalBeamStore } from './vertical-beam-store.js';
import { ViewportPanel } from './viewport-panel.js';
import { WorkspaceConsumerController } from './workspace-consumer-controller.js';
import { renderWorkspaceLayout } from './workspace-layout.js';
import { WorkspaceState } from './workspace-state.js';
import { WorkspaceShellController } from './workspace-shell-controller.js';
import { EngineeringModelController } from './engineering-model-controller.js';
import { engineeringModelStore } from './engineering-model-store.js';
import {
  EmpiricalLoadCalcScenarioController,
} from './engineering-loads/empirical-load-calc-scenario-controller.js';
import {
  empiricalLoadCalcScenarioStore,
} from './engineering-loads/empirical-load-calc-scenario-store.js';
import { nonFeaCommonInputStore } from './non-fea-common-input-store.js';
import {
  evaluateCurrentNonFeaCommonInput,
  exportCurrentNonFeaCommonInput,
  reimportNonFeaCommonInput,
  sealCurrentNonFeaCommonInput,
} from './non-fea-common-input-runtime.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { masterDataController } from './master-data-controller.js';

class DeferredController {
  constructor(load, create) {
    this.load = load;
    this.create = create;
    this.controller = null;
    this.loadPromise = null;
    this.destroyed = false;
  }

  init() {
    if (this.destroyed || this.controller || this.loadPromise) return;
    this.loadPromise = this.load().then((module) => {
      if (this.destroyed) return null;
      const controller = this.create(module);
      this.controller = controller;
      controller.init();
      return controller;
    });
  }

  getCurrent() {
    return this.controller;
  }

  destroy() {
    this.destroyed = true;
    this.controller?.destroy();
    this.controller = null;
  }
}

export function requireUniqueRoot(root, selector) {
  const matches = root.querySelectorAll(selector);
  if (matches.length !== 1) {
    throw new TypeError(`Expected exactly one ${selector}; found ${matches.length}.`);
  }
  return matches[0];
}

export function bootstrapAnalysisWorkspace(rootElement) {
  if (!rootElement) throw new Error('Application root #root was not found.');
  WorkspaceState.clearDataset(); AnalysisSessions.clear(); AnalysisLedger.clear();
  FirstCutResultStore.clear(); nonFeaCommonInputStore.clear();
  TopologyStore.clear(); SupportRestraintStore.clear(); ModelLoadStore.clear();
  SupportLoadScreeningStore.clear(); VerticalBeamStore.clear(); ModelCalculationStore.clear();
  empiricalLoadCalcScenarioStore.clear();
  renderWorkspaceLayout(rootElement);
  const capabilityRegistry = createDefaultAnalysisCapabilityRegistry();
  const workspaceConsumerController = new WorkspaceConsumerController(EventBus);
  const settingsPersistence = new SettingsPersistenceAdapter(rootElement.ownerDocument.defaultView?.localStorage);
  const settingsController = new SettingsController(rootElement.querySelector('[data-role="settings-consumer-root"]'),EventBus,settingsPersistence,() => ({ materializedContractKeys: workspaceConsumerController.getContext()?.availabilitySummary?.availableContractKeys || [] }));
  const datasetController = new DatasetController(EventBus, WorkspaceState);
  const engineeringModelController = new EngineeringModelController(EventBus, WorkspaceState, masterDataController);
  const empiricalLoadCalcScenarioController = new EmpiricalLoadCalcScenarioController(
    EventBus,
    () => {
      const snapshot = WorkspaceState.getSnapshot();
      return {
        datasetId: snapshot.status === 'ready' ? snapshot.dataset?.datasetId || '' : '',
        sharedModel: snapshot.status === 'ready' ? snapshot.dataset?.sharedModel || null : null,
        topologyGraph: TopologyStore.getGraph(),
        supportAttachmentModel: SupportRestraintStore.getAttachmentModel(),
        restraintCapabilityModel: SupportRestraintStore.getRestraintModel(),
        sourceLoadPrimitiveSet: ModelLoadStore.getLoadPrimitiveSet(),
      };
    },
  );
  const sharedModelController = new SharedModelController(EventBus, WorkspaceState, rootElement.ownerDocument);
  const topologyController = new TopologyController(EventBus, TopologyStore, rootElement.ownerDocument);
  const supportRestraintController = new SupportRestraintController(EventBus, SupportRestraintStore, TopologyStore, rootElement.ownerDocument);
  const modelLoadController = new ModelLoadController(EventBus, ModelLoadStore, rootElement.ownerDocument);
  const supportLoadScreeningController = new SupportLoadScreeningController(EventBus, SupportLoadScreeningStore, rootElement.ownerDocument);
  const verticalBeamController = new VerticalBeamController(EventBus, VerticalBeamStore, rootElement.ownerDocument);
  const modelCalculationController = new ModelCalculationController(EventBus,ModelCalculationStore,rootElement.ownerDocument,() => settingsController.getProfile());
  const modelSupportLoadController = new ModelSupportLoadController(EventBus, WorkspaceState);
  const sessionController = new AnalysisSessionController(EventBus, WorkspaceState, capabilityRegistry, AnalysisSessions);
  const analysisCoordinator = new AnalysisCoordinator(EventBus, WorkspaceState, capabilityRegistry, AnalysisSessions);
  const ledgerController = new AnalysisLedgerController(EventBus, AnalysisLedger, rootElement.ownerDocument);
  const treePanel = new TreePanel(rootElement.querySelector('[data-panel="tree"]'), EventBus);
  const viewportPanel = new ViewportPanel(rootElement.querySelector('[data-panel="viewport"]'), EventBus);
  const sharedModelPanel = new SharedModelPanel(rootElement.querySelector('[data-role="shared-model-summary"]'), EventBus);
  const topologyPanel = new TopologyPanel(rootElement.querySelector('[data-role="topology-summary"]'), EventBus);
  const supportRestraintPanel = new SupportRestraintPanel(rootElement.querySelector('[data-role="support-restraint-summary"]'), EventBus);
  const modelLoadPanel = new ModelLoadPanel(rootElement.querySelector('[data-role="model-load-summary"]'), EventBus);
  const supportLoadScreeningPanel = new SupportLoadScreeningPanel(rootElement.querySelector('[data-role="support-load-screening-summary"]'), EventBus);
  const verticalBeamPanel = new VerticalBeamPanel(rootElement.querySelector('[data-role="vertical-beam-summary"]'), EventBus);
  const modelCalculationPanel = new ModelCalculationPanel(rootElement.querySelector('[data-role="model-calculation-summary"]'), EventBus);
  const modelSupportLoadPanelRoot = rootElement.querySelector('[data-role="model-support-load-summary"]');
  const modelSupportLoadPanel = modelSupportLoadPanelRoot
    ? new DeferredController(
        () => import('./model-support-load-panel.js'),
        ({ ModelSupportLoadPanel }) => new ModelSupportLoadPanel(modelSupportLoadPanelRoot, EventBus),
      )
    : null;
  const propertiesPanel = new PropertiesPanel(rootElement.querySelector('[data-panel="properties"]'), EventBus, WorkspaceState);
  const lafeaRoot = requireUniqueRoot(rootElement, '[data-role="lafea-consumer-root"]');
  const lfeaRoot = requireUniqueRoot(rootElement, '[data-role="lfea-consumer-root"]');
  if (lafeaRoot === lfeaRoot) {
    throw new TypeError('LAFEA and LFEA workbench roots must be different elements.');
  }
  const lafeaWorkbenchController = new LafeaWorkbenchController(lafeaRoot,undefined);
  const lfeaWorkbenchController = new LfeaWorkbenchController(lfeaRoot,undefined);
  const applicationShellController = new ApplicationShellController(rootElement,workspaceConsumerController,EventBus,{ settingsController,lafeaController:lafeaWorkbenchController,lfeaController:lfeaWorkbenchController });
  const benchmarkReportUrl = new URL(`${import.meta.env.BASE_URL}qualification/advanced-tab-benchmarks.json`,rootElement.ownerDocument.baseURI).href;
  const tabBenchmarkStatusController = new DeferredController(
    () => import('./tab-benchmark-status-controller.js'),
    ({ TabBenchmarkStatusController }) => new TabBenchmarkStatusController(rootElement, benchmarkReportUrl),
  );
  const workspaceShellController = new WorkspaceShellController(rootElement);
  const sequentialSketcherRoot = rootElement.querySelector('[data-role="sequential-sketcher-root"]');
  const sequentialSketcherController = sequentialSketcherRoot
    ? new DeferredController(
        () => import('./sequential-sketcher/sequential-sketcher-controller.js'),
        ({ SequentialSketcherController }) => new SequentialSketcherController(
          sequentialSketcherRoot,
          EventBus,
          WorkspaceState,
        ),
      )
    : null;
  const controllers = [workspaceShellController,datasetController,engineeringModelController,empiricalLoadCalcScenarioController,sharedModelController,topologyController,supportRestraintController,modelLoadController,supportLoadScreeningController,verticalBeamController,modelCalculationController,modelSupportLoadController,sessionController,analysisCoordinator,ledgerController,treePanel,viewportPanel,sharedModelPanel,topologyPanel,supportRestraintPanel,modelLoadPanel,supportLoadScreeningPanel,verticalBeamPanel,modelCalculationPanel,modelSupportLoadPanel,propertiesPanel,workspaceConsumerController,settingsController,applicationShellController,tabBenchmarkStatusController,sequentialSketcherController].filter(Boolean);
  controllers.forEach((controller) => controller.init());
  globalThis.EventBus = EventBus;
  return Object.freeze({
    getSnapshot(){return WorkspaceState.getSnapshot();},
    getSharedModel(){const snapshot=WorkspaceState.getSnapshot();return snapshot.status==='ready'?snapshot.dataset?.sharedModel||null:null;},
    getTopologyGraph(){return TopologyStore.getGraph();},getTopologyAudit(){return TopologyStore.getAudit();},
    getSupportAttachmentModel(){return SupportRestraintStore.getAttachmentModel();},getSupportAttachmentAudit(){return SupportRestraintStore.getAttachmentAudit();},
    getRestraintCapabilityModel(){return SupportRestraintStore.getRestraintModel();},getRestraintCapabilityAudit(){return SupportRestraintStore.getRestraintAudit();},
    getLoadCaseSet(){return ModelLoadStore.getLoadCaseSet();},getLoadPrimitiveSet(){return ModelLoadStore.getLoadPrimitiveSet();},getModelLoadReadinessAudit(){return ModelLoadStore.getReadinessAudit();},
    getVerticalLoadPathModel(){return SupportLoadScreeningStore.getPathModel();},getSupportLoadScreening(){return SupportLoadScreeningStore.getScreening();},getSupportLoadScreeningAudit(){return SupportLoadScreeningStore.getAudit();},
    getFlexuralPropertyProjection(){return VerticalBeamStore.getFlexuralProjection();},getVerticalBeamModel(){return VerticalBeamStore.getBeamModel();},getVerticalBeamSolution(){return VerticalBeamStore.getSolution();},getVerticalBeamSolverAudit(){return VerticalBeamStore.getAudit();},
    getModelCalculationLedger(){return ModelCalculationStore.getLedger();},getActiveModelCalculationPackage(){return ModelCalculationStore.getActivePackage();},getActiveModelCalculationReport(){return ModelCalculationStore.getActiveReport();},
    getEngineeringSettingsProfile(){return settingsController.getProfile();},getEngineeringSettingsAudit(){return settingsController.getAudit();},getSettingsReviewModel(){return settingsController.getReviewModel();},
    getWorkspaceConsumerContext(){return workspaceConsumerController.getContext();},listWorkspaceConsumers(){return applicationShellController.getRegistry().consumers;},getWorkspaceConsumerReadiness(consumerId){return applicationShellController.getReadiness(consumerId);},getApplicationViewState(){return applicationShellController.getPublicState();},activateApplicationView(viewId){return applicationShellController.activate(viewId);},
    getLoadCalculationReviewModel(){return applicationShellController.getLoadCalculationReviewModel();},
    getEmpiricalLoadCalcScenarioState(){return empiricalLoadCalcScenarioController.getSnapshot();},
    getEmpiricalLoadCalcScenarioProposal(){return empiricalLoadCalcScenarioController.getProposal();},
    getEmpiricalLoadCalcAuthorization(){return empiricalLoadCalcScenarioController.getAuthorization();},
    getEmpiricalLoadCalcExecution(){return empiricalLoadCalcScenarioController.getExecution();},
    getResultOverlayState(){return empiricalLoadCalcScenarioController.getResultOverlaySnapshot();},
    getResultOverlayProjection(){return empiricalLoadCalcScenarioController.getResultOverlayProjection();},
    configureEmpiricalLoadCalcScenario(value){return empiricalLoadCalcScenarioController.configure(value);},
    authorizeEmpiricalLoadCalcScenario(value){return empiricalLoadCalcScenarioController.authorize(value);},
    calculateEmpiricalLoadCalcScenario(value){return empiricalLoadCalcScenarioController.calculate(value);},
    cloneEmpiricalLoadCalcProfile(value){return empiricalLoadCalcScenarioController.cloneProfile(value);},
    getProjectDataProfile(){return projectDataStore.getProfile();},
    getNonFeaCommonInputState(){return nonFeaCommonInputStore.getSnapshot();},
    evaluateNonFeaCommonInput(){return evaluateCurrentNonFeaCommonInput();},
    sealNonFeaCommonInput(value){return sealCurrentNonFeaCommonInput(value);},
    exportNonFeaCommonInput(){return exportCurrentNonFeaCommonInput();},
    reimportNonFeaCommonInput(value){return reimportNonFeaCommonInput(value);},
    getSupportSiteModel(){return engineeringModelStore.getSupportSiteModel();},
    getRoutePartitionModel(){return engineeringModelStore.getRoutePartitionModel();},
    getEngineeringSupportLoadDistribution(){return engineeringModelStore.getDistribution();},
    getLafeaWorkbenchState(){return applicationShellController.getLafeaWorkbenchState();},getLfeaWorkbenchState(){return applicationShellController.getLfeaWorkbenchState();},
    importLafeaDocument(value,stageId){return lafeaWorkbenchController.importDocument(value,stageId);},exportLafeaDocument(){return lafeaWorkbenchController.exportDocument();},runLafea(){return lafeaWorkbenchController.run();},undoLafea(){return lafeaWorkbenchController.undo();},redoLafea(){return lafeaWorkbenchController.redo();},
    importLfeaDocument(value){return lfeaWorkbenchController.importDocument(value);},exportLfeaDocument(){return lfeaWorkbenchController.exportDocument();},exportLfeaEvidence(){return lfeaWorkbenchController.exportEvidence();},runLfea(){return lfeaWorkbenchController.run();},undoLfea(){return lfeaWorkbenchController.undo();},redoLfea(){return lfeaWorkbenchController.redo();},
    getTabBenchmarkSuite(){return tabBenchmarkStatusController.getCurrent()?.getSuite() ?? null;},
    getModelSupportLoadReadiness(){const snapshot=WorkspaceState.getSnapshot();return snapshot.status==='ready'&&snapshot.dataset?assessModelSupportLoadReadiness(snapshot.dataset):null;},
    getFirstCutCalculationPackage(){return FirstCutResultStore.getPackage();},
    getAnalysisSession(){return AnalysisSessions.getSnapshot();},getAnalysisLedger(){return AnalysisLedger.getSnapshot();},
    getAnalysisCapabilities(targetId){try{const entity=WorkspaceState.getEntity(targetId),snapshot=WorkspaceState.getSnapshot();if(!entity||snapshot.status!=='ready')return[];return capabilityRegistry.list({targetId:entity.entityId,entity,dataset:snapshot.dataset,selectedEntityId:snapshot.selectedEntityId,version:snapshot.version});}catch{return[];}},
    destroy(){[...controllers].reverse().forEach((controller)=>controller.destroy());nonFeaCommonInputStore.clear();FirstCutResultStore.clear();ModelCalculationStore.clear();VerticalBeamStore.clear();SupportLoadScreeningStore.clear();ModelLoadStore.clear();SupportRestraintStore.clear();TopologyStore.clear();AnalysisLedger.clear();AnalysisSessions.clear();WorkspaceState.clearDataset();rootElement.replaceChildren();},
  });
}
