#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  inputXmlToCanonicalGeometry,
  parseInputXmlSourceBundle,
} from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import { diagnoseInputXmlLoad } from '../src/core/geometry/adapters/inputxml-load-diagnostics.js';
import { DEFAULT_RESTRAINT_TYPE_CODE_MAP } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';

console.log('\n--- LFEA generic InputXML load diagnostics check ---');

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
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

test('LD-08', 'one parsed source bundle owns geometry, inheritance, sentinels and child-feature custody', () => {
  const units = [
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
  const xml = [
    '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input">',
    '<PIPINGMODEL xmlns="" JOBNAME="BUNDLE" NUMELT="2" NUMBEND="0" NUMRIGID="0" NUMREST="1">',
    units,
    '<PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0" DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106" MATERIAL_NUM="1" MODULUS="200000" POISSONS="0.3" TEMP_EXP_C1="100" PRESSURE1="2" PIPE_DENSITY="7850" FLUID_DENSITY="1000" INSUL_THICK="20" INSUL_DENSITY="120" CORR_ALLOW="1">',
    '<RESTRAINT NODE="10" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0" STIFFNESS="-1.0101" GAP="2" FRIC_COEF="0.1" CNODE="99"/>',
    '<REDUCER DIAMETERS2="80" THICKNESS2="4" ALPHA="10" R1="2" R2="3" L1="4" L2="5"/>',
    '<FORCESMOMENTS NODE_NUM="20" FORCMNT_NUM="1"><VECTOR NUMBER="1" FX="100" FY="0" FZ="0" MX="0" MY="10" MZ="0"/></FORCESMOMENTS>',
    '<MYSTERY VALUE="7"/>',
    '</PIPINGELEMENT>',
    '<PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="500" DELTA_Y="0" DELTA_Z="0" TEMP_EXP_C1="-1.0101"/>',
    '</PIPINGMODEL></CAESARII>',
  ].join('');

  const first = parseInputXmlSourceBundle(xml, { fileName: 'bundle.xml' });
  const second = parseInputXmlSourceBundle(xml, { fileName: 'bundle.xml' });
  const renamed = parseInputXmlSourceBundle(xml, { fileName: 'renamed.xml' });
  assert.equal(first.semanticHash, second.semanticHash);
  assert.equal(first.evidenceHash, second.evidenceHash);
  assert.equal(first.semanticHash, renamed.semanticHash);
  assert.notEqual(first.evidenceHash, renamed.evidenceHash);
  assert.equal(first.source.sourceSemanticHash, renamed.source.sourceSemanticHash);
  assert.equal(first.schema, 'fea-inputxml-source-bundle/v1');
  assert.equal(first.elementRecords.length, 2);
  assert.equal(first.source.declaredCounts.elements, 2);
  assert.equal(first.elementRecords[0].sourceElementIndex, 0);
  assert.equal(first.elementRecords[0].sourceElementNumber, 1);
  assert.equal(first.elementRecords[0].sourcePath, 'PIPINGMODEL/PIPINGELEMENT[0]');
  assert.equal(first.elementRecords[0].fields.diameter.canonicalValue, 0.1);
  assert.equal(first.elementRecords[1].fields.diameter.declaration.inherited, true);
  assert.equal(first.elementRecords[1].fields.diameter.declaration.inheritedFromElementIndex, 0);
  const inheritedT1 = first.sourceRecords.temperatureSets.find((row) => row.sourceElementIndex === 1 && row.setNumber === 1);
  assert.equal(inheritedT1.sentinel.kind, 'UNSET');
  assert.equal(inheritedT1.declaration.inherited, true);
  assert.equal(inheritedT1.declaration.inheritedFromElementIndex, 0);
  const reducer = first.sourceRecords.reducers[0];
  assert.equal(reducer.sourceFeatureId, 'IXF:REDUCER:E0:R0');
  assert.equal(reducer.diameter2.canonicalValue, 0.08);
  assert.equal(reducer.thickness2.canonicalValue, 0.004);
  const restraint = first.sourceRecords.restraints[0];
  assert.equal(restraint.sourceFeatureId, 'IXF:RESTRAINT:E0:R0');
  assert.equal(restraint.gap.canonicalValue, 0.002);
  assert.equal(restraint.connectingNodeId, '99');
  assert.equal(restraint.connectingNode.rawText, '99');
  assert.equal(restraint.connectingNode.sentinel.matched, false);
  assert.equal(first.sourceRecords.forcesMoments[0].vectors[0].force.fx.canonicalValue, 100);
  assert.equal(first.sourceRecords.unknownActiveRecords[0].tagName, 'MYSTERY');
  assert.deepEqual(inputXmlToCanonicalGeometry(xml), first.geometry);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.sourceRecords));
});

test('LD-09', 'load diagnostics retain the same parsed source bundle and source identity', () => {
  const xml = '<CAESARII xmlns="COADE" VERSION="14.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="T" NUMELT="1" NUMBEND="0" NUMRIGID="0" NUMREST="0"><PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1" DELTA_Y="0" DELTA_Z="0" DIAMETER="114.3" WALL_THICK="6" MATERIAL_NAME="A106 B"/></PIPINGMODEL></CAESARII>';
  const report = diagnoseInputXmlLoad(xml, { unit: 'mm', fileName: 'one.xml' });
  assert.equal(report.sourceSemanticHash, report.sourceBundle.source.sourceSemanticHash);
  assert.equal(report.geometry, report.sourceBundle.geometry);
  assert.equal(report.sourceBundle.elementRecords.length, 1);
});

console.log('LFEA generic InputXML load diagnostics check PASS.');
