import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import { compilePipingComponent } from '../src/core/linear-fea-piping-components/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
  sealLoadPrimitive,
} from '../src/core/linear-fea-load-case/index.js';
import { elementContributionFromFrameElement, elementContributionsFromPipingComponent } from '../src/core/linear-fea-solver/index.js';
import { sealRecoveryProfile } from '../src/core/linear-fea-result-recovery/index.js';
import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import { compilerProfile, materialResolution, sectionResolution } from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  cantileverCompilation,
  frameElementProfile,
  frameElements,
  loadCaseProfile,
  solverProfile,
  tipLoadCase,
  tipLoadPrimitive,
} from './lfea-b3.3-solver-fixtures.mjs';
import { componentProfile, reducedSectionResolution, reducerInput } from './lfea-b3.2-piping-component-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';

export {
  cantileverCompilation,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
  frameElementProfile,
  frameElements,
  loadCaseProfile,
  solverProfile,
  tipLoadCase,
  tipLoadPrimitive,
};

const SOURCE = 'LFEA-B3.4-FIXTURE-PROFILE';

export function recoveryProfile(overrides = {}) {
  return sealRecoveryProfile({
    schema: 'fea-linear-recovery-profile/v1',
    profileId: 'LINEAR-RESULT-RECOVERY-R1',
    elementForceStationsPerSpan: { value: 5, source: SOURCE },
    codePointConsistencyTolerance: { value: 1e-6, source: SOURCE },
    retainLocalAndGlobalActions: true,
    semanticHash: '',
    ...overrides,
  });
}

/* ---------------------------------------------------------------------- *
 * UDL-01: the B-3.3 cantilever, with the outer span (E-000121) carrying a
 * genuine uniform global -Z distributed load, so force-field recovery has
 * real curvature to check against a hand closed form.
 * ---------------------------------------------------------------------- */

export const UDL_ELEMENT_ID = 'E-000121';
export const UDL_INTENSITY_FZ = -500;

export function udlPrimitiveInput(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-UDL-E121',
    kind: 'DISTRIBUTED_LOAD',
    elementId: UDL_ELEMENT_ID,
    basis: 'GLOBAL',
    variation: 'UNIFORM',
    startIntensity: { fx: 0, fy: 0, fz: UDL_INTENSITY_FZ },
    endIntensity: { fx: 0, fy: 0, fz: UDL_INTENSITY_FZ },
    units: { distributedForce: 'N/m', length: 'm' },
    sourceEvidence: { sourceId: 'PROJECT-LOAD-REGISTER', sourceRevision: '01', sourceSemanticHash: 'fnv1a64:8888888888888888' },
    ...overrides,
  };
}

export function sealedUdlPrimitive(compilation) {
  const modelReference = modelReferenceFromCompilation(compilation);
  return sealLoadPrimitive(udlPrimitiveInput(), { profile: loadCaseProfile(), modelReference });
}

/** Same two-element cantilever chain as B-3.3 (`frameElements`), but the
 * outer span is recompiled carrying the sealed UDL primitive. */
export function frameElementsWithUdl(compilation, profile = frameElementProfile()) {
  const primitive = sealedUdlPrimitive(compilation);
  const [inner] = frameElements(profile);
  const outer = compileFrameElement({
    elementId: UDL_ELEMENT_ID,
    material: materialResolution(),
    section: sectionResolution(),
    localAxes: { result: resolveFrameLocalAxes({ nodeI: [1.2, 0, 0], nodeJ: [2.4, 0, 0], referenceVector: [0, 0, 1], profile: FRAME_LOCAL_AXIS_PROFILE }), profile: FRAME_LOCAL_AXIS_PROFILE },
    profile,
    distributedLoads: [primitive],
    temperature: null,
    releases: [],
    endSprings: [],
    rigidOffsets: null,
  });
  return [inner, outer];
}

export function udlLoadCase(compilation, overrides = {}) {
  const reference = modelReferenceFromCompilation(compilation);
  return compilePhysicalLoadCase({
    loadCaseId: 'LC-UDL-01',
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: { label: 'UDL', description: 'Uniform global -Z distributed load on the outer span.' },
    modelReference: reference,
    primitives: [udlPrimitiveInput()],
    profile: loadCaseProfile(),
    ...overrides,
  });
}

/* ---------------------------------------------------------------------- *
 * REDUCER-01: a stepped two-section reducer chain compiled as a piping
 * component, plus a matching mechanical-model compilation whose node/element
 * identities are exactly the reducer's own N0/N1/N2, E1/E2 scheme — the
 * correspondence section 9.1 code stations rely on. A cantilever restraint at
 * N0 and a tip nodal load at N2 exercise: code-point recovery at a trivial
 * single-candidate station (N0) and at a shared internal node between two
 * elements (N1, RED-001.E1's J end and RED-001.E2's I end).
 * ---------------------------------------------------------------------- */

export const REDUCER_COMPONENT_ID = 'RED-001';
export const REDUCER_NODE_POSITIONS = Object.freeze({
  'RED-001.N0': [0, 0, 0],
  'RED-001.N1': [0.2, 0, 0],
  'RED-001.N2': [0.4, 0, 0],
});

export function reducerComponent() {
  return compilePipingComponent(reducerInput({
    profile: componentProfile(),
    frameElementProfile: eulerBernoulliProfile(),
  }));
}

function axisResult(nodeI, nodeJ, referenceVector = [0, 0, 1]) {
  return resolveFrameLocalAxes({ nodeI, nodeJ, referenceVector, profile: FRAME_LOCAL_AXIS_PROFILE });
}

export function reducerCompilation() {
  const positions = REDUCER_NODE_POSITIONS;
  const nodeIds = Object.keys(positions);
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    nodes: nodeIds.map((id) => ({
      id: `TOPO/${id}`,
      x: positions[id][0],
      y: positions[id][1],
      z: positions[id][2],
      restraint: id === 'RED-001.N0' ? 'ANCHOR' : 'FREE',
      sourceComponentUid: REDUCER_COMPONENT_ID,
      meta: {},
    })),
    segments: [
      { id: 'TOPO/RED-001.E1', startNodeId: 'TOPO/RED-001.N0', endNodeId: 'TOPO/RED-001.N1', type: 'PIPE' },
      { id: 'TOPO/RED-001.E2', startNodeId: 'TOPO/RED-001.N1', endNodeId: 'TOPO/RED-001.N2', type: 'PIPE' },
    ],
    source: 'fixture',
    unit: 'm',
    diagnostics: [],
    summary: {},
  };
  const conditionedTopology = { geometry, semanticHash: 'fnv1a64:3333333333333333' };
  const nodeBindings = nodeIds.map((id) => ({ nodeId: id, conditionedNodeId: `C-${id}`, topologyNodeId: `TOPO/${id}` }));
  const elementBindings = [
    {
      elementId: 'RED-001.E1',
      conditionedSegmentId: 'CS-RED-E1',
      topologySegmentId: 'TOPO/RED-001.E1',
      materialStateId: 'MAT-A106B-393K',
      sectionStateId: 'SEC-NPS6-SCH40',
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: 'AXIS-RED-E1',
      sourceComponentId: REDUCER_COMPONENT_ID,
    },
    {
      elementId: 'RED-001.E2',
      conditionedSegmentId: 'CS-RED-E2',
      topologySegmentId: 'TOPO/RED-001.E2',
      materialStateId: 'MAT-A106B-393K',
      sectionStateId: 'SEC-NPS4-SCH40',
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: 'AXIS-RED-E2',
      sourceComponentId: REDUCER_COMPONENT_ID,
    },
  ];
  const localAxisResults = [
    { evidenceIdentity: 'AXIS-RED-E1', result: axisResult(positions['RED-001.N0'], positions['RED-001.N1']) },
    { evidenceIdentity: 'AXIS-RED-E2', result: axisResult(positions['RED-001.N1'], positions['RED-001.N2']) },
  ];
  const constraintDeclarations = ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({
    declarationId: `C-RED-N0-${dof}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: 'RED-001.N0',
    dof,
    behavior: 'FIXED',
  }));

  return compileMechanicalModel({
    modelIdentity: 'SYS-RED-01-MECH-01',
    modelRevision: 1,
    sourceSemanticHash: 'fnv1a64:1111111111111111',
    conditionedTopology,
    nodeBindings,
    elementBindings,
    materialResolutions: [materialResolution()],
    sectionResolutions: [sectionResolution(), reducedSectionResolution()],
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations,
    profile: compilerProfile(),
  });
}

export function reducerTipLoadPrimitive(overrides = {}) {
  return {
    schema: 'fea-linear-load-primitive/v1',
    primitiveId: 'LP-TIP-RED-N2',
    kind: 'NODAL_FORCE_MOMENT',
    nodeId: 'RED-001.N2',
    basis: { kind: 'GLOBAL' },
    force: { fx: 0, fy: 1000, fz: 0 },
    moment: { mx: 0, my: 0, mz: 0 },
    units: { force: 'N', moment: 'N*m', length: 'm' },
    signConvention: 'APPLIED_TO_STRUCTURE',
    sourceEvidence: { sourceId: 'PROJECT-LOAD-REGISTER', sourceRevision: '01', sourceSemanticHash: 'fnv1a64:6666666666666666' },
    ...overrides,
  };
}

export function reducerTipLoadCase(compilation, overrides = {}) {
  const reference = modelReferenceFromCompilation(compilation);
  return compilePhysicalLoadCase({
    loadCaseId: 'LC-RED-TIP-01',
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: { label: 'Reducer tip load', description: 'Nodal tip load at the reduced end.' },
    modelReference: reference,
    primitives: [reducerTipLoadPrimitive()],
    profile: loadCaseProfile(),
    ...overrides,
  });
}
