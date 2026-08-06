import assert from 'node:assert/strict';
import { sealSolverProfile } from '../src/core/linear-fea-solver/index.js';
import { diagnoseInputXmlLinearModelHealthContext } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';
import { prepareInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-preparation.js';
import { preflightInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-stiffness-preflight.js';
import { inputXmlStiffnessSolverProfile } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-stiffness-profile.js';
import {
  createInputXmlLinearSolveRuntime,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-runtime.js';
import {
  solveInputXmlLinearPhysicalCase,
  solveInputXmlLinearPhysicalCases,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-case-execution.js';
import {
  requireInputXmlLinearCaseExecution,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-case-execution-contract.js';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE as STRICT,
} from '../src/core/linear-piping-analysis-consumer/inputxml-model-health-profile.js';

console.log('\n--- LFEA InputXML runtime factorization and case execution check ---');

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
    `<PIPINGMODEL xmlns="" JOBNAME="MHRT" NUMELT="${counts.elements ?? elements.length}" NUMBEND="${counts.bends ?? 0}" NUMRIGID="${counts.rigids ?? 0}" NUMREST="${counts.restraints ?? 0}">`,
    UNITS,
    ...elements,
    '</PIPINGMODEL></CAESARII>',
  ].join('');
}

function element(from, to, dx, inner = '', fields = '') {
  return `<PIPINGELEMENT FROM_NODE="${from}" TO_NODE="${to}" DELTA_X="${dx}" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="106" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" FLUID_DENSITY="0" INSUL_THICK="0" INSUL_DENSITY="0" ${fields}>${inner}</PIPINGELEMENT>`;
}

const anchor = '<RESTRAINT TYPE="0" NODE="10"/>';

function prepare(xml, profile = STRICT, modelId = 'RUNTIME') {
  const context = diagnoseInputXmlLinearModelHealthContext(xml, {});
  const solve = prepareInputXmlLinearSolve(context, profile, { modelId });
  const preflight = preflightInputXmlLinearSolve(solve);
  return { context, solve, preflight };
}

function caseByRole(solve, role) {
  const row = solve.physicalCases.find((candidate) => candidate.caseRole === role);
  assert.ok(row, `missing physical case ${role}`);
  return row;
}

function displacement(execution, nodeSuffix, dof) {
  return execution.execution.displacement.find(
    (row) => row.nodeId.endsWith(nodeSuffix) && row.dof === dof,
  )?.value ?? 0;
}

test('MH-PR6-01', 'qualified preflight creates a nonserializable factorization runtime without solving', () => {
  const { solve, preflight } = prepare(
    model([element(10, 20, 1000, anchor)], { restraints: 1 }),
    STRICT,
    'RT1',
  );
  const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
  assert.equal(runtime.executionAvailability.factorizationHandle, 'CREATED_RUNTIME_ONLY');
  assert.equal(runtime.executionAvailability.solveExecution, 'AUTHORIZED');
  assert.equal(runtime.authorizedCaseIds.length, 1);
  assert.equal(runtime.factorization.kind, preflight.genericPreflight.factorization.kind);
  assert.equal(Object.hasOwn(runtime, 'genericRuntime'), true);
  assert.equal(Object.keys(runtime).includes('genericRuntime'), false);
  assert.equal(Object.hasOwn(runtime.genericRuntime, 'factorizationHandle'), true);
  assert.equal(Object.hasOwn(runtime.genericRuntime, 'factorizationCache'), true);
  assert.equal(Object.keys(runtime.genericRuntime).includes('factorizationHandle'), false);
  assert.equal(Object.keys(runtime.genericRuntime).includes('factorizationCache'), false);
  const serializedRuntime = JSON.parse(JSON.stringify(runtime));
  assert.equal(Object.hasOwn(serializedRuntime, 'genericRuntime'), false);
  assert.equal(Object.hasOwn(serializedRuntime, 'factorizationHandle'), false);
  assert.equal(Object.hasOwn(serializedRuntime, 'factorizationCache'), false);
});

test('MH-PR6-02', 'authorized weight case executes through the retained runtime factorization', () => {
  const { solve, preflight } = prepare(
    model([element(10, 20, 1000, anchor)], { restraints: 1 }),
    STRICT,
    'RT2',
  );
  const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
  const result = solveInputXmlLinearPhysicalCase(runtime, solve.physicalCases[0].caseId);
  assert.equal(result.status, 'QUALIFIED');
  assert.equal(result.summary.factorizationReused, true);
  assert.equal(result.execution.factorization.reused, true);
  assert.equal(Object.hasOwn(result.execution, 'factorizationHandle'), false);
  assert.equal(result.execution.diagnostics.residual.status, 'PASS');
  assert.notEqual(displacement(result, '.N20', 'UY'), 0);
  requireInputXmlLinearCaseExecution(result, runtime);
});

test('MH-PR6-03', 'canonical pressure and operating cases reuse one factorization with distinct load identities', () => {
  const xml = model([
    element(10, 20, 1000, anchor, 'PRESSURE1="2" TEMP_EXP_C1="100"'),
  ], { restraints: 1 });
  const { solve, preflight } = prepare(xml, APPROXIMATE, 'RT3');
  const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
  const results = solveInputXmlLinearPhysicalCases(runtime);
  assert.equal(results.length, 3);
  assert.equal(results.every((row) => row.summary.factorizationReused), true);
  assert.equal(new Set(results.map((row) => row.execution.factorization.cacheKey)).size, 1);
  assert.equal(new Set(results.map((row) => row.physicalLoadCaseHash)).size, 3);
  assert.equal(new Set(results.map((row) => row.stiffnessRuntimeHash)).size, 1);
});

test('MH-PR6-04', 'resolved operating temperature executes with bound thermal strain', () => {
  const xml = model([
    element(10, 20, 1000, anchor, 'TEMP_EXP_C1="100"'),
  ], { restraints: 1 });
  const { solve, preflight } = prepare(xml, STRICT, 'RT4');
  const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
  const operating = caseByRole(solve, 'WEIGHT_TEMPERATURE');
  const result = solveInputXmlLinearPhysicalCase(runtime, operating.caseId);
  assert.equal(result.summary.temperaturePrimitiveCount, 1);
  assert.ok(displacement(result, '.N20', 'UX') > 0);
  assert.equal(result.elementLedger[0].temperaturePrimitiveId !== null, true);
});

test('MH-PR6-05', 'approximate pressure remains code-only while the structural case executes', () => {
  const xml = model([
    element(10, 20, 1000, anchor, 'PRESSURE1="2"'),
  ], { restraints: 1 });
  const { solve, preflight } = prepare(xml, APPROXIMATE, 'RT5');
  const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
  const pressure = caseByRole(solve, 'WEIGHT_PRESSURE');
  const result = solveInputXmlLinearPhysicalCase(runtime, pressure.caseId);
  assert.equal(result.summary.pressurePrimitiveCount, 1);
  assert.equal(result.elementLedger[0].codeOnlyPrimitiveIds.length, 1);
  assert.ok(result.limitations.includes('GENERIC_APPROX_PRESSURE_CODE_ONLY'));
  assert.equal(result.status, 'QUALIFIED');
});

test('MH-PR6-06', 'blocked preflight rejects runtime and conditional preflight requires explicit authorization', () => {
  const floating = prepare(model([element(10, 20, 1000)]), STRICT, 'RT6F');
  assert.equal(floating.preflight.status, 'BLOCK');
  assert.throws(() => createInputXmlLinearSolveRuntime(floating.solve, floating.preflight));

  const grounded = prepare(
    model([element(10, 20, 1000, anchor)], { restraints: 1 }),
    STRICT,
    'RT6W',
  );
  const canonical = inputXmlStiffnessSolverProfile();
  const solverProfile = sealSolverProfile({
    ...canonical,
    conditionWarning: { value: 1, source: 'MH-PR6-CONDITION-GATE' },
    conditionBlock: { value: 1e100, source: 'MH-PR6-CONDITION-GATE' },
    semanticHash: '',
  });
  const warning = preflightInputXmlLinearSolve(grounded.solve, { solverProfile });
  assert.equal(warning.status, 'WARN');
  assert.throws(() => createInputXmlLinearSolveRuntime(
    grounded.solve,
    warning,
    { solverProfile },
  ));
  const runtime = createInputXmlLinearSolveRuntime(grounded.solve, warning, {
    solverProfile,
    authorizeConditionalPreflight: true,
  });
  assert.equal(runtime.executionAvailability.solveExecution, 'CONDITIONAL_AUTHORIZED');
});

test('MH-PR6-07', 'runtime and execution identities are tamper-evident and stale authorities are rejected', () => {
  const first = prepare(
    model([element(10, 20, 1000, anchor)], { restraints: 1 }),
    STRICT,
    'RT7',
  );
  const runtime = createInputXmlLinearSolveRuntime(first.solve, first.preflight);
  assert.throws(() => solveInputXmlLinearPhysicalCase(
    { ...runtime },
    runtime.authorizedCaseIds[0],
  ));
  const result = solveInputXmlLinearPhysicalCase(runtime, runtime.authorizedCaseIds[0]);
  assert.throws(() => requireInputXmlLinearCaseExecution({
    ...result,
    summary: { ...result.summary, freeDofCount: 99 },
  }));
  const other = prepare(
    model([element(10, 20, 900, anchor)], { restraints: 1 }),
    STRICT,
    'RT7B',
  );
  assert.throws(() => createInputXmlLinearSolveRuntime(first.solve, other.preflight));
});

test('MH-PR6-08', 'load changes preserve factorization identity while runtime authorization identity changes', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, anchor)], { restraints: 1 }),
    {},
  );
  const downward = prepareInputXmlLinearSolve(context, STRICT, { modelId: 'RT8' });
  const axial = prepareInputXmlLinearSolve(context, STRICT, {
    structuralPreparation: downward.structuralPreparation,
    gravityDirection: { x: 0, y: 0, z: -1 },
  });
  const first = createInputXmlLinearSolveRuntime(
    downward,
    preflightInputXmlLinearSolve(downward),
  );
  const second = createInputXmlLinearSolveRuntime(
    axial,
    preflightInputXmlLinearSolve(axial),
  );
  assert.notEqual(first.runtimeHash, second.runtimeHash);
  assert.equal(first.stiffnessRuntimeHash, second.stiffnessRuntimeHash);
  assert.equal(first.stiffnessStateHash, second.stiffnessStateHash);
});

test('MH-PR6-09', 'case authorization can be narrowed and rejects unavailable cases', () => {
  const xml = model([
    element(10, 20, 1000, anchor, 'TEMP_EXP_C1="100"'),
  ], { restraints: 1 });
  const { solve, preflight } = prepare(xml, STRICT, 'RT9');
  const base = caseByRole(solve, 'WEIGHT_BASE');
  const operating = caseByRole(solve, 'WEIGHT_TEMPERATURE');
  const runtime = createInputXmlLinearSolveRuntime(solve, preflight, {
    caseIds: [base.caseId],
  });
  assert.equal(runtime.authorizedCaseIds.length, 1);
  assert.throws(() => solveInputXmlLinearPhysicalCase(runtime, operating.caseId));
  assert.throws(() => solveInputXmlLinearPhysicalCase(runtime, 'MISSING-CASE'));
});

console.log('LFEA InputXML runtime factorization and case execution check PASS.');
