import { semanticHash } from './canonical-json.js';
import { sortDiagnostics } from './diagnostics.js';
import { deepFreeze, isPlainRecord, stringValue } from './immutable.js';

export const SHARED_PIPING_MODEL_SCHEMA = 'shared-piping-model/v1';

export function createSharedPipingModel(input) {
  assertCreateInput(input);
  const components = sortedRecords(input.components, 'componentKey');
  const supports = sortedRecords(input.supports, 'supportKey');
  const diagnostics = sortDiagnostics(input.diagnostics || []);
  const base = {
    schema: SHARED_PIPING_MODEL_SCHEMA,
    project: normalizeProject(input.project),
    units: normalizeUnits(input.units),
    sourceSnapshotRef: normalizeSnapshotRef(input.sourceSnapshotRef),
    components,
    unconnectedPorts: collectUnconnectedPorts(components),
    supports,
    sourceReferences: normalizeSourceReferences(input.sourceReferences),
    diagnostics,
    summary: buildSummary(components, supports, diagnostics),
    indexes: buildIndexes(components, supports),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSharedPipingModel(model) {
  const errors = [];
  if (!model || model.schema !== SHARED_PIPING_MODEL_SCHEMA) errors.push('Invalid shared piping model schema.');
  validateArray(model?.components, 'components', 'componentKey', errors);
  validateArray(model?.supports, 'supports', 'supportKey', errors);
  validatePorts(model, errors);
  validateProject(model?.project, errors);
  validateUnits(model?.units, errors);
  validateSnapshotRef(model?.sourceSnapshotRef, errors);
  validateReferences(model?.sourceReferences, errors);
  if (!Array.isArray(model?.diagnostics)) errors.push('Shared model diagnostics must be an array.');
  if (!isPlainRecord(model?.summary)) errors.push('Shared model summary is required.');
  if (!isPlainRecord(model?.indexes)) errors.push('Shared model indexes are required.');
  if (model && model.semanticHash !== semanticHash(withoutHash(model))) errors.push('Shared model semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function sharedModelHashPayload(model) {
  return withoutHash(model);
}

function assertCreateInput(input) {
  if (!input || !Array.isArray(input.components) || !Array.isArray(input.supports)) {
    throw new TypeError('SharedPipingModel requires component and support arrays.');
  }
  if (!isPlainRecord(input.project) || !isPlainRecord(input.units)) {
    throw new TypeError('SharedPipingModel requires project and units records.');
  }
}

function normalizeProject(project) {
  return {
    datasetId: requiredString(project.datasetId, 'project.datasetId'),
    name: stringValue(project.name || project.datasetId),
    sourceName: stringValue(project.sourceName),
  };
}

function normalizeUnits(units) {
  return {
    length: stringValue(units.length || 'unknown'),
    force: stringValue(units.force || 'unknown'),
    mass: stringValue(units.mass || 'unknown'),
  };
}

function normalizeSnapshotRef(value) {
  if (!isPlainRecord(value)) throw new TypeError('SharedPipingModel sourceSnapshotRef is required.');
  return {
    schema: requiredString(value.schema, 'sourceSnapshotRef.schema'),
    datasetId: requiredString(value.datasetId, 'sourceSnapshotRef.datasetId'),
    sourceSchema: requiredString(value.sourceSchema, 'sourceSnapshotRef.sourceSchema'),
    sourceSemanticHash: requiredString(value.sourceSemanticHash, 'sourceSnapshotRef.sourceSemanticHash'),
    sourceByteHash: value.sourceByteHash ?? null,
  };
}

function normalizeSourceReferences(value) {
  const nodes = Array.isArray(value?.nodes) ? value.nodes : [];
  return { nodes: sortedRecords(nodes, 'sourceNodeKey') };
}

function collectUnconnectedPorts(components) {
  return components.flatMap((component) => (component.geometry?.ports || []).map((port) => ({
    portKey: port.portKey,
    componentKey: component.componentKey,
    role: port.role,
    position: port.position,
    sourceReference: port.sourceReference || null,
  }))).sort((left, right) => left.portKey.localeCompare(right.portKey));
}

function buildSummary(components, supports, diagnostics) {
  return {
    componentCount: components.length,
    supportCount: supports.length,
    unconnectedPortCount: components.reduce((total, item) => total + (item.geometry?.ports?.length || 0), 0),
    diagnosticCount: diagnostics.length,
    errorCount: diagnostics.filter((row) => row.severity === 'ERROR').length,
    warningCount: diagnostics.filter((row) => row.severity === 'WARNING').length,
  };
}

function buildIndexes(components, supports) {
  return {
    componentsByKey: positionIndex(components, 'componentKey'),
    supportsByKey: positionIndex(supports, 'supportKey'),
    componentsBySourceEntityId: groupedIndex(components, 'sourceEntityId', 'componentKey'),
    supportsBySourceEntityId: groupedIndex(supports, 'sourceEntityId', 'supportKey'),
    componentsByType: groupedIndex(components, 'type', 'componentKey'),
    componentsByLineId: nestedGroupedIndex(components, 'identity', 'lineId', 'componentKey'),
    componentsByBranchId: nestedGroupedIndex(components, 'identity', 'branchId', 'componentKey'),
    componentsBySystemId: nestedGroupedIndex(components, 'identity', 'systemId', 'componentKey'),
  };
}

function validatePorts(model, errors) {
  if (!Array.isArray(model?.unconnectedPorts)) {
    errors.push('Shared model unconnectedPorts must be an array.');
    return;
  }
  const keys = model.unconnectedPorts.map((port) => stringValue(port?.portKey));
  if (keys.some((key) => !key)) errors.push('Shared model portKey is required.');
  if (new Set(keys).size !== keys.length) errors.push('Shared model portKey values must be unique.');
  model.unconnectedPorts.forEach((port) => {
    if (!stringValue(port?.componentKey)) errors.push('Shared model port componentKey is required.');
    if (!isPlainRecord(port?.position)) errors.push(`Shared model port ${port?.portKey || ''} position is required.`);
  });
}

function validateProject(project, errors) {
  if (!isPlainRecord(project)) return errors.push('Shared model project is required.');
  if (!stringValue(project.datasetId)) errors.push('Shared model project.datasetId is required.');
}

function validateUnits(units, errors) {
  if (!isPlainRecord(units)) return errors.push('Shared model units are required.');
  ['length', 'force', 'mass'].forEach((field) => {
    if (!stringValue(units[field])) errors.push(`Shared model units.${field} is required.`);
  });
}

function validateSnapshotRef(reference, errors) {
  if (!isPlainRecord(reference)) return errors.push('Shared model sourceSnapshotRef is required.');
  if (reference.schema !== 'source-package-snapshot/v1') errors.push('Shared model sourceSnapshotRef schema is invalid.');
  ['datasetId', 'sourceSchema', 'sourceSemanticHash'].forEach((field) => {
    if (!stringValue(reference[field])) errors.push(`Shared model sourceSnapshotRef.${field} is required.`);
  });
}

function validateReferences(references, errors) {
  if (!isPlainRecord(references) || !Array.isArray(references.nodes)) {
    errors.push('Shared model sourceReferences.nodes must be an array.');
  }
}

function validateArray(value, field, key, errors) {
  if (!Array.isArray(value)) return errors.push(`Shared model ${field} must be an array.`);
  const keys = value.map((row) => stringValue(row?.[key]));
  if (keys.some((item) => !item)) errors.push(`Shared model ${field} contains a missing ${key}.`);
  if (new Set(keys).size !== keys.length) errors.push(`Shared model ${field} contains duplicate ${key} values.`);
}

function sortedRecords(rows, field) {
  return [...rows].sort((left, right) => stringValue(left?.[field]).localeCompare(stringValue(right?.[field])));
}

function positionIndex(rows, field) {
  return Object.fromEntries(rows.map((row, index) => [row[field], index]));
}

function groupedIndex(rows, field, valueField) {
  return groupRows(rows, (row) => stringValue(row[field]), valueField);
}

function nestedGroupedIndex(rows, parentField, field, valueField) {
  return groupRows(rows, (row) => stringValue(row[parentField]?.[field]), valueField);
}

function groupRows(rows, selector, valueField) {
  const result = {};
  rows.forEach((row) => {
    const key = selector(row);
    (result[key] ||= []).push(row[valueField]);
  });
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function withoutHash(model) {
  const { semanticHash: _semanticHash, ...rest } = model || {};
  return rest;
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}
