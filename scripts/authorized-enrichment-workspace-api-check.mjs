import assert from 'node:assert/strict';
import {
  AUTHORIZED_ENRICHMENT_WORKSPACE_API_METHODS,
  createAuthorizedEnrichmentWorkspaceApi,
} from '../src/workspace/enrichment/authorized-enrichment-workspace-api.js';

const calls = [];
const notifications = [];
const authorizedState = Object.freeze({ state: 'AUTHORIZED_CURRENT', calculationEligible: true });
const executedState = Object.freeze({ state: 'EXECUTED_CURRENT', calculationEligible: true });
const execution = Object.freeze({ schema: 'authorized-empirical-load-execution/v1', distribution: { status: 'CALCULATED' } });
const stagedResult = Object.freeze({ schema: 'authorized-staged-json-consumer-result/v1' });
let state = authorizedState;
const documentRef = { createElement() { return {}; } };
const controller = {
  configureEmpirical(request) { calls.push({ kind: 'CONFIGURE', request }); state = authorizedState; return state; },
  executeEmpirical() { calls.push({ kind: 'EXECUTE' }); state = executedState; return execution; },
  getEmpiricalAuthorizationState() { return state; },
  async downloadStagedJson(request, actualDocument, runtime) {
    calls.push({ kind: 'STAGED_JSON', request, actualDocument, runtime });
    return stagedResult;
  },
};
const api = createAuthorizedEnrichmentWorkspaceApi({
  documentRef,
  controller,
  onEmpiricalAuthorizationChanged(result) { notifications.push({ kind: 'AUTHORIZATION', result }); },
  onEmpiricalChanged(result) { notifications.push({ kind: 'CHANGED', result }); },
  onEmpiricalFailed(error) { notifications.push({ kind: 'FAILED', error }); },
});
assert.ok(Object.isFrozen(api));
assert.deepEqual(Object.keys(api), AUTHORIZED_ENRICHMENT_WORKSPACE_API_METHODS);

const request = Object.freeze({ schema: 'authorized-empirical-consumer-request/v2', runtimePackage: {} });
assert.equal(api.configureAuthorizedEmpiricalLoads(request), authorizedState);
assert.equal(api.getAuthorizedEmpiricalLoadState(), authorizedState);
assert.equal(api.executeAuthorizedEmpiricalLoads(), execution);
assert.equal(api.getAuthorizedEmpiricalLoadState(), executedState);
assert.deepEqual(notifications.map((row) => row.kind), ['AUTHORIZATION', 'CHANGED', 'AUTHORIZATION']);

const stagedRequest = Object.freeze({ schema: 'authorized-staged-json-consumer-request/v1' });
const runtime = Object.freeze({ runtime: 'TEST' });
assert.equal(await api.downloadAuthorizedEnrichedStagedJson(stagedRequest, runtime), stagedResult);
assert.deepEqual(calls.map((row) => row.kind), ['CONFIGURE', 'EXECUTE', 'STAGED_JSON']);
assert.equal(calls[2].actualDocument, documentRef);
assert.equal(calls[2].runtime, runtime);

const failingController = { ...controller, executeEmpirical() { const error = new Error('blocked'); error.code = 'EMPIRICAL_BLOCKED'; throw error; } };
const failingApi = createAuthorizedEnrichmentWorkspaceApi({
  documentRef,
  controller: failingController,
  onEmpiricalAuthorizationChanged() {},
  onEmpiricalChanged() {},
  onEmpiricalFailed(error) { notifications.push({ kind: 'FAILED', error }); },
});
assert.throws(() => failingApi.executeAuthorizedEmpiricalLoads(), (error) => error.code === 'EMPIRICAL_BLOCKED');
assert.equal(notifications.at(-1).kind, 'FAILED');

console.log(JSON.stringify({
  status: 'PASS',
  methods: Object.keys(api),
  configuredState: authorizedState.state,
  executedState: executedState.state,
  stagedJsonDocumentBound: true,
}, null, 2));
