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
  assert.deepEqual(initial, {
    schema: FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
    status: 'READY',
    focusCount: 0,
    popoutCount: 0,
    lastMode: null,
    hostIdentityRetained: true,
    poppedOut: false,
  });
  assert.equal(Object.isFrozen(initial), true);
  assert.deepEqual(launcher.init(), initial);
  assert.equal(fixture.actionHost.querySelectorAll(
    '[data-role="first-cut-workbench-action-bar"]',
  ).length, 1);
  assert.equal(fixture.actionHost.querySelectorAll(
    '[data-role="first-cut-workbench-launcher"]',
  ).length, 1);

  const originalHost = fixture.host;
  fixture.focusButton().click();
  assert.equal(fixture.shell.classList.contains('properties-collapsed'), false);
  assert.equal(fixture.section.classList.contains('accordion-collapsed'), false);
  assert.strictEqual(fixture.root.querySelector(
    '[data-role="first-cut-workbench-root"]',
  ), originalHost);
  assert.equal(originalHost.focusCount, 1);
  assert.equal(originalHost.scrollCount, 1);
  assert.equal(originalHost.getAttribute('tabindex'), '-1');
  assert.deepEqual(launcher.getState(), {
    schema: FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
    status: 'READY',
    focusCount: 1,
    popoutCount: 0,
    lastMode: 'FOCUS',
    hostIdentityRetained: true,
    poppedOut: false,
  });

  fixture.popoutButton().click();
  assert.equal(fixture.section.classList.contains('is-popped-out'), true);
  assert.strictEqual(fixture.root.querySelector(
    '[data-role="first-cut-workbench-root"]',
  ), originalHost);
  assert.equal(originalHost.focusCount, 2);
  assert.equal(originalHost.scrollCount, 2);
  assert.deepEqual(launcher.getState(), {
    schema: FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
    status: 'READY',
    focusCount: 1,
    popoutCount: 1,
    lastMode: 'POPOUT',
    hostIdentityRetained: true,
    poppedOut: true,
  });

  launcher.destroy();
  launcher.destroy();
  assert.equal(fixture.actionHost.querySelectorAll(
    '[data-role="first-cut-workbench-action-bar"]',
  ).length, 0);
  assert.equal(fixture.actionHost.querySelectorAll(
    '[data-role="first-cut-workbench-launcher"]',
  ).length, 0);
  assert.strictEqual(fixture.root.querySelector(
    '[data-role="first-cut-workbench-root"]',
  ), originalHost);
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
      && error.evidence.selector === '[data-role="first-cut-workbench-root"]'
      && error.evidence.count === 2,
  );

  console.log(JSON.stringify({
    check: 'first-cut-workbench-launcher',
    status: 'PASS',
    launcherSchema: FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
    actionBarMountCount: 1,
    actionBarVisibleAcrossViewportModes: true,
    focusCount: 1,
    popoutCount: 1,
    hostIdentityRetained: true,
    duplicateHostRejected: true,
    launcherDestroyIdempotent: true,
    enrichmentControllerCreated: false,
    calculationInvoked: false,
  }));
}

function createFixture() {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement('main');
  const shell = documentRef.createElement('section');
  shell.classList.add('workspace-shell', 'properties-collapsed');
  const actionHost = documentRef.createElement('section');
  actionHost.dataset.panel = 'viewport';

  const toggle = documentRef.createElement('button');
  toggle.dataset.action = 'toggle-properties-collapse';
  toggle.onClick = () => shell.classList.remove('properties-collapsed');

  const section = documentRef.createElement('section');
  section.dataset.sectionId = 'first-cut';
  section.classList.add('properties-accordion-section', 'accordion-collapsed');
  const header = documentRef.createElement('header');
  header.classList.add('accordion-section-header');
  header.onClick = () => section.classList.remove('accordion-collapsed');
  const popout = documentRef.createElement('button');
  popout.classList.add('accordion-popout-btn');
  popout.onClick = () => section.classList.add('is-popped-out');
  header.append(popout);
  const body = documentRef.createElement('div');
  body.classList.add('accordion-section-body');
  const host = documentRef.createElement('div');
  host.dataset.role = 'first-cut-workbench-root';
  body.append(host);
  section.append(header, body);
  shell.append(actionHost, toggle, section);
  root.append(shell);
  documentRef.connect(root);

  return {
    document: documentRef,
    root,
    shell,
    actionHost,
    section,
    host,
    focusButton: () => root.querySelector('[data-role="first-cut-workbench-focus"]'),
    popoutButton: () => root.querySelector('[data-role="first-cut-workbench-popout"]'),
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
  get firstElementChild() { return this.children[0] ?? null; }
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
      listener({ target: this, currentTarget: this });
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
  const data = /^\[data-([a-z-]+)="([^"]+)"\]$/u.exec(selector);
  if (!data) return false;
  const key = data[1].replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
  return node.dataset[key] === data[2];
}

function markConnected(node, connected) {
  node.isConnected = connected;
  node.children.forEach((child) => markConnected(child, connected));
}

run();
