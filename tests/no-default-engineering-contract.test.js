/**
 * Contract tests proving no hidden insulation/component/HYD fallback and
 * validating diagnostic-rich LOADMARKER export against the real benchmark.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildStageModelFromAttManagedHierarchy } from '../../3DV/stage/parser/AttManagedHierarchyToStageModel.js';
import { componentWeightKg, fluidWeightKgPerM, insulationWeightKgPerM } from '../src/calc-workspace/engineering-loads/formulas/elementWeightFormulas.js';
import { DEFAULT_SUPPORT_LOAD_PROFILE, buildSupportLoadModel } from '../src/calc-workspace/supportLoadEngine.js';
import { buildSupportLoadDistribution, buildSupportLoadStageTree } from '../src/calc-workspace/supportLoadDistribution.js';
import { normalizeCalculationWorkspacePackage } from '../src/calc-workspace/workspaceModel.js';

const BENCHMARK = 'C:/Code3/Vertical load benchmark/benchmark_30_complex_3d_support_load_stagedjson.json';

test('missing inputs return null instead of insulation, component, or HYD defaults', () => {
  const insulation = insulationWeightKgPerM({ outsideDiameterMm: 168.3, thicknessMm: 50, densityKgM3: null, directKgPerM: null });
  const component = componentWeightKg({ required: true, directKg: null });
  const hyd = fluidWeightKgPerM({ insideDiameterMm: 154.08, densityKgM3: null, directKgPerM: null, densityField: 'fluidDensityHydKgM3' });
  assert.equal(insulation.value, null);
  assert.ok(insulation.missing.includes('insulationDensityKgM3'));
  assert.equal(component.value, null);
  assert.equal(hyd.value, null);
  assert.ok(hyd.missing.includes('fluidDensityHydKgM3'));
});

test('LOADMARKER export carries diagnostics contract and re-imports in 3DV', async () => {
  const staged = JSON.parse(await readFile(BENCHMARK, 'utf8'));
  const selected = staged[0].children.map((item) => ({ ref: { type: 'node', id: item.id }, item: { ...item, sourceAttributes: item.attributes } }));
  const workspace = normalizeCalculationWorkspacePackage({ schema: 'json-viewer-selection/v1', selected }, 'real-benchmark', '2026-07-11T00:00:00.000Z');
  const preview = buildSupportLoadModel(workspace, '2026-07-11T00:00:00.000Z', DEFAULT_SUPPORT_LOAD_PROFILE);
  const distribution = buildSupportLoadDistribution(workspace, preview, DEFAULT_SUPPORT_LOAD_PROFILE);
  const output = buildSupportLoadStageTree(workspace, distribution, 'benchmark.json');
  const markers = output[0].children.filter((node) => node.type === 'LOADMARKER');
  assert.equal(markers.length, 6);
  assert.equal(markers[0].attributes.METHOD, 'CHAINAGE_TRIBUTARY_SPAN_V2');
  assert.equal(markers[0].attributes.FALLBACK_USED, false);
  assert.equal(markers[0].attributes.SUPPORT_ID, 'S001');
  assert.ok(Object.hasOwn(markers[0].attributes, 'VERTICAL_LOAD_HYD_KG'));
  assert.ok(Array.isArray(markers[0].diagnostics));

  const viewerModel = buildStageModelFromAttManagedHierarchy(output, { fileName: 'loads.json', fileSize: 1, fileHash: 'loads' });
  const markerNode = viewerModel.hierarchy.nodes.find((node) => node.kind === 'LOADMARKER');
  assert.ok(markerNode);
  assert.equal(markerNode.attributes.MARKER, 'SUPPORT_VERTICAL_LOAD');
});
