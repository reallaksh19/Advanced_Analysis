#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { resolveStagedJsonMaterialSectionAuthority } from '../src/workspace/analysis-authority-overlay/stagedjson-material-section-resolution.js';
import { materializeStagedJsonMaterialResolutions } from '../src/workspace/analysis-authority-overlay/stagedjson-material-resolution-materializer.js';
import { composeStagedJsonHotAnalysisAuthority } from '../src/workspace/analysis-authority-overlay/stagedjson-hot-authority-composition.js';
import { requireStagedJsonResolvedAnalysis } from '../src/workspace/analysis-authority-overlay/stagedjson-resolved-analysis.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceId = 'benchmarks/1885Sjson/EnrichedSjson';
const branchId = '/ASIM-1885-8"-S8810103-91261M7-HC-01/B1';
const sourceBytes = await readFile(resolve(root, sourceId));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const dataset = normalizeWorkspaceDataset(JSON.parse(sourceBytes.toString('utf8')), sourceId, { sourceBytes, sourceSha256 });
const projectDataProfile = JSON.parse(await readFile(resolve(root, 'project-data/1885s-project-data-profile.json'), 'utf8'));
const resolverSource = await readFile(resolve(root, 'src/workspace/analysis-authority-overlay/stagedjson-material-section-resolution.js'), 'utf8');

const authority = resolveStagedJsonMaterialSectionAuthority(dataset, branchId);
assert.deepEqual(resolveStagedJsonMaterialSectionAuthority(dataset, branchId), authority, 'M022-B authority must be deterministic');
assert.equal(authority.entityResolutions.length, 5);
assert.equal(authority.materials.length, 2);
assert.equal(authority.sections.length, 1);
assert.equal(authority.skipped.length, 10);
assert.ok(authority.materials.every((table) => table.points.at(-1).absoluteTemperature === 644.15));

for (const row of authority.entityResolutions) {
  assert.ok(row.materialStates.BASELINE);
  assert.ok(row.materialStates.OPERATING);
  assert.ok(row.materialStates.DESIGN);
  assert.equal(row.materialStates.BASELINE.evaluationTemperatureK, 293.15);
  assert.equal(row.materialStates.BASELINE.method, 'EXACT_TABLE_POINT');
  assert.equal(row.materialStates.OPERATING.evaluationTemperatureK, 582.15);
  assert.equal(row.materialStates.OPERATING.method, 'LINEAR_INTERPOLATION');
  assert.equal(row.materialStates.DESIGN.evaluationTemperatureK, 598.15);
  assert.equal(row.materialStates.DESIGN.method, 'LINEAR_INTERPOLATION');
}

const materialResolutions = materializeStagedJsonMaterialResolutions(authority);
assert.equal(materialResolutions.length, 6, 'two materials x three temperature roles must materialize');
assert.ok(materialResolutions.every((row) => row.materialState.evaluationTemperature >= 293.15 && row.materialState.evaluationTemperature <= 644.15));

const composition = composeStagedJsonHotAnalysisAuthority({
  dataset,
  branchId,
  projectDataProfile,
  materialSectionAuthority: authority,
  materialSectionResolverSource: resolverSource,
});
const repeated = composeStagedJsonHotAnalysisAuthority({
  dataset,
  branchId,
  projectDataProfile,
  materialSectionAuthority: authority,
  materialSectionResolverSource: resolverSource,
});
assert.deepEqual(repeated, composition, 'M022-B composition must be deterministic');
assert.equal(composition.status, 'BLOCKED_PENDING_QUALIFIED_CANONICAL_ADAPTER');
assert.equal(composition.branchSubset.entityIds.length, 16);
assert.equal(composition.branchSubset.supportEntityIds.length, 9);
assert.equal(composition.inventory.analysisEntityIds.length, 5);
assert.equal(composition.inventory.materialSectionInventory.operatingTemperaturesCovered, true);
assert.equal(composition.inventory.materialSectionInventory.designTemperaturesCovered, true);
assert.deepEqual(composition.inventory.materialSectionInventory.resolverCapabilities, {
  hasEmbeddedMaterialAliasMap: false,
  hasEmbeddedNps8Schedule100Section: false,
  hasSingleEvaluationTemperature: false,
});

assert.deepEqual(requireStagedJsonResolvedAnalysis(composition.resolvedAnalysis, { dataset }), composition.resolvedAnalysis);
const limitations = new Set(composition.resolvedAnalysis.limitations.map((row) => row.code));
for (const removed of [
  'STAGEDJSON_OPERATING_MATERIAL_TABLE_RANGE_INSUFFICIENT',
  'STAGEDJSON_DESIGN_MATERIAL_TABLE_RANGE_INSUFFICIENT',
  'STAGEDJSON_MATERIAL_SECTION_CATALOG_GENERALIZATION_REQUIRED',
]) assert.equal(limitations.has(removed), false, `${removed} must be closed by M022-B`);
for (const retained of [
  'STAGEDJSON_REFERENCE_TEMPERATURE_MISSING',
  'STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_POLICY_MISSING',
  'STAGEDJSON_HYDRO_PRESSURE_UNIT_UNDECLARED',
  'STAGEDJSON_SUPPORT_AUTHORITY_UNRESOLVED',
  'STAGEDJSON_SUPPORT_SOLVER_AUTHORITY_UNRESOLVED',
  'ENRICHED_SJSON_CANONICAL_PIPING_ADAPTER_NOT_WIRED',
]) assert.equal(limitations.has(retained), true, `${retained} must remain visible`);

const materialAssignments = composition.resolvedAnalysis.assignments.filter((row) => row.domain === 'MATERIAL');
assert.equal(materialAssignments.length, 15);
assert.equal(materialAssignments.filter((row) => row.role === 'OPERATING' && row.status === 'DECLARED').length, 5);
assert.equal(materialAssignments.filter((row) => row.role === 'DESIGN' && row.status === 'DECLARED').length, 5);
const referenceRequirements = composition.resolvedAnalysis.temperatureStateRequirements.filter((row) => row.role === 'REFERENCE');
const operatingRequirements = composition.resolvedAnalysis.temperatureStateRequirements.filter((row) => row.role === 'OPERATING');
const designRequirements = composition.resolvedAnalysis.temperatureStateRequirements.filter((row) => row.role === 'DESIGN');
assert.ok(referenceRequirements.every((row) => row.processStatus === 'MISSING' && row.materialStateStatus === 'MISSING'));
assert.ok(operatingRequirements.every((row) => row.requestedTemperatureK === 582.15 && row.materialStateStatus === 'DECLARED' && row.materialStateId));
assert.ok(designRequirements.every((row) => row.requestedTemperatureK === 598.15 && row.materialStateStatus === 'DECLARED' && row.materialStateId));

console.log(JSON.stringify({
  check: 'm022b-stagedjson-hot-material',
  status: 'PASS',
  sourceSha256,
  branchId,
  entityCount: composition.branchSubset.entityIds.length,
  analysisEntityCount: authority.entityResolutions.length,
  supportSourceRecordCount: composition.branchSubset.supportEntityIds.length,
  materialTableCount: authority.materials.length,
  materialResolutionCount: materialResolutions.length,
  sectionAuthorityCount: authority.sections.length,
  operatingTemperatureK: 582.15,
  designTemperatureK: 598.15,
  overlaySemanticHash: composition.overlay.semanticHash,
  resolvedAnalysisSemanticHash: composition.resolvedAnalysis.semanticHash,
  compositionSemanticHash: composition.semanticHash,
  limitations: [...limitations].sort(),
}, null, 2));
