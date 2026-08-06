import assert from 'node:assert/strict';
import {
  diagnoseInputXmlLinearModelHealth,
  diagnoseInputXmlLinearModelHealthContext,
  diagnoseInputXmlModelHealthSource,
} from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';
import { requireInputXmlLinearModelHealth } from '../src/core/linear-piping-analysis-consumer/inputxml-model-health-contract.js';

console.log('\n--- LFEA InputXML representability and capability check ---');

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
    `<PIPINGMODEL xmlns="" JOBNAME="MH" NUMELT="${counts.elements ?? elements.length}" NUMBEND="${counts.bends ?? 0}" NUMRIGID="${counts.rigids ?? 0}" NUMREST="${counts.restraints ?? 0}">`,
    UNITS,
    ...elements,
    '</PIPINGMODEL></CAESARII>',
  ].join('');
}

function element(from, to, dx, inner = '', fields = '') {
  return `<PIPINGELEMENT FROM_NODE="${from}" TO_NODE="${to}" DELTA_X="${dx}" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="106" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" ${fields}>${inner}</PIPINGELEMENT>`;
}

function capability(report, id) {
  return report.capabilities.find((row) => row.capabilityId === id);
}

function finding(report, code) {
  return report.findings.find((row) => row.code === code);
}

test('MH-RP-01', 'a clean straight-pipe source passes strict and approximate sustained representability', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000)]), { fileName: 'clean.xml' });
  assert.equal(context.report.summary.strictLinearStaticStatus, 'PASS');
  assert.equal(context.report.summary.approximateLinearStaticStatus, 'PASS');
  assert.equal(context.report.summary.sustainedStrictStatus, 'PASS');
  assert.equal(context.report.summary.operatingStrictStatus, 'BLOCK');
  assert.equal(capability(context.report, 'OPERATING_CASE_STRICT').ownStatus, 'BLOCK');
  assert.equal(Object.hasOwn(context.report, 'status'), false);
  assert.equal(context.report.executionAvailability.STRICT_INPUTXML_LINEAR_STATIC_V1, 'PROFILE_SPECIFIC_PREPARATION_NOT_IMPLEMENTED');
});

test('MH-RP-02', 'a unilateral restraint blocks strict mechanics and conditionally permits the disclosed approximation', () => {
  const restraint = '<RESTRAINT NODE="10" TYPE="17" XCOSINE="0" YCOSINE="1" ZCOSINE="0" STIFFNESS="-1.0101"/>';
  const report = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, restraint)], { restraints: 1 }),
    {},
  ).report;
  assert.equal(report.summary.strictLinearStaticStatus, 'BLOCK');
  assert.equal(report.summary.approximateLinearStaticStatus, 'CONDITIONAL');
  assert.equal(report.summary.sustainedStrictStatus, 'BLOCK');
  assert.equal(report.summary.sustainedApproximateStatus, 'CONDITIONAL');
  const row = finding(report, 'MODEL_RESTRAINT_UNILATERAL_UNSUPPORTED');
  assert.equal(row.capabilityEffects.STRICT_LINEAR_STATIC.disposition, 'BLOCK');
  assert.equal(row.capabilityEffects.APPROXIMATE_LINEAR_STATIC.disposition, 'CONDITIONAL');
  assert.equal(row.capabilityEffects.APPROXIMATE_LINEAR_STATIC.limitationCode, 'GENERIC_APPROX_UNILATERAL_LINEARIZED');
});

test('MH-RP-03', 'bends and reducers are explicit strict blocks and approximation limitations', () => {
  const bend = '<BEND RADIUS="300"/>';
  const reducer = '<REDUCER DIAMETERS2="80" THICKNESS2="4"/>';
  const report = diagnoseInputXmlLinearModelHealthContext(model([
    element(10, 20, 1000, bend),
    element(20, 30, 1000, reducer),
  ], { bends: 1 }), {}).report;
  assert.ok(finding(report, 'MODEL_BEND_EXACT_MECHANICS_UNAVAILABLE'));
  assert.ok(finding(report, 'MODEL_REDUCER_EXACT_MECHANICS_UNAVAILABLE'));
  assert.equal(report.summary.strictLinearStaticStatus, 'BLOCK');
  assert.equal(report.summary.approximateLinearStaticStatus, 'CONDITIONAL');
  const limitationCodes = capability(report, 'APPROXIMATE_LINEAR_STATIC').limitationCodes;
  assert.ok(limitationCodes.includes('GENERIC_APPROX_BEND_STRAIGHT_CHORD'));
  assert.ok(limitationCodes.includes('GENERIC_APPROX_REDUCER_UNIFORM_SECTION'));
});

test('MH-RP-04', 'gap, friction, connecting-node and finite-stiffness restraints block both profiles', () => {
  const rows = [
    '<RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0" GAP="2"/>',
    '<RESTRAINT NODE="20" TYPE="2" XCOSINE="0" YCOSINE="1" ZCOSINE="0" FRIC_COEF="0.1"/>',
    '<RESTRAINT NODE="30" TYPE="3" XCOSINE="0" YCOSINE="0" ZCOSINE="1" CNODE="99"/>',
    '<RESTRAINT NODE="40" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0" STIFFNESS="1000"/>',
  ];
  const report = diagnoseInputXmlLinearModelHealthContext(model([
    element(10, 20, 1000, rows[0] + rows[1]),
    element(20, 30, 1000, rows[2]),
    element(30, 40, 1000, rows[3]),
  ], { restraints: 4 }), {}).report;
  for (const code of [
    'MODEL_RESTRAINT_GAP_UNSUPPORTED',
    'MODEL_RESTRAINT_FRICTION_UNSUPPORTED',
    'MODEL_RESTRAINT_CONNECTING_NODE_UNSUPPORTED',
    'MODEL_RESTRAINT_FINITE_STIFFNESS_UNSUPPORTED',
  ]) assert.ok(finding(report, code), code);
  assert.equal(report.summary.strictLinearStaticStatus, 'BLOCK');
  assert.equal(report.summary.approximateLinearStaticStatus, 'BLOCK');
});

test('MH-RP-05', 'active loads and mechanics with no generic compiler are never silently omitted', () => {
  const active = [
    '<HANGER NODE="10" HGR_TABLE="1" LOAD_VAR="25"/>',
    '<FORCESMOMENTS NODE_NUM="20" FORCMNT_NUM="1"><VECTOR NUMBER="1" FX="100" FY="0" FZ="0" MX="0" MY="0" MZ="0"/></FORCESMOMENTS>',
    '<DISPLACEMENT NODE="20" DX="1"/>',
    '<MYSTERY VALUE="7"/>',
  ].join('');
  const report = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000, active)]), {}).report;
  for (const code of [
    'MODEL_HANGER_UNSUPPORTED',
    'MODEL_NODAL_FORCE_VECTOR_NOT_COMPILED',
    'MODEL_PRESCRIBED_MOVEMENT_NOT_COMPILED',
    'MODEL_UNKNOWN_ACTIVE_SOURCE_RECORD',
  ]) assert.ok(finding(report, code), code);
  assert.equal(report.summary.approximateLinearStaticStatus, 'BLOCK');
});

test('MH-RP-06', 'duplicate source restraints are detected before Map-based constraint collapse', () => {
  const duplicated = [
    '<RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/>',
    '<RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/>',
  ].join('');
  const report = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, duplicated)], { restraints: 2 }),
    {},
  ).report;
  const row = finding(report, 'MODEL_RESTRAINT_DUPLICATE_DOF_DECLARATION');
  assert.ok(row);
  assert.equal(row.entities.sourceFeatureIds.length, 2);
  assert.equal(row.capabilityEffects.APPROXIMATE_LINEAR_STATIC.disposition, 'BLOCK');
});

test('MH-RP-07', 'multiple material states block strict binding and disclose the current single-state approximation', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(model([
    element(10, 20, 1000),
    '<PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A334" MATERIAL_NUM="360" MODULUS="190000" POISSONS="0.3" PIPE_DENSITY="7850"/>',
  ]), {}).report;
  const row = finding(report, 'MODEL_PER_ELEMENT_MATERIAL_BINDING_REQUIRED');
  assert.ok(row);
  assert.equal(row.capabilityEffects.STRICT_LINEAR_STATIC.disposition, 'BLOCK');
  assert.equal(row.capabilityEffects.APPROXIMATE_LINEAR_STATIC.limitationCode, 'GENERIC_APPROX_SINGLE_MATERIAL_STATE');
});

test('MH-RP-08', 'nonzero pressure blocks strict structural completeness and is conditional only in the disclosed profile', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, '', 'PRESSURE1="2"')]),
    {},
  ).report;
  const row = finding(report, 'MODEL_PRESSURE_STRUCTURAL_EFFECT_UNDECLARED');
  assert.ok(row);
  assert.equal(row.capabilityEffects.STRICT_LINEAR_STATIC.disposition, 'BLOCK');
  assert.equal(row.capabilityEffects.APPROXIMATE_LINEAR_STATIC.limitationCode, 'GENERIC_APPROX_PRESSURE_CODE_ONLY');
});

test('MH-RP-09', 'report identity is deterministic, tamper-evident and stale-source bound', () => {
  const first = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000)]), {});
  const second = diagnoseInputXmlLinearModelHealth(first.sourceBundle, { topologyReport: first.topology });
  assert.equal(first.report.semanticHash, second.semanticHash);
  assert.equal(first.report.evidenceHash, second.evidenceHash);
  requireInputXmlLinearModelHealth(first.report, first.sourceBundle, first.topology);
  assert.throws(() => requireInputXmlLinearModelHealth({ ...first.report, summary: { ...first.report.summary, findingCount: 99 } }));
  const other = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 999)]), {});
  assert.throws(() => requireInputXmlLinearModelHealth(first.report, other.sourceBundle, first.topology));
  assert.ok(first.report.findings.every((row) => row.findingId.split(':').length >= 4));
});

test('MH-RP-10', 'the consumer context retains one source bundle and the compatibility alias returns the same contract', () => {
  const xml = model([element(10, 20, 1000)]);
  const current = diagnoseInputXmlLinearModelHealthContext(xml, { fileName: 'same.xml' });
  const alias = diagnoseInputXmlModelHealthSource(xml, { fileName: 'same.xml' });
  assert.equal(current.sourceBundleSemanticHash, current.report.sourceBundleSemanticHash);
  assert.equal(current.topology.semanticHash, current.report.topologySemanticHash);
  assert.equal(current.report.semanticHash, alias.report.semanticHash);
});

test('MH-RP-11', 'declared-count mismatch blocks source acceptance and all dependent solve capabilities', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000)], { elements: 2 }),
    {},
  ).report;
  assert.ok(finding(report, 'INPUTXML_HEADER_COUNT_MISMATCH'));
  assert.equal(capability(report, 'SOURCE_ACCEPTANCE').status, 'BLOCK');
  assert.equal(report.summary.strictLinearStaticStatus, 'BLOCK');
  assert.equal(report.summary.approximateLinearStaticStatus, 'BLOCK');
});


test('MH-RP-12', 'an anchor without direction cosines remains exact bilateral six-DOF custody', () => {
  const anchor = '<RESTRAINT NODE="10" TYPE="0" STIFFNESS="-1.0101"/>';
  const report = diagnoseInputXmlLinearModelHealthContext(
    model([element(10, 20, 1000, anchor)], { restraints: 1 }),
    {},
  ).report;
  assert.equal(report.summary.strictLinearStaticStatus, 'PASS');
  assert.equal(report.summary.approximateLinearStaticStatus, 'PASS');
  assert.equal(finding(report, 'MODEL_RESTRAINT_SOURCE_INVALID'), undefined);
});

console.log('LFEA InputXML representability and capability check PASS.');
