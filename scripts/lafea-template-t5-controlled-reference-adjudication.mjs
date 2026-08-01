#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  compileLafeaApplicationTemplate,
} from '../src/core/lafea-application-templates/t3-analytical.js';
import {
  requireT5CompilerReferenceCase,
} from '../src/core/lafea-application-templates/t5-qualification.js';
import { rawRequestFixture } from './lafea.2-fixtures.mjs';

const TEMPLATE_ID = 'ALG-PIPE-SECTION-COMBINED';
const T5_REFERENCE_COMMIT = 'cb335769fac98466ba8520382397854dc4fc387d';
const UNIT_PROJECTION_COMMIT = '0a03f902d57b28c7d263c77fa15b7bf57adad0b2';
const COMPILER_PATH =
  'src/core/lafea-application-templates/compilers/analytical/pipe-section-combined.js';
const CASE_RESULTANTS_PATH = 'src/core/local-attachment-screening/case-resultants.js';

const raw = rawRequestFixture();
const compilation = compileLafeaApplicationTemplate({
  templateId: TEMPLATE_ID,
  rawParameters: pipeSectionParameters(raw),
});
const stageSource = compilation.handoff.stageSource;

assert.equal(stageSource.schema, 'local-attachment-screening-request/v1');
assert.equal(stageSource.screeningCases.length, raw.screeningCases.length);
assert.equal(compilation.loadDefinition.loadCases.length, stageSource.screeningCases.length);

for (const [index, screeningCase] of stageSource.screeningCases.entries()) {
  const rawCase = raw.screeningCases[index];
  assert.equal(screeningCase.screeningCaseId, rawCase.screeningCaseId);
  assert.equal(screeningCase.pressureDefinitionId, rawCase.pressureDefinitionId);
  assert.equal(screeningCase.pressureFactor, rawCase.pressureFactor);
  assert.equal(screeningCase.sourceReference, rawCase.sourceReference);
  assert.equal(screeningCase.mechanicalTerms.length, rawCase.mechanicalTerms.length);

  for (const term of screeningCase.mechanicalTerms) {
    assert.deepEqual(Object.keys(term).sort(), ['factor', 'loadCaseId']);
    assert.equal(Object.hasOwn(term, 'pressureDefinitionId'), false);
    assert.equal(Object.hasOwn(term, 'sourceReference'), false);
  }

  const loadCase = compilation.loadDefinition.loadCases.find(
    (row) => row.caseId === screeningCase.screeningCaseId,
  );
  assert.ok(loadCase, `Missing compiled load case ${screeningCase.screeningCaseId}.`);

  const mechanical = loadCase.primitives.filter(
    (primitive) => primitive.kind === 'RETAINED_MECHANICAL_RESULTANT_FACTOR',
  );
  const pressure = loadCase.primitives.filter(
    (primitive) => primitive.kind === 'RETAINED_PRESSURE_DEFINITION_FACTOR',
  );
  assert.equal(mechanical.length, screeningCase.mechanicalTerms.length);
  assert.equal(pressure.length, 1);
  assert.equal(
    loadCase.primitives.some(
      (primitive) => primitive.kind === 'REFERENCED_FOUNDATION_LOAD_CASE',
    ),
    false,
  );

  for (const term of screeningCase.mechanicalTerms) {
    const primitive = mechanical.find((row) => row.entityId === term.loadCaseId);
    assert.ok(primitive, `Missing retained mechanical term ${term.loadCaseId}.`);
    assert.equal(primitive.values.factor, term.factor);
    assert.deepEqual(primitive.sourceRef, { reference: screeningCase.sourceReference });
    assert.equal(primitive.basis, 'RETAINED_LAFEA1_PIPE_LOCAL_RESULTANT');
  }

  assert.equal(pressure[0].entityId, screeningCase.pressureDefinitionId);
  assert.equal(pressure[0].values.factor, screeningCase.pressureFactor);
  assert.deepEqual(pressure[0].sourceRef, { reference: screeningCase.sourceReference });
  assert.equal(pressure[0].basis, 'RETAINED_LAFEA1_PRESSURE_EVIDENCE');
}

const actualProjection = {
  templateId: TEMPLATE_ID,
  loadKinds: [...new Set(
    compilation.loadDefinition.loadCases.flatMap((loadCase) => (
      loadCase.primitives.map((primitive) => primitive.kind)
    )),
  )].sort(),
};
const independentlyDerivedProjection = {
  templateId: TEMPLATE_ID,
  loadKinds: [
    'RETAINED_MECHANICAL_RESULTANT_FACTOR',
    'RETAINED_PRESSURE_DEFINITION_FACTOR',
  ],
};
const reference = requireT5CompilerReferenceCase(TEMPLATE_ID, 'LOAD-01');

assert.deepEqual(actualProjection, independentlyDerivedProjection);
assert.deepEqual(reference.expected, independentlyDerivedProjection);
assert.equal(
  semanticHash(independentlyDerivedProjection),
  'fnv1a64:94de6d2af6543bf7',
);
assert.equal(reference.expectedResultHash, semanticHash(independentlyDerivedProjection));

const currentCompiler = readFileSync(COMPILER_PATH, 'utf8');
const screeningAuthority = readFileSync(CASE_RESULTANTS_PATH, 'utf8');
assert.equal(currentCompiler.includes("kind: 'RETAINED_MECHANICAL_RESULTANT_FACTOR'"), true);
assert.equal(currentCompiler.includes("kind: 'RETAINED_PRESSURE_DEFINITION_FACTOR'"), true);
assert.equal(currentCompiler.includes("kind: 'REFERENCED_FOUNDATION_LOAD_CASE'"), false);
assert.equal(currentCompiler.includes('term.pressureDefinitionId'), false);
assert.equal(currentCompiler.includes('term.sourceReference'), false);
assert.equal(screeningAuthority.includes('row.pressureDefinitionId'), true);
assert.equal(screeningAuthority.includes('row.pressureFactor'), true);
assert.equal(screeningAuthority.includes('row.sourceReference'), true);

const originalCompiler = gitShow(`${T5_REFERENCE_COMMIT}:${COMPILER_PATH}`);
const driftedCompiler = gitShow(`${UNIT_PROJECTION_COMMIT}:${COMPILER_PATH}`);
assert.equal(originalCompiler.includes("kind: 'RETAINED_MECHANICAL_RESULTANT_FACTOR'"), true);
assert.equal(originalCompiler.includes("kind: 'RETAINED_PRESSURE_DEFINITION_FACTOR'"), true);
assert.equal(driftedCompiler.includes("kind: 'REFERENCED_FOUNDATION_LOAD_CASE'"), true);
assert.equal(driftedCompiler.includes('term.pressureDefinitionId'), true);
assert.equal(driftedCompiler.includes('term.sourceReference'), true);

console.log(JSON.stringify({
  check: 'lafea-template-t5-controlled-reference-adjudication',
  status: 'PASS',
  templateId: TEMPLATE_ID,
  benchmarkId: reference.benchmarkId,
  referenceCommit: T5_REFERENCE_COMMIT,
  driftIntroductionCommit: UNIT_PROJECTION_COMMIT,
  screeningCaseCount: stageSource.screeningCases.length,
  mechanicalPrimitiveCount: compilation.loadDefinition.loadCases
    .flatMap((loadCase) => loadCase.primitives)
    .filter((primitive) => primitive.kind === 'RETAINED_MECHANICAL_RESULTANT_FACTOR')
    .length,
  pressurePrimitiveCount: compilation.loadDefinition.loadCases
    .flatMap((loadCase) => loadCase.primitives)
    .filter((primitive) => primitive.kind === 'RETAINED_PRESSURE_DEFINITION_FACTOR')
    .length,
  actualProjection,
  independentlyDerivedProjection,
  expectedResultHash: reference.expectedResultHash,
  actualResultHash: semanticHash(actualProjection),
  controlledReferenceChanged: false,
  engineExecutionPaths: 0,
  lifecycleAuthorityChanged: false,
  resultBindingAuthorityChanged: false,
  releaseAuthorityChanged: false,
  t7dAuthorized: false,
}, null, 2));

function pipeSectionParameters(request) {
  return {
    requestIdentity: envelope(request.requestIdentity, 'request-identity'),
    requestVersion: envelope(request.requestVersion, 'request-version'),
    sourceEvidence: envelope(request.sourceEvidence, 'foundation-source-evidence'),
    screeningCases: envelope({ values: request.screeningCases }, 'screening-cases'),
    evaluationLocations: envelope(
      { values: request.evaluationLocations },
      'evaluation-locations',
    ),
    envelopeQuantities: envelope(
      { values: request.resultRequests.envelopeQuantities },
      'envelope-quantities',
    ),
    qualificationProfile: envelope(
      request.qualificationProfile,
      'qualification-profile',
    ),
    limitations: envelope({ values: request.limitations }, null, null),
  };
}

function envelope(value, sourceId, unit = null) {
  return {
    value,
    unit,
    sourceRef: sourceId === null ? null : { sourceId },
    sourceStatus: sourceId === null ? null : 'VERIFIED',
  };
}

function gitShow(spec) {
  return execFileSync('git', ['show', spec], { encoding: 'utf8' });
}
