import * as THREE from 'three';
import {
  addTopologyEditRestraintGlyph,
  addTopologyEditSupportBody,
} from './topology-edit-support-glyph-primitives.js';

export const TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR = 'TOPOLOGY_EDIT_SUPPORT_GLYPH_INVALID';

export class TopologyEditSupportGlyphError extends Error {
  constructor(message, detailCode) {
    super(`${TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR}: ${message}`);
    this.name = 'TopologyEditSupportGlyphError';
    this.code = TOPOLOGY_EDIT_SUPPORT_GLYPH_ERROR;
    this.detailCode = detailCode;
  }
}

export function materializeTopologyEditSupportOverlay(overlay, options = {}) {
  const supportId = requiredText(overlay?.supportId, 'SUPPORT_ID_MISSING');
  const origin = point(overlay?.origin, 'SUPPORT_ORIGIN_INVALID');
  const markerSize = positive(options.markerSize, 'MARKER_SIZE_INVALID');
  const radialSegments = integerAtLeast(options.radialSegments, 8, 'RADIAL_SEGMENTS_INVALID');
  const group = new THREE.Group();
  group.name = `topology-edit-support:${supportId}`;
  group.userData = {
    supportId,
    supportStatus: requiredText(overlay.status || 'UNRESOLVED', 'SUPPORT_STATUS_MISSING'),
  };

  addTopologyEditSupportBody({ group, origin, markerSize, radialSegments, supportId });
  const restraints = [...(overlay.restraints || [])]
    .sort((left, right) => compareCodeUnits(left?.restraintId, right?.restraintId));
  for (const restraint of restraints) {
    addTopologyEditRestraintGlyph({
      group, origin, markerSize, radialSegments, supportId, restraint,
      fail,
    });
  }

  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  if (bounds.isEmpty() || !finiteBox(bounds)) {
    fail('Support glyph produced invalid bounds.', 'BOUNDS_INVALID');
  }
  return { object: group, bounds };
}

function point(value, code) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
    fail('A finite point is required.', code);
  }
  return new THREE.Vector3(value.x, value.y, value.z);
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    fail('A positive finite value is required.', code);
  }
  return number;
}

function integerAtLeast(value, minimum, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    fail(`An integer of at least ${minimum} is required.`, code);
  }
  return number;
}

function requiredText(value, code) {
  const text = String(value || '').trim();
  if (!text) fail('A non-empty text value is required.', code);
  return text;
}

function finiteBox(box) {
  return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]
    .every(Number.isFinite);
}

function compareCodeUnits(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(message, code) {
  throw new TopologyEditSupportGlyphError(message, code);
}
