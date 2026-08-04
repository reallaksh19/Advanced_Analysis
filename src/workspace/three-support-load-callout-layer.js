import * as THREE from 'three';
import {
  SUPPORT_LOAD_VIEWPORT_CALLOUT_SCHEMA,
} from './support-load-viewport-callout-projection.js';
import { resolveUniqueThreeEntityObject } from './three-viewport-scene.js';

/**
 * Pointer-transparent DOM presentation for qualified support-load callouts.
 * It owns no Three objects, listeners, animation frame, engineering state, or
 * calculation logic.
 */
export class ThreeSupportLoadCalloutLayer {
  constructor() {
    this.hostElement = null;
    this.root = null;
    this.nodes = new Map();
    this.worldPosition = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
    this.projectedPosition = new THREE.Vector3();
  }

  mount(hostElement) {
    if (!hostElement?.ownerDocument?.createElement) {
      fail('Callout layer requires a DOM host.',
        'NON_FEA_PRESENTATION_CALLOUT_HOST_INVALID');
    }
    if (this.root) {
      fail('Callout layer is already mounted.',
        'SUPPORT_LOAD_CALLOUT_ALREADY_MOUNTED');
    }
    this.hostElement = hostElement;
    this.root = hostElement.ownerDocument.createElement('div');
    this.root.className = 'three-support-load-callouts';
    this.root.dataset.supportLoadCalloutLayer = 'true';
    this.root.setAttribute('aria-label', 'Qualified support load callouts');
    this.root.setAttribute('aria-live', 'polite');
    hostElement.append(this.root);
  }

  update(rows, backend) {
    if (!this.root || !this.hostElement) {
      fail('Callout layer must be mounted before update.',
        'NON_FEA_PRESENTATION_CALLOUT_NOT_MOUNTED');
    }
    if (!Array.isArray(rows)) {
      fail('Callout rows must be an array.',
        'NON_FEA_PRESENTATION_CALLOUT_ROWS_INVALID');
    }
    const ordered = [...rows].sort(compareRows);
    const seen = new Set();
    const retained = new Map();

    for (const row of ordered) {
      validateRow(row);
      if (seen.has(row.siteId)) {
        fail('Duplicate support callout site identity.',
          'NON_FEA_PRESENTATION_DUPLICATE_CALLOUT_SITE', { siteId: row.siteId });
      }
      seen.add(row.siteId);
      const node = this.nodes.get(row.siteId) || this.createNode(row);
      this.updateNode(node, row);
      this.positionNode(node, row, backend);
      this.root.append(node);
      retained.set(row.siteId, node);
    }

    for (const [siteId, node] of this.nodes) {
      if (!retained.has(siteId)) node.remove();
    }
    this.nodes = retained;
    this.hostElement.dataset.supportLoadCalloutCount = String(this.nodes.size);
  }

  createNode(row) {
    const node = this.hostElement.ownerDocument.createElement('div');
    node.className = 'three-support-load-callout';
    node.dataset.supportLoadCallout = row.siteId;
    return node;
  }

  updateNode(node, row) {
    node.dataset.supportLoadCallout = row.siteId;
    node.dataset.supportLoadObjectId = row.objectId;
    node.dataset.supportLoadResultKind = row.resultKind;
    node.textContent = row.label;
    node.setAttribute('aria-label', `Support ${row.siteId}: ${row.label}`);
  }

  positionNode(node, row, backend) {
    const width = Number(this.hostElement.clientWidth);
    const height = Number(this.hostElement.clientHeight);
    const camera = backend?.camera;
    const anchor = resolveUniqueThreeEntityObject(backend, row.objectId);
    if (!(width > 0) || !(height > 0) || !camera || !anchor
      || !Number.isFinite(row.forceN) || !Number.isFinite(row.forcekN)) {
      hide(node);
      return;
    }

    anchor.updateWorldMatrix?.(true, false);
    anchor.getWorldPosition(this.worldPosition);
    camera.updateMatrixWorld?.(true);
    this.cameraPosition.copy(this.worldPosition).applyMatrix4(camera.matrixWorldInverse);
    this.projectedPosition.copy(this.worldPosition).project(camera);

    const values = [
      this.worldPosition.x, this.worldPosition.y, this.worldPosition.z,
      this.cameraPosition.x, this.cameraPosition.y, this.cameraPosition.z,
      this.projectedPosition.x, this.projectedPosition.y, this.projectedPosition.z,
    ];
    const behindPerspectiveCamera = camera.isPerspectiveCamera
      && this.cameraPosition.z >= 0;
    const outsideNdc = this.projectedPosition.x < -1
      || this.projectedPosition.x > 1
      || this.projectedPosition.y < -1
      || this.projectedPosition.y > 1
      || this.projectedPosition.z < -1
      || this.projectedPosition.z > 1;
    if (values.some((value) => !Number.isFinite(value))
      || behindPerspectiveCamera || outsideNdc) {
      hide(node);
      return;
    }

    node.hidden = false;
    node.style.display = '';
    node.style.left = `${(this.projectedPosition.x + 1) * width / 2}px`;
    node.style.top = `${(1 - this.projectedPosition.y) * height / 2}px`;
  }

  clear() {
    this.nodes.forEach((node) => node.remove());
    this.nodes.clear();
    this.root?.replaceChildren();
    if (this.hostElement) this.hostElement.dataset.supportLoadCalloutCount = '0';
  }

  destroy() {
    this.clear();
    this.root?.remove();
    if (this.hostElement) delete this.hostElement.dataset.supportLoadCalloutCount;
    this.root = null;
    this.hostElement = null;
  }
}

function validateRow(row) {
  if (row?.schema !== SUPPORT_LOAD_VIEWPORT_CALLOUT_SCHEMA
    || typeof row.siteId !== 'string' || row.siteId.length === 0
    || typeof row.objectId !== 'string' || row.objectId.length === 0
    || typeof row.label !== 'string' || row.label.length === 0
    || row.resultKind !== 'EMPIRICAL_SUPPORT_REACTION'
    || row.direction !== 'V') {
    fail('Unsupported support-load callout row.',
      'NON_FEA_PRESENTATION_CALLOUT_ROW_INVALID');
  }
}

function hide(node) {
  node.hidden = true;
  node.style.display = 'none';
  node.style.left = '';
  node.style.top = '';
}

function compareRows(left, right) {
  return compareCodeUnits(left?.siteId, right?.siteId)
    || compareCodeUnits(left?.objectId, right?.objectId);
}

function compareCodeUnits(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(message, code, details = null) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.details = details;
  throw error;
}
