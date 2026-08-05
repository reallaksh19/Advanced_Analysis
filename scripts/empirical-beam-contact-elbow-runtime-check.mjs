import assert from 'node:assert/strict';
import { createSharedPipingModel } from '../src/core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { buildModelLoadFoundation } from '../src/core/model-loads/index.js';
import {
  buildSjsonEmpiricalPipingRequest,
} from '../src/workspace/engineering-loads/adapters/sjson-to-empirical-piping-request.js';
import {
  calculateAuthorizedEmpiricalBeamContactExecution,
} from '../src/workspace/engineering-loads/authorized-empirical-beam-contact-execution.js';
import {
  createEmpiricalBeamContactRuntimeProfile,
} from '../src/workspace/engineering-loads/empirical-beam-contact-runtime-profile.js';
import {
  createEmpiricalAnalysisScenario,
  createEmpiricalCoordinateFrame,
} from '../src/workspace/engineering-loads/contracts/empirical-sjson-contracts.js';

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
const runtimeProfile = createEmpiricalBeamContactRuntimeProfile({
  profileId: 'WP2-ELBOW-PROFILE',
  profileVersion: 1,
  qualification: 'QUALIFIED',
  locked: true,
  lineProperties: {
    L1: {
      outsideDiameterM: 0.1,
      nominalWallM: 0.005,
      stiffnessWallM: 0.005,
      weightWallM: 0.005,
      corrosionAllowanceM: 0,
      elasticModulusPa: 200e9,
      thermalExpansionPerK: 12e-6,
      authority: {
        section: 'WP2_ELBOW_SOURCE',
        elasticModulus: 'WP2_ELBOW_SOURCE',
        thermalExpansion: 'WP2_ELBOW_SOURCE',
      },
    },
  },
  elbow: { segmentCount: 8, flexibilityFactor: 1 },
  tolerances: {
    planarityM: 1e-9,
    pointProjectionM: 1e-8,
    contactGapM: 1e-9,
    absoluteReactionN: 1e-6,
    relativeReaction: 1e-10,
    equilibriumForceN: 1e-4,
    equilibriumMomentNm: 1e-4,
  },
  numericalOptions: {
    pivotMultiplier: 100,
    minimumReciprocalCondition: 1e-12,
  },
});

const planar = executeFixture(false, 'ELBOW-PLANAR');
assert.equal(planar.coreResult.status, 'CALCULATED');
const planarCase = planar.coreResult.loadCases[0];
assert.equal(planarCase.status, 'CALCULATED');
assert.equal(planarCase.regions.length, 1);
const planarRegion = planarCase.regions[0];
assert.equal(planarRegion.memberCount, 10, 'two straight members plus eight elbow segments');
assert(planarRegion.formulaTrace.includes('EMP-BND-010'));
assert.equal(planarRegion.supportResults.length, 2);
assert(planarRegion.supportResults.every((row) => row.contactState === 'BILATERAL'));
assert(planarRegion.jointBalance.ok);
assert(Math.hypot(
  planarRegion.equilibrium.forceResidualN.x,
  planarRegion.equilibrium.forceResidualN.y,
) <= runtimeProfile.tolerances.equilibriumForceN);
assert(Math.abs(planarRegion.equilibrium.momentResidualNm)
  <= runtimeProfile.tolerances.equilibriumMomentNm);
assert(planarRegion.numericalEvidence.reciprocalConditionEstimate > 0);
assert(planarRegion.memberActions.some((row) => row.memberId.startsWith('ELBOW-1:E')));

const nonplanar = executeFixture(true, 'ELBOW-NONPLANAR');
assert.equal(nonplanar.coreResult.status, 'BLOCKED');
const nonplanarCase = nonplanar.coreResult.loadCases[0];
assert.equal(nonplanarCase.status, 'BLOCKED');
assert(nonplanarCase.blockers.some((row) => (
  row.code === 'OUTSIDE_QUALIFIED_SCOPE'
  && /not planar/i.test(row.message)
)));
assert.equal(nonplanarCase.supportResults.length, 0);

console.log('empirical-beam-contact-elbow-runtime-check: PASS');

function executeFixture(nonplanar, suffix) {
  const sharedModel = fixtureSharedModel(nonplanar, suffix);
  const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
  const supportAttachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
  const restraintCapabilityModel = buildRestraintCapabilityModel(supportAttachmentModel);
  const loadFoundation = buildModelLoadFoundation(sharedModel, topologyGraph);
  const scenario = createEmpiricalAnalysisScenario({
    scenarioId: `WP2-${suffix}`,
    name: `WP2 ${suffix}`,
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    state: 'AUTHORIZED',
    coordinateFrame,
    loadCases: [{
      loadCaseId: 'EXP-THERMAL-ON-HOT-SUPPORT-SET',
      label: 'Thermal on qualified support set',
      resultClass: 'VERTICAL_SCREENING_RESULT',
      effects: {
        weight: false,
        thermalStrain: true,
        pressureCompatibility: false,
        pressureStress: false,
      },
    }],
    restraintOverrides: [],
    profileRef: {
      profileId: runtimeProfile.profileId,
      profileVersion: runtimeProfile.profileVersion,
      qualification: runtimeProfile.qualification,
      locked: runtimeProfile.locked,
      semanticHash: runtimeProfile.semanticHash,
    },
    sourceBindings: {
      datasetHash: `sha256:${suffix.toLowerCase()}`,
      sharedModelHash: sharedModel.semanticHash,
      topologyHash: topologyGraph.semanticHash,
      attachmentHash: supportAttachmentModel.semanticHash,
      restraintHash: restraintCapabilityModel.semanticHash,
      profileHash: runtimeProfile.semanticHash,
    },
    combinationPolicy: 'SEPARATE_UNTIL_QUALIFIED',
  });
  const adaptedRequest = buildSjsonEmpiricalPipingRequest({
    dataset: {
      datasetId: `WP2-${suffix}`,
      sourceSha256: `sha256:${suffix.toLowerCase()}`,
    },
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    scenario,
  });
  assert.equal(adaptedRequest.status, 'READY_FOR_RUNTIME_BRIDGE');
  return calculateAuthorizedEmpiricalBeamContactExecution({
    schema: 'authorized-empirical-beam-contact-execution-request/v1',
    executionId: `EXEC-${suffix}`,
    executedAt: '2026-08-05T18:00:00.000Z',
    adaptedRequest,
    sharedModel,
    topologyGraph,
    supportAttachmentModel,
    restraintCapabilityModel,
    sourceLoadPrimitiveSet: loadFoundation.loadPrimitiveSet,
    runtimeProfile,
    caseConfigurations: [{
      loadCaseId: 'EXP-THERMAL-ON-HOT-SUPPORT-SET',
      weightPrimitiveCaseId: null,
      referenceTemperatureC: 20,
      analysisTemperatureC: 120,
    }],
  });
}

function fixtureSharedModel(nonplanar, suffix) {
  const datasetId = `WP2-${suffix}`;
  const endY = nonplanar ? 100 : 0;
  const evidence = (sourcePath, value, unit = '') => ({
    sourceKind: 'FIXTURE', sourcePath, value, unit,
  });
  const component = (componentKey, type, start, end, center = null) => ({
    componentKey,
    sourceEntityId: `entity:${componentKey}`,
    name: componentKey,
    type,
    identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS', zoneId: 'Z1' },
    geometry: {
      start,
      end,
      center,
      points: [],
      branchPoints: [],
      ports: [
        { portKey: `${componentKey}:START`, role: 'start', position: start },
        { portKey: `${componentKey}:END`, role: 'end', position: end },
      ],
    },
    engineeringProperties: {
      outerDiameterMm: evidence(`${componentKey}/od`, 100, 'mm'),
      wallThicknessMm: evidence(`${componentKey}/wall`, 5, 'mm'),
      materialDensityKgM3: evidence(`${componentKey}/density`, 7850, 'kg/m3'),
      insulationThicknessMm: evidence(`${componentKey}/insulation`, 0, 'mm'),
      fluidDensityOpeKgM3: evidence(`${componentKey}/ope-fluid`, 1000, 'kg/m3'),
      fluidDensityHydKgM3: evidence(`${componentKey}/hyd-fluid`, 1000, 'kg/m3'),
    },
    compatibilityEvidence: {},
    loadEvidence: {},
    sourceReferences: {},
    diagnostics: [],
  });
  const support = (supportKey, componentKey, position) => ({
    supportKey,
    sourceEntityId: `entity:${supportKey}`,
    name: supportKey,
    type: 'ANCHOR',
    identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS', zoneId: 'Z1' },
    position,
    engineeringProperties: {},
    compatibilityEvidence: {},
    supportEvidence: {
      supportTypes: [evidence(`${supportKey}/type`, 'ANCHOR')],
      attachedComponentReferences: [evidence(`${supportKey}/component`, componentKey)],
      verticalCapabilities: [evidence(`${supportKey}/vertical`, 'RESTRAINED')],
      lateralCapabilities: [evidence(`${supportKey}/lateral`, 'RESTRAINED')],
      longitudinalCapabilities: [evidence(`${supportKey}/longitudinal`, 'RESTRAINED')],
      rotationalCapabilities: [evidence(`${supportKey}/rotational`, 'RESTRAINED')],
    },
    sourceReferences: {},
    diagnostics: [],
  });
  const p0 = { x: 0, y: 0, z: 0 };
  const p1 = { x: 1000, y: 0, z: 0 };
  const p2 = { x: 2000, y: 0, z: 1000 };
  const p3 = { x: 3000, y: endY, z: 1000 };
  return createSharedPipingModel({
    project: { datasetId, name: datasetId, sourceName: 'normalized-elbow-fixture' },
    units: { length: 'mm', force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1',
      datasetId,
      sourceSchema: 'analysis-workspace-dataset/v1',
      sourceSemanticHash: 'fnv1a64:3333333333333333',
      sourceByteHash: `sha256:${suffix.toLowerCase()}`,
    },
    components: [
      component('PIPE-1', 'PIPE', p0, p1),
      component('ELBOW-1', 'ELBOW', p1, p2, { x: 1000, y: 0, z: 1000 }),
      component('PIPE-2', 'PIPE', p2, p3),
    ],
    supports: [
      support('ANCHOR-A', 'PIPE-1', p0),
      support('ANCHOR-B', 'PIPE-2', p3),
    ],
    sourceReferences: { nodes: [] },
    diagnostics: [],
  });
}
