#!/usr/bin/env node

/** M012 CONTENTS/INSULATION gravity expansion through DISTRIBUTED_WEIGHT. */
import assert from 'node:assert/strict';
import { FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import {
  resolveLinearFeaMaterialState,
  sealMaterialTable,
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
} from '../src/core/linear-fea-material/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { expandPipeWallGravitySourceAuthorities } from '../src/core/linear-piping-analysis-consumer/gravity-expansion.js';
import {
  GRAVITY_DISTRIBUTED_WEIGHT_COLLISION_CODE,
  GRAVITY_DISTRIBUTED_WEIGHT_MISSING_CODE,
} from '../src/core/linear-piping-analysis-consumer/gravity-expansion-mass-sources.js';
import {
  axisResult,
  compilerProfile,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { loadCaseProfile } from './lfea-b3.3-solver-fixtures.mjs';

const ELEMENT_ID = 'E-M012-0001';
const MATERIAL_STATE_ID = 'MAT-A106B-APPENDIX-S';
const SECTION_STATE_ID = 'SEC-NPS16-SCH30-STD';
const GRAVITY_ID = 'LP-M012-GRAVITY';
const LENGTH = 2;
const OUTER_DIAMETER = 0.4064;
const WALL_THICKNESS = 0.00953;
const PIPE_DENSITY = 7833.4;
const CONTENTS_MASS_PER_LENGTH = 117.841;
const INSULATION_MASS_PER_LENGTH = 37.456;
const RELATIVE_TOLERANCE = 1e-10;

const material = materialAuthority();
const section = sectionAuthority();
const axes = axisResult([0, 0, 0], [LENGTH, 0, 0]);
const compilation = compileMechanicalModel(mechanicalModelInput(material, section, axes));
const frameElement = compileFrameElement({
  elementId: ELEMENT_ID,
  material,
  section,
  localAxes: { result: axes, profile: FRAME_LOCAL_AXIS_PROFILE },
  profile: eulerBernoulliProfile(),
  distributedLoads: [],
  temperature: null,
  releases: [],
  endSprings: [],
  rigidOffsets: null,
});
const declared = compileLoadCase(compilation, [
  gravityPrimitive(['PIPE_WALL', 'CONTENTS', 'INSULATION']),
  distributedWeight('LP-M012-CONTENTS', 'CONTENTS', CONTENTS_MASS_PER_LENGTH),
  distributedWeight('LP-M012-INSULATION', 'INSULATION', INSULATION_MASS_PER_LENGTH),
]);
const expanded = expandPipeWallGravitySourceAuthorities({
  compilation,
  loadCase: declared,
  frameElements: [frameElement],
  pipingComponents: [],
});

assert.equal(expanded.generatedPrimitives.length, 3);
assert.equal(expanded.derivations.length, 3);
assert.equal(expanded.frameElements[0].appliedLoads.length, 3);
assert.deepEqual(
  expanded.generatedPrimitives.map((primitive) => primitive.primitiveId),
  [
    `LP-M007-${GRAVITY_ID}-${ELEMENT_ID}`,
    `LP-M012-${GRAVITY_ID}-${ELEMENT_ID}-CONTENTS`,
    `LP-M012-${GRAVITY_ID}-${ELEMENT_ID}-INSULATION`,
  ],
);

const acceleration = declared.primitives.find((primitive) => primitive.kind === 'GRAVITY')
  .accelerationMagnitude.value;
const pipeAreaIndependent = Math.PI * WALL_THICKNESS * (OUTER_DIAMETER - WALL_THICKNESS);
const pipeMassPerLengthIndependent = PIPE_DENSITY * pipeAreaIndependent;
assertClose(pipeMassPerLengthIndependent, 93.07677951803656, 'independent pipe mass per length');
const totalMassPerLength = pipeMassPerLengthIndependent
  + CONTENTS_MASS_PER_LENGTH
  + INSULATION_MASS_PER_LENGTH;
const expectedIntensity = totalMassPerLength * acceleration;
const generatedIntensity = expanded.generatedPrimitives
  .reduce((sum, primitive) => sum + primitive.startIntensity.fy, 0);
assertClose(generatedIntensity, expectedIntensity, 'summed generated intensity');
expanded.generatedPrimitives.forEach((primitive) => {
  assert.equal(primitive.startIntensity.fx, 0);
  assert.ok(primitive.startIntensity.fy > 0);
  assert.equal(primitive.startIntensity.fz, 0);
  assert.deepEqual(primitive.endIntensity, primitive.startIntensity);
});
const augmented = expanded.frameElements[0].equivalentLoadVector.global;
assertClose(
  augmented[1] + augmented[7],
  expectedIntensity * frameElement.geometry.length,
  'augmentFrameElement summed translational load',
);

const contentDerivation = expanded.derivations.find((entry) =>
  entry.distributedWeight?.weightComponent === 'CONTENTS');
const insulationDerivation = expanded.derivations.find((entry) =>
  entry.distributedWeight?.weightComponent === 'INSULATION');
assert.equal(contentDerivation.distributedWeight.primitiveId, 'LP-M012-CONTENTS');
assert.equal(contentDerivation.distributedWeight.massPerUnitLength, CONTENTS_MASS_PER_LENGTH);
assert.match(contentDerivation.distributedWeight.densityEvidence.sourceId, /ASME-B31\.3-2006-APPENDIX-S/u);
assert.equal(insulationDerivation.distributedWeight.primitiveId, 'LP-M012-INSULATION');
assert.equal(insulationDerivation.distributedWeight.massPerUnitLength, INSULATION_MASS_PER_LENGTH);

const pipeOnlyDeclared = compileLoadCase(compilation, [gravityPrimitive(['PIPE_WALL'])]);
const pipeOnlyFirst = expandPipeWallGravitySourceAuthorities({
  compilation,
  loadCase: pipeOnlyDeclared,
  frameElements: [frameElement],
  pipingComponents: [],
});
const pipeOnlySecond = expandPipeWallGravitySourceAuthorities({
  compilation,
  loadCase: pipeOnlyDeclared,
  frameElements: [frameElement],
  pipingComponents: [],
});
assert.equal(JSON.stringify(pipeOnlyFirst), JSON.stringify(pipeOnlySecond));
assert.equal(pipeOnlyFirst.generatedPrimitives.length, 1);
assert.equal(pipeOnlyFirst.generatedPrimitives[0].primitiveId, `LP-M007-${GRAVITY_ID}-${ELEMENT_ID}`);
assert.equal(pipeOnlyFirst.derivations[0].schema, 'lfea-m007-gravity-pipe-wall-derivation/v1');
assert.match(pipeOnlyFirst.generatedPrimitives[0].sourceEvidence.sourceId, /^LFEA-M007-GRAVITY-PIPE-WALL-UDL-V1:/u);
assert.ok(
  pipeOnlyFirst.loadCase.diagnostics.some((entry) =>
    entry.code === 'LOAD_CASE_GRAVITY_PIPE_WALL_EXPANDED'),
);

const missing = compileLoadCase(compilation, [gravityPrimitive(['CONTENTS'])]);
assertCode(
  () => expandPipeWallGravitySourceAuthorities({
    compilation,
    loadCase: missing,
    frameElements: [frameElement],
    pipingComponents: [],
  }),
  GRAVITY_DISTRIBUTED_WEIGHT_MISSING_CODE,
);

const duplicate = compileLoadCase(compilation, [
  gravityPrimitive(['CONTENTS']),
  distributedWeight('LP-M012-CONTENTS-A', 'CONTENTS', CONTENTS_MASS_PER_LENGTH),
  distributedWeight('LP-M012-CONTENTS-B', 'CONTENTS', CONTENTS_MASS_PER_LENGTH),
]);
assertCode(
  () => expandPipeWallGravitySourceAuthorities({
    compilation,
    loadCase: duplicate,
    frameElements: [frameElement],
    pipingComponents: [],
  }),
  GRAVITY_DISTRIBUTED_WEIGHT_COLLISION_CODE,
);

console.log(JSON.stringify({
  check: 'lfea-b3.10-distributed-weight-expansion',
  status: 'PASS',
  appendixS: {
    outerDiameter: OUTER_DIAMETER,
    wallThickness: WALL_THICKNESS,
    pipeDensity: PIPE_DENSITY,
    pipeMassPerLength: pipeMassPerLengthIndependent,
    contentsMassPerLength: CONTENTS_MASS_PER_LENGTH,
    insulationMassPerLength: INSULATION_MASS_PER_LENGTH,
    totalMassPerLength,
    acceleration,
    expectedIntensity,
  },
  generatedPrimitives: expanded.generatedPrimitives,
  derivations: expanded.derivations,
  augmentedEquivalentLoadVector: expanded.frameElements[0].equivalentLoadVector,
  negativeCodes: [
    GRAVITY_DISTRIBUTED_WEIGHT_MISSING_CODE,
    GRAVITY_DISTRIBUTED_WEIGHT_COLLISION_CODE,
  ],
}, null, 2));

function materialAuthority() {
  const points = [
    {
      absoluteTemperature: 293.15,
      elasticModulus: 2.0e11,
      shearModulus: 7.69e10,
      poissonRatio: 0.3,
      massDensity: PIPE_DENSITY,
      thermalExpansionCoefficient: 1.17e-5,
    },
    {
      absoluteTemperature: 393.15,
      elasticModulus: 1.94e11,
      shearModulus: 7.46e10,
      poissonRatio: 0.3,
      massDensity: PIPE_DENSITY,
      thermalExpansionCoefficient: 1.2e-5,
    },
  ];
  const source = {
    sourceId: 'ASME-B31.3-2006-APPENDIX-S-A106B',
    sourceRevision: 'TABLE-S301.3.1',
    points,
  };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId: 'CS_A106B_APPENDIX_S',
    sourceEvidence: sourceEvidence(source),
    points,
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: MATERIAL_STATE_ID,
      materialId: table.materialId,
      evaluationTemperature: 293.15,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

function sectionAuthority() {
  const source = {
    sourceId: 'ASME-B31.3-2006-APPENDIX-S-NPS16-STD',
    sourceRevision: 'TABLE-S301.3.1',
    outerDiameter: OUTER_DIAMETER,
    wallThickness: WALL_THICKNESS,
  };
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId: SECTION_STATE_ID,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: OUTER_DIAMETER,
    wallThickness: WALL_THICKNESS,
    sourceEvidence: sourceEvidence(source),
  };
  return resolvePipeSection({
    request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) },
    profile: PIPE_SECTION_PROFILE,
  });
}

function mechanicalModelInput(materialResolution, sectionResolution, localAxes) {
  return {
    modelIdentity: 'SYS-M012-APPENDIX-S-WEIGHT',
    modelRevision: 1,
    sourceSemanticHash: 'fnv1a64:1212121212121212',
    conditionedTopology: {
      geometry: {
        schemaVersion: 'canonical-geometry-v1',
        nodes: [
          { id: 'M012/N1', x: 0, y: 0, z: 0, sourceComponentUid: 'PIPE-M012', meta: {} },
          { id: 'M012/N2', x: LENGTH, y: 0, z: 0, sourceComponentUid: 'PIPE-M012', meta: {} },
        ],
        segments: [{ id: 'M012/S1', startNodeId: 'M012/N1', endNodeId: 'M012/N2', sourceComponentUid: 'PIPE-M012' }],
        source: 'ASME-B31.3-2006-APPENDIX-S',
        unit: 'm',
        diagnostics: [],
        summary: {},
      },
      semanticHash: 'fnv1a64:1313131313131313',
    },
    nodeBindings: [
      { nodeId: 'N-M012-0001', conditionedNodeId: 'CN-M012-0001', topologyNodeId: 'M012/N1' },
      { nodeId: 'N-M012-0002', conditionedNodeId: 'CN-M012-0002', topologyNodeId: 'M012/N2' },
    ],
    elementBindings: [{
      elementId: ELEMENT_ID,
      conditionedSegmentId: 'CS-M012-0001',
      topologySegmentId: 'M012/S1',
      materialStateId: MATERIAL_STATE_ID,
      sectionStateId: SECTION_STATE_ID,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: 'AXIS-M012-0001',
      sourceComponentId: 'PIPE-M012',
    }],
    materialResolutions: [materialResolution],
    sectionResolutions: [sectionResolution],
    localAxisResults: [{ evidenceIdentity: 'AXIS-M012-0001', result: localAxes }],
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: [],
    profile: compilerProfile(),
  };
}

function compileLoadCase(modelCompilation, primitives) {
  return compilePhysicalLoadCase({
    loadCaseId: 'LC-M012-APPENDIX-S-WEIGHT',
    loadCaseClass: 'WEIGHT',
    presentation: {
      label: 'Appendix S distributed weight expansion',
      description: 'PIPE_WALL, CONTENTS, and INSULATION gravity expansion.',
    },
    primitives,
    profile: loadCaseProfile(),
    modelReference: modelReferenceFromCompilation(modelCompilation),
  });
}

function gravityPrimitive(includedMassSources) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: GRAVITY_ID,
    kind: 'GRAVITY',
    direction: { x: 0, y: -1, z: 0 },
    basis: 'GLOBAL',
    includedMassSources,
    sourceEvidence: {
      sourceId: 'ASME-B31.3-2006-APPENDIX-S-GRAVITY',
      sourceRevision: 'TABLE-S301.3.1',
      sourceSemanticHash: 'fnv1a64:1414141414141414',
    },
  };
}

function distributedWeight(primitiveId, weightComponent, massPerUnitLength) {
  const evidence = {
    sourceId: 'ASME-B31.3-2006-APPENDIX-S-TABLE-S301.3.1',
    sourceRevision: weightComponent,
    sourceSemanticHash: weightComponent === 'CONTENTS'
      ? 'fnv1a64:1515151515151515'
      : 'fnv1a64:1616161616161616',
  };
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId,
    kind: 'DISTRIBUTED_WEIGHT',
    elementId: ELEMENT_ID,
    weightComponent,
    massPerUnitLength,
    densityEvidence: { ...evidence },
    geometryEvidence: { ...evidence },
    sourceEvidence: { ...evidence },
  };
}

function sourceEvidence(source) {
  return {
    sourceId: source.sourceId,
    sourceRevision: source.sourceRevision,
    sourceSemanticHash: semanticHash(source),
  };
}

function assertClose(actual, expected, message) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= RELATIVE_TOLERANCE * scale,
    `${message}: ${actual} differs from ${expected}`,
  );
}

function assertCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code, `expected ${code}`);
}
