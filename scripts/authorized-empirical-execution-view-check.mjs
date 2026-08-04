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
const supportSiteModel = {
  status: 'READY',
  summary: { supportAssemblyCount: 1, physicalLocationCount: 1 },
  sites: [],
};
const routePartitionModel = { status: 'READY', summary: { routeCount: 1 } };
const currentAuthorization = Object.freeze({
  state: 'EXECUTED_CURRENT',
  calculationEligible: true,
  reasonCode: null,
  details: [],
  authorizationFreshness: 'CURRENT',
  executionFreshness: 'CURRENT',
  packageSemanticHash: 'fnv1a64:7777777777777777',
});
const notConfigured = Object.freeze({
  state: 'NOT_CONFIGURED',
  calculationEligible: false,
  reasonCode: 'EMPIRICAL_PACKAGE_REQUIRED',
  details: [],
  authorizationFreshness: 'NOT_APPLICABLE',
  executionFreshness: 'NOT_APPLICABLE',
  packageSemanticHash: null,
});

const documentRef = {
  createElement() {
    return { className: '', dataset: {}, innerHTML: '' };
  },
};
const authorizedView = renderLoadCalcConsumer(documentRef, {
  activeTab: 'loads',
  message: '',
  distribution,
  authorizedExecution: execution,
  authorizationState: currentAuthorization,
  supportSiteModel,
  routePartitionModel,
});
assert.match(authorizedView.innerHTML, /Authority: AUTHORIZED_HANDOFF/u);
assert.match(authorizedView.innerHTML, /Recalculate authorized loads/u);
assert.doesNotMatch(authorizedView.innerHTML, / data-engineering-load-calculate disabled/u);
assert.match(authorizedView.innerHTML, /aria-disabled="false"/u);

const pane = { innerHTML: '' };
renderEngineeringLoadPane(
  pane,
  distribution,
  supportSiteModel,
  routePartitionModel,
  execution,
  currentAuthorization,
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
  legacyPane,
  distribution,
  supportSiteModel,
  routePartitionModel,
  null,
  notConfigured,
);
assert.match(legacyPane.innerHTML, /data-empirical-authority="UNAUTHORIZED_LEGACY_RESULT"/u);
assert.match(legacyPane.innerHTML, /explicitly authorized empirical package is required/u);
assert.doesNotMatch(legacyPane.innerHTML, /LEGACY_PROJECT_DATA/u);

const emptyView = renderLoadCalcConsumer(documentRef, {
  activeTab: 'loads',
  message: '',
  distribution: null,
  authorizedExecution: null,
  authorizationState: notConfigured,
  supportSiteModel: null,
  routePartitionModel: null,
});
assert.match(emptyView.innerHTML, /disabled/u);
assert.match(emptyView.innerHTML, /explicitly authorized empirical package is required/u);
assert.doesNotMatch(emptyView.innerHTML, /calculation is available/u);

const emptyPane = { innerHTML: '' };
renderEngineeringLoadPane(emptyPane, null, null, null, null, notConfigured);
assert.match(emptyPane.innerHTML, /data-empirical-authority="NOT_CALCULATED"/u);

const quotedBlocker = Object.freeze({
  ...notConfigured,
  state: 'BLOCKED_NOT_READY',
  reasonCode: 'EMPIRICAL_INPUT_NOT_READY',
  details: [{ code: 'BLOCKED_"QUOTED"', message: 'Value < limit & unresolved' }],
});
const blockedPane = { innerHTML: '' };
renderEngineeringLoadPane(blockedPane, null, null, null, null, quotedBlocker);
assert.ok(blockedPane.innerHTML.includes('BLOCKED_\\&quot;QUOTED\\&quot;'));
assert.match(blockedPane.innerHTML, /Value &lt; limit &amp; unresolved/u);
assert.doesNotMatch(blockedPane.innerHTML, /undefined/u);

console.log('PASS authorized empirical execution view checks');
console.log(JSON.stringify({
  authority: 'AUTHORIZED_HANDOFF',
  executionId: execution.executionId,
  receiptSemanticHash: execution.semanticHash,
  legacyDistinguished: true,
  staleReceiptRetainedByRuntimeStore: true,
  quoteEscapingVerified: true,
}, null, 2));
