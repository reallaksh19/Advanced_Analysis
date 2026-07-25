/**
 * Integration test using the user-supplied real stagedJson benchmark. The
 * fixture is not simulated and is read in place without modifying it.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildJsonViewerSelectionPayload } from '../../3DV/stage/export/JsonViewerSelectionExport.js';
import { buildStageModelFromAttManagedHierarchy } from '../../3DV/stage/parser/AttManagedHierarchyToStageModel.js';
import { DEFAULT_SUPPORT_LOAD_PROFILE, buildSupportLoadModel } from '../src/calc-workspace/supportLoadEngine.js';
import { buildSupportLoadDistribution } from '../src/calc-workspace/supportLoadDistribution.js';
import { normalizeCalculationWorkspacePackage } from '../src/calc-workspace/workspaceModel.js';

const BENCHMARK_ROOT = 'C:/Code3/Vertical load benchmark';

test('chainage V2 matches the 30-element real support-load benchmark', async () => {
  const staged = await jsonFile(`${BENCHMARK_ROOT}/benchmark_30_complex_3d_support_load_stagedjson.json`);
  const expected = await jsonFile(`${BENCHMARK_ROOT}/benchmark_30_complex_3d_support_load_expected.json`);
  const selection = viewerSelection(staged);
  const workspace = normalizeCalculationWorkspacePackage(selection, 'benchmark-real-data', '2026-07-11T00:00:00.000Z');
  const preview = buildSupportLoadModel(workspace, '2026-07-11T00:00:00.000Z', DEFAULT_SUPPORT_LOAD_PROFILE);
  const actual = buildSupportLoadDistribution(workspace, preview, DEFAULT_SUPPORT_LOAD_PROFILE);

  assert.equal(actual.method, 'CHAINAGE_TRIBUTARY_SPAN_V2');
  close(actual.totals.totalWeightOpeKg, expected.totals.totalElementWeightOpeKg, 1e-6, 'total OPE kg');
  close(actual.totals.totalWeightHydKg, expected.totals.totalElementWeightHydKg, 1e-6, 'total HYD kg');
  assert.equal(actual.supports.length, expected.supports.length);
  for (const expectedSupport of expected.supports) {
    const support = actual.supports.find((row) => row.supportId === expectedSupport.supportId);
    assert.ok(support, `missing support ${expectedSupport.supportId}`);
    close(support.verticalLoadOpeKg, expectedSupport.verticalLoadOpeKg, 1e-6, `${support.supportId} OPE kg`);
    close(support.verticalLoadHydKg, expectedSupport.verticalLoadHydKg, 1e-6, `${support.supportId} HYD kg`);
    close(support.verticalLoadOpeN, expectedSupport.verticalLoadOpeN, 1e-3, `${support.supportId} OPE N`);
    close(support.verticalLoadHydN, expectedSupport.verticalLoadHydN, 1e-3, `${support.supportId} HYD N`);
  }
});

test('missing HYD density remains null and never copies OPE', async () => {
  const staged = await jsonFile(`${BENCHMARK_ROOT}/benchmark_30_complex_3d_support_load_stagedjson.json`);
  const pipe = structuredClone(staged[0].children.find((item) => item.id === 'E001'));
  pipe.enrichedAttributes.fluidWeightHydKgPerM = null;
  pipe.enrichedAttributes.fluidDensityHydKgM3 = null;
  const selection = [{ ref: { type: 'node', id: pipe.id }, item: { ...pipe, sourceAttributes: pipe.attributes } }];
  const workspace = normalizeCalculationWorkspacePackage({ selected: selection }, 'benchmark-missing-hyd', '2026-07-11T00:00:00.000Z');
  const preview = buildSupportLoadModel(workspace, '2026-07-11T00:00:00.000Z', DEFAULT_SUPPORT_LOAD_PROFILE);
  const actual = buildSupportLoadDistribution(workspace, preview, DEFAULT_SUPPORT_LOAD_PROFILE);
  assert.equal(actual.elements[0].totalWeightHydKg, null);
  assert.ok(actual.diagnostics.some((row) => row.field === 'elementWeightHYDKg'));
});

async function jsonFile(path) {
  return JSON.parse(await readFile(fileURLToPath(new URL(`file:///${path}`)), 'utf8'));
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);
}

function viewerSelection(staged) {
  const model = buildStageModelFromAttManagedHierarchy(staged, { fileName: 'benchmark.json', fileSize: 1, fileHash: 'benchmark' });
  const refs = model.hierarchy.nodes.filter((node) => node.sourceId).map((node) => ({ type: 'node', id: node.id }));
  return buildJsonViewerSelectionPayload(model, 'benchmark.json', refs, 'node');
}
