#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { diagnoseInputXmlLoad } from '../src/core/geometry/adapters/inputxml-load-diagnostics.js';
import { DEFAULT_RESTRAINT_TYPE_CODE_MAP } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';

console.log('\n--- LFEA generic InputXML load diagnostics check ---');

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, code, `expected ${code}, received ${error?.code}`);
    return true;
  });
}

test('LD-01', 'rejects non-string and empty input', () => {
  assert.throws(() => diagnoseInputXmlLoad(null), TypeError);
  assert.throws(() => diagnoseInputXmlLoad(''), TypeError);
  assert.throws(() => diagnoseInputXmlLoad('   '), TypeError);
});

test('LD-02', 'BM1 real InputXML: all 12 restraint records resolve, +Y/GUI labels and dominant axes correct', () => {
  const xml = readFileSync(fileURLToPath(new URL('../benchmarks/LFEA/BM1/BM1_InputXML.xml', import.meta.url)), 'utf8');
  const report = diagnoseInputXmlLoad(xml, { fileName: 'BM1_InputXML.xml' });
  assert.equal(report.valid, true);
  assert.equal(report.criticalFindings.unresolvedRestraintCount, 0);
  assert.equal(report.topology.elements, 15);
  assert.equal(report.topology.bends, 2);
  assert.equal(report.topology.rigids, 3);
  const anchors = report.restraints.filter((row) => row.label === 'ANC');
  assert.deepEqual(anchors.map((row) => row.nodeId), ['10', '150']);
  const plusY = report.restraints.filter((row) => row.label === '+Y');
  assert.equal(plusY.length, 8);
  assert.ok(plusY.every((row) => row.dominantAxis === 'Y'));
  const gui = report.restraints.filter((row) => row.label === 'GUI');
  assert.deepEqual(gui.map((row) => row.nodeId), ['90', '120']);
  assert.ok(gui.every((row) => row.dominantAxis === 'X'));
});

test('LD-03', 'BM2 real InputXML: node 40 carries two independent restraints (+Y vertical, GUI lateral)', () => {
  const xml = readFileSync(fileURLToPath(new URL('../benchmarks/LFEA/BM2/Input_BM2.xml', import.meta.url)), 'utf8');
  const report = diagnoseInputXmlLoad(xml, { fileName: 'Input_BM2.xml' });
  assert.equal(report.valid, true);
  assert.equal(report.criticalFindings.unresolvedRestraintCount, 0);
  const node40 = report.restraints.filter((row) => row.nodeId === '40');
  assert.equal(node40.length, 2);
  assert.deepEqual(node40.map((row) => row.label).sort(), ['+Y', 'GUI']);
  const plusY = node40.find((row) => row.label === '+Y');
  assert.equal(plusY.dominantAxis, 'Y');
  assert.equal(plusY.yCosine, 1);
  const gui = node40.find((row) => row.label === 'GUI');
  assert.equal(gui.dominantAxis, 'X');
  assert.equal(gui.xCosine, 1);
  const node130 = report.restraints.find((row) => row.nodeId === '130');
  assert.equal(node130.label, '+Z');
  assert.equal(node130.dominantAxis, 'Z');
  const anchors = report.restraints.filter((row) => row.label === 'ANC').map((row) => row.nodeId);
  assert.deepEqual(anchors, ['10', '190', '240']);
});

test('LD-04', 'BM3 real InputXML: 3 restraints all resolved', () => {
  const xml = readFileSync(fileURLToPath(new URL('../benchmarks/LFEA/BM3/BM3_InputXML.xml', import.meta.url)), 'utf8');
  const report = diagnoseInputXmlLoad(xml, { fileName: 'BM3_InputXML.xml' });
  assert.equal(report.valid, true);
  assert.equal(report.criticalFindings.unresolvedRestraintCount, 0);
  assert.equal(report.restraints.length, 3);
});

test('LD-05', 'an unmapped restraint TYPE code stays UNKNOWN and is surfaced, never guessed', () => {
  const xml = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="T" NUMELT="1" NUMBEND="0" NUMRIGID="0" NUMREST="1"><PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="1.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="114.3" WALL_THICK="6" MATERIAL_NAME="A106 B"><RESTRAINT NUM="1" NODE="10.000000" TYPE="99.000000" STIFFNESS="-1.010100" GAP="-1.010100" FRIC_COEF="-1.010100" CNODE="-1.010100" XCOSINE="1.000000" YCOSINE="0.000000" ZCOSINE="0.000000" TAG="" GUID=""/></PIPINGELEMENT></PIPINGMODEL></CAESARII>';
  const report = diagnoseInputXmlLoad(xml, { unit: 'mm' });
  assert.equal(report.criticalFindings.unresolvedRestraintCount, 1);
  assert.equal(report.restraints[0].classification, 'UNKNOWN');
  assert.equal(report.restraints[0].label, null);
  assert.ok(report.diagnostics.some((row) => row.code === 'INPUTXML_RESTRAINT_TYPE_UNKNOWN'));
});

test('LD-06', 'caller-supplied restraintTypeCodeMap overrides are layered on the canonical default, not a full replacement', () => {
  const xml = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="T" NUMELT="1" NUMBEND="0" NUMRIGID="0" NUMREST="1"><PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="1.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="114.3" WALL_THICK="6" MATERIAL_NAME="A106 B"><RESTRAINT NUM="1" NODE="10.000000" TYPE="0.000000" STIFFNESS="-1.010100" GAP="-1.010100" FRIC_COEF="-1.010100" CNODE="-1.010100" XCOSINE="0.000000" YCOSINE="0.000000" ZCOSINE="0.000000" TAG="" GUID=""/></PIPINGELEMENT></PIPINGMODEL></CAESARII>';
  const report = diagnoseInputXmlLoad(xml, { unit: 'mm', restraintTypeCodeMap: { 99: 'GUIDE' } });
  assert.equal(report.restraintTypeCodeMap[0], DEFAULT_RESTRAINT_TYPE_CODE_MAP[0]);
  assert.equal(report.restraintTypeCodeMap[99], 'GUIDE');
});

test('LD-07', 'a header/actual count mismatch is a fatal diagnostic, never silently ignored', () => {
  const xml = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="T" NUMELT="5" NUMBEND="0" NUMRIGID="0" NUMREST="0"><PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="1.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="114.3" WALL_THICK="6" MATERIAL_NAME="A106 B"/></PIPINGMODEL></CAESARII>';
  const report = diagnoseInputXmlLoad(xml, { unit: 'mm' });
  assert.equal(report.valid, false);
  assert.ok(report.errorCount > 0);
  assert.ok(report.diagnostics.some((row) => row.code === 'INPUTXML_HEADER_COUNT_MISMATCH'));
});

console.log('LFEA generic InputXML load diagnostics check PASS.');
