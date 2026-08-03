#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'validation/bucket-01/01-benchmark-manifest.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

const mandatoryLadder = [
  'C2D-PATCH-T3-01',
  'C2D-PATCH-T6-01',
  'C2D-PATCH-PURE-SHEAR-01',
  'C2D-CANTILEVER-PLANE-STRESS-01',
  'C2D-KIRSCH-HOLE-01',
  'C2D-LUG-PINHOLE-01',
];

assert.equal(manifest.schema, 'lafea-bucket-01-benchmark-manifest/v12');
assert.equal(manifest.bucket_id, 'LAFEA-BENCH-B01-CONTINUUM-LUG-PINHOLE');
assert.equal(manifest.stage_id, 'LAFEA.3');
assert.equal(manifest.formulation, 'PLANE_STRESS');
assert.deepEqual(
  manifest.benchmark_ladder,
  mandatoryLadder,
  'Bucket-01 benchmark order changed, omitted a gate, or substituted another benchmark',
);
assert.ok(
  manifest.supplemental_benchmarks?.includes('C2D-PURE-BENDING-PANEL-T6-01'),
  'pure-bending panel must remain supplemental evidence',
);
assert.equal(
  manifest.benchmark_ladder.includes('C2D-PURE-BENDING-PANEL-T6-01'),
  false,
  'pure-bending panel may not substitute for the plane-stress cantilever',
);

const receipts = new Map(
  manifest.governed_receipts.map((receipt) => [receipt.benchmark_id, receipt]),
);
for (const benchmarkId of mandatoryLadder) {
  assert.ok(receipts.has(benchmarkId), `missing governed receipt for ${benchmarkId}`);
}

const cantilever = receipts.get('C2D-CANTILEVER-PLANE-STRESS-01');
assert.equal(cantilever.script, 'scripts/lafea-bucket-01-cantilever-check.mjs');
assert.equal(cantilever.oracle, 'validation/bucket-01/12-cantilever-oracle.json');
assertFile(cantilever.script);
assertFile(cantilever.oracle);

const t6 = receipts.get('C2D-PATCH-T6-01');
assert.equal(t6.script, 'scripts/lafea.3-t6-patch-check.mjs');
assertFile(t6.script);

assert.equal(manifest.expected_value_policy.independent_closed_form_oracle_count, 4);
assert.equal(manifest.expected_value_policy.independent_engineering_theory_oracle_count, 1);
assert.equal(manifest.expected_value_policy.frozen_production_convergence_definition_count, 2);
assert.equal(manifest.expected_value_policy.production_output_may_generate_expected_values, false);
assert.ok(
  manifest.automatic_stop_conditions.includes('mandatory benchmark omitted or substituted'),
  'manifest must fail closed on ladder omission or substitution',
);
assert.equal(manifest.qualification_states.BUCKET_QUALIFIED, false);
assert.equal(manifest.current_disposition, 'NOT_QUALIFIED');

console.log(JSON.stringify({
  schema: 'lafea-bucket-01-benchmark-ladder-evidence/v1',
  status: 'BENCHMARK_LADDER_CONTRACT_PASS',
  mandatoryLadder,
  supplementalBenchmarks: manifest.supplemental_benchmarks,
  manifestHash: canonicalLafeaSha256(manifest),
  bucketQualified: false,
}));

function assertFile(relativePath) {
  assert.equal(
    fs.statSync(path.join(ROOT, relativePath)).isFile(),
    true,
    `missing governed file ${relativePath}`,
  );
}
