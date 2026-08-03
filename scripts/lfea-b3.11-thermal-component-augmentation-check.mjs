#!/usr/bin/env node

/** M014 piping-component TEMPERATURE binding and B-3.1 parity proof. */
import assert from 'node:assert/strict';
import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../src/core/centerline-beam-fea/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
  sealLoadPrimitive,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  THERMAL_TEMPERATURE_COLLISION_CODE,
  THERMAL_TEMPERATURE_MISSING_CODE,
  augmentPipingComponentTemperatureAuthorities,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { augmentFrameElementTemperature } from '../src/core/linear-piping-analysis-consumer/thermal-expansion-element-augmentation.js';
import {
  compilerProfile,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  bendFactorSet,
  compileFixtureBend,
  componentProfile,
} from './lfea-b3.2-piping-component-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import {
  gravityPrimitive,
  loadCaseProfile,
  temperaturePrimitive,
} from './lfea-b3.0-load-case-fixtures.mjs';

const SOURCE = 'LFEA-M014-THERMAL-COMPONENT-ORACLE';
const STRAIGHT_ELEMENT_ID = 'E-M014-STRAIGHT';
const OPERATING_TEMPERATURE = 393.15;
const INSTALLATION_TEMPERATURE = 293.15;
const material = materialResolution();
const section = sectionResolution();
const frameProfile = eulerBernoulliProfile();
const bend = compileFixtureBend({
  material,
  section,
  frameElementProfile: frameProfile,
  profile: componentProfile({
    convergenceRequired: false,
    bendMaxAngleDegrees: { value: 90, source: SOURCE },
    bendMinimumElements: { value: 2, source: SOURCE },
    bendMinimumElementsBetweenStations: { value: 1, source: SOURCE },
  }),
  factorSet: bendFactorSet(),
});

assert.equal(bend.elements.length, 2, 'oracle requires the minimum even bend subdivision');
assert.equal(bend.codeStations.length, 3, 'near/mid/far stations must cover all two-element nodes');
const stations = [...bend.codeStations].sort((left, right) => left.arcFraction - right.arcFraction);
const bendAxes = bend.elements.map((entry, index) => ({
  evidenceIdentity: `AXIS-${entry.elementId}`,
  result: resolveFrameLocalAxes({
    nodeI: stations[index].position,
    nodeJ: stations[index + 1].position,
    referenceVector: bend.geometry.referenceVector,
    profile: FRAME_LOCAL_AXIS_PROFILE,
  }),
}));
const compilation = compileMechanicalModel(mechanicalModelInput(bendAxes));
const modelByElement = new Map(compilation.model.elements.map((entry) => [entry.elementId, entry]));
const targetEntry = bend.elements[0];
const untouchedEntry = bend.elements[1];
const targetElementId = targetEntry.elementId;
const temperatureInput = componentTemperature(targetElementId, 'LP-M014-TEMPERATURE');
const thermalCase = compileCase('LC-M014-THERMAL', 'THERMAL', [temperatureInput]);

assert.ok(targetEntry.frameElement.initialStrainLoadVector.local.every((value) => value === 0));
const first = augmentPipingComponentTemperatureAuthorities({
  compilation,
  loadCase: thermalCase,
  pipingComponents: [bend],
});
const second = augmentPipingComponentTemperatureAuthorities({
  compilation,
  loadCase: thermalCase,
  pipingComponents: [bend],
});
assert.equal(JSON.stringify(first), JSON.stringify(second), 'augmentation must be deterministic');
assert.equal(first.bindings.length, 1);
assert.equal(first.bindings[0].elementId, targetElementId);
const augmentedBend = first.pipingComponents[0];
const augmentedTarget = augmentedBend.elements.find((entry) => entry.elementId === targetElementId);
const augmentedUntouched = augmentedBend.elements.find((entry) => entry.elementId === untouchedEntry.elementId);
assert.ok(
  augmentedTarget.frameElement.initialStrainLoadVector.local.some((value) => value !== 0),
  'targeted component element must carry nonzero thermal initial strain',
);
assert.deepEqual(augmentedTarget.frameElement.localStiffness, targetEntry.frameElement.localStiffness);
assert.deepEqual(augmentedTarget.frameElement.globalStiffness, targetEntry.frameElement.globalStiffness);
assert.deepEqual(augmentedTarget.effectiveLocalStiffness, targetEntry.effectiveLocalStiffness);
assert.deepEqual(augmentedTarget.effectiveGlobalStiffness, targetEntry.effectiveGlobalStiffness);
assert.deepEqual(augmentedUntouched, untouchedEntry, 'untargeted component element must be byte-identical');
assert.equal(augmentedTarget.frameElement.thermal.primitiveId, 'LP-M014-TEMPERATURE');

const sealedTemperature = thermalCase.primitives.find((primitive) => primitive.kind === 'TEMPERATURE');
const directElement = compileFrameElement({
  elementId: targetElementId,
  material,
  section,
  localAxes: { result: bendAxes[0].result, profile: FRAME_LOCAL_AXIS_PROFILE },
  profile: frameProfile,
  distributedLoads: [],
  temperature: sealedTemperature,
  releases: [],
  endSprings: [],
  rigidOffsets: null,
});
assert.deepEqual(
  augmentedTarget.frameElement.initialStrainLoadVector,
  directElement.initialStrainLoadVector,
  'component augmentation must exactly match direct compileFrameElement thermal vectors',
);
assert.deepEqual(
  augmentedTarget.frameElement,
  directElement,
  'component augmentation must reproduce the complete directly compiled thermal element record',
);

assertCode(
  () => augmentFrameElementTemperature(
    targetEntry.frameElement,
    [],
    modelByElement.get(targetElementId),
  ),
  THERMAL_TEMPERATURE_MISSING_CODE,
);
const primitiveContext = {
  profile: loadCaseProfile(),
  modelReference: modelReferenceFromCompilation(compilation),
};
const duplicateA = sealLoadPrimitive(
  componentTemperature(targetElementId, 'LP-M014-DUPLICATE-A'),
  primitiveContext,
);
const duplicateB = sealLoadPrimitive(
  componentTemperature(targetElementId, 'LP-M014-DUPLICATE-B'),
  primitiveContext,
);
assertCode(
  () => augmentFrameElementTemperature(
    targetEntry.frameElement,
    [duplicateA, duplicateB],
    modelByElement.get(targetElementId),
  ),
  THERMAL_TEMPERATURE_COLLISION_CODE,
);

const straightOnlyCase = compileCase('LC-M014-STRAIGHT-ONLY', 'MIXED_PHYSICAL', [
  componentTemperature(STRAIGHT_ELEMENT_ID, 'LP-M014-STRAIGHT-TEMPERATURE'),
]);
const ignored = augmentPipingComponentTemperatureAuthorities({
  compilation,
  loadCase: straightOnlyCase,
  pipingComponents: [bend],
});
assert.deepEqual(ignored.pipingComponents, [bend]);
assert.deepEqual(ignored.bindings, []);

const noTemperatureCase = compileCase('LC-M014-NO-TEMPERATURE', 'WEIGHT', [
  gravityPrimitive({ includedMassSources: ['PIPE_WALL'] }),
]);
const noTemperature = augmentPipingComponentTemperatureAuthorities({
  compilation,
  loadCase: noTemperatureCase,
  pipingComponents: [bend],
});
assert.deepEqual(noTemperature.pipingComponents, [bend]);
assert.deepEqual(noTemperature.bindings, []);

console.log(JSON.stringify({
  check: 'lfea-b3.11-thermal-component-augmentation',
  status: 'PASS',
  componentId: bend.componentId,
  targetElementId,
  temperature: {
    operatingTemperature: OPERATING_TEMPERATURE,
    installationTemperature: INSTALLATION_TEMPERATURE,
    thermalExpansionCoefficient: material.materialState.thermalExpansionCoefficient,
  },
  directParity: {
    frameElementSemanticHash: directElement.semanticHash,
    initialStrainLoadVector: directElement.initialStrainLoadVector,
  },
  stiffnessUnchanged: true,
  ignoredStraightRunElementId: STRAIGHT_ELEMENT_ID,
  negativeCodes: [
    THERMAL_TEMPERATURE_MISSING_CODE,
    THERMAL_TEMPERATURE_COLLISION_CODE,
  ],
}, null, 2));

function componentTemperature(elementId, primitiveId) {
  return temperaturePrimitive({
    primitiveId,
    elementId,
    operatingTemperature: OPERATING_TEMPERATURE,
    installationTemperature: INSTALLATION_TEMPERATURE,
    stiffnessEvaluationMaterialStateId: material.materialState.materialStateId,
    thermalStrainProfileId: 'UNIFORM_TEMPERATURE_ALPHA_DELTA_T_V1',
    sourceEvidence: {
      sourceId: 'LFEA-M014-ACCEPTANCE-ORACLE',
      sourceRevision: '01',
      sourceSemanticHash: 'fnv1a64:1414141414141414',
    },
  });
}

function compileCase(loadCaseId, loadCaseClass, primitives) {
  return compilePhysicalLoadCase({
    loadCaseId,
    loadCaseClass,
    presentation: {
      label: loadCaseId,
      description: 'M014 piping-component thermal augmentation acceptance case.',
    },
    modelReference: modelReferenceFromCompilation(compilation),
    primitives,
    profile: loadCaseProfile(),
  });
}

function mechanicalModelInput(localAxisResults) {
  const bendNodes = stations.map((station) => ({
    id: station.nodeId,
    position: station.position,
    sourceComponentId: bend.componentId,
  }));
  const straightNodes = [
    { id: 'N-M014-STRAIGHT-I', position: [2, 0, 0], sourceComponentId: 'PIPE-M014-STRAIGHT' },
    { id: 'N-M014-STRAIGHT-J', position: [3, 0, 0], sourceComponentId: 'PIPE-M014-STRAIGHT' },
  ];
  const nodes = [...bendNodes, ...straightNodes];
  const bendSegments = bend.elements.map((entry, index) => ({
    elementId: entry.elementId,
    nodeI: bendNodes[index].id,
    nodeJ: bendNodes[index + 1].id,
    sourceComponentId: bend.componentId,
    axisIdentity: `AXIS-${entry.elementId}`,
  }));
  const straightSegment = {
    elementId: STRAIGHT_ELEMENT_ID,
    nodeI: straightNodes[0].id,
    nodeJ: straightNodes[1].id,
    sourceComponentId: 'PIPE-M014-STRAIGHT',
    axisIdentity: `AXIS-${STRAIGHT_ELEMENT_ID}`,
  };
  const segments = [...bendSegments, straightSegment];
  const straightAxis = {
    evidenceIdentity: straightSegment.axisIdentity,
    result: resolveFrameLocalAxes({
      nodeI: straightNodes[0].position,
      nodeJ: straightNodes[1].position,
      referenceVector: [0, 0, 1],
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  };
  return {
    modelIdentity: 'SYS-M014-THERMAL-COMPONENT',
    modelRevision: 1,
    sourceSemanticHash: 'fnv1a64:1014101410141014',
    conditionedTopology: {
      geometry: {
        schemaVersion: 'canonical-geometry-v1',
        nodes: nodes.map((entry) => ({
          id: `TOPO/${entry.id}`,
          x: entry.position[0],
          y: entry.position[1],
          z: entry.position[2],
          sourceComponentUid: entry.sourceComponentId,
          meta: {},
        })),
        segments: segments.map((entry) => ({
          id: `TOPO/${entry.elementId}`,
          startNodeId: `TOPO/${entry.nodeI}`,
          endNodeId: `TOPO/${entry.nodeJ}`,
          type: 'PIPE',
        })),
        source: SOURCE,
        unit: 'm',
        diagnostics: [],
        summary: {},
      },
      semanticHash: 'fnv1a64:1114111411141114',
    },
    nodeBindings: nodes.map((entry) => ({
      nodeId: entry.id,
      conditionedNodeId: `C-${entry.id}`,
      topologyNodeId: `TOPO/${entry.id}`,
    })),
    elementBindings: segments.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: `CS-${entry.elementId}`,
      topologySegmentId: `TOPO/${entry.elementId}`,
      materialStateId: material.materialState.materialStateId,
      sectionStateId: section.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: entry.axisIdentity,
      sourceComponentId: entry.sourceComponentId,
    })),
    materialResolutions: [material],
    sectionResolutions: [section],
    localAxisResults: [...localAxisResults, straightAxis],
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: [],
    profile: compilerProfile(),
  };
}

function assertCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code, `expected ${code}`);
}
