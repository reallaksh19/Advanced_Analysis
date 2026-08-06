import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { TopologyEditCertifiedSession } from '../topology-edit-certified-session.js';
import {
  assertTopologyEditOperationGraph,
  createTopologyEditOperationGraph,
  topologyEditOperationReference,
} from './topology-edit-operation-graph.js';
import { assertStartRouteIntent } from './topology-edit-start-route-intent.js';

export const START_ROUTE_PLAN_SCHEMA = 'TopologyEditStartRoutePlan.v2';

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditStartRoutePlan: ${message}`);
}
function assertSession(value) {
  if (!(value instanceof TopologyEditCertifiedSession)) {
    fail('session must be a TopologyEditCertifiedSession.');
  }
  value.assertUsable();
  return value;
}
function operationIdentity(basis, intentHash) {
  const digest = semanticHash({
    schema: 'TopologyEditStartRouteOperationIdentity.v2', basis, intentHash,
  }).split(':').at(-1);
  return `start-route:${digest}`;
}
function routeGeometry(intent) {
  const delta = {
    x: intent.endPointMm.x - intent.startPointMm.x,
    y: intent.endPointMm.y - intent.startPointMm.y,
    z: intent.endPointMm.z - intent.startPointMm.z,
  };
  const lengthMm = Math.hypot(delta.x, delta.y, delta.z);
  const material = {
    startPointMm: intent.startPointMm,
    endPointMm: intent.endPointMm,
    lengthMm,
    unitDirection: {
      x: delta.x / lengthMm,
      y: delta.y / lengthMm,
      z: delta.z / lengthMm,
    },
  };
  return deepFreeze({ ...material, geometryHash: semanticHash(material) });
}
function planMaterial({ operationId, intent, basis, graph }) {
  return {
    schema: START_ROUTE_PLAN_SCHEMA,
    operationId,
    intentHash: intent.intentHash,
    basis,
    basisHash: graph.basisHash,
    graphHash: graph.graphHash,
    geometry: routeGeometry(intent),
    commandTypes: graph.steps.map((step) => step.commandType),
  };
}

export function createStartRoutePlan({ intent: input, session: sessionInput } = {}) {
  const intent = assertStartRouteIntent(input);
  const session = assertSession(sessionInput);
  const basis = deepFreeze({
    datasetId: session.baseAuthority.datasetId,
    datasetVersion: session.baseAuthority.datasetVersion,
    sourceHash: session.baseAuthority.sourceHash,
    baseCanonicalHash: session.baseAuthority.baseCanonicalHash,
    priorCanonicalHash: session.currentTopology().canonicalTopologyHash,
    priorJournalHash: session.journal.journalHash,
    sessionVersion: session.journal.sessionVersion,
    catalogueHash: intent.catalogueBinding.catalogueHash,
    coordinateDatumHash: intent.coordinateDatumHash,
  });
  const operationId = operationIdentity(basis, intent.intentHash);
  const graph = createTopologyEditOperationGraph({
    operationId,
    basisHash: semanticHash(basis),
    steps: [
      {
        stepId: 'step-1',
        commandType: 'CREATE_NODE',
        payload: {
          position: intent.startPointMm,
          creationRole: 'START_ROUTE_FROM',
          coordinateAuthority: `DATUM:${intent.coordinateDatumHash}`,
          sourceOperationId: operationId,
        },
      },
      {
        stepId: 'step-2',
        commandType: 'CREATE_NODE',
        payload: {
          position: intent.endPointMm,
          creationRole: 'START_ROUTE_TO',
          coordinateAuthority: `DATUM:${intent.coordinateDatumHash}`,
          sourceOperationId: operationId,
        },
      },
      {
        stepId: 'step-3',
        commandType: 'INSERT_PIPE_SEGMENT',
        payload: {
          fromNodeId: topologyEditOperationReference('step-1', 'created-node'),
          toNodeId: topologyEditOperationReference('step-2', 'created-node'),
          catalogueBinding: intent.catalogueBinding,
          segmentPolicy: intent.segmentPolicy,
        },
      },
    ],
  });
  const material = planMaterial({ operationId, intent, basis, graph });
  return deepFreeze({ ...material, planHash: semanticHash(material), intent, graph });
}

export function assertStartRoutePlan(value) {
  if (value?.schema !== START_ROUTE_PLAN_SCHEMA) {
    fail(`plan must use ${START_ROUTE_PLAN_SCHEMA}.`);
  }
  const intent = assertStartRouteIntent(value.intent);
  const graph = assertTopologyEditOperationGraph(value.graph);
  const operationId = operationIdentity(value.basis, intent.intentHash);
  if (graph.operationId !== operationId
    || graph.basisHash !== semanticHash(value.basis)
    || value.operationId !== operationId
    || value.intentHash !== intent.intentHash
    || value.graphHash !== graph.graphHash
    || value.basis.catalogueHash !== intent.catalogueBinding.catalogueHash
    || value.basis.coordinateDatumHash !== intent.coordinateDatumHash) {
    fail('plan dependencies differ from declared authority.', RangeError);
  }
  const material = planMaterial({ operationId, intent, basis: value.basis, graph });
  if (semanticHash(material) !== value.planHash) fail('plan hash mismatch.', RangeError);
  return value;
}
