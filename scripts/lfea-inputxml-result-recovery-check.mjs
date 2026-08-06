import assert from 'node:assert/strict';
import { diagnoseInputXmlLinearModelHealthContext } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';
import { prepareInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-preparation.js';
import { preflightInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-stiffness-preflight.js';
import { createInputXmlLinearSolveRuntime } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-runtime.js';
import { solveInputXmlLinearPhysicalCase, solveInputXmlLinearPhysicalCases } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-case-execution.js';
import { recoverInputXmlLinearCaseResult, recoverInputXmlLinearCaseResults } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-result-recovery.js';
import { requireInputXmlLinearRecoveredCase } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-recovered-case-contract.js';
import { DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE, STRICT_INPUTXML_LINEAR_STATIC_PROFILE as STRICT } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health-profile.js';

console.log('\n--- LFEA InputXML governed result recovery check ---');

const UNITS = '<UNITS><LENGTH LABEL="MM" FACTOR="25.4"/><FORCE LABEL="N" FACTOR="4.4482216152605"/><MOMENT-INPUT LABEL="NM" FACTOR="0.1129848290276167"/><EMOD LABEL="MPA" FACTOR="0.006894757293168"/><PRESSURE LABEL="MPA" FACTOR="0.006894757293168"/><TEMP LABEL="C" FACTOR="0.5555555555555556"/><PDENS LABEL="KG/M3" FACTOR="27679.9047102"/><IDENS LABEL="KG/M3" FACTOR="27679.9047102"/><FDENS LABEL="KG/M3" FACTOR="27679.9047102"/></UNITS>';
const anchor = (node) => `<RESTRAINT TYPE="0" NODE="${node}"/>`;
const element = ({ from, to, dx = 0, dy = 0, dz = 0, pressure, temperature, inner = '' }) => `<PIPINGELEMENT FROM_NODE="${from}" TO_NODE="${to}" DELTA_X="${dx}" DELTA_Y="${dy}" DELTA_Z="${dz}" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="106" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" FLUID_DENSITY="0" INSUL_THICK="0" INSUL_DENSITY="0" ${pressure === undefined ? '' : `PRESSURE1="${pressure}"`} ${temperature === undefined ? '' : `TEMP_EXP_C1="${temperature}"`}>${inner}</PIPINGELEMENT>`;
const model = (elements, counts = {}) => `<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="MHPR7" NUMELT="${elements.length}" NUMBEND="${counts.bends ?? 0}" NUMRIGID="${counts.rigids ?? 0}" NUMREST="${counts.restraints ?? 0}">${UNITS}${elements.join('')}</PIPINGMODEL></CAESARII>`;

function test(id, name, fn) { fn(); console.log(`${id} PASS ${name}`); }
function prepare(xml, profile = STRICT, modelId = 'PR7', options = {}) {
  const context = diagnoseInputXmlLinearModelHealthContext(xml, {});
  const solve = prepareInputXmlLinearSolve(context, profile, { modelId, ...options });
  const preflight = preflightInputXmlLinearSolve(solve);
  const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
  return { solve, preflight, runtime };
}
function byRole(solve, role) {
  const row = solve.physicalCases.find((candidate) => candidate.caseRole === role);
  assert.ok(row, `missing case ${role}`);
  return row;
}
function recover(fixture, role) {
  const caseRecord = typeof role === 'string' ? byRole(fixture.solve, role) : role;
  const execution = solveInputXmlLinearPhysicalCase(fixture.runtime, caseRecord.caseId);
  const result = recoverInputXmlLinearCaseResult(fixture.runtime, execution);
  requireInputXmlLinearRecoveredCase(result, { runtime: fixture.runtime, execution });
  return { caseRecord, execution, result };
}
function first(result) { assert.equal(result.elementResults.length, 1); return result.elementResults[0]; }
function dof(rows, suffix, name) { return rows.find((row) => row.nodeId.endsWith(suffix) && row.dof === name)?.value ?? 0; }
function close(actual, expected, scale = 1, rel = 1e-9, abs = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= abs + rel * Math.max(Math.abs(scale), 1), `${actual} != ${expected}`);
}
function maxAction(action) { return Math.max(...Object.values(action).map(Math.abs)); }
function state(structural, elementId, family) {
  const modelElement = structural.compilation.model.elements.find((row) => row.elementId === elementId);
  const id = family === 'material' ? modelElement.materialStateId : modelElement.sectionStateId;
  const rows = family === 'material' ? structural.materialResolutions : structural.sectionResolutions;
  const value = rows.find((row) => row[`${family}State`][`${family}StateId`] === id);
  assert.ok(value);
  return value[`${family}State`];
}
function prohibited(value) {
  const keys = new Set(['factorizationHandle', 'factorizationCache', 'genericRuntime', 'solvePreparation', 'preflight', 'solverProfile', 'frameProfile', 'K', 'sparseK', 'triplets', 'matrix', 'localStiffness', 'globalStiffness', 'sparseFactor', 'scaleFactors', 'factors']);
  const found = [];
  const walk = (entry, path) => {
    if (Array.isArray(entry)) entry.forEach((item, index) => walk(item, `${path}[${index}]`));
    else if (entry && typeof entry === 'object') Object.entries(entry).forEach(([key, item]) => {
      if (keys.has(key)) found.push(`${path}.${key}`);
      walk(item, `${path}.${key}`);
    });
  };
  walk(value, 'result');
  return found;
}

const cantilever = prepare(model([
  element({ from: 10, to: 20, dx: 1000, inner: anchor(10) }),
], { restraints: 1 }), STRICT, 'PR7-CANT', { gravityDirection: { x: 0, y: 0, z: -1 } });
const weight = recover(cantilever, 'WEIGHT_BASE');

test('MH-PR7-01', 'grounded cantilever self-weight recovery and reactions', () => {
  assert.equal(cantilever.runtime.executionAvailability.resultRecovery, 'AUTHORIZED');
  const row = first(weight.result);
  const structural = cantilever.solve.structuralPreparation;
  const material = state(structural, row.elementId, 'material');
  const section = state(structural, row.elementId, 'section');
  const w = material.massDensity * section.area * 9.80665;
  close(row.localActions.I.fy, w * row.forceField.length, w);
  close(row.localActions.I.mz, w * row.forceField.length ** 2 / 2, w);
  close(maxAction(row.localActions.J), 0, w, 0, 1e-7);
  close(dof(weight.result.reactions, '.N10', 'UZ'), w * row.forceField.length, w, 1e-8, 1e-6);
});

test('MH-PR7-02', 'distributed-load cantilever closed-form displacement and stations', () => {
  const row = first(weight.result);
  const structural = cantilever.solve.structuralPreparation;
  const material = state(structural, row.elementId, 'material');
  const section = state(structural, row.elementId, 'section');
  const L = row.forceField.length;
  const w = material.massDensity * section.area * 9.80665;
  close(dof(weight.result.displacements, '.N20', 'UZ'), -w * L ** 4 / (8 * material.elasticModulus * section.secondMomentZ), w * L ** 4 / (material.elasticModulus * section.secondMomentZ), 1e-8, 1e-12);
  close(maxAction(row.forceField.stations.at(-1).action), 0, w * L, 0, 1e-7);
});

test('MH-PR7-03', 'restrained uniform thermal strain contributes once', () => {
  const fixture = prepare(model([
    element({ from: 10, to: 20, dx: 1000, temperature: 100, inner: `${anchor(10)}<RESTRAINT NODE="20" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0" STIFFNESS="-1.0101"/>` }),
  ], { restraints: 2 }), STRICT, 'PR7-THERM', { gravityDirection: { x: 0, y: 0, z: -1 } });
  const recovered = recover(fixture, 'WEIGHT_TEMPERATURE');
  const row = first(recovered.result);
  const material = state(fixture.solve.structuralPreparation, row.elementId, 'material');
  const section = state(fixture.solve.structuralPreparation, row.elementId, 'section');
  const temperature = recovered.caseRecord.loadCase.primitives.find((item) => item.kind === 'TEMPERATURE');
  const expected = material.elasticModulus * section.area * material.thermalExpansionCoefficient * (temperature.operatingTemperature - temperature.installationTemperature);
  close(row.localActions.I.fx, expected, expected, 1e-9, 1e-6);
  close(row.localActions.J.fx, -expected, expected, 1e-9, 1e-6);
  close(Math.abs(row.loadActionCustody.initialStrainLoadLocal[0]), expected, expected);
  close(dof(recovered.result.displacements, '.N20', 'UX'), 0, 1, 0, 1e-12);
});

test('MH-PR7-04', 'pressure is code-only and structurally invisible', () => {
  const fixture = prepare(model([
    element({ from: 10, to: 20, dx: 1000, pressure: 2000000, inner: anchor(10) }),
  ], { restraints: 1 }), APPROXIMATE, 'PR7-PRESS', { gravityDirection: { x: 0, y: 0, z: -1 } });
  const base = recover(fixture, 'WEIGHT_BASE');
  const pressure = recover(fixture, 'WEIGHT_PRESSURE');
  assert.deepEqual(base.result.displacements, pressure.result.displacements);
  assert.deepEqual(base.result.reactions, pressure.result.reactions);
  assert.deepEqual(first(base.result).localActions, first(pressure.result).localActions);
  assert.notEqual(base.result.semanticHash, pressure.result.semanticHash);
  assert.equal(pressure.result.pressureCustody[0].structuralEffect, 'NONE');
});

test('MH-PR7-05', 'multiple cases share stiffness but not result identity', () => {
  const fixture = prepare(model([
    element({ from: 10, to: 20, dx: 1000, pressure: 2, temperature: 100, inner: anchor(10) }),
  ], { restraints: 1 }), APPROXIMATE, 'PR7-MULTI');
  const executions = solveInputXmlLinearPhysicalCases(fixture.runtime);
  const results = recoverInputXmlLinearCaseResults(fixture.runtime, executions);
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map((row) => row.stiffnessIdentity.stiffnessRuntimeHash)).size, 1);
  assert.equal(new Set(results.map((row) => row.caseIdentity.physicalLoadCaseHash)).size, 3);
  assert.equal(new Set(results.map((row) => row.semanticHash)).size, 3);
});

test('MH-PR7-06', 'coordinate rotation preserves local actions', () => {
  const build = (axis, id) => prepare(model([
    element({ from: 10, to: 20, [axis]: 1000, inner: anchor(10) }),
  ], { restraints: 1 }), STRICT, id, { gravityDirection: { x: 0, y: 0, z: -1 } });
  const x = first(recover(build('dx', 'PR7-X'), 'WEIGHT_BASE').result);
  const y = first(recover(build('dy', 'PR7-Y'), 'WEIGHT_BASE').result);
  close(x.localActions.I.fy, y.localActions.I.fy, x.localActions.I.fy, 1e-9, 1e-7);
  close(x.localActions.I.mz, y.localActions.I.mz, x.localActions.I.mz, 1e-9, 1e-7);
});

test('MH-PR7-07', 'element direction reversal retains deterministic source custody', () => {
  const fixture = prepare(model([
    element({ from: 20, to: 10, dx: -1000, inner: anchor(20) }),
  ], { restraints: 1 }), STRICT, 'PR7-REV', { gravityDirection: { x: 0, y: 0, z: -1 } });
  const result = recover(fixture, 'WEIGHT_BASE').result;
  assert.equal(new Set(result.sourceStations.map((row) => row.stationId)).size, 5);
  assert.ok(result.sourceStations.some((row) => row.sourceSide === 'LEFT'));
  assert.ok(result.sourceStations.some((row) => row.sourceSide === 'RIGHT'));
  assert.ok(result.sourceStations.every((row) => row.actionBasis === 'STRUCTURAL_ELEMENT_LOCAL'));
});

test('MH-PR7-08', 'rigid-element stiffness and weight custody remain separate', () => {
  const fixture = prepare(model([
    element({ from: 10, to: 20, dx: 1000, inner: `${anchor(10)}<RIGID TYPE="VALVE" WEIGHT="100"/>` }),
  ], { restraints: 1, rigids: 1 }), STRICT, 'PR7-RIGID');
  const row = first(recover(fixture, 'WEIGHT_BASE').result);
  assert.equal(row.componentKind, 'RIGID');
  assert.ok(row.rigidElementId);
  assert.notEqual(row.physicalSectionStateId, row.analysisSectionStateId);
  assert.ok(row.loadActionCustody.distributedPrimitiveIds.length > 0);
});

test('MH-PR7-09', 'approximation limitations propagate to every affected station', () => {
  const fixture = prepare(model([
    element({ from: 10, to: 20, dx: 1000, inner: `${anchor(10)}<BEND RADIUS="300"/>` }),
  ], { restraints: 1, bends: 1 }), APPROXIMATE, 'PR7-BEND');
  const result = recover(fixture, 'WEIGHT_BASE').result;
  assert.equal(first(result).implementation, 'IMPLEMENTED_WITH_DECLARED_APPROXIMATION');
  assert.ok(first(result).limitationCodes.includes('GENERIC_APPROX_BEND_STRAIGHT_CHORD'));
  assert.ok(result.sourceStations.every((row) => row.limitationCodes.includes('GENERIC_APPROX_BEND_STRAIGHT_CHORD')));
});

test('MH-PR7-10', 'determinism, tamper, clone and cross-case rejection', () => {
  const replay = recoverInputXmlLinearCaseResult(cantilever.runtime, weight.execution);
  assert.equal(replay.semanticHash, weight.result.semanticHash);
  const tampered = structuredClone(replay);
  tampered.reactions[0].value += 1;
  assert.throws(() => requireInputXmlLinearRecoveredCase(tampered), (error) => error.code === 'INPUTXML_RECOVERY_HASH_MISMATCH');
  assert.throws(() => recoverInputXmlLinearCaseResult({ ...cantilever.runtime }, weight.execution));
  const fixture = prepare(model([
    element({ from: 10, to: 20, dx: 1000, pressure: 2, inner: anchor(10) }),
  ], { restraints: 1 }), APPROXIMATE, 'PR7-CROSS');
  const base = recover(fixture, 'WEIGHT_BASE');
  const pressure = recover(fixture, 'WEIGHT_PRESSURE');
  assert.throws(() => requireInputXmlLinearRecoveredCase(pressure.result, { runtime: fixture.runtime, execution: base.execution }), (error) => error.code === 'INPUTXML_RECOVERY_CONTEXT_STALE');
});

test('MH-PR7-11', 'coincident source stations retain distinct left and right sides', () => {
  const fixture = prepare(model([
    element({ from: 10, to: 20, dx: 1000, inner: anchor(10) }),
    element({ from: 20, to: 30, dx: 1000 }),
  ], { restraints: 1 }), STRICT, 'PR7-COINCIDENT');
  const rows = recover(fixture, 'WEIGHT_BASE').result.sourceStations.filter((row) => row.sourceNodeId === '20');
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map((row) => row.sourceSide)), new Set(['LEFT', 'RIGHT']));
  assert.equal(new Set(rows.map((row) => row.stationId)).size, 2);
});

test('MH-PR7-12', 'serialized records contain no runtime factors or matrices', () => {
  assert.deepEqual(prohibited(weight.result), []);
  const replay = JSON.parse(JSON.stringify(weight.result));
  requireInputXmlLinearRecoveredCase(replay);
  assert.equal(replay.semanticHash, weight.result.semanticHash);
  assert.throws(() => recoverInputXmlLinearCaseResult(JSON.parse(JSON.stringify(cantilever.runtime)), weight.execution));
});

console.log('LFEA InputXML governed result recovery check PASS.');
