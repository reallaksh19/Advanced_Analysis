import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  THERMAL_LIFTOFF_AUTHORITY,
  THERMAL_LIFTOFF_BLOCKER_CODES,
  createThermalLiftoffReactionToleranceAuthority,
  createThermalLiftoffSupportContactAuthority,
} from '../src/workspace/engineering-loads/empirical-thermal-liftoff-authority.js';
import {
  createThermalFreeExpansionEvidence,
  createThermalLiftoffUsedDisplacement,
  requireThermalLiftoffUsedDisplacement,
} from '../src/workspace/engineering-loads/empirical-thermal-liftoff-displacement-intake.js';
import {
  createThermalLiftoffApplicabilityBinding,
  createThermalLiftoffStiffnessEntry,
  createThermalLiftoffStiffnessRegistry,
} from '../src/workspace/engineering-loads/empirical-thermal-liftoff-stiffness-registry.js';
import {
  THERMAL_LIFTOFF_LOCAL_SCREEN_REQUEST_SCHEMA,
  assessEmpiricalThermalLiftoffScreenStaleness,
  calculateEmpiricalThermalLiftoffLocalScreen,
} from '../src/workspace/engineering-loads/empirical-thermal-liftoff-local-screen.js';
import {
  AUTHORIZED_EMPIRICAL_THERMAL_LIFTOFF_SCREEN_REQUEST_SCHEMA,
  calculateAuthorizedEmpiricalThermalLiftoffScreen,
  requireAuthorizedEmpiricalThermalLiftoffScreen,
} from '../src/workspace/engineering-loads/authorized-empirical-thermal-liftoff-screen.js';
import {
  THERMAL_LIFTOFF_FORMULA_REGISTER,
} from '../src/workspace/engineering-loads/empirical-thermal-liftoff-formula-register.js';

const BENCHMARK = Object.freeze({
  EMPTY: 108.54227332218605,
  OPE: 133.5056827068759,
  HYD: 139.74653505304835,
});
const SUPPORTS = ['S-0', 'S-1'];
const COORDINATE_FRAME_PAYLOAD = Object.freeze({
  basis: 'GLOBAL_Z_UP',
  verticalUnitVector: Object.freeze({ x: 0, y: 0, z: 1 }),
});
const COORDINATE_FRAME = Object.freeze({
  ...COORDINATE_FRAME_PAYLOAD,
  semanticHash: semanticHash(COORDINATE_FRAME_PAYLOAD),
});

function source(id) {
  return {
    sourceId: id,
    sourceRevision: '1',
    sourceSemanticHash: semanticHash({ source: id }),
  };
}

function applicability(siteId) {
  return createThermalLiftoffApplicabilityBinding({
    classId: 'TL-A',
    templateId: `LOCAL:${siteId}`,
    templateRevision: '1',
    geometrySemanticHash: semanticHash({ geometry: siteId }),
    supportCapabilitySemanticHash: semanticHash({ capability: siteId }),
    linePropertySemanticHash: semanticHash({ line: 'L-1' }),
    coordinateFrameSemanticHash: COORDINATE_FRAME.semanticHash,
  });
}

function stiffnessEntry(siteId, binding, stiffness = 1000, suffix = 'A') {
  return createThermalLiftoffStiffnessEntry({
    entryId: `K:${siteId}:${suffix}`,
    supportSiteId: siteId,
    representation: 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS',
    data: { kind: 'SCALAR', effectiveVerticalStiffnessNPerM: stiffness },
    units: 'N_PER_M',
    ordering: [siteId],
    sourceKind: 'BENCHMARKED_TEMPLATE',
    source: source(`STIFFNESS:${siteId}:${suffix}`),
    benchmarkReference: {
      benchmarkId: `BENCH:${siteId}`,
      benchmarkRevision: '1',
      benchmarkSemanticHash: semanticHash({ benchmark: siteId }),
    },
    applicability: binding,
    qualification: 'QUALIFIED',
  });
}

function contacts() {
  return SUPPORTS.map((siteId, index) => createThermalLiftoffSupportContactAuthority({
    supportSiteId: siteId,
    routeChainageMm: index * 1000,
    capability: 'UNILATERAL_REST',
    verticalContactDirection: 'GLOBAL_Z_PLUS',
    coldGapM: 0,
    gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
    tensileReactionPermitted: false,
    initialState: 'CONTACTING',
    source: source(`CONTACT:${siteId}`),
  }));
}

function displacement(loadCaseId, siteId, z = 0, overrides = {}) {
  return createThermalLiftoffUsedDisplacement({
    displacementId: `D:${loadCaseId}:${siteId}:${z}`,
    loadCaseId,
    supportSiteId: siteId,
    coordinateFrame: COORDINATE_FRAME,
    pipeDisplacementM: { x: 0, y: 0, z, ...(overrides.pipeDisplacementM || {}) },
    supportDisplacementM: { x: 0, y: 0, z: 0 },
    provenance: 'SOURCE_BACKED_SUPPORT_DISPLACEMENT',
    source: source(overrides.sourceId || `DISP:${loadCaseId}:${siteId}:${z}`),
    mappingEvidence: null,
    horizontalComponentAuthority: overrides.horizontalComponentAuthority ?? null,
  });
}

function coldDistribution(reactions = BENCHMARK, method = 'CHAINAGE_TRIBUTARY_SPAN_V2') {
  return {
    schema: method === 'CHAINAGE_TRIBUTARY_SPAN_V2'
      ? 'support-load-distribution/v3'
      : 'support-load-distribution/v4',
    method,
    status: 'CALCULATED',
    freshness: { status: 'CURRENT' },
    loadCases: Object.entries(reactions).map(([loadCaseId, reaction]) => ({
      loadCaseId,
      status: 'CALCULATED',
      supportResults: SUPPORTS.map((supportSiteId) => ({
        supportSiteId,
        status: 'CALCULATED',
        verticalForceN: reaction,
      })),
      contributionLedger: [],
      excludedInputs: [],
    })),
  };
}

function executionSummary(distribution) {
  return {
    loadCaseCount: distribution.loadCases.length,
    calculatedCaseCount: distribution.loadCases.filter((row) => row.status === 'CALCULATED').length,
    blockedCaseCount: distribution.loadCases.filter((row) => row.status === 'BLOCKED').length,
    contributionCount: distribution.loadCases.reduce((total, row) => total + row.contributionLedger.length, 0),
    excludedInputCount: distribution.loadCases.reduce((total, row) => total + row.excludedInputs.length, 0),
  };
}

function coldExecution(reactions = BENCHMARK) {
  const distribution = coldDistribution(reactions);
  const draft = {
    schema: 'authorized-empirical-load-execution/v1',
    executionId: 'COLD:V2:1',
    executedAt: '2026-08-08T04:00:00.000Z',
    projectId: 'P-1',
    datasetId: 'D-1',
    datasetVersion: 1,
    authorizedInputSemanticHash: semanticHash({ authority: 'input' }),
    overlaySemanticHash: semanticHash({ authority: 'overlay' }),
    baselineSemanticHash: semanticHash({ authority: 'baseline' }),
    handoffSemanticHash: semanticHash({ authority: 'handoff' }),
    projectionPayloadSemanticHash: semanticHash({ authority: 'projection' }),
    ephemeralProfileSemanticHash: semanticHash({ authority: 'profile' }),
    distributionSemanticHash: semanticHash(distribution),
    status: 'CALCULATED',
    summary: executionSummary(distribution),
    distribution,
  };
  return { ...draft, semanticHash: semanticHash(draft) };
}

function coldExecutionV2(method = 'CHAINAGE_TRIBUTARY_SPAN_V3_COG') {
  const distribution = coldDistribution(BENCHMARK, method);
  const draft = {
    schema: 'authorized-empirical-load-execution/v2',
    executionId: 'COLD:V2-METHOD-BOUND:1',
    executedAt: '2026-08-08T04:00:00.000Z',
    requestedMethod: method,
    executedMethod: method,
    projectId: 'P-1',
    datasetId: 'D-1',
    datasetVersion: 1,
    authorizedInputSemanticHash: semanticHash({ authority: 'input-v2' }),
    overlaySemanticHash: semanticHash({ authority: 'overlay-v2' }),
    baselineSemanticHash: semanticHash({ authority: 'baseline-v2' }),
    handoffSemanticHash: semanticHash({ authority: 'handoff-v2' }),
    projectionPayloadSemanticHash: semanticHash({ authority: 'projection-v2' }),
    ephemeralProfileSemanticHash: semanticHash({ authority: 'profile-v2' }),
    distributionSemanticHash: semanticHash(distribution),
    status: 'CALCULATED',
    summary: executionSummary(distribution),
    distribution,
  };
  return { ...draft, semanticHash: semanticHash(draft) };
}

function fixture({ displacements = null, entries = null, tolerance = true } = {}) {
  const bindings = Object.fromEntries(SUPPORTS.map((siteId) => [siteId, applicability(siteId)]));
  const registry = createThermalLiftoffStiffnessRegistry({
    registryId: 'K-REGISTRY:1',
    entries: entries || SUPPORTS.map((siteId) => stiffnessEntry(siteId, bindings[siteId])),
  });
  const used = displacements || Object.keys(BENCHMARK).flatMap((loadCaseId) => (
    SUPPORTS.map((siteId) => displacement(loadCaseId, siteId, 0))
  ));
  return {
    schema: THERMAL_LIFTOFF_LOCAL_SCREEN_REQUEST_SCHEMA,
    executionId: 'TL03:FIXTURE:1',
    executedAt: '2026-08-08T04:10:00.000Z',
    coldGravityExecution: coldExecution(),
    supportContactAuthorities: contacts(),
    displacements: used,
    stiffnessRegistry: registry,
    applicabilityBindings: SUPPORTS.map((supportSiteId) => ({
      supportSiteId,
      applicability: bindings[supportSiteId],
    })),
    reactionToleranceAuthority: tolerance
      ? createThermalLiftoffReactionToleranceAuthority({
        toleranceId: 'TL03-FIXTURE-TOLERANCE',
        reactionToleranceN: 0,
        source: source('FIXTURE-TOLERANCE'),
        qualification: 'QUALIFIED',
      })
      : null,
  };
}

function asAuthorizedRequest(request) {
  return {
    ...request,
    schema: AUTHORIZED_EMPIRICAL_THERMAL_LIFTOFF_SCREEN_REQUEST_SCHEMA,
  };
}

function rehashObject(value) {
  const { semanticHash: _old, ...payload } = value;
  return { ...payload, semanticHash: semanticHash(payload) };
}

test('TL-00 authority is frozen and explicitly shadow/non-production', () => {
  assert.equal(Object.isFrozen(THERMAL_LIFTOFF_AUTHORITY), true);
  assert.equal(THERMAL_LIFTOFF_AUTHORITY.runtimeStatus, 'SHADOW_NOT_REGISTERED');
  assert.equal(THERMAL_LIFTOFF_AUTHORITY.restrictions.registrationPermitted, false);
  assert.equal(THERMAL_LIFTOFF_AUTHORITY.restrictions.defaultUiExposurePermitted, false);
  assert.equal(THERMAL_LIFTOFF_AUTHORITY.restrictions.sealOrExportPermitted, false);
  assert.equal(THERMAL_LIFTOFF_AUTHORITY.restrictions.finalHotReactionClaimPermitted, false);
});

test('TL-01 alpha*DeltaT*L is retained as evidence only and has no TL-03 used-displacement field', () => {
  const evidence = createThermalFreeExpansionEvidence({
    evidenceId: 'FREE:1',
    referenceTemperatureC: 20,
    analysisTemperatureC: 120,
    thermalExpansionPerK: 12e-6,
    activeLengthM: 10,
    source: source('ALPHA-TEMPLATE'),
  });
  assert.equal(evidence.freeExpansionM, 0.012);
  assert.equal(evidence.tl03Eligibility, 'EVIDENCE_ONLY');
  assert.equal(Object.hasOwn(evidence, 'usedUpwardRelativeDisplacementM'), false);
  assert.throws(() => requireThermalLiftoffUsedDisplacement(evidence));
});

test('TL-02 rejects guessed/global stiffness and fails closed on conflicting qualified sources', () => {
  const binding = applicability('S-0');
  assert.throws(() => createThermalLiftoffStiffnessEntry({
    entryId: 'K:BAD',
    supportSiteId: 'DEFAULT',
    representation: 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS',
    data: { kind: 'SCALAR', effectiveVerticalStiffnessNPerM: 1000 },
    units: 'N_PER_M',
    ordering: ['DEFAULT'],
    sourceKind: 'TYPICAL',
    source: source('TYPICAL'),
    benchmarkReference: {
      benchmarkId: 'B', benchmarkRevision: '1', benchmarkSemanticHash: semanticHash({ b: 1 }),
    },
    applicability: binding,
    qualification: 'QUALIFIED',
  }), (error) => error.code === THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_GUESSED);

  const bindings = Object.fromEntries(SUPPORTS.map((siteId) => [siteId, applicability(siteId)]));
  const request = fixture({ entries: [
    stiffnessEntry('S-0', bindings['S-0'], 1000, 'A'),
    stiffnessEntry('S-0', bindings['S-0'], 1100, 'B'),
    stiffnessEntry('S-1', bindings['S-1'], 1000, 'A'),
  ] });
  const result = calculateEmpiricalThermalLiftoffLocalScreen(request);
  const row = result.caseScreens[0].supportScreens.find((candidate) => candidate.supportSiteId === 'S-0');
  assert.equal(row.classification, 'UNRESOLVED_GATE');
  assert(row.blockers.some((blocker) => blocker.code === THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_AUTHORITY_CONFLICT));
  assert.equal(row.localTrialContactReserveN, null);
});

test('TL-01 blocks non-zero horizontal movement without a qualified assessment', () => {
  const row = displacement('EMPTY', 'S-0', 0, { pipeDisplacementM: { x: 0.001 } });
  assert.equal(row.qualification, 'UNRESOLVED');
  assert.equal(row.usedUpwardRelativeDisplacementM, null);
  assert(row.blockers.some((blocker) => blocker.code === THERMAL_LIFTOFF_BLOCKER_CODES.HORIZONTAL_COMPONENT_UNQUALIFIED));
});

test('TL-03 zero-temperature fixture reproduces existing V2 benchmark values exactly', () => {
  const request = fixture();
  const before = semanticHash(request.coldGravityExecution);
  const result = calculateEmpiricalThermalLiftoffLocalScreen(request);
  assert.equal(result.screenStatus, 'SCREEN_COMPLETE');
  for (const caseScreen of result.caseScreens) {
    const expected = BENCHMARK[caseScreen.loadCaseId];
    for (const row of caseScreen.supportScreens) {
      assert.equal(row.classification, 'CONTACT_RETAINED_CANDIDATE');
      assert.equal(row.coldGravityReactionN, expected);
      assert.equal(row.localUpliftDemandN, 0);
      assert.equal(row.localTrialContactReserveN, expected);
    }
  }
  assert.equal(semanticHash(request.coldGravityExecution), before, 'cold execution mutated');
});

test('TL-03 accepts current method-bound V3_COG cold execution read-only', () => {
  const request = fixture();
  request.coldGravityExecution = coldExecutionV2();
  const before = semanticHash(request.coldGravityExecution);
  const result = calculateEmpiricalThermalLiftoffLocalScreen(request);
  assert.equal(result.coldGravityMethod, 'CHAINAGE_TRIBUTARY_SPAN_V3_COG');
  assert.equal(result.screenStatus, 'SCREEN_COMPLETE');
  assert.equal(semanticHash(request.coldGravityExecution), before);
});

test('TL-03 identifies a liftoff candidate but never clamps or publishes a final reaction', () => {
  const rows = Object.keys(BENCHMARK).flatMap((loadCaseId) => SUPPORTS.map((siteId) => (
    displacement(loadCaseId, siteId, loadCaseId === 'EMPTY' && siteId === 'S-0' ? 0.2 : 0)
  )));
  const result = calculateEmpiricalThermalLiftoffLocalScreen(fixture({ displacements: rows }));
  const row = result.caseScreens.find((item) => item.loadCaseId === 'EMPTY')
    .supportScreens.find((item) => item.supportSiteId === 'S-0');
  assert.equal(row.classification, 'LIFTOFF_CANDIDATE');
  assert.equal(row.localTrialContactReserveN, BENCHMARK.EMPTY - 200);
  assert(row.localTrialContactReserveN < 0);
  for (const forbidden of ['finalReaction', 'verticalForceN', 'redistributedReaction']) {
    assert.equal(Object.hasOwn(row, forbidden), false);
  }
});

test('TL-03 missing reaction tolerance fails closed instead of selecting a default', () => {
  const result = calculateEmpiricalThermalLiftoffLocalScreen(fixture({ tolerance: false }));
  assert.equal(result.screenStatus, 'SCREEN_HAS_UNRESOLVED');
  result.caseScreens.flatMap((row) => row.supportScreens).forEach((row) => {
    assert.equal(row.classification, 'UNRESOLVED_GATE');
    assert(row.blockers.some((blocker) => blocker.code === THERMAL_LIFTOFF_BLOCKER_CODES.REACTION_TOLERANCE_AUTHORITY_MISSING));
  });
});

test('authorized TL-03 receipt rejects classification forgery even after self-consistent rehashing', () => {
  const authorized = calculateAuthorizedEmpiricalThermalLiftoffScreen(asAuthorizedRequest(fixture()));
  const staleHashForgery = structuredClone(authorized);
  staleHashForgery.coreResult.caseScreens[0].supportScreens[0].classification = 'LIFTOFF_CANDIDATE';
  assert.throws(() => requireAuthorizedEmpiricalThermalLiftoffScreen(staleHashForgery));

  const forged = structuredClone(authorized);
  const support = forged.coreResult.caseScreens[0].supportScreens[0];
  support.classification = 'LIFTOFF_CANDIDATE';
  support.semanticHash = rehashObject(support).semanticHash;
  const caseScreen = forged.coreResult.caseScreens[0];
  caseScreen.summary.contactRetainedCandidateCount -= 1;
  caseScreen.summary.liftoffCandidateCount += 1;
  caseScreen.semanticHash = rehashObject(caseScreen).semanticHash;
  forged.coreResult.summary.contactRetainedCandidateCount -= 1;
  forged.coreResult.summary.liftoffCandidateCount += 1;
  forged.coreResult.semanticHash = rehashObject(forged.coreResult).semanticHash;
  forged.semanticHash = rehashObject(forged).semanticHash;
  assert.throws(
    () => requireAuthorizedEmpiricalThermalLiftoffScreen(forged),
    (error) => error.code === THERMAL_LIFTOFF_BLOCKER_CODES.CLASSIFICATION_MISMATCH,
  );
});

test('changing only displacement evidence marks an existing screen stale', () => {
  const request = fixture();
  const result = calculateEmpiricalThermalLiftoffLocalScreen(request);
  const changed = fixture({
    displacements: request.displacements.map((row, index) => (
      index === 0 ? displacement(row.loadCaseId, row.supportSiteId, 0, { sourceId: 'DISP:CHANGED' }) : row
    )),
  });
  const staleness = assessEmpiricalThermalLiftoffScreenStaleness(result, changed);
  assert.equal(staleness.stale, true);
  assert(staleness.changes.some((row) => row.field === 'displacementSetSemanticHash'));
});

test('formula register documents local-screen-only equations and remains shadow status', () => {
  assert.equal(THERMAL_LIFTOFF_FORMULA_REGISTER.runtimeStatus, 'SHADOW_NOT_REGISTERED');
  assert.deepEqual(
    THERMAL_LIFTOFF_FORMULA_REGISTER.terms.map((row) => row.termId),
    ['LOCAL_UPLIFT_DEMAND', 'LOCAL_TRIAL_CONTACT_RESERVE', 'LOCAL_SCREEN_CLASSIFICATION'],
  );
  assert(THERMAL_LIFTOFF_FORMULA_REGISTER.limitations.includes('NO_ACTIVE_SET_REDISTRIBUTION'));
});

test('static scope firewall: TL-03 exposes no solver/redistribution and has no registry/UI wiring', async () => {
  const modulePaths = [
    '../src/workspace/engineering-loads/empirical-thermal-liftoff-authority.js',
    '../src/workspace/engineering-loads/empirical-thermal-liftoff-displacement-intake.js',
    '../src/workspace/engineering-loads/empirical-thermal-liftoff-stiffness-registry.js',
    '../src/workspace/engineering-loads/empirical-thermal-liftoff-local-screen.js',
    '../src/workspace/engineering-loads/authorized-empirical-thermal-liftoff-screen.js',
  ];
  const sources = await Promise.all(modulePaths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const joined = sources.join('\n');
  for (const forbidden of [
    'solvePlanarRestContact',
    'solveActiveSet',
    'recomputeGravity',
    'releaseContact',
    'recontact(',
    'Math.max(0',
    'max(0,',
  ]) {
    assert.equal(joined.includes(forbidden), false, `forbidden TL-04 pattern present: ${forbidden}`);
  }

  const boundaryPaths = [
    '../src/workspace/engineering-loads/empirical-method-registry.js',
    '../src/workspace/load-calc-consumer-view.js',
    '../src/workspace/load-calc-consumer-controller.js',
  ];
  for (const path of boundaryPaths) {
    const sourceText = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.equal(sourceText.includes('THERMAL_LIFTOFF_ACTIVE_SET_V1'), false, `${path} wires the shadow method`);
    assert.equal(sourceText.includes('LIFTOFF_CANDIDATE'), false, `${path} consumes TL-03 output`);
  }
});
