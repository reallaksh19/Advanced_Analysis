import { createDiagnostic, DIAGNOSTIC_SEVERITY, normalizeDiagnosticRows, sortDiagnostics } from '../diagnostics.js';
import { evidenceValue } from '../evidence.js';
import { deepFreeze, stringValue } from '../immutable.js';
import { validateSharedPipingModel } from '../shared-piping-model.js';

export const CANONICAL_GEOMETRY_SCHEMA = 'canonical-geometry-v1';

export function projectSharedPipingModelToCanonicalGeometry(model) {
  assertSharedModel(model);
  const state = projectionState(model);
  model.components.forEach((component) => projectComponent(component, state));
  model.supports.forEach((support) => projectSupport(support, state));
  const diagnostics = sortDiagnostics([...normalizeDiagnosticRows(model.diagnostics, 'sharedModel'), ...state.diagnostics]);
  return deepFreeze({
    schemaVersion: CANONICAL_GEOMETRY_SCHEMA,
    unit: model.units.length,
    project: { id: model.project.datasetId, name: model.project.name },
    source: 'shared-piping-model',
    nodes: sorted(state.nodes, 'id'),
    segments: sorted(state.segments, 'id'),
    components: sorted(state.components, 'id'),
    supports: sorted(state.supports, 'id'),
    diagnostics,
    summary: {
      nodes: state.nodes.length,
      segments: state.segments.length,
      components: state.components.length,
      supports: state.supports.length,
      sourceSharedModelHash: model.semanticHash,
    },
  });
}

function projectComponent(component, state) {
  const ports = (component.geometry?.ports || []).filter((port) => port.position);
  if (ports.length === 2) {
    const startNodeId = ensurePortNode(ports[0], state);
    const endNodeId = ensurePortNode(ports[1], state);
    state.segments.push(segmentRecord(component, startNodeId, endNodeId));
    return;
  }
  const nodeId = ports.length === 1 ? ensurePortNode(ports[0], state) : null;
  state.components.push(componentRecord(component, nodeId));
  if (ports.length > 2) state.diagnostics.push(lossDiagnostic(component, ports.length));
  if (!ports.length) state.diagnostics.push(noGeometryDiagnostic(component));
}

function projectSupport(support, state) {
  const nodeId = support.position ? ensureNode(preferredSupportNodeId(support), support.position, state) : null;
  state.supports.push({
    id: support.supportKey,
    type: support.type,
    ...(nodeId ? { nodeId } : {}),
    ...(support.sourceReferences?.segmentId ? { segmentId: support.sourceReferences.segmentId } : {}),
    meta: sourceMeta(support),
  });
  if (!nodeId) state.diagnostics.push(createDiagnostic(
    'SHARED_SUPPORT_POSITION_UNAVAILABLE',
    'Shared support cannot be projected to canonical geometry without a position.',
    { severity: DIAGNOSTIC_SEVERITY.WARNING, scope: support.supportKey },
  ));
}

function segmentRecord(component, startNodeId, endNodeId) {
  const properties = component.engineeringProperties || {};
  return {
    id: component.componentKey,
    startNodeId,
    endNodeId,
    type: component.type,
    ...numberField('diameter', evidenceValue(properties.outerDiameterMm)),
    ...numberField('thickness', evidenceValue(properties.wallThicknessMm)),
    ...textField('material', evidenceValue(properties.materialName)),
    ...numberField('length', evidenceValue(component.compatibilityEvidence?.sourceLengthMm)),
    meta: sourceMeta(component),
  };
}

function componentRecord(component, nodeId) {
  return {
    id: component.componentKey,
    type: component.type,
    ...(nodeId ? { nodeId } : {}),
    ...(component.sourceReferences?.segmentId ? { segmentId: component.sourceReferences.segmentId } : {}),
    meta: sourceMeta(component),
  };
}

function ensurePortNode(port, state) {
  const preferred = stringValue(port.sourceReference?.sourceNodeId) || port.portKey;
  return ensureNode(preferred, port.position, state);
}

function ensureNode(preferredId, position, state) {
  const existing = state.nodeMap.get(preferredId);
  if (!existing) return addNode(preferredId, position, state);
  if (samePoint(existing, position)) return preferredId;
  const replacement = `${preferredId}@${state.nodes.length + 1}`;
  state.diagnostics.push(createDiagnostic('CANONICAL_NODE_ID_CONFLICT', 'Canonical node identity had conflicting coordinates; a deterministic projection key was used.', {
    severity: DIAGNOSTIC_SEVERITY.WARNING, scope: preferredId, replacement,
  }));
  return addNode(replacement, position, state);
}

function addNode(id, position, state) {
  const node = { id, x: position.x, y: position.y, z: position.z };
  state.nodes.push(node);
  state.nodeMap.set(id, node);
  return id;
}

function projectionState(model) {
  const diagnostics = [];
  if (model.units.length === 'unknown') diagnostics.push(createDiagnostic(
    'CANONICAL_UNIT_UNKNOWN',
    'Shared model length unit is unknown; canonical projection retains unknown without inventing a unit.',
    { severity: DIAGNOSTIC_SEVERITY.ERROR, scope: 'units.length' },
  ));
  return { nodes: [], segments: [], components: [], supports: [], diagnostics, nodeMap: new Map() };
}

function preferredSupportNodeId(support) {
  return stringValue(support.sourceReferences?.nodeId) || `${support.supportKey}:node`;
}

function sourceMeta(record) {
  return {
    sourceEntityId: record.sourceEntityId ?? null,
    sourceNodeKey: record.sourceReferences?.sourceNodeKey || '',
    lineId: record.identity?.lineId || '',
    branchId: record.identity?.branchId || '',
    systemId: record.identity?.systemId || '',
    zoneId: record.identity?.zoneId || '',
  };
}

function lossDiagnostic(component, count) {
  return createDiagnostic('CANONICAL_COMPONENT_PORTS_LOSSY', `Canonical geometry cannot represent ${count} unconnected ports as one segment.`, {
    severity: DIAGNOSTIC_SEVERITY.WARNING, scope: component.componentKey, portCount: count,
  });
}

function noGeometryDiagnostic(component) {
  return createDiagnostic('CANONICAL_COMPONENT_GEOMETRY_UNAVAILABLE', 'Shared component has no positional port evidence for canonical projection.', {
    severity: DIAGNOSTIC_SEVERITY.WARNING, scope: component.componentKey,
  });
}

function numberField(field, value) {
  return Number.isFinite(value) ? { [field]: value } : {};
}

function textField(field, value) {
  return stringValue(value) ? { [field]: stringValue(value) } : {};
}

function samePoint(left, right) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function sorted(rows, field) {
  return [...rows].sort((left, right) => stringValue(left[field]).localeCompare(stringValue(right[field])));
}

function assertSharedModel(model) {
  const validation = validateSharedPipingModel(model);
  if (!validation.ok) throw new TypeError(`Canonical projection requires a valid shared model: ${validation.errors.join(' ')}`);
}
