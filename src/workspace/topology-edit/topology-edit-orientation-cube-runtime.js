import {
  assertTopologyEditOrientationSnapshot,
  topologyEditOrientationFaceManifest,
  TOPOLOGY_EDIT_ORIENTATION_ERROR,
} from './topology-edit-orientation-contract.js';
import { resolveTopologyEditNavigationAction } from './topology-edit-navigation-routing.js';

const CONTROL_SELECTOR = '[data-orientation-action]';

export class TopologyEditOrientationCubeRuntime {
  constructor() {
    this.host = null;
    this.root = null;
    this.cube = null;
    this.status = null;
    this.destroyed = false;
    this.keyHandler = (event) => this.handleKey(event);
  }

  mount(host) {
    if (this.destroyed) {
      throw runtimeError('Destroyed orientation cube cannot be remounted.', 'RUNTIME_DESTROYED');
    }
    if (!host?.ownerDocument?.createElement || typeof host.append !== 'function') {
      throw runtimeError('Orientation cube requires a DOM mount host.', 'MOUNT_HOST_INVALID');
    }
    if (this.root) throw runtimeError('Orientation cube is already mounted.', 'RUNTIME_ALREADY_MOUNTED');
    const documentRef = host.ownerDocument;
    const root = documentRef.createElement('aside');
    root.className = 'topology-edit-orientation-cube';
    root.dataset.role = 'topology-edit-orientation-cube';
    root.setAttribute('aria-label', 'Viewport orientation');
    root.innerHTML = orientationMarkup();
    root.addEventListener('keydown', this.keyHandler);
    host.append(root);
    this.host = host;
    this.root = root;
    this.cube = root.querySelector('[data-role="orientation-cube-body"]');
    this.status = root.querySelector('[data-role="orientation-status"]');
    if (!this.cube || !this.status) {
      this.destroy();
      throw runtimeError('Orientation cube DOM contract is incomplete.', 'DOM_CONTRACT_INVALID');
    }
  }

  update(snapshotInput) {
    if (this.destroyed) throw runtimeError('Destroyed orientation cube cannot update.', 'RUNTIME_DESTROYED');
    if (!this.root || !this.cube || !this.status) {
      throw runtimeError('Orientation cube must be mounted before update.', 'RUNTIME_NOT_MOUNTED');
    }
    const snapshot = assertTopologyEditOrientationSnapshot(snapshotInput);
    this.cube.style.transform = snapshot.cubeTransform;
    this.root.dataset.projection = snapshot.projection.toLowerCase();
    this.root.dataset.nearestFace = snapshot.nearestFace;
    this.status.textContent = `${titleCase(snapshot.projection)} · Engineering Z-up`;
    this.root.querySelectorAll(CONTROL_SELECTOR).forEach((button) => {
      const action = button.dataset.orientationAction;
      const active = action === 'iso'
        ? snapshot.isoActive
        : action === snapshot.activeFace;
      button.setAttribute('aria-pressed', String(active));
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  handleKey(event) {
    if (!this.root || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const controls = [...this.root.querySelectorAll(CONTROL_SELECTOR)].filter((row) => !row.disabled);
    if (!controls.length) return;
    const current = controls.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const backward = ['ArrowLeft', 'ArrowUp'].includes(event.key);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? controls.length - 1
        : (current + (backward ? -1 : 1) + controls.length) % controls.length;
    controls[nextIndex].focus();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root?.removeEventListener('keydown', this.keyHandler);
    this.root?.remove();
    this.root = null;
    this.cube = null;
    this.status = null;
    this.host = null;
  }
}

function orientationMarkup() {
  const identities = new Set();
  const faces = topologyEditOrientationFaceManifest().map((face) => {
    if (identities.has(face.id)) {
      throw runtimeError(`Duplicate orientation face ${face.id}.`, 'FACE_ID_DUPLICATE');
    }
    identities.add(face.id);
    const viewportAction = `view-${face.action}`;
    const intent = resolveTopologyEditNavigationAction(viewportAction);
    if (intent.kind !== 'STANDARD_VIEW' || intent.value !== face.action) {
      throw runtimeError(`Orientation action ${viewportAction} does not resolve exactly.`, 'ACTION_MAPPING_INVALID');
    }
    return `
      <button type="button" class="topology-edit-orientation-cube__face topology-edit-orientation-cube__face--${face.id}"
        data-orientation-action="${face.action}" data-viewport-action="${viewportAction}"
        aria-label="${face.label} view" aria-pressed="false">${face.label}</button>`;
  }).join('');
  const isoIntent = resolveTopologyEditNavigationAction('view-iso');
  if (isoIntent.kind !== 'STANDARD_VIEW' || isoIntent.value !== 'iso') {
    throw runtimeError('Orientation ISO action does not resolve exactly.', 'ACTION_MAPPING_INVALID');
  }
  return `
    <div class="topology-edit-orientation-cube__viewport">
      <div class="topology-edit-orientation-cube__body" data-role="orientation-cube-body">${faces}</div>
    </div>
    <button type="button" class="topology-edit-orientation-cube__iso"
      data-orientation-action="iso" data-viewport-action="view-iso"
      aria-label="Isometric view" aria-pressed="false">ISO</button>
    <output class="topology-edit-orientation-cube__status" data-role="orientation-status">Perspective · Engineering Z-up</output>`;
}

function titleCase(value) {
  const text = String(value).toLowerCase();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function runtimeError(message, detailCode) {
  const error = new Error(`${TOPOLOGY_EDIT_ORIENTATION_ERROR}: ${message}`);
  error.code = TOPOLOGY_EDIT_ORIENTATION_ERROR;
  error.detailCode = detailCode;
  return error;
}
