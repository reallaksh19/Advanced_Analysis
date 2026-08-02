import { conditionGeometry, FRAME_LOCAL_AXIS_PROFILE } from '../src/core/centerline-beam-fea/index.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
  compileLinearPipingInputXmlAnalysisContext,
  sealLinearPipingInputXmlSource,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import { sealInterfaceProfile } from '../src/core/linear-piping-interface/index.js';
import {
  NOZZLE_ALLOWABLE_PROFILE_SCHEMA,
  NOZZLE_INTERACTION_RULE,
  sealNozzleAllowableProfile,
} from '../src/core/linear-piping-code-application/index.js';
import { compilePipingComponent } from '../src/core/linear-fea-piping-components/index.js';
import { LINEAR_PIPING_WORKBENCH_RUN_REQUEST_SCHEMA } from '../src/workspace/linear-piping-run-analysis.js';
import {
  axisResult,
  compilerInput,
  materialResolution,
  sectionResolution,
} from './lfea-b2.5-model-compiler-fixtures.mjs';
import {
  componentProfile,
  eulerBernoulliProfile,
  reducedSectionResolution,
  reducerInput,
} from './lfea-b3.2-piping-component-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import {
  recoveryProfile,
  reducerTipLoadPrimitive,
} from './lfea-b3.4-recovery-fixtures.mjs';
import {
  COLD_TEMPERATURE,
  codeProfile,
  editionDataset,
  pressureStressContribution,
  reducerFrameElementE1,
  reducerMaterialResolution,
  reducerSectionResolutionE1,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';

const XML = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="PHASE2E"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1.2" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.1683" WALL_THICK="0.00711" MATERIAL_NAME="A106 B"/><PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1.2" DELTA_Y="0" DELTA_Z="0" DIAMETER="0.1143" WALL_THICK="0.006" MATERIAL_NAME="A106 B"/></PIPINGMODEL></CAESARII>';
const CONDITIONING_PROFILE = Object.freeze({
  spanSeedingLimit: { value: 10, source: 'M003-PHASE-2E-FIXTURE' },
  bendSeedingSegments: { value: 4, source: 'M003-PHASE-2E-FIXTURE' },
  bendLengthErrorLimit: { value: 0.01, source: 'M003-PHASE-2E-FIXTURE' },
});

export function buildM003LiveRunRequest({ sourceRevision = '01' } = {}) {
  const highRequest = buildInputXmlRequest({
    loadCaseId: 'LC-HIGH',
    analysisIdentity: 'PIPE-M003-HIGH',
    forceY: 1000,
    sourceRevision,
  });
  const lowRequest = buildInputXmlRequest({
    loadCaseId: 'LC-LOW',
    analysisIdentity: 'PIPE-M003-LOW',
    forceY: 250,
    sourceRevision,
  });
  const highContext = compileLinearPipingInputXmlAnalysisContext(
    highRequest,
    { factorizationCache: null },
  );
  const allowableProfile = nozzleProfile();
  const component = reducerComponent();
  return {
    schema: LINEAR_PIPING_WORKBENCH_RUN_REQUEST_SCHEMA,
    applicationId: 'PIPE-M003-LIVE-APPLICATION-01',
    cases: [
      { caseId: 'HIGH', inputXmlAnalysisRequest: highRequest },
      { caseId: 'LOW', inputXmlAnalysisRequest: lowRequest },
    ],
    interfaceAuthority: interfaceAuthority(highContext, allowableProfile),
    nozzleAllowableProfiles: [allowableProfile],
    b31Authority: b31Authority(component),
  };
}

function declared(value, source = 'M003-FIXTURE-NOT-STANDARD') {
  return { value, source };
}

function source(revision) {
  return sealLinearPipingInputXmlSource({
    sourceId: 'PROJECT-INPUTXML-M003',
    sourceRevision: revision,
    fileName: 'm003-phase2e-input.xml',
    mediaType: 'application/xml',
    content: XML,
  });
}

function reducerComponent() {
  return compilePipingComponent(reducerInput({
    start: [0, 0, 0],
    end: [2.4, 0, 0],
    profile: componentProfile(),
    frameElementProfile: eulerBernoulliProfile(),
  }));
}

function fixedConstraints() {
  return ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => ({
    declarationId: `C-RED-N0-${dof}`,
    kind: 'NODAL_RESTRAINT',
    nodeId: 'RED-001.N0',
    dof,
    behavior: 'FIXED',
  }));
}

function elementBinding(elementId, conditionedSegmentId, topologySegmentId, axisId, sectionStateId) {
  return {
    elementId,
    conditionedSegmentId,
    topologySegmentId,
    materialStateId: 'MAT-A106B-393K',
    sectionStateId,
    formulationId: 'PIPE_FRAME3D_LINEAR_V1',
    localAxisEvidenceIdentity: axisId,
    sourceComponentId: 'RED-001',
  };
}

function buildInputXmlRequest({ loadCaseId, analysisIdentity, forceY, sourceRevision }) {
  const inputXmlSource = source(sourceRevision);
  const ingestionOptions = {
    unit: 'm',
    source: inputXmlSource.sourceId,
    componentOrigins: {},
    restraintTypeCodeMap: {},
    bendRadiusTolerance: { value: 1e-8, source: 'M003-PHASE-2E-FIXTURE' },
  };
  const geometry = inputXmlToCanonicalGeometry(inputXmlSource.content, {
    ...ingestionOptions,
    bendRadiusTolerance: ingestionOptions.bendRadiusTolerance.value,
    fileName: inputXmlSource.fileName,
  });
  const topology = conditionGeometry(geometry, [], CONDITIONING_PROFILE);
  const component = reducerComponent();
  const mechanicalModelInput = compilerInput({
    sourceSemanticHash: inputXmlSource.semanticHash,
    conditionedTopology: topology,
    nodeBindings: [
      { nodeId: 'RED-001.N0', conditionedNodeId: 'CN-000120', topologyNodeId: '10' },
      { nodeId: 'RED-001.N1', conditionedNodeId: 'CN-000121', topologyNodeId: '20' },
      { nodeId: 'RED-001.N2', conditionedNodeId: 'CN-000122', topologyNodeId: '30' },
    ],
    elementBindings: [
      elementBinding('RED-001.E1', 'CS-000120', 'IX-S1', 'AXIS-RED-E1', 'SEC-NPS6-SCH40'),
      elementBinding('RED-001.E2', 'CS-000121', 'IX-S2', 'AXIS-RED-E2', 'SEC-NPS4-SCH40'),
    ],
    materialResolutions: [materialResolution()],
    sectionResolutions: [sectionResolution(), reducedSectionResolution()],
    localAxisResults: [
      { evidenceIdentity: 'AXIS-RED-E1', result: axisResult([0, 0, 0], [1.2, 0, 0]) },
      { evidenceIdentity: 'AXIS-RED-E2', result: axisResult([1.2, 0, 0], [2.4, 0, 0]) },
    ],
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: fixedConstraints(),
  });
  const physicalLoadCaseInput = {
    loadCaseId,
    loadCaseClass: 'APPLIED_MECHANICAL',
    presentation: {
      label: `${loadCaseId} M003 fixture`,
      description: 'Declared M003 live-run multicase fixture load.',
    },
    primitives: [reducerTipLoadPrimitive({
      primitiveId: `LP-${loadCaseId}`,
      force: { fx: 0, fy: forceY, fz: 0 },
      sourceEvidence: {
        sourceId: 'PROJECT-LOAD-REGISTER',
        sourceRevision: loadCaseId,
        sourceSemanticHash: loadCaseId === 'LC-HIGH'
          ? 'fnv1a64:8181818181818181'
          : 'fnv1a64:8282828282828282',
      },
    })],
    profile: loadCaseProfile(),
  };
  return {
    schema: LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_SCHEMA,
    inputXmlSource,
    ingestionOptions,
    conditioning: { requiredAttachmentPoints: [], profile: CONDITIONING_PROFILE },
    sourceAnalysisRequest: {
      schema: 'linear-piping-source-analysis-request/v1',
      analysisIdentity,
      analysisRevision: 1,
      mechanicalModelInput,
      physicalLoadCaseInput,
      frameElements: [],
      pipingComponents: [component],
      solverProfile: solverProfile(),
      recoveryProfile: recoveryProfile(),
      expectedSourceAuthorities: {
        sourceSemanticHash: inputXmlSource.semanticHash,
        conditionedTopologyHash: topology.semanticHash,
        compilerProfileSemanticHash: mechanicalModelInput.profile.semanticHash,
        loadCaseProfileSemanticHash: physicalLoadCaseInput.profile.semanticHash,
      },
    },
  };
}

function nozzleProfile() {
  return sealNozzleAllowableProfile({
    schema: NOZZLE_ALLOWABLE_PROFILE_SCHEMA,
    profileId: 'NOZZLE-M003-R1',
    interfaceId: 'IF-NOZZLE-M003',
    sourceIdentity: {
      authority: 'FIXTURE-VENDOR-NOT-STANDARD',
      documentId: 'M003-NOZZLE-DATASHEET',
      revision: '00',
      sourceSemanticHash: 'fnv1a64:8383838383838383',
    },
    forceAllowables: {
      x: declared(10000),
      y: declared(10000),
      z: declared(10000),
    },
    momentAllowables: {
      x: declared(10000),
      y: declared(10000),
      z: declared(10000),
    },
    interactionRuleId: NOZZLE_INTERACTION_RULE,
    interactionLimit: declared(1),
    semanticHash: '',
  });
}

function interfaceAuthority(context, allowableProfile) {
  const compilation = context.sourceAnalysisContext.compilation;
  const node = compilation.model.nodes.find((row) => row.nodeId === 'RED-001.N0');
  const sourceEntityId = node.sourceAncestry.sourceComponentIds[0];
  const dofMappings = compilation.model.constraints
    .filter((row) => row.nodeId === node.nodeId)
    .map((row) => ({
      dof: row.dof,
      behavior: row.behavior,
      constraintId: row.constraintId,
      stiffness: row.stiffness ?? null,
    }));
  return {
    supportAttachmentModel: null,
    restraintCapabilityModel: null,
    definitions: [{
      interfaceId: allowableProfile.interfaceId,
      interfaceKind: 'NOZZLE',
      nodeId: node.nodeId,
      sourceEntityId,
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
        sourceId: 'M003-NOZZLE-REGISTER',
        sourceRevision: '01',
        sourceSemanticHash: 'fnv1a64:8484848484848484',
      },
      allowableProfileHash: allowableProfile.semanticHash,
    }],
    profile: sealInterfaceProfile({
      schema: 'linear-piping-interface-profile/v1',
      profileId: 'M003-INTERFACE-PROFILE',
      basisTolerance: declared(1e-12, 'M003-PHASE-2E-FIXTURE'),
      positionTolerance: declared(1e-12, 'M003-PHASE-2E-FIXTURE'),
      offsetTolerance: declared(1e-12, 'M003-PHASE-2E-FIXTURE'),
      semanticHash: '',
    }),
  };
}

function commonCodeCheck(component) {
  return {
    codePointId: 'RED-001.S1',
    componentId: 'RED-001',
    frameElementRecord: reducerFrameElementE1(component),
    sectionResolution: reducerSectionResolutionE1(),
    materialResolution: reducerMaterialResolution(),
    stressFactorSet: stressFactorSet(),
  };
}

function b31Authority(component) {
  const common = commonCodeCheck(component);
  return {
    applicationId: 'B31-M003-01',
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    checks: [
      {
        checkId: 'B31-SUS-M003',
        category: 'SUSTAINED',
        combinationId: 'LC-HIGH',
        actionSource: { kind: 'SINGLE_CASE', caseId: 'HIGH' },
        ...common,
        pressureStressContribution: pressureStressContribution(),
        coldTemperature: null,
        occasionalCategoryId: null,
      },
      {
        checkId: 'B31-OCC-M003',
        category: 'OCCASIONAL',
        combinationId: 'LC-HIGH-WIND',
        actionSource: { kind: 'SINGLE_CASE', caseId: 'HIGH' },
        ...common,
        pressureStressContribution: pressureStressContribution(),
        coldTemperature: null,
        occasionalCategoryId: 'WIND_FIXTURE',
      },
      {
        checkId: 'B31-EXP-M003',
        category: 'DISPLACEMENT_STRESS_RANGE',
        combinationId: 'HIGH-MINUS-LOW',
        actionSource: { kind: 'CASE_RANGE', fromCaseId: 'LOW', toCaseId: 'HIGH' },
        ...common,
        pressureStressContribution: null,
        coldTemperature: {
          value: COLD_TEMPERATURE,
          source: 'FIXTURE-EDITION-DATASET-NOT-ASME',
        },
        occasionalCategoryId: null,
      },
    ],
  };
}
