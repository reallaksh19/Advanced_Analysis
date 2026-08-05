import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

patchView();
patchController();
patchBootstrap();
console.log('wp3-load-calc-integration-patch: APPLIED');

function patchView() {
  const path = new URL('../src/workspace/load-calc-consumer-view.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "  const authorization = state.authorizationState || {};\n",
    "  const authorization = state.authorizationState || {};\n  const empiricalScenario = state.empiricalScenarioState || {};\n  const activeMethod = empiricalScenario.method || 'CHAINAGE_TRIBUTARY_SPAN_V2';\n",
    'view scenario state',
  );
  source = replaceOnce(
    source,
    "    <div><span class=\"panel-eyebrow\">CHAINAGE_TRIBUTARY_SPAN_V2</span><h1>Empirical Support Loads</h1></div>\n",
    "    <div><span class=\"panel-eyebrow\">${escapeHtml(activeMethod)}</span><h1>Empirical Support Loads</h1></div>\n",
    'view method heading',
  );
  source = replaceOnce(
    source,
    "      <span>Execution freshness: ${escapeHtml(authorization.executionFreshness || 'NOT_APPLICABLE')}</span>\n",
    "      <span>Execution freshness: ${escapeHtml(authorization.executionFreshness || 'NOT_APPLICABLE')}</span>\n      <span>Empirical scenario: ${escapeHtml(empiricalScenario.state || 'NOT_CONFIGURED')}</span>\n      <span>Empirical profile: ${escapeHtml(empiricalScenario.profile ? `${empiricalScenario.profile.profileId} v${empiricalScenario.profile.profileVersion}` : 'NOT_BOUND')}</span>\n",
    'view empirical facts',
  );
  source = replaceOnce(
    source,
    "      ${tab('loads', 'Load Evaluation', state.activeTab)}${tab('preflight', 'Pre-flight', state.activeTab)}${tab('project-data', 'Project Data', state.activeTab)}${tab('masters', 'Masters', state.activeTab)}${tab('json-trace', 'JSON Trace', state.activeTab)}\n",
    "      ${tab('overview', 'Overview', state.activeTab)}${tab('3d', 'Model / 3D', state.activeTab)}${tab('restraints', 'Restraints', state.activeTab)}${tab('load-cases', 'Load Cases', state.activeTab)}${tab('methods', 'Methods', state.activeTab)}${tab('results', 'Results', state.activeTab)}${tab('evidence', 'Evidence', state.activeTab)}${tab('loads', 'Legacy Load Evaluation', state.activeTab)}${tab('preflight', 'Pre-flight', state.activeTab)}${tab('project-data', 'Project Data', state.activeTab)}${tab('masters', 'Masters', state.activeTab)}${tab('json-trace', 'JSON Trace', state.activeTab)}\n",
    'view tabs',
  );
  writeFileSync(path, source);
}

function patchController() {
  const path = new URL('../src/workspace/load-calc-consumer-controller.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "import { renderEngineeringLoadPane, renderLoadCalcConsumer } from './load-calc-consumer-view.js';\n",
    `import { renderEngineeringLoadPane, renderLoadCalcConsumer } from './load-calc-consumer-view.js';
import {
  EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS,
} from './engineering-loads/empirical-load-calc-scenario-controller.js';
import {
  empiricalLoadCalcScenarioStore,
} from './engineering-loads/empirical-load-calc-scenario-store.js';
import {
  renderEmpiricalScenarioEvidence,
  renderEmpiricalScenarioLoadCases,
  renderEmpiricalScenarioMethods,
  renderEmpiricalScenarioModel3d,
  renderEmpiricalScenarioOverview,
  renderEmpiricalScenarioRestraints,
  renderEmpiricalScenarioResults,
} from './engineering-loads/empirical-load-calc-scenario-view.js';
`,
    'controller imports',
  );
  source = replaceOnce(
    source,
    "      this.eventBus.subscribe(EVENT_TOPICS.LOAD_CALC_SUBTAB_REQUESTED, ({ tab }) => { this.activeTab = tab; this.render(); }),\n",
    `      this.eventBus.subscribe(EVENT_TOPICS.LOAD_CALC_SUBTAB_REQUESTED, ({ tab }) => { this.activeTab = tab; this.render(); }),
      this.eventBus.subscribe(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CHANGED, ({ snapshot }) => {
        this.message = empiricalScenarioMessage(snapshot);
        this.render();
      }),
      this.eventBus.subscribe(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.FAILED, ({ message }) => this.handleFailure(message)),
`,
    'controller subscriptions',
  );
  source = replaceOnce(
    source,
    "    const tab = event.target.closest('[data-load-calc-tab]')?.dataset.loadCalcTab;\n    if (tab) { this.activeTab = tab; this.render(); return; }\n",
    `    const tab = event.target.closest('[data-load-calc-tab]')?.dataset.loadCalcTab;
    if (tab) { this.activeTab = tab; this.render(); return; }
    const restraintId = event.target.closest('[data-empirical-restraint-select]')?.dataset.empiricalRestraintSelect;
    if (restraintId) {
      const occurrence = empiricalLoadCalcScenarioStore.getProposal()?.adaptedRequest?.restraintOccurrences
        ?.find((row) => row.restraintId === restraintId);
      const entityId = occurrence?.sourceEntityIds?.[0]
        || occurrence?.hostSourceEntityId
        || occurrence?.hostEntityId;
      if (entityId) this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, { entityId, source: 'load-table' });
      return;
    }
    if (event.target.closest('[data-empirical-open-sjson-viewport]')) {
      this.activeTab = '3d';
      this.render();
      return;
    }
    if (event.target.closest('[data-empirical-clone-profile]')) {
      this.eventBus.publish(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CLONE_PROFILE_REQUESTED, {});
      return;
    }
    if (event.target.closest('[data-empirical-authorize]')) {
      this.message = 'Authorizing the current empirical scenario…';
      this.eventBus.publish(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.AUTHORIZE_REQUESTED, {});
      return;
    }
    if (event.target.closest('[data-empirical-calculate]')) {
      this.message = 'Executing the current authorized empirical method…';
      this.eventBus.publish(EMPIRICAL_LOAD_CALC_SCENARIO_EVENTS.CALCULATE_REQUESTED, {});
      return;
    }
`,
    'controller click actions',
  );
  source = replaceOnce(
    source,
    "      routePartitionModel: engineeringModelStore.getRoutePartitionModel(),\n",
    "      routePartitionModel: engineeringModelStore.getRoutePartitionModel(),\n      empiricalScenarioState: empiricalLoadCalcScenarioStore.getSnapshot(),\n",
    'controller render scenario state',
  );
  source = replaceOnce(
    source,
    "  async renderDeferredPane(tab, pane, revision) {\n    try {\n      if (tab === 'preflight') {\n",
    `  async renderDeferredPane(tab, pane, revision) {
    try {
      const empiricalState = {
        snapshot: empiricalLoadCalcScenarioStore.getSnapshot(),
        proposal: empiricalLoadCalcScenarioStore.getProposal(),
        authorization: empiricalLoadCalcScenarioStore.getAuthorization(),
        execution: empiricalLoadCalcScenarioStore.getExecution(),
      };
      if (tab === 'overview') {
        renderEmpiricalScenarioOverview(pane, empiricalState);
      } else if (tab === 'restraints') {
        renderEmpiricalScenarioRestraints(pane, empiricalState);
      } else if (tab === 'load-cases') {
        renderEmpiricalScenarioLoadCases(pane, empiricalState);
      } else if (tab === 'methods') {
        renderEmpiricalScenarioMethods(pane, empiricalState);
      } else if (tab === 'results') {
        renderEmpiricalScenarioResults(pane, empiricalState);
      } else if (tab === 'evidence') {
        renderEmpiricalScenarioEvidence(pane, empiricalState);
      } else if (tab === 'model-3d') {
        renderEmpiricalScenarioModel3d(pane, empiricalState);
      } else if (tab === 'preflight') {
`,
    'controller deferred panes',
  );
  source = replaceOnce(
    source,
    "function resetTopologyEditCleanShell(documentRef) {\n",
    `function empiricalScenarioMessage(snapshot) {
  const messages = {
    NOT_CONFIGURED: 'Configure an empirical scenario before authorization.',
    DRAFT_BLOCKED: 'Empirical scenario is blocked; review the Overview and Evidence panes.',
    DRAFT_READY: 'Empirical scenario is ready for explicit authorization.',
    AUTHORIZED_CURRENT: 'Empirical scenario is authorized and ready to calculate.',
    AUTHORIZED_STALE: 'Empirical scenario authorization is stale.',
    EXECUTED_CURRENT: 'Empirical method execution is current.',
    EXECUTED_STALE: 'Empirical method results are stale and are not current overlays.',
  };
  return messages[snapshot?.state] || '';
}

function resetTopologyEditCleanShell(documentRef) {
`,
    'controller scenario message',
  );
  writeFileSync(path, source);
}

function patchBootstrap() {
  const path = new URL('../src/workspace/bootstrap.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "import { engineeringModelStore } from './engineering-model-store.js';\n",
    `import { engineeringModelStore } from './engineering-model-store.js';
import {
  EmpiricalLoadCalcScenarioController,
} from './engineering-loads/empirical-load-calc-scenario-controller.js';
import {
  empiricalLoadCalcScenarioStore,
} from './engineering-loads/empirical-load-calc-scenario-store.js';
`,
    'bootstrap imports',
  );
  source = replaceOnce(
    source,
    "  SupportLoadScreeningStore.clear(); VerticalBeamStore.clear(); ModelCalculationStore.clear();\n",
    "  SupportLoadScreeningStore.clear(); VerticalBeamStore.clear(); ModelCalculationStore.clear();\n  empiricalLoadCalcScenarioStore.clear();\n",
    'bootstrap initial clear',
  );
  source = replaceOnce(
    source,
    "  const engineeringModelController = new EngineeringModelController(EventBus, WorkspaceState, masterDataController);\n",
    `  const engineeringModelController = new EngineeringModelController(EventBus, WorkspaceState, masterDataController);
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
`,
    'bootstrap scenario controller',
  );
  source = replaceOnce(
    source,
    "firstCutWorkbenchLauncherController,datasetController,engineeringModelController,sharedModelController",
    "firstCutWorkbenchLauncherController,datasetController,engineeringModelController,empiricalLoadCalcScenarioController,sharedModelController",
    'bootstrap controller list',
  );
  source = replaceOnce(
    source,
    "    getLoadCalculationReviewModel(){return applicationShellController.getLoadCalculationReviewModel();},\n",
    `    getLoadCalculationReviewModel(){return applicationShellController.getLoadCalculationReviewModel();},
    getEmpiricalLoadCalcScenarioState(){return empiricalLoadCalcScenarioController.getSnapshot();},
    getEmpiricalLoadCalcScenarioProposal(){return empiricalLoadCalcScenarioController.getProposal();},
    getEmpiricalLoadCalcAuthorization(){return empiricalLoadCalcScenarioController.getAuthorization();},
    getEmpiricalLoadCalcExecution(){return empiricalLoadCalcScenarioController.getExecution();},
    configureEmpiricalLoadCalcScenario(value){return empiricalLoadCalcScenarioController.configure(value);},
    authorizeEmpiricalLoadCalcScenario(value){return empiricalLoadCalcScenarioController.authorize(value);},
    calculateEmpiricalLoadCalcScenario(value){return empiricalLoadCalcScenarioController.calculate(value);},
    cloneEmpiricalLoadCalcProfile(value){return empiricalLoadCalcScenarioController.cloneProfile(value);},
`,
    'bootstrap public API',
  );
  writeFileSync(path, source);
}

function replaceOnce(value, before, after, label) {
  const count = value.split(before).length - 1;
  assert.equal(count, 1, `${label}: expected one source match, found ${count}`);
  return value.replace(before, after);
}
