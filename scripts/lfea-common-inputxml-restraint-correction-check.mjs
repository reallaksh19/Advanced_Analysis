#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_AUTHORITY,
  CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE,
  CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
  CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_SCHEMA,
  DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS,
  defaultRestraintTypeMutationConfig,
  mutateRestraintType,
  resolveRestraintTypeMutation,
} from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';

const BENCHMARKS = Object.freeze([
  Object.freeze({
    id: 'BM1',
    path: fileURLToPath(new URL('../benchmarks/LFEA/BM1/BM1_InputXML.xml', import.meta.url)),
  }),
  Object.freeze({
    id: 'BM2',
    path: fileURLToPath(new URL('../benchmarks/LFEA/BM2/Input_BM2.xml', import.meta.url)),
  }),
  Object.freeze({
    id: 'BM3',
    path: fileURLToPath(new URL('../benchmarks/LFEA/BM3/BM3_InputXML.xml', import.meta.url)),
  }),
]);

const CORRECTED_TYPE_MAP = Object.freeze({
  0: 'ANCHOR',
  2: 'GUIDE',
  3: 'GUIDE',
  5: 'GUIDE',
  8: 'GUIDE',
  9: 'GUIDE',
  14: 'GUIDE',
  15: 'GUIDE',
});

const EXPECTED_ROWS = Object.freeze([
  Object.freeze({ label: '+Y', from: '17', to: '14' }),
  Object.freeze({ label: 'GUI', from: '7', to: '9' }),
  Object.freeze({ label: 'GUI', from: '10', to: '9' }),
  Object.freeze({ label: 'X', from: '1', to: '2' }),
  Object.freeze({ label: 'Y', from: '2', to: '3' }),
  Object.freeze({ label: 'Z', from: '3', to: '5' }),
  Object.freeze({ label: '', from: '18', to: '15' }),
]);

console.log('\n--- Common CAESAR InputXML restraint TYPE export correction ---');

assert.equal(
  CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_SCHEMA,
  'caesar-inputxml-restraint-type-correction/v1',
);
assert.equal(
  CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
  'CAESAR_INPUTXML_RESTRAINT_TYPE_EXPORT_CORRECTION_V1',
);
assert.equal(
  CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_AUTHORITY,
  'PROJECT_CONTROLLED_CAESAR_INPUTXML_EXPORT_DEFECT_CORRECTION',
);
assert.equal(CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE.requiredForGovernedBenchmarks, true);
assert.deepEqual(DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS, EXPECTED_ROWS);
assert.deepEqual(CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE.rows, EXPECTED_ROWS);

const defaultConfig = defaultRestraintTypeMutationConfig();
assert.equal(defaultConfig.enabled, true, 'the governed correction must be enabled by default');
assert.deepEqual(defaultConfig.rows, EXPECTED_ROWS);

for (const row of EXPECTED_ROWS) {
  const evidence = resolveRestraintTypeMutation(row.from);
  assert.equal(evidence.profileId, CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID);
  assert.equal(evidence.sourceTypeCode, row.from);
  assert.equal(evidence.correctedTypeCode, row.to);
  assert.equal(evidence.mutationEnabled, true);
  assert.equal(evidence.mutationMatched, true);
  assert.equal(evidence.mutationApplied, true);
  assert.equal(evidence.mutationLabel, row.label);
  assert.equal(evidence.mutationRuleId, `CAESAR_EXPORT_FIX_${row.from}_TO_${row.to}`);
}

assert.equal(mutateRestraintType('1'), '2', 'one source row is applied exactly once');
assert.notEqual(mutateRestraintType('1'), '5', 'the correction must not chain 1 -> 2 -> 3 -> 5');
assert.equal(resolveRestraintTypeMutation('17.000000').sourceTypeCode, '17');
assert.equal(resolveRestraintTypeMutation('17.000000').correctedTypeCode, '14');
assert.equal(resolveRestraintTypeMutation('14').mutationMatched, false);
assert.equal(resolveRestraintTypeMutation('14').correctedTypeCode, '14');
assert.equal(resolveRestraintTypeMutation(null).correctedTypeCode, null);

const disabled = resolveRestraintTypeMutation('17', { ...defaultConfig, enabled: false });
assert.equal(disabled.mutationEnabled, false);
assert.equal(disabled.mutationMatched, true);
assert.equal(disabled.mutationApplied, false);
assert.equal(disabled.correctedTypeCode, '17');

let totalRecords = 0;
let totalCorrected = 0;
const summaries = [];

for (const benchmark of BENCHMARKS) {
  const xmlText = readFileSync(benchmark.path, 'utf8');
  const geometry = inputXmlToCanonicalGeometry(xmlText, {
    unit: 'mm',
    source: `CAESAR-II-${benchmark.id}-INPUTXML-CORRECTION-CHECK`,
    restraintTypeCodeMap: CORRECTED_TYPE_MAP,
    bendRadiusTolerance: 1e-6,
  });
  const records = geometry.nodes.flatMap((node) => (node.meta?.restraints ?? []).map((record) => ({
    benchmarkId: benchmark.id,
    nodeId: node.id,
    ...record,
  })));
  assert.ok(records.length > 0, `${benchmark.id} must retain active restraint records`);

  for (const record of records) {
    const expected = resolveRestraintTypeMutation(record.sourceTypeCode);
    assert.equal(
      record.typeCode,
      expected.correctedTypeCode,
      `${benchmark.id} node ${record.nodeId} must classify the corrected TYPE`,
    );
    assert.equal(
      record.mutationApplied,
      expected.mutationApplied,
      `${benchmark.id} node ${record.nodeId} must disclose whether correction was applied`,
    );
    if (expected.mutationMatched) {
      assert.equal(record.mutationApplied, true, `${benchmark.id} matched correction cannot remain unapplied`);
    }
  }

  const corrected = records.filter((record) => record.mutationApplied);
  const diagnostics = geometry.diagnostics.filter(
    (row) => row.code === 'INPUTXML_RESTRAINT_TYPE_MUTATED',
  );
  assert.equal(
    diagnostics.length,
    corrected.length,
    `${benchmark.id} must emit one mutation diagnostic per corrected active restraint`,
  );

  totalRecords += records.length;
  totalCorrected += corrected.length;
  summaries.push(Object.freeze({
    benchmark: benchmark.id,
    records: records.length,
    corrected: corrected.length,
    sourceTypes: [...new Set(records.map((record) => record.sourceTypeCode))].sort(),
    correctedTypes: [...new Set(records.map((record) => record.typeCode))].sort(),
  }));
}

assert.ok(totalRecords > 0);
assert.ok(totalCorrected > 0, 'the governed benchmark set must exercise at least one correction row');

console.log(JSON.stringify({
  profileId: CAESAR_INPUTXML_RESTRAINT_TYPE_CORRECTION_PROFILE_ID,
  totalRecords,
  totalCorrected,
  benchmarks: summaries,
}, null, 2));
console.log('SOURCE_CORRECTION_CONTRACT: PASS');
console.log('BENCHMARK_PARITY: NOT_EVALUATED_BY_THIS_CHECK');
