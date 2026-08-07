import { semanticHash } from './canonical-json.js';
import { normalizePoint } from './evidence.js';
import { stringValue } from './immutable.js';

export const NATIVE_PIPE_WRITEBACK_SCHEMA = 'TopologyEditNativePipeWriteback.v1';

export function assertNativePipeWritebackEnvelope(entity) {
  const params = entity?.properties?.nativeParams;
  if (params?.schema !== NATIVE_PIPE_WRITEBACK_SCHEMA) {
    fail(`nativeParams must use ${NATIVE_PIPE_WRITEBACK_SCHEMA}.`, TypeError);
  }
  const supplied = { ...params };
  delete supplied.writebackHash;
  const writebackHash = requiredText(params.writebackHash, 'writebackHash');
  if (semanticHash(supplied) !== writebackHash) {
    fail('writeback hash mismatch.');
  }
  const attributeHash = stringValue(entity?.properties?.attributes?.NATIVE_WRITEBACK_HASH);
  if (attributeHash !== writebackHash) {
    fail('workspace writeback hash differs from native record.');
  }
  const componentKey = requiredText(params.componentKey, 'componentKey');
  if (entity?.entityId !== componentKey || entity?.sourceEntityId !== componentKey) {
    fail('workspace identity differs from native component key.');
  }
  if (!Array.isArray(params.ports) || params.ports.length !== 2) {
    fail('native pipe requires exactly two explicit ports.');
  }
  if (!Array.isArray(params.endpointNodes) || params.endpointNodes.length !== 2) {
    fail('native pipe requires exactly two explicit endpoint nodes.');
  }
  const [fromPort, toPort] = params.ports;
  if (fromPort?.role !== 'start' || toPort?.role !== 'end') {
    fail('native pipe port roles must be start and end.');
  }
  if (fromPort.nodeId === toPort.nodeId || fromPort.portKey === toPort.portKey) {
    fail('native pipe endpoint identities must be distinct.');
  }
  const geometry = entity?.properties?.geometry;
  assertPointMatch(geometry?.start, fromPort.position, 'workspace start geometry');
  assertPointMatch(geometry?.end, toPort.position, 'workspace end geometry');
  validateEndpoint(params.endpointNodes[0], fromPort, 0);
  validateEndpoint(params.endpointNodes[1], toPort, 1);
  return entity;
}

function validateEndpoint(node, port, index) {
  if (!node || node.id !== port.nodeId) {
    fail(`endpoint node ${index} differs from explicit port identity.`);
  }
  if (!Array.isArray(node.portKeys) || !node.portKeys.includes(port.portKey)) {
    fail(`endpoint node ${node.id} is incomplete for explicit port ${port.portKey}.`);
  }
  assertPointMatch(node.position, port.position, `endpoint node ${node.id}`);
}

function assertPointMatch(leftValue, rightValue, label) {
  const left = normalizePoint(leftValue);
  const right = normalizePoint(rightValue);
  if (!left || !right || semanticHash(left) !== semanticHash(right)) {
    fail(`${label} differs from explicit native port evidence.`);
  }
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`, TypeError);
  return text;
}
function fail(message, Constructor = RangeError) {
  throw new Constructor(`NativePipeWritebackEnvelope: ${message}`);
}
