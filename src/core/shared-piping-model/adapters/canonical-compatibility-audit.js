import { createDiagnostic, DIAGNOSTIC_SEVERITY } from '../diagnostics.js';
import { isPlainRecord, stringValue } from '../immutable.js';

const ROOT_FIELDS = new Set([
  'schemaVersion', 'unit', 'project', 'nodes', 'segments', 'components', 'supports',
  'loads', 'materials', 'diagnostics', 'sourceMetadata', 'source', 'summary',
]);
const NODE_FIELDS = new Set(['id', 'name', 'x', 'y', 'z']);
const SEGMENT_FIELDS = new Set([
  'id', 'name', 'startNodeId', 'endNodeId', 'type', 'length', 'diameter',
  'thickness', 'material', 'lineId', 'branchId', 'systemId', 'zoneId', 'meta',
]);
const ITEM_FIELDS = new Set([
  'id', 'name', 'type', 'nodeId', 'segmentId', 'lineId', 'branchId',
  'systemId', 'zoneId', 'meta',
]);
const IDENTITY_META_FIELDS = new Set(['lineId', 'branchId', 'systemId', 'zoneId']);

export function auditCanonicalGeometryCompatibility(canonical) {
  const diagnostics = [];
  addUnknownUnit(canonical, diagnostics);
  addExcludedFamilies(canonical, diagnostics);
  addUnsupportedKeys(canonical, ROOT_FIELDS, 'canonical', diagnostics);
  auditRows(canonical.nodes, NODE_FIELDS, 'nodes', diagnostics);
  auditRows(canonical.segments, SEGMENT_FIELDS, 'segments', diagnostics);
  auditRows(canonical.components || [], ITEM_FIELDS, 'components', diagnostics);
  auditRows(canonical.supports || [], ITEM_FIELDS, 'supports', diagnostics);
  auditProject(canonical.project, diagnostics);
  auditSourceMetadata(canonical.sourceMetadata, diagnostics);
  return diagnostics;
}

export function canonicalSourceReferences(canonical) {
  return [
    ...referenceRows(canonical.nodes, 'node'),
    ...referenceRows(canonical.segments, 'segment'),
    ...referenceRows(canonical.components || [], 'component'),
    ...referenceRows(canonical.supports || [], 'support'),
  ];
}

function auditRows(rows, allowed, family, diagnostics) {
  rows.forEach((row, index) => {
    addUnsupportedKeys(row, allowed, `canonical.${family}[${index}]`, diagnostics);
    auditMeta(row?.meta, `canonical.${family}[${index}].meta`, diagnostics);
  });
}

function addUnsupportedKeys(value, allowed, scope, diagnostics) {
  if (!isPlainRecord(value)) return;
  Object.keys(value).sort().filter((key) => !allowed.has(key)).forEach((field) => {
    diagnostics.push(lossDiagnostic('CANONICAL_FIELD_UNSUPPORTED', scope, field));
  });
}

function auditMeta(value, scope, diagnostics) {
  if (!isPlainRecord(value)) return;
  addUnsupportedKeys(value, IDENTITY_META_FIELDS, scope, diagnostics);
}

function auditProject(value, diagnostics) {
  if (!isPlainRecord(value)) return;
  addUnsupportedKeys(value, new Set(['id', 'name']), 'canonical.project', diagnostics);
}

function auditSourceMetadata(value, diagnostics) {
  if (!isPlainRecord(value)) return;
  addUnsupportedKeys(value, new Set(['datasetId']), 'canonical.sourceMetadata', diagnostics);
}

function addUnknownUnit(canonical, diagnostics) {
  if (stringValue(canonical.unit)) return;
  diagnostics.push(createDiagnostic(
    'CANONICAL_UNIT_MISSING',
    'Canonical length unit is missing; the shared model retains unknown without inventing a unit.',
    { severity: DIAGNOSTIC_SEVERITY.ERROR, scope: 'canonical.unit' },
  ));
}

function addExcludedFamilies(canonical, diagnostics) {
  if ((canonical.loads || []).length) diagnostics.push(excludedDiagnostic('loads'));
  if ((canonical.materials || []).length) diagnostics.push(excludedDiagnostic('materials'));
}

function excludedDiagnostic(field) {
  return createDiagnostic(
    `CANONICAL_${field.toUpperCase()}_EXCLUDED`,
    `Canonical ${field} remain in source evidence but are outside shared-piping-model/v1.`,
    { severity: DIAGNOSTIC_SEVERITY.WARNING, scope: `canonical.${field}` },
  );
}

function lossDiagnostic(code, scope, field) {
  return createDiagnostic(
    code,
    `Canonical field ${field} is source-preserved but not projected into shared-piping-model/v1.`,
    { severity: DIAGNOSTIC_SEVERITY.WARNING, scope: `${scope}.${field}`, field },
  );
}

function referenceRows(rows, family) {
  return rows.map((row, index) => ({
    sourceNodeKey: `canonical:${family}:${index}`,
    sourceEntityId: stringValue(row?.id) || null,
    jsonPointer: `/${family === 'component' ? 'components' : `${family}s`}/${index}`,
    parentSourceNodeKey: '', childSourceNodeKeys: [], childIndex: index, depth: 0,
    type: family.toUpperCase(), name: stringValue(row?.name || row?.id),
    sourcePath: '', lineId: identity(row, 'lineId'), branchId: identity(row, 'branchId'),
    systemId: identity(row, 'systemId'), zoneId: identity(row, 'zoneId'),
  }));
}

function identity(row, field) {
  return stringValue(row?.[field] || row?.meta?.[field]);
}
