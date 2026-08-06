import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { assertPipeSegmentCatalogueBinding } from '../topology-edit-pipe-segment-contract.js';

export const START_ROUTE_INTENT_SCHEMA = 'TopologyEditStartRouteIntent.v1';

const AXIS_LOCKS = new Set(['FREE', 'X', 'Y', 'Z']);

function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditStartRouteIntent: ${message}`);
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
function axisLockedEnd(start, end, axisLock) {
  if (axisLock === 'X') return { x: end.x, y: start.y, z: start.z };
  if (axisLock === 'Y') return { x: start.x, y: end.y, z: start.z };
  if (axisLock === 'Z') return { x: start.x, y: start.y, z: end.z };
  return end;
}
function intentMaterial(input) {
  const startPointMm = finitePoint(input.startPointMm, 'startPointMm');
  const suppliedEnd = finitePoint(input.endPointMm, 'endPointMm');
  const axisLock = requiredText(input.axisLock ?? 'FREE', 'axisLock').toUpperCase();
  if (!AXIS_LOCKS.has(axisLock)) fail(`unsupported axisLock ${axisLock}.`, RangeError);
  const endPointMm = axisLockedEnd(startPointMm, suppliedEnd, axisLock);
  const lengthMm = Math.hypot(
    endPointMm.x - startPointMm.x,
    endPointMm.y - startPointMm.y,
    endPointMm.z - startPointMm.z,
  );
  if (!(lengthMm > 0)) fail('start and end points must be distinct.', RangeError);
  return {
    schema: START_ROUTE_INTENT_SCHEMA,
    unitSystem: normalizedUnits(input.unitSystem),
    startPointMm,
    endPointMm,
    axisLock,
    coordinateDatumHash: requiredText(input.coordinateDatumHash, 'coordinateDatumHash'),
    catalogueBinding: assertPipeSegmentCatalogueBinding(input.catalogueBinding),
    segmentPolicy: normalizedPolicy(input.segmentPolicy),
  };
}

export function createStartRouteIntent(input = {}) {
  const material = intentMaterial(input);
  return deepFreeze({ ...material, intentHash: semanticHash(material) });
}

export function assertStartRouteIntent(value) {
  const rebuilt = createStartRouteIntent(value);
  if (value?.schema !== START_ROUTE_INTENT_SCHEMA || value?.intentHash !== rebuilt.intentHash) {
    fail('intent differs from immutable normalized authority.', RangeError);
  }
  return rebuilt;
}

export function compileTypedStartRouteIntent(input = {}) {
  return createStartRouteIntent({
    unitSystem: input.unitSystem,
    startPointMm: input.startPointMm,
    endPointMm: input.endPointMm,
    axisLock: input.axisLock,
    coordinateDatumHash: input.coordinateDatumHash,
    catalogueBinding: input.catalogueBinding,
    segmentPolicy: input.segmentPolicy,
  });
}

function exactAcquisition(value, label, expectedDatumHash) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  const status = requiredText(value.status, `${label}.status`).toUpperCase();
  const ambiguityCount = Number(value.ambiguityCount ?? 0);
  if (status !== 'EXACT' || !Number.isInteger(ambiguityCount) || ambiguityCount !== 0) {
    fail(`${label} is ambiguous or unresolved.`, RangeError);
  }
  if (requiredText(value.coordinateDatumHash, `${label}.coordinateDatumHash`)
    !== expectedDatumHash) {
    fail(`${label} coordinate datum changed.`, RangeError);
  }
  return finitePoint(value.modelPointMm, `${label}.modelPointMm`);
}

export function compileViewportStartRouteIntent(input = {}) {
  const coordinateDatumHash = requiredText(input.coordinateDatumHash, 'coordinateDatumHash');
  return createStartRouteIntent({
    unitSystem: input.unitSystem,
    startPointMm: exactAcquisition(
      input.startAcquisition,
      'startAcquisition',
      coordinateDatumHash,
    ),
    endPointMm: exactAcquisition(
      input.endAcquisition,
      'endAcquisition',
      coordinateDatumHash,
    ),
    axisLock: input.axisLock,
    coordinateDatumHash,
    catalogueBinding: input.catalogueBinding,
    segmentPolicy: input.segmentPolicy,
  });
}
