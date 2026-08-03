#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LinearPipingResultsWorkbenchController,
} from '../src/workspace/linear-piping-results-workbench.js';
import { buildM003LiveRunRequest } from './m003-live-run-analysis-fixture.mjs';

class FakeDocument {
  constructor() {
    this.downloads = [];
    this.defaultView = {};
    this.body = new FakeElement('body', this);
    this.documentElement = this.body;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.type = '';
    this.accept = '';
    this.value = '';
    this.files = [];
    this.href = '';
    this.download = '';
    this.scope = '';
    this.colSpan = 1;
    this.clickCount = 0;
    this.listeners = new Map();
    this.attributes = new Map();
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...children);
  }

  addEventListener(type, callback) {
    const current = this.listeners.get(type) ?? [];
    current.push(callback);
    this.listeners.set(type, current);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  click() {
    this.clickCount += 1;
    if (this.tagName === 'a') {
      this.ownerDocument.downloads.push({ fileName: this.download, href: this.href });
    }
    for (const callback of this.listeners.get('click') ?? []) callback({ currentTarget: this });
  }

  async dispatch(type) {
    await Promise.all(
      (this.listeners.get(type) ?? []).map((callback) => callback({ currentTarget: this })),
    );
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  get childElementCount() {
    return this.children.length;
  }
}

class FakeUrlApi {
  createObjectURL() {
    return 'blob:m003';
  }

  revokeObjectURL() {}
}

const documentRef = new FakeDocument();
const panelContainer = documentRef.createElement('div');
documentRef.body.append(panelContainer);
const controller = new LinearPipingResultsWorkbenchController(
  panelContainer,
  documentRef,
  new FakeUrlApi(),
).init();

assert.equal(controller.elements.runButton.textContent, 'Run Analysis');
assert.equal(controller.elements.importButton.textContent, 'Import Sealed Result Package');
assert.equal(controller.getSnapshot().runStatus, 'IDLE');

const request = buildM003LiveRunRequest();
controller.elements.runFileInput.files = [jsonFile('m003-live-run.json', request)];
controller.elements.runButton.click();
assert.equal(controller.elements.runFileInput.clickCount, 1);
await controller.elements.runFileInput.dispatch('change');

const snapshot = controller.getSnapshot();
assert.equal(snapshot.status, 'CURRENT');
assert.equal(snapshot.runStatus, 'SUCCEEDED');
assert.equal(snapshot.applicationId, request.applicationId);
// The fixture's reducer component (src/core/linear-fea-piping-components/
// inline-component.js buildReducerComponent) unconditionally declares a
// CONDITIONAL approximation for its stepped-section idealization — this is a
// deliberate, disclosed engineering limitation, not a defect, and it
// correctly propagates to CONDITIONAL/AUDIT_ONLY_CONDITIONAL at every layer
// above it. A fixture using a reducer can never legitimately assert
// ENGINEERING_EXPORT_ALLOWED; asserting that here would mean the test
// silently accepted a system that lost track of a disclosed approximation.
assert.equal(snapshot.exportEligibility, 'AUDIT_ONLY_CONDITIONAL');
assert.equal(controller.elements.auditButton.disabled, false);
assert.equal(controller.elements.engineeringButton.disabled, true);
assert.equal(controller.elements.runOutcome.dataset.status, 'SUCCEEDED');
assert.match(flattenText(controller.elements.runOutcome), /sealed application result/u);

const runResult = controller.getLiveRunResult();
assert.equal(runResult.runtimeEvidence.sharedAcrossCaseCount, 2);
assert.ok(runResult.runtimeEvidence.factorizationCacheEntryCount >= 1);
const highContext = runResult.cases
  .find((entry) => entry.caseId === 'HIGH')
  .inputXmlAnalysisContext;
const highResult = highContext.sourceAnalysisContext.analysisResult;
// Same reducer-approximation disclosure as exportEligibility above: the
// per-case analysis result inherits CONDITIONAL from the reducer component's
// acceptanceState (src/core/linear-piping-analysis-consumer/consumer.js:69-72).
assert.equal(highResult.status, 'CONDITIONAL');
assert.ok(Math.abs(reactionAt(highResult, 'RED-001.N0', 'UY') + 1000) < 1e-8);
assert.ok(Math.abs(reactionAt(highResult, 'RED-001.N0', 'RZ') + 2400) < 1e-8);
assert.ok(
  runResult.multicaseApplication.applicationResult.analysisResultSemanticHashes
    .includes(highResult.semanticHash),
);
assert.equal(
  snapshot.applicationResultSemanticHash,
  runResult.multicaseApplication.applicationResult.semanticHash,
);
assert.match(flattenText(controller.elements.resultsRoot), /B31\.3 application results/u);

const rejected = buildM003LiveRunRequest();
rejected.cases[0].inputXmlAnalysisRequest.sourceAnalysisRequest.expectedSourceAuthorities
  .compilerProfileSemanticHash = 'fnv1a64:0000000000000000';
controller.elements.runFileInput.files = [jsonFile('m003-live-run-blocked.json', rejected)];
controller.elements.runButton.click();
await controller.elements.runFileInput.dispatch('change');

const blocked = controller.getSnapshot();
assert.equal(blocked.status, 'EMPTY');
assert.equal(blocked.runStatus, 'BLOCKED');
assert.equal(blocked.runFailure.code, 'PIPING_SOURCE_AUTHORITY_MISMATCH');
assert.equal(blocked.runFailure.analysisStage, 'CASE:HIGH:INPUTXML_ANALYSIS');
assert.equal(blocked.applicationId, null);
assert.equal(blocked.exportEligibility, null);
assert.equal(controller.getLiveRunResult(), null);
assert.equal(controller.elements.auditButton.disabled, true);
assert.equal(controller.elements.engineeringButton.disabled, true);
assert.equal(controller.elements.runOutcome.dataset.status, 'BLOCKED');
assert.match(flattenText(controller.elements.runOutcome), /PIPING_SOURCE_AUTHORITY_MISMATCH/u);
assert.match(flattenText(controller.elements.runOutcome), /CASE:HIGH:INPUTXML_ANALYSIS/u);
assert.throws(
  () => controller.createAuditExport(),
  (error) => error?.code === 'PIPING_WORKSPACE_RESULT_REQUIRED',
);

console.log(JSON.stringify({
  check: 'linear-piping-live-run-workbench',
  status: 'PASS',
  realUiInteraction: true,
  realOrchestration: true,
  numericAssertions: {
    nodeId: 'RED-001.N0',
    UY: reactionAt(highResult, 'RED-001.N0', 'UY'),
    RZ: reactionAt(highResult, 'RED-001.N0', 'RZ'),
    tolerance: 1e-8,
  },
  rejectionAssertion: blocked.runFailure,
}));

function reactionAt(result, nodeId, dof) {
  const entry = result.execution.reactions
    .find((row) => row.nodeId === nodeId && row.dof === dof);
  assert.ok(entry, `Missing reaction ${nodeId}:${dof}`);
  return entry.value;
}

function jsonFile(name, value) {
  const content = JSON.stringify(value);
  return Object.freeze({
    name,
    type: 'application/json',
    async text() {
      return content;
    },
  });
}

function flattenText(node) {
  return [node.textContent, ...node.children.map(flattenText)].join(' ');
}
