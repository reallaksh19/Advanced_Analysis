/**
 * Sequential Sketcher Verification Check Script
 */
import assert from 'node:assert/strict';
import { ENGINEERING_MODEL_EVENTS } from '../src/workspace/engineering-model-controller.js';
import { buildPropertyInspector } from '../src/workspace/sequential-sketcher/property-inspector-view.js';
import { SequentialSketcherController } from '../src/workspace/sequential-sketcher/sequential-sketcher-controller.js';
import { parseStagedJson, buildBranchInventory } from '../src/workspace/sequential-sketcher/sequential-sketcher-source.js';
import { buildBranchTopology } from '../src/workspace/sequential-sketcher/sequential-sketcher-topology.js';
import { planSequentialTraversal } from '../src/workspace/sequential-sketcher/sequential-sketcher-traversal.js';
import { buildSequentialEngineeringSvgSceneFromTopology } from '../src/workspace/sequential-sketcher/sequential-engineering-svg-scene.js';
import { SupportLoadPresenter } from '../src/workspace/sequential-sketcher/support-load-presenter.js';
import { serializeSequentialSketcherCertificationFixture } from './sequential-sketcher-fixtures.mjs';

console.log('--- [SIMULATED] Sequential Sketcher Verification Check ---');

const content = serializeSequentialSketcherCertificationFixture();
const records = parseStagedJson(content);
assert.equal(records.length, 1);
console.log('SEQUENTIAL-SKETCHER-T01 PASS parseStagedJson parsed the repository certification fixture.');

const branch = records[0];
const inventory = buildBranchInventory(branch);
assert.equal(inventory.branchId, 'SEQ-BRANCH-001');
assert.equal(inventory.routeComponents.length, 5);
assert.equal(inventory.supportRecords.length, 1);
console.log('SEQUENTIAL-SKETCHER-T02 PASS buildBranchInventory retained route and support evidence.');

const topology = buildBranchTopology(inventory);
assert.equal(topology.schema, 'SequentialBranchSketch.v1');
assert.equal(topology.branchId, inventory.branchId);
assert.equal(topology.segments.length, 3);
assert.equal(topology.inventory.supportRecordCount, 1);
assert.equal(topology.issues.filter((issue) => issue.severity === 'ERROR').length, 0);
console.log('SEQUENTIAL-SKETCHER-T03 PASS buildBranchTopology constructed the governed branch graph.');

const traversal = planSequentialTraversal(topology);
assert.equal(traversal.commands.filter((command) => command.op === 'DRAW_SEGMENT').length, 3);
assert.equal(traversal.commands.filter((command) => command.op === 'MARK_COMPONENT').length, 2);
assert.equal(traversal.issues.filter((issue) => issue.severity === 'ERROR').length, 0);
console.log('SEQUENTIAL-SKETCHER-T04 PASS planSequentialTraversal accounted for every route component.');

const sceneResult = buildSequentialEngineeringSvgSceneFromTopology(topology, {
  sceneId: 'sequential-certification-scene',
  projection: 'ISO',
});
assert.equal(sceneResult.scene.schema, 'EngineeringScene.v1');
assert.equal(sceneResult.scene.sceneId, 'sequential-certification-scene');
console.log('SEQUENTIAL-SKETCHER-T05 PASS source-derived EngineeringScene.v1 generated.');

const noFirstCutStore = { findSupportResult() { return null; } };
const currentAuthorized = empiricalEntity();
const presenter = new SupportLoadPresenter({
  engineeringStore: { decorateEntity() { throw new Error('Already-decorated entity was decorated again.'); } },
  firstCutStore: noFirstCutStore,
});
assert.deepEqual(presenter.getResultCallouts(currentAuthorized), [{
  label: 'Vertical=12.500kN',
  forceN: 12500,
  forcekN: 12.5,
  direction: 'V',
  resultKind: 'EMPIRICAL_SUPPORT_REACTION',
}]);
assert.deepEqual(presenter.formatLoadInspectorProperties(currentAuthorized), {
  Method: 'CHAINAGE_TRIBUTARY_SPAN_V2',
  'Load Case': 'OPE',
  'Empirical support reaction': '12500.000 N (12.500 kN)',
  Authority: 'AUTHORIZED_HANDOFF',
  Limitation: 'Empirical gravity-load screening only; thermal and interface loads: NOT EVALUATED - RUN LFEA',
});
assert.equal(presenter.getTableSummary(currentAuthorized), 'Empirical support reaction: 12.500 kN');
console.log('SEQUENTIAL-SKETCHER-T06 PASS [SIMULATED] current authorized OPE 12,500 N is presented with exact N/kN, method, authority, and limitation.');

const currentLegacy = empiricalEntity({ authority: 'LEGACY_PROJECT_DATA' });
assert.equal(presenter.formatLoadInspectorProperties(currentLegacy).Authority, 'LEGACY_PROJECT_DATA');
console.log('SEQUENTIAL-SKETCHER-T07 PASS [SIMULATED] legacy Project Data authority remains distinguishable.');

const suppressed = [
  empiricalEntity({ freshness: 'STALE' }),
  empiricalEntity({ status: 'BLOCKED' }),
  empiricalEntity({ loadCases: [{ loadCaseId: 'EMPTY', status: 'CALCULATED', verticalForceN: 12500 }] }),
  empiricalEntity({ forceN: null }),
  empiricalEntity({ forceN: Number.NaN }),
  empiricalEntity({ forceN: Number.POSITIVE_INFINITY }),
  empiricalEntity({ forceN: Number.NEGATIVE_INFINITY }),
];
suppressed.forEach((entity) => {
  assert.deepEqual(presenter.getResultCallouts(entity), []);
  assert.deepEqual(presenter.formatLoadInspectorProperties(entity), {});
  assert.equal(presenter.getTableSummary(entity), 'NOT EVALUATED');
});
console.log('SEQUENTIAL-SKETCHER-T08 PASS [SIMULATED] stale, blocked, missing OPE, null, NaN, and infinite empirical forces are suppressed.');

let decorationCalls = 0;
const rawPresenter = new SupportLoadPresenter({
  engineeringStore: {
    decorateEntity(entity) {
      decorationCalls += 1;
      assert.equal(entity.entityId, 'raw-support-1');
      return empiricalEntity();
    },
  },
  firstCutStore: noFirstCutStore,
});
assert.equal(rawPresenter.getResultCallouts({ entityId: 'raw-support-1', category: 'support' })[0].forceN, 12500);
assert.equal(decorationCalls, 1);
console.log('SEQUENTIAL-SKETCHER-T09 PASS [SIMULATED] a raw support obtains the existing exact engineering decoration before presentation.');

let fallbackCalls = 0;
const precedencePresenter = new SupportLoadPresenter({
  engineeringStore: { decorateEntity() { throw new Error('LFEA precedence was not preserved.'); } },
  firstCutStore: { findSupportResult() { fallbackCalls += 1; return null; } },
});
const both = empiricalEntity();
both.analysisResults = {
  lfeaReaction: {
    qualified: true,
    stale: false,
    verticalForceN: 15000,
    loadCaseId: 'OPE',
    methodId: 'SEALED_LFEA',
  },
};
assert.deepEqual(precedencePresenter.getResultCallouts(both), [{
  label: 'Vertical=15.000kN',
  forceN: 15000,
  forcekN: 15,
  direction: 'V',
  resultKind: 'QUALIFIED_LFEA_REACTION',
}]);
assert.equal(fallbackCalls, 0);
console.log('SEQUENTIAL-SKETCHER-T10 PASS [SIMULATED] qualified non-stale LFEA retains precedence over empirical and first-cut results.');

const firstCutPresenter = new SupportLoadPresenter({
  engineeringStore: { decorateEntity(entity) { return entity; } },
  firstCutStore: {
    findSupportResult(entityId, loadCaseId) {
      assert.equal(entityId, 'legacy-support-1');
      assert.equal(loadCaseId, 'OPE');
      return {
        label: 'Screened vertical share',
        resultKind: 'SCREENED_GRAVITY_SHARE',
        loadCaseId: 'OPE',
        screenedVerticalShareN: 8750,
        method: 'SIMPLE_SPAN_TRIBUTARY_VERTICAL_V1',
      };
    },
  },
});
assert.deepEqual(firstCutPresenter.getResultCallouts({ entityId: 'legacy-support-1' }), [{
  label: 'Vertical=8.750kN',
  forceN: 8750,
  forcekN: 8.75,
  direction: 'V',
  resultKind: 'SCREENED_GRAVITY_SHARE',
}]);
console.log('SEQUENTIAL-SKETCHER-T11 PASS [SIMULATED] the sealed first-cut fallback remains reachable.');

const empiricalInspector = buildPropertyInspector(fakeDocument(), currentAuthorized, presenter);
const empiricalHeadings = textForTag(empiricalInspector, 'H3');
assert.ok(empiricalHeadings.includes('Empirical vertical support loads'));
assert.equal(empiricalHeadings.includes('Other qualified results'), false);
assert.ok(textForTag(empiricalInspector, 'DT').includes('Method'));
assert.ok(textForTag(empiricalInspector, 'DT').includes('Authority'));
assert.equal(textForTag(empiricalInspector, 'DD').filter((value) => value.includes('12500')).length, 1);
const lfeaInspector = buildPropertyInspector(fakeDocument(), both, precedencePresenter);
assert.ok(textForTag(lfeaInspector, 'H3').includes('Other qualified results'));
const firstCutInspector = buildPropertyInspector(fakeDocument(), { entityId: 'legacy-support-1', properties: {} }, firstCutPresenter);
assert.ok(textForTag(firstCutInspector, 'H3').includes('Other qualified results'));
console.log('SEQUENTIAL-SKETCHER-T12 PASS [SIMULATED] detailed empirical evidence is retained without a duplicate modern numeric section; LFEA and first-cut sections remain.');

const eventBus = testEventBus();
const dataset = { datasetId: 'SIMULATED-DATASET', entities: [{ entityId: 'support-1' }] };
const renderCalls = [];
let authoringDestroyed = 0;
const controller = Object.create(SequentialSketcherController.prototype);
Object.assign(controller, {
  eventBus,
  workspaceState: {
    getSnapshot() { return { status: 'ready', dataset, selectedEntityId: null }; },
    selectEntity() {},
  },
  view: {
    selectedEntity: null,
    render(value) { renderCalls.push(value); },
  },
  currentDataset: null,
  unsubscribeCallbacks: [],
  authoringBridge: {
    handleWorkspaceSnapshot() {},
    destroy() { authoringDestroyed += 1; },
  },
});
controller.init();
assert.equal(renderCalls.length, 1);
assert.equal(eventBus.subscriberCount(ENGINEERING_MODEL_EVENTS.CHANGED), 1);
eventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'calculated' });
assert.equal(renderCalls.length, 2);
assert.equal(renderCalls[1], dataset);
controller.destroy();
assert.equal(authoringDestroyed, 1);
assert.equal(eventBus.subscriberCount(ENGINEERING_MODEL_EVENTS.CHANGED), 0);
eventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'stale' });
assert.equal(renderCalls.length, 2);
console.log('SEQUENTIAL-SKETCHER-T13 PASS [SIMULATED] engineering changes rerender the active 2D dataset once and destroy unsubscribes.');

console.log('Sequential Sketcher verification PASS');

function empiricalEntity({
  authority = 'AUTHORIZED_HANDOFF',
  freshness = 'CURRENT',
  status = 'CALCULATED',
  forceN = 12500,
  loadCases = null,
} = {}) {
  return {
    entityId: 'support-primary-1',
    entityType: 'SUPPORT',
    category: 'support',
    name: 'SUPPORT-1',
    properties: {
      supportSite: { siteId: 'support-site:0|0|0' },
      engineeringSupportLoads: {
        method: 'CHAINAGE_TRIBUTARY_SPAN_V2',
        authority,
        freshness: { status: freshness },
        sourceAxisBasis: 'Z_UP',
        loadCases: loadCases || [{
          loadCaseId: 'OPE',
          supportSiteId: 'support-site:0|0|0',
          status,
          verticalForceN: forceN,
          contributorIds: ['OPE:pipe-1'],
          excludedInputs: [],
        }],
      },
    },
  };
}

function fakeDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        children: [],
        style: {},
        dataset: {},
        className: '',
        textContent: '',
        append(...children) { this.children.push(...children); },
        addEventListener() {},
      };
    },
  };
}

function textForTag(root, tagName) {
  const matches = [];
  visit(root, (node) => {
    if (node?.tagName === tagName) matches.push(String(node.textContent || ''));
  });
  return matches;
}

function visit(node, callback) {
  callback(node);
  (node?.children || []).forEach((child) => visit(child, callback));
}

function testEventBus() {
  const listeners = new Map();
  return {
    subscribe(topic, callback) {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic).add(callback);
      return () => listeners.get(topic)?.delete(callback);
    },
    publish(topic, payload) {
      [...(listeners.get(topic) || [])].forEach((callback) => callback(payload));
    },
    subscriberCount(topic) { return listeners.get(topic)?.size || 0; },
  };
}
