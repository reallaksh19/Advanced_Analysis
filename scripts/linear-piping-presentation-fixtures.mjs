import {
  discretiseBend,
  resolveFrameLocalAxesForSpanChain,
} from '../src/core/centerline-beam-fea/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  deriveLinearPipingParentSet,
  runLinearPipingAnalysis,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  compileLinearPipingInterfaceSet,
  recoverLinearPipingInterfaceLoads,
  sealInterfaceProfile,
} from '../src/core/linear-piping-interface/index.js';
import {
  APPLICATION_RESULT_REQUEST_SCHEMA,
  B31_APPLICATION_REQUEST_SCHEMA,
  NOZZLE_ALLOWABLE_PROFILE_SCHEMA,
  NOZZLE_INTERACTION_RULE,
  compileLinearPipingB31Application,
  compileNozzleAllowableAssessment,
  sealLinearPipingQualifiedApplicationResult,
  sealNozzleAllowableProfile,
} from '../src/core/linear-piping-code-application/index.js';
import {
  FRAME_LOCAL_AXIS_PROFILE,
  compileFixtureBend,
} from './lfea-b3.2-piping-component-fixtures.mjs';
import {
  compilerProfile,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  loadCaseProfile,
  solverProfile,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import {
  codeProfile,
  editionDataset,
  pressureStressContribution,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';

const BEND_ID = 'BEND-001';
const FIXTURE_SOURCE = 'PHASE-5-QUALIFIED-FIXTURE';

function declared(value, source) {
  return { value, source };
}

export function buildQualifiedPresentationFixture() {
  const component = compileFixtureBend();
  if (component.acceptanceState !== 'ACCEPTED') {
    throw new Error('The Phase 5 qualified fixture requires an ACCEPTED piping component.');
  }
  const compilation = bendCompilation(component);
  const loadCase = bendTipLoadCase(compilation, component);
  const qualifiedSolverProfile = solverProfile({
    conditionWarning: declared(1e30, `${FIXTURE_SOURCE}-PROFILE`),
    conditionBlock: declared(1e40, `${FIXTURE_SOURCE}-PROFILE`),
  });
  const parentInput = {
    compilation,
    loadCase,
    frameElements: [],
    pipingComponents: [component],
    solverProfile: qualifiedSolverProfile,
    recoveryProfile: recoveryProfile(),
  };
  const analysisResult = runLinearPipingAnalysis({
    schema: 'linear-piping-analysis-request/v1',
    analysisIdentity: 'PIPE-PHASE5-QUALIFIED',
    analysisRevision: 1,
    ...parentInput,
    expectedParents: deriveLinearPipingParentSet(parentInput),
  }, { factorizationCache: null });

  const allowableProfile = sealNozzleAllowableProfile({
    schema: NOZZLE_ALLOWABLE_PROFILE_SCHEMA,
    profileId: 'NOZZLE-PROFILE-PHASE5-R1',
    interfaceId: 'IF-NOZZLE-PHASE5',
    sourceIdentity: {
      authority: 'FIXTURE-VENDOR-NOT-STANDARD',
      documentId: 'FIXTURE-PHASE5-NOZZLE-DATASHEET',
      revision: '00',
      sourceSemanticHash: 'fnv1a64:efefefefefefefef',
    },
    forceAllowables: {
      x: declared(100000, 'FIXTURE-PHASE5-NOZZLE-DATASHEET'),
      y: declared(100000, 'FIXTURE-PHASE5-NOZZLE-DATASHEET'),
      z: declared(100000, 'FIXTURE-PHASE5-NOZZLE-DATASHEET'),
    },
    momentAllowables: {
      x: declared(100000, 'FIXTURE-PHASE5-NOZZLE-DATASHEET'),
      y: declared(100000, 'FIXTURE-PHASE5-NOZZLE-DATASHEET'),
      z: declared(100000, 'FIXTURE-PHASE5-NOZZLE-DATASHEET'),
    },
    interactionRuleId: NOZZLE_INTERACTION_RULE,
    interactionLimit: declared(1, 'FIXTURE-PHASE5-NOZZLE-DATASHEET'),
    semanticHash: '',
  });
  const node = compilation.model.nodes.find((row) => row.nodeId === `${BEND_ID}.N0`);
  const dofMappings = compilation.model.constraints
    .filter((row) => row.nodeId === node.nodeId)
    .map((row) => ({
      dof: row.dof,
      behavior: row.behavior,
      constraintId: row.constraintId,
      stiffness: row.stiffness ?? null,
    }));
  const interfaceSet = compileLinearPipingInterfaceSet({
    compilation,
    supportAttachmentModel: null,
    restraintCapabilityModel: null,
    definitions: [{
      interfaceId: allowableProfile.interfaceId,
      interfaceKind: 'NOZZLE',
      nodeId: node.nodeId,
      sourceEntityId: BEND_ID,
      supportBinding: null,
      basis: {
        origin: node.position,
        e1: { x: 1, y: 0, z: 0 },
        e2: { x: 0, y: 1, z: 0 },
        e3: { x: 0, y: 0, z: 1 },
      },
      referencePointGlobal: { x: -0.1, y: 0, z: 0 },
      leverReferenceToNodeLocal: { x: 0.1, y: 0, z: 0 },
      dofMappings,
      reportingSignConvention: 'FORCE_ON_INTERFACE_FROM_PIPE',
      sourceEvidence: {
        sourceId: 'FIXTURE-PHASE5-EQUIPMENT-NOZZLE',
        sourceRevision: '01',
        sourceSemanticHash: 'fnv1a64:fefefefefefefefe',
      },
      allowableProfileHash: allowableProfile.semanticHash,
    }],
    profile: sealInterfaceProfile({
      schema: 'linear-piping-interface-profile/v1',
      profileId: 'LINEAR-PIPING-PHASE5-INTERFACE-R1',
      basisTolerance: declared(1e-12, 'PHASE-5-INTERFACE-FIXTURE'),
      positionTolerance: declared(1e-12, 'PHASE-5-INTERFACE-FIXTURE'),
      offsetTolerance: declared(1e-12, 'PHASE-5-INTERFACE-FIXTURE'),
      semanticHash: '',
    }),
  });
  const interfaceRecovery = recoverLinearPipingInterfaceLoads({
    interfaceSet,
    analysisResult,
    loadCase,
  });
  const nozzleAssessment = compileNozzleAllowableAssessment({
    interfaceSet,
    interfaceRecovery,
    allowableProfile,
  });
  const firstElement = component.elements[0].frameElement;
  const b31Application = compileLinearPipingB31Application({
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: 'B31-PHASE5-QUALIFIED',
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    cases: [{ caseId: 'OPERATING_CASE', loadCase, recovery: analysisResult.recovery }],
    checks: [{
      checkId: 'B31-PHASE5-SUSTAINED',
      category: 'SUSTAINED',
      codePointId: component.codeStations[0].stationId,
      componentId: component.componentId,
      combinationId: loadCase.loadCaseId,
      actionSource: { kind: 'SINGLE_CASE', caseId: 'OPERATING_CASE' },
      frameElementRecord: firstElement,
      sectionResolution: sectionResolution(),
      materialResolution: materialResolution(),
      stressFactorSet: bendStressFactorSet(component.componentId),
      pressureStressContribution: pressureStressContribution(),
      coldTemperature: null,
      occasionalCategoryId: null,
    }],
  });
  const applicationResult = sealLinearPipingQualifiedApplicationResult({
    schema: APPLICATION_RESULT_REQUEST_SCHEMA,
    applicationId: 'PIPE-PHASE5-APPLICATION',
    analysisResults: [analysisResult],
    interfaceSet,
    interfaceRecoveries: [interfaceRecovery],
    nozzleAssessments: [nozzleAssessment],
    b31Application,
  });
  return {
    applicationResult,
    analysisResults: [analysisResult],
    interfaceSet,
    interfaceRecoveries: [interfaceRecovery],
    nozzleAssessments: [nozzleAssessment],
    b31Application,
  };
}

function bendCompilation(component) {
  const points = bendPoints(component);
  const nodeIds = points.map((_, index) => `${component.componentId}.N${index}`);
  const axisResults = resolveFrameLocalAxesForSpanChain({
    points,
    referenceVector: component.geometry.referenceVector,
    profile: FRAME_LOCAL_AXIS_PROFILE,
  });
  component.elements.forEach((entry, index) => {
    if (entry.frameElement.localAxes.resultSemanticHash !== axisResults[index].semanticHash) {
      throw new Error(`Bend local-axis evidence diverges at ${entry.elementId}.`);
    }
  });
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    nodes: nodeIds.map((id, index) => ({
      id: `TOPO/${id}`,
      x: points[index][0],
      y: points[index][1],
      z: points[index][2],
      restraint: index === 0 ? 'ANCHOR' : 'FREE',
      sourceComponentUid: component.componentId,
      meta: {},
    })),
    segments: component.elements.map((entry, index) => ({
      id: `TOPO/${entry.elementId}`,
      startNodeId: `TOPO/${nodeIds[index]}`,
      endNodeId: `TOPO/${nodeIds[index + 1]}`,
      type: 'PIPE',
    })),
    source: 'fixture',
    unit: 'm',
    diagnostics: [],
    summary: {},
  };
  const conditionedTopology = {
    geometry,
    semanticHash: 'fnv1a64:4444444444444444',
  };
  const nodeBindings = nodeIds.map((id, index) => ({
    nodeId: id,
    conditionedNodeId: `C-BEND-N${index}`,
    topologyNodeId: `TOPO/${id}`,
  }));
  const elementBindings = component.elements.map((entry, index) => ({
    elementId: entry.elementId,
    conditionedSegmentId: `CS-BEND-E${index + 1}`,
    topologySegmentId: `TOPO/${entry.elementId}`,
    materialStateId: entry.frameElement.material.materialStateId,
    sectionStateId: entry.frameElement.section.sectionStateId,
    formulationId: 'PIPE_FRAME3D_LINEAR_V1',
    localAxisEvidenceIdentity: `AXIS-BEND-E${index + 1}`,
    sourceComponentId: component.componentId,
  }));
  const localAxisResults = axisResults.map((result, index) => ({
    evidenceIdentity: `AXIS-BEND-E${index + 1}`,
    result,
  }));
  const constraintDeclarations = ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({
    declarationId: `C-BEND-N0-${dof}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: `${component.componentId}.N0`,
    dof,
    behavior: 'FIXED',
  }));
  return compileMechanicalModel({
    modelIdentity: 'SYS-BEND-PHASE5-MECH-01',
    modelRevision: 1,
    sourceSemanticHash: 'fnv1a64:1111111111111111',
    conditionedTopology,
    nodeBindings,
    elementBindings,
    materialResolutions: [materialResolution()],
    sectionResolutions: [sectionResolution()],
    localAxisResults,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations,
    profile: compilerProfile(),
  });
}

function bendPoints(component) {
  const result = discretiseBend(
    point(component.geometry.tangentStart),
    point(component.geometry.tangentEnd),
    point(component.geometry.centre),
    component.subdivision.elementCount,
  );
  return result.points.map((entry) => [entry.x, entry.y, entry.z]);
}

function point(value) {
  return { x: value[0], y: value[1], z: value[2] };
}

function bendTipLoadCase(compilation, component) {
  const modelReference = modelReferenceFromCompilation(compilation);
  const endNodeId = `${component.componentId}.N${component.subdivision.elementCount}`;
  return compilePhysicalLoadCase({
    loadCaseId: 'LC-BEND-TIP-01',
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: {
      label: 'Bend tip load',
      description: 'Fixture nodal load at the second bend tangent.',
    },
    modelReference,
    primitives: [{
      schema: 'fea-linear-load-primitive/v1',
      primitiveId: 'LP-TIP-BEND-END',
      kind: 'NODAL_FORCE_MOMENT',
      nodeId: endNodeId,
      basis: { kind: 'GLOBAL' },
      force: { fx: 0, fy: 0, fz: -1000 },
      moment: { mx: 0, my: 0, mz: 0 },
      units: { force: 'N', moment: 'N*m', length: 'm' },
      signConvention: 'APPLIED_TO_STRUCTURE',
      sourceEvidence: {
        sourceId: 'FIXTURE-PHASE5-LOAD-REGISTER',
        sourceRevision: '01',
        sourceSemanticHash: 'fnv1a64:6666666666666666',
      },
    }],
    profile: loadCaseProfile(),
  });
}

function bendStressFactorSet(componentId) {
  return stressFactorSet({
    factorSetId: 'SF-BEND-001-FIXTURE',
    componentId,
    sourceIdentity: {
      standard: 'FIXTURE-B31J-FACTOR-SET-NOT-ASME',
      edition: 'FIXTURE-2023',
      ruleId: 'FIXTURE-RULE-BEND',
      sourceRevision: '00',
      sourceSemanticHash: 'fnv1a64:abcdef1234567890',
    },
  });
}
