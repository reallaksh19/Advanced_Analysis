import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_REVIEW_BOOKMARK_SCHEMA = 'TopologyEditReviewBookmark.v1';
export const TOPOLOGY_EDIT_REVIEW_STORE_SCHEMA = 'TopologyEditReviewStore.v1';

export class TopologyEditReviewStore {
  constructor() {
    this.records = [];
    this.nextSequence = 1;
  }

  save(input = {}) {
    const record = createTopologyEditReviewBookmark({
      ...input,
      sequence: this.nextSequence,
    });
    this.nextSequence += 1;
    this.records = [...this.records, record];
    return record;
  }

  list() {
    return Object.freeze([...this.records]);
  }

  remove(bookmarkId) {
    const id = requiredText(bookmarkId, 'bookmarkId');
    const before = this.records.length;
    this.records = this.records.filter((record) => record.bookmarkId !== id);
    return this.records.length !== before;
  }

  resolve(bookmarkId, currentBasis) {
    const record = this.records.find((row) => row.bookmarkId === bookmarkId);
    if (!record) return deepFreeze({ status: 'NOT_FOUND', record: null });
    assertTopologyEditReviewBookmark(record);
    const status = classifyReviewBasis(record.basis, currentBasis);
    return deepFreeze({ status, record });
  }

  clear() {
    this.records = [];
    this.nextSequence = 1;
  }
}

export function createTopologyEditReviewBookmark(input = {}) {
  const payload = deepFreeze({
    schema: TOPOLOGY_EDIT_REVIEW_BOOKMARK_SCHEMA,
    sequence: positiveInteger(input.sequence, 'sequence'),
    title: requiredText(input.title, 'title'),
    note: optionalText(input.note),
    basis: normalizeBasis(input.basis),
    camera: normalizeCamera(input.camera),
    presentationState: cloneFrozen(input.presentationState, 'presentationState'),
    selection: cloneFrozen(input.selection, 'selection'),
    provenance: cloneFrozen(input.provenance, 'provenance'),
    authority: 'SESSION_ONLY_REVIEW_ARTIFACT',
    disclosure: 'Review bookmarks are session-only display artifacts. They do not modify topology, command, persistence, export, commit, calculation, or release authority.',
  });
  const bookmarkId = semanticHash({ ...payload, presentationHash: payload.presentationState?.presentationHash ?? null, provenanceHash: payload.provenance?.provenanceHash ?? null });
  return deepFreeze({ ...payload, bookmarkId });
}

export function assertTopologyEditReviewBookmark(value) {
  if (value?.schema !== TOPOLOGY_EDIT_REVIEW_BOOKMARK_SCHEMA) {
    throw new TypeError(`Review bookmark must use ${TOPOLOGY_EDIT_REVIEW_BOOKMARK_SCHEMA}.`);
  }
  const rebuilt = createTopologyEditReviewBookmark(value);
  if (rebuilt.bookmarkId !== value.bookmarkId) {
    throw new Error('TopologyEditReviewBookmark: bookmark hash mismatch.');
  }
  return value;
}

export function classifyReviewBasis(savedBasis, currentBasis) {
  const saved = normalizeBasis(savedBasis);
  const current = normalizeBasis(currentBasis);
  if (Object.values(current).some((value) => value === null)) return 'INCOMPLETE_BASIS';
  return Object.keys(saved).every((key) => saved[key] === current[key])
    ? 'CURRENT'
    : 'STALE_BASIS';
}

export function captureTopologyEditCamera(camera) {
  if (!camera?.position || !camera?.quaternion || !camera?.up) {
    throw new TypeError('A mounted topology-edit camera is required.');
  }
  return deepFreeze({
    projection: camera.isOrthographicCamera ? 'ORTHOGRAPHIC' : 'PERSPECTIVE',
    position: vector(camera.position),
    quaternion: quaternion(camera.quaternion),
    up: vector(camera.up),
    near: finite(camera.near, 'near'),
    far: finite(camera.far, 'far'),
    zoom: finite(camera.zoom ?? 1, 'zoom'),
    fov: camera.isPerspectiveCamera ? finite(camera.fov, 'fov') : null,
  });
}

export function restoreTopologyEditCamera(camera, snapshot) {
  const value = normalizeCamera(snapshot);
  if (!camera?.position?.set || !camera?.quaternion?.set || !camera?.up?.set) {
    throw new TypeError('A mutable topology-edit camera is required.');
  }
  camera.position.set(value.position.x, value.position.y, value.position.z);
  camera.quaternion.set(value.quaternion.x, value.quaternion.y, value.quaternion.z, value.quaternion.w);
  camera.up.set(value.up.x, value.up.y, value.up.z);
  camera.near = value.near;
  camera.far = value.far;
  camera.zoom = value.zoom;
  if (value.fov !== null && camera.isPerspectiveCamera) camera.fov = value.fov;
  camera.updateProjectionMatrix?.();
  return value;
}

function normalizeBasis(input = {}) {
  return deepFreeze({
    sourceHash: optionalText(input.sourceHash),
    baseCanonicalHash: optionalText(input.baseCanonicalHash),
    draftCanonicalHash: optionalText(input.draftCanonicalHash),
    visualModelHash: optionalText(input.visualModelHash),
    scopeHash: optionalText(input.scopeHash),
  });
}

function normalizeCamera(input = {}) {
  return deepFreeze({
    projection: requiredEnum(input.projection, ['PERSPECTIVE', 'ORTHOGRAPHIC'], 'projection'),
    position: point(input.position, 'position'),
    quaternion: quaternion(input.quaternion),
    up: point(input.up, 'up'),
    near: finite(input.near, 'near'),
    far: finite(input.far, 'far'),
    zoom: finite(input.zoom, 'zoom'),
    fov: input.fov === null ? null : finite(input.fov, 'fov'),
  });
}

function cloneFrozen(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} is required.`);
  return deepFreeze(structuredClone(value));
}

function vector(value) { return point(value, 'vector'); }
function point(value, name) {
  if (!value || ![value.x, value.y, value.z].every((item) => Number.isFinite(Number(item)))) {
    throw new TypeError(`${name} must be a finite 3D point.`);
  }
  return deepFreeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) });
}
function quaternion(value) {
  if (!value || ![value.x, value.y, value.z, value.w].every((item) => Number.isFinite(Number(item)))) {
    throw new TypeError('quaternion must be finite.');
  }
  return deepFreeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z), w: Number(value.w) });
}
function requiredEnum(value, allowed, name) {
  const text = requiredText(value, name).toUpperCase();
  if (!allowed.includes(text)) throw new RangeError(`${name} is unsupported.`);
  return text;
}
function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be finite.`);
  return number;
}
function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${name} must be a positive integer.`);
  return number;
}
function requiredText(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${name} is required.`);
  return text;
}
function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}
