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
  cloneEmpiricalCoupledRestraintNetworkProfile,
  createEmpiricalCoupledRestraintNetworkProfile,
} from '../src/workspace/engineering-loads/empirical-coupled-restraint-network-profile.js';
import {
  EMPIRICAL_COUPLED_RESTRAINT_NETWORK_EXECUTION_REQUEST_SCHEMA,
  executeEmpiricalCoupledRestraintNetworkRuntime,
} from '../src/workspace/engineering-loads/empirical-coupled-restraint-network-runtime.js';
import {
  getEmpiricalMethodRegistration,
} from '../src/workspace/engineering-loads/empirical-method-registry.js';

const METHOD = 'EMPIRICAL_RESTRAINT_NETWORK_V2';
const LOAD_CASE_ID = 'EXP-THERMAL-ON-HOT-SUPPORT-SET';
const EXECUTED_AT = '2026-08-06T01:00:00.000Z';
const SOURCE_HASH = 'sha256:wp6-qualified-fixture';
const E = 200e9;
const OD = 0.1;
const WALL = 0.005;
const ALPHA = 1e-5;
const DELTA_T = 100;
const AREA = Math.PI * (OD ** 2 - (OD - 2 * WALL) ** 2) / 4;
const SECOND_MOMENT = Math.PI * (OD ** 4 - (OD - 2 * WALL) ** 4) / 64;
const EA = E * AREA;
const EI = E * SECOND_MOMENT;

const registration = getEmpiricalMethodRegistration(METHOD);
assert.equal(registration.runtimeStatus, 'REGISTERED');
assert.equal(registration.qualificationStatus, 'QUALIFIED_RESTRICTED_DOMAIN');
assert.deepEqual(registration.qualifiedDofs, ['ONE_TRANSLATIONAL_DIRECTION_COUPLED_GRAPH']);

const qualifiedProfile = profileFor();
const profileClone = cloneEmpiricalCoupledRestraintNetworkProfile(qualifiedProfile, {
  profileId: 'WP6-CLONE',
});
assert.equal(profileClone.qualification, 'UNQUALIFIED');
assert.equal(profileClone.locked, false);
assert.notEqual(profileClone.semanticHash, qualifiedProfile.semanticHash);

const branchFixture = buildBranchFixture(qualifiedProfile);
const branchResult = execute(branchFixture);
assertCalculated(branchResult);
assert.equal(branchResult.evidence.compatibilitySystem, 'GLOBAL_COUPLED_SCALAR_GRAPH');
assert.equal(branchResult.evidence.branchCompatibility, 'SHARED_JUNCTION_DISPLACEMENT');
assert.equal(branchResult.evidence.cycleClosure, 'SINGLE_GLOBAL_STIFFNESS_SYSTEM');
assert.equal(branchResult.evidence.independentRestraintCalculation, false);
assert.equal(branchResult.evidence.rawSjsonConsumed, false);
assert.equal(branchResult.evidence.referenceDataConsumed, false);
assert.equal(branchResult.summary.branchNodeCount, 1);
assert.equal(branchResult.summary.cycleCount, 0);

const branchCase = branchResult.loadCases[0];
assert.equal(branchCase.topologyEvidence.maximumNodeDegree, 3);
assert.equal(branchCase.topologyEvidence.branchNodeIds.length, 1);
assert.equal(branchCase.topologyEvidence.cycleCount, 0);
assert.equal(branchCase.equilibrium.closed, true);
assert(Math.abs(branchCase.equilibrium.residualN) <= 1e-3);
assert.equal(branchCase.numericalEvidence.rigidModeCount, 0);
assert(branchCase.numericalEvidence.scaledResidual <= 1e-12);

const branchBySite = bySupportSite(branchCase.supportResults);
const branchLengthM = 1;
const kz = EA / branchLengthM;
const kx = EI / branchLengthM ** 3;
const ky = kx;
const thermalMovementM = ALPHA * DELTA_T * branchLengthM;
const expectedCenterMovementM = -(kz * thermalMovementM) / (kz + kx + ky);
const expectedZReactionN = -kz * (expectedCenterMovementM + thermalMovementM);
const expectedXReactionN = -kx * expectedCenterMovementM;
const expectedYReactionN = -ky * expectedCenterMovementM;
close(branchBySite.get('ANC-Z').reactionComponentN, expectedZReactionN, 1e-8, 'branch Z anchor');
close(branchBySite.get('ANC-X').reactionComponentN, expectedXReactionN, 1e-8, 'branch X anchor');
close(branchBySite.get('ANC-Y').reactionComponentN, expectedYReactionN, 1e-8, 'branch Y anchor');
close(
  expectedZReactionN + expectedXReactionN + expectedYReactionN,
  0,
  1e-8,
  'branch closed-form equilibrium',
);
const branchActions = byComponent(branchCase.memberActions);
close(
  -branchActions.get('ARM-X').directionalForceN / kx,
  expectedCenterMovementM,
  1e-8,
  'branch junction movement from X arm',
);
assert.equal(execute(branchFixture).semanticHash, branchResult.semanticHash);

const loopFixture = buildLoopFixture(qualifiedProfile);
const loopResult = execute(loopFixture);
assertCalculated(loopResult);
assert.equal(loopResult.summary.branchNodeCount, 0);
assert.equal(loopResult.summary.cycleCount, 1);
const loopCase = loopResult.loadCases[0];
assert.equal(loopCase.topologyEvidence.cycleCount, 1);
assert.equal(loopCase.topologyEvidence.branchNodeIds.length, 0);
assert.equal(loopCase.equilibrium.closed, true);
assert(Math.abs(loopCase.equilibrium.residualN) <= 1e-3);

const diagonalLengthM = Math.sqrt(0.5 ** 2 + 0.5 ** 2);
const q = 0.5;
const diagonalComplianceMPerN = q * diagonalLengthM / EA
  + (1 - q) * diagonalLengthM ** 3 / EI;
const pathComplianceMPerN = 2 * diagonalComplianceMPerN;
const pathThermalMovementM = ALPHA * DELTA_T;
const expectedPathForceN = -pathThermalMovementM / pathComplianceMPerN;
const loopBySite = bySupportSite(loopCase.supportResults);
close(loopBySite.get('ANC-A').reactionComponentN, -2 * expectedPathForceN, 1e-8, 'loop A anchor');
close(loopBySite.get('ANC-B').reactionComponentN, 2 * expectedPathForceN, 1e-8, 'loop B anchor');
const loopActions = loopCase.memberActions.map((row) => row.directionalForceN);
loopActions.forEach((force, index) => close(force, expectedPathForceN, 1e-8, `loop member ${index + 1}`));

const unqualifiedResult = execute(buildBranchFixture(profileClone));
assert.equal(unqualifiedResult.status, 'BLOCKED');
assert(hasBlocker(unqualifiedResult, EMPIRICAL_FAILURE_CODES.EMPIRICAL_PROFILE_UNQUALIFIED));

for (const mode of ['GAP', 'SPRING', 'FRICTION']) {
  const result = execute(buildOpenChainFixture(qualifiedProfile, mode));
  assert.equal(result.status, 'BLOCKED', `${mode} must fail closed.`);
  assert(hasBlocker(result, EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE));
  assert.equal(result.summary.calculatedCaseCount, 0);
  assert.equal(result.loadCases[0].supportResults.length, 0);
}

const excessiveDegreeProfile = createEmpiricalCoupledRestraintNetworkProfile({
  ...profileInput(),
  profileId: 'WP6-MAX-DEGREE-2',
  domain: { ...profileInput().domain, maximumNodeDegree: 2 },
});
const excessiveDegree = execute(buildBranchFixture(excessiveDegreeProfile));
assert.equal(excessiveDegree.status, 'BLOCKED');
assert(hasBlocker(excessiveDegree, EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE));

const bm2Xml = readFileSync(
  new URL('../benchmarks/LFEA/BM2/Input_BM2.xml', import.meta.url),
  'utf8',
);
const bm2Geometry = inputXmlToCanonicalGeometry(bm2Xml, {
  unit: 'mm',
  source: 'CAESAR-II-BM2-INPUTXML-TOPOLOGY-EVIDENCE',
  restraintTypeCodeMap: { 0: 'ANCHOR', 14: 'GUIDE', 8: 'GUIDE' },
  bendRadiusTolerance: 1e-6,
});
const bm2Audit = auditInputXmlIngestion(bm2Xml, bm2Geometry);
assert.equal(bm2Audit.valid, true);
assert.deepEqual(
  bm2Audit.teeNodes.slice(0, 4).map((row) => row.nodeId),
  ['30', '70', '100', '140'],
);
const bm2GraphEvidence = graphEvidence(bm2Geometry);
assert(bm2GraphEvidence.branchNodeIds.length >= 4);
assert(bm2GraphEvidence.cycleCount >= 1);

const runtimeSource = readFileSync(
  new URL('../src/workspace/engineering-loads/empirical-coupled-restraint-network-runtime.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(runtimeSource, /benchmarks\//);
assert.doesNotMatch(runtimeSource, /Input_BM2|Output_BM2|CAESAR/i);
assert.doesNotMatch(runtimeSource, /CURRENT_ANALYSIS_DIRECTION|setCurrentAnalysisDirection/);
assert.match(runtimeSource, /GLOBAL_COUPLED_SCALAR_GRAPH/);
assert.match(runtimeSource, /SHARED_JUNCTION_DISPLACEMENT/);
assert.match(runtimeSource, /independentRestraintCalculation: false/);

console.log(JSON.stringify({
  method: METHOD,
  branch: {
    centerMovementM: expectedCenterMovementM,
    reactionsN: Object.fromEntries([...branchBySite].map(([key, row]) => [
      key,
      row.reactionComponentN,
    ])),
  },
  loop: {
    cycleCount: loopCase.topologyEvidence.cycleCount,
    pathForceN: expectedPathForceN,
    reactionsN: Object.fromEntries([...loopBySite].map(([key, row]) => [
      key,
      row.reactionComponentN,
    ])),
  },
  bm2TopologyEvidence: bm2GraphEvidence,
}, null, 2));
console.log('empirical-coupled-restraint-network-check: PASS');

function execute(fixture) {
  return executeEmpiricalCoupledRestraintNetworkRuntime({
    schema: EMPIRICAL_COUPLED_RESTRAINT_NETWORK_EXECUTION_REQUEST_SCHEMA,
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

function buildBranchFixture(profile) {
  const center = { x: 0, y: 0, z: 0 };
  const connection = { explicitConnectionId: 'WP6-BRANCH-JUNCTION' };
  const components = [
    component('ARM-Z', center, { x: 0, y: 0, z: 1000 }, {
      FROM: { ...connection, multiConnection: true },
    }),
    component('ARM-X', center, { x: 1000, y: 0, z: 0 }, { FROM: connection }),
    component('ARM-Y', center, { x: 0, y: 1000, z: 0 }, { FROM: connection }),
  ];
  const supports = [
    anchorSupport('ANC-Z', { x: 0, y: 0, z: 1000 }, 'ARM-Z:TO'),
    anchorSupport('ANC-X', { x: 1000, y: 0, z: 0 }, 'ARM-X:TO'),
    anchorSupport('ANC-Y', { x: 0, y: 1000, z: 0 }, 'ARM-Y:TO'),
  ];
  return assembleFixture({
    datasetId: `WP6-BRANCH-${profile.profileId}`,
    components,
    supports,
    profile,
    analysisDirection: [0, 0, 1],
  });
}

function buildLoopFixture(profile) {
  const A = { x: 0, y: 0, z: 0 };
  const B = { x: 1000, y: 0, z: 0 };
  const C = { x: 500, y: 500, z: 0 };
  const D = { x: 500, y: -500, z: 0 };
  const components = [
    component('PATH-1A', A, C, {
      FROM: { explicitPeerPortKey: 'PATH-2A:FROM' },
      TO: { explicitPeerPortKey: 'PATH-1B:FROM' },
    }),
    component('PATH-1B', C, B, {
      FROM: { explicitPeerPortKey: 'PATH-1A:TO' },
      TO: { explicitPeerPortKey: 'PATH-2B:TO' },
    }),
    component('PATH-2A', A, D, {
      FROM: { explicitPeerPortKey: 'PATH-1A:FROM' },
      TO: { explicitPeerPortKey: 'PATH-2B:FROM' },
    }),
    component('PATH-2B', D, B, {
      FROM: { explicitPeerPortKey: 'PATH-2A:TO' },
      TO: { explicitPeerPortKey: 'PATH-1B:TO' },
    }),
  ];
  const supports = [
    anchorSupport('ANC-A', A, 'PATH-1A:FROM'),
    anchorSupport('ANC-B', B, 'PATH-1B:TO'),
  ];
  return assembleFixture({
    datasetId: `WP6-LOOP-${profile.profileId}`,
    components,
    supports,
    profile,
    analysisDirection: [1, 0, 0],
  });
}

function buildOpenChainFixture(profile, overrideMode) {
  const components = [
    component('PIPE-1', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 500 }, {
      TO: { explicitPeerPortKey: 'PIPE-2:FROM' },
    }),
    component('PIPE-2', { x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 1000 }, {
      FROM: { explicitPeerPortKey: 'PIPE-1:TO' },
    }),
  ];
  const supports = [
    anchorSupport('ANC-A', { x: 0, y: 0, z: 0 }, 'PIPE-1:FROM'),
    lineStopSupport('LS-M', { x: 0, y: 0, z: 250 }, 'PIPE-1'),
    anchorSupport('ANC-B', { x: 0, y: 0, z: 1000 }, 'PIPE-2:TO'),
  ];
  return assembleFixture({
    datasetId: `WP6-${overrideMode}-BLOCK`,
    components,
    supports,
    profile,
    analysisDirection: [0, 0, 1],
    overrideMode,
  });
}

function assembleFixture({
  datasetId,
  components,
  supports,
  profile,
  analysisDirection,
  overrideMode = null,
}) {
  const sharedModel = createSharedPipingModel({
    project: { datasetId, name: datasetId, sourceName: `${datasetId}.json` },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId,
      sourceSchema: 'wp6-coupled-restraint-network-fixture/v1',
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
  const middle = restraintCapabilityModel.restraints.find((row) => row.supportKey === 'LS-M');
  const restraintOverrides = middle && overrideMode
    ? [overrideFor(middle, analysisDirection, overrideMode)]
    : [];
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
      label: 'Coupled thermal line-stop screening',
      resultClass: 'THERMAL_LINE_STOP_SCREENING_RESULT',
      effects: {
        weight: false,
        thermalStrain: true,
        pressureCompatibility: false,
        pressureStress: false,
      },
    }],
    restraintOverrides,
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
    effectiveFriction: mode === 'FRICTION' ? 0.2 : 0,
    reason: `WP6 qualification ${mode.toLowerCase()} fail-closed case.`,
    geometryMutation: false,
  });
}

function profileFor() {
  return createEmpiricalCoupledRestraintNetworkProfile(profileInput());
}

function profileInput() {
  return {
    profileId: 'WP6-COUPLED-PIPE-R1',
    profileVersion: 1,
    qualification: 'QUALIFIED',
    locked: true,
    lineProperties: {
      L1: {
        outsideDiameterM: OD,
        wallThicknessM: WALL,
        elasticModulusPa: E,
        thermalExpansionPerK: ALPHA,
        authority: {
          section: 'FIXTURE:L1:SECTION',
          elasticModulus: 'FIXTURE:L1:E',
          thermalExpansion: 'FIXTURE:L1:ALPHA',
        },
      },
    },
    componentComplianceMultipliers: { PIPE: 1 },
    compliance: {
      axialComplianceMultiplier: 1,
      bendingComplianceMultiplier: 1,
      topologyInteractionMultiplier: 1,
    },
    domain: {
      allowedComponentTypes: ['PIPE'],
      requireAtLeastOneAnchor: true,
      requireTwoPortComponents: true,
      maximumNodeDegree: 4,
      maximumCycleCount: 4,
      allowFriction: false,
      allowFiniteGaps: false,
      allowFiniteStiffness: false,
      allowBranches: true,
      allowClosedLoops: true,
    },
    tolerances: {
      pointProjectionM: 1e-6,
      directionParallelCosine: 0.999999,
      directionOrthogonalCosine: 1e-6,
      reactionN: 1e-6,
      equilibriumN: 1e-3,
      maximumScaledResidual: 1e-12,
    },
    numericalOptions: {
      pivotMultiplier: 100,
      minimumReciprocalCondition: 1e-14,
    },
  };
}

function component(componentKey, start, end, portEvidence = {}) {
  return {
    componentKey,
    sourceEntityId: `entity:${componentKey}`,
    name: componentKey,
    type: 'PIPE',
    identity: { lineId: 'L1', branchId: componentKey, systemId: 'SYS-WP6', zoneId: 'Z1' },
    geometry: {
      start,
      end,
      center: midpoint(start, end),
      points: [start, end],
      branchPoints: [],
      explicitCenter: false,
      boreMm: null,
      ports: [
        port(componentKey, 'FROM', start, portEvidence.FROM),
        port(componentKey, 'TO', end, portEvidence.TO),
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

function anchorSupport(supportKey, position, portKey) {
  return supportRecord({
    supportKey,
    position,
    type: 'ANCHOR',
    portKey,
    componentKey: null,
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
    portKey: null,
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
    identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS-WP6', zoneId: 'Z1' },
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

function port(componentKey, role, position, connection = null) {
  const sourceReference = { sourcePath: `${componentKey}.${role}` };
  if (connection?.explicitPeerPortKey) {
    sourceReference.explicitPeerPortKey = connection.explicitPeerPortKey;
  }
  if (connection?.explicitConnectionId) {
    sourceReference.explicitConnectionId = connection.explicitConnectionId;
  }
  if (connection?.multiConnection) sourceReference.multiConnection = true;
  return {
    portKey: `${componentKey}:${role}`,
    role,
    position,
    multiConnection: Boolean(connection?.multiConnection),
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

function graphEvidence(geometry) {
  const nodeIds = new Set(geometry.nodes.map((node) => String(node.id)));
  const parent = new Map([...nodeIds].map((id) => [id, id]));
  const degree = new Map([...nodeIds].map((id) => [id, 0]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = id;
    while (current !== root) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set([a, b].sort()[1], [a, b].sort()[0]);
  };
  for (const segment of geometry.segments) {
    const left = String(segment.startNodeId);
    const right = String(segment.endNodeId);
    degree.set(left, (degree.get(left) || 0) + 1);
    degree.set(right, (degree.get(right) || 0) + 1);
    union(left, right);
  }
  const connectedComponentCount = new Set([...nodeIds].map(find)).size;
  return {
    nodeCount: nodeIds.size,
    edgeCount: geometry.segments.length,
    connectedComponentCount,
    cycleCount: geometry.segments.length - nodeIds.size + connectedComponentCount,
    branchNodeIds: [...degree.entries()]
      .filter(([, value]) => value > 2)
      .map(([id]) => id)
      .sort((left, right) => Number(left) - Number(right)),
  };
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

function byComponent(rows) {
  return new Map(rows.map((row) => [row.componentKey, row]));
}

function assertCalculated(result) {
  assert.equal(result.status, 'CALCULATED', JSON.stringify(result.loadCases[0]?.blockers || []));
  assert.equal(result.loadCases.length, 1);
  assert.equal(result.loadCases[0].status, 'CALCULATED');
}

function hasBlocker(result, code) {
  return result.loadCases.some((row) => row.blockers.some((blocker) => blocker.code === code));
}

function close(actual, expected, relativeTolerance, label) {
  const tolerance = relativeTolerance * Math.max(1, Math.abs(expected));
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}, tolerance ${tolerance}`,
  );
}
