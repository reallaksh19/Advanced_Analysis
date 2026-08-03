import assert from 'node:assert/strict';
import {
  AUTHORIZED_ENRICHMENT_WORKSPACE_API_METHODS,
  createAuthorizedEnrichmentWorkspaceApi,
} from '../src/workspace/enrichment/authorized-enrichment-workspace-api.js';

const calls = [];
const notifications = [];
const empiricalResult = Object.freeze({ schema: 'authorized-empirical-load-execution/v1' });
const stagedResult = Object.freeze({ schema: 'authorized-staged-json-consumer-result/v1' });
const documentRef = { createElement() { return {}; } };
const controller = {
  executeEmpirical(request) {
    calls.push({ kind: 'EMPIRICAL', request });
    if (request.fail) {
      const error = new Error('blocked');
      error.code = 'EMPIRICAL_BLOCKED';
      throw error;
    }
    return empiricalResult;
  },
  async downloadStagedJson(request, actualDocument, runtime) {
    calls.push({ kind: 'STAGED_JSON', request, actualDocument, runtime });
    return stagedResult;
  },
};

const api = createAuthorizedEnrichmentWorkspaceApi({
  documentRef,
  controller,
  onEmpiricalChanged(result) { notifications.push({ kind: 'CHANGED', result }); },
  onEmpiricalFailed(error) { notifications.push({ kind: 'FAILED', error }); },
});
assert.ok(Object.isFrozen(api));
assert.deepEqual(Object.keys(api), AUTHORIZED_ENRICHMENT_WORKSPACE_API_METHODS);

const empiricalRequest = Object.freeze({ schema: 'authorized-empirical-consumer-request/v1' });
assert.equal(api.executeAuthorizedEmpiricalLoads(empiricalRequest), empiricalResult);
assert.deepEqual(notifications, [{ kind: 'CHANGED', result: empiricalResult }]);

const failureRequest = Object.freeze({
  schema: 'authorized-empirical-consumer-request/v1',
  fail: true,
});
expectCode(
  () => api.executeAuthorizedEmpiricalLoads(failureRequest),
  'EMPIRICAL_BLOCKED',
);
assert.equal(notifications.length, 2);
assert.equal(notifications[1].kind, 'FAILED');
assert.equal(notifications[1].error.code, 'EMPIRICAL_BLOCKED');

const stagedRequest = Object.freeze({ schema: 'authorized-staged-json-consumer-request/v1' });
const runtime = Object.freeze({ runtime: 'TEST' });
assert.equal(
  await api.downloadAuthorizedEnrichedStagedJson(stagedRequest, runtime),
  stagedResult,
);
assert.equal(notifications.length, 2, 'stagedJson path emitted empirical notifications');
assert.deepEqual(calls, [
  { kind: 'EMPIRICAL', request: empiricalRequest },
  { kind: 'EMPIRICAL', request: failureRequest },
  {
    kind: 'STAGED_JSON',
    request: stagedRequest,
    actualDocument: documentRef,
    runtime,
  },
]);

const validDependencies = {
  documentRef,
  controller,
  onEmpiricalChanged() {},
  onEmpiricalFailed() {},
};
expectCode(
  () => createAuthorizedEnrichmentWorkspaceApi({ ...validDependencies, documentRef: null }),
  'AUTHORIZED_ENRICHMENT_WORKSPACE_DOCUMENT_INVALID',
);
expectCode(
  () => createAuthorizedEnrichmentWorkspaceApi({ ...validDependencies, controller: {} }),
  'AUTHORIZED_ENRICHMENT_WORKSPACE_CONTROLLER_INVALID',
);
expectCode(
  () => createAuthorizedEnrichmentWorkspaceApi({
    ...validDependencies,
    controller: { executeEmpirical() {} },
  }),
  'AUTHORIZED_ENRICHMENT_WORKSPACE_CONTROLLER_INVALID',
);
expectCode(
  () => createAuthorizedEnrichmentWorkspaceApi({
    ...validDependencies,
    onEmpiricalChanged: null,
  }),
  'AUTHORIZED_ENRICHMENT_WORKSPACE_CALLBACK_INVALID',
);
expectCode(
  () => createAuthorizedEnrichmentWorkspaceApi({
    ...validDependencies,
    onEmpiricalFailed: null,
  }),
  'AUTHORIZED_ENRICHMENT_WORKSPACE_CALLBACK_INVALID',
);

console.log('PASS authorized enrichment workspace API notification checks');
console.log(JSON.stringify({
  methods: Object.keys(api),
  successNotifications: notifications.filter((row) => row.kind === 'CHANGED').length,
  failureNotifications: notifications.filter((row) => row.kind === 'FAILED').length,
  stagedJsonDocumentBound: calls[2].actualDocument === documentRef,
  runtimeForwarded: calls[2].runtime === runtime,
}, null, 2));

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}
