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
  buildSjsonEmpiricalPipingRequest,
  requireSjsonEmpiricalPipingRequest,
} from '../src/workspace/engineering-loads/adapters/sjson-to-empirical-piping-request.js';
import {
  createEmpiricalAnalysisScenario,
  createEmpiricalCoordinateFrame,
  createEmpiricalRestraintOverride,
} from '../src/workspace/engineering-loads/contracts/empirical-sjson-contracts.js';

const evidence = (sourcePath, value) => ({ sourceKind: 'FIXTURE', sourcePath, value });
const sharedModel = createSharedPipingModel({
  project: {
    datasetId: 'WP1-FIXTURE',
    name: 'WP1 adapter fixture',
    sourceName: 'normalized-workspace-fixture',
  },
  units: { length: 'mm', force: 'N', mass: 'kg' },
  sourceSnapshotRef: {
    schema: 'source-package-snapshot/v1',
    datasetId: 'WP1-FIXTURE',
    sourceSchema: 'workspace-dataset/v1',
    sourceSemanticHash: 'fnv1a64:1111111111111111',
    sourceByteHash: 'sha256:fixture-source',
  },
  components: [{
    componentKey: 'PIPE-1',
    sourceEntityId: 'entity:pipe-1',
    type: 'PIPE',
    identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS', zoneId: 'Z1' },
    geometry: {
      ports: [
        { portKey: 'PIPE-1:FROM', role: 'FROM', position: { x: 0, y: 0, z: 0 } },
        { portKey: 'PIPE-1:TO', role: 'TO', position: { x: 1000, y: 0, z: 0 } },
      ],
    },
    sourceReferences: {},
  }],
  supports: [{
    supportKey: 'SUP-1',
    sourceEntityId: 'entity:support-1',
    type: 'ANCHOR',
    position: { x: 500, y: 0, z: 0 },
    identity: { lineId: 'L1', branchId: 'B1', systemId: 'SYS', zoneId: 'Z1' },
    sourceReferences: {},
    supportEvidence: {
      supportTypes: [evidence('supports/0/type', 'ANCHOR')],
      attachedComponentReferences: [evidence('supports/0/component', 'PIPE-1')],
      verticalCapabilities: [evidence('supports/0/vertical', 'RESTRAINED')],
      lateralCapabilities: [evidence('supports/0/lateral', 'RESTRAINED')],
      longitudinalCapabilities: [evidence('supports/0/longitudinal', 'RESTRAINED')],
    },
    diagnostics: [],
  }],
  sourceReferences: { nodes: [] },
  diagnostics: [],
});
const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
const supportAttachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
const restraintCapabilityModel = buildRestraintCapabilityModel(supportAttachmentModel);
const restraint = restraintCapabilityModel.restraints[0];
assert.equal(restraint.supportKey, 'SUP-1');
assert.equal(restraint.attachedComponentKey, 'PIPE-1');

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
const override = createEmpiricalRestraintOverride({
  overrideId: 'OVR-1',
  supportSiteId: restraint.supportKey,
  restraintId: restraint.restraintId,
  sourceType: 'ANCHOR',
  effectiveType: 'ANCHOR',
  sourceDirection: 'ANC',
  effectiveDirection: 'ANC',
  sourceAxis: [1, 0, 0],
  effectiveAxis: [1, 0, 0],
  sourceGapMm: null,
  effectiveGapMm: 0,
  sourceStiffnessNPerM: null,
  effectiveStiffnessNPerM: null,
  sourceFriction: null,
  effectiveFriction: 0,
  reason: 'Calculation-only identity-preserving fixture override.',
  geometryMutation: false,
});
const profileHash = 'fnv1a64:2222222222222222';
const scenario = createEmpiricalAnalysisScenario({
  scenarioId: 'SCENARIO-1',
  name: 'WP1 adapter contract fixture',
  method: 'EMPIRICAL_BEAM_CONTACT_V1',
  state: 'DRAFT',
  coordinateFrame,
  loadCases: [{
    loadCaseId: 'W-COLD',
    label: 'Cold weight',
    resultClass: 'VERTICAL_SCREENING_RESULT',
    effects: {
      weight: true,
      thermalStrain: false,
      pressureCompatibility: false,
      pressureStress: false,
    },
  }],
  restraintOverrides: [override],
  profileRef: {
    profileId: 'EMPIRICAL-BEAM-CONTACT-DEFAULT',
    profileVersion: 1,
    qualification: 'QUALIFIED',
    locked: true,
    semanticHash: profileHash,
  },
  sourceBindings: {
    datasetHash: 'sha256:fixture-source',
    sharedModelHash: sharedModel.semanticHash,
    topologyHash: topologyGraph.semanticHash,
    attachmentHash: supportAttachmentModel.semanticHash,
    restraintHash: restraintCapabilityModel.semanticHash,
    profileHash,
  },
  combinationPolicy: 'SEPARATE_UNTIL_QUALIFIED',
});
const request = buildSjsonEmpiricalPipingRequest({
  dataset: { datasetId: 'WP1-FIXTURE', sourceSha256: 'sha256:fixture-source' },
  sharedModel,
  topologyGraph,
  supportAttachmentModel,
  restraintCapabilityModel,
  scenario,
});

assert.equal(request.schema, 'empirical-piping-request/v1');
assert.equal(request.method, 'EMPIRICAL_BEAM_CONTACT_V1');
assert.equal(request.runtimeRegistration, 'NOT_REGISTERED');
assert.equal(request.status, 'READY_FOR_RUNTIME_BRIDGE');
assert.equal(request.restraintOccurrences.length, 1);
assert.deepEqual(request.restraintOccurrences[0].hostTangent, [1, 0, 0]);
assert.deepEqual(request.restraintOccurrences[0].anchorBasis.labels, ['LS', 'R', 'G']);
assert.equal(request.restraintOccurrences[0].geometryChanged, false);
assert.equal(
  request.adapterEvidence.sourceGeometryHash,
  request.adapterEvidence.effectiveGeometryHash,
);
assert(Object.isFrozen(request));
assert(Object.isFrozen(request.restraintOccurrences[0]));
assert.deepEqual(requireSjsonEmpiricalPipingRequest(request), request);

assert.throws(() => createEmpiricalRestraintOverride({
  ...override,
  schema: undefined,
  semanticHash: undefined,
  geometryMutation: true,
}), /geometryMutation=false/);

assert.throws(() => createEmpiricalAnalysisScenario({
  ...scenario,
  schema: undefined,
  semanticHash: undefined,
  loadCases: [{
    loadCaseId: 'OPE-HOT',
    label: 'Operating',
    resultClass: 'COMBINED_OPERATING_REACTION',
    effects: {
      weight: true,
      thermalStrain: true,
      pressureCompatibility: false,
      pressureStress: true,
    },
  }],
  combinationPolicy: 'SEPARATE_UNTIL_QUALIFIED',
}), /combined operating reaction/i);

const staleScenario = {
  ...scenario,
  sourceBindings: { ...scenario.sourceBindings, topologyHash: 'fnv1a64:deadbeefdeadbeef' },
};
assert.throws(() => buildSjsonEmpiricalPipingRequest({
  dataset: { datasetId: 'WP1-FIXTURE', sourceSha256: 'sha256:fixture-source' },
  sharedModel,
  topologyGraph,
  supportAttachmentModel,
  restraintCapabilityModel,
  scenario: staleScenario,
}), /semantic hash mismatch|binding is stale/);

const adapterSource = readFileSync(
  new URL('../src/workspace/engineering-loads/adapters/sjson-to-empirical-piping-request.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(adapterSource, /benchmarks\//);
assert.doesNotMatch(adapterSource, /JSON\.parse\s*\(/);
assert.match(adapterSource, /validateSharedPipingModel/);
assert.match(adapterSource, /validatePipingPortTopologyGraph/);
assert.match(adapterSource, /validateSupportAttachmentModel/);
assert.match(adapterSource, /validateRestraintCapabilityModel/);

console.log('empirical-sjson-adapter-contract-check: PASS');
