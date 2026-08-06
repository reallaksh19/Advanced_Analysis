#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  compileInputXmlLinearPhysicalCases,
  compileInputXmlLinearStructure,
  diagnoseInputXmlLinearModelHealth,
  parseInputXmlModelHealthSource,
  preflightInputXmlLinearSolve,
  prepareInputXmlLinearSolve,
  requireInputXmlLinearPhysicalCasePreparation,
  requireInputXmlLinearStiffnessPreflight,
  requireInputXmlLinearStructuralPreparation,
} from './index.js';

console.log('\n--- InputXML solve-integration preparation and preflight ---');

const strictSource = parse(model(element({ temperature: 80 })));
const strictHealth = diagnoseInputXmlLinearModelHealth(strictSource);
const strictAuthority = prepareInputXmlLinearSolve(
  strictSource,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  { modelId: 'IXPASS' },
);
const strictStructure = compileInputXmlLinearStructure(
  strictSource,
  strictHealth,
  strictAuthority,
);
assert.equal(strictStructure.executionBoundary.constraintsCompiled, true);
assert.equal(strictStructure.executionBoundary.mechanicalModelCompiled, true);
assert.equal(strictStructure.summary.elementCount, 1);
assert.equal(strictStructure.summary.constraintCount, 6);

const strictPhysical = compileInputXmlLinearPhysicalCases(strictAuthority, strictStructure);
assert.ok(strictPhysical.physicalCases.some((row) => row.caseRole === 'WEIGHT_BASE'));
assert.ok(strictPhysical.physicalCases.some((row) => row.caseRole === 'WEIGHT_TEMPERATURE'));
assert.equal(strictPhysical.executionBoundary.loadPrimitivesCompiled, true);
assert.equal(strictPhysical.executionBoundary.stiffnessAssembled, false);

const strictPreflight = preflightInputXmlLinearSolve(strictPhysical);
assert.equal(strictPreflight.status, 'PASS');
assert.equal(strictPreflight.executionBoundary.stiffnessPreflight, 'QUALIFIED');
assert.equal(strictPreflight.executionBoundary.factorizationHandle, 'NOT_RETAINED');
assert.equal(strictPreflight.executionBoundary.solveExecution, 'NOT_AUTHORIZED');
assert.equal(Object.hasOwn(strictPreflight.genericPreflight.factorization, 'L'), false);
assertNoRuntimeFactors(strictPreflight);
console.log('✅ Anchored strict model compiles structure and physical cases, then qualifies stiffness without retaining factors or solving.');

const pressureSource = parse(model(element({ temperature: 80, pressure: 2.5 })));
const pressureHealth = diagnoseInputXmlLinearModelHealth(pressureSource);
const pressureAuthority = prepareInputXmlLinearSolve(
  pressureSource,
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  { modelId: 'IXPRESSURE' },
);
const pressureStructure = compileInputXmlLinearStructure(
  pressureSource,
  pressureHealth,
  pressureAuthority,
);
const pressurePhysical = compileInputXmlLinearPhysicalCases(
  pressureAuthority,
  pressureStructure,
);
assert.ok(pressurePhysical.physicalCases.some((row) => row.caseRole === 'WEIGHT_PRESSURE'));
assert.ok(pressurePhysical.loadLedger.some((row) => (
  row.sourceKind === 'PRESSURE'
  && row.disposition === 'COMPILED_WITH_DECLARED_LIMITATION'
  && row.limitationCode === 'GENERIC_APPROX_PRESSURE_CODE_ONLY'
)));
console.log('✅ Pressure remains code-only and is compiled only under the disclosed approximation profile.');

const replay = preflightInputXmlLinearSolve(strictPhysical);
assert.equal(replay.semanticHash, strictPreflight.semanticHash);
assert.equal(replay.stiffnessAssessmentHash, strictPreflight.stiffnessAssessmentHash);
const rotatedPhysical = compileInputXmlLinearPhysicalCases(
  strictAuthority,
  strictStructure,
  { gravityDirection: { x: 0, y: 0, z: -1 } },
);
const rotatedPreflight = preflightInputXmlLinearSolve(rotatedPhysical);
assert.notEqual(rotatedPreflight.semanticHash, strictPreflight.semanticHash);
assert.equal(rotatedPreflight.stiffnessAssessmentHash, strictPreflight.stiffnessAssessmentHash);
console.log('✅ Load identity changes do not contaminate the load-independent stiffness assessment identity.');


const floatingSource = parse(model(element({ temperature: 80, restraint: false })));
const floatingHealth = diagnoseInputXmlLinearModelHealth(floatingSource);
const floatingAuthority = prepareInputXmlLinearSolve(
  floatingSource,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  { modelId: 'IXFLOATING' },
);
const floatingStructure = compileInputXmlLinearStructure(
  floatingSource,
  floatingHealth,
  floatingAuthority,
);
const floatingPhysical = compileInputXmlLinearPhysicalCases(
  floatingAuthority,
  floatingStructure,
);
const floatingPreflight = preflightInputXmlLinearSolve(floatingPhysical);
assert.equal(floatingPreflight.status, 'BLOCK');
assert.ok(floatingPreflight.genericPreflight.findings.some((row) => (
  row.code === 'SOLVER_MECHANISM_FLOATING_COMPONENT'
)));
assert.equal(floatingPreflight.executionBoundary.solveExecution, 'NOT_AUTHORIZED');
console.log('✅ Floating components are classified as blocking mechanisms without a retained factorization.');

const structuralTamper = structuredClone(strictStructure);
structuralTamper.summary.elementCount += 1;
assert.throws(
  () => requireInputXmlLinearStructuralPreparation(structuralTamper),
  /semantic hash mismatch/u,
);
const physicalTamper = structuredClone(strictPhysical);
physicalTamper.summary.physicalCaseCount += 1;
assert.throws(
  () => requireInputXmlLinearPhysicalCasePreparation(physicalTamper),
  /semantic hash mismatch/u,
);
const preflightTamper = structuredClone(strictPreflight);
preflightTamper.summary.elementCount += 1;
assert.throws(
  () => requireInputXmlLinearStiffnessPreflight(preflightTamper),
  /hash mismatch/u,
);
assert.throws(
  () => compileInputXmlLinearStructure('<PIPINGMODEL/>', strictHealth, strictAuthority),
  /schema|source bundle/u,
);
console.log('✅ Deterministic replay, tamper rejection, and no-reparse boundaries pass.');

console.log('\n✅ InputXML solve-integration check passed.\n');

function parse(xmlText) {
  return parseInputXmlModelHealthSource(xmlText, {
    source: 'INPUTXML_SOLVE_INTEGRATION_FIXTURE',
    fileName: 'inputxml-solve-integration.xml',
  });
}

function model(pipingElement) {
  return `<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input">
    ${units()}
    <PIPINGMODEL xmlns="" JOBNAME="SOLVE_INTEGRATION_FIXTURE">
      ${pipingElement}
    </PIPINGMODEL>
  </CAESARII>`;
}

function element({ temperature, pressure = null, restraint = true }) {
  return `<PIPINGELEMENT
    FROM_NODE="10" TO_NODE="20"
    DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5"
    INSUL_THICK="20" INSUL_DENSITY="150"
    TEMP_EXP_C1="${temperature}"
    ${pressure === null ? '' : `PRESSURE1="${pressure}"`}
    MODULUS="200000" POISSONS="0.3"
    PIPE_DENSITY="7850" FLUID_DENSITY="1000"
    MATERIAL_NUM="106" MATERIAL_NAME="M106">
    ${restraint ? '<RESTRAINT NODE="10" TYPE="ANC"/>' : ''}
  </PIPINGELEMENT>`;
}

function units() {
  return `<UNITS>
    <LENGTH LABEL="MM" FACTOR="25.4"/>
    <FORCE LABEL="N" FACTOR="4.4482216152605"/>
    <MOMENT-INPUT LABEL="N-M" FACTOR="0.1129848290276167"/>
    <STRESS LABEL="MPA" FACTOR="0.006894757293168"/>
    <PRESSURE LABEL="MPA" FACTOR="0.006894757293168"/>
    <EMOD LABEL="MPA" FACTOR="0.006894757293168"/>
    <TEMP LABEL="C" FACTOR="0.5555555555555556"/>
    <PDENS LABEL="KG/M3" FACTOR="27679.9047102"/>
    <IDENS LABEL="KG/M3" FACTOR="27679.9047102"/>
    <FDENS LABEL="KG/M3" FACTOR="27679.9047102"/>
  </UNITS>`;
}

function assertNoRuntimeFactors(value) {
  const forbidden = new Set(['L', 'D', 'sparseFactor', 'sparseFreeMatrix', 'K', 'sparseK']);
  const visit = (candidate) => {
    if (candidate === null || typeof candidate !== 'object') return;
    for (const [key, child] of Object.entries(candidate)) {
      assert.equal(forbidden.has(key), false, `forbidden runtime factor field ${key}`);
      visit(child);
    }
  };
  visit(value.genericPreflight.factorization);
}
