export function lafeaDocumentDigest(value) {
  const text = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function canonicalStringify(value) {
  assertJsonSafe(value);
  return stringifyValue(value);
}

export function assertJsonSafe(value, path = 'document', seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw pathError('LAFEA_NON_FINITE_NUMBER', path, `${path} must be finite.`);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    throw pathError('LAFEA_NON_JSON_VALUE', path, `${path} must contain JSON-safe data.`);
  }
  if (seen.has(value)) {
    throw pathError('LAFEA_JSON_CYCLE', path, `${path} must not contain a cycle.`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafe(entry, `${path}[${index}]`, seen));
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw pathError('LAFEA_NON_PLAIN_OBJECT', path, `${path} must use plain JSON objects.`);
    }
    Object.entries(value).forEach(([key, entry]) => {
      assertJsonSafe(entry, `${path}.${key}`, seen);
    });
  }
  seen.delete(value);
}

export function exactKeys(value, expected, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new TypeError(`${label} exact-key contract mismatch.`);
  }
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function frozenClone(value) {
  return deepFreeze(structuredClone(value));
}

export function safeDigest(value) {
  try {
    return lafeaDocumentDigest(value);
  } catch {
    return 'UNAVAILABLE';
  }
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getAtPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

export function requireParent(root, path) {
  let current = root;
  for (const segment of path.slice(0, -1)) {
    if ((typeof segment !== 'string' && typeof segment !== 'number')
      || current?.[segment] === undefined) {
      throw pathError(
        'LAFEA_EDIT_PATH_NOT_FOUND',
        path.join('.'),
        `Missing edit path ${path.join('.')}.`,
      );
    }
    current = current[segment];
  }
  return current;
}

export function descriptorPath(descriptor, entityId) {
  const prefix = descriptor.target.collectionPath
    ? `${descriptor.target.collectionPath}[${descriptor.target.identityKey}=${entityId}]`
    : 'document';
  return descriptor.target.propertyPath.length
    ? `${prefix}.${descriptor.target.propertyPath.join('.')}`
    : prefix;
}

export function containsExactString(value, expected) {
  if (value === expected) return true;
  if (Array.isArray(value)) {
    return value.some((entry) => containsExactString(entry, expected));
  }
  if (isRecord(value)) {
    return Object.values(value).some((entry) => containsExactString(entry, expected));
  }
  return false;
}

export function classifyStoredValue(value) {
  if (value === undefined) return 'MISSING';
  if (value === null) return 'PRESENT_NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'INVALID_NUMBER';
    return value === 0 ? 'EXPLICIT_ZERO' : 'FINITE_NUMBER';
  }
  return 'PRESENT';
}

export function diagnostic(severity, code, path, entityId, message) {
  return { severity, code, path, entityId, message };
}

export function emptyChange(operation, entityId) {
  return {
    operation,
    entityId,
    resolvedPath: null,
    previousState: null,
    currentState: null,
    previousValue: null,
    currentValue: null,
  };
}

export function sanitizeCommand(value) {
  if (isRecord(value)) return value;
  return {
    commandId: 'INVALID_COMMAND',
    stageId: null,
    operation: null,
    target: { entityId: null },
    input: null,
  };
}

export function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function pathError(code, path, message) {
  const error = contractError(code, message);
  error.path = path;
  return error;
}

export function entityError(code, entityId, message) {
  const error = contractError(code, message);
  error.entityId = entityId;
  return error;
}

function stringifyValue(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Object.is(value, -0)) return '0';
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${stringifyValue(value[key])}`
  )).join(',')}}`;
}
