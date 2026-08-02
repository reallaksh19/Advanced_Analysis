/** Pure junction, TEE, and OLET visual derivation. */
import { DIMENSION_STATUS } from './dimension-authority.js';
import { averagePoints, finitePoint, unitVector, vector } from './topology-edit-geometry-math.js';
import {
  dimensionVisualDiagnostics,
  unresolvedVisualComponent,
  visualComponent,
  visualDiagnostic,
  visualPrimitive,
} from './topology-edit-visual-component-factory.js';

export function deriveVisualJunction(junction, nodes, evidence, dimensionAuthority, policy) {
  const type = String(junction.entityType || 'JUNCTION').toUpperCase();
  const positions = (junction.nodeIds || []).map((id) => nodes.get(String(id))).filter(Boolean);
  if (!positions.length) {
    return unresolvedVisualComponent(
      junction,
      type,
      evidence,
      'JUNCTION_POSITION_MISSING',
      'Junction position evidence is missing.',
    );
  }
  const center = finitePoint(evidence.center) || averagePoints(positions);
  if (type === 'TEE') return deriveTee(junction, center, nodes, evidence, dimensionAuthority, policy);
  if (type === 'OLET') return deriveOlet(junction, center, nodes, evidence, dimensionAuthority, policy);
  return visualComponent(junction, type, evidence, [
    visualPrimitive(junction, type, 'marker', 'JUNCTION_MARKER', { position: center }, evidence, policy),
  ], []);
}

function deriveTee(junction, center, nodes, evidence, authority, policy) {
  const runIds = Array.isArray(evidence.runNodeIds)
    ? evidence.runNodeIds.map(String)
    : [];
  const branchId = String(evidence.branchNodeId || '');
  const runPoints = runIds.map((id) => nodes.get(id));
  const branchPoint = nodes.get(branchId);
  const runDiameter = authority.resolveOutsideDiameter(evidence, {
    componentId: junction.id,
    componentType: 'TEE',
  });
  const branchDiameter = authority.resolveBranchOutsideDiameter(evidence, {
    componentId: junction.id,
    componentType: 'TEE',
  });
  const diagnostics = [
    ...dimensionVisualDiagnostics(junction.id, runDiameter),
    ...dimensionVisualDiagnostics(junction.id, branchDiameter),
  ];
  if (runPoints.length !== 2 || runPoints.some((row) => !row) || !branchPoint) {
    diagnostics.push(visualDiagnostic(
      junction.id,
      'TEE_PORT_ROLES_MISSING',
      'TEE run and branch node identities are required.',
    ));
  }
  const parameters = {
    center,
    runNodeIds: runIds,
    branchNodeId: branchId,
    runDirections: runPoints.map((row) => row ? unitVector(vector(center, row)) : null),
    branchDirection: branchPoint ? unitVector(vector(center, branchPoint)) : null,
    runOutsideDiameterMm: runDiameter.valueMm,
    branchOutsideDiameterMm: branchDiameter.valueMm,
  };
  return junctionBody(junction, 'TEE', evidence, parameters, diagnostics, policy);
}

function deriveOlet(junction, center, nodes, evidence, authority, policy) {
  const branchId = String(evidence.branchNodeId || '');
  const branchPoint = nodes.get(branchId);
  const hostEntityId = String(evidence.hostEntityId || '');
  const diameter = authority.resolveBranchOutsideDiameter(evidence, {
    componentId: junction.id,
    componentType: 'OLET',
  });
  const diagnostics = dimensionVisualDiagnostics(junction.id, diameter);
  if (!hostEntityId) diagnostics.push(visualDiagnostic(
    junction.id,
    'OLET_HOST_MISSING',
    'OLET host entity identity is required.',
  ));
  if (!branchPoint) diagnostics.push(visualDiagnostic(
    junction.id,
    'OLET_BRANCH_AXIS_MISSING',
    'OLET branch node identity is required.',
  ));
  const parameters = {
    center,
    hostEntityId,
    branchNodeId: branchId,
    branchDirection: branchPoint ? unitVector(vector(center, branchPoint)) : null,
    branchOutsideDiameterMm: diameter.valueMm,
  };
  return junctionBody(junction, 'OLET', evidence, parameters, diagnostics, policy);
}

function junctionBody(junction, type, evidence, parameters, diagnostics, policy) {
  const resolved = diagnostics.length === 0
    && requiredDimensionsResolved(type, parameters);
  const kind = resolved
    ? (type === 'TEE' ? 'TEE_JUNCTION' : 'OLET_BRANCH')
    : 'JUNCTION_MARKER';
  const role = resolved ? 'body' : 'marker';
  const body = resolved ? parameters : { position: parameters.center };
  return visualComponent(junction, type, evidence, [
    visualPrimitive(junction, type, role, kind, body, evidence, policy),
  ], diagnostics);
}

function requiredDimensionsResolved(type, parameters) {
  if (type === 'TEE') {
    return parameters.runOutsideDiameterMm !== null
      && parameters.branchOutsideDiameterMm !== null;
  }
  return parameters.branchOutsideDiameterMm !== null;
}
