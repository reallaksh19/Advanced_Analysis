import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';

const TIME_ONLY_KEY = /^(?:timestamp|startedAt|completedAt|timing|timings)$|(?:duration|elapsed)(?:Ms)?$/iu;
const SORTED_ID_LIST_PATH = /\.(?:nodeIds|edgeIds|junctionIds|supportIds|restraintIds|rigidIds|targetIds|candidateRecordIds)$/u;
const TARGET_FIELDS = Object.freeze([
  'nodeId', 'edgeId', 'junctionId', 'supportId', 'restraintId', 'rigidId',
]);
const TARGET_LIST_FIELDS = Object.freeze([
  'nodeIds', 'edgeIds', 'junctionIds', 'supportIds', 'restraintIds', 'rigidIds',
  'targetIds',
]);

export function normalizeTopologyEditDiagnostics(value) {
  if (!Array.isArray(value)) fail('diagnostics must be an array.');
  const normalized = value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`diagnostics[${index}] must be an object.`);
    return normalizeValue(row, `diagnostics[${index}]`);
  });
  normalized.sort((left, right) => diagnosticOrderKey(left).localeCompare(
    diagnosticOrderKey(right),
  ));
  return deepFreeze(normalized);
}

export function topologyEditDiagnosticsHash(value) {
  return semanticHash(normalizeTopologyEditDiagnostics(value));
}

export function topologyEditDiagnosticTargetIds(value) {
  if (!isPlainRecord(value)) return deepFreeze([]);
  const result = [];
  TARGET_FIELDS.forEach((field) => {
    const id = stringValue(value[field]);
    if (id) result.push(id);
  });
  TARGET_LIST_FIELDS.forEach((field) => {
    if (!Array.isArray(value[field])) return;
    value[field].forEach((row) => {
      const id = stringValue(row);
      if (id) result.push(id);
    });
  });
  return deepFreeze([...new Set(result)].sort((left, right) => left.localeCompare(right)));
}

export function mergeTopologyEditIncrementalDiagnostics(
  previousDiagnostics,
  incrementalDiagnostics,
  validationScopeIds,
) {
  const scope = new Set(validationScopeIds ?? []);
  const retained = assertDiagnosticRows(previousDiagnostics, 'previousDiagnostics')
    .filter((row) => !diagnosticTouchesScope(row, scope));
  const replacement = assertDiagnosticRows(
    incrementalDiagnostics,
    'incrementalDiagnostics',
  ).filter((row) => diagnosticTouchesScope(row, scope));
  const merged = new Map();
  [...retained, ...replacement].forEach((row) => {
    merged.set(diagnosticIdentity(row), row);
  });
  return deepFreeze([...merged.values()].sort((left, right) => (
    diagnosticOrderKey(left).localeCompare(diagnosticOrderKey(right))
  )));
}

export function compareTopologyEditDiagnostics(left, right) {
  const leftNormalized = normalizeTopologyEditDiagnostics(left);
  const rightNormalized = normalizeTopologyEditDiagnostics(right);
  const leftHash = semanticHash(leftNormalized);
  const rightHash = semanticHash(rightNormalized);
  return deepFreeze({
    equivalent: leftHash === rightHash,
    leftHash,
    rightHash,
    leftCount: leftNormalized.length,
    rightCount: rightNormalized.length,
  });
}

function diagnosticTouchesScope(row, scope) {
  const ids = topologyEditDiagnosticTargetIds(row);
  if (ids.length === 0) return true;
  return ids.some((id) => scope.has(id));
}

function diagnosticIdentity(row) {
  const id = stringValue(row.id);
  return id || semanticHash(normalizeValue(row, 'diagnostic'));
}

function diagnosticOrderKey(row) {
  return `${stringValue(row.id)}|${stringValue(row.kind)}|${semanticHash(row)}`;
}

function assertDiagnosticRows(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  value.forEach((row, index) => {
    if (!isPlainRecord(row)) fail(`${label}[${index}] must be an object.`);
  });
  return value;
}

function normalizeValue(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} must contain finite numbers.`, RangeError);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    const rows = value.map((child, index) => normalizeValue(child, `${path}[${index}]`));
    return SORTED_ID_LIST_PATH.test(path) && rows.every((row) => typeof row === 'string')
      ? [...new Set(rows)].sort((left, right) => left.localeCompare(right))
      : rows;
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.keys(value)
      .filter((key) => !TIME_ONLY_KEY.test(key))
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, normalizeValue(value[key], `${path}.${key}`)]));
  }
  fail(`${path} contains unsupported ${typeof value}.`);
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditValidationDiagnostics: ${message}`);
}
