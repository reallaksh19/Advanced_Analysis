import { deepFreeze, semanticHash, stringValue } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_VISUAL_GEOMETRY = 'advanced-topology-edit-visual-geometry/v1';

const PRIMITIVE_KINDS = new Set([
  'PIPE_CYLINDER',
  'ELBOW_ARC',
  'CONICAL_REDUCER',
  'ECCENTRIC_REDUCER',
  'TEE_JUNCTION',
  'OLET_BRANCH',
  'FLANGE_DISC',
  'VALVE_BODY',
  'GASKET_DISC',
  'INSTRUMENT_MARKER',
  'JUNCTION_MARKER',
  'DIAGNOSTIC_CENTERLINE',
]);

function finitePoint(point) {
  return point
    && Number.isFinite(Number(point.x))
    && Number.isFinite(Number(point.y))
    && Number.isFinite(Number(point.z));
}

function normalizePoint(point) {
  if (!finitePoint(point)) throw new TypeError('Visual geometry point must contain finite x, y, and z coordinates.');
  return deepFreeze({ x: Number(point.x), y: Number(point.y), z: Number(point.z) });
}

function normalizeSourcePaths(sourcePaths) {
  return [...new Set((sourcePaths || []).map(stringValue).filter(Boolean))].sort(compareCodeUnits);
}

export function createVisualDiagnostic(input = {}) {
  const code = stringValue(input.code);
  if (!code) throw new TypeError('Visual diagnostic requires a code.');
  return deepFreeze({
    code,
    severity: stringValue(input.severity || 'ERROR').toUpperCase(),
    message: stringValue(input.message),
    canonicalEntityId: stringValue(input.canonicalEntityId),
    sourceEvidenceIds: normalizeSourcePaths(input.sourceEvidenceIds),
    details: input.details && typeof input.details === 'object' ? { ...input.details } : {},
  });
}

export function createVisualPrimitive(input = {}) {
  const primitiveId = stringValue(input.primitiveId);
  const canonicalEntityId = stringValue(input.canonicalEntityId);
  const kind = stringValue(input.kind).toUpperCase();
  const partRole = stringValue(input.partRole || 'body');

  if (!primitiveId) throw new TypeError('Visual primitive requires primitiveId.');
  if (!canonicalEntityId) throw new TypeError('Visual primitive requires canonicalEntityId.');
  if (!PRIMITIVE_KINDS.has(kind)) throw new TypeError(`Unsupported visual primitive kind: ${kind}`);

  return deepFreeze({
    primitiveId,
    canonicalEntityId,
    canonicalType: stringValue(input.canonicalType).toUpperCase(),
    modelRole: stringValue(input.modelRole || 'DRAFT').toUpperCase(),
    pickGroupId: stringValue(input.pickGroupId || `entity:${canonicalEntityId}`),
    partRole,
    kind,
    sourcePaths: normalizeSourcePaths(input.sourcePaths),
    workspaceEntityIds: normalizeSourcePaths(input.workspaceEntityIds),
    parameters: input.parameters && typeof input.parameters === 'object' ? { ...input.parameters } : {},
  });
}

export function visualPrimitiveId(canonicalEntityId, partRole, policyVersion) {
  const id = stringValue(canonicalEntityId);
  const role = stringValue(partRole || 'body');
  if (!id) throw new TypeError('visualPrimitiveId requires canonicalEntityId.');
  return `visual:${semanticHash({ canonicalEntityId: id, partRole: role, policyVersion }).slice(0, 24)}`;
}

const PLACEMENT_PARAMETER_KEYS = new Set([
  'start',
  'end',
  'sourceEnd',
  'center',
  'position',
  'axis',
  'arcPoints',
  'bendPlaneNormal',
  'eccentricOffsetDirection',
  'runDirections',
  'runEnds',
  'branchDirection',
  'branchEnd',
  'runPortIds',
  'branchPortId',
  'hostEntityId',
  'outsideDiameterAuthority',
  'boreAuthority',
  'radiusAuthority',
]);

function geometrySignatureParameters(parameters) {
  if (Array.isArray(parameters)) return parameters.map(geometrySignatureParameters);
  if (!parameters || typeof parameters !== 'object') return parameters;
  return Object.fromEntries(
    Object.entries(parameters)
      .filter(([key]) => !PLACEMENT_PARAMETER_KEYS.has(key))
      .map(([key, value]) => [key, geometrySignatureParameters(value)]),
  );
}

export function visualSignature(primitives) {
  const payload = (primitives || []).map((primitive) => ({
    canonicalType: primitive.canonicalType,
    partRole: primitive.partRole,
    kind: primitive.kind,
    parameters: geometrySignatureParameters(primitive.parameters),
  }));
  return semanticHash(payload);
}

export function createVisualComponent(input = {}) {
  const canonicalEntityId = stringValue(input.canonicalEntityId);
  if (!canonicalEntityId) throw new TypeError('Visual component requires canonicalEntityId.');

  const primitives = [...(input.primitives || [])]
    .map(createVisualPrimitive)
    .sort((left, right) => compareCodeUnits(left.primitiveId, right.primitiveId));
  const diagnostics = [...(input.diagnostics || [])]
    .map(createVisualDiagnostic)
    .sort((left, right) => compareCodeUnits(left.code, right.code)
      || compareCodeUnits(left.canonicalEntityId, right.canonicalEntityId));

  return deepFreeze({
    canonicalEntityId,
    canonicalType: stringValue(input.canonicalType).toUpperCase(),
    sourcePaths: normalizeSourcePaths(input.sourcePaths),
    workspaceEntityIds: normalizeSourcePaths(input.workspaceEntityIds),
    visualSignature: visualSignature(primitives),
    primitives,
    diagnostics,
  });
}

export function createTopologyVisualGeometryModel(input = {}) {
  const canonicalTopologyHash = stringValue(input.canonicalTopologyHash);
  const geometryPolicyHash = stringValue(input.geometryPolicyHash);
  if (!canonicalTopologyHash) throw new TypeError('Visual geometry model requires canonicalTopologyHash.');
  if (!geometryPolicyHash) throw new TypeError('Visual geometry model requires geometryPolicyHash.');

  const components = [...(input.components || [])]
    .map(createVisualComponent)
    .sort((left, right) => compareCodeUnits(left.canonicalEntityId, right.canonicalEntityId));
  const diagnostics = [
    ...(input.diagnostics || []),
    ...components.flatMap((component) => component.diagnostics),
  ].map(createVisualDiagnostic).sort((left, right) =>
    compareCodeUnits(left.code, right.code)
      || compareCodeUnits(left.canonicalEntityId, right.canonicalEntityId)
  );

  const base = {
    schema: TOPOLOGY_EDIT_VISUAL_GEOMETRY,
    canonicalTopologyHash,
    geometryPolicyHash,
    modelRole: stringValue(input.modelRole || 'DRAFT').toUpperCase(),
    components,
    diagnostics,
  };

  return deepFreeze({ ...base, visualGeometryHash: semanticHash(base) });
}

export function assertVisualPoint(point) {
  return normalizePoint(point);
}

function compareCodeUnits(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
