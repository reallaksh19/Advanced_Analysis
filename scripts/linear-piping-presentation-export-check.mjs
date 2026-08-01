#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  compileLinearPipingPresentation,
  createLinearPipingAuditJsonExport,
  createQualifiedLinearPipingEngineeringExports,
  requireLinearPipingPresentation,
} from '../src/core/linear-piping-presentation/index.js';
import {
  APPLICATION_RESULT_REQUEST_SCHEMA,
  sealLinearPipingQualifiedApplicationResult,
} from '../src/core/linear-piping-code-application/index.js';
import { renderLinearPipingResultsView } from '../src/workspace/linear-piping-results-view.js';
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

function run() {
  const fixture = buildQualifiedPresentationFixture();
  const presentation = compileLinearPipingPresentation(fixture);

  console.log('\n--- [SIMULATED] Linear piping Phase 5 presentation and export checks ---');

  test('P5-PRES-01', 'Current stepped-reducer chain compiles into a truthful conditional presentation', () => {
    assert.equal(fixture.applicationResult.status, 'CONDITIONAL');
    assert.ok(fixture.applicationResult.limitations.some(
      (row) => row.limitation?.code === 'REDUCER_APPROXIMATION',
    ));
    assert.equal(presentation.currency, 'CURRENT');
    assert.equal(presentation.status, 'CONDITIONAL');
    assert.equal(presentation.exportEligibility, 'AUDIT_ONLY_CONDITIONAL');
    assert.equal(presentation.summary.analysisCount, 1);
    assert.equal(presentation.summary.interfaceResultCount, 1);
    assert.equal(presentation.summary.nozzleAssessmentCount, 1);
    assert.equal(presentation.summary.codeCheckCount, 1);
    assert.equal(requireLinearPipingPresentation(presentation).semanticHash, presentation.semanticHash);
  });

  test('P5-PRES-02', 'Presentation rows retain units, basis, sign and direct evidence identities', () => {
    const interfaceRow = presentation.interfaceRows[0];
    assert.equal(interfaceRow.reportingSignConvention, 'FORCE_ON_INTERFACE_FROM_PIPE');
    assert.deepEqual(interfaceRow.units, { force: 'N', moment: 'N*m', length: 'm' });
    assert.equal(interfaceRow.recoverySemanticHash, fixture.interfaceRecoveries[0].semanticHash);
    assert.equal(interfaceRow.recoveryEvidenceHash, fixture.interfaceRecoveries[0].evidenceHash);
    assert.equal(presentation.nozzleRows[0].profileSemanticHash, fixture.nozzleAssessments[0].profileSemanticHash);
    assert.deepEqual(presentation.codeRows[0].sourceRecoveryHashes, [fixture.analysisResults[0].recovery.semanticHash]);
  });

  test('P5-PRES-03', 'Input array order does not change presentation identity', () => {
    const second = compileLinearPipingPresentation({
      ...fixture,
      analysisResults: [...fixture.analysisResults].reverse(),
      interfaceRecoveries: [...fixture.interfaceRecoveries].reverse(),
      nozzleAssessments: [...fixture.nozzleAssessments].reverse(),
    });
    assert.equal(second.semanticHash, presentation.semanticHash);
    assert.equal(second.evidenceHash, presentation.evidenceHash);
  });

  test('P5-PRES-04', 'Missing current analysis parent is rejected before presentation', () => {
    expectCode(
      () => compileLinearPipingPresentation({ ...fixture, analysisResults: [] }),
      'PIPING_PRESENTATION_ANALYSIS_STALE',
    );
  });

  test('P5-EXP-01', 'Current audit JSON is deterministic and retains the conditional state', () => {
    const first = createLinearPipingAuditJsonExport(presentation, fixture.applicationResult);
    const second = createLinearPipingAuditJsonExport(presentation, fixture.applicationResult);
    assert.equal(first.content, second.content);
    assert.equal(first.contentHash, second.contentHash);
    assert.equal(first.qualificationStatus, 'CONDITIONAL');
    assert.match(first.content, /"currency": "CURRENT"/u);
    assert.match(first.content, /REDUCER_APPROXIMATION/u);
    assert.ok(first.content.endsWith('\n'));
  });

  test('P5-EXP-02', 'Conditional reducer evidence cannot produce engineering issue exports', () => {
    expectCode(
      () => createQualifiedLinearPipingEngineeringExports(
        presentation,
        fixture.applicationResult,
      ),
      'PIPING_PRESENTATION_ENGINEERING_EXPORT_BLOCKED',
    );
  });

  test('P5-EXP-03', 'Missing nozzle configuration remains audit-visible and engineering export is blocked', () => {
    const conditionalApplication = sealLinearPipingQualifiedApplicationResult({
      schema: APPLICATION_RESULT_REQUEST_SCHEMA,
      applicationId: 'PIPE-PHASE5-CONDITIONAL',
      analysisResults: fixture.analysisResults,
      interfaceSet: fixture.interfaceSet,
      interfaceRecoveries: fixture.interfaceRecoveries,
      nozzleAssessments: [],
      b31Application: fixture.b31Application,
    });
    const conditionalInput = {
      ...fixture,
      applicationResult: conditionalApplication,
      nozzleAssessments: [],
    };
    const conditionalPresentation = compileLinearPipingPresentation(conditionalInput);
    assert.equal(conditionalPresentation.status, 'CONDITIONAL');
    assert.equal(conditionalPresentation.exportEligibility, 'AUDIT_ONLY_CONDITIONAL');
    assert.match(
      createLinearPipingAuditJsonExport(conditionalPresentation, conditionalApplication).content,
      /NOZZLE_ALLOWABLE_NOT_CONFIGURED/u,
    );
    expectCode(
      () => createQualifiedLinearPipingEngineeringExports(conditionalPresentation, conditionalApplication),
      'PIPING_PRESENTATION_ENGINEERING_EXPORT_BLOCKED',
    );
  });

  test('P5-EXP-04', 'A previously current presentation is rejected against a different current application', () => {
    const conditionalApplication = sealLinearPipingQualifiedApplicationResult({
      schema: APPLICATION_RESULT_REQUEST_SCHEMA,
      applicationId: 'PIPE-PHASE5-STALE-TARGET',
      analysisResults: fixture.analysisResults,
      interfaceSet: fixture.interfaceSet,
      interfaceRecoveries: fixture.interfaceRecoveries,
      nozzleAssessments: [],
      b31Application: fixture.b31Application,
    });
    expectCode(
      () => createLinearPipingAuditJsonExport(presentation, conditionalApplication),
      'PIPING_PRESENTATION_STALE',
    );
  });

  test('P5-PRES-05', 'Tampered presentation evidence is rejected independently', () => {
    const tampered = structuredClone(presentation);
    tampered.analysisRows[0].evidenceHash = 'fnv1a64:0000000000000000';
    expectCode(() => requireLinearPipingPresentation(tampered), 'PIPING_PRESENTATION_HASH_MISMATCH');
  });

  test('P5-UI-01', 'Workspace renderer consumes the sealed current presentation without mechanics', () => {
    const documentRef = new FakeDocument();
    const root = new FakeElement('div', documentRef);
    const view = renderLinearPipingResultsView(root, presentation, fixture.applicationResult);
    assert.equal(root.children.length, 1);
    assert.equal(view.dataset.currency, 'CURRENT');
    assert.equal(view.dataset.status, 'CONDITIONAL');
    assert.equal(view.dataset.exportEligibility, 'AUDIT_ONLY_CONDITIONAL');
    assert.ok(flattenText(view).includes('B31.3 application results'));
    assert.ok(flattenText(view).includes(fixture.interfaceRecoveries[0].semanticHash));
  });

  console.log('Linear piping Phase 5 presentation and export checks PASS');
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.scope = '';
    this.colSpan = 1;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  get childElementCount() {
    return this.children.length;
  }
}

function flattenText(node) {
  return [node.textContent, ...node.children.map(flattenText)].join(' ');
}

run();
