import { createDiagnostic, DIAGNOSTIC_SEVERITY, sortDiagnostics } from './diagnostics.js';
import { deepFreeze, finiteNumber, isPlainRecord, stringValue } from './immutable.js';

export function collectSupportEvidence(specs, roots, scope) {
  const values = {};
  const diagnostics = [];
  Object.entries(specs).forEach(([field, spec]) => {
    const found = findAllByAliases(roots, spec.aliases);
    const normalized = normalizeFound(found, spec, field, scope, diagnostics);
    if (normalized.length) values[field] = normalized;
    const distinct = new Set(normalized.map((row) => canonicalValue(row.value)));
    if (distinct.size > 1) diagnostics.push(conflictDiagnostic(field, scope, normalized));
  });
  return deepFreeze({ values, diagnostics: sortDiagnostics(diagnostics) });
}

function findAllByAliases(roots, aliases) {
  const found = [];
  aliases.forEach((alias) => {
    const wanted = normalizeKey(alias);
    roots.forEach(([rootPath, root]) => findKeys(root, wanted, rootPath, 0, found));
  });
  const unique = new Map(found.map((row) => [`${row.sourcePath}|${canonicalValue(row.value)}`, row]));
  return [...unique.values()].sort(foundOrder);
}

function findKeys(value, wanted, path, depth, found) {
  if (!isPlainRecord(value) || depth > 5) return;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  entries.forEach(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (normalizeKey(key) === wanted) {
      flattenValue(child).forEach((item) => found.push({
        value: item,
        sourcePath: childPath,
        sourceKind: rootKind(path),
      }));
    }
  });
  entries.forEach(([key, child]) => findKeys(child, wanted, `${path}.${key}`, depth + 1, found));
}

function normalizeFound(found, spec, field, scope, diagnostics) {
  return found.flatMap((row) => {
    const normalized = normalizeValue(row.value, spec.kind);
    if (!normalized.valid) {
      diagnostics.push(invalidDiagnostic(field, scope, row));
      return [];
    }
    return [deepFreeze({
      value: normalized.value,
      unit: stringValue(spec.unit),
      sourceKind: row.sourceKind,
      sourcePath: row.sourcePath,
    })];
  });
}

function normalizeValue(value, kind) {
  if (kind === 'number') {
    const numeric = finiteNumber(value);
    return { valid: numeric !== null, value: numeric };
  }
  const text = stringValue(value);
  return { valid: Boolean(text), value: text };
}

function flattenValue(value) {
  return Array.isArray(value) ? value : [value];
}

function conflictDiagnostic(field, scope, rows) {
  return createDiagnostic(
    'SUPPORT_EVIDENCE_CONFLICT',
    `${field} contains conflicting explicit source values.`,
    {
      severity: DIAGNOSTIC_SEVERITY.WARNING,
      scope,
      field,
      sourcePaths: rows.map((row) => row.sourcePath),
      values: rows.map((row) => row.value),
    },
  );
}

function invalidDiagnostic(field, scope, row) {
  return createDiagnostic(
    'SUPPORT_EVIDENCE_INVALID',
    `${field} could not be normalized without inventing a value.`,
    {
      severity: DIAGNOSTIC_SEVERITY.WARNING,
      scope,
      field,
      sourcePath: row.sourcePath,
    },
  );
}

function rootKind(path) {
  return path.split('.')[0] || 'source';
}

function canonicalValue(value) {
  return typeof value === 'number' ? String(value) : stringValue(value).toUpperCase();
}

function normalizeKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function foundOrder(left, right) {
  return `${left.sourceKind}|${left.sourcePath}|${canonicalValue(left.value)}`
    .localeCompare(`${right.sourceKind}|${right.sourcePath}|${canonicalValue(right.value)}`);
}
