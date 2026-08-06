#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  diagnoseInputXmlLinearModelHealth,
  parseInputXmlModelHealthSource,
  requireInputXmlLinearModelHealth,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  DEFAULT_RESTRAINT_TYPE_CODE_MAP,
} from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';

console.log('\n--- InputXML representability capability diagnostics ---');

const ingestion = Object.freeze({
  unit: 'mm',
  source: 'MODEL_HEALTH_REPRESENTABILITY_FIXTURE',
  fileName: 'model-health-representability.xml',
  restraintTypeCodeMap: DEFAULT_RESTRAINT_TYPE_CODE_MAP,
});

const clean = parse(`<PIPINGMODEL JOBNAME="CLEAN">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <RESTRAINT NODE="10" TYPE="ANC"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const cleanReport = diagnoseInputXmlLinearModelHealth(clean);
assert.equal('status' in cleanReport, false, 'model-health report must not expose one ambiguous top-level status');
assert.equal(status(cleanReport, 'SOURCE_ACCEPTANCE'), 'PASS');
assert.equal(status(cleanReport, 'TOPOLOGY_ACCEPTANCE'), 'PASS');
assert.equal(status(cleanReport, 'STRICT_LINEAR_STATIC'), 'PASS');
assert.equal(status(cleanReport, 'APPROXIMATE_LINEAR_STATIC'), 'PASS');
assert.equal(status(cleanReport, 'SUSTAINED_CASE_STRICT'), 'CONDITIONAL');
assert.equal(status(cleanReport, 'CODE_STRESS_INPUT_READINESS'), 'CONDITIONAL');
assert.equal(status(cleanReport, 'THERMAL_AUTHORITY'), 'BLOCK');
assert.equal(status(cleanReport, 'OPERATING_CASE_STRICT'), 'BLOCK');
assert.equal(cleanReport.executionAvailability.strictSolveAuthorized, false);
assert.equal(cleanReport.executionAvailability.approximateSolveAuthorized, false);
assert.equal(
  diagnoseInputXmlLinearModelHealth(clean).semanticHash,
  cleanReport.semanticHash,
  'diagnostic replay must be deterministic',
);
console.log('✅ Clean straight-pipe/anchor representation passes without authorizing execution.');

const bend = parse(`<PIPINGMODEL JOBNAME="BEND">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="1000" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <BEND RADIUS="500" ANGLE1="90"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const bendReport = diagnoseInputXmlLinearModelHealth(bend);
assert.equal(status(bendReport, 'STRICT_LINEAR_STATIC'), 'BLOCK');
assert.equal(status(bendReport, 'APPROXIMATE_LINEAR_STATIC'), 'CONDITIONAL');
assert.ok(bendReport.findings.some((row) => row.code === 'MODEL_BEND_EXACT_MECHANICS_UNAVAILABLE'));
console.log('✅ Bend exact mechanics block strict representation and disclose the chord approximation separately.');

const unilateral = parse(`<PIPINGMODEL JOBNAME="UNILATERAL">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <RESTRAINT NODE="10" TYPE="+Y" XCOSINE="0" YCOSINE="1" ZCOSINE="0"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const unilateralReport = diagnoseInputXmlLinearModelHealth(unilateral);
assert.equal(status(unilateralReport, 'STRICT_LINEAR_STATIC'), 'BLOCK');
assert.equal(status(unilateralReport, 'APPROXIMATE_LINEAR_STATIC'), 'CONDITIONAL');
assert.ok(unilateralReport.findings.some((row) => row.code === 'MODEL_RESTRAINT_UNILATERAL_UNSUPPORTED'));
console.log('✅ Current +Y/+Z fixed linearization is conditional and never mislabeled as strict mechanics.');

const sentinelGap = parse(`<PIPINGMODEL JOBNAME="SENTINEL_GAP">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <RESTRAINT NODE="10" TYPE="+Y" XCOSINE="0" YCOSINE="1" ZCOSINE="0" GAP="-1.0101"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const sentinelGapReport = diagnoseInputXmlLinearModelHealth(sentinelGap);
assert.equal(status(sentinelGapReport, 'APPROXIMATE_LINEAR_STATIC'), 'CONDITIONAL');
assert.ok(!sentinelGapReport.findings.some((row) => row.code === 'MODEL_RESTRAINT_GAP_UNSUPPORTED'));
console.log('✅ CAESAR unset sentinels do not fabricate active gap mechanics.');

const missingDirection = parse(`<PIPINGMODEL JOBNAME="MISSING_DIRECTION">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <RESTRAINT NODE="10" TYPE="+Y"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const missingDirectionReport = diagnoseInputXmlLinearModelHealth(missingDirection);
assert.equal(status(missingDirectionReport, 'APPROXIMATE_LINEAR_STATIC'), 'BLOCK');
assert.ok(missingDirectionReport.findings.some((row) => row.code === 'MODEL_RESTRAINT_DIRECTION_INVALID'));
console.log('✅ A linearized unilateral restraint without valid direction evidence fails closed.');

const bilateral = parse(`<PIPINGMODEL JOBNAME="BILATERAL">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <RESTRAINT NODE="10" TYPE="X" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const bilateralReport = diagnoseInputXmlLinearModelHealth(bilateral);
assert.equal(status(bilateralReport, 'STRICT_LINEAR_STATIC'), 'BLOCK');
assert.equal(status(bilateralReport, 'APPROXIMATE_LINEAR_STATIC'), 'BLOCK');
assert.ok(bilateralReport.findings.some((row) => row.code === 'MODEL_RESTRAINT_TYPE_NOT_COMPILED'));
console.log('✅ Bilateral guides are reported as uncompiled instead of being overstated as exact.');

const duplicate = parse(`<PIPINGMODEL JOBNAME="DUPLICATE_RESTRAINT">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <RESTRAINT NODE="10" TYPE="+Y" XCOSINE="0" YCOSINE="1" ZCOSINE="0"/>
    <RESTRAINT NODE="10" TYPE="+Y" XCOSINE="0" YCOSINE="1" ZCOSINE="0"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const duplicateReport = diagnoseInputXmlLinearModelHealth(duplicate);
assert.ok(duplicateReport.findings.some((row) => row.code === 'MODEL_RESTRAINT_TARGET_DUPLICATE'));
assert.equal(status(duplicateReport, 'APPROXIMATE_LINEAR_STATIC'), 'BLOCK');
console.log('✅ Duplicate node/DOF restraint targets are detected before Map-based compilation can collapse them.');

const anchorOverlap = parse(`<PIPINGMODEL JOBNAME="ANCHOR_OVERLAP">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <RESTRAINT NODE="10" TYPE="ANC"/>
    <RESTRAINT NODE="10" TYPE="+Y" XCOSINE="0" YCOSINE="1" ZCOSINE="0"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const anchorOverlapReport = diagnoseInputXmlLinearModelHealth(anchorOverlap);
assert.ok(anchorOverlapReport.findings.some((row) => (
  row.code === 'MODEL_RESTRAINT_TARGET_DUPLICATE' && row.evidence.targetDof === 'UY'
)));
assert.equal(status(anchorOverlapReport, 'APPROXIMATE_LINEAR_STATIC'), 'BLOCK');
console.log('✅ Anchor/all-DOF custody is expanded before overlap detection.');

const unsupportedSif = parse(`<PIPINGMODEL JOBNAME="SIF">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5">
    <SIF NODE="20" TYPE="99" SIF_IN="1.2" SIF_OUT="1.3"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`);
const sifReport = diagnoseInputXmlLinearModelHealth(unsupportedSif);
assert.equal(status(sifReport, 'CODE_STRESS_INPUT_READINESS'), 'BLOCK');
assert.ok(sifReport.findings.some((row) => row.code === 'MODEL_SIF_TYPE_UNSUPPORTED'));
console.log('✅ Unsupported SIF type blocks code-input readiness without changing structural stiffness.');

const tampered = structuredClone(cleanReport);
tampered.summary.findingCount += 1;
assert.throws(
  () => requireInputXmlLinearModelHealth(tampered),
  /semantic hash mismatch/u,
);
const staleSource = parse(`<PIPINGMODEL JOBNAME="STALE">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="2000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5"/>
</PIPINGMODEL>`);
assert.throws(
  () => requireInputXmlLinearModelHealth(cleanReport, staleSource),
  /stale/u,
);
assert.throws(
  () => diagnoseInputXmlLinearModelHealth('<PIPINGMODEL/>'),
  /source bundle|schema/u,
);
console.log('✅ Report tampering, stale source evidence, and raw-text reparsing at the diagnostic boundary fail closed.');

console.log('\n✅ InputXML representability capability diagnostics passed.\n');

function parse(xmlText) {
  return parseInputXmlModelHealthSource(xmlText, ingestion);
}

function status(report, capabilityId) {
  return report.capabilities.find((row) => row.capabilityId === capabilityId)?.status;
}
