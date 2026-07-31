#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_APPLICATION_TEMPLATE_IDS,
  LAFEA_APPLICATION_TEMPLATE_REGISTRY,
  LAFEA_APPLICATION_TEMPLATE_SCHEMA,
  LAFEA_BUCKET_IDS,
  LAFEA_COMPUTATIONAL_BUCKET_REGISTRY,
  LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS,
  LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  LAFEA_TEMPLATE_BENCHMARK_MANIFEST_SCHEMA,
  LAFEA_TEMPLATE_BOUNDARY_DEFINITION_SCHEMA,
  LAFEA_TEMPLATE_GEOMETRY_RESULT_SCHEMA,
  LAFEA_TEMPLATE_HANDOFF_SCHEMA,
  LAFEA_TEMPLATE_LOAD_DEFINITION_SCHEMA,
  LAFEA_TEMPLATE_MESH_REQUEST_SCHEMA,
  LAFEA_TEMPLATE_PARAMETER_SCHEMA,
  LAFEA_TEMPLATE_RELEASE_RECORD_SCHEMA,
  assertCurrentTemplateHandoff,
  assertCurrentTemplateReleaseRecord,
  createApplicationTemplate,
  createInitialTemplateReadinessContext,
  createTemplateBenchmarkManifest,
  createTemplateBoundaryDefinition,
  createTemplateGeometryResult,
  createTemplateHandoff,
  createTemplateLoadDefinition,
  createTemplateMeshRequest,
  createTemplateParameterSchema,
  createTemplateReleaseRecord,
  evaluateTemplateRegistryReadiness,
  requireLafeaApplicationTemplate,
  stageRegistryDependencyHash,
  validateApplicationTemplate,
  validateLafeaComputationalBucketRegistry,
  validateTemplateBenchmarkManifest,
  validateTemplateBoundaryDefinition,
  validateTemplateGeometryResult,
  validateTemplateHandoff,
  validateTemplateLoadDefinition,
  validateTemplateMeshRequest,
  validateTemplateParameterSchema,
  validateTemplateParameters,
  validateTemplateReleaseRecord,
} from '../src/core/lafea-application-templates/index.js';

import {
  LAFEA_STAGE_REGISTRY,
} from '../src/workspace/lafea-stage-registry.js';

const ZERO_HASH = 'fnv1a64:0000000000000000';

assert.equal(LAFEA_APPLICATION_TEMPLATE_SCHEMA, 'lafea-application-template/v1');
assert.equal(LAFEA_TEMPLATE_PARAMETER_SCHEMA, 'lafea-template-parameter-schema/v1');
assert.equal(LAFEA_TEMPLATE_GEOMETRY_RESULT_SCHEMA, 'lafea-template-geometry-result/v1');
assert.equal(LAFEA_TEMPLATE_LOAD_DEFINITION_SCHEMA, 'lafea-template-load-definition/v1');
assert.equal(
  LAFEA_TEMPLATE_BOUNDARY_DEFINITION_SCHEMA,
  'lafea-template-boundary-definition/v1',
);
assert.equal(LAFEA_TEMPLATE_MESH_REQUEST_SCHEMA, 'lafea-template-mesh-request/v1');
assert.equal(LAFEA_TEMPLATE_HANDOFF_SCHEMA, 'lafea-template-handoff/v1');
assert.equal(
  LAFEA_TEMPLATE_BENCHMARK_MANIFEST_SCHEMA,
  'lafea-template-benchmark-manifest/v1',
);
assert.equal(LAFEA_TEMPLATE_RELEASE_RECORD_SCHEMA, 'lafea-template-release-record/v1');

assert.deepEqual(LAFEA_BUCKET_IDS, [
  'ANALYTICAL_MECHANICS',
  'CONTINUUM_2D_FEA',
  'RECOVERY_ASSESSMENT',
  'SURFACE_SHELL_FEA',
]);
assert.equal(LAFEA_COMPUTATIONAL_BUCKET_REGISTRY.length, 4);
assert.equal(validateLafeaComputationalBucketRegistry().ok, true);
assert.equal(LAFEA_APPLICATION_TEMPLATE_REGISTRY.length, 27);
assert.equal(LAFEA_APPLICATION_TEMPLATE_IDS.length, 27);
assert.equal(new Set(LAFEA_APPLICATION_TEMPLATE_IDS).size, 27);
assert.equal(LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS.length, 27);

assert.deepEqual(
  [...LAFEA_APPLICATION_TEMPLATE_IDS],
  [...LAFEA_APPLICATION_TEMPLATE_IDS].sort(asciiCompare),
);
assert.equal(
  stageRegistryDependencyHash(),
  LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
);
assert.equal(
  stageRegistryDependencyHash([...LAFEA_STAGE_REGISTRY].reverse()),
  LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
);
const changedRegistry = structuredClone(LAFEA_STAGE_REGISTRY);
changedRegistry[0].enginePackage = 'changed-engine-package';
assert.notEqual(
  stageRegistryDependencyHash(changedRegistry),
  LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
);

for (const bucket of LAFEA_COMPUTATIONAL_BUCKET_REGISTRY) {
  assertDeepFrozen(bucket);
}
for (const template of LAFEA_APPLICATION_TEMPLATE_REGISTRY) {
  assert.equal(validateApplicationTemplate(template).ok, true, template.templateId);
  assertDeepFrozen(template);
  assert.equal(template.parentRegistryHash, LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH);
}
for (const manifest of LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS) {
  assert.equal(validateTemplateBenchmarkManifest(manifest).ok, true);
  assertDeepFrozen(manifest);
  assert.notEqual(manifest.qualificationStatus, 'QUALIFIED');
  assert.ok(manifest.benchmarks.every((item) => item.expectedResultHash === null));
}

assert.equal(
  requireLafeaApplicationTemplate('C2D-FLANGE-HUB').releaseStatus,
  'BLOCKED',
);
assert.equal(
  requireLafeaApplicationTemplate('ALG-WELD-GROUP-RECTANGULAR').releaseStatus,
  'BLOCKED',
);
for (const template of LAFEA_APPLICATION_TEMPLATE_REGISTRY) {
  if (template.bucketId === 'SURFACE_SHELL_FEA') {
    assert.equal(template.releaseStatus, 'BLOCKED');
  }
  if (template.bucketId === 'RECOVERY_ASSESSMENT') {
    assert.equal(template.releaseStatus, 'BLOCKED');
  }
}

const readinessContext = createInitialTemplateReadinessContext({
  benchmarkManifests: LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS,
});
const readiness = evaluateTemplateRegistryReadiness(
  LAFEA_APPLICATION_TEMPLATE_REGISTRY,
  readinessContext,
);
assert.equal(readiness.length, 27);
assert.ok(readiness.every((item) => item.executable === false));
assert.ok(readiness.every((item) => ['BLOCKED', 'STALE'].includes(item.status)));
assert.ok(
  readiness
    .filter((item) => item.templateId.startsWith('SHL-'))
    .every((item) => item.reasons.includes('PRODUCTION_SHELL_FORMULATION_NOT_REGISTERED')),
);
assert.ok(
  readiness
    .filter((item) => item.templateId.startsWith('ALG-WELD-GROUP-'))
    .every((item) => item.reasons.includes('LAFEA6_ENGINE_NOT_IMPLEMENTED')),
);

const parameterSchema = createTemplateParameterSchema({
  parameterSchemaId: 'test-parameters/v1',
  templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  parameters: [
    {
      parameterId: 'elasticModulus',
      label: 'Elastic modulus',
      valueKind: 'FINITE_NUMBER',
      required: true,
      nullable: false,
      canonicalUnit: 'MPa',
      allowedUnits: ['MPa'],
      minimum: 0,
      maximum: null,
      enumValues: [],
      sourceRequired: true,
      dependencies: [],
    },
    {
      parameterId: 'nullableOffset',
      label: 'Nullable offset',
      valueKind: 'FINITE_NUMBER',
      required: false,
      nullable: true,
      canonicalUnit: 'mm',
      allowedUnits: ['mm'],
      minimum: null,
      maximum: null,
      enumValues: [],
      sourceRequired: false,
      dependencies: [],
    },
    {
      parameterId: 'optionalNote',
      label: 'Optional note',
      valueKind: 'TEXT',
      required: false,
      nullable: false,
      canonicalUnit: null,
      allowedUnits: [],
      minimum: null,
      maximum: null,
      enumValues: [],
      sourceRequired: false,
      dependencies: [],
    },
  ],
  limitations: [],
});
assert.equal(validateTemplateParameterSchema(parameterSchema).ok, true);
assertDeepFrozen(parameterSchema);

const sourceRef = { documentId: 'MAT-SPEC-17', revision: '4' };
const validParameters = validateTemplateParameters(parameterSchema, {
  elasticModulus: {
    value: '0.0',
    unit: 'MPa',
    sourceRef,
    sourceStatus: 'VERIFIED',
  },
  nullableOffset: {
    value: null,
    unit: 'mm',
    sourceRef: null,
    sourceStatus: 'DECLARED',
  },
});
assert.equal(validParameters.status, 'VALID');
assert.equal(valueState(validParameters, 'elasticModulus'), 'EXPLICIT_ZERO');
assert.equal(valueState(validParameters, 'nullableOffset'), 'PRESENT_NULL');
assert.equal(valueState(validParameters, 'optionalNote'), 'MISSING');
assert.deepEqual(
  validParameters.values.find((item) => item.parameterId === 'elasticModulus').sourceRef,
  sourceRef,
);

const blankParameters = validateTemplateParameters(parameterSchema, {
  elasticModulus: {
    value: ' ',
    unit: 'MPa',
    sourceRef,
    sourceStatus: 'VERIFIED',
  },
});
assert.equal(blankParameters.status, 'BLOCKED');
assert.equal(valueState(blankParameters, 'elasticModulus'), 'EMPTY_TEXT');

const invalidParameters = validateTemplateParameters(parameterSchema, {
  elasticModulus: {
    value: 'not-a-number',
    unit: 'MPa',
    sourceRef,
    sourceStatus: 'VERIFIED',
  },
});
assert.equal(invalidParameters.status, 'BLOCKED');
assert.equal(valueState(invalidParameters, 'elasticModulus'), 'INVALID');

const extraTemplateInput = baseTemplateInput();
assert.throws(
  () => createApplicationTemplate({ ...extraTemplateInput, unexpected: true }),
  /keys are invalid/u,
);

const template = createApplicationTemplate(baseTemplateInput());
assert.equal(validateApplicationTemplate(template).ok, true);
assert.throws(() => {
  template.label = 'mutated';
}, TypeError);

const geometry = createTemplateGeometryResult({
  templateId: template.templateId,
  templateSemanticHash: template.semanticHash,
  parameterSetHash: validParameters.semanticHash,
  parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  compilerId: 'test-geometry/v1',
  compilerVersion: 'v1',
  coordinateSystem: {
    identity: 'GLOBAL',
    origin: [0, 0, 0],
    axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    handedness: 'RIGHT_HANDED',
    sourceRef,
    status: 'VERIFIED',
  },
  units: [{ dimension: 'length', unit: 'mm' }],
  features: [{
    featureId: 'FEATURE-1',
    kind: 'POINT',
    geometry: { point: [0, 0, 0] },
    sourceRefs: [sourceRef],
    status: 'VERIFIED',
  }],
  localFrames: [],
  ancestry: { sourceModelId: 'MODEL-1' },
  status: 'READY',
  diagnostics: [],
});
assert.equal(validateTemplateGeometryResult(geometry).ok, true);

const loads = createTemplateLoadDefinition({
  templateId: template.templateId,
  templateSemanticHash: template.semanticHash,
  parameterSetHash: validParameters.semanticHash,
  parentGeometryHash: geometry.semanticHash,
  compilerId: 'test-load/v1',
  loadCases: [{
    caseId: 'LC-1',
    primitives: [{
      loadId: 'LOAD-1',
      kind: 'RESULTANT',
      entityId: 'FEATURE-1',
      basis: 'GLOBAL',
      referencePoint: [0, 0, 0],
      values: { force: [1, 2, 3], moment: [4, 5, 6] },
      units: [{ force: 'N', moment: 'N-mm' }],
      sourceRef,
      status: 'VERIFIED',
    }],
    sourceRefs: [sourceRef],
    status: 'VERIFIED',
  }],
  status: 'READY',
  diagnostics: [],
});
assert.equal(validateTemplateLoadDefinition(loads).ok, true);

const boundaries = createTemplateBoundaryDefinition({
  templateId: template.templateId,
  templateSemanticHash: template.semanticHash,
  parameterSetHash: validParameters.semanticHash,
  parentGeometryHash: geometry.semanticHash,
  compilerId: 'test-boundary/v1',
  boundaryConditions: [{
    boundaryId: 'BC-1',
    kind: 'FIXED_POINT',
    entityId: 'FEATURE-1',
    basis: 'GLOBAL',
    values: { UX: 0, UY: 0, UZ: 0 },
    units: [{ displacement: 'mm' }],
    sourceRef,
    status: 'VERIFIED',
  }],
  status: 'READY',
  diagnostics: [],
});
assert.equal(validateTemplateBoundaryDefinition(boundaries).ok, true);

const mesh = createTemplateMeshRequest({
  templateId: template.templateId,
  templateSemanticHash: template.semanticHash,
  parentGeometryHash: geometry.semanticHash,
  bucketId: 'CONTINUUM_2D_FEA',
  entryStageId: 'LAFEA.3',
  formulationProfileId: 'PLANE_STRESS',
  meshProfileId: 'TEST-MESH-V1',
  qualityProfileId: 'TEST-QUALITY-V1',
  featureSizing: [{
    featureId: 'FEATURE-1',
    targetSize: 5,
    unit: 'mm',
    sourceRef,
    status: 'VERIFIED',
  }],
  status: 'READY',
  diagnostics: [],
});
assert.equal(validateTemplateMeshRequest(mesh).ok, true);

const handoff = createTemplateHandoff({
  templateId: template.templateId,
  templateSemanticHash: template.semanticHash,
  parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  entryStageId: template.entryStageId,
  requiredEnginePackage: template.requiredEnginePackage,
  requiredInputContractRole: template.requiredInputContractRole,
  parameterSetHash: validParameters.semanticHash,
  geometryHash: geometry.semanticHash,
  loadDefinitionHash: loads.semanticHash,
  boundaryDefinitionHash: boundaries.semanticHash,
  meshRequestHash: null,
  stageSource: { schema: 'test-stage-source/v1' },
  status: 'READY',
  diagnostics: [],
});
assert.equal(validateTemplateHandoff(handoff).ok, true);
assert.equal(
  assertCurrentTemplateHandoff(handoff, {
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
    templateSemanticHash: template.semanticHash,
  }),
  handoff,
);
assert.throws(
  () => assertCurrentTemplateHandoff(handoff, {
    parentRegistryHash: ZERO_HASH,
    templateSemanticHash: template.semanticHash,
  }),
  /STALE_TEMPLATE_REGISTRY_PARENT/u,
);

const manifest = createTemplateBenchmarkManifest({
  benchmarkManifestId: template.benchmarkManifestId,
  templateId: template.templateId,
  bucketId: template.bucketId,
  revision: 1,
  parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  bucketBenchmarkManifestId: 'BM-BUCKET-A-TEST-V1',
  benchmarks: [{
    benchmarkId: 'TEST-PARAM-01',
    category: 'PARAMETER_BOUNDARY',
    evidenceBasis: 'UNRESOLVED',
    expectedResultHash: null,
    sourceRef,
    toleranceProfileId: null,
    status: 'UNRESOLVED',
  }],
  qualificationStatus: 'NOT_QUALIFIED',
  limitations: ['Independent expected evidence is pending.'],
});
assert.equal(validateTemplateBenchmarkManifest(manifest).ok, true);

const release = createTemplateReleaseRecord({
  templateId: template.templateId,
  templateSemanticHash: template.semanticHash,
  parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  benchmarkManifestHash: manifest.semanticHash,
  benchmarkQualificationStatus: manifest.qualificationStatus,
  exactHeadSha: null,
  releaseStatus: 'CONCEPT',
  executable: false,
  limitations: ['Not qualified.'],
  diagnostics: [],
});
assert.equal(validateTemplateReleaseRecord(release).ok, true);
assert.equal(
  assertCurrentTemplateReleaseRecord(release, {
    templateSemanticHash: template.semanticHash,
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
    benchmarkManifestHash: manifest.semanticHash,
  }),
  release,
);
assert.throws(
  () => assertCurrentTemplateReleaseRecord(release, {
    templateSemanticHash: template.semanticHash,
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
    benchmarkManifestHash: ZERO_HASH,
  }),
  /STALE_TEMPLATE_BENCHMARK_PARENT/u,
);

console.log(JSON.stringify({
  check: 'lafea-template-t1-contracts',
  status: 'PASS',
  bucketCount: LAFEA_COMPUTATIONAL_BUCKET_REGISTRY.length,
  templateCount: LAFEA_APPLICATION_TEMPLATE_REGISTRY.length,
  executableTemplateCount: readiness.filter((item) => item.executable).length,
  blockedTemplateCount: readiness.filter((item) => !item.executable).length,
  benchmarkManifestCount: LAFEA_INITIAL_TEMPLATE_BENCHMARK_MANIFESTS.length,
  stageRegistryDependencyHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
}));

function baseTemplateInput() {
  return {
    templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
    templateRevision: 1,
    label: 'Load reference transfer test',
    applicationFamily: 'LOAD_TRANSFER',
    bucketId: 'ANALYTICAL_MECHANICS',
    entryStageId: 'LAFEA.1',
    compatibleStageIds: ['LAFEA.1'],
    requiredStageEngineState: 'QUALIFIED_ROUTE_REGISTERED',
    requiredEnginePackage: 'local-stress',
    requiredStageAuthority: 'LOAD_TRANSFER_AND_PRESSURE_BASELINE_ONLY',
    requiredInputContractRole: 'LOCAL_ATTACHMENT_FOUNDATION_SOURCE',
    requiredResultContractRole: 'LOCAL_ATTACHMENT_FOUNDATION_RESULT',
    parameterSchemaId: 'test-parameters/v1',
    geometryCompilerId: null,
    loadCompilerId: null,
    boundaryCompilerId: null,
    formulationProfileId: null,
    meshProfileId: null,
    solverProfileId: 'RESULTANT_TRANSFER_V1',
    recoveryProfileId: null,
    assessmentProfileIds: [],
    benchmarkManifestId: 'BM-ALG-LOAD-REFERENCE-TRANSFER-TEST',
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
    releaseStatus: 'CONCEPT',
    limitations: ['Test concept only.'],
  };
}

function valueState(parameterSet, parameterId) {
  return parameterSet.values.find((item) => item.parameterId === parameterId).state;
}

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach((child) => assertDeepFrozen(child, seen));
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
