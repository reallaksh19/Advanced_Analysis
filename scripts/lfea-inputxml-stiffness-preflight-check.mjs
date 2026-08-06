import assert from 'node:assert/strict';
import { sealSolverProfile } from '../src/core/linear-fea-solver/index.js';
import { diagnoseInputXmlLinearModelHealthContext } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';
import { prepareInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-preparation.js';
import { preflightInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-stiffness-preflight.js';
import { requireInputXmlLinearStiffnessPreflight } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-stiffness-preflight-contract.js';
import { inputXmlStiffnessSolverProfile } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-stiffness-profile.js';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE as STRICT,
} from '../src/core/linear-piping-analysis-consumer/inputxml-model-health-profile.js';

console.log('\n--- LFEA InputXML stiffness and constraint preflight check ---');

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

const UNITS = [
  '<UNITS>',
  '<LENGTH LABEL="MM" FACTOR="25.4"/>',
  '<FORCE LABEL="N" FACTOR="4.4482216152605"/>',
  '<MOMENT-INPUT LABEL="NM" FACTOR="0.1129848290276167"/>',
  '<EMOD LABEL="MPA" FACTOR="0.006894757293168"/>',
  '<PRESSURE LABEL="MPA" FACTOR="0.006894757293168"/>',
  '<TEMP LABEL="C" FACTOR="0.5555555555555556"/>',
  '<PDENS LABEL="KG/M3" FACTOR="27679.9047102"/>',
  '<IDENS LABEL="KG/M3" FACTOR="27679.9047102"/>',
  '<FDENS LABEL="KG/M3" FACTOR="27679.9047102"/>',
  '</UNITS>',
].join('');

function model(elements, counts = {}) {
  return [
    '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input">',
    `<PIPINGMODEL xmlns="" JOBNAME="MHPF" NUMELT="${counts.elements ?? elements.length}" NUMBEND="${counts.bends ?? 0}" NUMRIGID="${counts.rigids ?? 0}" NUMREST="${counts.restraints ?? 0}">`,
    UNITS,
    ...elements,
    '</PIPINGMODEL></CAESARII>',
  ].join('');
}

function element(from, to, dx, inner = '', fields = '') {
  return `<PIPINGELEMENT FROM_NODE="${from}" TO_NODE="${to}" DELTA_X="${dx}" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="106" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" FLUID_DENSITY="0" INSUL_THICK="0" INSUL_DENSITY="0" ${fields}>${inner}</PIPINGELEMENT>`;
}

function prepare(xml, profile = STRICT, modelId = 'PREFLIGHT') {
  const context = diagnoseInputXmlLinearModelHealthContext(xml, {});
  return { context, solve: prepareInputXmlLinearSolve(context, profile, { modelId }) };
}

const anchor = '<RESTRAINT TYPE="0" NODE="10"/>';

test('MH-PR5-01', 'a grounded cantilever qualifies without retaining runtime factors', () => {
  const { solve } = prepare(model([element(10, 20, 1000, anchor)], { restraints: 1 }), STRICT, 'PF1');
  const report = preflightInputXmlLinearSolve(solve);
  assert.equal(report.status, 'PASS');
  assert.equal(report.executionAvailability.stiffnessPreflight, 'QUALIFIED');
  assert.equal(report.executionAvailability.factorizationHandle, 'NOT_RETAINED');
  assert.equal(report.genericPreflight.factorization.status, 'PASS');
  assert.ok(Number.isFinite(report.genericPreflight.factorization.conditionEstimate));
  assert.equal(report.genericPreflight.assembly.freeDofCount, 6);
  assert.equal(JSON.stringify(report).includes('sparseFactor'), false);
  assert.equal(JSON.stringify(report).includes('"L"'), false);
});

test('MH-PR5-02', 'an unrestrained connected component blocks as a floating mechanism', () => {
  const { solve } = prepare(model([element(10, 20, 1000)]), STRICT, 'PF2');
  const report = preflightInputXmlLinearSolve(solve);
  assert.equal(report.status, 'BLOCK');
  assert.equal(report.genericPreflight.factorization.errorCode, 'SOLVER_MECHANISM_FLOATING_COMPONENT');
  assert.equal(report.genericPreflight.components[0].floating, true);
  assert.equal(report.executionAvailability.solveExecution, 'NOT_AUTHORIZED');
});

test('MH-PR5-03', 'a partially restrained component is blocked by numerical rank evidence', () => {
  const guide = '<RESTRAINT TYPE="2" NODE="10" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/>';
  const { solve } = prepare(model([element(10, 20, 1000, guide)], { restraints: 1 }), STRICT, 'PF3');
  const report = preflightInputXmlLinearSolve(solve);
  assert.equal(report.status, 'BLOCK');
  assert.ok(['SOLVER_NEAR_ZERO_PIVOT', 'SOLVER_SYSTEM_INDEFINITE'].includes(report.genericPreflight.factorization.errorCode));
  assert.equal(report.genericPreflight.components[0].floating, false);
});

test('MH-PR5-04', 'an empty free partition is blocked rather than treated as a solved state', () => {
  const anchors = '<RESTRAINT TYPE="0" NODE="10"/><RESTRAINT TYPE="0" NODE="20"/>';
  const { solve } = prepare(model([element(10, 20, 1000, anchors)], { restraints: 2 }), STRICT, 'PF4');
  const report = preflightInputXmlLinearSolve(solve);
  assert.equal(report.status, 'BLOCK');
  assert.equal(report.genericPreflight.factorization.errorCode, 'SOLVER_FREE_PARTITION_EMPTY');
  assert.equal(report.genericPreflight.assembly.freeDofCount, 0);
});

test('MH-PR5-05', 'declared conditioning thresholds produce a conditional preflight', () => {
  const { solve } = prepare(model([element(10, 20, 1000, anchor)], { restraints: 1 }), STRICT, 'PF5');
  const canonical = inputXmlStiffnessSolverProfile();
  const solverProfile = sealSolverProfile({
    ...canonical,
    conditionWarning: { value: 1, source: 'MH-PR5-CONDITION-GATE' },
    conditionBlock: { value: 1e100, source: 'MH-PR5-CONDITION-GATE' },
    semanticHash: '',
  });
  const report = preflightInputXmlLinearSolve(solve, { solverProfile });
  assert.equal(report.status, 'WARN');
  assert.equal(report.executionAvailability.stiffnessPreflight, 'CONDITIONAL');
  assert.ok(report.genericPreflight.findings.some((row) => row.code === 'LINEAR_STIFFNESS_CONDITION_WARNING'));
});

test('MH-PR5-06', 'load changes preserve the independent stiffness-assessment identity', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, anchor)], { restraints: 1 }),
    {},
  );
  const downward = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'PF6' });
  const axial = prepareInputXmlLinearSolve(context, STRICT, {
    structuralPreparation: downward.structuralPreparation,
    gravityDirection: { x: 0, y: 0, z: -1 },
  });
  const first = preflightInputXmlLinearSolve(downward);
  const second = preflightInputXmlLinearSolve(axial);
  assert.notEqual(first.semanticHash, second.semanticHash);
  assert.equal(first.stiffnessAssessmentHash, second.stiffnessAssessmentHash);
  assert.equal(first.stiffnessStateHash, second.stiffnessStateHash);
});

test('MH-PR5-07', 'preflight is deterministic, tamper-evident and stale-preparation rejected', () => {
  const { solve } = prepare(model([element(10, 20, 1000, anchor)], { restraints: 1 }), STRICT, 'PF7');
  const first = preflightInputXmlLinearSolve(solve);
  const second = preflightInputXmlLinearSolve(solve);
  assert.equal(first.semanticHash, second.semanticHash);
  assert.equal(first.evidenceHash, second.evidenceHash);
  requireInputXmlLinearStiffnessPreflight(first, solve);
  assert.throws(() => requireInputXmlLinearStiffnessPreflight({
    ...first,
    summary: { ...first.summary, nodeCount: 99 },
  }));
  const other = prepare(model([element(10, 20, 900, anchor)], { restraints: 1 }), STRICT, 'PF7B').solve;
  assert.throws(() => requireInputXmlLinearStiffnessPreflight(first, other));
});

test('MH-PR5-08', 'a disclosed bend approximation remains numerically preflightable', () => {
  const bend = '<BEND RADIUS="150"/>';
  const { solve } = prepare(
    model([element(10, 20, 1000, `${anchor}${bend}`)], { restraints: 1, bends: 1 }),
    APPROXIMATE,
    'PF8',
  );
  const report = preflightInputXmlLinearSolve(solve);
  assert.equal(report.status, 'PASS');
  assert.equal(report.analysisProfileId, APPROXIMATE);
  assert.equal(report.elementLedger.length, 1);
});

console.log('LFEA InputXML stiffness and constraint preflight check PASS.');
