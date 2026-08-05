import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createSharedPipingModel,
} from '../src/core/shared-piping-model/index.js';
import {
  buildPipingPortTopologyGraph,
} from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import {
  EMPIRICAL_FAILURE_CODES,
} from '../src/core/empirical-piping-mechanics/index.js';
import {
  inputXmlToCanonicalGeometry,
} from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  auditInputXmlIngestion,
} from '../src/core/geometry/adapters/inputxml-ingestion-audit.js';
import {
  buildSjsonEmpiricalPipingRequest,
} from '../src/workspace/engineering-loads/adapters/sjson-to-empirical-piping-request.js';
import {
  createEmpiricalAnalysisScenario,
  createEmpiricalCoordinateFrame,
  createEmpiricalRestraintOverride,
} from '../src/workspace/engineering-loads/contracts/empirical-sjson-contracts.js';
import {
  cloneEmpiricalRestraintNetworkProfile,
  createEmpiricalRestraintNetworkProfile,
} from '../src/workspace/engineering-loads/empirical-restraint-network-profile.js';
import {
  EMPIRICAL_RESTRAINT_NETWORK_EXECUTION_REQUEST_SCHEMA,
  executeEmpiricalRestraintNetworkRuntime,
} from '../src/workspace/engineering-loads/empirical-restraint-network-runtime.js';
import {
  getEmpiricalMethodRegistration,
} from '../src/workspace/engineering-loads/empirical-method-registry.js';

const METHOD = 'EMPIRICAL_RESTRAINT_NETWORK_V1';
const LOAD_CASE_ID = 'EXP-THERMAL-ON-HOT-SUPPORT-SET';
const EXECUTED_AT = '2026-08-05T23:00:00.000Z';
const SOURCE_HASH = 'sha256:wp5-qualified-fixture';
const E = 200e9;
const OD = 0.1;
const WALL = 0.005;
const A = Math.PI * (OD ** 2 - (OD - 2 * WALL) ** 2) / 4;
const EA = E * A;

const registration = getEmpiricalMethodRegistration(METHOD);
assert.equal(registration.runtimeStatus, 'REGISTERED');
assert.equal(registration.qualificationStatus, 'QUALIFIED_RESTRICTED_DOMAIN');
assert.deepEqual(registration.qualifiedDofs, ['ONE_TRANSLATIONAL_DIRECTION']);

const qualifiedProfile = profileFor(['L1', 'L2']);
const clone = cloneEmpiricalRestraintNetworkProfile(qualifiedProfile, {
  profileId: 'WP5-CLONE',
});
assert.equal(clone.qualification, 'UNQUALIFIED');
assert.equal(clone.locked, false);
assert.notEqual(clone.semanticHash, qualifiedProfile.semanticHash);

const rigidZ = buildExecutionFixture({
  datasetId: 'WP5-OPEN-Z-RIGID',
  axis: 'Z',
  middleMode: 'RIGID',
  profile: qualifiedProfile,
});
const rigidResult = execute(rigidZ);
assertCalculated(rigidResult);
assert.equal(rigidResult.summary.nodeCount, 4);
assert.equal(rigidResult.summary.segmentCount, 3);
assert.equal(rigidResult.summary.includedRestraintCount, 3);
assert.equal(rigidResult.evidence.compatibilitySystem, 'GLOBAL_SCALAR_NETWORK');
assert.equal(rigidResult.evidence.independentRestraintCalculation, false);
assert.equal(rigidResult.evidence.rawSjsonConsumed, false);
assert.equal(rigidResult.evidence.benchmarkDataConsumed, false);
assert.deepEqual(rigidResult.analysisDirection, [0, 0, 1]);

const rigidCase = rigidResult.loadCases[0];
assert.equal(rigidCase.status, 'CALCULATED');
assert.equal(rigidCase.equilibrium.closed, true);
assert(Math.abs(rigidCase.equilibrium.residualN) <= 1e-3);
assert.equal(rigidCase.numericalEvidence.rigidModeCount, 0);
assert.equal(rigidCase.numericalEvidence.rank, 1);
assert(rigidCase.numericalEvidence.minimumPivot > 0);
assert(rigidCase.numericalEvidence.reciprocalConditionEstimate > 0);
assert(rigidCase.numericalEvidence.scaledResidual <= 1e-12);

const rigidBySite = bySupportSite(rigidCase.supportResults);
const middleAttachment = rigidZ.supportAttachmentModel.attachments
  .find((row) => row.supportKey === 'LS-M');
assert(middleAttachment, 'The governed LS-M attachment must exist.');
const middleStationM = middleAttachment.projectedPointCanonical.z / 1000;
const junctionStationM = 0.5;
const terminalStationM = 1;
assert.equal(middleStationM, 0.25);
const leftLengthM = middleStationM;
const rightL1LengthM = junctionStationM - middleStationM;
const rightL2LengthM = terminalStationM - junctionStationM;
const leftExpected = (
  leftLengthM * 1e-5 * 100
) / (leftLengthM / EA);
const rightExpected = (
  rightL1LengthM * 1e-5 * 100
  + rightL2LengthM * 2e-5 * 100
) / ((rightL1LengthM + rightL2LengthM) / EA);
close(rigidBySite.get('ANC-A').reactionComponentN, leftExpected, 1e-6, 'left anchor reaction');
close(
  rigidBySite.get('LS-M').reactionComponentN,
  rightExpected - leftExpected,
  1e-6,
  'middle line-stop reaction',
);
close(rigidBySite.get('ANC-B').reactionComponentN, -rightExpected, 1e-6, 'right anchor reaction');
assert.equal(rigidBySite.get('LS-M').contactState, 'ACTIVE');
assert.equal(rigidBySite.get('LS-M').activeFace, 'ZERO_GAP');
assert.deepEqual(rigidBySite.get('ANC-A').anchorDecomposition.labels, ['LS', 'T1', 'T2']);
assert.equal(rigidBySite.get('ANC-A').globalReaction.forceN.x, 0);
assert.equal(rigidBySite.get('ANC-A').globalReaction.forceN.y, 0);
assert.notEqual(rigidBySite.get('ANC-A').globalReaction.forceN.z, 0);
assert(rigidCase.memberActions.every((row) => row.projectedThermalMovementM > 0));
assert(rigidCase.memberActions.every((row) => row.directionalForceN < 0));

const repeatRigid = execute(rigidZ);
assert.equal(repeatRigid.semanticHash, rigidResult.semanticHash);
assert.equal(JSON.stringify(repeatRigid), JSON.stringify(rigidResult));

// A second axis execution followed by a repeat of Z proves analysis direction is
// stored in the immutable network rather than mutable module-global state.
const rigidX = buildExecutionFixture({
  datasetId: 'WP5-OPEN-X-RIGID',
  axis: 'X',
  middleMode: 'RIGID',
  profile: qualifiedProfile,
});
const rigidXResult = execute(rigidX);
assertCalculated(rigidXResult);
assert.deepEqual(rigidXResult.analysisDirection, [1, 0, 0]);
assert(rigidXResult.loadCases[0].memberActions.every((row) => row.projectedThermalMovementM > 0));
assert.equal(execute(rigidZ).semanticHash, rigidResult.semanticHash);

const gapFixture = buildExecutionFixture({
  datasetId: 'WP5-OPEN-Z-GAP',
  axis: 'Z',
  middleMode: 'GAP',
  profile: qualifiedProfile,
});
const gapResult = execute(gapFixture);
assertCalculated(gapResult);
const gapCase = gapResult.loadCases[0];
const gapMiddle = bySupportSite(gapCase.supportResults).get('LS-M');
assert.equal(gapMiddle.contactState, 'ACTIVE');
assert.equal(gapMiddle.activeFace, 'NEGATIVE');
close(gapMiddle.displacementM, -0.0001, 1e-10, 'active negative gap displacement');
assert(gapMiddle.trialFreeMovementM < -0.0001);
assert.equal(gapCase.contactHistory.length, 2);
assert.equal(gapCase.contactHistory[0].action, 'TRIAL_WITH_GAP_INACTIVE');
assert.equal(gapCase.contactHistory[1].action, 'ACTIVATE_BILATERAL_GAP_FACE');
assert(Math.abs(gapCase.equilibrium.residualN) <= 1e-3);

const springFixture = buildExecutionFixture({
  datasetId: 'WP5-OPEN-Z-SPRING',
  axis: 'Z',
  middleMode: 'SPRING',
  profile: qualifiedProfile,
});
const springResult = execute(springFixture);
assertCalculated(springResult);
const springMiddle = bySupportSite(springResult.loadCases[0].supportResults).get('LS-M');
assert.equal(springMiddle.contactState, 'ELASTIC');
assert.equal(springMiddle.effectiveStiffnessNPerM, 1e8);
assert(springMiddle.displacementM < 0);
assert(springMiddle.reactionComponentN > 0);
assert(Math.abs(springResult.loadCases[0].equilibrium.residualN) <= 1e-3);

const unqualifiedFixture = buildExecutionFixture({
  datasetId: 'WP5-OPEN-Z-UNQUALIFIED',
  axis: 'Z',
  middleMode: 'RIGID',
  profile: clone,
});
const unqualifiedResult = execute(unqualifiedFixture);
assert.equal(unqualifiedResult.status, 'BLOCKED');
assert(hasBlocker(unqualifiedResult, EMPIRICAL_FAILURE_CODES.EMPIRICAL_PROFILE_UNQUALIFIED));

const branchProfile = profileFor(['L1', 'L2', 'L3']);
const branchResult = execute(buildBranchFixture(branchProfile));
assert.equal(branchResult.status, 'BLOCKED');
assert(hasBlocker(branchResult, EMPIRICAL_FAILURE_CODES.TOPOLOGY_BRANCH_PROFILE_REQUIRED));
assert.equal(branchResult.summary.calculatedCaseCount, 0);
assert.equal(branchResult.loadCases[0].supportResults.length, 0);

const loopProfile = profileFor(['L1', 'L2', 'L3', 'L4']);
const loopResult = execute(buildLoopFixture(loopProfile));
assert.equal(loopResult.status, 'BLOCKED');
assert(hasBlocker(loopResult, EMPIRICAL_FAILURE_CODES.TOPOLOGY_LOOP_PROFILE_REQUIRED));
assert.equal(loopResult.summary.calculatedCaseCount, 0);

const bm2Xml = readFileSync(
  new URL('../benchmarks/LFEA/BM2/Input_BM2.xml', import.meta.url),
  'utf8',
);
const bm2Geometry = inputXmlToCanonicalGeometry(bm2Xml, {
  unit: 'mm',
  source: 'CAESAR-II-BM2-INPUTXML',
  restraintTypeCodeMap: { 0: 'ANCHOR', 14: 'GUIDE', 8: 'GUIDE' },
  bendRadiusTolerance: 1e-6,
});
const bm2Audit = auditInputXmlIngestion(bm2Xml, bm2Geometry);
assert.equal(bm2Audit.valid, true);
assert(bm2Audit.teeNodes.length >= 4);
assert.deepEqual(
  bm2Audit.teeNodes.slice(0, 4).map((row) => row.nodeId),
  ['30', '70', '100', '140'],
);
assert.equal(
  bm2Audit.teeNodes.length > 0
    ? EMPIRICAL_FAILURE_CODES.TOPOLOGY_BRANCH_PROFILE_REQUIRED
    : null,
  EMPIRICAL_FAILURE_CODES.TOPOLOGY_BRANCH_PROFILE_REQUIRED,
);
assert.equal(branchResult.status, 'BLOCKED', 'BM2-class branch topology must not publish a scalar estimate.');

const runtimeSource = readFileSync(
  new URL('../src/workspace/engineering-loads/empirical-restraint-network-runtime.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(runtimeSource, /benchmarks\//);
assert.doesNotMatch(runtimeSource, /Input_BM2|Output_BM2|CAESAR/i);
assert.doesNotMatch(runtimeSource, /CURRENT_ANALYSIS_DIRECTION|setCurrentAnalysisDirection/);
assert.match(runtimeSource, /analysisDirection: state\.analysisDirection/);
assert.match(runtimeSource, /GLOBAL_SCALAR_NETWORK/);
assert.match(runtimeSource, /independentRestraintCalculation: false/);

console.log(JSON.stringify({
  method: METHOD,
  rigidReactionsN: Object.fromEntries([...rigidBySite].map(([key, row]) => [
    key,
    row.reactionComponentN,
  ])),
  gapFace: gapMiddle.activeFace,
  gapTrialMovementM: gapMiddle.trialFreeMovementM,
  springReactionN: springMiddle.reactionComponentN,
  branchBlocker: EMPIRICAL_FAILURE_CODES.TOPOLOGY_BRANCH_PROFILE_REQUIRED,
  loopBlocker: EMPIRICAL_FAILURE_CODES.TOPOLOGY_LOOP_PROFILE_REQUIRED,
  bm2TeeNodes: bm2Audit.teeNodes.map((row) => row.nodeId),
}, null, 2));
console.log('empirical-restraint-network-check: PASS');

function execute(fixture) {
  return executeEmpiricalRestraintNetworkRuntime({
    schema: EMPIRICAL_RESTRAINT_NETWORK_EXECUTION_REQUEST_SCHEMA,
    executionId: `EXEC:${fixture.datasetId}`,
    executedAt: EXECUTED_AT,
    adaptedRequest: fixture.request,
    sharedModel: fixture.sharedModel,
    topologyGraph: fixture.topologyGraph,
    supportAttachmentModel: fixture.supportAttachmentModel,
    restraintCapabilityModel: fixture.restraintCapabilityModel,
    runtimeProfile: fixture.profile,
    analysisDirection: fixture.analysisDirection,
    caseConfigurations: [{
      loadCaseId: LOAD_CASE_ID,
      referenceTemperatureC: 20,
      analysisTemperatureC: 120,
    }],
  });
}

function buildExecutionFixture({ datasetId, axis, middleMode, profile }) {
  const direction = axisVector(axis);
  const components = [
    component('PIPE-1', 'L1', pointOnAxis(axis, 0), pointOnAxis(axis, 500)),
    component('PIPE-2', 'L2', pointOnAxis(axis, 500), pointOnAxis(axis, 1000)),
  ];
  const supports = [
    anchorSupport('ANC-A', pointOnAxis(axis, 0), 'PIPE-1:FROM'),
    lineStopSupport('LS-M', pointOnAxis(axis, 400), 'PIPE-1'),
    anchorSupport('ANC-B', pointOnAxis(axis, 1000), 'PIPE-2:TO'),
  ];
  return assembleFixture({
    datasetId,
    components,
    supports,
    profile,
    analysisDirection: direction,
    overrideMode: middleMode,
  });
}

function buildBranchFixture(profile) {
  const center = { x: 0, y: 0, z: 0 };
  const components = [
    component('ARM-Z', 'L1', center, { x: 0, y: 0, z: 1000 }),
    component('ARM-X', 'L2', center, { x: 1000, y: 0, z: 0 }),
    component('ARM-Y', 'L3', center, { x: 0, y: 1000, z: 0 }),
  ];
  const supports = [
    anchorSupport('ANC-Z', { x: 0, y: 0, z: 1000 }, 'ARM-Z:TO'),
    anchorSupport('ANC-X', { x: 1000, y: 0, z: 0 }, 'ARM-X:TO'),
    anchorSupport('ANC-Y', { x: 0, y: 1000, z: 0 }, 'ARM-Y:TO'),
    lineStopSupport('LS-Z', { x: 0, y: 0, z: 500 }, 'ARM-Z'),
  ];
  return assembleFixture({
    datasetId: 'WP5-BRANCH-BLOCK',
    components,
    supports,
    profile,
    analysisDirection: [0, 0, 1],
    overrideMode: 'RIGID',
  });
}

function buildLoopFixture(profile) {
  const components = [
    component('LOOP-1', 'L1', { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }),
    component('LOOP-2', 'L2', { x: 1000, y: 0, z: 0 }, { x: 1000, y: 0, z: 1000 }),
    component('LOOP-3', 'L3', { x: 1000, y: 0, z: 1000 }, { x: 0, y: 0, z: 1000 }),
    component('LOOP-4', 'L4', { x: 0, y: 0, z: 1000 }, { x: 0, y: 0, z: 0 }),
  ];
  const supports = [
    anchorSupport('ANC-L1', { x: 250, y: 0, z: 0 }, null, 'LOOP-1'),
    lineStopSupport('LS-L2', { x: 1000, y: 0, z: 500 }, 'LOOP-2'),
    anchorSupport('ANC-L3', { x: 250, y: 0, z: 1000 }, null, 'LOOP-3'),
  ];
  return assembleFixture({
    datasetId: 'WP5-LOOP-BLOCK',
    components,
    supports,
    profile,
    analysisDirection: [0, 0, 1],
    overrideMode: 'RIGID',
  });
}

function assembleFixture({
  datasetId,
  components,
  supports,
  profile,
  analysisDirection,
  overrideMode,
}) {
  const sharedModel = createSharedPipingModel({
    project: { datasetId, name: datasetId, sourceName: `${datasetId}.json` },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId,
      sourceSchema: 'wp5-restraint-network-fixture/v1',
      sourceSemanticHash: `fixture:${datasetId}`,
      sourceByteHash: SOURCE_HASH,
    },
    components,
    supports,
    sourceReferences: { nodes: [] },
    diagnostics: [],
  });
  const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
  const supportAttachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
  const restraintCapabilityModel = buildRestraintCapabilityModel(supportAttachmentModel);
  const middle = restraintCapabilityModel.restraints.find((row) => row.supportKey.startsWith('LS-'));
  const overrides = overrideMode === 'RIGID' || !middle
    ? []
    : [overrideFor(middle, analysisDirection, overrideMode)];
  const coordinateFrame = createEmpiricalCoordinateFrame({
    sourceBasis: 'SJSON_SOURCE',
    sourceLengthUnit: 'mm',
    verticalUnitVector: [0, 0, 1],
    analysisPlaneBasis: {
      u: [1, 0, 0],
      v: [0, 0, 1],
      normal: [0, -1, 0],
    },
    forceOutputConvention: 'RESTRAINT_ON_PIPE',
    momentOutputConvention: 'RESTRAINT_ON_PIPE',
  });
  const scenario = createEmpiricalAnalysisScenario({
    scenarioId: `SCENARIO:${datasetId}`,
    name: datasetId,
    method: METHOD,
    state: 'DRAFT',
    coordinateFrame,
    loadCases: [{
      loadCaseId: LOAD_CASE_ID,
      label: 'Thermal line-stop screening',
      resultClass: 'THERMAL_LINE_STOP_SCREENING_RESULT',
      effects: {
        weight: false,
        thermalStrain: true,
        pressureCompatibility: false,
        pressureStress: false,
      },
    }],
    restraintOverrides: overrides,
    profileRef: {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      qualification: profile.qualification,
      locked: profile.locked,
      semanticHash: profile.semanticHash,
    },
    sourceBindings: {
      datasetHash: SOURCE_HASH,
      sharedModelHash: sharedModel.semanticHash,
      topologyHash: topologyGraph.semanticHash,
      attachmentHash: supportAttachmentModel.semanticHash,
      restraintHash: restraintCapabilityModel.semanticHash,
      profileHash: profile.semanticHash,
    },
    combinationPolicy: 'SEPARATE_UNTIL_QUALIFIED',
  });
  const request = buildSjsonEmpiricalPipingRequest({
    dataset: { datasetId, sourceSha256: SOURCE_HASH },
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    scenario,
  });
  return {
    datasetId,
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    profile,
    request,
    analysisDirection,
  };
}

function overrideFor(restraint, axis, mode) {
  return createEmpiricalRestraintOverride({
    overrideId: `OVR:${restraint.supportKey}:${mode}`,
    supportSiteId: restraint.supportKey,
    restraintId: restraint.restraintId,
    sourceType: restraint.supportType,
    effectiveType: 'LINE_STOP',
    sourceDirection: 'LONGITUDINAL',
    effectiveDirection: 'LONGITUDINAL',
    sourceAxis: axis,
    effectiveAxis: axis,
    sourceGapMm: null,
    effectiveGapMm: mode === 'GAP' ? 0.1 : 0,
    sourceStiffnessNPerM: null,
    effectiveStiffnessNPerM: mode === 'SPRING' ? 1e8 : null,
    sourceFriction: null,
    effectiveFriction: 0,
    reason: mode === 'GAP'
      ? 'WP5 qualification bilateral symmetric gap.'
      : 'WP5 qualification finite ground stiffness.',
    geometryMutation: false,
  });
}

function profileFor(lineIds) {
  return createEmpiricalRestraintNetworkProfile({
    profileId: `WP5-QUALIFIED-${lineIds.join('-')}`,
    profileVersion: 1,
    qualification: 'QUALIFIED',
    locked: true,
    lineProperties: Object.fromEntries(lineIds.map((lineId, index) => [lineId, {
      outsideDiameterM: OD,
      wallThicknessM: WALL,
      elasticModulusPa: E,
      thermalExpansionPerK: lineId === 'L2' ? 2e-5 : 1e-5,
      authority: {
        section: `FIXTURE:${lineId}:SECTION`,
        elasticModulus: `FIXTURE:${lineId}:E`,
        thermalExpansion: `FIXTURE:${lineId}:ALPHA`,
      },
    }])),
    compliance: {
      axialComplianceMultiplier: 1,
      bendingComplianceMultiplier: 1,
      topologyInteractionMultiplier: 1,
    },
    domain: {
      allowedComponentTypes: ['PIPE'],
      requireTerminalAnchors: true,
      maximumFiniteGapCount: 1,
      maximumFiniteStiffnessCount: 1,
      allowFriction: false,
      allowBranches: false,
      allowClosedLoops: false,
    },
    tolerances: {
      pointProjectionM: 1e-6,
      directionParallelCosine: 0.999999,
      directionOrthogonalCosine: 1e-6,
      gapM: 1e-10,
      reactionN: 1e-6,
      equilibriumN: 1e-3,
      maximumScaledResidual: 1e-12,
    },
    numericalOptions: {
      pivotMultiplier: 100,
      minimumReciprocalCondition: 1e-14,
    },
  });
}

function component(componentKey, lineId, start, end) {
  return {
    componentKey,
    sourceEntityId: `entity:${componentKey}`,
    name: componentKey,
    type: 'PIPE',
    identity: { lineId, branchId: 'B1', systemId: 'SYS-WP5', zoneId: 'Z1' },
    geometry: {
      start,
      end,
      center: midpoint(start, end),
      points: [start, end],
      branchPoints: [],
      explicitCenter: false,
      boreMm: null,
      ports: [
        port(componentKey, 'FROM', start),
        port(componentKey, 'TO', end),
      ],
      sources: {
        start: `${componentKey}.start`,
        end: `${componentKey}.end`,
        center: 'derived.midpoint',
        branches: [],
      },
    },
    engineeringProperties: {},
    compatibilityEvidence: {},
    sourceReferences: sourceReferences(componentKey),
    diagnostics: [],
  };
}

function anchorSupport(supportKey, position, portKey = null, componentKey = null) {
  return supportRecord({
    supportKey,
    position,
    type: 'ANCHOR',
    portKey,
    componentKey,
    vertical: 'RESTRAINED',
    lateral: 'RESTRAINED',
    longitudinal: 'RESTRAINED',
  });
}

function lineStopSupport(supportKey, position, componentKey) {
  return supportRecord({
    supportKey,
    position,
    type: 'LINE_STOP',
    componentKey,
    vertical: 'FREE',
    lateral: 'FREE',
    longitudinal: 'RESTRAINED',
  });
}

function supportRecord({
  supportKey,
  position,
  type,
  portKey,
  componentKey,
  vertical,
  lateral,
  longitudinal,
}) {
  const supportEvidence = {
    supportTypes: [evidence(type, 'SUPPORT_TYPE')],
    verticalCapabilities: [evidence(vertical, 'VERTICAL_CAPABILITY')],
    lateralCapabilities: [evidence(lateral, 'LATERAL_CAPABILITY')],
    longitudinalCapabilities: [evidence(longitudinal, 'LONGITUDINAL_CAPABILITY')],
  };
  if (portKey) {
    supportEvidence.attachedPortReferences = [evidence(portKey, 'ATTACHED_PORT_ID')];
  } else {
    supportEvidence.attachedComponentReferences = [
      evidence(componentKey, 'ATTACHED_COMPONENT_ID'),
    ];
  }
  return {
    supportKey,
    sourceEntityId: `entity:${supportKey}`,
    name: supportKey,
    type,
    identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS-WP5', zoneId: 'Z1' },
    position,
    engineeringProperties: {},
    compatibilityEvidence: {},
    supportEvidence,
    sourceReferences: sourceReferences(supportKey),
    diagnostics: [],
  };
}

function evidence(value, field) {
  return {
    value,
    unit: '',
    sourcePath: `sourceAttributes.${field}`,
    sourceRoot: 'sourceAttributes',
    sourceKind: 'sourceAttributes',
  };
}

function port(componentKey, role, position) {
  const portKey = `${componentKey}:${role}`;
  const peerMap = {
    'PIPE-1:TO': 'PIPE-2:FROM',
    'PIPE-2:FROM': 'PIPE-1:TO',
    'LOOP-1:TO': 'LOOP-2:FROM',
    'LOOP-2:FROM': 'LOOP-1:TO',
    'LOOP-2:TO': 'LOOP-3:FROM',
    'LOOP-3:FROM': 'LOOP-2:TO',
    'LOOP-3:TO': 'LOOP-4:FROM',
    'LOOP-4:FROM': 'LOOP-3:TO',
    'LOOP-4:TO': 'LOOP-1:FROM',
    'LOOP-1:FROM': 'LOOP-4:TO',
  };
  const sourceReference = { sourcePath: `${componentKey}.${role}` };
  if (peerMap[portKey]) sourceReference.explicitPeerPortKey = peerMap[portKey];
  const branchCenter = role === 'FROM' && ['ARM-Z', 'ARM-X', 'ARM-Y'].includes(componentKey);
  if (branchCenter) sourceReference.explicitConnectionId = 'WP5-BRANCH-JUNCTION';
  if (branchCenter && componentKey === 'ARM-Z') sourceReference.multiConnection = true;
  return {
    portKey,
    role,
    position,
    multiConnection: branchCenter && componentKey === 'ARM-Z',
    sourceReference,
  };
}

function sourceReferences(key) {
  return {
    sourceNodeKey: `node:${key}`,
    sourceEntityId: `entity:${key}`,
    jsonPointer: `/objects/${key}`,
    sourcePath: `/MODEL/${key}`,
  };
}

function pointOnAxis(axis, stationMm) {
  if (axis === 'X') return { x: stationMm, y: 0, z: 0 };
  if (axis === 'Y') return { x: 0, y: stationMm, z: 0 };
  return { x: 0, y: 0, z: stationMm };
}

function axisVector(axis) {
  if (axis === 'X') return [1, 0, 0];
  if (axis === 'Y') return [0, 1, 0];
  return [0, 0, 1];
}

function midpoint(left, right) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: (left.z + right.z) / 2,
  };
}

function bySupportSite(rows) {
  return new Map(rows.map((row) => [row.supportSiteId, row]));
}

function assertCalculated(result) {
  assert.equal(result.status, 'CALCULATED', JSON.stringify(result.loadCases[0]?.blockers || []));
  assert.equal(result.loadCases.length, 1);
  assert.equal(result.loadCases[0].status, 'CALCULATED');
}

function hasBlocker(result, code) {
  return result.loadCases.some((row) => row.blockers.some((blocker) => blocker.code === code));
}

function close(actual, expected, tolerance, label) {
  assert(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${label}: expected ${expected}, received ${actual}`,
  );
}
