#!/usr/bin/env node
import assert from 'node:assert/strict';
import { sourceFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture } from './lafea.2-fixtures.mjs';
import { normalizeLafeaStageDocument } from '../src/workspace/lafea-workbench-model.js';
import {
  LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS,
  LAFEA_T3_ANALYTICAL_PARAMETER_SCHEMAS,
  LAFEA_T3_COMPILED_TEMPLATE_IDS,
  compileLafeaApplicationTemplate,
  validateT3AnalyticalCompilerBinding,
} from '../src/core/lafea-application-templates/t3-analytical.js';
import {
  validateTemplateGeometryResult,
  validateTemplateHandoff,
  validateTemplateLoadDefinition,
  validateTemplateBoundaryDefinition,
} from '../src/core/lafea-application-templates/contracts.js';

const loadTransferInput = loadTransferParameters(sourceFixture());
const transfer = compileLafeaApplicationTemplate({
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  rawParameters: loadTransferInput,
});

assert.equal(transfer.status, 'READY');
assert.equal(transfer.handoff.entryStageId, 'LAFEA.1');
assert.equal(transfer.handoff.status, 'READY');
assert.deepEqual(
  transfer.handoff.stageSource.resultRequests.requestedAnalyses,
  ['LOAD_TRANSFER'],
);
assert.deepEqual(transfer.handoff.stageSource.pressureDefinitions, []);
assert.deepEqual(transfer.handoff.stageSource.resultRequests.pressure, []);
assert.equal(validateTemplateGeometryResult(transfer.geometry).ok, true);
assert.equal(validateTemplateLoadDefinition(transfer.loadDefinition).ok, true);
assert.equal(validateTemplateBoundaryDefinition(transfer.boundaryDefinition).ok, true);
assert.equal(validateTemplateHandoff(transfer.handoff).ok, true);
assert.doesNotThrow(() => normalizeLafeaStageDocument(
  'LAFEA.1',
  transfer.handoff.stageSource,
));

const reorderedTransferInput = structuredClone(loadTransferInput);
reorderedTransferInput.pipeContext.value.materials.reverse();
reorderedTransferInput.loadTransfer.value.loadReferencePoints.reverse();
reorderedTransferInput.loadTransfer.value.loadCases.reverse();
const reorderedTransfer = compileLafeaApplicationTemplate({
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  rawParameters: reorderedTransferInput,
});
assert.equal(reorderedTransfer.semanticHash, transfer.semanticHash);
assert.equal(
  reorderedTransfer.handoff.semanticHash,
  transfer.handoff.semanticHash,
);

assert.throws(() => compileLafeaApplicationTemplate({
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  rawParameters: { ...loadTransferInput, unexpected: envelope('x', 'bad') },
}), /TEMPLATE_PARAMETERS_BLOCKED/u);

const screeningRaw = rawRequestFixture();
const screeningInput = pipeSectionParameters(screeningRaw);
const screening = compileLafeaApplicationTemplate({
  templateId: 'ALG-PIPE-SECTION-COMBINED',
  rawParameters: screeningInput,
});

assert.equal(screening.status, 'READY');
assert.equal(screening.handoff.entryStageId, 'LAFEA.2');
assert.equal(screening.handoff.stageSource.schema, 'local-attachment-screening-request/v1');
assert.equal(typeof screening.handoff.stageSource.semanticHash, 'string');
assert.equal(validateTemplateGeometryResult(screening.geometry).ok, true);
assert.equal(validateTemplateLoadDefinition(screening.loadDefinition).ok, true);
assert.equal(validateTemplateBoundaryDefinition(screening.boundaryDefinition).ok, true);
assert.equal(validateTemplateHandoff(screening.handoff).ok, true);
assert.doesNotThrow(() => normalizeLafeaStageDocument(
  'LAFEA.2',
  screening.handoff.stageSource,
));

const reorderedScreeningInput = structuredClone(screeningInput);
reorderedScreeningInput.screeningCases.value.values.reverse();
reorderedScreeningInput.screeningCases.value.values
  .forEach((screeningCase) => screeningCase.mechanicalTerms.reverse());
reorderedScreeningInput.evaluationLocations.value.values.reverse();
reorderedScreeningInput.envelopeQuantities.value.values.reverse();
const reorderedScreening = compileLafeaApplicationTemplate({
  templateId: 'ALG-PIPE-SECTION-COMBINED',
  rawParameters: reorderedScreeningInput,
});
assert.equal(reorderedScreening.semanticHash, screening.semanticHash);
assert.equal(reorderedScreening.handoff.semanticHash, screening.handoff.semanticHash);

const staleEvidence = structuredClone(screeningInput);
staleEvidence.sourceEvidence.value.foundationModel.modelVersion = 'FORGED';
assert.throws(() => compileLafeaApplicationTemplate({
  templateId: 'ALG-PIPE-SECTION-COMBINED',
  rawParameters: staleEvidence,
}));

assert.throws(() => compileLafeaApplicationTemplate({
  templateId: 'SHL-PIPE-LOCAL-PATCH',
  rawParameters: {},
}), /TEMPLATE_COMPILER_NOT_AVAILABLE/u);

assert.deepEqual(LAFEA_T3_COMPILED_TEMPLATE_IDS, [
  'ALG-LOAD-REFERENCE-TRANSFER',
  'ALG-PIPE-SECTION-COMBINED',
]);
assert.equal(LAFEA_T3_ANALYTICAL_PARAMETER_SCHEMAS.length, 2);
assert.equal(LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS.length, 2);
LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS.forEach((binding) => {
  assert.equal(binding.status, 'DRAFT');
  assert.equal(validateT3AnalyticalCompilerBinding(binding).ok, true);
});
assert.equal(Object.isFrozen(transfer), true);
assert.equal(Object.isFrozen(transfer.handoff), true);
assert.equal(Object.isFrozen(screening), true);

console.log(JSON.stringify({
  status: 'PASS',
  parameterSchemaCount: LAFEA_T3_ANALYTICAL_PARAMETER_SCHEMAS.length,
  compilerBindingCount: LAFEA_T3_ANALYTICAL_COMPILER_BINDINGS.length,
  compiledTemplateCount: LAFEA_T3_COMPILED_TEMPLATE_IDS.length,
  executableTemplateCount: 0,
  transferCompilationHash: transfer.semanticHash,
  screeningCompilationHash: screening.semanticHash,
}, null, 2));

function loadTransferParameters(source) {
  return {
    identity: envelope({
      modelIdentity: source.modelIdentity,
      modelVersion: source.modelVersion,
      sourceModelIdentity: source.sourceAncestry.sourceModelIdentity,
      sourceVersion: source.sourceAncestry.sourceVersion,
      adapterIdentity: 'LAFEA-TEMPLATE-ANALYTICAL-COMPILER',
      adapterVersion: '1',
    }, 'identity'),
    units: envelope(source.units, 'units'),
    pipeContext: envelope({
      outsideDiameter: source.pipeGeometry.outsideDiameter,
      pipeCoordinateSystem: source.pipeCoordinateSystem,
      materials: source.materials,
      thicknessBasis: source.thicknessBasis,
    }, 'pipe-context'),
    loadTransfer: envelope({
      loadReferencePoints: source.loadReferencePoints,
      loadCases: source.loadCases,
    }, 'load-transfer'),
    qualificationProfile: envelope(source.qualificationProfile, 'qualification-profile'),
    limitations: envelope({ values: [] }, null, null),
  };
}

function pipeSectionParameters(raw) {
  return {
    requestIdentity: envelope(raw.requestIdentity, 'request-identity'),
    requestVersion: envelope(raw.requestVersion, 'request-version'),
    sourceEvidence: envelope(raw.sourceEvidence, 'foundation-source-evidence'),
    screeningCases: envelope({ values: raw.screeningCases }, 'screening-cases'),
    evaluationLocations: envelope({ values: raw.evaluationLocations }, 'evaluation-locations'),
    envelopeQuantities: envelope(
      { values: raw.resultRequests.envelopeQuantities },
      'envelope-quantities',
    ),
    qualificationProfile: envelope(raw.qualificationProfile, 'qualification-profile'),
    limitations: envelope({ values: raw.limitations }, null, null),
  };
}

function envelope(value, path, sourceStatus = 'IMPORTED') {
  return {
    value,
    unit: null,
    sourceRef: path === null ? null : { document: 'T3-CHECK', path },
    sourceStatus,
  };
}
