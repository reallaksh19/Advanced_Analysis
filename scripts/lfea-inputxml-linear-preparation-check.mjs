#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  parseInputXmlModelHealthSource,
  prepareInputXmlLinearSolve,
  requireInputXmlLinearSolvePreparation,
} from '../src/core/linear-piping-analysis-consumer/index.js';

console.log('\n--- InputXML material, section, and load preparation ---');

const options = Object.freeze({
  source: 'INPUTXML_PREPARATION_FIXTURE',
  fileName: 'inputxml-preparation.xml',
});

const strictSource = parse(model([
  element({
    from: 10,
    to: 20,
    dx: 1000,
    materialNumber: 106,
    modulus: 200000,
    temperature: 80,
  }),
  element({
    from: 20,
    to: 30,
    dx: 1500,
    materialNumber: 360,
    modulus: 190000,
    temperature: 60,
  }),
]));
const strict = prepareInputXmlLinearSolve(
  strictSource,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  { modelId: 'PREP-STRICT' },
);
assert.equal(strict.normalizedGeometry.unit, 'm');
assert.deepEqual(
  strict.normalizedGeometry.segments.map((row) => row.length),
  [1, 1.5],
);
assert.equal(strict.materialResolutions.length, 2);
assert.equal(strict.sectionResolutions.length, 1);
assert.equal(strict.segmentBindings.length, 2);
assert.equal(strict.loadBindings.length, 2);
assert.equal(strict.caseAvailability.sustained.status, 'PREPARED_AUTHORITY_ONLY');
assert.equal(strict.caseAvailability.operating.status, 'PREPARED_AUTHORITY_ONLY');
assert.equal(strict.summary.activeThermalBindingCount, 2);
assert.equal(strict.summary.resolvedThermalBindingCount, 2);
assert.equal(strict.executionBoundary.constraintsCompiled, false);
assert.equal(strict.executionBoundary.mechanicalModelCompiled, false);
assert.equal(strict.executionBoundary.loadPrimitivesCompiled, false);
assert.equal(strict.executionBoundary.stiffnessAssembled, false);
assert.equal(strict.executionBoundary.solveAuthorized, false);
console.log('✅ Distinct per-element materials, shared sections, SI geometry, and load custody prepare without compilation.');

const approximateSource = parse(model([
  element({
    from: 10,
    to: 20,
    dx: 1000,
    materialNumber: 106,
    modulus: 200000,
    temperature: 80,
    pressure: 2.5,
    child: '<REDUCER TYPE="1"/>',
  }),
]));
assert.throws(
  () => prepareInputXmlLinearSolve(
    approximateSource,
    STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  ),
  (error) => error?.code === 'INPUTXML_PREPARATION_MODEL_CAPABILITY_BLOCKED',
);
const approximate = prepareInputXmlLinearSolve(
  approximateSource,
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  { modelId: 'PREP-APPROX' },
);
assert.equal(approximate.modelCapabilityStatus, 'CONDITIONAL');
assert.equal(
  approximate.segmentBindings[0].representabilityDisposition,
  'IMPLEMENTED_WITH_DECLARED_APPROXIMATION',
);
assert.equal(approximate.loadBindings[0].pressure.active, true);
assert.deepEqual(approximate.loadBindings[0].pressure.authorizedEffects, {
  codeStress: true,
  pressureStiffening: false,
  axialThrust: false,
  bourdon: false,
});
assert.equal(approximate.loadBindings[0].thermal.status, 'RESOLVED');
console.log('✅ Approximate reducer and code-only pressure custody remain explicit and cannot enter strict preparation.');

const unresolvedThermalSource = parse(model([
  element({
    from: 10,
    to: 20,
    dx: 1000,
    materialNumber: 999,
    modulus: 200000,
    temperature: 80,
  }),
]));
const unresolvedThermal = prepareInputXmlLinearSolve(
  unresolvedThermalSource,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  { modelId: 'PREP-UNKNOWN-THERMAL' },
);
assert.equal(unresolvedThermal.segmentBindings[0].thermalAuthorityStatus, 'UNRESOLVED');
assert.equal(unresolvedThermal.loadBindings[0].thermal.status, 'UNRESOLVED');
assert.equal(unresolvedThermal.caseAvailability.sustained.status, 'PREPARED_AUTHORITY_ONLY');
assert.equal(unresolvedThermal.caseAvailability.operating.status, 'UNAVAILABLE');
assert.ok(
  unresolvedThermal.caseAvailability.operating.reasonCodes
    .includes('THERMAL_EXPANSION_AUTHORITY_UNRESOLVED'),
);
console.log('✅ Unknown thermal coefficient does not block sustained authority, but operating preparation fails closed.');

const replay = prepareInputXmlLinearSolve(
  strictSource,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  { modelId: 'PREP-STRICT' },
);
assert.equal(replay.semanticHash, strict.semanticHash);
assert.equal(replay.evidenceHash, strict.evidenceHash);
const tampered = structuredClone(strict);
tampered.summary.preparedSegmentCount += 1;
assert.throws(
  () => requireInputXmlLinearSolvePreparation(tampered),
  /semantic hash mismatch/u,
);
const stale = parse(model([
  element({
    from: 10,
    to: 20,
    dx: 2000,
    materialNumber: 106,
    modulus: 200000,
    temperature: 80,
  }),
]));
assert.throws(
  () => requireInputXmlLinearSolvePreparation(strict, stale),
  /stale/u,
);
assert.throws(
  () => prepareInputXmlLinearSolve(
    '<PIPINGMODEL/>',
    STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  ),
  /schema|source bundle/u,
);
assert.throws(
  () => prepareInputXmlLinearSolve(strictSource, 'UNKNOWN_PROFILE'),
  (error) => error?.code === 'INPUTXML_PREPARATION_PROFILE_UNSUPPORTED',
);
console.log('✅ Deterministic replay, tamper rejection, stale rejection, no-reparse boundary, and profile gating pass.');

console.log('\n✅ InputXML linear solve preparation check passed.\n');

function parse(xmlText) {
  return parseInputXmlModelHealthSource(xmlText, options);
}

function model(elements) {
  return `<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input">
    ${units()}
    <PIPINGMODEL xmlns="" JOBNAME="PREPARATION_FIXTURE">
      ${elements.join('\n')}
    </PIPINGMODEL>
  </CAESARII>`;
}

function element({
  from,
  to,
  dx,
  materialNumber,
  modulus,
  temperature,
  pressure = null,
  child = '',
}) {
  return `<PIPINGELEMENT
    FROM_NODE="${from}" TO_NODE="${to}"
    DELTA_X="${dx}" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5"
    INSUL_THICK="20" INSUL_DENSITY="150"
    TEMP_EXP_C1="${temperature}"
    ${pressure === null ? '' : `PRESSURE1="${pressure}"`}
    MODULUS="${modulus}" POISSONS="0.3"
    PIPE_DENSITY="7850" FLUID_DENSITY="1000"
    MATERIAL_NUM="${materialNumber}" MATERIAL_NAME="M${materialNumber}">
    ${child}
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
