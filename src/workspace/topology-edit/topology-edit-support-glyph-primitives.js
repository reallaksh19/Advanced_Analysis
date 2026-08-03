import * as THREE from 'three';
import { restraintColor } from './support-restraint-family.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DIAGNOSTIC_COLOR = 0xfb7185;
const MIN_LENGTH = 1e-9;
const GOVERNED_FAMILIES = new Set([
  'REST', 'SHOE', 'TRUNNION', 'HANGER', 'GUIDE', 'LINE_STOP', 'LIMIT',
  'HOLDOWN', 'U_BOLT', 'SPRING_HANGER', 'CAN', 'SPRING_WARNING', 'ANCHOR',
]);

export function addTopologyEditSupportBody(context) {
  const pickTarget = { objectKind: 'support', objectId: context.supportId, supportId: context.supportId };
  const material = materialFor(0x22d3ee);
  addMesh(context.group, new THREE.OctahedronGeometry(context.markerSize * 0.42, 0), material,
    context.origin, null, pickTarget, 'support-body');
  addMesh(context.group, new THREE.TorusGeometry(
    context.markerSize * 0.48,
    context.markerSize * 0.06,
    Math.max(6, Math.floor(context.radialSegments / 2)),
    context.radialSegments,
  ), material.clone(), context.origin, null, pickTarget, 'support-ring');
}

export function addTopologyEditRestraintGlyph(context) {
  const restraintId = requiredText(context.restraint?.restraintId, 'RESTRAINT_ID_MISSING', context.fail);
  const family = requiredText(
    context.restraint?.family || 'UNKNOWN', 'RESTRAINT_FAMILY_MISSING', context.fail,
  ).toUpperCase();
  const pickTarget = restraintPick(
    context.supportId, restraintId, family, context.restraint.sourcePaths,
  );
  const material = materialFor(GOVERNED_FAMILIES.has(family)
    ? restraintColor(family) : DIAGNOSTIC_COLOR);
  const direction = context.restraint.direction
    ? directionVector(context.restraint.direction, context.fail) : null;
  const row = {
    group: context.group,
    origin: context.origin,
    size: context.markerSize,
    radialSegments: context.radialSegments,
    material,
    pickTarget,
    restraint: context.restraint,
    family,
    direction,
    fail: context.fail,
    materialUsed: false,
  };

  const builder = BUILDERS[family];
  if (!builder || context.restraint.status === 'UNRESOLVED') addDiagnostic(row);
  else builder(row);
  addContactMarker(row, context.restraint.positiveContactPoint, 'positive-contact');
  addContactMarker(row, context.restraint.negativeContactPoint, 'negative-contact');
}

const BUILDERS = {
  REST: addRest,
  SHOE: addShoe,
  TRUNNION: addTrunnion,
  HANGER: addHanger,
  GUIDE: addGuide,
  LINE_STOP: (context) => addLineStop(context, false),
  LIMIT: (context) => addLineStop(context, true),
  HOLDOWN: addHoldown,
  U_BOLT: addUBolt,
  SPRING_HANGER: (context) => addSpring(context, true),
  CAN: (context) => addSpring(context, false),
  SPRING_WARNING: (context) => addSpring(context, false),
  ANCHOR: addAnchor,
};

function addRest(context) {
  const axis = requireDirection(context);
  addPlate(context, context.origin.clone().addScaledVector(axis, -context.size * 0.55),
    axis, context.size * 1.35, context.size * 0.18, 'rest-base');
}

function addShoe(context) {
  const axis = requireDirection(context);
  const center = context.origin.clone().addScaledVector(axis, -context.size * 0.5);
  const side = stablePerpendicular(axis);
  addPlate(context, center, axis, context.size * 1.5, context.size * 0.18, 'shoe-base');
  for (const sign of [-1, 1]) {
    addCylinder(context, center.clone().addScaledVector(side, sign * context.size * 0.42),
      context.origin.clone().addScaledVector(side, sign * context.size * 0.42),
      context.size * 0.1, sign < 0 ? 'shoe-leg-a' : 'shoe-leg-b');
  }
}

function addTrunnion(context) {
  const axis = requireDirection(context);
  addCylinder(context, context.origin,
    context.origin.clone().addScaledVector(axis, -context.size * 1.25),
    context.size * 0.22, 'trunnion-post');
  addPlate(context, context.origin.clone().addScaledVector(axis, -context.size * 1.3),
    axis, context.size, context.size * 0.18, 'trunnion-foot');
}

function addHanger(context) {
  const axis = requireDirection(context);
  const top = context.origin.clone().addScaledVector(axis, context.size * 1.35);
  addCylinder(context, context.origin, top, context.size * 0.09, 'hanger-rod');
  addRing(context, top, axis, context.size * 0.33, context.size * 0.07, 'hanger-eye');
}

function addGuide(context) {
  const axis = requireDirection(context);
  const side = stablePerpendicular(axis);
  for (const sign of [-1, 1]) {
    const offset = side.clone().multiplyScalar(sign * context.size * 0.55);
    addCylinder(context,
      context.origin.clone().add(offset).addScaledVector(axis, -context.size * 0.65),
      context.origin.clone().add(offset).addScaledVector(axis, context.size * 0.65),
      context.size * 0.1, sign < 0 ? 'guide-rail-negative' : 'guide-rail-positive');
  }
}

function addLineStop(context, paired) {
  const axis = requireDirection(context);
  addPlate(context, context.origin.clone().addScaledVector(axis, context.size * 0.62),
    axis, context.size, context.size * 0.16, 'line-stop-positive');
  if (paired) addPlate(context, context.origin.clone().addScaledVector(axis, -context.size * 0.62),
    axis, context.size, context.size * 0.16, 'limit-negative');
}

function addHoldown(context) {
  const axis = requireDirection(context);
  const center = context.origin.clone().addScaledVector(axis, context.size * 0.58);
  const side = stablePerpendicular(axis);
  addPlate(context, center, axis, context.size * 1.35, context.size * 0.17, 'holdown-cap');
  for (const sign of [-1, 1]) {
    addCylinder(context, center.clone().addScaledVector(side, sign * context.size * 0.5),
      context.origin.clone().addScaledVector(side, sign * context.size * 0.5),
      context.size * 0.08, sign < 0 ? 'holdown-leg-negative' : 'holdown-leg-positive');
  }
}

function addUBolt(context) {
  const axis = requireDirection(context);
  const side = stablePerpendicular(axis);
  addRing(context, context.origin, side, context.size * 0.55, context.size * 0.09, 'u-bolt-loop');
  for (const sign of [-1, 1]) {
    const offset = side.clone().multiplyScalar(sign * context.size * 0.5);
    addCylinder(context, context.origin.clone().add(offset),
      context.origin.clone().add(offset).addScaledVector(axis, -context.size * 0.8),
      context.size * 0.08, sign < 0 ? 'u-bolt-leg-negative' : 'u-bolt-leg-positive');
  }
}

function addSpring(context, hanger) {
  const axis = requireDirection(context);
  const start = hanger ? context.origin
    : context.origin.clone().addScaledVector(axis, -context.size * 0.6);
  const end = context.origin.clone().addScaledVector(axis,
    hanger ? context.size * 1.45 : context.size * 0.75);
  for (let index = 0; index < 4; index += 1) {
    addRing(context, start.clone().lerp(end, (index + 0.5) / 4), axis,
      context.size * 0.24, context.size * 0.055, `spring-coil-${index}`);
  }
  if (hanger) addCylinder(context, end,
    end.clone().addScaledVector(axis, context.size * 0.45),
    context.size * 0.07, 'spring-hanger-rod');
  else addPlate(context, start, axis, context.size * 0.8,
    context.size * 0.14, 'spring-can-base');
}

function addAnchor(context) {
  [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
    .forEach((axis, index) => addCylinder(context,
      context.origin.clone().addScaledVector(axis, -context.size * 0.7),
      context.origin.clone().addScaledVector(axis, context.size * 0.7),
      context.size * 0.11, `anchor-axis-${index}`));
}

function addDiagnostic(context) {
  addMesh(context.group, new THREE.IcosahedronGeometry(context.size * 0.48, 0),
    nextMaterial(context), context.origin, null, context.pickTarget, 'diagnostic-restraint');
}

function addContactMarker(context, value, role) {
  if (!value) return;
  const center = point(value, 'CONTACT_POINT_INVALID', context.fail);
  addMesh(context.group, new THREE.SphereGeometry(
    context.size * 0.16, context.radialSegments,
    Math.max(6, Math.floor(context.radialSegments * 0.75)),
  ), nextMaterial(context), center, null, context.pickTarget, role);
}

function addPlate(context, center, normal, width, thickness, role) {
  addMesh(context.group, new THREE.BoxGeometry(width, thickness, width * 0.72),
    nextMaterial(context), center,
    new THREE.Quaternion().setFromUnitVectors(Y_AXIS, normal.clone().normalize()),
    context.pickTarget, role);
}

function addCylinder(context, start, end, radius, role) {
  const vector = end.clone().sub(start);
  const length = vector.length();
  if (!(length > MIN_LENGTH)) context.fail(`${role} axis is degenerate.`, 'GLYPH_AXIS_DEGENERATE');
  addMesh(context.group,
    new THREE.CylinderGeometry(radius, radius, length, context.radialSegments),
    nextMaterial(context), start.clone().add(end).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(Y_AXIS, vector.normalize()),
    context.pickTarget, role);
}

function addRing(context, center, normal, radius, tube, role) {
  addMesh(context.group, new THREE.TorusGeometry(radius, tube,
    Math.max(6, Math.floor(context.radialSegments / 2)), context.radialSegments),
  nextMaterial(context), center,
  new THREE.Quaternion().setFromUnitVectors(Z_AXIS, normal.clone().normalize()),
  context.pickTarget, role);
}

function addMesh(group, geometry, material, position, quaternion, pickTarget, partRole) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = partRole;
  mesh.position.copy(position);
  if (quaternion) mesh.quaternion.copy(quaternion);
  mesh.userData = {
    canonicalId: pickTarget.objectId,
    pickTarget,
    partRole,
    supportId: pickTarget.supportId,
    restraintId: pickTarget.restraintId || '',
    restraintFamily: pickTarget.restraintFamily || '',
  };
  group.add(mesh);
}

function nextMaterial(context) {
  if (!context.materialUsed) {
    context.materialUsed = true;
    return context.material;
  }
  return context.material.clone();
}

function materialFor(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08 });
}

function restraintPick(supportId, restraintId, family, sourcePaths) {
  return {
    objectKind: 'restraint', objectId: restraintId, supportId, restraintId,
    restraintFamily: family,
    sourcePaths: Array.isArray(sourcePaths) ? sourcePaths : [],
  };
}

function requireDirection(context) {
  if (!context.direction) context.fail(
    `${context.family} requires a resolved direction.`, 'RESTRAINT_DIRECTION_MISSING',
  );
  return context.direction;
}

function point(value, code, fail) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
    fail('A finite point is required.', code);
  }
  return new THREE.Vector3(value.x, value.y, value.z);
}

function directionVector(value, fail) {
  const result = point(value, 'RESTRAINT_DIRECTION_INVALID', fail);
  if (!(result.length() > MIN_LENGTH)) {
    fail('A non-zero direction is required.', 'RESTRAINT_DIRECTION_INVALID');
  }
  return result.normalize();
}

function stablePerpendicular(axis) {
  const reference = Math.abs(axis.x) <= Math.abs(axis.y) && Math.abs(axis.x) <= Math.abs(axis.z)
    ? new THREE.Vector3(1, 0, 0)
    : Math.abs(axis.y) <= Math.abs(axis.z)
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3().crossVectors(axis, reference).normalize();
}

function requiredText(value, code, fail) {
  const text = String(value || '').trim();
  if (!text) fail('A non-empty text value is required.', code);
  return text;
}
