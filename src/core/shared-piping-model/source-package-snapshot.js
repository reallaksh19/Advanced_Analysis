import { hashBytes, semanticHash } from './canonical-json.js';
import { createDiagnostic, DIAGNOSTIC_SEVERITY, sortDiagnostics } from './diagnostics.js';
import { cloneJsonValue, deepFreeze, isPlainRecord, stringValue } from './immutable.js';

export const SOURCE_PACKAGE_SNAPSHOT_SCHEMA = 'source-package-snapshot/v1';

export function createSourcePackageSnapshot(input) {
  assertSnapshotInput(input);
  const sourcePackage = cloneJsonValue(input.sourcePackage);
  const diagnostics = byteDiagnostics(input.sourceBytes);
  return deepFreeze({
    schema: SOURCE_PACKAGE_SNAPSHOT_SCHEMA,
    datasetId: stringValue(input.datasetId),
    sourceSchema: stringValue(input.sourceSchema),
    sourceSemanticHash: semanticHash(sourcePackage),
    sourceByteHash: input.sourceBytes == null ? null : hashBytes(normalizeBytes(input.sourceBytes)),
    sourcePackage,
    diagnostics: sortDiagnostics(diagnostics),
  });
}

export function validateSourcePackageSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || snapshot.schema !== SOURCE_PACKAGE_SNAPSHOT_SCHEMA) errors.push('Invalid source snapshot schema.');
  if (!stringValue(snapshot?.datasetId)) errors.push('Source snapshot datasetId is required.');
  if (!stringValue(snapshot?.sourceSchema)) errors.push('Source snapshot sourceSchema is required.');
  if (!isPlainRecord(snapshot?.sourcePackage)) errors.push('Source snapshot sourcePackage must be an object.');
  if (snapshot?.sourcePackage && semanticHash(snapshot.sourcePackage) !== snapshot.sourceSemanticHash) {
    errors.push('Source snapshot semantic hash mismatch.');
  }
  if (snapshot?.sourceByteHash === null && !hasBytesUnavailableDiagnostic(snapshot)) {
    errors.push('Missing source-byte diagnostic.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function assertSnapshotInput(input) {
  if (!input || !isPlainRecord(input.sourcePackage)) {
    throw new TypeError('SourcePackageSnapshot requires a parsed sourcePackage object.');
  }
  if (!stringValue(input.datasetId)) throw new TypeError('SourcePackageSnapshot datasetId is required.');
  if (!stringValue(input.sourceSchema)) throw new TypeError('SourcePackageSnapshot sourceSchema is required.');
}

function byteDiagnostics(sourceBytes) {
  if (sourceBytes != null) return [];
  return [createDiagnostic(
    'SOURCE_BYTES_UNAVAILABLE',
    'Original upload bytes were not available; sourceByteHash is null and no byte-equality claim is made.',
    { severity: DIAGNOSTIC_SEVERITY.INFO, scope: 'sourcePackage' },
  )];
}

function normalizeBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  throw new TypeError('sourceBytes must be a string, ArrayBuffer, or Uint8Array.');
}

function hasBytesUnavailableDiagnostic(snapshot) {
  return Array.isArray(snapshot?.diagnostics)
    && snapshot.diagnostics.some((row) => row.code === 'SOURCE_BYTES_UNAVAILABLE');
}
