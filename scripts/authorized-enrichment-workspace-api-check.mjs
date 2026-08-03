import assert from 'node:assert/strict';
import {
  AUTHORIZED_ENRICHMENT_WORKSPACE_API_METHODS,
  createAuthorizedEnrichmentWorkspaceApi,
} from '../src/workspace/enrichment/authorized-enrichment-workspace-api.js';

const calls = [];
const empiricalResult = Object.freeze({ schema: 'authorized-empirical-load-execution/v1' });
const stagedResult = Object.freeze({ schema: 'authorized-staged-json-consumer-result/v1' });
const documentRef = { createElement() { return {}; } };
const controller = {
  executeEmpirical(request) {
    calls.push({ kind: 'EMPIRICAL', request });
    return empiricalResult;
  },
  async downloadStagedJson(request, actualDocument, runtime) {
    calls.push({ kind: 'STAGED_JSON', request, actualDocument, runtime });
    return stagedResult;
  },
};

const api = createAuthorizedEnrichmentWorkspaceApi({ documentRef, controller });
assert.ok(Object.isFrozen(api));
assert.deepEqual(Object.keys(api), AUTHORIZED_ENRICHMENT_WORKSPACE_API_METHODS);

const empiricalRequest = Object.freeze({ schema: 'authorized-empirical-consumer-request/v1' });
assert.equal(api.executeAuthorizedEmpiricalLoads(empiricalRequest), empiricalResult);

const stagedRequest = Object.freeze({ schema: 'authorized-staged-json-consumer-request/v1' });
const runtime = Object.freeze({ runtime: 'TEST' });
assert.equal(
  await api.downloadAuthorizedEnrichedStagedJson(stagedRequest, runtime),
  stagedResult,
);
assert.deepEqual(calls, [
  { kind: 'EMPIRICAL', request: empiricalRequest },
  {
    kind: 'STAGED_JSON',
    request: stagedRequest,
    actualDocument: documentRef,
    runtime,
  },
]);

expectCode(
  () => createAuthorizedEnrichmentWorkspaceApi({ documentRef: null, controller }),
  'AUTHORIZED_ENRICHMENT_WORKSPACE_DOCUMENT_INVALID',
);
expectCode(
  () => createAuthorizedEnrichmentWorkspaceApi({ documentRef, controller: {} }),
  'AUTHORIZED_ENRICHMENT_WORKSPACE_CONTROLLER_INVALID',
);
expectCode(
  () => createAuthorizedEnrichmentWorkspaceApi({
    documentRef,
    controller: { executeEmpirical() {} },
  }),
  'AUTHORIZED_ENRICHMENT_WORKSPACE_CONTROLLER_INVALID',
);

console.log('PASS authorized enrichment workspace API checks');
console.log(JSON.stringify({
  methods: Object.keys(api),
  empiricalForwarded: calls[0].request === empiricalRequest,
  stagedJsonDocumentBound: calls[1].actualDocument === documentRef,
  runtimeForwarded: calls[1].runtime === runtime,
}, null, 2));

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}
