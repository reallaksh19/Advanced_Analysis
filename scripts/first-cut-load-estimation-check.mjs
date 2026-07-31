import assert from 'node:assert/strict';
import {
  FIRST_CUT_METHODS,
  FIRST_CUT_STATUSES,
  assessFirstCutStaleness,
  buildFirstCutMasterData,
  buildFirstCutProfile,
  compileFirstCutMassLedger,
  createEnrichedSharedModelProjection,
  resolveEvidenceBindings,
  recoverSpanSag,
  runFirstCutLoadEstimation,
  sealFirstCutAssumptionSet,
  validateFirstCutCalculationPackage,
  validateFirstCutMassLedger,
  validateFirstCutProfile,
} from '../src/core/first-cut-load-estimation/index.js';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildStraightFixture, runFixture } from './w10.5-screening-fixtures.mjs';

const fixture = buildStraightFixture({ lengthsM: [2], pipeMassKgM: 10, opeFluidKgM: 2, hydFluidKgM: 3 });
const profile = profileRecord(['EMPTY', 'OPE', 'HYD']);
const assumptions = sealFirstCutAssumptionSet({
  sourceSemanticHash: fixture.sharedModel.semanticHash,
  profileSemanticHash: profile.semanticHash,
  assumptions: [],
});
const massLedger = compileFirstCutMassLedger({
  sourceSemanticHash: fixture.sharedModel.semanticHash,
  enrichmentResultSemanticHash: semanticHash({ source: fixture.sharedModel.semanticHash, overrides: [] }),
  modelLoadFoundation: fixture.modelLoads,
});
const screening = runFixture(fixture).screening;
const parentHashes = {
  sourceSemanticHash: massLedger.sourceSemanticHash,
  enrichmentResultSemanticHash: massLedger.enrichmentResultSemanticHash,
  modelLoadPrimitiveSemanticHash: massLedger.loadPrimitiveSemanticHash,
  pathSemanticHash: fixture.pathFoundation.pathModel.semanticHash,
  assumptionSetSemanticHash: assumptions.semanticHash,
  profileSemanticHash: profile.semanticHash,
};

checkContracts();
checkEnrichment();
checkMassAndCog();
checkSimpleSpanPackage();
checkSag();
console.log('✅ [SIMULATED] First-cut contract, mass/COG, span, package, and sag checks passed.');

function checkContracts() {
  assert(validateFirstCutProfile(profile).ok, 'FC-T01 exact profile schema');
  assert.throws(() => buildFirstCutProfile({ ...profileInput(['EMPTY']), extra: true }), /exact keys/u, 'FC-T02');
  assert(Object.isFrozen(profile) && Object.isFrozen(profile.gravity), 'FC-T03 deep immutability');
  assert.equal(profileRecord(['OPE', 'EMPTY']).semanticHash, profileRecord(['EMPTY', 'OPE']).semanticHash, 'FC-T08');
  assert.notEqual(semanticHash({ source: 'é' }), semanticHash({ source: 'e' }), 'FC-T09 Unicode evidence');
  assert.throws(() => buildFirstCutProfile({ ...profileInput(['EMPTY']), timestamp: '2026-01-01' }), /exact keys/u, 'FC-T10');
}

function checkEnrichment() {
  const sourceBefore = fixture.sharedModel.semanticHash;
  const master = buildFirstCutMasterData({
    sourceId: '[SIMULATED] MASTER',
    revision: '1',
    records: [{
      recordId: 'MASTER-EI-1',
      selectorKind: 'ENTITY',
      selectorKey: 'COMP-1',
      fieldId: 'flexuralRigidityNm2',
      value: 2500000,
      unit: 'N*m2',
      sourceId: '[SIMULATED] MASTER',
      revision: '1',
    }],
  });
  const projection = createEnrichedSharedModelProjection({
    sourceModel: fixture.sharedModel,
    bindings: master.records.map((row) => ({ ...row, authorityLevel: 'AUTHORIZED_MASTER' })),
  });
  assert.equal(fixture.sharedModel.semanticHash, sourceBefore, 'FC-T03 source hash is immutable');
  assert.equal(fixture.sharedModel.components[0].engineeringProperties.flexuralRigidityNm2, undefined, 'MASS-B03 source object is unchanged');
  assert.equal(projection.enrichedModel.components[0].engineeringProperties.flexuralRigidityNm2.value, 2500000, 'FC-T05 sidecar projection');
  assert.notEqual(projection.enrichedModel.semanticHash, sourceBefore, 'FC-T06 enrichment identity');
  const sensitivity = createEnrichedSharedModelProjection({
    sourceModel: fixture.sharedModel,
    bindings: [{
      recordId: 'SENS-1',
      selectorKind: 'ENTITY',
      selectorKey: fixture.sharedModel.supports[0].supportKey,
      fieldId: 'supportAvailabilitySensitivity',
      value: 'USER-DECLARED SUPPORT-UNAVAILABLE SENSITIVITY',
      unit: '1',
      sourceId: '[SIMULATED] USER DECLARATION',
      revision: '1',
      authorityLevel: 'ACCEPTED_OVERRIDE',
    }],
  });
  assert.equal(fixture.sharedModel.supports.length, 2, 'SPAN sensitivity source supports unchanged');
  assert.equal(sensitivity.enrichedModel.supports.length, 1, 'SPAN sensitivity removes only the declared projected support');
  assert.throws(() => resolveEvidenceBindings({
    explicitSource: [],
    acceptedOverrides: [
      { ...master.records[0], recordId: 'OVERRIDE-1' },
      { ...master.records[0], recordId: 'OVERRIDE-2', value: 2600000 },
    ],
    authorizedMaster: [],
    approvedApproximations: [],
  }), /Ambiguous same-authority/u, 'FC-T07 same-authority conflict blocks');
}

function checkMassAndCog() {
  assert(validateFirstCutMassLedger(massLedger).ok, 'MASS contract');
  const empty = massLedger.cases.find((row) => row.loadCaseId === 'EMPTY');
  const ope = massLedger.cases.find((row) => row.loadCaseId === 'OPE');
  assertNear(empty.massKg, 20, 1e-12, 'MASS-01 pipe');
  assertNear(ope.massKg, 24, 1e-12, 'MASS-02 fluid');
  assert.deepEqual(empty.cogM, { x: 1, y: 0, z: 0 }, 'MASS-05 COG closure');
  assert.equal(massLedger.rows.some((row) => row.massKg === 0), true, 'MASS-06 explicit zero retained');
}

function checkSimpleSpanPackage() {
  const calculationPackage = runFirstCutLoadEstimation({
    profile,
    assumptionSet: assumptions,
    massLedger,
    pathSemanticHash: fixture.pathFoundation.pathModel.semanticHash,
    supportScreening: screening,
    beamModel: null,
    beamSolution: null,
    sustainedInput: null,
    currentParentHashes: parentHashes,
  });
  assert(validateFirstCutCalculationPackage(calculationPackage).ok, 'FC package contract');
  assert.equal(calculationPackage.status, FIRST_CUT_STATUSES.QUALIFIED);
  assert(calculationPackage.supportScreening.supportResults.every((row) => row.label === 'Screened vertical share'));
  assert.equal(calculationPackage.thermalReaction, null, 'UI-FC-08');
  const changed = { ...parentHashes, sourceSemanticHash: semanticHash({ changed: true }) };
  assert.equal(assessFirstCutStaleness(calculationPackage, changed).stale, true, 'FC-T04');
  const stale = runFirstCutLoadEstimation({
    profile, assumptionSet: assumptions, massLedger,
    pathSemanticHash: fixture.pathFoundation.pathModel.semanticHash,
    supportScreening: screening, beamModel: null, beamSolution: null,
    sustainedInput: null, currentParentHashes: changed,
  });
  assert.equal(stale.status, FIRST_CUT_STATUSES.STALE, 'UI-FC-09');
}

function checkSag() {
  const lengthM = 4, forcePerLengthNM = 1000, flexuralRigidityNm2 = 2e6;
  const rotation = forcePerLengthNM * lengthM ** 3 / (24 * flexuralRigidityNm2);
  const result = recoverSpanSag({
    startStationM: 0,
    lengthM,
    flexuralRigidityNm2,
    startDisplacementM: 0,
    startRotationRad: rotation,
    endDisplacementM: 0,
    endRotationRad: -rotation,
    uniformForcePerLengthNM: forcePerLengthNM,
    pointForces: [],
  });
  assertNear(result.maximumAbsoluteSagM, 5 * forcePerLengthNM * lengthM ** 4 / (384 * flexuralRigidityNm2), 1e-10, 'SAG-01');
}

function profileRecord(loadCaseIds) { return buildFirstCutProfile(profileInput(loadCaseIds)); }
function profileInput(loadCaseIds) {
  return {
    profileId: 'PROJECT-FIRST-CUT-[SIMULATED]',
    methodId: FIRST_CUT_METHODS.SIMPLE_SPAN,
    loadCaseIds,
    gravity: { accelerationMPerS2: 9.80665, direction: 'GRAVITY_DOWN', source: '[SIMULATED] project basis' },
    geometryTolerances: { absoluteM: 1e-9, relative: 1e-9 },
    equilibriumTolerances: { forceAbsoluteN: 1e-8, forceRelative: 1e-10, momentAbsoluteNm: 1e-8, momentRelative: 1e-10 },
    sagCriterion: null,
    requestedCapabilities: [],
    pressureFormulaId: null,
    source: '[SIMULATED] first-cut test profile',
  };
}
function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`);
}
