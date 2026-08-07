#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { resolveBranchMaterialSectionAuthority } from '../src/workspace/analysis-authority-overlay/material-section-resolution.js';
import {
  STAGEDJSON_AUTHORITY_COMPOSITION_SCHEMA,
  composeStagedJsonAnalysisAuthority,
} from '../src/workspace/analysis-authority-overlay/stagedjson-authority-composition.js';
import {
  requireAnalysisAuthorityOverlay,
} from '../src/workspace/analysis-authority-overlay/overlay-contract.js';
import {
  requireStagedJsonResolvedAnalysis,
} from '../src/workspace/analysis-authority-overlay/stagedjson-resolved-analysis.js';
import {
  requireStagedJsonProcessAuthority,
} from '../src/workspace/analysis-authority-overlay/stagedjson-process-authority.js';
import {
  requireStagedJsonSupportAuthority,
} from '../src/workspace/analysis-authority-overlay/stagedjson-support-authority.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceId = 'benchmarks/1885Sjson/EnrichedSjson';
const branchId = '/ASIM-1885-8"-S8810103-91261M7-HC-01/B1';
const sourceBytes = await readFile(resolve(root, sourceId));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const dataset = normalizeWorkspaceDataset(
  JSON.parse(sourceBytes.toString('utf8')),
  sourceId,
  { sourceBytes, sourceSha256 },
);
const projectDataProfile = JSON.parse(await readFile(resolve(root, 'project-data/1885s-project-data-profile.json'), 'utf8'));
const resolverPath = resolve(root, 'src/workspace/analysis-authority-overlay/material-section-resolution.js');
const materialSectionResolverSource = await readFile(resolverPath, 'utf8');
const materialSectionAuthority = resolveBranchMaterialSectionAuthority(dataset, branchId);
const before = JSON.stringify(dataset);
const composition = composeStagedJsonAnalysisAuthority({
  dataset,
  branchId,
  projectDataProfile,
  materialSectionAuthority,
  materialSectionResolverSource,
});
const repeated = composeStagedJsonAnalysisAuthority({
  dataset,
  branchId,
  projectDataProfile,
  materialSectionAuthority,
  materialSectionResolverSource,
});

assert.equal(composition.schema, STAGEDJSON_AUTHORITY_COMPOSITION_SCHEMA);
assert.equal(composition.status, 'BLOCKED_PENDING_QUALIFIED_CANONICAL_ADAPTER');
assert.deepEqual(repeated, composition, 'M022-C composition must be deterministic');
assert.equal(Object.isFrozen(composition), true, 'composition must be immutable');
assert.equal(JSON.stringify(dataset), before, 'composition must not mutate the normalized source dataset');
assert.equal(composition.branchSubset.entityIds.length, 16);
assert.equal(composition.branchSubset.supportEntityIds.length, 9);
assert.equal(composition.inventory.analysisEntityIds.length, 5);
assert.equal(composition.processAuthorities.length, 5);
assert.equal(composition.supportAuthorities.flatMap((row) => row.sourceEntityIds).length, 9);
assert.deepEqual(
  composition.supportAuthorities.flatMap((row) => row.sourceEntityIds).sort(),
  [...composition.branchSubset.supportEntityIds].sort(),
  'support authorities must exactly cover the selected branch support source records',
);

for (const authority of composition.processAuthorities) {
  assert.deepEqual(requireStagedJsonProcessAuthority(authority, { dataset }), authority);
  assert.equal(authority.fields.designPressure.value, 11.6);
  assert.equal(authority.fields.designPressure.unit, 'MPa');
  assert.equal(authority.fields.operatingAnalysisPressure.status, 'MISSING');
  assert.equal(authority.fields.operatingAnalysisPressure.value, null);
  assert.ok(authority.fields.operatingAnalysisPressure.diagnosticCodes.includes('STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_POLICY_MISSING'));
  assert.equal(authority.fields.hydrotestPressure.value, 22.035);
  assert.equal(authority.fields.hydrotestPressure.unit, 'UNDECLARED');
  assert.ok(authority.fields.hydrotestPressure.diagnosticCodes.includes('STAGEDJSON_HYDRO_PRESSURE_UNIT_UNDECLARED'));
  assert.equal(authority.fields.referenceTemperature.status, 'MISSING');
  assert.ok(authority.fields.referenceTemperature.diagnosticCodes.includes('STAGEDJSON_REFERENCE_TEMPERATURE_MISSING'));
  assert.equal(authority.fields.operatingTemperature.value, 309);
  assert.equal(authority.fields.designTemperature.value, 325);
  assert.equal(authority.fields.operatingFluidDensity.value, 300);
  assert.equal(authority.fields.hydrotestFluidDensity.value, 1000);
  assert.equal(authority.fields.insulationThickness.value, 100);
  assert.equal(authority.fields.insulationDensity.value, 250);
  assert.equal(authority.fields.materialDensity.value, 7850);
  assert.equal(authority.fields.fluidService.status, 'MISSING');
  for (const field of Object.values(authority.fields)) assert.notEqual(field.status, 'INHERITED');
}

for (const authority of composition.supportAuthorities) {
  assert.deepEqual(requireStagedJsonSupportAuthority(authority, { dataset }), authority);
  assert.equal(authority.fields.assembly.status, 'DECLARED');
  assert.equal(authority.fields.assembly.value.sourceCount, authority.sourceEntityIds.length);
  assert.equal(authority.fields.attachment.status, 'MISSING');
  assert.equal(authority.fields.restraintModel.status, 'MISSING');
  assert.equal(authority.fields.linearizationPolicy.status, 'MISSING');
  assert.ok(authority.fields.attachment.diagnosticCodes.includes('STAGEDJSON_SUPPORT_ATTACHMENT_UNRESOLVED'));
  assert.ok(authority.fields.restraintModel.diagnosticCodes.includes('STAGEDJSON_SUPPORT_RESTRAINT_UNRESOLVED'));
}

assert.deepEqual(requireAnalysisAuthorityOverlay(composition.overlay, { dataset }), composition.overlay);
assert.equal(composition.overlay.datasetRef.sourceSha256, sourceSha256);
assert.equal(composition.overlay.scope.branchId, branchId);
assert.equal(composition.overlay.authorityRecords.materials.length, 2);
assert.equal(composition.overlay.authorityRecords.sections.length, 1);
assert.equal(composition.overlay.authorityRecords.supports.length, composition.supportAuthorities.length);
assert.equal(composition.overlay.authorityRecords.loadCases.length, 0);
assert.equal(composition.overlay.governance.missingAssignment, 'BLOCK');
assert.equal(composition.overlay.governance.staleEvidence, 'BLOCK');

assert.deepEqual(requireStagedJsonResolvedAnalysis(composition.resolvedAnalysis, { dataset }), composition.resolvedAnalysis);
assert.equal(composition.resolvedAnalysis.branchSubsetRef.semanticHash, composition.branchSubset.semanticHash);
assert.equal(composition.resolvedAnalysis.overlayRef.semanticHash, composition.overlay.semanticHash);
assert.equal(composition.resolvedAnalysis.authorityRefs.process.length, 5);
assert.equal(composition.resolvedAnalysis.authorityRefs.supports.length, composition.supportAuthorities.length);
assert.equal(composition.resolvedAnalysis.authorityRefs.loadCases.length, 0);
assert.equal(composition.resolvedAnalysis.temperatureStateRequirements.length, 15);
const referenceRequirements = composition.resolvedAnalysis.temperatureStateRequirements.filter((row) => row.role === 'REFERENCE');
const operatingRequirements = composition.resolvedAnalysis.temperatureStateRequirements.filter((row) => row.role === 'OPERATING');
const designRequirements = composition.resolvedAnalysis.temperatureStateRequirements.filter((row) => row.role === 'DESIGN');
assert.equal(referenceRequirements.length, 5);
assert.ok(referenceRequirements.every((row) => row.processStatus === 'MISSING' && row.requestedTemperatureK === null));
assert.ok(operatingRequirements.every((row) => row.processStatus === 'DECLARED' && row.requestedTemperatureK === 582.15 && row.materialStateStatus === 'MISSING'));
assert.ok(designRequirements.every((row) => row.processStatus === 'DECLARED' && row.requestedTemperatureK === 598.15 && row.materialStateStatus === 'MISSING'));
assert.ok(composition.resolvedAnalysis.conflicts.some((row) => row.domain === 'MATERIAL'));
assert.ok(composition.resolvedAnalysis.conflicts.some((row) => row.domain === 'SECTION'));
for (const code of [
  'STAGEDJSON_REFERENCE_TEMPERATURE_MISSING',
  'STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_POLICY_MISSING',
  'STAGEDJSON_HYDRO_PRESSURE_UNIT_UNDECLARED',
  'STAGEDJSON_OPERATING_MATERIAL_TABLE_RANGE_INSUFFICIENT',
  'STAGEDJSON_DESIGN_MATERIAL_TABLE_RANGE_INSUFFICIENT',
  'STAGEDJSON_MATERIAL_SECTION_CATALOG_GENERALIZATION_REQUIRED',
  'STAGEDJSON_SUPPORT_AUTHORITY_UNRESOLVED',
  'STAGEDJSON_SUPPORT_SOLVER_AUTHORITY_UNRESOLVED',
  'ENRICHED_SJSON_CANONICAL_PIPING_ADAPTER_NOT_WIRED',
]) {
  assert.ok(composition.resolvedAnalysis.limitations.some((row) => row.code === code), `${code} must remain visible`);
}
assert.equal(
  composition.resolvedAnalysis.diagnostics.some((row) => row.code === 'STAGEDJSON_AUTHORITY_COMPOSITION_NOT_SOLVER_READY'),
  true,
);

console.log(JSON.stringify({
  check: 'm022c-stagedjson-authority-composition',
  status: 'PASS',
  sourceSha256,
  branchId,
  entityCount: composition.branchSubset.entityIds.length,
  analysisEntityCount: composition.inventory.analysisEntityIds.length,
  supportSourceRecordCount: composition.branchSubset.supportEntityIds.length,
  supportAuthorityCount: composition.supportAuthorities.length,
  materialAuthorityCount: composition.overlay.authorityRecords.materials.length,
  sectionAuthorityCount: composition.overlay.authorityRecords.sections.length,
  processAuthorityCount: composition.processAuthorities.length,
  overlaySemanticHash: composition.overlay.semanticHash,
  resolvedAnalysisSemanticHash: composition.resolvedAnalysis.semanticHash,
  compositionSemanticHash: composition.semanticHash,
  limitations: composition.resolvedAnalysis.limitations.map((row) => row.code).sort(),
}, null, 2));
