#!/usr/bin/env node
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { sourceFixture } from './lafea.1-fixtures.mjs';
import { rawRequestFixture } from './lafea.2-fixtures.mjs';
import {
  FORMULATIONS,
  MODEL_SCHEMA,
  QUALIFICATION_PROFILE,
} from '../src/core/local-continuum/index.js';
import {
  validateTemplateBenchmarkManifest,
} from '../src/core/lafea-application-templates/contracts.js';
import {
  compileLafeaApplicationTemplate,
} from '../src/core/lafea-application-templates/t3-analytical.js';
import {
  compileLafeaContinuumApplicationTemplate,
} from '../src/core/lafea-application-templates/t4-continuum.js';
import {
  LAFEA_T5_CONTROLLED_REFERENCE_CASES,
  LAFEA_T5_QUALIFICATION_TEMPLATE_IDS,
  LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS,
  listT5CompilerReferenceCases,
} from '../src/core/lafea-application-templates/t5-qualification.js';

const ANALYTICAL_IDS = Object.freeze([
  'ALG-LOAD-REFERENCE-TRANSFER',
  'ALG-PIPE-SECTION-COMBINED',
]);
const CONTINUUM_FORMULATIONS = Object.freeze({
  'C2D-LUG-PINHOLE': FORMULATIONS.PLANE_STRESS,
  'C2D-PIPE-PAD-SECTION': FORMULATIONS.PLANE_STRAIN,
});

assert.deepEqual(
  LAFEA_T5_QUALIFICATION_TEMPLATE_IDS,
  [...ANALYTICAL_IDS, ...Object.keys(CONTINUUM_FORMULATIONS)],
);
assert.equal(LAFEA_T5_CONTROLLED_REFERENCE_CASES.length, 30);
assert.equal(LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS.length, 4);

const runtimeEvidence = [];
for (const templateId of LAFEA_T5_QUALIFICATION_TEMPLATE_IDS) {
  const baselineInput = controlledInput(templateId);
  const reorderedInput = reorderedControlledInput(templateId, baselineInput);
  const baseline = compile(templateId, baselineInput);
  const reordered = compile(templateId, reorderedInput);

  const actualBySuffix = new Map([
    ['PARAM-01', parameterProjection(baseline)],
    ['GEOMETRY-01', geometryProjection(baseline)],
    ['LOAD-01', loadProjection(baseline)],
    ['BOUNDARY-01', boundaryProjection(baseline)],
    ['HANDOFF-01', handoffProjection(baseline)],
    ['HASH-01', determinismProjection(templateId, baseline, reordered)],
    ['FAIL-01', failureProjection(templateId)],
  ]);
  if (baseline.meshRequest !== null) {
    actualBySuffix.set('MESH-REQUEST-01', meshProjection(baseline));
  }

  for (const reference of listT5CompilerReferenceCases(templateId)) {
    const actual = actualBySuffix.get(reference.caseSuffix);
    assert.ok(actual, `Missing actual projection ${reference.benchmarkId}.`);
    const actualHash = semanticHash(actual);
    assert.equal(
      actualHash,
      reference.expectedResultHash,
      `Controlled reference mismatch for ${reference.benchmarkId}.`,
    );
    assert.deepEqual(actual, reference.expected);
    runtimeEvidence.push({
      benchmarkId: reference.benchmarkId,
      expectedResultHash: reference.expectedResultHash,
      actualResultHash: actualHash,
      status: 'PASS',
    });
  }

  assert.equal(baseline.semanticHash, reordered.semanticHash);
  assert.equal(baseline.handoff.semanticHash, reordered.handoff.semanticHash);
  assert.equal(Object.isFrozen(baseline), true);
  assert.equal(Object.isFrozen(baseline.handoff), true);
}

for (const manifest of LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS) {
  assert.equal(validateTemplateBenchmarkManifest(manifest).ok, true);
  assert.equal(manifest.qualificationStatus, 'NOT_QUALIFIED');
  const golden = manifest.benchmarks.find((row) => row.benchmarkId.endsWith('GOLDEN-E2E-01'));
  assert.ok(golden);
  assert.equal(golden.status, 'BLOCKED');
  assert.equal(golden.expectedResultHash, null);
  const compilerCases = manifest.benchmarks.filter(
    (row) => !row.benchmarkId.endsWith('GOLDEN-E2E-01'),
  );
  assert.ok(compilerCases.length >= 7);
  compilerCases.forEach((row) => {
    assert.equal(row.status, 'NOT_RUN');
    assert.equal(row.evidenceBasis, 'CONTROLLED_REFERENCE_DATASET');
    assert.match(row.expectedResultHash, /^fnv1a64:[0-9a-f]{16}$/u);
  });
}
assert.equal(
  LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS.some(
    (manifest) => manifest.qualificationStatus === 'QUALIFIED',
  ),
  false,
);

console.log(JSON.stringify({
  check: 'lafea-template-t5-compiler-golden',
  status: 'PASS',
  qualificationTemplateCount: LAFEA_T5_QUALIFICATION_TEMPLATE_IDS.length,
  controlledReferenceCaseCount: LAFEA_T5_CONTROLLED_REFERENCE_CASES.length,
  runtimePassCount: runtimeEvidence.length,
  candidateManifestCount: LAFEA_T5_TEMPLATE_BENCHMARK_MANIFESTS.length,
  qualifiedManifestCount: 0,
  executableTemplateCount: 0,
  engineExecutionPaths: 0,
  meshGenerationPaths: 0,
  endToEndGoldenStatus: 'BLOCKED',
}, null, 2));

function compile(templateId, rawParameters) {
  if (ANALYTICAL_IDS.includes(templateId)) {
    return compileLafeaApplicationTemplate({ templateId, rawParameters });
  }
  return compileLafeaContinuumApplicationTemplate({ templateId, rawParameters });
}

function controlledInput(templateId) {
  if (templateId === 'ALG-LOAD-REFERENCE-TRANSFER') {
    return loadTransferParameters(sourceFixture());
  }
  if (templateId === 'ALG-PIPE-SECTION-COMBINED') {
    return pipeSectionParameters(rawRequestFixture());
  }
  return continuumParameters(templateId, CONTINUUM_FORMULATIONS[templateId]);
}

function reorderedControlledInput(templateId, baseline) {
  const input = clone(baseline);
  if (templateId === 'ALG-LOAD-REFERENCE-TRANSFER') {
    input.pipeContext.value.materials.reverse();
    input.loadTransfer.value.loadReferencePoints.reverse();
    input.loadTransfer.value.loadCases.reverse();
    return input;
  }
  if (templateId === 'ALG-PIPE-SECTION-COMBINED') {
    input.screeningCases.value.values.reverse();
    input.screeningCases.value.values.forEach((row) => row.mechanicalTerms.reverse());
    input.evaluationLocations.value.values.reverse();
    input.envelopeQuantities.value.values.reverse();
    return input;
  }
  input.applicationEvidence.value.featureIds.reverse();
  input.stageSource.value.materials.reverse();
  input.stageSource.value.nodes.reverse();
  input.stageSource.value.elements.reverse();
  input.stageSource.value.constraints.reverse();
  input.stageSource.value.loadCases.reverse();
  input.stageSource.value.loadCases.forEach((loadCase) => {
    loadCase.nodalForces.reverse();
    loadCase.edgeTractions.reverse();
    loadCase.pressureLoads.reverse();
    loadCase.bodyForces.reverse();
    loadCase.temperatureLoads.reverse();
    loadCase.imposedDisplacements.reverse();
  });
  input.stageSource.value.resultRequests.loadCaseIds.reverse();
  input.featureSizing.value.items.reverse();
  return input;
}

function parameterProjection(result) {
  return {
    templateId: result.templateId,
    parameterIds: result.parameterSet.values.map((row) => row.parameterId),
    states: result.parameterSet.values.map((row) => row.state),
  };
}

function geometryProjection(result) {
  const base = {
    templateId: result.templateId,
    coordinateIdentity: result.geometry.coordinateSystem.identity,
    featureKinds: uniqueSorted(result.geometry.features.map((row) => row.kind)),
  };
  if (result.geometry.ancestry.applicationGeometryClass !== undefined) {
    return {
      templateId: base.templateId,
      applicationGeometryClass: result.geometry.ancestry.applicationGeometryClass,
      coordinateIdentity: base.coordinateIdentity,
      featureKinds: base.featureKinds,
    };
  }
  return base;
}

function loadProjection(result) {
  return {
    templateId: result.templateId,
    loadKinds: uniqueSorted(
      result.loadDefinition.loadCases.flatMap((loadCase) => (
        loadCase.primitives.map((primitive) => primitive.kind)
      )),
    ),
  };
}

function boundaryProjection(result) {
  return {
    templateId: result.templateId,
    boundaryKinds: uniqueSorted(
      result.boundaryDefinition.boundaryConditions.map((row) => row.kind),
    ),
  };
}

function meshProjection(result) {
  return {
    templateId: result.templateId,
    compilerGeneratedMesh: result.geometry.ancestry.compilerGeneratedMesh,
    elementTypes: uniqueSorted(
      result.handoff.stageSource.elements.map((row) => row.elementType),
    ),
    formulation: result.meshRequest.formulationProfileId,
    meshProfileId: result.meshRequest.meshProfileId,
    qualityProfileId: result.meshRequest.qualityProfileId,
  };
}

function handoffProjection(result) {
  return {
    templateId: result.templateId,
    engineExecuted: !result.handoff.diagnostics.includes('ENGINE_NOT_EXECUTED'),
    entryStageId: result.handoff.entryStageId,
    meshRequestPresent: result.meshRequest !== null,
    stageSourceSchema: result.handoff.stageSource.schema,
  };
}

function determinismProjection(templateId, baseline, reordered) {
  return {
    templateId,
    compilationHashEqual: baseline.semanticHash === reordered.semanticHash,
    handoffHashEqual: baseline.handoff.semanticHash === reordered.handoff.semanticHash,
  };
}

function failureProjection(templateId) {
  let invocation;
  if (templateId === 'ALG-LOAD-REFERENCE-TRANSFER') {
    invocation = () => compileLafeaApplicationTemplate({
      templateId,
      rawParameters: {
        ...loadTransferParameters(sourceFixture()),
        unexpected: envelope('x', 'unexpected'),
      },
    });
  } else if (templateId === 'ALG-PIPE-SECTION-COMBINED') {
    invocation = () => compileLafeaApplicationTemplate({
      templateId,
      rawParameters: {
        ...pipeSectionParameters(rawRequestFixture()),
        unexpected: envelope('x', 'unexpected'),
      },
    });
  } else if (templateId === 'C2D-LUG-PINHOLE') {
    invocation = () => compileLafeaContinuumApplicationTemplate({
      templateId,
      rawParameters: continuumParameters(
        templateId,
        FORMULATIONS.PLANE_STRESS,
        { t3: true },
      ),
    });
  } else {
    const invalid = continuumParameters(templateId, FORMULATIONS.PLANE_STRAIN);
    invalid.featureSizing.value.items.push(sizing('UNKNOWN', 2));
    invocation = () => compileLafeaContinuumApplicationTemplate({
      templateId,
      rawParameters: invalid,
    });
  }
  let caught;
  try {
    invocation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected ${templateId} unsupported combination to block.`);
  return {
    templateId,
    blocked: true,
    errorCode: normalizedErrorCode(caught),
  };
}

function normalizedErrorCode(error) {
  const text = `${error?.code ?? ''}\n${error?.message ?? error ?? ''}`;
  const known = [
    'TEMPLATE_PARAMETERS_BLOCKED',
    'T3_FALLBACK_NOT_AUTHORIZED_FOR_T4_TEMPLATE_COMPILERS',
    'T3_ELEMENT_NOT_AUTHORIZED_FOR_T4_TEMPLATE_COMPILERS',
    'UNKNOWN_FEATURE_SIZING_ID',
  ];
  const match = known.find((code) => text.includes(code));
  if (!match) throw new TypeError(`Unclassified benchmark failure: ${text}`);
  return match;
}

function loadTransferParameters(source) {
  return {
    identity: envelope({
      modelIdentity: source.modelIdentity,
      modelVersion: source.modelVersion,
      sourceModelIdentity: source.sourceAncestry.sourceModelIdentity,
      sourceVersion: source.sourceAncestry.sourceVersion,
      adapterIdentity: 'LAFEA-T5-CONTROLLED-REFERENCE',
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

function continuumParameters(templateId, formulation, options = {}) {
  const geometryClass = templateId === 'C2D-LUG-PINHOLE'
    ? 'LUG_PINHOLE'
    : 'PIPE_PAD_SECTION';
  return {
    applicationEvidence: verifiedEnvelope({
      geometryClass,
      declarationBasis: 'CONTROLLED_ENGINEERING_CLASSIFICATION',
      featureIds: ['LOAD-EDGE', 'ROOT-REGION'],
      sourceReference: `T5-APPLICATION#${templateId}`,
    }, `PARAM#${templateId}#applicationEvidence`),
    stageSource: verifiedEnvelope(
      continuumSource(formulation, options),
      `PARAM#${templateId}#stageSource`,
    ),
    meshProvenance: verifiedEnvelope({
      generationMode: 'CALLER_SUPPLIED_ANALYSIS_MESH',
      meshProfileId: 'T5-CONTROLLED-T6-MESH/V1',
      qualityProfileId: 'T5-CONTROLLED-T6-QUALITY/V1',
      producerIdentity: 'T5-INDEPENDENT-CONTROLLED-MESHER',
      producerVersion: '1',
      sourceReference: `T5-MESH#${templateId}`,
      sourceStatus: 'VERIFIED',
    }, `PARAM#${templateId}#meshProvenance`),
    featureSizing: verifiedEnvelope({
      items: [
        sizing('LOAD-EDGE', 8),
        sizing('ROOT-REGION', 4),
      ],
    }, `PARAM#${templateId}#featureSizing`),
    limitations: {
      value: { items: ['NO_END_TO_END_ENGINE_QUALIFICATION'] },
      unit: null,
      sourceRef: null,
      sourceStatus: null,
    },
  };
}

function continuumSource(formulation, options) {
  const t3 = options.t3 === true;
  const nodes = [
    node('A', 0, 0),
    node('B', 100, 0),
    node('C', 0, 100),
    node('AB', 50, 0),
    node('BC', 50, 50),
    node('CA', 0, 50),
  ];
  const element = {
    elementId: 'E1',
    elementType: t3 ? 'T3' : 'T6',
    nodeIds: t3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'AB', 'BC', 'CA'],
    materialId: 'MAT',
    thickness: 10,
    sourceReference: 'T5-ELEMENT#E1',
  };
  const edgeAB = t3 ? ['A', 'B'] : ['A', 'B', 'AB'];
  const edgeBC = t3 ? ['B', 'C'] : ['B', 'C', 'BC'];
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: 'T5-CONTROLLED-CONTINUUM-SOURCE',
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: 'T5-CONTROLLED-REFERENCE-DATASET',
      sourceVersion: '1',
      adapterIdentity: 'T5-CONTINUUM-SOURCE-INTAKE',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation,
    materials: [{
      materialId: 'MAT',
      elasticModulus: 200000,
      poissonRatio: 0.3,
      sourceReference: 'T5-MATERIAL#MAT',
    }],
    nodes: t3 ? nodes.slice(0, 3) : nodes,
    elements: [element],
    elementTypePolicy: {
      allowT3Fallback: t3,
      sourceReference: t3
        ? 'T5-NEGATIVE-T3-FALLBACK'
        : 'T5-CONTROLLED-T6-PRODUCTION-POLICY',
    },
    constraints: [
      constraint('C1', 'A', 'UX', 0),
      constraint('C2', 'A', 'UY', 0),
      constraint('C3', 'B', 'UY', 0),
    ],
    loadCases: [{
      loadCaseId: 'LC-ALL',
      nodalForces: [{
        loadId: 'F1',
        nodeId: 'B',
        fx: 1000,
        fy: -250,
        sourceReference: 'T5-FORCE#F1',
      }],
      edgeTractions: [{
        tractionId: 'T1',
        elementId: 'E1',
        edgeNodeIds: edgeAB,
        tx: 2,
        ty: -1,
        sourceReference: 'T5-TRACTION#T1',
      }],
      pressureLoads: [{
        pressureLoadId: 'P1',
        elementId: 'E1',
        edgeNodeIds: edgeBC,
        pressure: 1.5,
        sourceReference: 'T5-PRESSURE#P1',
      }],
      bodyForces: [{
        bodyForceId: 'B1',
        elementId: 'E1',
        bx: 0.01,
        by: -0.02,
        sourceReference: 'T5-BODY#B1',
      }],
      temperatureLoads: [{
        temperatureLoadId: 'TH1',
        elementId: 'E1',
        thermalStrain: 0.00012,
        sourceReference: 'T5-THERMAL#TH1',
      }],
      imposedDisplacements: [{
        imposedDisplacementId: 'D1',
        nodeId: 'C',
        dof: 'UX',
        value: 0.25,
        sourceReference: 'T5-DISPLACEMENT#D1',
      }],
      sourceReference: 'T5-CASE#LC-ALL',
    }],
    resultRequests: { loadCaseIds: ['LC-ALL'] },
    qualificationProfile: clone(QUALIFICATION_PROFILE),
    limitations: [],
  };
}

function envelope(value, path, sourceStatus = 'IMPORTED') {
  return {
    value,
    unit: null,
    sourceRef: path === null ? null : { document: 'T5-CHECK', path },
    sourceStatus,
  };
}

function verifiedEnvelope(value, reference) {
  return {
    value,
    unit: null,
    sourceRef: { reference },
    sourceStatus: 'VERIFIED',
  };
}

function sizing(featureId, targetSize) {
  return {
    featureId,
    targetSize,
    unit: 'mm',
    sourceRef: { reference: `T5-SIZING#${featureId}` },
    status: 'VERIFIED',
  };
}

function node(nodeId, x, y) {
  return { nodeId, x, y, sourceReference: `T5-NODE#${nodeId}` };
}

function constraint(constraintId, nodeId, dof, value) {
  return {
    constraintId,
    nodeId,
    dof,
    value,
    sourceReference: `T5-CONSTRAINT#${constraintId}`,
  };
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(codeSort);
}

function codeSort(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
