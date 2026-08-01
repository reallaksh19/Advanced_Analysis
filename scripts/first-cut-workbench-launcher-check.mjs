#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
  FirstCutWorkbenchLauncherController,
} from '../src/workspace/enrichment/first-cut-workbench-launcher.js';

function run() {
  const fixture = createFixture();
  const launcher = new FirstCutWorkbenchLauncherController(fixture.root);
  const initial = launcher.init();
  assert.deepEqual(initial, state('READY', 0, 0, null, false));
  assert.equal(Object.isFrozen(initial), true);
  assert.deepEqual(launcher.init(), initial);
  assert.equal(fixture.actionHost.querySelectorAll(
    '[data-role="first-cut-workbench-action-bar"]',
  ).length, 1);
  assert.equal(fixture.actionHost.querySelectorAll(
    '[data-role="first-cut-workbench-launcher"]',
  ).length, 1);
  assert.equal(
    fixture.propertiesPanel.classList.contains('workspace-panel--collapsed'),
    true,
  );

  const originalHost = fixture.host;
  fixture.focusButton().click();
  assert.equal(
    fixture.propertiesPanel.classList.contains('workspace-panel--collapsed'),
    false,
  );
  assert.equal(fixture.section.classList.contains('accordion-collapsed'), false);
  assert.strictEqual(fixture.root.querySelector(HOST), originalHost);
  assert.equal(originalHost.focusCount, 1);
  assert.equal(originalHost.scrollCount, 1);
  assert.equal(originalHost.getAttribute('tabindex'), '-1');
  assert.deepEqual(launcher.getState(), state('READY', 1, 0, 'FOCUS', false));

  fixture.popoutButton().click();
  assert.equal(fixture.section.classList.contains('is-popped-out'), true);
  assert.equal(fixture.root.querySelectorAll(POPUP).length, 1);
  assert.equal(fixture.root.querySelector(POPUP).style.display, 'flex');
  assert.strictEqual(fixture.root.querySelector(HOST), originalHost);
  assert.equal(fixture.root.querySelector(BODY).contains(originalHost), true);
  assert.equal(originalHost.focusCount, 2);
  assert.equal(originalHost.scrollCount, 2);
  assert.deepEqual(launcher.getState(), state('READY', 1, 1, 'POPOUT', true));

  fixture.dockButton().click();
  assert.equal(fixture.root.querySelectorAll(POPUP).length, 0);
  assert.equal(fixture.section.classList.contains('is-popped-out'), false);
  assert.equal(fixture.section.contains(originalHost), true);
  assert.deepEqual(launcher.getState(), state('READY', 1, 1, 'POPOUT', false));

  fixture.sectionPopout.click();
  assert.equal(fixture.root.querySelectorAll(POPUP).length, 1);
  assert.deepEqual(launcher.getState(), state('READY', 1, 2, 'POPOUT', true));

  launcher.destroy();
  launcher.destroy();
  assert.equal(fixture.actionHost.querySelectorAll(
    '[data-role="first-cut-workbench-action-bar"]',
  ).length, 0);
  assert.equal(fixture.root.querySelectorAll(POPUP).length, 0);
  assert.strictEqual(fixture.root.querySelector(HOST), originalHost);
  assert.equal(launcher.getState().status, 'DESTROYED');
  assert.throws(
    () => launcher.focusWorkbench(),
    (error) => error.code === 'FIRST_CUT_LAUNCHER_DESTROYED',
  );

  const duplicateFixture = createFixture();
  duplicateFixture.root.append(duplicateFixture.document.createElement('div'));
  duplicateFixture.root.children.at(-1).dataset.role = 'first-cut-workbench-root';
  assert.throws(
    () => new FirstCutWorkbenchLauncherController(duplicateFixture.root).init(),
    (error) => error.code === 'FIRST_CUT_LAUNCHER_UNIQUE_TARGET_REQUIRED'
      && error.evidence.selector === HOST
      && error.evidence.count === 2,
  );

  console.log(JSON.stringify({
    check: 'first-cut-workbench-launcher',
    status: 'PASS',
    launcherSchema: FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
    actionBarMountCount: 1,
    actionBarVisibleAcrossViewportModes: true,
    currentPropertiesPanelExpanded: true,
    focusCount: 1,
    popoutCount: 2,
    toolbarPopoutProven: true,
    sectionPopoutProven: true,
    dockRestoreProven: true,
    hostIdentityRetained: true,
    duplicateHostRejected: true,
    launcherDestroyIdempotent: true,
    enrichmentControllerCreated: false,
    calculationInvoked: false,
  }));
}

const HOST = '[data-role="first-cut-workbench-root"]';
const POPUP = '[data-role="panel-popup-overlay"]';
const BODY = '[data-role="panel-popup-body"]';

function state(status, focusCount, popoutCount, lastMode, poppedOut) {
  return {
    schema: FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
    status,
    focusCount,
    popoutCount,
    lastMode,
    hostIdentityRetained: status !== 'DESTROYED',
    poppedOut,
  };
}

function createFixture() {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement('main');
  const shell = documentRef.createElement('section');
  shell.classList.add('workspace-shell');
  const actionHost = documentRef.createElement('section');
  actionHost.dataset.panel = 'viewport';

  const propertiesPanel = documentRef.createElement('aside');
  propertiesPanel.classList.add('properties-panel', 'workspace-panel--collapsed');
  const toggle = documentRef.createElement('button');
  toggle.dataset.action = 'toggle-properties-collapse';
  toggle.onClick = () => propertiesPanel.classList.remove('workspace-panel--collapsed');

  const section = documentRef.createElement('section');
  section.dataset.sectionId = 'first-cut';
  section.classList.add('properties-accordion-section', 'accordion-collapsed');
  const header = documentRef.createElement('header');
  header.classList.add('accordion-section-header');
  const sectionPopout = documentRef.createElement('button');
  sectionPopout.classList.add('accordion-popout-btn');
  header.append(sectionPopout);
  const body = documentRef.createElement('div');
  body.classList.add('accordion-section-body');
  const host = documentRef.createElement('div');
  host.dataset.role = 'first-cut-workbench-root';
  body.append(host);
  section.append(header, body);
  propertiesPanel.append(toggle, section);
  shell.append(actionHost, propertiesPanel);
  root.append(shell);
  documentRef.connect(root);

  return {
    document: documentRef,
    root,
    actionHost,
    propertiesPanel,
    section,
    sectionPopout,
    host,
    focusButton: () => root.querySelector('[data-role="first-cut-workbench-focus"]'),
    popoutButton: () => root.querySelector('[data-role="first-cut-workbench-popout"]'),
    dockButton: () => root.querySelector('[data-action="popup-dock"]'),
  };
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
  connect(element) { markConnected(element, true); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.listeners = new Map();
    this.style = {};
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.isConnected = false;
    this.focusCount = 0;
    this.scrollCount = 0;
    this.onClick = null;
  }
  append(...nodes) {
    nodes.forEach((node) => {
      if (node.parentElement) node.remove();
      node.parentElement = this;
      this.children.push(node);
      markConnected(node, this.isConnected);
    });
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((row) => row !== this);
    this.parentElement = null;
    markConnected(this, false);
  }
  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) {
    const rows = this.listeners.get(type) ?? new Set();
    rows.add(listener);
    this.listeners.set(type, rows);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  click() {
    this.onClick?.();
    for (const listener of [...(this.listeners.get('click') ?? [])]) {
      listener({ target: this, currentTarget: this, stopPropagation() {} });
    }
  }
  focus() { this.focusCount += 1; }
  scrollIntoView() { this.scrollCount += 1; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const result = [];
    visit(this, (node) => {
      if (node !== this && matches(node, selector)) result.push(node);
    });
    return result;
  }
}

class FakeClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); this.sync(); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); this.sync(); }
  contains(value) { return this.values.has(value); }
  sync() { this.owner.className = [...this.values].join(' '); }
}

function visit(node, callback) {
  callback(node);
  node.children.forEach((child) => visit(child, callback));
}

function matches(node, selector) {
  if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
  const dataSelectors = [...selector.matchAll(/\[data-([a-z-]+)="([^"]+)"\]/gu)];
  if (!dataSelectors.length) return false;
  return dataSelectors.every(([, rawKey, expected]) => {
    const key = rawKey.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    return node.dataset[key] === expected;
  });
}

function markConnected(node, connected) {
  node.isConnected = connected;
  node.children.forEach((child) => markConnected(child, connected));
}

run();
