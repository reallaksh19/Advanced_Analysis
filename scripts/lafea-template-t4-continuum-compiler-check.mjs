import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  FORMULATIONS,
  MODEL_SCHEMA,
  QUALIFICATION_PROFILE,
  createCanonicalLocalContinuumModel,
} from '../src/core/local-continuum/index.js';
import {
  validateTemplateBoundaryDefinition,
  validateTemplateGeometryResult,
  validateTemplateHandoff,
  validateTemplateLoadDefinition,
  validateTemplateMeshRequest,
  validateTemplateParameterSchema,
} from '../src/core/lafea-application-templates/contracts.js';
import {
  LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS,
  LAFEA_T4_CONTINUUM_COMPILER_BINDINGS,
  LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS,
  compileLafeaContinuumApplicationTemplate,
  validateT4ContinuumCompilerBinding,
} from '../src/core/lafea-application-templates/t4-continuum.js';

const GEOMETRY_CLASSES = Object.freeze({
  'C2D-BRACKET-GUSSET': 'BRACKET_GUSSET',
  'C2D-CLAMP-EAR': 'CLAMP_EAR',
  'C2D-LUG-PINHOLE': 'LUG_PINHOLE',
  'C2D-NOZZLE-REPAD-SECTION': 'NOZZLE_REPAD_SECTION',
  'C2D-PIPE-PAD-SECTION': 'PIPE_PAD_SECTION',
});

assert.equal(LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS.length, 5);
assert.equal(LAFEA_T4_CONTINUUM_COMPILER_BINDINGS.length, 5);
assert.deepEqual(
  [...LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS].sort(),
  Object.keys(GEOMETRY_CLASSES).sort(),
);
LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS.forEach((schema) => {
  assert.equal(validateTemplateParameterSchema(schema).ok, true);
});
LAFEA_T4_CONTINUUM_COMPILER_BINDINGS.forEach((binding) => {
  assert.equal(validateT4ContinuumCompilerBinding(binding).ok, true);
  assert.equal(binding.status, 'DRAFT');
  assert.equal(binding.entryStageId, 'LAFEA.3');
});

const compiled = new Map();
for (const templateId of LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS) {
  const result = compileLafeaContinuumApplicationTemplate({
    templateId,
    rawParameters: rawParameters(templateId, FORMULATIONS.PLANE_STRESS),
  });
  compiled.set(templateId, result);
  assertCompilation(result, templateId, FORMULATIONS.PLANE_STRESS);
}

for (const templateId of ['C2D-NOZZLE-REPAD-SECTION', 'C2D-PIPE-PAD-SECTION']) {
  const result = compileLafeaContinuumApplicationTemplate({
    templateId,
    rawParameters: rawParameters(templateId, FORMULATIONS.PLANE_STRAIN),
  });
  assertCompilation(result, templateId, FORMULATIONS.PLANE_STRAIN);
}

assert.throws(
  () => compileLafeaContinuumApplicationTemplate({
    templateId: 'C2D-BRACKET-GUSSET',
    rawParameters: rawParameters('C2D-BRACKET-GUSSET', FORMULATIONS.PLANE_STRAIN),
  }),
  /FORMULATION_NOT_AUTHORIZED_FOR_TEMPLATE/,
);
assert.throws(
  () => compileLafeaContinuumApplicationTemplate({
    templateId: 'C2D-FLANGE-HUB',
    rawParameters: {},
  }),
  /AXISYMMETRIC_CONTINUUM_AUTHORITY_PENDING_QUALIFICATION/,
);
assert.throws(
  () => compileLafeaContinuumApplicationTemplate({
    templateId: 'C2D-LUG-PINHOLE',
    rawParameters: rawParameters('C2D-LUG-PINHOLE', FORMULATIONS.PLANE_STRESS, { t3: true }),
  }),
  /T3_(FALLBACK|ELEMENT)_NOT_AUTHORIZED/,
);
assert.throws(
  () => compileLafeaContinuumApplicationTemplate({
    templateId: 'C2D-CLAMP-EAR',
    rawParameters: {
      ...rawParameters('C2D-CLAMP-EAR', FORMULATIONS.PLANE_STRESS),
      unexpected: envelope({ value: true }, 'PARAM#unexpected'),
    },
  }),
  /TEMPLATE_PARAMETERS_BLOCKED/,
);

const original = rawParameters('C2D-PIPE-PAD-SECTION', FORMULATIONS.PLANE_STRESS);
const permuted = clone(original);
permuted.applicationEvidence.value.featureIds.reverse();
permuted.stageSource.value.materials.reverse();
permuted.stageSource.value.nodes.reverse();
permuted.stageSource.value.elements.reverse();
permuted.stageSource.value.constraints.reverse();
permuted.stageSource.value.loadCases.reverse();
permuted.stageSource.value.resultRequests.loadCaseIds.reverse();
permuted.featureSizing.value.items.reverse();
const first = compileLafeaContinuumApplicationTemplate({
  templateId: 'C2D-PIPE-PAD-SECTION', rawParameters: original,
});
const second = compileLafeaContinuumApplicationTemplate({
  templateId: 'C2D-PIPE-PAD-SECTION', rawParameters: permuted,
});
assert.equal(first.semanticHash, second.semanticHash);
assert.equal(semanticHash(first), semanticHash(second));
assert.throws(() => { first.status = 'QUALIFIED'; }, TypeError);

console.log(JSON.stringify({
  status: 'PASS',
  parameterSchemas: LAFEA_T4_CONTINUUM_PARAMETER_SCHEMAS.length,
  compilerBindings: LAFEA_T4_CONTINUUM_COMPILER_BINDINGS.length,
  compiledTemplateIds: LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS,
  executableTemplates: 0,
  meshGenerationPaths: 0,
  engineExecutionPaths: 0,
}, null, 2));

function assertCompilation(result, templateId, formulation) {
  assert.equal(result.status, 'READY');
  assert.equal(result.templateId, templateId);
  assert.equal(result.meshRequest.formulationProfileId, formulation);
  assert.equal(result.meshRequest.meshProfileId, 'CALLER-T6-MESH-PROFILE/V1');
  assert.equal(result.meshRequest.qualityProfileId, 'CALLER-T6-QUALITY-PROFILE/V1');
  assert.ok(result.meshRequest.diagnostics.includes('TEMPLATE_COMPILER_GENERATED_MESH=false'));
  assert.ok(result.handoff.diagnostics.includes('ENGINE_NOT_EXECUTED'));
  assert.equal(result.handoff.meshRequestHash, result.meshRequest.semanticHash);
  assert.equal(result.geometry.ancestry.compilerGeneratedMesh, false);
  assert.equal(result.geometry.ancestry.meshQualificationClaimed, false);
  assert.equal(result.handoff.stageSource.schema, MODEL_SCHEMA);
  assert.equal(result.handoff.stageSource.elementTypePolicy.allowT3Fallback, false);
  assert.ok(result.handoff.stageSource.elements.every((row) => row.elementType === 'T6'));
  assert.equal(createCanonicalLocalContinuumModel(result.handoff.stageSource).formulation, formulation);
  assert.equal(validateTemplateGeometryResult(result.geometry).ok, true);
  assert.equal(validateTemplateLoadDefinition(result.loadDefinition).ok, true);
  assert.equal(validateTemplateBoundaryDefinition(result.boundaryDefinition).ok, true);
  assert.equal(validateTemplateMeshRequest(result.meshRequest).ok, true);
  assert.equal(validateTemplateHandoff(result.handoff).ok, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.handoff.stageSource), true);
}

function rawParameters(templateId, formulation, options = {}) {
  return {
    applicationEvidence: envelope({
      geometryClass: GEOMETRY_CLASSES[templateId],
      declarationBasis: 'CALLER_ENGINEERING_CLASSIFICATION',
      featureIds: ['LOAD-EDGE', 'ROOT-REGION'],
      sourceReference: `APPLICATION#${templateId}`,
    }, `PARAM#${templateId}#applicationEvidence`),
    stageSource: envelope(continuumSource(formulation, options), `PARAM#${templateId}#stageSource`),
    meshProvenance: envelope({
      generationMode: 'CALLER_SUPPLIED_ANALYSIS_MESH',
      meshProfileId: 'CALLER-T6-MESH-PROFILE/V1',
      qualityProfileId: 'CALLER-T6-QUALITY-PROFILE/V1',
      producerIdentity: 'INDEPENDENT-CONTINUUM-MESHER',
      producerVersion: '1',
      sourceReference: `MESH#${templateId}`,
      sourceStatus: 'VERIFIED',
    }, `PARAM#${templateId}#meshProvenance`),
    featureSizing: envelope({
      items: [
        sizing('LOAD-EDGE', 8),
        sizing('ROOT-REGION', 4),
      ],
    }, `PARAM#${templateId}#featureSizing`),
    limitations: envelope({ items: ['NO_APPLICATION_GEOMETRY_INFERENCE'] }, null, null),
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
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: 'T4-CONTINUUM-SOURCE',
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: 'T4-CALLER-SOURCE',
      sourceVersion: '1',
      adapterIdentity: 'T4-CONTINUUM-INTAKE',
      adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', stress: 'MPa', modulus: 'MPa' },
    formulation,
    materials: [{
      materialId: 'MAT',
      elasticModulus: 200000,
      poissonRatio: 0.3,
      sourceReference: 'MATERIAL#MAT',
    }],
    nodes: t3 ? nodes.slice(0, 3) : nodes,
    elements: [{
      elementId: 'E1',
      elementType: t3 ? 'T3' : 'T6',
      nodeIds: t3 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'AB', 'BC', 'CA'],
      materialId: 'MAT',
      thickness: 10,
      sourceReference: 'ELEMENT#E1',
    }],
    elementTypePolicy: {
      allowT3Fallback: t3,
      sourceReference: t3 ? 'BENCHMARK_FALLBACK' : 'PRODUCTION_T6_REQUIRED',
    },
    constraints: [
      constraint('C1', 'A', 'UX', 0),
      constraint('C2', 'A', 'UY', 0),
      constraint('C3', 'B', 'UY', 0),
    ],
    loadCases: [{
      loadCaseId: 'LC1',
      nodalForces: [{
        loadId: 'F1', nodeId: 'B', fx: 1000, fy: 0, sourceReference: 'FORCE#F1',
      }],
      edgeTractions: [],
      pressureLoads: [],
      bodyForces: [],
      temperatureLoads: [],
      imposedDisplacements: [],
      sourceReference: 'CASE#LC1',
    }],
    resultRequests: { loadCaseIds: ['LC1'] },
    qualificationProfile: clone(QUALIFICATION_PROFILE),
    limitations: [],
  };
}

function envelope(value, reference, sourceStatus = 'VERIFIED') {
  return {
    value,
    unit: null,
    sourceRef: reference === null ? null : { reference },
    sourceStatus,
  };
}

function sizing(featureId, targetSize) {
  return {
    featureId,
    targetSize,
    unit: 'mm',
    sourceRef: { reference: `SIZING#${featureId}` },
    status: 'VERIFIED',
  };
}

function node(nodeId, x, y) {
  return { nodeId, x, y, sourceReference: `NODE#${nodeId}` };
}

function constraint(constraintId, nodeId, dof, value) {
  return { constraintId, nodeId, dof, value, sourceReference: `CONSTRAINT#${constraintId}` };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
