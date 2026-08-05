#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import {
  CANONICAL_RESTRAINT_TYPE_CODES,
  DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS,
  defaultRestraintTypeMutationConfig,
  mutateRestraintType,
  normalizeRestraintTypeMutationRows,
  resolveRestraintTypeMutation,
  restraintTypeToCaesarCode,
} from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = resolve(ROOT, 'reports/m030-inputxml-restraint-mutation.json');

const OWNER_CONFIRMED_ROWS = Object.freeze([
  Object.freeze({ label: '+Y', from: '17', to: '14' }),
  Object.freeze({ label: 'LIM', from: '7', to: '8' }),
  Object.freeze({ label: 'GUI', from: '10', to: '9' }),
  Object.freeze({ label: 'X', from: '1', to: '2' }),
  Object.freeze({ label: 'Y', from: '2', to: '3' }),
  Object.freeze({ label: 'Z', from: '3', to: '5' }),
  Object.freeze({ label: '', from: '18', to: '15' }),
]);

const BENCHMARKS = Object.freeze([
  Object.freeze({
    id: 'BM1',
    path: 'benchmarks/LFEA/BM1/BM1_InputXML.xml',
    expected: Object.freeze({ '0->0': 2, '17->14': 8, '7->8': 2 }),
  }),
  Object.freeze({
    id: 'BM2',
    path: 'benchmarks/LFEA/BM2/Input_BM2.xml',
    expected: Object.freeze({ '0->0': 3, '17->14': 1, '7->8': 1, '18->15': 1 }),
  }),
  Object.freeze({
    id: 'BM3',
    path: 'benchmarks/LFEA/BM3/BM3_InputXML.xml',
    expected: Object.freeze({ '0->0': 1, '2->3': 2 }),
  }),
]);

console.log('\n--- M030 InputXML restraint TYPE mutation authority ---');

assert.deepEqual(DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS, OWNER_CONFIRMED_ROWS);
assert.deepEqual(defaultRestraintTypeMutationConfig(), {
  enabled: true,
  rows: OWNER_CONFIRMED_ROWS.map((row) => ({ ...row })),
});

for (const row of OWNER_CONFIRMED_ROWS) {
  const resolution = resolveRestraintTypeMutation(`${row.from}.000000`);
  assert.equal(resolution.sourceTypeCode, row.from);
  assert.equal(resolution.typeCode, row.to);
  assert.equal(resolution.sourceKind, 'EXPORTED_NUMERIC');
  assert.equal(resolution.mutationApplied, true);
  assert.equal(resolution.mutationLabel, row.label);
  assert.equal(resolution.mutationFrom, row.from);
  assert.equal(resolution.mutationTo, row.to);
  assert.equal(mutateRestraintType(row.from), row.to);
  assert.equal(
    mutateRestraintType(row.from, { enabled: false, rows: OWNER_CONFIRMED_ROWS }),
    row.from,
    `disabled mutation must retain ${row.from}`,
  );
}

const aliases = Object.freeze({
  ANC: 0,
  ANCHOR: 0,
  X: 2,
  Y: 3,
  Z: 5,
  LIM: 8,
  LIMIT: 8,
  GUI: 9,
  GUIDE: 9,
  '+Y': 14,
  '+Z': 15,
});
for (const [alias, code] of Object.entries(aliases)) {
  assert.equal(CANONICAL_RESTRAINT_TYPE_CODES[alias], code);
  assert.equal(restraintTypeToCaesarCode(alias), code);
  const resolution = resolveRestraintTypeMutation(alias);
  assert.equal(resolution.sourceKind, 'CANONICAL_ALIAS');
  assert.equal(resolution.typeCode, String(code));
  assert.equal(resolution.mutationApplied, false, `${alias} must not be treated as an exported numeric code`);
}
assert.equal(resolveRestraintTypeMutation('1.000000').typeCode, '2', 'mutation must be single-pass, not chained to 3 or 5');
assert.equal(resolveRestraintTypeMutation('2.000000').typeCode, '3', 'mutation must be single-pass, not chained to 5');
assert.equal(resolveRestraintTypeMutation('0.000000').typeCode, '0');
assert.equal(resolveRestraintTypeMutation('0.000000').mutationApplied, false);
assert.equal(resolveRestraintTypeMutation('MYSTERY').typeCode, 'MYSTERY');
assert.equal(resolveRestraintTypeMutation('MYSTERY').sourceKind, 'UNRESOLVED_TEXT');

assert.throws(
  () => normalizeRestraintTypeMutationRows([
    { label: '+Y', from: '17', to: '14' },
    { label: '+Y duplicate', from: '17.0', to: '14' },
  ]),
  (error) => error?.code === 'INPUTXML_RESTRAINT_TYPE_MUTATION_DUPLICATE',
);
assert.throws(
  () => normalizeRestraintTypeMutationRows([
    { label: '+Y', from: '17', to: '14' },
    { label: 'conflict', from: '17', to: '15' },
  ]),
  (error) => error?.code === 'INPUTXML_RESTRAINT_TYPE_MUTATION_CONFLICT',
);
assert.throws(
  () => normalizeRestraintTypeMutationRows([{ label: 'bad', from: '1.5', to: '2' }]),
  (error) => error?.code === 'INPUTXML_RESTRAINT_TYPE_MUTATION_INVALID',
);

const benchmarkEvidence = BENCHMARKS.map(qualifyBenchmark);
const report = {
  schema: 'm030-inputxml-restraint-mutation-qualification/v1',
  authority: {
    source: 'OWNER_CONFIRMED_CAESAR_INPUTXML_EXPORT_CORRECTION',
    rows: OWNER_CONFIRMED_ROWS,
    enabledByDefault: true,
    applicationBoundary: 'EXPORTED_NUMERIC_TYPE_BEFORE_CLASSIFICATION',
  },
  aliasAuthority: aliases,
  benchmarks: benchmarkEvidence,
};
const stable = `${JSON.stringify(report, null, 2)}\n`;
report.sha256 = createHash('sha256').update(stable).digest('hex');
mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`rows: ${OWNER_CONFIRMED_ROWS.map((row) => `${row.from}->${row.to}`).join(', ')}`);
for (const bm of benchmarkEvidence) {
  console.log(`${bm.id}: ${bm.activeRestraintCount} active restraints / ${bm.mutationCount} mutations / ${Object.entries(bm.pairs).map(([key, count]) => `${key} x${count}`).join(', ')}`);
}
console.log(`evidence: ${report.sha256}`);
console.log('M030 InputXML restraint TYPE mutation authority PASS');

function qualifyBenchmark(spec) {
  const absolutePath = resolve(ROOT, spec.path);
  const content = readFileSync(absolutePath, 'utf8');
  const geometry = inputXmlToCanonicalGeometry(content, {
    unit: 'mm',
    source: `M030-${spec.id}-INPUTXML`,
    restraintTypeCodeMap: {},
    bendRadiusTolerance: 1e-6,
  });
  assert.equal(geometry.valid, true, `${spec.id} geometry must remain valid`);
  const restraints = geometry.nodes.flatMap((node) => (node.meta?.restraints ?? []).map((row) => ({
    nodeId: String(node.id),
    ...row,
  })));
  const pairs = countBy(restraints, (row) => `${row.sourceTypeCode}->${row.typeCode}`);
  assert.deepEqual(pairs, spec.expected, `${spec.id} mutation pairs`);
  for (const row of restraints) {
    assert.ok(row.sourceTypeRaw, `${spec.id} node ${row.nodeId} must preserve raw TYPE`);
    assert.equal(row.sourceKind, 'EXPORTED_NUMERIC');
    assert.equal(row.mutationApplied, row.sourceTypeCode !== row.typeCode);
    if (row.mutationApplied) {
      assert.equal(row.mutationFrom, row.sourceTypeCode);
      assert.equal(row.mutationTo, row.typeCode);
    } else {
      assert.equal(row.mutationFrom, null);
      assert.equal(row.mutationTo, null);
    }
  }
  const diagnostics = geometry.diagnostics.filter((row) => row.code === 'INPUTXML_RESTRAINT_TYPE_MUTATED');
  const mutationCount = restraints.filter((row) => row.mutationApplied).length;
  assert.equal(diagnostics.length, mutationCount, `${spec.id} mutation diagnostic count`);
  for (const diagnostic of diagnostics) {
    assert.equal(diagnostic.data.sourceTypeCode, diagnostic.data.mutationFrom);
    assert.equal(diagnostic.data.typeCode, diagnostic.data.mutationTo);
    assert.ok(Object.prototype.hasOwnProperty.call(diagnostic.data, 'mutationLabel'));
  }
  return {
    id: spec.id,
    sourcePath: spec.path,
    sourceSha256: createHash('sha256').update(content).digest('hex'),
    activeRestraintCount: restraints.length,
    mutationCount,
    pairs,
    restraints: restraints.map((row) => ({
      nodeId: row.nodeId,
      sourceTypeRaw: row.sourceTypeRaw,
      sourceTypeCode: row.sourceTypeCode,
      typeCode: row.typeCode,
      mutationApplied: row.mutationApplied,
      mutationLabel: row.mutationLabel,
      directionCosines: [row.xCosine, row.yCosine, row.zCosine],
      frictionCoefficient: row.frictionCoefficient,
    })),
  };
}

function countBy(rows, keyFor) {
  const counts = {};
  for (const row of rows) {
    const key = keyFor(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, 'en')));
}
