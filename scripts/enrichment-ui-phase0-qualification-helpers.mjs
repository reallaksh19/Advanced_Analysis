import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stableStringify } from './enrichment-ui-phase0-fixtures.mjs';

export class QualificationFailure extends Error {
  constructor(code, detail = null) {
    super(code);
    this.name = 'QualificationFailure';
    this.code = code;
    this.detail = detail;
  }
}

export function fail(code, detail = null) {
  throw new QualificationFailure(code, detail);
}

export async function expectFailure(expectedCode, operation) {
  try {
    await operation();
  } catch (error) {
    assert.equal(error?.code, expectedCode, `E_QF_UNEXPECTED_FAILURE_CODE: expected ${expectedCode}, received ${error?.code ?? error?.message}`);
    return error;
  }
  assert.fail(`E_QF_NEGATIVE_TEST_NOT_CAUGHT: ${expectedCode}`);
}

export function semanticHash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function readonlyProxy(value, authorityCode, cache = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (cache.has(value)) return cache.get(value);

  const proxyTarget = cloneProxyTarget(value);
  const proxy = new Proxy(proxyTarget, {
    set(_target, property) {
      fail(`E_QF_${authorityCode}_MUTATION`, { operation: 'set', property: String(property) });
    },
    deleteProperty(_target, property) {
      fail(`E_QF_${authorityCode}_MUTATION`, { operation: 'delete', property: String(property) });
    },
    defineProperty(_target, property) {
      fail(`E_QF_${authorityCode}_MUTATION`, { operation: 'defineProperty', property: String(property) });
    },
    setPrototypeOf() {
      fail(`E_QF_${authorityCode}_MUTATION`, { operation: 'setPrototypeOf' });
    },
    get(target, property) {
      if (isMutatingMethod(target, property)) {
        return (...args) => fail(`E_QF_${authorityCode}_MUTATION`, {
          operation: String(property),
          argumentCount: args.length,
        });
      }
      if (ArrayBuffer.isView(target) && property === 'buffer') return target.buffer.slice(0);
      if (target instanceof Map && property === 'get') {
        return (key) => readonlyProxy(target.get(key), authorityCode, cache);
      }
      if (target instanceof Map && (property === 'values' || property === 'entries' || property === Symbol.iterator)) {
        return () => proxyMapIterator(target, property, authorityCode, cache);
      }
      if (target instanceof Set && (property === 'values' || property === 'entries' || property === Symbol.iterator)) {
        return () => proxySetIterator(target, property, authorityCode, cache);
      }
      const result = Reflect.get(target, property, target);
      if (typeof result === 'function' && (ArrayBuffer.isView(target) || target instanceof Map || target instanceof Set)) {
        return result.bind(target);
      }
      return readonlyProxy(result, authorityCode, cache);
    },
  });
  cache.set(value, proxy);
  return proxy;
}

function cloneProxyTarget(value) {
  if (Array.isArray(value)) return value.slice();
  if (value instanceof Map) return new Map(value);
  if (value instanceof Set) return new Set(value);
  if (ArrayBuffer.isView(value)) return value.slice();
  return { ...value };
}

export function createGuardedStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries));
  const calls = [];
  return Object.freeze({
    calls,
    storage: Object.freeze({
      get length() {
        return entries.size;
      },
      key(index) {
        calls.push({ operation: 'key', index });
        return Array.from(entries.keys()).sort()[index] ?? null;
      },
      getItem(key) {
        calls.push({ operation: 'getItem', key: String(key) });
        return entries.get(String(key)) ?? null;
      },
      setItem(key) {
        fail('E_QF_STORAGE_WRITE', { operation: 'setItem', key: String(key) });
      },
      removeItem(key) {
        fail('E_QF_STORAGE_WRITE', { operation: 'removeItem', key: String(key) });
      },
      clear() {
        fail('E_QF_STORAGE_WRITE', { operation: 'clear' });
      },
      snapshot() {
        return Object.freeze(Array.from(entries.entries()).sort(([left], [right]) => left.localeCompare(right)));
      },
    }),
  });
}

export function createGuardedEventTarget() {
  const emitted = [];
  return Object.freeze({
    emitted,
    dispatchEvent(event) {
      const type = String(event?.type ?? event ?? '');
      emitted.push(type);
      if (type.startsWith('topology:')) fail('E_QF_TOPOLOGY_EVENT', { type });
      if (type.startsWith('viewport:')) fail('E_QF_VIEWPORT_EVENT', { type });
      fail('E_QF_EVENT_EMITTED', { type });
    },
  });
}

export function createGuardedDom() {
  const calls = [];
  const mutation = (operation, detail = null) => {
    calls.push({ operation, detail });
    fail('E_QF_DOM_MUTATION', { operation, detail });
  };
  return Object.freeze({
    calls,
    document: Object.freeze({
      createElement(tagName) {
        mutation('createElement', String(tagName));
      },
      querySelector(selector) {
        calls.push({ operation: 'querySelector', detail: String(selector) });
        return null;
      },
      dispatchEvent(event) {
        const type = String(event?.type ?? event ?? '');
        if (type.startsWith('topology:')) fail('E_QF_TOPOLOGY_EVENT', { type });
        if (type.startsWith('viewport:')) fail('E_QF_VIEWPORT_EVENT', { type });
        fail('E_QF_EVENT_EMITTED', { type });
      },
      appendChild(node) {
        mutation('appendChild', node?.nodeName ?? null);
      },
    }),
  });
}

export function createGuardedProjectData(profile, origin) {
  const frozenProfile = deepFreezeClone(profile);
  const frozenOrigin = deepFreezeClone(origin);
  return Object.freeze({
    getProfile: () => readonlyProxy(frozenProfile, 'PROJECT_DATA'),
    getOrigin: () => readonlyProxy(frozenOrigin, 'PROJECT_DATA'),
    importProfile: () => fail('E_QF_PROJECT_DATA_API_CALL', { operation: 'importProfile' }),
    restoreApprovedProfile: () => fail('E_QF_PROJECT_DATA_API_CALL', { operation: 'restoreApprovedProfile' }),
    update: () => fail('E_QF_PROJECT_DATA_API_CALL', { operation: 'update' }),
    clear: () => fail('E_QF_PROJECT_DATA_API_CALL', { operation: 'clear' }),
    subscribe: () => fail('E_QF_PROJECT_DATA_API_CALL', { operation: 'subscribe' }),
  });
}

export function deepFreezeClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => deepFreezeClone(item)));
  const clone = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepFreezeClone(item)]));
  return Object.freeze(clone);
}

export function captureAuthorityHashes({
  domState,
  localStorage,
  sessionStorage,
  projectData,
  sharedModel,
  masterData,
  sourceFiles,
  eventLog,
}) {
  return Object.freeze({
    dom: semanticHash(domState),
    localStorage: semanticHash(localStorage),
    sessionStorage: semanticHash(sessionStorage),
    projectData: semanticHash(projectData),
    sharedModel: semanticHash(sharedModel),
    masterData: semanticHash(masterData),
    sourceFiles: semanticHash(sourceFiles),
    eventLog: semanticHash(eventLog),
  });
}

export function compareAuthorityHashes(before, after) {
  const mapping = {
    dom: 'E_QF_DOM_HASH_CHANGED',
    localStorage: 'E_QF_STORAGE_HASH_CHANGED',
    sessionStorage: 'E_QF_STORAGE_HASH_CHANGED',
    projectData: 'E_QF_PROJECT_DATA_HASH_CHANGED',
    sharedModel: 'E_QF_SHARED_MODEL_HASH_CHANGED',
    masterData: 'E_QF_MASTER_DATA_HASH_CHANGED',
    sourceFiles: 'E_QF_SOURCE_FILE_HASH_CHANGED',
    eventLog: 'E_QF_EVENT_LOG_HASH_CHANGED',
  };
  for (const [key, code] of Object.entries(mapping)) {
    if (before[key] !== after[key]) fail(code, { before: before[key], after: after[key] });
  }
  return true;
}

export function machineReadableFailure(error, stage) {
  return Object.freeze({
    status: 'FAIL',
    code: error?.code ?? 'E_QF_UNEXPECTED_ERROR',
    stage,
    message: error?.message ?? String(error),
    detail: error?.detail ?? null,
  });
}


function* proxyMapIterator(target, property, authorityCode, cache) {
  if (property === 'values') {
    for (const value of target.values()) yield readonlyProxy(value, authorityCode, cache);
    return;
  }
  for (const [key, value] of target.entries()) {
    yield [readonlyProxy(key, authorityCode, cache), readonlyProxy(value, authorityCode, cache)];
  }
}

function* proxySetIterator(target, property, authorityCode, cache) {
  if (property === 'entries') {
    for (const value of target.values()) {
      const proxied = readonlyProxy(value, authorityCode, cache);
      yield [proxied, proxied];
    }
    return;
  }
  for (const value of target.values()) yield readonlyProxy(value, authorityCode, cache);
}

function isMutatingMethod(target, property) {
  if (Array.isArray(target)) return ['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'].includes(property);
  if (target instanceof Map) return ['clear', 'delete', 'set'].includes(property);
  if (target instanceof Set) return ['add', 'clear', 'delete'].includes(property);
  if (ArrayBuffer.isView(target)) return ['copyWithin', 'fill', 'reverse', 'set', 'sort'].includes(property);
  return false;
}
