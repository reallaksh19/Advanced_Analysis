#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  BM2_BENCHMARK_CASE_AUTHORITY,
  BM2_CII_OUTPUT_PATH,
  BM2_REPORT_FAMILIES,
} from './lfea-b3.26-bm2-case-authority.mjs';
import { parseBm2CiiOutput } from './lfea-b3.26-bm2-output-comparison.mjs';

console.log('\n--- BM2 source and derived-case custody authority ---');

const source = readFileSync(BM2_CII_OUTPUT_PATH, 'utf8');
assert.equal(gitBlobSha(source), BM2_BENCHMARK_CASE_AUTHORITY.expectedOutputGitBlobSha);
const output = parseBm2CiiOutput(source);

assert.equal(output.benchmarkCaseAuthority, BM2_BENCHMARK_CASE_AUTHORITY);
assert.equal(output.expansionDerived, true);
assert.equal(
  output.caseCustody.OPE.actualCustody,
  'EXPLICIT_PHYSICAL_SOURCE_REPORT_LAST_OCCURRENCE_SELECTED',
);
assert.equal(
  output.caseCustody.SUS.actualCustody,
  'EXPLICIT_PHYSICAL_SOURCE_REPORT_LAST_OCCURRENCE_SELECTED',
);
assert.equal(
  output.caseCustody.EXP.actualCustody,
  'DERIVED_FROM_MATCHED_CASE_3_MINUS_CASE_4_ROWS',
);
assert.equal(output.caseCustody.EXP.sourceReportPresent, false);
assert.equal(output.caseCustody.EXP.formula, 'L6=L3-L4');

for (const family of BM2_REPORT_FAMILIES) {
  for (const label of ['OPE', 'SUS']) {
    const occurrence = output.sourceReportOccurrenceCustody[family][label];
    assert.equal(occurrence.physicalOccurrenceCount, 2);
    assert.equal(occurrence.selectedOccurrenceOrdinal, 1);
    assert.equal(occurrence.selectionRule, 'LAST_PHYSICAL_REPORT_OCCURRENCE');
    assert.equal(output[family].get(label).sourceReportOccurrenceOrdinal, 1);
  }
  assert.equal(output.sourceReportOccurrenceCustody[family].EXP.physicalOccurrenceCount, 0);
  assert.ok(output[family].has('EXP'));
  assert.equal(output[family].get('EXP').sourceReportRows, 0);
}
console.log('✅ Duplicate physical CASE 3/4 report sets are governed by exact last-occurrence custody.');

verifyNodeExpansion(output.displacement, ['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ']);
verifyNodeExpansion(output.restraint, ['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ'], true);
verifyElementExpansion(output.globalForce);
verifyElementExpansion(output.localForce);
console.log('✅ Every EXP row is a matched OPE-minus-SUS derivation with physical operand lineage.');

const selectedOccurrenceFixture = parseBm2CiiOutput(`<OUTPUT>
  ${fixtureReports('OPE', 100)}
  ${fixtureReports('SUS', 40)}
  ${fixtureReports('OPE', 5)}
  ${fixtureReports('SUS', 2)}
</OUTPUT>`);
assert.equal(selectedOccurrenceFixture.expansionDerived, true);
assert.equal(selectedOccurrenceFixture.displacement.get('OPE').rows[0].DX, 5);
assert.equal(selectedOccurrenceFixture.displacement.get('SUS').rows[0].DX, 2);
assert.equal(selectedOccurrenceFixture.displacement.get('EXP').rows[0].DX, 3);
assert.equal(
  selectedOccurrenceFixture.displacement.get('EXP').rows[0].derivation.leftPhysicalRowUid,
  'OPE:displacement:0:1:physical-report-occurrence:1',
);
console.log('✅ Derivation consumes the governed last physical OPE/SUS occurrences, not the first copies.');

const explicitFixture = parseBm2CiiOutput(`<OUTPUT>
  ${fixtureReports('OPE', 100)}
  ${fixtureReports('SUS', 40)}
  ${fixtureReports('OPE', 5)}
  ${fixtureReports('SUS', 2)}
  ${fixtureReports('EXP', 3)}
</OUTPUT>`);
assert.equal(explicitFixture.expansionDerived, false);
assert.equal(explicitFixture.caseCustody.EXP.actualCustody, 'EXPLICIT_SOURCE_REPORT');
assert.equal(explicitFixture.displacement.get('EXP').rows[0].DX, 3);
console.log('✅ A complete explicit CASE 6 EXP source remains explicit and is not overwritten.');

assert.throws(
  () => parseBm2CiiOutput(`<OUTPUT>
    ${fixtureReports('OPE', 100)}
    ${fixtureReports('SUS', 40)}
    ${fixtureReports('OPE', 5)}
    ${fixtureReports('SUS', 2)}
    ${fixtureDisplacement('EXP', 3)}
  </OUTPUT>`),
  /partial explicit EXP case/u,
);
console.log('✅ Partial explicit EXP custody is blocked instead of mixing source and derived families.');

assert.throws(
  () => parseBm2CiiOutput(`<OUTPUT>
    ${fixtureReports('OPE', 100)}
    ${fixtureReports('SUS', 40)}
    ${fixtureReports('OPE', 5)}
    ${fixtureReports('SUS', 2, '2')}
  </OUTPUT>`),
  /BM2 restraint .*EXP derivation is blocked/u,
);
console.log('✅ Selected OPE/SUS row-identity drift blocks derivation before arithmetic.');

assert.throws(
  () => parseBm2CiiOutput(`<OUTPUT>
    ${fixtureReports('OPE', 5)}
    ${fixtureReports('SUS', 2)}
  </OUTPUT>`),
  /physical report occurrence count 1 != 2/u,
);
console.log('✅ Missing duplicate physical report custody fails closed.');

assert.throws(
  () => parseBm2CiiOutput(`<OUTPUT>
    ${fixtureReports('OPE', 100)}
    ${fixtureReports('SUS', 40)}
    ${fixtureReports('OPE', 5, '1', 'CASE 1 (OPE) W+T1+P1')}
    ${fixtureReports('SUS', 2)}
  </OUTPUT>`),
  /outside retained case authority/u,
);
console.log('✅ Wrong numbered-case identity is rejected even when the category text matches.');

console.log(JSON.stringify({
  status: 'PASS',
  sourceGitBlobSha: BM2_BENCHMARK_CASE_AUTHORITY.expectedOutputGitBlobSha,
  cases: output.caseCustody,
  rows: {
    displacement: output.displacement.get('EXP').rows.length,
    restraint: output.restraint.get('EXP').rows.length,
    globalForce: output.globalForce.get('EXP').rows.length,
    localForce: output.localForce.get('EXP').rows.length,
  },
}, null, 2));
console.log('\n✅ BM2 source and derived-case custody authority passed.\n');

function verifyNodeExpansion(reportMap, fields, requireType = false) {
  const ope = index(reportMap.get('OPE').rows, nodeKey);
  const sus = index(reportMap.get('SUS').rows, nodeKey);
  const exp = reportMap.get('EXP').rows;
  assert.equal(exp.length, ope.size);
  assert.equal(exp.length, sus.size);
  for (const row of exp) {
    const left = ope.get(nodeKey(row));
    const right = sus.get(nodeKey(row));
    assert.ok(left && right, `Missing operands for ${nodeKey(row)}`);
    if (requireType) assert.equal(left.type, right.type);
    for (const field of fields) assert.equal(row[field], left[field] - right[field]);
    assert.equal(row.derivation.leftRowUid, left.rowUid);
    assert.equal(row.derivation.rightRowUid, right.rowUid);
    assert.equal(row.derivation.leftPhysicalRowUid, left.sourcePhysicalRowUid);
    assert.equal(row.derivation.rightPhysicalRowUid, right.sourcePhysicalRowUid);
    assert.equal(row.derivation.rule, 'MATCHED_ROW_OPE_MINUS_SUS_V2');
  }
}

function verifyElementExpansion(reportMap) {
  const ope = index(reportMap.get('OPE').rows, elementKey);
  const sus = index(reportMap.get('SUS').rows, elementKey);
  const exp = reportMap.get('EXP').rows;
  assert.equal(exp.length, ope.size);
  assert.equal(exp.length, sus.size);
  for (const row of exp) {
    const left = ope.get(elementKey(row));
    const right = sus.get(elementKey(row));
    assert.ok(left && right, `Missing operands for ${elementKey(row)}`);
    for (const end of ['I', 'J']) {
      for (const field of ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) {
        assert.equal(row[end][field], left[end][field] - right[end][field]);
      }
    }
    assert.equal(row.derivation.leftRowUid, left.rowUid);
    assert.equal(row.derivation.rightRowUid, right.rowUid);
    assert.equal(row.derivation.leftPhysicalRowUid, left.sourcePhysicalRowUid);
    assert.equal(row.derivation.rightPhysicalRowUid, right.sourcePhysicalRowUid);
  }
}

function index(rows, keyOf) {
  return new Map(rows.map((row) => [keyOf(row), row]));
}

function nodeKey(row) {
  return `${row.nodeId}|${row.occurrenceOrdinalWithinCaseFamilyAndPair}`;
}

function elementKey(row) {
  return `${row.reportFromNode}->${row.reportToNode}|${row.occurrenceOrdinalWithinCaseFamilyAndPair}`;
}

function fixtureReports(label, value, restraintNode = '1', loadcase = fixtureLoadcase(label)) {
  return `${fixtureDisplacement(label, value, loadcase)}
    <RESTRAINT_REPORT LOADCASE="${loadcase}">
      <RESTRAINT NODE="${restraintNode}" TYPE="+Y">
        <FORCES FX="${value}" FY="0" FZ="0"/>
        <MOMENTS MX="0" MY="0" MZ="0"/>
      </RESTRAINT>
    </RESTRAINT_REPORT>
    ${fixtureElementReport('GLOBAL_FORCE_REPORT', label, value, loadcase)}
    ${fixtureElementReport('LOCAL_FORCE_REPORT', label, value, loadcase)}`;
}

function fixtureLoadcase(label) {
  const authority = BM2_BENCHMARK_CASE_AUTHORITY.cases[label];
  return `CASE ${authority.caseNumber} (${authority.category}) ${authority.formula}`;
}

function fixtureDisplacement(label, value, loadcase = fixtureLoadcase(label)) {
  return `<DISPLACEMENT_REPORT LOADCASE="${loadcase}">
    <NODE NUMBER="1">
      <TRANSLATIONS DX="${value}" DY="0" DZ="0"/>
      <ROTATIONS RX="0" RY="0" RZ="0"/>
    </NODE>
  </DISPLACEMENT_REPORT>`;
}

function fixtureElementReport(tag, label, value, loadcase = fixtureLoadcase(label)) {
  return `<${tag} LOADCASE="${loadcase}">
    <ELEMENT FROM_NODE="1" TO_NODE="2">
      <FORCES>
        <FROM FX="${value}" FY="0" FZ="0"/>
        <TO FX="${-value}" FY="0" FZ="0"/>
      </FORCES>
      <MOMENTS>
        <FROM MX="0" MY="0" MZ="0"/>
        <TO MX="0" MY="0" MZ="0"/>
      </MOMENTS>
    </ELEMENT>
  </${tag}>`;
}

function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}
