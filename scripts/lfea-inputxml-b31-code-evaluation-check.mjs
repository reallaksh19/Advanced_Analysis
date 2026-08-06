import assert from 'node:assert/strict';
import {
  COLD_TEMPERATURE,
  codeProfile,
  editionDataset,
  stressFactorSet,
} from './lfea-b4.0-code-engine-fixtures.mjs';
import { diagnoseInputXmlLinearModelHealthContext } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';
import { prepareInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-preparation.js';
import { preflightInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-stiffness-preflight.js';
import { createInputXmlLinearSolveRuntime } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-runtime.js';
import { solveInputXmlLinearPhysicalCases } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-case-execution.js';
import { recoverInputXmlLinearCaseResults } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-result-recovery.js';
import { deriveInputXmlLinearCase } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-derived-cases.js';
import {
  INPUTXML_LINEAR_B31_EVALUATION_REQUEST_SCHEMA,
  evaluateInputXmlLinearB31,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-b31-evaluation.js';
import { requireInputXmlLinearB31Evaluation } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-b31-evaluation-contract.js';
import { DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health-profile.js';

console.log('\n--- LFEA InputXML governed B31 code-evaluation check ---');

const UNITS = '<UNITS><LENGTH LABEL="MM" FACTOR="25.4"/><FORCE LABEL="N" FACTOR="4.4482216152605"/><MOMENT-INPUT LABEL="NM" FACTOR="0.1129848290276167"/><EMOD LABEL="MPA" FACTOR="0.006894757293168"/><PRESSURE LABEL="MPA" FACTOR="0.006894757293168"/><TEMP LABEL="C" FACTOR="0.5555555555555556"/><PDENS LABEL="KG/M3" FACTOR="27679.9047102"/><IDENS LABEL="KG/M3" FACTOR="27679.9047102"/><FDENS LABEL="KG/M3" FACTOR="27679.9047102"/></UNITS>';
const XML = `<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="MHPR9" NUMELT="1" NUMBEND="0" NUMRIGID="0" NUMREST="1">${UNITS}<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="106" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" FLUID_DENSITY="0" INSUL_THICK="0" INSUL_DENSITY="0" PRESSURE1="2" TEMP_EXP_C1="100"><RESTRAINT TYPE="0" NODE="10"/></PIPINGELEMENT></PIPINGMODEL></CAESARII>`;

function test(id, name, body) { body(); console.log(`${id} PASS ${name}`); }
function term(row, factor) { return { recoveredCaseId: row.recoveredCaseId, factor }; }
function byRole(rows, role) {
  const row = rows.find((candidate) => candidate.caseIdentity.caseRole === role);
  assert.ok(row, `missing recovered case ${role}`);
  return row;
}
function clone(value) { return structuredClone(value); }
function approval() {
  return {
    source: 'MH-PR9-QUALIFICATION-APPROVAL',
    revision: '01',
    approver: 'MH-PR9-FIXTURE-ENGINEER',
    reason: 'Exercise disclosed InputXML approximation custody in qualification.',
  };
}
function prohibited(value) {
  const keys = new Set(['factorizationHandle', 'factorizationCache', 'genericRuntime', 'runtime', 'solvePreparation', 'preflight', 'K', 'sparseK', 'triplets', 'matrix', 'localStiffness', 'globalStiffness', 'sparseFactor', 'scaleFactors']);
  const found = [];
  const walk = (entry, path) => {
    if (Array.isArray(entry)) entry.forEach((item, index) => walk(item, `${path}[${index}]`));
    else if (entry && typeof entry === 'object') Object.entries(entry).forEach(([key, item]) => {
      if (keys.has(key)) found.push(`${path}.${key}`);
      walk(item, `${path}.${key}`);
    });
  };
  walk(value, 'evaluation');
  return found;
}

const context = diagnoseInputXmlLinearModelHealthContext(XML, {});
const solve = prepareInputXmlLinearSolve(context, APPROXIMATE, {
  modelId: 'PR9', gravityDirection: { x: 0, y: 0, z: -1 },
});
const preflight = preflightInputXmlLinearSolve(solve);
const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
const executions = solveInputXmlLinearPhysicalCases(runtime);
const recovered = recoverInputXmlLinearCaseResults(runtime, executions);
const weight = byRole(recovered, 'WEIGHT_BASE');
const pressure = byRole(recovered, 'WEIGHT_PRESSURE');
const operating = byRole(recovered, 'WEIGHT_PRESSURE_TEMPERATURE');
const sustained = deriveInputXmlLinearCase(recovered, {
  name: 'SUS', purpose: 'SUSTAINED', kind: 'LINEAR', terms: [term(pressure, 1)],
});
const occasional = deriveInputXmlLinearCase(recovered, {
  name: 'OCC', purpose: 'OCCASIONAL', kind: 'LINEAR',
  terms: [term(operating, 1), term(weight, -0.25)],
});
const expansion = deriveInputXmlLinearCase(recovered, {
  name: 'EXP', purpose: 'EXPANSION_RANGE', kind: 'RANGE',
  terms: [term(operating, 1), term(pressure, -1)],
});
const reportingEnvelope = deriveInputXmlLinearCase(recovered, {
  name: 'ENV', purpose: 'OCCASIONAL', kind: 'ENVELOPE',
  candidates: [
    { candidateId: 'W', terms: [term(weight, 1)] },
    { candidateId: 'OPE', terms: [term(operating, 1)] },
  ],
});
const station = sustained.resultState.sourceStations.find(
  (row) => row.sourceStationKind === 'END_SIDE' && row.internalSectionLocalAction !== null,
);
assert.ok(station);
const materialId = solve.structuralPreparation.materialResolutions[0].materialState.materialId;
const profile = codeProfile();
const dataset = editionDataset({
  materialId,
  allowablePoints: [
    { absoluteTemperature: 250, allowableStress: { value: 110_000_000, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } },
    { absoluteTemperature: 293.15, allowableStress: { value: 100_000_000, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } },
    { absoluteTemperature: 373.15, allowableStress: { value: 90_000_000, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } },
    { absoluteTemperature: 500, allowableStress: { value: 80_000_000, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } },
  ],
});
const componentId = 'IXCOMP-001';
const factors = stressFactorSet({ factorSetId: 'SF-IXCOMP-001', componentId });

function check(checkId, category, derived, source, extra) {
  return {
    checkId,
    category,
    derivedCaseId: derived.derivedCaseId,
    sourceStationId: station.stationId,
    sourceElementId: station.elementId,
    sourceRecoveredCaseId: source.recoveredCaseId,
    componentId,
    stressFactorSet: factors,
    sustainedSectionResolution: null,
    coldTemperature: null,
    sustainedCheckId: null,
    occasionalCategoryId: null,
    approximationApproval: approval(),
    ...extra,
  };
}

const checks = [
  check('IX-B31-SUS', 'SUSTAINED', sustained, pressure, {}),
  check('IX-B31-OCC', 'OCCASIONAL', occasional, operating, {
    occasionalCategoryId: 'WIND_FIXTURE',
  }),
  check('IX-B31-EXP', 'DISPLACEMENT_STRESS_RANGE', expansion, operating, {
    coldTemperature: { value: COLD_TEMPERATURE, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
  }),
  check('IX-B31-EXP-ENV', 'EXPANSION_RANGE_ENVELOPE', expansion, operating, {
    coldTemperature: { value: COLD_TEMPERATURE, source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
    sustainedCheckId: 'IX-B31-SUS',
  }),
];
function request(overrides) {
  return {
    schema: INPUTXML_LINEAR_B31_EVALUATION_REQUEST_SCHEMA,
    evaluationId: 'IX-B31-EVAL-MHPR9',
    solvePreparation: solve,
    preflight,
    derivedCases: [sustained, occasional, expansion],
    codeProfile: profile,
    editionDataset: dataset,
    checks,
    ...overrides,
  };
}
const evaluation = evaluateInputXmlLinearB31(request({}));
const result = (id) => evaluation.results.find((row) => row.checkId === id);

test('MH-PR9-01', 'sustained stress binds a source station and governed pressure custody', () => {
  const row = result('IX-B31-SUS');
  assert.equal(row.sourceStationId, station.stationId);
  assert.ok(row.pressureCustodyIds.length > 0);
  assert.ok(row.codeResult.stressTerms.pressure > 0);
});

test('MH-PR9-02', 'pressure remains absent from structural recovery but enters code stress', () => {
  assert.deepEqual(pressure.displacements, weight.displacements);
  assert.equal(sustained.diagnostics.custody.pressureStructuralIsolation, true);
  assert.ok(result('IX-B31-SUS').pressureStressContribution.value > 0);
});

test('MH-PR9-03', 'occasional evaluation applies the declared duration category', () => {
  const row = result('IX-B31-OCC');
  assert.equal(row.codeResult.category, 'OCCASIONAL');
  assert.ok(Number.isFinite(row.codeResult.utilization));
});

test('MH-PR9-04', 'displacement range excludes pressure and retains signed range actions', () => {
  const row = result('IX-B31-EXP');
  assert.equal(row.pressureStressContribution, null);
  assert.equal(row.codeResult.stressTerms.pressure, 0);
  assert.equal(row.derivedCaseId, expansion.derivedCaseId);
});

test('MH-PR9-05', 'expansion envelope cites a governed sustained result', () => {
  const row = result('IX-B31-EXP-ENV');
  assert.equal(row.codeResult.category, 'EXPANSION_RANGE_ENVELOPE');
  assert.ok(row.codeResult.allowableStress >= 0);
});

test('MH-PR9-06', 'section, material, factor, station and recovery ancestry are hash-bound', () => {
  const row = result('IX-B31-SUS');
  assert.equal(row.sourceRecoverySemanticHash, pressure.semanticHash);
  assert.equal(row.authorityIdentity.stressFactorSetSemanticHash, factors.semanticHash);
  assert.ok(row.authorityIdentity.sectionResolutionSemanticHash.length > 0);
  assert.ok(row.stationCustodyHash.length > 0);
});

test('MH-PR9-07', 'reporting envelopes are refused as non-equilibrium code actions', () => {
  const bad = check('IX-B31-BAD-ENV', 'OCCASIONAL', reportingEnvelope, operating, {
    occasionalCategoryId: 'WIND_FIXTURE',
  });
  assert.throws(() => evaluateInputXmlLinearB31(request({
    derivedCases: [reportingEnvelope], checks: [bad],
  })), (error) => error.code === 'INPUTXML_B31_ENVELOPE_NOT_EQUILIBRIUM');
});

test('MH-PR9-08', 'approximate custody requires explicit approval and becomes conditional', () => {
  const unapproved = { ...checks[0], approximationApproval: null };
  assert.throws(() => evaluateInputXmlLinearB31(request({ checks: [unapproved] })),
    (error) => error.code === 'INPUTXML_B31_APPROXIMATION_APPROVAL_REQUIRED');
  assert.equal(evaluation.status, 'CONDITIONAL');
});

test('MH-PR9-09', 'tampered and stale evaluation chains fail closed', () => {
  const tampered = clone(evaluation);
  tampered.results[0].codeResult.calculatedStress += 1;
  assert.throws(() => requireInputXmlLinearB31Evaluation(tampered),
    (error) => error.code === 'INPUTXML_B31_HASH_MISMATCH'
      || error.code === 'CODE_ENGINE_RESULT_HASH_MISMATCH'
      || error.code === 'CODE_ENGINE_INVALID');
  assert.throws(() => requireInputXmlLinearB31Evaluation(evaluation, {
    solvePreparation: solve, preflight, derivedCases: [sustained],
  }), (error) => error.code === 'INPUTXML_B31_CONTEXT_STALE');
});

test('MH-PR9-10', 'check ordering is deterministic and dependency-resolved', () => {
  const replay = evaluateInputXmlLinearB31(request({
    derivedCases: [expansion, sustained, occasional], checks: [...checks].reverse(),
  }));
  assert.equal(replay.semanticHash, evaluation.semanticHash);
  assert.equal(replay.evidenceHash, evaluation.evidenceHash);
});

test('MH-PR9-11', 'sealed evaluation excludes runtimes, matrices and factorization state', () => {
  assert.deepEqual(prohibited(evaluation), []);
  assert.ok(Object.isFrozen(evaluation));
  assert.equal(requireInputXmlLinearB31Evaluation(evaluation).semanticHash, evaluation.semanticHash);
});

test('MH-PR9-12', 'missing stations, wrong source cases and caller action injection are rejected', () => {
  assert.throws(() => evaluateInputXmlLinearB31(request({
    checks: [{ ...checks[0], sourceStationId: 'MISSING' }],
  })), (error) => error.code === 'INPUTXML_B31_CODE_STATION_MISSING');
  assert.throws(() => evaluateInputXmlLinearB31(request({
    checks: [{ ...checks[0], sourceRecoveredCaseId: operating.recoveredCaseId }],
  })), (error) => error.code === 'INPUTXML_B31_SOURCE_RECOVERY_MISSING'
      || error.code === 'INPUTXML_B31_ELEMENT_AUTHORITY_MISMATCH');
  assert.throws(() => evaluateInputXmlLinearB31(request({
    checks: [{ ...checks[0], localAction: station.internalSectionLocalAction }],
  })), (error) => error.code === 'INPUTXML_B31_REQUEST_INVALID');
});

console.log('LFEA InputXML governed B31 code-evaluation check passed.');
