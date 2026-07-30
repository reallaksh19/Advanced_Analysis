import {
  DEFAULT_TOLERANCE_MM,
  JUNCTION_TYPES,
  SEQUENTIAL_BRANCH_SKETCH_SCHEMA,
  pointFrom,
  samePoint,
  stableToken,
} from './sequential-sketcher-contract.js';

function createNodeStore(toleranceMm) {
  const nodes = [];
  const getOrCreate = (position, evidence) => {
    if (!position) return null;
    let node = nodes.find((candidate) => samePoint(candidate.position, position, toleranceMm));
    if (!node) {
      node = {
        id: `N-${stableToken(`${position.x}|${position.y}|${position.z}|${nodes.length}`)}`,
        position,
        evidence: [],
        segmentIds: [],
        eventComponentIds: [],
        boundaryIds: [],
      };
      nodes.push(node);
    }
    node.evidence.push(evidence);
    return node;
  };
  return { nodes, getOrCreate };
}

function attachBoundary(store, boundaries, role, position, referenceTarget, branchId, evidence) {
  if (!position && !referenceTarget) return null;
  const node = store.getOrCreate(position, evidence);
  const boundary = {
    id: `B-${stableToken(`${branchId}|${role}|${referenceTarget}|${boundaries.length}`)}`,
    role,
    position,
    referenceTarget: String(referenceTarget || '').trim(),
    nodeId: node?.id || null,
    status: referenceTarget ? 'REFERENCED_BOUNDARY' : 'UNREFERENCED_ENDPOINT',
  };
  boundaries.push(boundary);
  if (node) node.boundaryIds.push(boundary.id);
  return boundary;
}

function componentSegments(component, store, toleranceMm) {
  const aNode = store.getOrCreate(component.a, `${component.componentId}:APOS`);
  const bNode = store.getOrCreate(component.b, `${component.componentId}:LPOS`);
  const positionNode = store.getOrCreate(component.position, `${component.componentId}:POS`);
  const segments = [];
  const eventNode = positionNode || aNode || bNode;
  if (component.canonicalType === 'TEE' && aNode && bNode && positionNode && positionNode.id !== aNode.id && positionNode.id !== bNode.id) {
    segments.push({ role: 'RUN_A', fromNodeId: aNode.id, toNodeId: positionNode.id });
    segments.push({ role: 'RUN_B', fromNodeId: positionNode.id, toNodeId: bNode.id });
  } else if (aNode && bNode && !samePoint(component.a, component.b, toleranceMm)) {
    segments.push({ role: 'INLINE', fromNodeId: aNode.id, toNodeId: bNode.id });
  }
  return { aNode, bNode, positionNode, eventNode, segments };
}

export function buildBranchTopology(inventory, options = {}) {
  const toleranceMm = Math.max(0, Number(options.toleranceMm ?? DEFAULT_TOLERANCE_MM));
  const store = createNodeStore(toleranceMm);
  const segments = [];
  const components = [];
  const boundaries = [];
  const issues = [];

  for (const component of inventory.routeComponents) {
    const built = componentSegments(component, store, toleranceMm);
    const segmentIds = [];
    built.segments.forEach((segment, localIndex) => {
      const row = {
        id: `S-${stableToken(`${component.id}|${localIndex}|${segment.role}`)}`,
        componentId: component.id,
        sourceComponentId: component.componentId,
        sourceIndex: component.sourceIndex,
        canonicalType: component.canonicalType,
        role: segment.role,
        fromNodeId: segment.fromNodeId,
        toNodeId: segment.toNodeId,
      };
      segments.push(row);
      segmentIds.push(row.id);
      store.nodes.find((node) => node.id === row.fromNodeId)?.segmentIds.push(row.id);
      store.nodes.find((node) => node.id === row.toNodeId)?.segmentIds.push(row.id);
    });
    const eventNodeId = built.eventNode?.id || null;
    if (!segmentIds.length && eventNodeId) built.eventNode.eventComponentIds.push(component.id);
    components.push({ ...component, segmentIds, eventNodeId, supports: Object.freeze([]) });
    if (!component.a && !component.b && !component.position) {
      issues.push({ code: 'COMPONENT_WITHOUT_POSITION', severity: 'ERROR', componentId: component.componentId });
    }
    if (component.cref) {
      attachBoundary(store, boundaries, 'CREF', component.position || component.a || component.b, component.cref, inventory.branchId, `${component.componentId}:CREF`);
    }
  }

  const attrs = inventory.attributes || {};
  attachBoundary(store, boundaries, 'HEAD', pointFrom(attrs.HPOS), attrs.HREF, inventory.branchId, 'BRANCH:HPOS');
  attachBoundary(store, boundaries, 'TAIL', pointFrom(attrs.TPOS), attrs.TREF, inventory.branchId, 'BRANCH:TPOS');

  for (const node of store.nodes) {
    const degree = node.segmentIds.length;
    const incidentTypes = new Set(node.segmentIds.map((id) => segments.find((segment) => segment.id === id)?.canonicalType));
    if (degree > 2 && ![...incidentTypes].some((type) => JUNCTION_TYPES.has(type))) {
      issues.push({ code: 'UNDECLARED_MULTIWAY_JUNCTION', severity: 'WARNING', nodeId: node.id, degree });
    }
  }

  return Object.freeze({
    schema: SEQUENTIAL_BRANCH_SKETCH_SCHEMA,
    branchId: inventory.branchId,
    toleranceMm,
    source: Object.freeze({ HPOS: pointFrom(attrs.HPOS), TPOS: pointFrom(attrs.TPOS), HREF: String(attrs.HREF || ''), TREF: String(attrs.TREF || '') }),
    inventory: Object.freeze({ sourceChildCount: inventory.sourceChildCount, routeComponentCount: components.length, supportRecordCount: inventory.supportRecords?.length || 0, ignoredRecordCount: inventory.ignoredRecords.length }),
    nodes: Object.freeze(store.nodes.map((node) => Object.freeze({ ...node, evidence: Object.freeze(node.evidence), segmentIds: Object.freeze(node.segmentIds), eventComponentIds: Object.freeze(node.eventComponentIds), boundaryIds: Object.freeze(node.boundaryIds) }))),
    components: Object.freeze(components.map(Object.freeze)),
    segments: Object.freeze(segments.map(Object.freeze)),
    boundaries: Object.freeze(boundaries.map(Object.freeze)),
    issues: Object.freeze(issues.map(Object.freeze)),
    supportSummary: Object.freeze({ familyCount: 0, unresolvedCount: 0, diagnosticCount: 0 }),
  });
}
