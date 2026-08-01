#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APPLICATION_RESULT_REQUEST_SCHEMA,
  sealLinearPipingQualifiedApplicationResult,
} from '../src/core/linear-piping-code-application/index.js';
import {
  LINEAR_PIPING_WORKSPACE_PACKAGE_SCHEMA,
  LinearPipingResultsWorkbenchController,
} from '../src/workspace/linear-piping-results-workbench.js';
import { buildQualifiedPresentationFixture } from './linear-piping-presentation-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function runWorkspaceChecks() {
  console.log('\n--- [SIMULATED] Linear piping Phase 5B active workspace checks ---');

  const documentRef = new FakeDocument();
  const panelContainer = documentRef.createElement('div');
  documentRef.body.append(panelContainer);
  const urlApi = new FakeUrlApi();
  const controller = new LinearPipingResultsWorkbenchController(
    panelContainer,
    documentRef,
    urlApi,
  ).init();
  const fixture = buildQualifiedPresentationFixture();
  const qualifiedPackage = workspacePackage(fixture);

  test('P5B-MOUNT-01', 'Controller mounts one active properties-panel section', () => {
    assert.equal(panelContainer.children.length, 1);
    assert.equal(controller.elements.section.dataset.sectionId, 'linear-piping-results');
    assert.equal(controller.elements.section.dataset.role, 'linear-piping-results-workbench');
    assert.equal(controller.getSnapshot().status, 'EMPTY');
    assert.equal(controller.elements.auditButton.disabled, true);
    assert.equal(controller.elements.engineeringButton.disabled, true);
  });

  test('P5B-LOAD-01', 'Qualified sealed package compiles and renders through Phase 5 authority', () => {
    const presentation = controller.loadPackage(qualifiedPackage);
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, 'CURRENT');
    assert.equal(snapshot.applicationId, fixture.applicationResult.applicationId);
    assert.equal(snapshot.presentationSemanticHash, presentation.semanticHash);
    assert.equal(snapshot.exportEligibility, 'ENGINEERING_EXPORT_ALLOWED');
    assert.equal(controller.elements.auditButton.disabled, false);
    assert.equal(controller.elements.engineeringButton.disabled, false);
    assert.match(flattenText(controller.elements.resultsRoot), /B31\.3 application results/u);
    assert.match(flattenText(controller.elements.resultsRoot), /Support, anchor and nozzle interface actions/u);
  });

  test('P5B-EXPORT-01', 'Audit and engineering export records remain deterministic', () => {
    const auditA = controller.createAuditExport();
    const auditB = controller.createAuditExport();
    assert.equal(auditA.content, auditB.content);
    assert.equal(auditA.contentHash, auditB.contentHash);
    const engineeringA = controller.createEngineeringExports();
    const engineeringB = controller.createEngineeringExports();
    assert.equal(engineeringA.length, 3);
    assert.deepEqual(
      engineeringA.map((row) => ({ role: row.role, contentHash: row.contentHash, content: row.content })),
      engineeringB.map((row) => ({ role: row.role, contentHash: row.contentHash, content: row.content })),
    );
  });

  test('P5B-DOWNLOAD-01', 'Browser adapter downloads governed records and revokes object URLs', () => {
    controller.downloadAuditExport();
    assert.equal(documentRef.downloads.at(-1).fileName.endsWith('-piping-audit.json'), true);
    const before = documentRef.downloads.length;
    controller.downloadEngineeringExports();
    assert.equal(documentRef.downloads.length - before, 3);
    assert.equal(urlApi.created.length, urlApi.revoked.length);
  });

  test('P5B-STALE-01', 'Previously valid presentation is rejected against a different current application', () => {
    const staleApplication = sealLinearPipingQualifiedApplicationResult({
      schema: APPLICATION_RESULT_REQUEST_SCHEMA,
      applicationId: 'PIPE-PHASE5B-DIFFERENT-CURRENT',
      analysisResults: fixture.analysisResults,
      interfaceSet: fixture.interfaceSet,
      interfaceRecoveries: fixture.interfaceRecoveries,
      nozzleAssessments: fixture.nozzleAssessments,
      b31Application: fixture.b31Application,
    });
    controller.applicationResult = staleApplication;
    expectCode(() => controller.createAuditExport(), 'PIPING_PRESENTATION_STALE');
    controller.loadPackage(qualifiedPackage);
  });

  test('P5B-FAILCLOSED-01', 'Rejected replacement clears the previously displayed current result', () => {
    expectCode(
      () => controller.loadPackage({ ...qualifiedPackage, injectedApplicationValue: 123 }),
      'PIPING_WORKSPACE_PACKAGE_KEYS_INVALID',
    );
    assert.equal(controller.getSnapshot().status, 'EMPTY');
    assert.equal(controller.elements.auditButton.disabled, true);
    assert.match(flattenText(controller.elements.resultsRoot), /No CURRENT sealed piping application result/u);
  });

  test('P5B-CONDITIONAL-01', 'Conditional result remains audit-visible and blocks engineering controls', () => {
    const conditionalApplication = sealLinearPipingQualifiedApplicationResult({
      schema: APPLICATION_RESULT_REQUEST_SCHEMA,
      applicationId: 'PIPE-PHASE5B-CONDITIONAL',
      analysisResults: fixture.analysisResults,
      interfaceSet: fixture.interfaceSet,
      interfaceRecoveries: fixture.interfaceRecoveries,
      nozzleAssessments: [],
      b31Application: fixture.b31Application,
    });
    controller.loadPackage(workspacePackage({
      ...fixture,
      applicationResult: conditionalApplication,
      nozzleAssessments: [],
    }));
    assert.equal(controller.getSnapshot().qualificationStatus, 'CONDITIONAL');
    assert.equal(controller.getSnapshot().exportEligibility, 'AUDIT_ONLY_CONDITIONAL');
    assert.equal(controller.elements.auditButton.disabled, false);
    assert.equal(controller.elements.engineeringButton.disabled, true);
    assert.match(controller.createAuditExport().content, /NOZZLE_ALLOWABLE_NOT_CONFIGURED/u);
    expectCode(
      () => controller.createEngineeringExports(),
      'PIPING_PRESENTATION_ENGINEERING_EXPORT_BLOCKED',
    );
  });

  test('P5B-LIFECYCLE-01', 'Clear and destroy remove retained current state and mounted UI', () => {
    controller.clear();
    assert.equal(controller.getSnapshot().status, 'EMPTY');
    controller.destroy();
    assert.equal(panelContainer.children.length, 0);
  });

  test('P5B-GUARD-01', 'Workspace integration remains presentation-only and registered', () => {
    const controllerSource = fs.readFileSync(
      'src/workspace/linear-piping-results-workbench.js',
      'utf8',
    );
    assert.match(controllerSource, /compileLinearPipingPresentation/u);
    assert.match(controllerSource, /renderLinearPipingResultsView/u);
    assert.match(controllerSource, /createLinearPipingAuditJsonExport/u);
    assert.match(controllerSource, /createQualifiedLinearPipingEngineeringExports/u);
    assert.match(controllerSource, /requireLinearPipingQualifiedApplicationResult/u);
    assert.doesNotMatch(
      controllerSource,
      /compileSolverExecution|compileResultRecovery|recoverLinearPipingInterfaceLoads|compileCodeResult|assessNozzleAllowable|cross\(|dot\(/u,
    );
    assert.doesNotMatch(controllerSource, /innerHTML|insertAdjacentHTML|outerHTML/u);
    assert.doesNotMatch(controllerSource, /Math\.random|randomUUID|localeCompare/u);

    const mainSource = fs.readFileSync('src/main.js', 'utf8');
    assert.match(mainSource, /mountLinearPipingResultsWorkbench/u);
    assert.match(mainSource, /importLinearPipingResultPackage/u);
    assert.match(mainSource, /createLinearPipingAuditExportRecord/u);
    assert.match(mainSource, /createLinearPipingEngineeringExportRecords/u);

    const phaseRecord = JSON.parse(
      fs.readFileSync('reports/lfea-piping-phase5b-workspace-integration.json', 'utf8'),
    );
    assert.equal(phaseRecord.ownerFindingId, 'AUD-A6-001');
    assert.equal(phaseRecord.status, 'PARTIALLY_VERIFIED');
    assert.equal(phaseRecord.releaseImpact, 'NONE');

    const workflow = fs.readFileSync(
      '.github/workflows/lfea-piping-phase-certification.yml',
      'utf8',
    );
    assert.match(workflow, /linear-piping-workspace-integration-check\.mjs/u);
    assert.match(workflow, /linear-piping-results-workspace\.spec\.js/u);
  });

  console.log('Linear piping Phase 5B active workspace checks PASS');
}

function workspacePackage(value) {
  return {
    schema: LINEAR_PIPING_WORKSPACE_PACKAGE_SCHEMA,
    applicationResult: value.applicationResult,
    analysisResults: value.analysisResults,
    interfaceSet: value.interfaceSet,
    interfaceRecoveries: value.interfaceRecoveries,
    nozzleAssessments: value.nozzleAssessments,
    b31Application: value.b31Application,
  };
}

function flattenText(node) {
  return [node.textContent, ...node.children.map(flattenText)].join(' ');
}

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
    if (this.tagName === 'a') {
      this.ownerDocument.downloads.push({ fileName: this.download, href: this.href });
    }
    for (const callback of this.listeners.get('click') ?? []) callback({ currentTarget: this });
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
  constructor() {
    this.created = [];
    this.revoked = [];
  }

  createObjectURL(blob) {
    const value = `blob:phase5b-${this.created.length + 1}`;
    this.created.push({ value, size: blob.size });
    return value;
  }

  revokeObjectURL(value) {
    this.revoked.push(value);
  }
}

runWorkspaceChecks();
