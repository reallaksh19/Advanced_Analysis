import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { assertPipeSegmentCatalogueBinding } from '../topology-edit-pipe-segment-contract.js';

export const CONTINUE_ROUTE_INTENT_SCHEMA = 'TopologyEditContinueRouteIntent.v1';
const AXIS_LOCKS = new Set(['FREE', 'X', 'Y', 'Z']);
const MAX_VERTICES = 128;

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditContinueRouteIntent: ${message}`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function finitePoint(value, label) {
  const point = { x: Number(value?.x), y: Number(value?.y), z: Number(value?.z) };
  if (!Object.values(point).every(Number.isFinite)) {
    fail(`${label} must contain finite x, y and z.`, RangeError);
  }
  return Object.fromEntries(Object.entries(point).map(([key, number]) => [
    key,
    Object.is(number, -0) ? 0 : number,
  ]));
}
function normalizedUnits(value) {
  const length = requiredText(value?.length, 'unitSystem.length').toUpperCase();
  const angle = requiredText(value?.angle, 'unitSystem.angle').toUpperCase();
  if (length !== 'MM' || angle !== 'DEG') {
    fail('unitSystem must be { length: MM, angle: DEG }.', RangeError);
  }
  return { length, angle };
}
function normalizedPolicy(value = {}) {
  const minimumLengthMm = Number(value.minimumLengthMm);
  const overlapToleranceMm = Number(value.overlapToleranceMm);
  if (!Number.isFinite(minimumLengthMm) || minimumLengthMm <= 0) {
    fail('segmentPolicy.minimumLengthMm must be positive.', RangeError);
  }
  if (!Number.isFinite(overlapToleranceMm) || overlapToleranceMm < 0) {
    fail('segmentPolicy.overlapToleranceMm must be non-negative.', RangeError);
  }
  const material = { minimumLengthMm, overlapToleranceMm };
  return deepFreeze({ ...material, policyHash: semanticHash(material) });
}
function normalizedAxisLock(value, label) {
  const lock = requiredText(value ?? 'FREE', label).toUpperCase();
  if (!AXIS_LOCKS.has(lock)) fail(`${label} uses unsupported axis lock ${lock}.`, RangeError);
  return lock;
}
function normalizedVertices(value, defaultAxisLock = 'FREE') {
  if (!Array.isArray(value) || value.length === 0) fail('vertices must be a non-empty array.');
  if (value.length > MAX_VERTICES) fail(`vertices exceeds ${MAX_VERTICES} points.`, RangeError);
  return value.map((row, index) => {
    const source = row?.requestedPointMm ? row : { requestedPointMm: row };
    return {
      sequence: index,
      requestedPointMm: finitePoint(source.requestedPointMm, `vertices[${index}].requestedPointMm`),
      axisLock: normalizedAxisLock(source.axisLock ?? defaultAxisLock, `vertices[${index}].axisLock`),
    };
  });
}
function intentMaterial(input) {
  const defaultAxisLock = normalizedAxisLock(input.axisLock ?? 'FREE', 'axisLock');
  return {
    schema: CONTINUE_ROUTE_INTENT_SCHEMA,
    unitSystem: normalizedUnits(input.unitSystem),
    startNodeId: requiredText(input.startNodeId, 'startNodeId'),
    startNodeRevision: requiredText(input.startNodeRevision, 'startNodeRevision'),
    coordinateDatumHash: requiredText(input.coordinateDatumHash, 'coordinateDatumHash'),
    catalogueBinding: assertPipeSegmentCatalogueBinding(input.catalogueBinding),
    segmentPolicy: normalizedPolicy(input.segmentPolicy),
    vertices: normalizedVertices(input.vertices, defaultAxisLock),
  };
}

export function createContinueRouteIntent(input = {}) {
  const material = intentMaterial(input);
  return deepFreeze({ ...material, intentHash: semanticHash(material) });
}

export function assertContinueRouteIntent(value) {
  const rebuilt = createContinueRouteIntent(value);
  if (value?.schema !== CONTINUE_ROUTE_INTENT_SCHEMA || value?.intentHash !== rebuilt.intentHash) {
    fail('intent differs from immutable normalized authority.', RangeError);
  }
  return rebuilt;
}

export function compileTypedContinueRouteIntent(input = {}) {
  return createContinueRouteIntent({
    unitSystem: input.unitSystem,
    startNodeId: input.startNodeId,
    startNodeRevision: input.startNodeRevision,
    coordinateDatumHash: input.coordinateDatumHash,
    catalogueBinding: input.catalogueBinding,
    segmentPolicy: input.segmentPolicy,
    axisLock: input.axisLock,
    vertices: input.vertices ?? input.pointsMm,
  });
}

function exactAcquisition(value, label, expectedDatumHash) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const status = requiredText(value.status, `${label}.status`).toUpperCase();
  const ambiguityCount = Number(value.ambiguityCount ?? 0);
  if (status !== 'EXACT' || !Number.isInteger(ambiguityCount) || ambiguityCount !== 0) {
    fail(`${label} is ambiguous or unresolved.`, RangeError);
  }
  if (requiredText(value.coordinateDatumHash, `${label}.coordinateDatumHash`) !== expectedDatumHash) {
    fail(`${label} coordinate datum changed.`, RangeError);
  }
  return finitePoint(value.modelPointMm, `${label}.modelPointMm`);
}

export function compileViewportContinueRouteIntent(input = {}) {
  const coordinateDatumHash = requiredText(input.coordinateDatumHash, 'coordinateDatumHash');
  if (!Array.isArray(input.pointAcquisitions) || input.pointAcquisitions.length === 0) {
    fail('pointAcquisitions must be a non-empty array.');
  }
  const axisLocks = Array.isArray(input.axisLocks) ? input.axisLocks : [];
  const vertices = input.pointAcquisitions.map((row, index) => ({
    requestedPointMm: exactAcquisition(row, `pointAcquisitions[${index}]`, coordinateDatumHash),
    axisLock: axisLocks[index] ?? input.axisLock ?? 'FREE',
  }));
  return createContinueRouteIntent({
    unitSystem: input.unitSystem,
    startNodeId: input.startNodeId,
    startNodeRevision: input.startNodeRevision,
    coordinateDatumHash,
    catalogueBinding: input.catalogueBinding,
    segmentPolicy: input.segmentPolicy,
    vertices,
  });
}
