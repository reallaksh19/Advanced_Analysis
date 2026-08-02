import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { TopologyEditCanvasCallout } from '../src/workspace/topology-edit/topology-edit-canvas-callout.js';
import {
  buildTopologyEditIssueOverlay,
  topologyEditIssueTargetIds,
} from '../src/workspace/topology-edit/topology-edit-issue-overlay.js';
import {
  TopologyEditIssueRenderer,
  issueMarkerPickTarget,
  issueSeverityStyle,
} from '../src/workspace/topology-edit/topology-edit-issue-renderer.js';

const canonical = Object.freeze({
  canonicalTopologyHash: 'canonical-hash-a',
  nodes: Object.freeze([
    Object.freeze({ id: 'N1', position: Object.freeze({ x: 0, y: 0, z: 0 }) }),
    Object.freeze({ id: 'N2', position: Object.freeze({ x: 10, y: 0, z: 0 }) }),
    Object.freeze({ id: 'N3', position: Object.freeze({ x: 10, y: 10, z: 0 }) }),
  ]),
  edges: Object.freeze([
    Object.freeze({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2' }),
    Object.freeze({ id: 'E2', fromNodeId: 'N2', toNodeId: 'N3' }),
  ]),
  junctions: Object.freeze([
    Object.freeze({ id: 'J1', nodeIds: Object.freeze(['N2', 'N3']) }),
  ]),
  supports: Object.freeze([
    Object.freeze({ id: 'S1', position: Object.freeze({ x: 5, y: 5, z: 2 }) }),
  ]),
  rigids: Object.freeze([
    Object.freeze({ id: 'R1', nodeIds: Object.freeze(['N1', 'N3']) }),
  ]),
});

const issues = Object.freeze([
  issue('issue:node', 'ORPHAN_NODE', 'HIGH', { nodeIds: ['N1'] }),
  issue('issue:edge', 'SHORT_ELEMENT', 'MEDIUM', { edgeIds: ['E1'], distanceMm: 10 }),
  issue('issue:junction', 'MULTIWAY_WITHOUT_JUNCTION', 'HIGH', { junctionId: 'J1' }),
  issue('issue:support', 'ORPHAN_SUPPORT', 'MEDIUM', { supportId: 'S1' }),
  issue('issue:rigid', 'ORPHAN_RIGID', 'LOW', { rigidId: 'R1' }),
  issue('issue:missing', 'ORPHAN_SUPPORT', 'LOW', { supportId: 'MISSING' }),
]);

const suggestions = Object.freeze([
  Object.freeze({
    issueId: 'issue:node',
    suggestionHash: 'suggestion-hash-1',
    commandType: 'MOVE_NODE',
  }),
]);

test('issue overlay is deterministic and anchors every supported target family', () => {
  const first = buildTopologyEditIssueOverlay({
    canonicalTopology: canonical,
    issues,
    suggestions,
  });
  const reordered = buildTopologyEditIssueOverlay({
    canonicalTopology: {
      ...canonical,
      nodes: [...canonical.nodes].reverse(),
      edges: [...canonical.edges].reverse(),
      junctions: [...canonical.junctions].reverse(),
      supports: [...canonical.supports].reverse(),
      rigids: [...canonical.rigids].reverse(),
    },
    issues: [...issues].reverse(),
    suggestions: [...suggestions].reverse(),
  });
  assert.equal(first.overlayHash, reordered.overlayHash);
  assert.equal(first.anchoredIssueCount, 5);
  assert.deepEqual(first.unanchoredIssueIds, ['issue:missing']);
  assert.deepEqual(entry(first, 'issue:node').position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(entry(first, 'issue:edge').position, { x: 5, y: 0, z: 0 });
  assert.deepEqual(entry(first, 'issue:junction').position, { x: 10, y: 5, z: 0 });
  assert.deepEqual(entry(first, 'issue:support').position, { x: 5, y: 5, z: 2 });
  assert.deepEqual(entry(first, 'issue:rigid').position, { x: 5, y: 5, z: 0 });
  assert.equal(entry(first, 'issue:node').suggestionHash, 'suggestion-hash-1');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.entries), true);
});

test('issue target IDs are explicit, sorted, and never inferred by proximity', () => {
  assert.deepEqual(
    topologyEditIssueTargetIds({
      nodeIds: ['N2', 'N1'],
      edgeIds: ['E2', 'E1'],
      supportId: 'S1',
      restraintId: 'RS1',
    }),
    ['E1', 'E2', 'N1', 'N2', 'RS1', 'S1'],
  );
  assert.deepEqual(topologyEditIssueTargetIds({ message: 'no identity' }), []);
});

test('issue renderer publishes exact immutable issue picks and severity style', () => {
  const overlay = buildTopologyEditIssueOverlay({
    canonicalTopology: canonical,
    issues,
    suggestions,
  });
  const group = new THREE.Group();
  const renderer = new TopologyEditIssueRenderer(group);
  const bounds = new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(100, 50, 20),
  );
  assert.equal(renderer.render(overlay, bounds), 5);
  assert.equal(group.children.length, 5);
  const marker = group.children.find((row) => row.userData.issueId === 'issue:node');
  assert.ok(marker);
  assert.equal(marker.userData.pickTarget.objectKind, 'issue');
  assert.equal(marker.userData.pickTarget.objectId, 'issue:node');
  assert.equal(marker.userData.pickTarget.partRole, 'TOPOLOGY_REVIEW_ISSUE');
  assert.equal(marker.material.color.getHex(), issueSeverityStyle('HIGH').color);
  assert.equal(group.userData.issueOverlayHash, overlay.overlayHash);
  assert.deepEqual(issueMarkerPickTarget(entry(overlay, 'issue:edge')).workspaceEntityIds, []);
  renderer.clear();
  assert.equal(group.children.length, 0);
  assert.equal(group.userData.issueCount, 0);
});

test('accessible callout exposes only exact fly-to and certified suggestion actions', () => {
  const documentRef = new FakeDocument();
  const container = new FakeElement('div', documentRef);
  container.rect = { left: 100, top: 50, width: 800, height: 500 };
  const callout = new TopologyEditCanvasCallout(container);
  const overlay = buildTopologyEditIssueOverlay({
    canonicalTopology: canonical,
    issues,
    suggestions,
  });
  let previewed = null;
  let focused = null;
  const card = callout.showIssue({
    entry: entry(overlay, 'issue:node'),
    screenX: 400,
    screenY: 250,
    onPreviewFix: (value) => { previewed = value.issueId; },
    onFlyTo: (value) => { focused = value.canonicalIds; },
  });
  assert.equal(card.attributes.role, 'dialog');
  assert.equal(card.dataset.issueId, 'issue:node');
  assert.equal(card.style.pointerEvents, 'auto');
  assert.ok(findAction(card, 'preview-callout-fix'));
  findAction(card, 'flyto-callout').dispatch('click');
  assert.deepEqual(focused, ['N1']);
  findAction(card, 'preview-callout-fix').dispatch('click');
  assert.equal(previewed, 'issue:node');
  assert.equal(container.children.length, 0);

  const withoutFix = callout.showIssue({
    entry: entry(overlay, 'issue:support'),
  });
  assert.equal(findAction(withoutFix, 'preview-callout-fix'), null);
  callout.destroy();
  assert.equal(container.children.length, 0);
});

test('production composition retains exact authority boundaries', async () => {
  const controller = await source('../src/workspace/topology-edit-3d-issue-controller.js');
  const consumer = await source('../src/workspace/load-calc-consumer-controller.js');
  const viewport = await source('../src/workspace/topology-edit/topology-edit-viewport-backend.js');
  assert.match(controller, /buildTopologyEditIssueOverlay/);
  assert.match(controller, /focusTopologyEditCanonicalIds/);
  assert.match(controller, /previewAutofix\(suggestion\.suggestionHash\)/);
  assert.match(controller, /data-show-topology-issue/);
  assert.doesNotMatch(controller, /createTopologyEditCommandIntent/);
  assert.doesNotMatch(controller, /WorkspaceState\.(loadDataset|clearDataset)/);
  assert.match(consumer, /topology-edit-3d-issue-controller\.js/);
  assert.match(viewport, /TopologyEditIssueRenderer/);
  assert.match(viewport, /renderIssues\(overlay\)/);
});

function issue(id, kind, severity, targets = {}) {
  return Object.freeze({
    id,
    kind,
    severity,
    message: `${kind} message`,
    nodeIds: Object.freeze([...(targets.nodeIds ?? [])]),
    edgeIds: Object.freeze([...(targets.edgeIds ?? [])]),
    edgeId: targets.edgeId ?? null,
    junctionId: targets.junctionId ?? null,
    supportId: targets.supportId ?? null,
    restraintId: targets.restraintId ?? null,
    rigidId: targets.rigidId ?? null,
    distanceMm: targets.distanceMm ?? null,
    angleDeg: targets.angleDeg ?? null,
  });
}

function entry(overlay, issueId) {
  const value = overlay.entries.find((row) => row.issueId === issueId);
  assert.ok(value, `Missing overlay entry ${issueId}.`);
  return value;
}

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

function findAction(root, action) {
  if (root.dataset?.action === action) return root;
  for (const child of root.children ?? []) {
    const found = findAction(child, action);
    if (found) return found;
  }
  return null;
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = '';
    this.className = '';
    this.disabled = false;
    this.rect = { left: 0, top: 0, width: 800, height: 600 };
  }
  append(...children) { children.forEach((child) => this.attach(child)); }
  prepend(...children) {
    [...children].reverse().forEach((child) => {
      child.parentElement = this;
      this.children.unshift(child);
    });
  }
  attach(child) { child.parentElement = this; this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type) { this.listeners.get(type)?.({ target: this }); }
  getBoundingClientRect() { return this.rect; }
  focus() { this.focused = true; }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children
      .filter((child) => child !== this);
    this.parentElement = null;
  }
}
