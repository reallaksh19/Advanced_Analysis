import assert from 'node:assert/strict';
import {
  renderEngineeringLoadPane,
  renderLoadCalcConsumer,
} from '../src/workspace/load-calc-consumer-view.js';

const execution = Object.freeze({
  executionId: 'EXEC-P22',
  executedAt: '2026-08-03T02:10:00.000Z',
  projectId: 'PROJECT-P22',
  status: 'CALCULATED',
  authorizedInputSemanticHash: 'fnv1a64:1111111111111111',
  baselineSemanticHash: 'fnv1a64:2222222222222222',
  handoffSemanticHash: 'fnv1a64:3333333333333333',
  projectionPayloadSemanticHash: 'fnv1a64:4444444444444444',
  distributionSemanticHash: 'fnv1a64:5555555555555555',
  semanticHash: 'fnv1a64:6666666666666666',
});
const distribution = {
  status: 'CALCULATED',
  freshness: { status: 'CURRENT' },
  blockers: [],
  loadCases: [],
};
const supportSiteModel = { status: 'READY', summary: { supportAssemblyCount: 1, physicalLocationCount: 1 }, sites: [] };
const routePartitionModel = { status: 'READY', summary: { routeCount: 1 } };

const documentRef = {
  createElement() {
    return { className: '', dataset: {}, innerHTML: '' };
  },
};
const authorizedView = renderLoadCalcConsumer(documentRef, {
  activeTab: 'loads', message: '', distribution, authorizedExecution: execution,
  supportSiteModel, routePartitionModel,
});
assert.match(authorizedView.innerHTML, /Authority: AUTHORIZED_HANDOFF/u);

const pane = { innerHTML: '' };
renderEngineeringLoadPane(
  pane, distribution, supportSiteModel, routePartitionModel, execution,
);
for (const expected of [
  'data-empirical-authority="AUTHORIZED_HANDOFF"',
  'Authorized execution receipt: EXEC-P22',
  execution.baselineSemanticHash,
  execution.handoffSemanticHash,
  execution.projectionPayloadSemanticHash,
  execution.distributionSemanticHash,
  execution.semanticHash,
]) assert.ok(pane.innerHTML.includes(expected), `missing execution evidence: ${expected}`);

const legacyPane = { innerHTML: '' };
renderEngineeringLoadPane(
  legacyPane, distribution, supportSiteModel, routePartitionModel, null,
);
assert.match(legacyPane.innerHTML, /data-empirical-authority="LEGACY_PROJECT_DATA"/u);
assert.match(legacyPane.innerHTML, /No authorized execution receipt is active/u);

const emptyPane = { innerHTML: '' };
renderEngineeringLoadPane(emptyPane, null, null, null, null);
assert.match(emptyPane.innerHTML, /data-empirical-authority="NOT_CALCULATED"/u);

console.log('PASS authorized empirical execution view checks');
console.log(JSON.stringify({
  authority: 'AUTHORIZED_HANDOFF',
  executionId: execution.executionId,
  receiptSemanticHash: execution.semanticHash,
  legacyDistinguished: true,
  staleReceiptClearedByStoreContract: true,
}, null, 2));
