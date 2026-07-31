#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { triangleSource as continuumFixture } from './lafea.3-fixtures.mjs';
import * as direct from '../src/workspace/lafea-source-workbench-viewport.js';
import * as publicSurface from '../src/workspace/lafea-workbench.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run() {
  assert.equal(
    direct.LAFEA_WORKBENCH_SOURCE_VIEWPORT_SCHEMA,
    'lafea-workbench-source-viewport/v1',
  );
  assert.ok(Object.isFrozen(direct.LAFEA_WORKBENCH_SOURCE_RENDER_POLICY));
  assert.deepEqual(direct.LAFEA_WORKBENCH_SOURCE_RENDER_POLICY, {
    schema: 'LafeaRenderPolicy.v1',
    policyId: 'LAFEA-WORKBENCH-SOURCE-AUTHORING-V1',
    sourceRevision: 1,
    svgMeshLimit: { source: 'U4B_SOURCE_AUTHORING_SVG_ONLY', value: 0 },
    svgFallbackLimit: { source: 'U4B_SOURCE_AUTHORING_SVG_ONLY', value: 0 },
    canvas2dFallbackLimit: { source: 'U4B_SOURCE_AUTHORING_SVG_ONLY', value: 0 },
    allowedFallbackModes: [],
    semanticHash: 'sha256:c14ef58e6431f9f9a312087e4140fd0e28936311bf84ddd22078a56687be53f8',
  });

  const model = direct.createLafeaSourceWorkbenchViewportModel({
    stageId: 'LAFEA.3',
    document: continuumFixture(),
    lifecycle: null,
    lifecycleBinding: null,
    sceneRevision: 7,
  });
  assert.equal(model.schema, direct.LAFEA_WORKBENCH_SOURCE_VIEWPORT_SCHEMA);
  assert.equal(model.scene.sceneRevision, 7);
  assert.equal(model.scene.sourceSemanticHash, null);
  assert.equal(model.scene.topologySemanticHash, null);
  assert.equal(model.scene.meshSemanticHash, null);
  assert.equal(model.scene.recoverySemanticHash, null);
  assert.deepEqual(model.scene.meshReferences, []);
  assert.deepEqual(model.scene.resultFields, []);
  assert.equal(model.request.mode, 'SOURCE_AUTHORING');
  assert.equal(model.request.renderPacket, null);
  assert.equal(model.request.selection.sourceEntityId, null);
  assert.equal(model.viewport.displayOptions.sourceAuthoring, true);
  assert.equal(model.viewport.displayOptions.wireframe, false);
  assert.equal(model.registryEntry.previewSource.nodePath, 'nodes');

  const documentRef = new FakeDocument();
  const root = documentRef.createElement('div');
  const moves = [];
  const selectionChanges = [];
  const mounted = direct.mountLafeaSourceWorkbenchViewport(root, {
    stageId: 'LAFEA.3',
    document: continuumFixture(),
    lifecycle: null,
    lifecycleBinding: null,
    sceneRevision: 11,
    onMoveNode: (...args) => moves.push(args),
    onSelectionChange: (selection) => selectionChanges.push(selection),
  });

  assert.equal(mounted.getRenderer(), 'SVG');
  assert.equal(root.dataset.renderer, 'SVG');
  assert.equal(root.style.minHeight, '440px');
  assert.equal(root.style.height, '440px');
  assert.equal(root.children.length, 3);
  assert.equal(root.children[0].dataset.layer, 'webgl');
  assert.equal(root.children[1].dataset.layer, 'engineering-overlay');
  assert.equal(root.children[2].dataset.layer, 'accessible-inspector');
  assert.equal(mounted.request.renderPacket, null);
  assert.equal(mounted.scene.meshReferences.length, 0);
  assert.equal(mounted.scene.resultFields.length, 0);

  const overlay = root.children[1];
  const nodeGroups = overlay.querySelectorAll('[data-node-id]');
  assert.ok(nodeGroups.length >= 3);
  const nodeBGroup = nodeGroups.find((node) => node.dataset.nodeId === 'B');
  assert.ok(nodeBGroup);
  const nestedSvg = overlay.children[0];
  assert.equal(nestedSvg.getAttribute('role'), 'group');
  assert.equal(nestedSvg.getAttribute('viewBox'), '0 0 760 440');

  const pointB = mounted.scene.sourcePrimitives.find(
    (row) => row.kind === 'SOURCE_POINT' && row.sourceEntityId === 'B',
  );
  const markerB = nodeBGroup.children[0];
  const bounds = mounted.viewport.worldBounds;
  const expectedX = (pointB.coordinates[0].x - bounds.minimum.x)
    * mounted.viewport.cssWidth / (bounds.maximum.x - bounds.minimum.x);
  const expectedY = mounted.viewport.cssHeight
    - (pointB.coordinates[0].y - bounds.minimum.y)
      * mounted.viewport.cssHeight / (bounds.maximum.y - bounds.minimum.y);
  assert.ok(Math.abs(Number(markerB.getAttribute('cx')) - expectedX) < 1e-9);
  assert.ok(Math.abs(Number(markerB.getAttribute('cy')) - expectedY) < 1e-9);

  mounted.selectSource('B');
  assert.equal(mounted.getSelection().sourceEntityId, 'B');
  assert.equal(mounted.getSelection().meshEntityId, null);
  assert.equal(mounted.getSelection().entityRole, 'SOURCE');
  assert.equal(selectionChanges.at(-1).sourceEntityId, 'B');
  assert.match(root.children[2].children[1].textContent, /Selected Entity: B \(SOURCE\)/u);
  assert.ok(
    root.children[1].querySelectorAll('[data-node-id]')
      .some((node) => node.dataset.nodeId === 'B' && node.dataset.selected === 'true'),
  );
  assert.throws(
    () => mounted.selectSource('0'),
    (error) => error?.code === 'LAFEA_SOURCE_SELECTION_ENTITY_NOT_IN_SCENE',
  );
  mounted.clearSelection();
  assert.equal(mounted.getSelection().sourceEntityId, null);
  assert.equal(selectionChanges.at(-1).sourceEntityId, null);

  const currentNodeB = root.children[1].querySelectorAll('[data-node-id]')
    .find((node) => node.dataset.nodeId === 'B');
  currentNodeB.dispatchEvent({ type: 'click' });
  assert.equal(mounted.getSelection().sourceEntityId, 'B');
  assert.deepEqual(moves, []);

  const retainedSelectionModel = direct.createLafeaSourceWorkbenchViewportModel({
    stageId: 'LAFEA.3',
    document: continuumFixture(),
    lifecycle: null,
    lifecycleBinding: null,
    sceneRevision: 11,
    selection: mounted.getSelection(),
  });
  assert.equal(retainedSelectionModel.request.selection.sourceEntityId, 'B');

  const weldModel = direct.createLafeaSourceWorkbenchViewportModel({
    stageId: 'LAFEA.6',
    document: {
      schema: 'lafea-weld-profile-placeholder/v1',
      identity: 'WELD-NOT-IMPLEMENTED',
    },
    sceneRevision: 1,
  });
  assert.equal(weldModel.scene.sourcePrimitives.length, 0);
  assert.equal(weldModel.request.mode, 'SOURCE_AUTHORING');
  assert.equal(weldModel.request.renderPacket, null);

  for (const name of [
    'LAFEA_WORKBENCH_SOURCE_RENDER_POLICY',
    'LAFEA_WORKBENCH_SOURCE_VIEWPORT_SCHEMA',
    'createLafeaSourceWorkbenchViewportModel',
    'mountLafeaSourceWorkbenchViewport',
  ]) {
    assert.equal(publicSurface[name], direct[name], `${name} must be re-exported without wrapping.`);
  }

  const moduleSource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-source-workbench-viewport.js'),
    'utf8',
  );
  const viewSource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-workbench-view.js'),
    'utf8',
  );
  const svgSource = fs.readFileSync(
    path.join(ROOT, 'src/workspace/lafea-workbench-svg.js'),
    'utf8',
  );
  assert.doesNotMatch(moduleSource, /three-mesh-renderer|render-packet-contract|application-templates/u);
  assert.doesNotMatch(moduleSource, /THREE_WEBGL|CANVAS2D_FALLBACK|MESH_WIREFRAME|STRESS_CONTOUR/u);
  assert.match(moduleSource, /isAvailable: \(\) => false/u);
  assert.match(moduleSource, /LAFEA_U4B_WEBGL_RENDER_FORBIDDEN/u);
  assert.match(moduleSource, /onSelectionChange/u);
  assert.match(viewSource, /mountLafeaSourceWorkbenchViewport/u);
  assert.match(viewSource, /nextSceneRevision/u);
  assert.match(viewSource, /sceneDocuments/u);
  assert.match(viewSource, /sceneSelections/u);
  assert.match(viewSource, /sceneSelections\.delete\(stageId\)/u);
  assert.doesNotMatch(viewSource, /lafeaDocumentDigest|sourceSemanticHash\s*=/u);
  assert.doesNotMatch(viewSource, /renderLafeaWorkbenchSvg|lafeaPreviewGeometry/u);
  assert.match(svgSource, /governedViewportTransform/u);
  assert.match(svgSource, /viewport\.worldBounds/u);

  mounted.destroy();
  assert.equal(root.children.length, 0);

  console.log(JSON.stringify({
    check: 'lafea-u4b-live-source-viewport',
    status: 'PASS',
    renderer: 'SVG',
    hybridLayers: 3,
    sharedViewportAuthority: true,
    sourceSelectionAuthority: 'EXACT_SOURCE_ENTITY_ID',
    selectionRetainedWithinSceneRevision: true,
    webglEnabled: false,
    canvas2dEnabled: false,
    meshEvidencePromoted: false,
    resultEvidencePromoted: false,
    lafea6Enabled: false,
  }));
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  createElementNS(_namespace, tagName) {
    return new FakeElement(this, tagName);
  }

  querySelectorAll() {
    return [];
  }

  querySelector() {
    return null;
  }
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.textContent = '';
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      node.parentNode = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') {
      this.classList = new FakeClassList(String(value).split(/\s+/u).filter(Boolean));
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatchEvent(event) {
    const normalized = {
      stopPropagation() {},
      preventDefault() {},
      ...event,
      target: this,
      currentTarget: this,
    };
    for (const listener of this.listeners.get(normalized.type) ?? []) listener(normalized);
    return true;
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (matchesSelector(child, selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 760, height: 440 };
  }

  setPointerCapture() {}

  scrollIntoView() {}
}

class FakeClassList {
  constructor(values = []) {
    this.values = new Set(values);
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }
}

function matchesSelector(node, selector) {
  const match = /^\[data-([a-z-]+)(?:="([^"]*)")?\]$/u.exec(selector);
  if (!match) return false;
  const key = match[1].replace(/-([a-z])/gu, (_whole, letter) => letter.toUpperCase());
  if (!Object.hasOwn(node.dataset, key)) return false;
  return match[2] === undefined || node.dataset[key] === match[2];
}

run();
