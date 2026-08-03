import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEvidence } from '../src/core/shared-piping-model/evidence.js';
import { createEvidenceIndex } from '../src/core/shared-piping-model/evidence-index.js';
import { collectSupportEvidence } from '../src/core/shared-piping-model/support-evidence.js';
import { createDiagnostic, DIAGNOSTIC_SEVERITY, sortDiagnostics } from '../src/core/shared-piping-model/diagnostics.js';
import { deepFreeze, finiteNumber, isPlainRecord, stringValue } from '../src/core/shared-piping-model/immutable.js';

const roots = [
  ['sourceAttributes', {
    primary: 'root-a-primary',
    collision: 'root-a-top',
    alpha: { collision: 'root-a-nested' },
    invalidNumber: 'not-a-number',
    supportGap: [1, '1', 2, 'bad'],
    group: { support_gap: 2 },
    d1: { d2: { d3: { d4: { d5: { depthFive: '5', d6: { depthSix: '6' } } } } } },
  }],
  ['attributes', {
    secondary: 'root-b-secondary',
    primary: 'root-b-primary',
    support_gap: [2, 3],
  }],
];

const evidenceSpecs = {
  aliasPriority: { aliases: ['secondary', 'primary'], kind: 'text', unit: '' },
  collision: { aliases: ['collision'], kind: 'text', unit: '' },
  depthFive: { aliases: ['depth-five'], kind: 'number', unit: 'mm' },
  depthSix: { aliases: ['depth-six'], kind: 'number', unit: 'mm' },
  invalidNumber: { aliases: ['invalid-number'], kind: 'number', unit: 'mm' },
};

const supportSpecs = {
  gap: { aliases: ['support gap', 'support_gap'], kind: 'number', unit: 'mm' },
};

test('indexed single-value evidence is exactly legacy-equivalent', () => {
  const expected = legacyCollectEvidence(evidenceSpecs, roots, 'entity:1');
  const actual = collectEvidence(evidenceSpecs, roots, 'entity:1');
  assert.deepEqual(actual, expected);
  assert.equal(actual.values.aliasPriority.value, 'root-b-secondary');
  assert.equal(actual.values.collision.value, 'root-a-top');
  assert.equal(actual.values.depthFive.value, 5);
  assert.equal(Object.hasOwn(actual.values, 'depthSix'), false);
  assert.equal(actual.diagnostics[0].code, 'ENGINEERING_PROPERTY_INVALID');
  assert.equal(Object.isFrozen(actual), true);
  assert.equal(Object.isFrozen(roots[0][1]), false, 'indexing must not freeze or mutate source roots');
});

test('indexed support evidence preserves flattening, dedupe, found order, invalids, and conflicts', () => {
  const expected = legacyCollectSupportEvidence(supportSpecs, roots, 'support:1');
  const actual = collectSupportEvidence(supportSpecs, roots, 'support:1');
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual.values.gap.map((row) => row.value), [2, 3, 2, 1, 2]);
  assert.deepEqual(actual.diagnostics.map((row) => row.code), [
    'SUPPORT_EVIDENCE_CONFLICT',
    'SUPPORT_EVIDENCE_INVALID',
  ]);
  assert.equal(Object.isFrozen(actual.values.gap), true);
});

test('one evidence index can be reused without rereading source keys', () => {
  let reads = 0;
  const source = {};
  Object.defineProperty(source, 'Diameter', {
    enumerable: true,
    get() { reads += 1; return 100; },
  });
  const indexedRoots = [['sourceAttributes', source]];
  const index = createEvidenceIndex(indexedRoots);
  assert.equal(reads, 1);
  const spec = { diameter: { aliases: ['diameter'], kind: 'number', unit: 'mm' } };
  assert.equal(collectEvidence(spec, indexedRoots, 'entity:2', index).values.diameter.value, 100);
  assert.equal(collectSupportEvidence(spec, indexedRoots, 'entity:2', index).values.diameter[0].value, 100);
  assert.equal(collectEvidence(spec, indexedRoots, 'entity:2', index).values.diameter.value, 100);
  assert.equal(reads, 1);
});

function legacyCollectEvidence(specs, sourceRoots, scope) {
  const values = {};
  const diagnostics = [];
  Object.entries(specs).forEach(([field, spec]) => {
    const found = legacyFindByAliases(sourceRoots, spec.aliases);
    if (!found) return;
    const normalized = normalizeValue(found.value, spec.kind);
    if (normalized.valid) values[field] = deepFreeze({
      value: normalized.value,
      unit: spec.unit,
      sourceKind: found.sourceKind,
      sourcePath: found.sourcePath,
    });
    else diagnostics.push(createDiagnostic(
      'ENGINEERING_PROPERTY_INVALID',
      `${field} could not be normalized without inventing a value.`,
      { severity: DIAGNOSTIC_SEVERITY.WARNING, scope, field, sourcePath: found.sourcePath },
    ));
  });
  return deepFreeze({ values, diagnostics: sortDiagnostics(diagnostics) });
}

function legacyFindByAliases(sourceRoots, aliases) {
  for (const alias of aliases) {
    const wanted = normalizeKey(alias);
    for (const [rootPath, root] of sourceRoots) {
      const found = legacyFindKey(root, wanted, rootPath, 0);
      if (found) return found;
    }
  }
  return null;
}

function legacyFindKey(value, wanted, path, depth) {
  if (!isPlainRecord(value) || depth > 5) return null;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  for (const [key, child] of entries) {
    if (normalizeKey(key) === wanted) return {
      value: child,
      sourcePath: `${path}.${key}`,
      sourceKind: path.split('.')[0].replace(/^properties\./, '') || 'source',
    };
  }
  for (const [key, child] of entries) {
    const found = legacyFindKey(child, wanted, `${path}.${key}`, depth + 1);
    if (found) return found;
  }
  return null;
}

function legacyCollectSupportEvidence(specs, sourceRoots, scope) {
  const values = {};
  const diagnostics = [];
  Object.entries(specs).forEach(([field, spec]) => {
    const found = legacyFindAllByAliases(sourceRoots, spec.aliases);
    const normalized = found.flatMap((row) => {
      const result = normalizeValue(row.value, spec.kind);
      if (!result.valid) {
        diagnostics.push(createDiagnostic(
          'SUPPORT_EVIDENCE_INVALID',
          `${field} could not be normalized without inventing a value.`,
          { severity: DIAGNOSTIC_SEVERITY.WARNING, scope, field, sourcePath: row.sourcePath },
        ));
        return [];
      }
      return [deepFreeze({ value: result.value, unit: spec.unit, sourceKind: row.sourceKind, sourcePath: row.sourcePath })];
    });
    if (normalized.length) values[field] = normalized;
    const distinct = new Set(normalized.map((row) => canonicalValue(row.value)));
    if (distinct.size > 1) diagnostics.push(createDiagnostic(
      'SUPPORT_EVIDENCE_CONFLICT',
      `${field} contains conflicting explicit source values.`,
      {
        severity: DIAGNOSTIC_SEVERITY.WARNING,
        scope,
        field,
        sourcePaths: normalized.map((row) => row.sourcePath),
        values: normalized.map((row) => row.value),
      },
    ));
  });
  return deepFreeze({ values, diagnostics: sortDiagnostics(diagnostics) });
}

function legacyFindAllByAliases(sourceRoots, aliases) {
  const found = [];
  aliases.forEach((alias) => {
    const wanted = normalizeKey(alias);
    sourceRoots.forEach(([rootPath, root]) => legacyFindKeys(root, wanted, rootPath, 0, found));
  });
  const unique = new Map(found.map((row) => [`${row.sourcePath}|${canonicalValue(row.value)}`, row]));
  return [...unique.values()].sort(foundOrder);
}

function legacyFindKeys(value, wanted, path, depth, found) {
  if (!isPlainRecord(value) || depth > 5) return;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  entries.forEach(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (normalizeKey(key) === wanted) {
      (Array.isArray(child) ? child : [child]).forEach((item) => found.push({
        value: item,
        sourcePath: childPath,
        sourceKind: path.split('.')[0] || 'source',
      }));
    }
  });
  entries.forEach(([key, child]) => legacyFindKeys(child, wanted, `${path}.${key}`, depth + 1, found));
}

function normalizeValue(value, kind) {
  if (kind === 'number') {
    const numeric = finiteNumber(value);
    return { valid: numeric !== null, value: numeric };
  }
  const text = stringValue(value);
  return { valid: Boolean(text), value: text };
}
function normalizeKey(value) { return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase(); }
function canonicalValue(value) { return typeof value === 'number' ? String(value) : stringValue(value).toUpperCase(); }
function foundOrder(left, right) {
  return `${left.sourceKind}|${left.sourcePath}|${canonicalValue(left.value)}`
    .localeCompare(`${right.sourceKind}|${right.sourcePath}|${canonicalValue(right.value)}`);
}
