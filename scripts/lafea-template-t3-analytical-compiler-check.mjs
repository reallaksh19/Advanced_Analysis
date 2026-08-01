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
import {
  T3_RESULT_UNIT_PROJECTION_POLICY_ID,
  T3_RESULT_UNIT_PROJECTION_PROFILE,
  T3_RESULT_UNIT_PROJECTION_PROFILE_SCHEMA,
  projectT3ResultUnits,
} from '../src/core/lafea-application-templates/compilers/analytical/result-unit-projection.js';

const EXPECTED_CANONICAL_MODEL_UNITS = Object.freeze({
  force: 'N',
  length: 'mm',
  moment: 'N·mm',
  pressure: 'MPa',
  stress: 'MPa',
});
const EXPECTED_RESULT_UNITS = Object.freeze({
  force: 'N',
  length: 'mm',
  moment: 'N*mm',
  pressure: 'MPa',
  stress: 'MPa',
});

assert.equal(
  T3_RESULT_UNIT_PROJECTION_PROFILE.schema,
  T3_RESULT_UNIT_PROJECTION_PROFILE_SCHEMA,
);
assert.equal(
  T3_RESULT_UNIT_PROJECTION_PROFILE.profileId,
  T3_RESULT_UNIT_PROJECTION_POLICY_ID,
);
assert.equal(Object.isFrozen(T3_RESULT_UNIT_PROJECTION_PROFILE), true);
assert.equal(Object.isFrozen(T3_RESULT_UNIT_PROJECTION_PROFILE.mappings), true);
assert.deepEqual(
  Object.fromEntries(T3_RESULT_UNIT_PROJECTION_PROFILE.mappings.map((mapping) => [
    mapping.dimension,
    {
      canonicalModelUnit: mapping.canonicalModelUnit,
      resultUnit: mapping.resultUnit,
      numericalScale: mapping.numericalScale,
    },
  ])),
  {
    force: { canonicalModelUnit: 'N', resultUnit: 'N', numericalScale: 1 },
    length: { canonicalModelUnit: 'mm', resultUnit: 'mm', numericalScale: 1 },
    moment: { canonicalModelUnit: 'N·mm', resultUnit: 'N*mm', numericalScale: 1 },
    pressure: { canonicalModelUnit: 'MPa', resultUnit: 'MPa', numericalScale: 1 },
    stress: { canonicalModelUnit: 'MPa', resultUnit: 'MPa', numericalScale: 1 },
  },
);

const loadTransferSource = sourceFixture();
assert.equal(loadTransferSource.units.moment, 'N·mm');
const directProjection = projectT3ResultUnits({
  declared: loadTransferSource.units,
  canonical: EXPECTED_CANONICAL_MODEL_UNITS,
});
assert.deepEqual(directProjection.resultUnits, EXPECTED_RESULT_UNITS);
assert.equal(
  directProjection.ancestry.profileSemanticHash,
  T3_RESULT_UNIT_PROJECTION_PROFILE.semanticHash,
);
for (const dimension of ['force', 'length', 'pressure', 'stress']) {
  assert.equal(
    directProjection.resultUnits[dimension],
    EXPECTED_CANONICAL_MODEL_UNITS[dimension],
  );
}
assert.throws(
  () => projectT3ResultUnits({
    declared: loadTransferSource.units,
    canonical: {
      ...EXPECTED_CANONICAL_MODEL_UNITS,
      moment: 'kN·m',
    },
  }),
  /T3_RESULT_UNIT_IDENTITY_NOT_CANONICALIZABLE:moment/u,
);
assert.throws(
  () => projectT3ResultUnits({
    declared: loadTransferSource.units,
    canonical: {
      force: 'N',
      length: 'mm',
      moment: 'N·mm',
      pressure: 'MPa',
    },
  }),
  /T3_CANONICAL_MODEL_UNITS_KEYS_INVALID/u,
);

const loadTransferInput = loadTransferParameters(loadTransferSource);
const transfer = compileLafeaApplicationTemplate({
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  rawParameters: loadTransferInput,
});
const repeatedTransfer = compileLafeaApplicationTemplate({
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  rawParameters: structuredClone(loadTransferInput),
});

assert.deepEqual(repeatedTransfer, transfer);
assert.equal(repeatedTransfer.semanticHash, transfer.semanticHash);
assert.equal(transfer.status, 'READY');
assert.equal(transfer.handoff.entryStageId, 'LAFEA.1');
assert.equal(transfer.handoff.status, 'READY');
assert.deepEqual(
  transfer.handoff.stageSource.resultRequests.requestedAnalyses,
  ['LOAD_TRANSFER'],
);
assert.deepEqual(transfer.handoff.stageSource.pressureDefinitions, []);
assert.deepEqual(transfer.handoff.stageSource.resultRequests.pressure, []);
assert.deepEqual(transfer.handoff.stageSource.units, loadTransferSource.units);
assert.equal(transfer.handoff.stageSource.units.moment, 'N·mm');
assert.deepEqual(geometryUnits(transfer), EXPECTED_RESULT_UNITS);
assert.equal(geometryUnit(transfer, 'moment'), 'N*mm');
assert.equal(loadPrimitiveUnit(transfer, 'MOMENT_RESULTANT'), 'N*mm');
assert.equal(loadPrimitiveUnit(transfer, 'FORCE_RESULTANT'), 'N');
assert.equal(
  transfer.geometry.ancestry.resultUnitProjection.policyId,
  T3_RESULT_UNIT_PROJECTION_POLICY_ID,
);
assert.equal(
  transfer.geometry.ancestry.resultUnitProjection.profileSemanticHash,
  T3_RESULT_UNIT_PROJECTION_PROFILE.semanticHash,
);
assert.equal(
  transfer.geometry.ancestry.resultUnitProjection.declaredSourceUnits.moment,
  'N·mm',
);
assert.equal(
  transfer.geometry.ancestry.resultUnitProjection.canonicalModelUnits.moment,
  'N·mm',
);
assert.equal(
  transfer.geometry.ancestry.resultUnitProjection.geometryAndLoadResultUnits.moment,
  'N*mm',
);
assert.equal(
  transfer.geometry.ancestry.resultUnitProjection.stageSourceRetainsDeclaredUnits,
  true,
);
assert.ok(transfer.geometry.diagnostics.includes(
  'T3_RESULT_UNIT_IDENTITY_PROJECTED_TO_PRINTABLE_ASCII',
));
assert.ok(transfer.loadDefinition.diagnostics.includes(
  'T3_RESULT_UNIT_IDENTITY_PROJECTED_TO_PRINTABLE_ASCII',
));
assert.ok(transfer.handoff.diagnostics.includes(
  'SOURCE_UNIT_IDENTITY_RETAINED_IN_STAGE_SOURCE',
));
assert.ok(transfer.diagnostics.includes(
  `RESULT_UNIT_PROJECTION_POLICY:${T3_RESULT_UNIT_PROJECTION_POLICY_ID}`,
));
assert.equal(
  transfer.geometry.units.every((row) => /^[\x20-\x7e]+$/u.test(row.unit)),
  true,
);
assert.equal(validateTemplateGeometryResult(transfer.geometry).ok, true);
assert.equal(validateTemplateLoadDefinition(transfer.loadDefinition).ok, true);
assert.equal(validateTemplateBoundaryDefinition(transfer.boundaryDefinition).ok, true);
assert.equal(validateTemplateHandoff(transfer.handoff).ok, true);
assert.doesNotThrow(() => normalizeLafeaStageDocument(
  'LAFEA.1',
  transfer.handoff.stageSource,
));

const convertedMomentSource = sourceFixture((model) => {
  model.units.moment = 'N·m';
  model.loadCases[0].moment.value = [0, 0, 1];
});
const convertedMoment = compileLafeaApplicationTemplate({
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  rawParameters: loadTransferParameters(convertedMomentSource),
});
assert.equal(convertedMoment.handoff.stageSource.units.moment, 'N·m');
assert.deepEqual(geometryUnits(convertedMoment), EXPECTED_RESULT_UNITS);
assert.equal(geometryUnit(convertedMoment, 'moment'), 'N*mm');
assert.equal(loadPrimitiveUnit(convertedMoment, 'MOMENT_RESULTANT'), 'N*mm');
assert.deepEqual(
  convertedMoment.loadDefinition.loadCases[0].primitives
    .find((row) => row.kind === 'MOMENT_RESULTANT').values.vector,
  [0, 0, 1000],
);
assert.equal(
  convertedMoment.geometry.ancestry.resultUnitProjection.declaredSourceUnits.moment,
  'N·m',
);
assert.equal(
  convertedMoment.geometry.ancestry.resultUnitProjection.canonicalModelUnits.moment,
  'N·mm',
);
assert.equal(
  convertedMoment.geometry.ancestry.resultUnitProjection.profileSemanticHash,
  T3_RESULT_UNIT_PROJECTION_PROFILE.semanticHash,
);

const reorderedTransferInput = structuredClone(loadTransferInput);
reorderedTransferInput.pipeContext.value.materials.reverse();
reorderedTransferInput.loadTransfer.value.loadReferencePoints.reverse();
reorderedTransferInput.loadTransfer.value.loadCases.reverse();
const reorderedTransfer = compileLafeaApplicationTemplate({
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  rawParameters: reorderedTransferInput,
});
assert.deepEqual(reorderedTransfer, transfer);
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
const repeatedScreening = compileLafeaApplicationTemplate({
  templateId: 'ALG-PIPE-SECTION-COMBINED',
  rawParameters: structuredClone(screeningInput),
});

assert.deepEqual(repeatedScreening, screening);
assert.equal(repeatedScreening.semanticHash, screening.semanticHash);
assert.equal(screening.status, 'READY');
assert.equal(screening.handoff.entryStageId, 'LAFEA.2');
assert.equal(screening.handoff.stageSource.schema, 'local-attachment-screening-request/v1');
assert.equal(typeof screening.handoff.stageSource.semanticHash, 'string');
assert.equal(
  screening.handoff.stageSource.sourceEvidence.foundationModel.units.declared.moment,
  'N·mm',
);
assert.equal(
  screening.handoff.stageSource.sourceEvidence.foundationModel.units.canonical.moment,
  'N·mm',
);
assert.deepEqual(geometryUnits(screening), EXPECTED_RESULT_UNITS);
assert.equal(
  screening.geometry.ancestry.resultUnitProjection.policyId,
  T3_RESULT_UNIT_PROJECTION_POLICY_ID,
);
assert.equal(
  screening.geometry.ancestry.resultUnitProjection.profileSemanticHash,
  T3_RESULT_UNIT_PROJECTION_PROFILE.semanticHash,
);
assert.ok(screening.geometry.diagnostics.includes(
  'T3_RESULT_UNIT_IDENTITY_PROJECTED_TO_PRINTABLE_ASCII',
));
assert.ok(screening.loadDefinition.diagnostics.includes(
  'T3_RESULT_UNIT_IDENTITY_PROJECTED_TO_PRINTABLE_ASCII',
));
assert.ok(screening.handoff.diagnostics.includes(
  'SOURCE_UNIT_IDENTITY_RETAINED_IN_STAGE_SOURCE',
));
assert.ok(screening.diagnostics.includes(
  `RESULT_UNIT_PROJECTION_POLICY:${T3_RESULT_UNIT_PROJECTION_POLICY_ID}`,
));
assert.equal(
  screening.loadDefinition.loadCases
    .flatMap((loadCase) => loadCase.primitives)
    .every((primitive) => primitive.units.length === 0),
  true,
);
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
assert.deepEqual(reorderedScreening, screening);
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
  sourceMomentUnit: loadTransferSource.units.moment,
  canonicalModelMomentUnit: EXPECTED_CANONICAL_MODEL_UNITS.moment,
  geometryResultMomentUnit: geometryUnit(transfer, 'moment'),
  convertedSourceMomentUnit: convertedMomentSource.units.moment,
  convertedMomentResult: convertedMoment.loadDefinition.loadCases[0].primitives
    .find((row) => row.kind === 'MOMENT_RESULTANT').values.vector,
  unitProjectionPolicy: T3_RESULT_UNIT_PROJECTION_POLICY_ID,
  unitProjectionProfileHash: T3_RESULT_UNIT_PROJECTION_PROFILE.semanticHash,
  unsupportedMappingRejected: true,
  incompleteMappingRejected: true,
  unrelatedUnitsUnchanged: true,
  repeatedCompilationDeterministic: true,
  reorderedCompilationDeterministic: true,
  transferCompilationHash: transfer.semanticHash,
  screeningCompilationHash: screening.semanticHash,
}, null, 2));

function geometryUnits(compilation) {
  return Object.fromEntries(
    compilation.geometry.units.map((row) => [row.dimension, row.unit]),
  );
}

function geometryUnit(compilation, dimension) {
  const record = compilation.geometry.units.find((row) => row.dimension === dimension);
  assert.ok(record, `Missing geometry unit for ${dimension}.`);
  return record.unit;
}

function loadPrimitiveUnit(compilation, kind) {
  const primitive = compilation.loadDefinition.loadCases
    .flatMap((loadCase) => loadCase.primitives)
    .find((row) => row.kind === kind);
  assert.ok(primitive, `Missing load primitive ${kind}.`);
  const record = primitive.units.find((row) => row.dimension === (
    kind === 'MOMENT_RESULTANT' ? 'moment' : 'force'
  ));
  assert.ok(record, `Missing load unit for ${kind}.`);
  return record.unit;
}

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
