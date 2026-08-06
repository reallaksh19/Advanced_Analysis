import {
  deepFreeze,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_OPERATION_GRAPH_SCHEMA =
  'TopologyEditOperationGraph.v1';
export const TOPOLOGY_EDIT_OPERATION_REFERENCE_SCHEMA =
  'TopologyEditOperationReference.v1';

const COMMAND_OUTPUT_ROLES = deepFreeze({
  CREATE_NODE: ['created-node'],
  BRIDGE_GAP: ['created-edge'],
  ADD_STRAIGHT_ELEMENT: ['created-edge'],
  SPLIT_EDGE: ['split-node', 'split-left-edge', 'split-right-edge'],
  DISCONNECT_ENDPOINT: ['disconnected-node'],
  ADD_BEND_DEFINITION: ['bend-definition'],
  ADD_JUNCTION_DEFINITION: ['junction-definition'],
  INSERT_INLINE_COMPONENT: [
    'inline-from-node',
    'inline-to-node',
    'inline-left-edge',
    'inline-component-edge',
    'inline-right-edge',
  ],
});

export function topologyEditOperationReference(stepIdInput, roleInput) {
  const material = {
    schema: TOPOLOGY_EDIT_OPERATION_REFERENCE_SCHEMA,
    stepId: requiredText(stepIdInput, 'stepId'),
    role: requiredText(roleInput, 'role').toLowerCase(),
  };
  return deepFreeze({ ...material, referenceHash: semanticHash(material) });
}

export function createTopologyEditOperationGraph(input = {}) {
  const steps = normalizeSteps(input.steps);
  const material = {
    schema: TOPOLOGY_EDIT_OPERATION_GRAPH_SCHEMA,
    operationId: requiredText(input.operationId, 'operationId'),
    basisHash: requiredText(input.basisHash, 'basisHash'),
    steps,
  };
  return deepFreeze({ ...material, graphHash: semanticHash(material) });
}

export function assertTopologyEditOperationGraph(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_OPERATION_GRAPH_SCHEMA) {
    fail(`graph must use ${TOPOLOGY_EDIT_OPERATION_GRAPH_SCHEMA}.`);
  }
  const rebuilt = createTopologyEditOperationGraph(value);
  if (value.graphHash !== rebuilt.graphHash) fail('graph hash mismatch.', RangeError);
  return rebuilt;
}

export async function executeTopologyEditOperationGraph(input = {}) {
  const graph = assertTopologyEditOperationGraph(input.graph);
  if (typeof input.execute !== 'function') fail('execute callback is required.');
  let topology = input.initialTopology;
  const bindings = new Map();
  const receipts = [];
  for (const step of graph.steps) {
    const payload = materializeTopologyEditOperationPayload(step.payload, bindings);
    const receipt = await input.execute({
      stepId: step.stepId,
      commandType: step.commandType,
      payload,
      topology,
    });
    const normalized = normalizeExecutionReceipt(receipt, step.stepId);
    topology = normalized.topology;
    const outputs = deriveTopologyEditOperationOutputs({
      commandType: step.commandType,
      commandId: normalized.commandId,
      priorTopology: normalized.priorTopology,
      topology,
    });
    for (const [role, canonicalId] of Object.entries(outputs)) {
      bindings.set(bindingKey(step.stepId, role), canonicalId);
    }
    receipts.push(deepFreeze({
      stepId: step.stepId,
      commandType: step.commandType,
      commandId: normalized.commandId,
      payload,
      outputs,
      canonicalHash: topology?.canonicalTopologyHash ?? null,
    }));
  }
  const material = {
    schema: 'TopologyEditOperationGraphExecution.v1',
    graphHash: graph.graphHash,
    receipts,
    bindings: Object.fromEntries([...bindings.entries()].sort(([left], [right]) => (
      left.localeCompare(right)
    ))),
    resultingCanonicalHash: topology?.canonicalTopologyHash ?? null,
  };
  return deepFreeze({
    ...material,
    executionHash: semanticHash(material),
    topology,
  });
}

export function materializeTopologyEditOperationPayload(value, bindingsInput) {
  const bindings = bindingsInput instanceof Map
    ? bindingsInput
    : new Map(Object.entries(bindingsInput ?? {}));
  return deepFreeze(materialize(value, bindings, 'payload'));
}

export function deriveTopologyEditOperationOutputs(input = {}) {
  const commandType = requiredText(input.commandType, 'commandType').toUpperCase();
  const commandId = requiredText(input.commandId, 'commandId');
  const before = input.priorTopology ?? {};
  const after = input.topology ?? {};
  const addedNodes = addedRecords(before.nodes, after.nodes)
    .filter((row) => row.createdByCommandId === commandId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const addedEdges = addedRecords(before.edges, after.edges)
    .filter((row) => row.createdByCommandId === commandId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const addedBends = addedRecords(before.bends, after.bends)
    .filter((row) => row.createdByCommandId === commandId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const addedJunctions = addedRecords(before.junctions, after.junctions)
    .filter((row) => row.createdByCommandId === commandId)
    .sort((left, right) => left.id.localeCompare(right.id));

  const outputs = {
    CREATE_NODE: () => exactRoles(['created-node'], addedNodes),
    BRIDGE_GAP: () => exactRoles(['created-edge'], addedEdges),
    ADD_STRAIGHT_ELEMENT: () => exactRoles(['created-edge'], addedEdges),
    DISCONNECT_ENDPOINT: () => exactRoles(['disconnected-node'], addedNodes),
    ADD_BEND_DEFINITION: () => exactRoles(['bend-definition'], addedBends),
    ADD_JUNCTION_DEFINITION: () => exactRoles(['junction-definition'], addedJunctions),
    SPLIT_EDGE: () => splitOutputs(addedNodes, addedEdges),
    INSERT_INLINE_COMPONENT: () => inlineOutputs(addedNodes, addedEdges),
  }[commandType];
  if (!outputs) return deepFreeze({});
  return deepFreeze(outputs());
}

function normalizeSteps(value) {
  if (!Array.isArray(value) || value.length === 0) fail('steps must be a non-empty array.');
  const ids = new Set();
  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      fail(`steps[${index}] must be an object.`);
    }
    const stepId = requiredText(row.stepId ?? `step-${index + 1}`, `steps[${index}].stepId`);
    if (ids.has(stepId)) fail(`duplicate stepId ${stepId}.`, RangeError);
    ids.add(stepId);
    const commandType = requiredText(row.commandType, `steps[${index}].commandType`).toUpperCase();
    const outputRoles = COMMAND_OUTPUT_ROLES[commandType] ?? [];
    return {
      sequence: index,
      stepId,
      commandType,
      payload: normalizeJson(row.payload ?? {}, `steps[${index}].payload`),
      outputRoles,
    };
  });
}

function normalizeJson(value, path) {
  if (isReference(value)) return assertReference(value, path);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} must contain finite numbers.`, RangeError);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((row, index) => normalizeJson(row, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      normalizeJson(value[key], `${path}.${key}`),
    ]));
  }
  fail(`${path} contains unsupported ${typeof value}.`);
}

function materialize(value, bindings, path) {
  if (isReference(value)) {
    const reference = assertReference(value, path);
    const key = bindingKey(reference.stepId, reference.role);
    if (!bindings.has(key)) fail(`unresolved operation reference ${key}.`, RangeError);
    return bindings.get(key);
  }
  if (Array.isArray(value)) return value.map((row, index) => materialize(row, bindings, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, row]) => [
      key,
      materialize(row, bindings, `${path}.${key}`),
    ]));
  }
  return value;
}

function isReference(value) {
  return value?.schema === TOPOLOGY_EDIT_OPERATION_REFERENCE_SCHEMA;
}

function assertReference(value, path) {
  const material = {
    schema: TOPOLOGY_EDIT_OPERATION_REFERENCE_SCHEMA,
    stepId: requiredText(value.stepId, `${path}.stepId`),
    role: requiredText(value.role, `${path}.role`).toLowerCase(),
  };
  if (value.referenceHash !== semanticHash(material)) fail(`${path} reference hash mismatch.`, RangeError);
  return deepFreeze({ ...material, referenceHash: value.referenceHash });
}

function normalizeExecutionReceipt(value, stepId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`execute result for ${stepId} must be an object.`);
  }
  if (!value.topology) fail(`execute result for ${stepId} requires topology.`);
  return {
    commandId: requiredText(value.commandId, `${stepId}.commandId`),
    priorTopology: value.priorTopology ?? {},
    topology: value.topology,
  };
}

function addedRecords(beforeRows = [], afterRows = []) {
  const before = new Set((beforeRows ?? []).map((row) => row?.id));
  return (afterRows ?? []).filter((row) => !before.has(row?.id));
}

function exactRoles(roles, records) {
  if (records.length !== roles.length) {
    fail(`expected ${roles.length} generated record(s), received ${records.length}.`, RangeError);
  }
  return Object.fromEntries(roles.map((role, index) => [role, records[index].id]));
}

function splitOutputs(nodes, edges) {
  if (nodes.length !== 1 || edges.length !== 2) {
    fail('SPLIT_EDGE output shape must be one node and two edges.', RangeError);
  }
  const ordered = [...edges].sort((left, right) => left.id.localeCompare(right.id));
  return {
    'split-node': nodes[0].id,
    'split-left-edge': ordered[0].id,
    'split-right-edge': ordered[1].id,
  };
}

function inlineOutputs(nodes, edges) {
  if (nodes.length !== 2 || edges.length !== 3) {
    fail('INSERT_INLINE_COMPONENT output shape must be two nodes and three edges.', RangeError);
  }
  const component = edges.find((edge) => edge.topologyOperation === 'INSERT_INLINE_COMPONENT');
  if (!component) fail('inline component output is missing its component edge.', RangeError);
  const sideEdges = edges.filter((edge) => edge.id !== component.id)
    .sort((left, right) => left.id.localeCompare(right.id));
  const orderedNodes = [...nodes].sort((left, right) => (
    String(left.inlineComponentEndpoint).localeCompare(String(right.inlineComponentEndpoint))
      || left.id.localeCompare(right.id)
  ));
  return {
    'inline-from-node': orderedNodes.find((node) => node.inlineComponentEndpoint === 'FROM')?.id
      ?? orderedNodes[0].id,
    'inline-to-node': orderedNodes.find((node) => node.inlineComponentEndpoint === 'TO')?.id
      ?? orderedNodes[1].id,
    'inline-left-edge': sideEdges[0].id,
    'inline-component-edge': component.id,
    'inline-right-edge': sideEdges[1].id,
  };
}

function bindingKey(stepId, role) {
  return `${stepId}.${role}`;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditOperationGraph: ${message}`);
}
