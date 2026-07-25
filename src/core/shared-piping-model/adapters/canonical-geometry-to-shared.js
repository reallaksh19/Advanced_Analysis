import { semanticHash } from '../canonical-json.js';
import { createDiagnostic, DIAGNOSTIC_SEVERITY, normalizeDiagnosticRows } from '../diagnostics.js';
import { createDirectEvidence, normalizePoint } from '../evidence.js';
import { deepFreeze, finiteNumber, isPlainRecord, stringValue } from '../immutable.js';
import { createSharedPipingModel } from '../shared-piping-model.js';
import { createSourcePackageSnapshot } from '../source-package-snapshot.js';
import { auditCanonicalGeometryCompatibility, canonicalSourceReferences } from './canonical-compatibility-audit.js';

const CANONICAL_SCHEMA = 'canonical-geometry-v1';
const SUPPORT_TYPE = 'SUPPORT';

export function buildSharedPipingModelFromCanonicalGeometry(canonical) {
  assertCanonicalGeometry(canonical);
  const datasetId = canonicalDatasetId(canonical);
  const snapshot = createSourcePackageSnapshot({
    datasetId,
    sourceSchema: CANONICAL_SCHEMA,
    sourcePackage: canonical,
  });
  const context = canonicalContext(canonical);
  const components = [];
  const supports = [];
  canonical.segments.forEach((segment, index) => addSegment(segment, index, context, components, supports));
  (canonical.components || []).forEach((item, index) => components.push(componentRecord(item, index, context)));
  (canonical.supports || []).forEach((item, index) => supports.push(supportRecord(item, index, context)));
  return createSharedPipingModel({
    project: canonicalProject(canonical, datasetId),
    units: canonicalUnits(canonical),
    sourceSnapshotRef: snapshotReference(snapshot),
    components,
    supports,
    sourceReferences: { nodes: canonicalSourceReferences(canonical) },
    diagnostics: [
      ...snapshot.diagnostics,
      ...normalizeDiagnosticRows(canonical.diagnostics, 'canonical.diagnostics'),
      ...context.diagnostics,
      ...auditCanonicalGeometryCompatibility(canonical),
    ],
  });
}

function canonicalContext(canonical) {
  const diagnostics = [];
  const nodesById = groupById(canonical.nodes, 'canonical-node', diagnostics);
  const segmentIds = duplicateIdSet(canonical.segments);
  const componentIds = duplicateIdSet(canonical.components || []);
  const supportIds = duplicateIdSet(canonical.supports || []);
  recordDuplicateIds(segmentIds, 'canonical-segment', diagnostics);
  recordDuplicateIds(componentIds, 'canonical-component', diagnostics);
  recordDuplicateIds(supportIds, 'canonical-support', diagnostics);
  return { nodesById, segmentIds, componentIds, supportIds, diagnostics };
}

function addSegment(segment, index, context, components, supports) {
  const type = normalizedType(segment?.type);
  if (type === SUPPORT_TYPE) supports.push(segmentSupportRecord(segment, index, context));
  else components.push(segmentComponentRecord(segment, index, context));
}

function segmentComponentRecord(segment, index, context) {
  const componentKey = uniqueKey(segment?.id, index, 'canonical-segment', context.segmentIds);
  const ports = segmentPorts(segment, componentKey, context);
  const diagnostics = missingPortDiagnostics(segment, componentKey, ports);
  context.diagnostics.push(...diagnostics);
  return deepFreeze({
    componentKey,
    sourceEntityId: sourceId(segment?.id),
    name: stringValue(segment?.name || segment?.id || componentKey),
    type: normalizedType(segment?.type),
    identity: identityFrom(segment),
    geometry: { start: ports[0]?.position || null, end: ports[1]?.position || null, center: null, points: [], branchPoints: [], sources: {}, sourcePath: '', ports },
    engineeringProperties: segmentEngineeringProperties(segment),
    compatibilityEvidence: segmentCompatibilityEvidence(segment),
    sourceReferences: { sourceKind: 'canonical-segment', sourceIndex: index, startNodeId: sourceId(segment?.startNodeId), endNodeId: sourceId(segment?.endNodeId) },
    diagnostics,
  });
}

function segmentSupportRecord(segment, index, context) {
  const supportKey = uniqueKey(segment?.id, index, 'canonical-support-segment', context.segmentIds);
  const startNode = resolveCanonicalNode(segment?.startNodeId, context);
  const diagnostics = [createDiagnostic(
    'CANONICAL_SUPPORT_SEGMENT_RECLASSIFIED',
    'Canonical SUPPORT segment is projected as a shared support record.',
    { severity: DIAGNOSTIC_SEVERITY.INFO, scope: supportKey },
  )];
  if (!startNode) diagnostics.push(createDiagnostic(
    'CANONICAL_SUPPORT_POSITION_MISSING',
    'Canonical support segment has no resolvable position.',
    { severity: DIAGNOSTIC_SEVERITY.WARNING, scope: supportKey },
  ));
  context.diagnostics.push(...diagnostics);
  return deepFreeze({
    supportKey,
    sourceEntityId: sourceId(segment?.id),
    name: stringValue(segment?.name || segment?.id || supportKey),
    type: SUPPORT_TYPE,
    identity: identityFrom(segment),
    position: pointFromNode(startNode),
    engineeringProperties: segmentEngineeringProperties(segment),
    compatibilityEvidence: segmentCompatibilityEvidence(segment),
    sourceReferences: { sourceKind: 'canonical-segment', sourceIndex: index, nodeId: sourceId(segment?.startNodeId) },
    diagnostics,
  });
}

function componentRecord(item, index, context) {
  const componentKey = uniqueKey(item?.id, index, 'canonical-component', context.componentIds);
  const node = resolveCanonicalNode(item?.nodeId, context);
  const position = pointFromNode(node);
  const diagnostics = position ? [] : [createDiagnostic('CANONICAL_COMPONENT_GEOMETRY_UNAVAILABLE', 'Canonical component has no resolvable point geometry.', {
    severity: DIAGNOSTIC_SEVERITY.WARNING, scope: componentKey,
  })];
  const ports = position ? [canonicalPort(componentKey, 'point', position, item?.nodeId)] : [];
  context.diagnostics.push(...diagnostics);
  return deepFreeze({
    componentKey,
    sourceEntityId: sourceId(item?.id),
    name: stringValue(item?.name || item?.id || componentKey),
    type: normalizedType(item?.type || 'COMPONENT'),
    identity: identityFrom(item),
    geometry: { start: null, end: null, center: position, points: [], branchPoints: [], sources: {}, sourcePath: '', ports },
    engineeringProperties: {}, compatibilityEvidence: {},
    sourceReferences: { sourceKind: 'canonical-component', sourceIndex: index, nodeId: sourceId(item?.nodeId), segmentId: sourceId(item?.segmentId) },
    diagnostics,
  });
}

function supportRecord(item, index, context) {
  const supportKey = uniqueKey(item?.id, index, 'canonical-support', context.supportIds);
  const node = resolveCanonicalNode(item?.nodeId, context);
  const diagnostics = node ? [] : [createDiagnostic('CANONICAL_SUPPORT_POSITION_MISSING', 'Canonical support has no resolvable node position.', {
    severity: DIAGNOSTIC_SEVERITY.WARNING, scope: supportKey,
  })];
  context.diagnostics.push(...diagnostics);
  return deepFreeze({
    supportKey,
    sourceEntityId: sourceId(item?.id),
    name: stringValue(item?.name || item?.id || supportKey),
    type: normalizedType(item?.type || SUPPORT_TYPE),
    identity: identityFrom(item),
    position: pointFromNode(node), engineeringProperties: {}, compatibilityEvidence: {},
    sourceReferences: { sourceKind: 'canonical-support', sourceIndex: index, nodeId: sourceId(item?.nodeId), segmentId: sourceId(item?.segmentId) },
    diagnostics,
  });
}

function segmentPorts(segment, componentKey, context) {
  const start = pointFromNode(resolveCanonicalNode(segment?.startNodeId, context));
  const end = pointFromNode(resolveCanonicalNode(segment?.endNodeId, context));
  return [
    start ? canonicalPort(componentKey, 'start', start, segment?.startNodeId) : null,
    end ? canonicalPort(componentKey, 'end', end, segment?.endNodeId) : null,
  ].filter(Boolean);
}

function canonicalPort(componentKey, role, position, sourceNodeId) {
  return deepFreeze({
    portKey: `${componentKey}:port:${role}`,
    role,
    position,
    sourceReference: { sourceKind: 'canonical-node', sourceNodeId: sourceId(sourceNodeId) },
  });
}

function segmentEngineeringProperties(segment) {
  const properties = {};
  addEvidence(properties, 'outerDiameterMm', segment?.diameter, 'mm', 'segment.diameter');
  addEvidence(properties, 'wallThicknessMm', segment?.thickness, 'mm', 'segment.thickness');
  if (stringValue(segment?.material)) properties.materialName = createDirectEvidence(stringValue(segment.material), '', 'segment.material');
  return properties;
}

function segmentCompatibilityEvidence(segment) {
  const properties = {};
  addEvidence(properties, 'sourceLengthMm', segment?.length, 'mm', 'segment.length');
  return properties;
}

function addEvidence(target, field, value, unit, sourcePath) {
  const numeric = finiteNumber(value);
  if (numeric !== null) target[field] = createDirectEvidence(numeric, unit, sourcePath, 'canonical');
}

function missingPortDiagnostics(segment, componentKey, ports) {
  if (ports.length === 2) return [];
  return [createDiagnostic('CANONICAL_SEGMENT_ENDPOINT_UNRESOLVED', 'Canonical segment endpoint references could not be fully resolved.', {
    severity: DIAGNOSTIC_SEVERITY.ERROR, scope: componentKey,
    startNodeId: sourceId(segment?.startNodeId), endNodeId: sourceId(segment?.endNodeId),
  })];
}

function groupById(rows, scope, diagnostics) {
  const groups = {};
  rows.forEach((row, index) => {
    const id = sourceId(row?.id);
    if (!id) diagnostics.push(identityDiagnostic('CANONICAL_ID_MISSING', `${scope}:${index}`));
    (groups[id || ''] ||= []).push(row);
  });
  Object.entries(groups).filter(([id, values]) => id && values.length > 1).forEach(([id, values]) => {
    diagnostics.push(identityDiagnostic('CANONICAL_ID_DUPLICATE', `${scope}:${id}`, { sourceEntityId: id, count: values.length }));
  });
  return groups;
}

function resolveCanonicalNode(nodeId, context) {
  const rows = context.nodesById[sourceId(nodeId) || ''] || [];
  return rows.length === 1 ? rows[0] : null;
}

function recordDuplicateIds(duplicates, scope, diagnostics) {
  [...duplicates].sort().forEach((id) => diagnostics.push(identityDiagnostic(
    'CANONICAL_ID_DUPLICATE',
    `${scope}:${id}`,
    { sourceEntityId: id },
  )));
}

function duplicateIdSet(rows) {
  const counts = {};
  rows.forEach((row) => { const id = sourceId(row?.id); if (id) counts[id] = (counts[id] || 0) + 1; });
  return new Set(Object.entries(counts).filter(([, count]) => count > 1).map(([id]) => id));
}

function uniqueKey(value, index, prefix, duplicates) {
  const id = sourceId(value);
  return id && !duplicates.has(id) ? id : `${prefix}:${index}`;
}

function canonicalDatasetId(canonical) {
  const explicit = stringValue(canonical.project?.id || canonical.sourceMetadata?.datasetId);
  return explicit || `canonical-${semanticHash(canonical).split(':')[1]}`;
}

function canonicalProject(canonical, datasetId) {
  return { datasetId, name: stringValue(canonical.project?.name || datasetId), sourceName: stringValue(canonical.source) };
}

function canonicalUnits(canonical) {
  return { length: stringValue(canonical.unit || 'unknown'), force: 'unknown', mass: 'unknown' };
}

function snapshotReference(snapshot) {
  const { schema, datasetId, sourceSchema, sourceSemanticHash, sourceByteHash } = snapshot;
  return { schema, datasetId, sourceSchema, sourceSemanticHash, sourceByteHash };
}

function identityFrom(value) {
  return deepFreeze({ lineId: stringValue(value?.lineId || value?.meta?.lineId), branchId: stringValue(value?.branchId || value?.meta?.branchId), systemId: stringValue(value?.systemId || value?.meta?.systemId), zoneId: stringValue(value?.zoneId || value?.meta?.zoneId) });
}

function pointFromNode(node) {
  return node ? normalizePoint(node) : null;
}

function sourceId(value) {
  return stringValue(value) || null;
}

function normalizedType(value) {
  return stringValue(value).toUpperCase() || 'UNKNOWN';
}

function identityDiagnostic(code, scope, details = {}) {
  return createDiagnostic(code, 'Canonical source identity is missing or duplicated.', { severity: DIAGNOSTIC_SEVERITY.WARNING, scope, ...details });
}

function assertCanonicalGeometry(canonical) {
  if (!isPlainRecord(canonical) || canonical.schemaVersion !== CANONICAL_SCHEMA) {
    throw new TypeError(`Canonical adapter requires ${CANONICAL_SCHEMA}.`);
  }
  if (!Array.isArray(canonical.nodes) || !Array.isArray(canonical.segments)) {
    throw new TypeError('Canonical geometry requires nodes and segments arrays.');
  }
}
