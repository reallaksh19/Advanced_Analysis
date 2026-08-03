import { createDiagnostic, DIAGNOSTIC_SEVERITY, sortDiagnostics } from './diagnostics.js';
import { createEvidenceIndex, findAllIndexedEvidence } from './evidence-index.js';
import { deepFreeze, finiteNumber, stringValue } from './immutable.js';

export function collectSupportEvidence(specs, roots, scope, evidenceIndex) {
  const index = evidenceIndex || createEvidenceIndex(roots);
  const values = {};
  const diagnostics = [];
  Object.entries(specs).forEach(([field, spec]) => {
    const found = findAllByAliases(index, spec.aliases);
    const normalized = normalizeFound(found, spec, field, scope, diagnostics);
    if (normalized.length) values[field] = normalized;
    const distinct = new Set(normalized.map((row) => canonicalValue(row.value)));
    if (distinct.size > 1) diagnostics.push(conflictDiagnostic(field, scope, normalized));
  });
  return deepFreeze({ values, diagnostics: sortDiagnostics(diagnostics) });
}

function findAllByAliases(index, aliases) {
  const found = findAllIndexedEvidence(index, aliases).flatMap((row) => (
    flattenValue(row.value).map((value) => ({
      value,
      sourcePath: row.sourcePath,
      sourceKind: rootKind(row.rootPath),
    }))
  ));
  const unique = new Map(found.map((row) => [`${row.sourcePath}|${canonicalValue(row.value)}`, row]));
  return [...unique.values()].sort(foundOrder);
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

function foundOrder(left, right) {
  return `${left.sourceKind}|${left.sourcePath}|${canonicalValue(left.value)}`
    .localeCompare(`${right.sourceKind}|${right.sourcePath}|${canonicalValue(right.value)}`);
}
