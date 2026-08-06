import assert from 'node:assert/strict';
import { diagnoseInputXmlLinearModelHealthContext } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';
import { prepareInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-preparation.js';
import { preflightInputXmlLinearSolve } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-stiffness-preflight.js';
import { createInputXmlLinearSolveRuntime } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-solve-runtime.js';
import { solveInputXmlLinearPhysicalCases } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-case-execution.js';
import { recoverInputXmlLinearCaseResults } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-result-recovery.js';
import { deriveInputXmlLinearCase, deriveInputXmlLinearCases } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-derived-cases.js';
import { requireInputXmlLinearDerivedCase, sealInputXmlLinearDerivedCase } from '../src/core/linear-piping-analysis-consumer/inputxml-linear-derived-case-contract.js';
import { DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health-profile.js';

console.log('\n--- LFEA InputXML governed derived-case check ---');

const UNITS = '<UNITS><LENGTH LABEL="MM" FACTOR="25.4"/><FORCE LABEL="N" FACTOR="4.4482216152605"/><MOMENT-INPUT LABEL="NM" FACTOR="0.1129848290276167"/><EMOD LABEL="MPA" FACTOR="0.006894757293168"/><PRESSURE LABEL="MPA" FACTOR="0.006894757293168"/><TEMP LABEL="C" FACTOR="0.5555555555555556"/><PDENS LABEL="KG/M3" FACTOR="27679.9047102"/><IDENS LABEL="KG/M3" FACTOR="27679.9047102"/><FDENS LABEL="KG/M3" FACTOR="27679.9047102"/></UNITS>';
const XML = (job, length = 1000) => `<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="${job}" NUMELT="1" NUMBEND="0" NUMRIGID="0" NUMREST="1">${UNITS}<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="${length}" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="106" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" FLUID_DENSITY="0" INSUL_THICK="0" INSUL_DENSITY="0" PRESSURE1="2" TEMP_EXP_C1="100"><RESTRAINT TYPE="0" NODE="10"/></PIPINGELEMENT></PIPINGMODEL></CAESARII>`;

function test(id, name, fn) { fn(); console.log(`${id} PASS ${name}`); }
function prepare(xml, modelId) {
  const context = diagnoseInputXmlLinearModelHealthContext(xml, {});
  const solve = prepareInputXmlLinearSolve(context, APPROXIMATE, { modelId, gravityDirection: { x: 0, y: 0, z: -1 } });
  const preflight = preflightInputXmlLinearSolve(solve);
  const runtime = createInputXmlLinearSolveRuntime(solve, preflight);
  const executions = solveInputXmlLinearPhysicalCases(runtime);
  const recovered = recoverInputXmlLinearCaseResults(runtime, executions);
  return { solve, preflight, runtime, executions, recovered };
}
function byRole(fixture, role) {
  const result = fixture.recovered.find((row) => row.caseIdentity.caseRole === role);
  assert.ok(result, `missing recovered case ${role}`);
  return result;
}
function term(row, factor) { return { recoveredCaseId: row.recoveredCaseId, factor }; }
function dof(rows, suffix, name) { return rows.find((row) => row.nodeId.endsWith(suffix) && row.dof === name)?.value ?? 0; }
function canonicalDofs(rows) {
  return [...rows].sort((left, right) => {
    const a = `${left.nodeId}:${left.dof}`;
    const b = `${right.nodeId}:${right.dof}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
function close(actual, expected, scale = 1, rel = 1e-9, abs = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= abs + rel * Math.max(Math.abs(scale), 1), `${actual} != ${expected}`);
}
function firstAction(result) { assert.equal(result.elementResults.length, 1); return result.elementResults[0].localActions.I; }
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
  walk(value, 'derived');
  return found;
}

const fixture = prepare(XML('MHPR8'), 'PR8');
const weight = byRole(fixture, 'WEIGHT_BASE');
const pressure = byRole(fixture, 'WEIGHT_PRESSURE');
const operating = byRole(fixture, 'WEIGHT_PRESSURE_TEMPERATURE');
const sustained = deriveInputXmlLinearCase(fixture.recovered, { name: 'SUS', purpose: 'SUSTAINED', kind: 'LINEAR', terms: [term(pressure, 1)] });
const op = deriveInputXmlLinearCase(fixture.recovered, { name: 'OPE', purpose: 'OPERATING', kind: 'LINEAR', terms: [term(operating, 1)] });
const occasional = deriveInputXmlLinearCase(fixture.recovered, { name: 'OCC', purpose: 'OCCASIONAL', kind: 'LINEAR', terms: [term(operating, 1), term(weight, -0.25)] });
const expansion = deriveInputXmlLinearCase(fixture.recovered, { name: 'EXP', purpose: 'EXPANSION_RANGE', kind: 'RANGE', terms: [term(operating, 1), term(pressure, -1)] });
const envelope = deriveInputXmlLinearCase(fixture.recovered, {
  name: 'ENV', purpose: 'OCCASIONAL', kind: 'ENVELOPE',
  candidates: [
    { candidateId: 'BASE', terms: [term(weight, 1)] },
    { candidateId: 'OPERATING', terms: [term(operating, 1)] },
  ],
});

test('MH-PR8-01', 'sustained case preserves pressure custody without structural leakage', () => {
  assert.deepEqual(canonicalDofs(sustained.resultState.displacements), canonicalDofs(pressure.displacements));
  assert.deepEqual(firstAction(sustained.resultState), firstAction(weight));
  assert.ok(sustained.pressureCustody.length > 0);
  assert.ok(sustained.pressureCustody.every((row) => row.structuralEffect === 'NONE'));
});

test('MH-PR8-02', 'operating case retains qualified recovered actions and ancestry', () => {
  assert.deepEqual(canonicalDofs(op.resultState.displacements), canonicalDofs(operating.displacements));
  assert.deepEqual(firstAction(op.resultState), firstAction(operating));
  assert.equal(op.sourceCases[0].recoveredCaseSemanticHash, operating.semanticHash);
  requireInputXmlLinearDerivedCase(op, { recoveredCases: [operating] });
});

test('MH-PR8-03', 'scalar-factored occasional algebra is componentwise linear', () => {
  const actual = dof(occasional.resultState.displacements, '.N20', 'UX');
  const expected = dof(operating.displacements, '.N20', 'UX') - 0.25 * dof(weight.displacements, '.N20', 'UX');
  close(actual, expected, expected);
  close(firstAction(occasional.resultState).fx, firstAction(operating).fx - 0.25 * firstAction(weight).fx, firstAction(operating).fx);
});

test('MH-PR8-04', 'expansion range carries signed difference and absolute magnitude', () => {
  const signed = dof(expansion.resultState.displacements, '.N20', 'UX');
  const expected = dof(operating.displacements, '.N20', 'UX') - dof(pressure.displacements, '.N20', 'UX');
  close(signed, expected, expected);
  close(dof(expansion.rangeMagnitude.displacements, '.N20', 'UX'), Math.abs(expected), expected);
  assert.ok(expansion.limitations.includes('INPUTXML_DERIVED_RANGE_MAGNITUDE_REPORTING_ONLY'));
});

test('MH-PR8-05', 'envelope records minima, maxima and governing candidate identity', () => {
  assert.ok(dof(envelope.envelope.minimum.displacements, '.N20', 'UX') <= dof(envelope.envelope.maximum.displacements, '.N20', 'UX'));
  const governing = envelope.envelope.governingMaximum.displacements.find((row) => row.nodeId.endsWith('.N20') && row.dof === 'UX');
  assert.equal(governing.candidateId, 'OPERATING');
  assert.equal(envelope.diagnostics.algebra.componentwiseEnvelopeReportingOnly, true);
});

test('MH-PR8-06', 'all derived cases bind one model, stiffness runtime and recovery profile', () => {
  for (const result of [sustained, op, occasional, expansion, envelope]) {
    assert.equal(result.compatibilityIdentity.stiffnessRuntimeHash, fixture.runtime.stiffnessRuntimeHash);
    assert.equal(result.compatibilityIdentity.runtimeHash, fixture.runtime.runtimeHash);
    assert.ok(result.sourceCases.every((row) => row.stiffnessRuntimeHash === fixture.runtime.stiffnessRuntimeHash));
  }
});

test('MH-PR8-07', 'incompatible model or stiffness contexts fail closed', () => {
  const other = prepare(XML('MHPR8-OTHER', 1200), 'PR8-OTHER');
  const otherWeight = byRole(other, 'WEIGHT_BASE');
  assert.throws(() => deriveInputXmlLinearCase([...fixture.recovered, otherWeight], {
    name: 'BAD', purpose: 'CUSTOM', kind: 'LINEAR', terms: [term(weight, 1), term(otherWeight, 1)],
  }), (error) => error.code === 'INPUTXML_DERIVED_CONTEXT_INCOMPATIBLE');
});

test('MH-PR8-08', 'tampered and stale derived contexts fail closed', () => {
  const tampered = structuredClone(op);
  tampered.resultState.displacements[0].value += 1;
  assert.throws(() => requireInputXmlLinearDerivedCase(tampered), (error) => error.code === 'INPUTXML_DERIVED_HASH_MISMATCH');
  assert.throws(() => requireInputXmlLinearDerivedCase(occasional, { recoveredCases: [operating] }), (error) => error.code === 'INPUTXML_DERIVED_CONTEXT_STALE');
});

test('MH-PR8-09', 'canonical ordering makes additive definitions deterministic', () => {
  const replay = deriveInputXmlLinearCase([...fixture.recovered].reverse(), {
    name: 'OCC', purpose: 'OCCASIONAL', kind: 'LINEAR', terms: [term(weight, -0.25), term(operating, 1)],
  });
  assert.equal(replay.semanticHash, occasional.semanticHash);
  assert.equal(replay.evidenceHash, occasional.evidenceHash);
});

test('MH-PR8-10', 'element and coincident source-station ledgers remain distinct', () => {
  assert.equal(expansion.resultState.elementResults.length, operating.elementResults.length);
  assert.equal(expansion.resultState.sourceStations.length, operating.sourceStations.length);
  assert.equal(new Set(expansion.resultState.sourceStations.map((row) => row.stationId)).size, expansion.resultState.sourceStations.length);
  assert.ok(expansion.resultState.elementResults.every((row) => row.sourceElementAuthorities.length === 2));
});

test('MH-PR8-11', 'batch output is sealed and excludes runtime factorization state', () => {
  const batch = deriveInputXmlLinearCases(fixture.recovered, [
    { name: 'SUS-B', purpose: 'SUSTAINED', kind: 'LINEAR', terms: [term(pressure, 1)] },
    { name: 'EXP-B', purpose: 'EXPANSION_RANGE', kind: 'RANGE', terms: [term(operating, 1), term(pressure, -1)] },
  ]);
  assert.equal(batch.length, 2);
  assert.deepEqual(prohibited(batch), []);
  assert.ok(Object.isFrozen(batch));
});

test('MH-PR8-12', 'invalid factors, duplicate terms and pressure leakage are rejected', () => {
  assert.throws(() => deriveInputXmlLinearCase(fixture.recovered, { name: 'NAN', purpose: 'CUSTOM', kind: 'LINEAR', terms: [term(weight, Number.NaN)] }), (error) => error.code === 'INPUTXML_DERIVED_NONFINITE');
  assert.throws(() => deriveInputXmlLinearCase(fixture.recovered, { name: 'DUP', purpose: 'CUSTOM', kind: 'LINEAR', terms: [term(weight, 1), term(weight, -1)] }), (error) => error.code === 'INPUTXML_DERIVED_DUPLICATE');
  const leaked = structuredClone(sustained);
  leaked.pressureCustody[0].structuralEffect = 'LOAD';
  leaked.semanticHash = '';
  leaked.evidenceHash = '';
  assert.throws(() => sealInputXmlLinearDerivedCase(leaked), (error) => error.code === 'INPUTXML_DERIVED_PRESSURE_LEAKAGE');
});

console.log('LFEA InputXML governed derived-case check passed.');
