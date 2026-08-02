import { canonicalStringify, canonicalizeJson } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';

export const EXACT_SELECTOR_SCHEMA = 'EngineeringExactSelector.v1';
export const EXACT_SELECTOR_KINDS = Object.freeze([
  'CATALOG_KEY',
  'COMPONENT_TYPE_BORE',
  'ENTITY',
  'PIPING_CLASS_BORE',
  'SUPPORT_KIND',
]);

const PART_KEYS = Object.freeze({
  CATALOG_KEY: Object.freeze(['catalogKey']),
  COMPONENT_TYPE_BORE: Object.freeze(['boreMm', 'componentType']),
  ENTITY: Object.freeze(['entityId']),
  PIPING_CLASS_BORE: Object.freeze(['boreMm', 'pipingClass']),
  SUPPORT_KIND: Object.freeze(['supportKind']),
});

export function buildExactSelector(kind, parts) {
  const selectorKind = requireSelectorKind(kind);
  const requiredKeys = PART_KEYS[selectorKind];
  assertExactKeys(parts, requiredKeys, `${selectorKind} selector parts`);
  const normalizedParts = {};
  requiredKeys.forEach((key) => {
    normalizedParts[key] = normalizePart(parts[key], `${selectorKind}.${key}`);
  });
  const canonicalParts = canonicalizeJson(normalizedParts);
  return deepFreeze({
    schema: EXACT_SELECTOR_SCHEMA,
    kind: selectorKind,
    parts: canonicalParts,
    key: canonicalStringify(canonicalParts),
  });
}

export function assertExactSelector(value) {
  assertExactKeys(value, ['schema', 'kind', 'parts', 'key'], 'Exact selector');
  if (value.schema !== EXACT_SELECTOR_SCHEMA) fail(`schema must be ${EXACT_SELECTOR_SCHEMA}.`);
  const rebuilt = buildExactSelector(value.kind, value.parts);
  if (rebuilt.key !== value.key) fail('key does not match canonical parts.', RangeError);
  return value;
}

export function exactSelectorIdentity(value) {
  const selector = assertExactSelector(value);
  return `${selector.kind}:${selector.key}`;
}

function requireSelectorKind(value) {
  const kind = String(value ?? '');
  if (!EXACT_SELECTOR_KINDS.includes(kind)) fail(`unsupported selector kind: ${kind || '<empty>'}.`, RangeError);
  return kind;
}

function normalizePart(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${label} must be finite.`, RangeError);
    return Object.is(value, -0) ? 0 : value;
  }
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function compareAscii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) { throw new Constructor(`EngineeringSelector: ${message}`); }
