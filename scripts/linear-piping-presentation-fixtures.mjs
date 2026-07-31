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
  codeProfile,
  editionDataset,
  pressureStressContribution,
  reducerFrameElementE1,
  reducerMaterialResolution,
  reducerSectionResolutionE1,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';
import {
  recoveryProfile,
  reducerCompilation,
  reducerComponent,
  reducerTipLoadCase,
  solverProfile,
} from './lfea-b3.4-recovery-fixtures.mjs';

function declared(value, source) {
  return { value, source };
}

export function buildQualifiedPresentationFixture() {
  const compilation = reducerCompilation();
  const component = reducerComponent();
  const loadCase = reducerTipLoadCase(compilation);
  const qualifiedSolverProfile = solverProfile({
    conditionWarning: declared(1e30, 'PHASE-5-QUALIFIED-FIXTURE-PROFILE'),
    conditionBlock: declared(1e40, 'PHASE-5-QUALIFIED-FIXTURE-PROFILE'),
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
  const node = compilation.model.nodes.find((row) => row.nodeId === 'RED-001.N0');
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
      sourceEntityId: 'RED-001',
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
  const b31Application = compileLinearPipingB31Application({
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: 'B31-PHASE5-QUALIFIED',
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    cases: [{ caseId: 'OPERATING_CASE', loadCase, recovery: analysisResult.recovery }],
    checks: [{
      checkId: 'B31-PHASE5-SUSTAINED',
      category: 'SUSTAINED',
      codePointId: 'RED-001.S1',
      componentId: 'RED-001',
      combinationId: loadCase.loadCaseId,
      actionSource: { kind: 'SINGLE_CASE', caseId: 'OPERATING_CASE' },
      frameElementRecord: reducerFrameElementE1(component),
      sectionResolution: reducerSectionResolutionE1(),
      materialResolution: reducerMaterialResolution(),
      stressFactorSet: stressFactorSet(),
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
