import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  projectSupportLoadViewportCallouts,
} from '../src/workspace/support-load-viewport-callout-projection.js';
import {
  ThreeSupportLoadCalloutLayer,
} from '../src/workspace/three-support-load-callout-layer.js';

test('[SIMULATED] exact support identity projects one unchanged empirical callout', () => {
  const dataset = {
    datasetId: 'SIMULATED-P7',
    entities: [{ entityId: 'SUPPORT-PRIMARY-1', category: 'support' }],
  };
  const supportSiteModel = {
    sites: [{ siteId: 'SITE-1', primaryEntityId: 'SUPPORT-PRIMARY-1' }],
  };
  const before = JSON.stringify({ dataset, supportSiteModel });
  const rows = projectSupportLoadViewportCallouts({
    dataset,
    supportSiteModel,
    presenter: {
      getResultCallouts(entity) {
        assert.equal(entity, dataset.entities[0]);
        return [{
          label: 'Vertical=12.500kN',
          forceN: 12500,
          forcekN: 12.5,
          direction: 'V',
          resultKind: 'EMPIRICAL_SUPPORT_REACTION',
        }];
      },
    },
  });

  assert.deepEqual(rows, [{
    schema: 'support-load-viewport-callout/v1',
    siteId: 'SITE-1',
    objectId: 'SUPPORT-PRIMARY-1',
    label: 'Vertical=12.500kN',
    forceN: 12500,
    forcekN: 12.5,
    direction: 'V',
    resultKind: 'EMPIRICAL_SUPPORT_REACTION',
  }]);
  assert.equal(Object.isFrozen(rows), true);
  assert.equal(Object.isFrozen(rows[0]), true);
  assert.equal(JSON.stringify({ dataset, supportSiteModel }), before);
});

test('[SIMULATED] projection suppresses non-empirical presenter outcomes and fails closed on identity ambiguity', () => {
  const dataset = {
    datasetId: 'SIMULATED-P7',
    entities: [{ entityId: 'SUPPORT-PRIMARY-1' }],
  };
  const supportSiteModel = {
    sites: [{ siteId: 'SITE-1', primaryEntityId: 'SUPPORT-PRIMARY-1' }],
  };
  const rows = projectSupportLoadViewportCallouts({
    dataset,
    supportSiteModel,
    presenter: {
      getResultCallouts() {
        return [{
          label: 'Vertical=15.000kN',
          forceN: 15000,
          forcekN: 15,
          direction: 'V',
          resultKind: 'QUALIFIED_LFEA_REACTION',
        }];
      },
    },
  });
  assert.deepEqual(rows, []);

  assert.throws(
    () => projectSupportLoadViewportCallouts({
      dataset,
      supportSiteModel: {
        sites: [{ siteId: 'SITE-MISSING', primaryEntityId: 'MISSING' }],
      },
      presenter: { getResultCallouts() { return []; } },
    }),
    (error) => error.code === 'SUPPORT_LOAD_SITE_IDENTITY_MISMATCH',
  );
  assert.throws(
    () => projectSupportLoadViewportCallouts({
      dataset: { ...dataset, entities: [...dataset.entities, ...dataset.entities] },
      supportSiteModel,
      presenter: { getResultCallouts() { return []; } },
    }),
    (error) => error.code === 'NON_FEA_PRESENTATION_DUPLICATE_ENTITY_ID',
  );
});

test('[SIMULATED] perspective and orthographic projection update one exact DOM label', () => {
  const documentRef = new FakeDocument();
  const host = documentRef.createHost(800, 400);
  const canvas = documentRef.createElement('canvas');
  host.append(canvas);
  const layer = new ThreeSupportLoadCalloutLayer();
  layer.mount(host);
  const support = supportObject(2, 0, 0);
  const objects = new Map([['SUPPORT-PRIMARY-1', [support]]]);
  const row = callout();

  const perspective = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
  perspective.position.set(0, 0, 10);
  perspective.lookAt(0, 0, 0);
  perspective.updateMatrixWorld(true);
  layer.update([row], { camera: perspective, objects });
  const node = layer.nodes.get('SITE-1');
  const perspectiveLeft = node.style.left;
  assert.equal(node.textContent, 'Vertical=12.500kN');
  assert.equal(node.hidden, false);
  assert.equal(node.dataset.supportLoadObjectId, 'SUPPORT-PRIMARY-1');
  assert.equal(node.attributes.get('aria-label'), 'Support SITE-1: Vertical=12.500kN');
  assert.equal(host.children[0], canvas);
  assert.equal(host.children[1], layer.root);
  assert.equal(documentRef.createdTags.filter((tag) => tag === 'CANVAS').length, 1);

  const orthographic = new THREE.OrthographicCamera(-20, 20, 10, -10, 0.1, 100);
  orthographic.position.set(0, 0, 10);
  orthographic.lookAt(0, 0, 0);
  orthographic.updateMatrixWorld(true);
  layer.update([row], { camera: orthographic, objects });
  assert.notEqual(node.style.left, perspectiveLeft);
  assert.equal(layer.nodes.size, 1);
  assert.equal(host.dataset.supportLoadCalloutCount, '1');

  layer.update([{ ...row, label: 'Vertical=13.000kN', forceN: 13000, forcekN: 13 }], {
    camera: orthographic,
    objects,
  });
  assert.equal(layer.nodes.size, 1);
  assert.equal(layer.nodes.get('SITE-1'), node);
  assert.equal(node.textContent, 'Vertical=13.000kN');
});

test('[SIMULATED] missing, ambiguous, behind-camera, off-screen and non-finite anchors hide', () => {
  const documentRef = new FakeDocument();
  const host = documentRef.createHost(640, 480);
  const layer = new ThreeSupportLoadCalloutLayer();
  layer.mount(host);
  const camera = new THREE.PerspectiveCamera(45, 640 / 480, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const row = callout();

  layer.update([row], { camera, objects: new Map() });
  assert.equal(layer.nodes.get('SITE-1').hidden, true);

  const exact = supportObject(0, 0, 0);
  layer.update([row], {
    camera,
    objects: new Map([['SUPPORT-PRIMARY-1', [exact, exact.clone()]]]),
  });
  assert.equal(layer.nodes.get('SITE-1').hidden, true);

  layer.update([row], {
    camera,
    objects: new Map([['SUPPORT-PRIMARY-1', [supportObject(0, 0, 20)]]]),
  });
  assert.equal(layer.nodes.get('SITE-1').hidden, true);

  layer.update([row], {
    camera,
    objects: new Map([['SUPPORT-PRIMARY-1', [supportObject(1000, 0, 0)]]]),
  });
  assert.equal(layer.nodes.get('SITE-1').hidden, true);

  layer.update([row], {
    camera,
    objects: new Map([['SUPPORT-PRIMARY-1', [supportObject(Number.NaN, 0, 0)]]]),
  });
  assert.equal(layer.nodes.get('SITE-1').hidden, true);
});

test('[SIMULATED] callout lifecycle leaves Three objects, groups, bounds and canvas ownership unchanged', () => {
  const documentRef = new FakeDocument();
  const host = documentRef.createHost(640, 480);
  const canvas = documentRef.createElement('canvas');
  host.append(canvas);
  const layer = new ThreeSupportLoadCalloutLayer();
  layer.mount(host);
  const root = layer.root;
  const support = supportObject(0, 0, 0);
  const objects = new Map([['SUPPORT-PRIMARY-1', [support]]]);
  const group = new THREE.Group();
  group.add(support);
  const sceneBounds = new THREE.Box3().setFromObject(group);
  const beforeBounds = {
    min: sceneBounds.min.toArray(),
    max: sceneBounds.max.toArray(),
  };
  const camera = new THREE.PerspectiveCamera(45, 640 / 480, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  layer.update([callout()], { camera, objects });
  assert.equal(objects.size, 1);
  assert.equal(group.children.length, 1);
  assert.deepEqual(sceneBounds.min.toArray(), beforeBounds.min);
  assert.deepEqual(sceneBounds.max.toArray(), beforeBounds.max);
  assert.equal(host.children.filter((node) => node.tagName === 'CANVAS').length, 1);

  layer.clear();
  layer.clear();
  assert.equal(layer.nodes.size, 0);
  assert.equal(host.dataset.supportLoadCalloutCount, '0');
  assert.equal(objects.size, 1);
  assert.equal(group.children.length, 1);

  layer.destroy();
  layer.destroy();
  assert.equal(host.children.includes(root), false);
  assert.equal(host.children.filter((node) => node.tagName === 'CANVAS').length, 1);
});

function callout() {
  return {
    schema: 'support-load-viewport-callout/v1',
    siteId: 'SITE-1',
    objectId: 'SUPPORT-PRIMARY-1',
    label: 'Vertical=12.500kN',
    forceN: 12500,
    forcekN: 12.5,
    direction: 'V',
    resultKind: 'EMPIRICAL_SUPPORT_REACTION',
  };
}

function supportObject(x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

class FakeDocument {
  constructor() { this.createdTags = []; }
  createElement(tagName) {
    const node = new FakeElement(tagName, this);
    this.createdTags.push(node.tagName);
    return node;
  }
  createHost(width, height) {
    const host = this.createElement('div');
    host.clientWidth = width;
    host.clientHeight = height;
    return host;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.clientWidth = 0;
    this.clientHeight = 0;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children.forEach((node) => { node.parentNode = null; });
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}
