import { createDiagnostic, DIAGNOSTIC_SEVERITY, sortDiagnostics } from './diagnostics.js';
import { deepFreeze, finiteNumber, isPlainRecord, stringValue } from './immutable.js';

export function collectEvidence(specs, roots, scope) {
  const values = {};
  const diagnostics = [];
  Object.entries(specs).forEach(([field, spec]) => {
    const found = findByAliases(roots, spec.aliases);
    if (!found) return;
    const normalized = normalizeEvidenceValue(found.value, spec.kind);
    if (normalized.valid) values[field] = valueEvidence(normalized.value, spec.unit, found);
    else diagnostics.push(invalidValueDiagnostic(field, found, scope));
  });
  return deepFreeze({ values, diagnostics: sortDiagnostics(diagnostics) });
}

export function createDirectEvidence(value, unit, sourcePath, sourceKind = 'source') {
  if (value === undefined || value === null || value === '') return null;
  return deepFreeze({ value, unit: stringValue(unit), sourceKind, sourcePath: stringValue(sourcePath) });
}

export function normalizePoint(value) {
  if (Array.isArray(value)) return pointFromValues(value[0], value[1], value[2]);
  if (isPlainRecord(value)) return pointFromValues(value.x ?? value.X, value.y ?? value.Y, value.z ?? value.Z);
  if (typeof value === 'string') {
    const parts = value.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    return parts.length >= 3 ? pointFromValues(parts[0], parts[1], parts[2]) : null;
  }
  return null;
}

export function normalizeGeometryEvidence(geometry, sourcePath = '') {
  const start = normalizePoint(geometry?.start);
  const end = normalizePoint(geometry?.end);
  const center = normalizePoint(geometry?.center);
  const points = normalizePointList(geometry?.points);
  const branchPoints = normalizePointList(geometry?.branchPoints);
  return deepFreeze({
    start, end, center, points, branchPoints,
    sourcePath: stringValue(sourcePath),
    sources: isPlainRecord(geometry?.sources) ? { ...geometry.sources } : {},
  });
}

export function evidenceValue(evidence) {
  return evidence && Object.prototype.hasOwnProperty.call(evidence, 'value') ? evidence.value : null;
}

function findByAliases(roots, aliases) {
  for (const alias of aliases) {
    const wanted = normalizeKey(alias);
    for (const [rootPath, root] of roots) {
      const found = findKey(root, wanted, rootPath, 0);
      if (found) return found;
    }
  }
  return null;
}

function findKey(value, wanted, path, depth) {
  if (!isPlainRecord(value) || depth > 5) return null;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  for (const [key, child] of entries) {
    if (normalizeKey(key) === wanted) return { value: child, sourcePath: `${path}.${key}`, sourceKind: rootKind(path) };
  }
  for (const [key, child] of entries) {
    const found = findKey(child, wanted, `${path}.${key}`, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeEvidenceValue(value, kind) {
  if (kind === 'number') {
    const numeric = finiteNumber(value);
    return { valid: numeric !== null, value: numeric };
  }
  const text = stringValue(value);
  return { valid: Boolean(text), value: text };
}

function valueEvidence(value, unit, found) {
  return deepFreeze({ value, unit, sourceKind: found.sourceKind, sourcePath: found.sourcePath });
}

function invalidValueDiagnostic(field, found, scope) {
  return createDiagnostic('ENGINEERING_PROPERTY_INVALID', `${field} could not be normalized without inventing a value.`, {
    severity: DIAGNOSTIC_SEVERITY.WARNING,
    scope,
    field,
    sourcePath: found.sourcePath,
  });
}

function normalizePointList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizePoint).filter(Boolean);
}

function pointFromValues(xValue, yValue, zValue) {
  const x = finiteNumber(xValue), y = finiteNumber(yValue), z = finiteNumber(zValue);
  return x === null || y === null || z === null ? null : deepFreeze({ x, y, z });
}

function rootKind(path) {
  return path.split('.')[0].replace(/^properties\./, '') || 'source';
}

function normalizeKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}
