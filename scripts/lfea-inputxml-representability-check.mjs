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

test('MH-RP-01', 'clean straight pipe is structurally preparable', () => {
  const context = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000)]), { fileName: 'clean.xml' });
  assert.equal(context.report.summary.strictLinearStaticStatus, 'PASS');
  assert.equal(context.report.summary.approximateLinearStaticStatus, 'PASS');
  assert.equal(context.report.summary.sustainedStrictStatus, 'PASS');
  assert.equal(context.report.summary.operatingStrictStatus, 'BLOCK');
  assert.equal(Object.hasOwn(context.report, 'status'), false);
  assert.equal(
    context.report.executionAvailability.STRICT_INPUTXML_LINEAR_STATIC_V1,
    'STRUCTURAL_PREPARATION_AVAILABLE_LOAD_CUSTODY_NOT_IMPLEMENTED',
  );
});

test('MH-RP-02', 'unilateral restraint blocks strict and conditions approximation', () => {
  const inner = '<RESTRAINT NODE="10" TYPE="17" XCOSINE="0" YCOSINE="1" ZCOSINE="0" STIFFNESS="-1.0101"/>';
  const report = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000, inner)], { restraints: 1 }), {}).report;
  assert.equal(report.summary.strictLinearStaticStatus, 'BLOCK');
  assert.equal(report.summary.approximateLinearStaticStatus, 'CONDITIONAL');
  const row = finding(report, 'MODEL_RESTRAINT_UNILATERAL_UNSUPPORTED');
  assert.equal(row.capabilityEffects.STRICT_LINEAR_STATIC.disposition, 'BLOCK');
  assert.equal(row.capabilityEffects.APPROXIMATE_LINEAR_STATIC.limitationCode, 'GENERIC_APPROX_UNILATERAL_LINEARIZED');
});

test('MH-RP-03', 'bend and reducer substitutions remain explicit', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(model([
    element(10, 20, 1000, '<BEND RADIUS="300"/>'),
    element(20, 30, 1000, '<REDUCER DIAMETERS2="80" THICKNESS2="4"/>'),
  ], { bends: 1 }), {}).report;
  assert.ok(finding(report, 'MODEL_BEND_EXACT_MECHANICS_UNAVAILABLE'));
  assert.ok(finding(report, 'MODEL_REDUCER_EXACT_MECHANICS_UNAVAILABLE'));
  assert.equal(report.summary.strictLinearStaticStatus, 'BLOCK');
  assert.equal(report.summary.approximateLinearStaticStatus, 'CONDITIONAL');
});

test('MH-RP-04', 'gap, friction, CNode and finite stiffness block both profiles', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(model([
    element(10, 20, 1000, '<RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0" GAP="2"/><RESTRAINT NODE="20" TYPE="2" XCOSINE="0" YCOSINE="1" ZCOSINE="0" FRIC_COEF="0.1"/>'),
    element(20, 30, 1000, '<RESTRAINT NODE="30" TYPE="3" XCOSINE="0" YCOSINE="0" ZCOSINE="1" CNODE="99"/>'),
    element(30, 40, 1000, '<RESTRAINT NODE="40" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0" STIFFNESS="1000"/>'),
  ], { restraints: 4 }), {}).report;
  for (const code of ['MODEL_RESTRAINT_GAP_UNSUPPORTED', 'MODEL_RESTRAINT_FRICTION_UNSUPPORTED', 'MODEL_RESTRAINT_CONNECTING_NODE_UNSUPPORTED', 'MODEL_RESTRAINT_FINITE_STIFFNESS_UNSUPPORTED']) assert.ok(finding(report, code));
  assert.equal(report.summary.approximateLinearStaticStatus, 'BLOCK');
});

test('MH-RP-05', 'unsupported active records are never omitted', () => {
  const inner = '<HANGER NODE="10" HGR_TABLE="1" LOAD_VAR="25"/><FORCESMOMENTS NODE_NUM="20" FORCMNT_NUM="1"><VECTOR NUMBER="1" FX="100" FY="0" FZ="0" MX="0" MY="0" MZ="0"/></FORCESMOMENTS><DISPLACEMENT NODE="20" DX="1"/><MYSTERY VALUE="7"/>';
  const report = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000, inner)]), {}).report;
  for (const code of ['MODEL_HANGER_UNSUPPORTED', 'MODEL_NODAL_FORCE_VECTOR_NOT_COMPILED', 'MODEL_PRESCRIBED_MOVEMENT_NOT_COMPILED', 'MODEL_UNKNOWN_ACTIVE_SOURCE_RECORD']) assert.ok(finding(report, code));
});

test('MH-RP-06', 'duplicate restraint DOF declarations block before compilation', () => {
  const inner = '<RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/><RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/>';
  const report = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000, inner)], { restraints: 2 }), {}).report;
  assert.equal(finding(report, 'MODEL_RESTRAINT_DUPLICATE_DOF_DECLARATION').entities.sourceFeatureIds.length, 2);
});

test('MH-RP-07', 'multiple material states are ready for per-element binding', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(model([
    element(10, 20, 1000),
    '<PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A334" MATERIAL_NUM="360" MODULUS="190000" POISSONS="0.3" PIPE_DENSITY="7850"/>',
  ]), {}).report;
  assert.equal(finding(report, 'MODEL_PER_ELEMENT_MATERIAL_BINDING_REQUIRED'), undefined);
  assert.equal(report.summary.strictLinearStaticStatus, 'PASS');
  assert.equal(report.summary.approximateLinearStaticStatus, 'PASS');
});

test('MH-RP-08', 'pressure structural effects remain a strict block', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000, '', 'PRESSURE1="2"')]), {}).report;
  assert.equal(finding(report, 'MODEL_PRESSURE_STRUCTURAL_EFFECT_UNDECLARED').capabilityEffects.STRICT_LINEAR_STATIC.disposition, 'BLOCK');
});

test('MH-RP-09', 'report is deterministic, tamper-evident and stale-bound', () => {
  const first = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000)]), {});
  const second = diagnoseInputXmlLinearModelHealth(first.sourceBundle, { topologyReport: first.topology });
  assert.equal(first.report.semanticHash, second.semanticHash);
  requireInputXmlLinearModelHealth(first.report, first.sourceBundle, first.topology);
  assert.throws(() => requireInputXmlLinearModelHealth({ ...first.report, summary: { ...first.report.summary, findingCount: 99 } }));
  const other = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 999)]), {});
  assert.throws(() => requireInputXmlLinearModelHealth(first.report, other.sourceBundle, first.topology));
});

test('MH-RP-10', 'context and compatibility alias retain one source bundle', () => {
  const xml = model([element(10, 20, 1000)]);
  const current = diagnoseInputXmlLinearModelHealthContext(xml, { fileName: 'same.xml' });
  const alias = diagnoseInputXmlModelHealthSource(xml, { fileName: 'same.xml' });
  assert.equal(current.sourceBundleSemanticHash, current.report.sourceBundleSemanticHash);
  assert.equal(current.report.semanticHash, alias.report.semanticHash);
});

test('MH-RP-11', 'source count mismatch propagates through dependencies', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000)], { elements: 2 }), {}).report;
  assert.ok(finding(report, 'INPUTXML_HEADER_COUNT_MISMATCH'));
  assert.equal(capability(report, 'SOURCE_ACCEPTANCE').status, 'BLOCK');
  assert.equal(report.summary.strictLinearStaticStatus, 'BLOCK');
});

test('MH-RP-12', 'anchor without direction cosines retains exact six-DOF custody', () => {
  const report = diagnoseInputXmlLinearModelHealthContext(model([element(10, 20, 1000, '<RESTRAINT NODE="10" TYPE="0" STIFFNESS="-1.0101"/>')], { restraints: 1 }), {}).report;
  assert.equal(report.summary.strictLinearStaticStatus, 'PASS');
  assert.equal(finding(report, 'MODEL_RESTRAINT_SOURCE_INVALID'), undefined);
});

test('MH-RP-13', 'unknown thermal material blocks operating authority only', () => {
  const xml = model(['<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="UNKNOWN" MATERIAL_NUM="999" MODULUS="200000" POISSONS="0.3" PIPE_DENSITY="7850" TEMP_EXP_C1="100"/>']);
  const report = diagnoseInputXmlLinearModelHealthContext(xml, {}).report;
  assert.equal(capability(report, 'STRICT_LINEAR_STATIC').status, 'PASS');
  assert.equal(capability(report, 'THERMAL_AUTHORITY').status, 'BLOCK');
  assert.equal(capability(report, 'SUSTAINED_CASE_STRICT').status, 'PASS');
  assert.equal(capability(report, 'OPERATING_CASE_STRICT').status, 'BLOCK');
  assert.ok(finding(report, 'MODEL_THERMAL_EXPANSION_AUTHORITY_UNRESOLVED'));
});

console.log('LFEA InputXML representability and capability check PASS.');
