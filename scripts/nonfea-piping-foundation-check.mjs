import assert from 'node:assert/strict';
import {
  RESOLUTION_KINDS,
  createConfiguredResolutionSession,
} from '../src/core/empirical-piping-mechanics/configured-resolution.js';
import { calculateSimpleSpanSustained } from '../src/core/empirical-piping-mechanics/sustained-simple-span.js';
import {
  calculateVerticalRetention,
  redistributeReleasedReaction,
} from '../src/core/empirical-piping-mechanics/vertical-retention.js';
import { resolvePosSectionMaterialStates } from '../src/calc-workspace/cii-standalone-port/core/pos-section-material-resolution.js';
import {
  createEmptyProjectDataProfile,
  replaceProjectDataValue,
  validateProjectDataProfile,
} from '../src/workspace/project-data/project-data-contract.js';
import {
  createConfiguredResolutionSessionFromProjectData,
  resolveProjectDataConfiguredDefaultsAuthority,
} from '../src/workspace/project-data/project-data-configured-resolution.js';

const resolution = createConfiguredResolutionSession({
  projectDataRevision: 1,
  projectDataSemanticHash: 'fixture-hash',
  defaults: [{
    id: 'DEFAULT-REST-GAP', enabled: true, field: 'support.gapMm', value: 0, unit: 'mm',
    scope: { supportClass: 'REST' }, reason: 'Fixture default.', qualification: 'TEST_ONLY',
  }],
});
assert.equal(resolution.resolve({
  field: 'support.gapMm', entity: { entityId: 'SUP-1', scope: { supportClass: 'REST' } },
  candidates: [], validate: (value) => value >= 0,
}).value, 0);
assert.equal(resolution.receipt().summary.configuredDefaultApplicationCount, 1);
assert.throws(() => createConfiguredResolutionSession({ defaults: [{
  id: 'BAD-SCHEDULE', enabled: true, field: 'section.schedule', value: '80', scope: {},
  reason: 'Forbidden global schedule.', qualification: 'TEST_ONLY',
}] }), /exact scope fields/);

let projectData = JSON.parse(JSON.stringify(createEmptyProjectDataProfile()));
projectData.projectId = 'FIXTURE';
projectData = replaceProjectDataValue(
  projectData,
  'engineeringCalculationDefaults.resolutionPolicy',
  [
    'SOURCE_EXPLICIT',
    'SOURCE_INHERITED',
    'CONFIGURED_DERIVATION',
    'PROJECT_CONFIGURED_DEFAULT',
    'BLOCK',
  ],
  { source: 'Fixture calculation basis', locator: 'resolutionPolicy' },
  true,
);
projectData = replaceProjectDataValue(
  projectData,
  'engineeringCalculationDefaults.dimensionVerificationTolerancesMm',
  { outsideDiameterMm: 0.1, wallThicknessMm: 0.05 },
  { source: 'Fixture calculation basis', locator: 'dimensionVerificationTolerancesMm' },
  true,
);
projectData = replaceProjectDataValue(
  projectData,
  'engineeringCalculationDefaults.configuredDefaults',
  [{
    id: 'DEFAULT-FIXTURE-REST-GAP',
    enabled: true,
    field: 'support.gapMm',
    value: 0,
    unit: 'mm',
    scope: { projectId: 'FIXTURE', supportClass: 'REST' },
    reason: 'Approved fixture zero-gap rule.',
    qualification: 'TEST_ONLY',
  }],
  { source: 'Fixture calculation basis', locator: 'configuredDefaults' },
  true,
);
const projectDataAudit = validateProjectDataProfile(projectData, 'nonFeaPipingDefaults', null);
assert.equal(projectDataAudit.valid, true, JSON.stringify(projectDataAudit.errors));
const projectAuthority = resolveProjectDataConfiguredDefaultsAuthority(projectData);
assert.equal(projectAuthority.status, 'READY');
assert.equal(projectAuthority.summary.enabledConfiguredDefaultCount, 1);
const projectResolution = createConfiguredResolutionSessionFromProjectData(projectData);
assert.equal(projectResolution.status, 'READY');
const projectResolvedGap = projectResolution.session.resolve({
  field: 'support.gapMm',
  entity: {
    entityId: 'SUP-FIXTURE',
    scope: { projectId: 'FIXTURE', supportClass: 'REST' },
  },
  candidates: [],
  validate: (value) => value >= 0,
  affectedCalculations: ['VERTICAL_CONTACT'],
});
assert.equal(projectResolvedGap.kind, RESOLUTION_KINDS.PROJECT_CONFIGURED_DEFAULT);
assert.equal(
  projectResolvedGap.projectDataPath,
  'engineeringCalculationDefaults.configuredDefaults',
);
const projectReceipt = projectResolution.session.receipt();
assert.equal(projectReceipt.configuredDefaultUsages.length, 1);
assert.equal(
  projectReceipt.configuredDefaultUsages[0].projectDataPath,
  'engineeringCalculationDefaults.configuredDefaults',
);
assert.equal(
  projectReceipt.projectDataAuthoritySemanticIdentity,
  projectAuthority.semanticIdentity,
);

const unapprovedProjectData = replaceProjectDataValue(
  projectData,
  'engineeringCalculationDefaults.configuredDefaults',
  projectData.engineeringCalculationDefaults.configuredDefaults.value,
  projectData.engineeringCalculationDefaults.configuredDefaults.evidence,
  false,
);
assert.equal(
  createConfiguredResolutionSessionFromProjectData(unapprovedProjectData).status,
  'BLOCKED_INVALID_PROJECT_DATA',
);

const posReceipt = resolvePosSectionMaterialStates({
  projectId: '1885S',
  projectDataRevision: 1,
  projectDataSemanticHash: 'fixture-hash',
  configuredDefaults: [],
  sourceRoot: {
    type: 'BRANCH', name: 'BRANCH-1',
    enrichedAttributes: { sourcePath: '0', sourceBranchPath: 'BRANCH-1' },
    children: [{
      type: 'PIPE', name: 'POS-001',
      attributes: {
        SCHEDULE: '80', HBOR: 150, MATERIAL_FAMILY: 'CARBON_STEEL', LINE_ID: 'S8811951',
        PIPING_CLASS: '91261M7', FROM_NODE: '100', TO_NODE: '110',
      },
      enrichedAttributes: {
        sourcePath: '0/0', sourceBranchPath: 'BRANCH-1', sourceGlobalIndex: 1,
        posId: 'POS-001', entityId: 'ENTITY-001', elasticModulusPa: 203.4e9,
        poissonsRatio: 0.3, materialDensityKgM3: 7850, thermalExpansionPerC: 1.28e-5,
        corrosionAllowanceMm: 0, codeStressWallRule: 'NOMINAL_MINUS_CORROSION',
      },
    }],
  },
});
assert.equal(posReceipt.status, 'CALCULATED_SOURCE_ONLY');
assert.equal(posReceipt.rows.length, 1);
const pos = posReceipt.rows[0];
assert.equal(pos.status, 'RESOLVED');
close(pos.outsideDiameterMm, 168.275, 1e-6);
close(pos.wallThicknessMm, 10.9728, 1e-6);
close(pos.metalMassPerLengthKgM, 42.566877, 1e-5);

const span = calculateSimpleSpanSustained({
  spanId: 'HC-A', lengthM: 6,
  distributedLoads: [{ loadId: 'PIPE', forcePerLengthNM: 537.524128, startM: 0, endM: 6 }],
  pointLoads: [{ loadId: 'VALVE', forceN: 1470.9975, positionM: 2 }],
});
close(span.reactions.supportA, 2593.237383, 1e-5);
close(span.reactions.supportB, 2102.904885, 1e-5);
close(span.governingMoment.momentNm, 4113.498092, 1e-3);
close(span.equilibrium.forceResidualN, 0, 1e-9);
close(span.equilibrium.momentResidualAboutANm, 0, 1e-9);

const retention = calculateVerticalRetention({
  supportId: 'PS-12169', sustainedReactionN: 1859,
  firstOrderPipeMovementMm: 0.420, supportMovementMm: 0, coldGapMm: 0, deadbandMm: 0.050,
  model: 'HALF_LOAD_DISPLACEMENT', halfLoadDisplacementMm: 0.500,
  retainedFractionAtHalfLoadPoint: 0.500, curveExponent: 1,
  pDelta: {
    enabled: true, method: 'ONE_PASS_EULER_AMPLIFICATION', compressionForceN: 50000,
    elasticModulusPa: 203.4e9, secondMomentM4: 1.685349041e-5,
    effectiveLengthFactor: 1, effectiveLengthM: 6, maximumCompressionRatio: 0.2,
  },
});
close(retention.pDelta.amplificationFactor, 1.056192, 1e-5);
close(retention.retainedFraction, 0.606399, 1e-5);
const redistribution = redistributeReleasedReaction({
  sourceSupportId: 'PS-12169', releasedReactionN: retention.releasedReactionN, sourcePositionM: 5,
  leftSupport: { supportId: 'PS-L', positionM: 0 }, rightSupport: { supportId: 'PS-R', positionM: 10 },
});
close(redistribution.equilibrium.forceResidualN, 0, 1e-9);
close(redistribution.equilibrium.momentResidualAboutLeftNm, 0, 1e-9);

console.log('NONFEA_PIPING_FOUNDATION_CHECK_OK');

function close(actual, expected, tolerance) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `Expected ${expected} ± ${tolerance}; received ${actual}.`);
}
