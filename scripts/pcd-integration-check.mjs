import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePipeSectionFromPackage } from '../src/core/engineering-data/pipeDataComponentSource.js';
import {
  resolvePipeSection,
  setPipeDataSourceProvider,
} from '../src/core/engineering-data/resolveEngineeringData.js';
import { resolveComponentDimensionFromPackage } from '../src/core/component-data/pipeDataComponentDimensions.js';
import { buildCanonicalGeometryFromCsv } from '../src/core/geometry/adapters/pcdCanonicalToAppCanonical.js';

const HERE = dirname(fileURLToPath(import.meta.url));

test('package pipe lookup matches published 4" Sch40 values', () => {
  const result = resolvePipeSectionFromPackage({ nps: 4, schedule: '40' });
  assert.equal(result.isQualified, true);
  assert.ok(Math.abs(result.value.od_mm - 114.3) < 0.01, `od_mm ${result.value.od_mm}`);
  assert.ok(Math.abs(result.value.wall_mm - 6.02) < 0.01, `wall_mm ${result.value.wall_mm}`);
  assert.ok(Math.abs(result.value.weight_kg_per_m - 16.07) < 0.01);
});

test('package valve and flange dimensions match benchmarks', () => {
  const valve = resolveComponentDimensionFromPackage({ componentType: 'VALVE_GATE', nps: 8, rating: 150 });
  assert.equal(valve.isQualified, true);
  assert.equal(valve.row.faceToFace_mm, 292, '8" CL150 gate F-F');
  assert.equal(valve.row.componentWeight_kg, 144, '8" CL150 gate weight');

  const flange = resolveComponentDimensionFromPackage({ componentType: 'FLANGE_WN', nps: 4, rating: 300 });
  assert.equal(flange.isQualified, true);
  assert.equal(flange.row.thickness_mm, 30.2, '4" CL300 WN thickness');
});

test('default source OFF keeps internal screening table path', () => {
  setPipeDataSourceProvider(null);
  const result = resolvePipeSection({ nps: 4, schedule: '40' });
  assert.equal(result.isQualified, true);
  assert.ok(!String(result.source).includes('pipe-component-data'), 'internal source used by default');
});

test('source ON resolves from package; miss falls back with diagnostic', () => {
  setPipeDataSourceProvider(() => 'pipe-component-data');
  try {
    const hit = resolvePipeSection({ nps: 4, schedule: '40' });
    assert.ok(String(hit.source).includes('pipe-component-data'), 'package source used when ON');
    assert.ok(Math.abs(hit.value.od_mm - 114.3) < 0.01);

    const miss = resolvePipeSection({ nps: 14, schedule: '40' });
    assert.equal(miss.isQualified, true, 'internal fallback still qualifies');
    assert.ok(!String(miss.source).includes('pipe-component-data'));
    assert.ok(miss.diagnostics.some((d) => d.code === 'PIPE_DATA_EXTERNAL_MISS'), 'fallback diagnostic present');
  } finally {
    setPipeDataSourceProvider(null);
  }
});

test('CSV → canonical-geometry-v1 bridge produces finite, valid geometry', () => {
  const csv = readFileSync(join(HERE, '../tests/fixtures/pcd-weight-line.csv'), 'utf8');
  const { canonical, pcdCanonical } = buildCanonicalGeometryFromCsv(csv, { now: '2026-01-01T00:00:00.000Z' });

  assert.equal(canonical.schemaVersion, 'canonical-geometry-v1');
  assert.ok(canonical.segments.length > 0, 'segments produced');
  assert.ok(canonical.nodes.length > 0, 'nodes produced');
  assert.equal(canonical.valid, true);

  for (const segment of canonical.segments) {
    assert.ok(Number.isFinite(segment.length_mm), `segment ${segment.id} length finite`);
    assert.ok(segment.startNodeId && segment.endNodeId, `segment ${segment.id} has node refs`);
  }
  assert.ok(Number.isFinite(pcdCanonical.totals.mass_kg) && pcdCanonical.totals.mass_kg > 0, 'total mass finite');

  // 10 m of 4" Sch40 ≈ 160.7 kg metal; package projection must agree within 0.5%.
  const pipeSegment = pcdCanonical.segments.find((s) => s.componentType === 'PIPE');
  assert.ok(pipeSegment, 'pipe segment present');
  assert.ok(Math.abs(pipeSegment.metalMass_kg - 160.7) / 160.7 < 0.005, `metal mass ${pipeSegment.metalMass_kg}`);
});
