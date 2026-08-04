#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { resolveBranchMaterialSectionAuthority } from '../src/workspace/analysis-authority-overlay/material-section-resolution.js';
import {
  STAGEDJSON_SELECTED_BRANCH_INVENTORY_SCHEMA,
  buildStagedJsonSelectedBranchInventory,
} from '../src/workspace/analysis-authority-overlay/stagedjson-selected-branch-inventory.js';

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
const resolverPath = resolve(root, 'src/workspace/analysis-authority-overlay/material-section-resolution.js');
const resolverSource = await readFile(resolverPath, 'utf8');
const materialSectionAuthority = resolveBranchMaterialSectionAuthority(dataset, branchId);
const inventory = buildStagedJsonSelectedBranchInventory({
  dataset,
  branchId,
  materialSectionAuthority,
  materialSectionResolverSource: resolverSource,
});
const repeated = buildStagedJsonSelectedBranchInventory({
  dataset,
  branchId,
  materialSectionAuthority,
  materialSectionResolverSource: resolverSource,
});

assert.equal(inventory.schema, STAGEDJSON_SELECTED_BRANCH_INVENTORY_SCHEMA);
assert.deepEqual(repeated, inventory, 'selected-branch inventory must be deterministic');
assert.equal(Object.isFrozen(inventory), true, 'inventory must be immutable');
assert.equal(inventory.entityIds.length, 16, 'selected M008 branch must retain 16 normalized entities');
assert.equal(inventory.supportEntityIds.length, 9, 'selected M008 branch must retain nine support source records');
assert.equal(inventory.analysisEntityIds.length, 5, 'M008-C currently resolves five frame entities');
assert.deepEqual(field('designPressureMpa').uniqueValues, [11.6]);
assert.deepEqual(field('operatingTemperatureC').uniqueValues, [309]);
assert.deepEqual(field('designTemperatureC').uniqueValues, [325]);
assert.deepEqual(field('hydroPressure').uniqueValues, [22.035]);
assert.deepEqual(field('fluidDensityOpeKgM3').uniqueValues, [300]);
assert.deepEqual(field('fluidDensityHydKgM3').uniqueValues, [1000]);
assert.deepEqual(field('insulationThicknessMm').uniqueValues, [100]);
assert.deepEqual(field('insulationDensityKgM3').uniqueValues, [250]);
assert.deepEqual(field('materialDensityKgM3').uniqueValues, [7850]);
assert.equal(field('fluidService').declaredEntityIds.length, 0, 'fluidService must remain missing rather than inferred');
assert.equal(field('fluidService').missingEntityIds.length, 5);
assert.equal(inventory.temperatureInventory.REFERENCE.status, 'MISSING');
assert.deepEqual(inventory.temperatureInventory.OPERATING.uniqueKelvin, [582.15]);
assert.deepEqual(inventory.temperatureInventory.DESIGN.uniqueKelvin, [598.15]);
assert.equal(inventory.materialSectionInventory.operatingTemperaturesCovered, false);
assert.equal(inventory.materialSectionInventory.designTemperaturesCovered, false);
assert.ok(inventory.materialSectionInventory.materialTableRanges.every((row) => row.maximumTemperatureK === 393.15));
assert.deepEqual(inventory.materialSectionInventory.resolverCapabilities, {
  hasEmbeddedMaterialAliasMap: true,
  hasEmbeddedNps8Schedule100Section: true,
  hasSingleEvaluationTemperature: true,
});
assert.ok(inventory.sourceConflicts.some((row) => row.domain === 'SECTION'), 'raw Sch 100 versus enriched Sch 80 conflict must remain visible');
assert.ok(inventory.sourceConflicts.some((row) => row.domain === 'MATERIAL'), 'raw fitting material versus enriched pipe material conflict must remain visible');
for (const code of [
  'STAGEDJSON_REFERENCE_TEMPERATURE_MISSING',
  'STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_POLICY_MISSING',
  'STAGEDJSON_HYDRO_PRESSURE_UNIT_UNDECLARED',
  'STAGEDJSON_OPERATING_MATERIAL_TABLE_RANGE_INSUFFICIENT',
  'STAGEDJSON_DESIGN_MATERIAL_TABLE_RANGE_INSUFFICIENT',
  'STAGEDJSON_MATERIAL_SECTION_CATALOG_GENERALIZATION_REQUIRED',
  'STAGEDJSON_SUPPORT_AUTHORITY_UNRESOLVED',
]) assert.ok(inventory.qualificationBlockers.some((row) => row.code === code), `${code} must be disclosed`);

assert.match(resolverSource, /const\s+MATERIAL_ALIASES\s*=\s*new\s+Map/u);
assert.match(resolverSource, /const\s+NPS8_SCH100\s*=/u);
assert.match(resolverSource, /bore\.value\s*!==\s*NPS8_SCH100\.nominalBoreMm/u);
assert.match(resolverSource, /const\s+EVALUATION_TEMPERATURE\s*=\s*293\.15/u);
assert.match(resolverSource, /absoluteTemperature:\s*393\.15/u);

const carryForwardProbe = syntheticCarryForwardProbe();
const probeField = carryForwardProbe.processFields.find((row) => row.field === 'operatingTemperatureC');
assert.deepEqual(probeField.declaredEntityIds, ['P1']);
assert.deepEqual(probeField.missingEntityIds, ['P2']);
assert.deepEqual(probeField.uniqueValues, [100]);
assert.equal(
  carryForwardProbe.processInheritancePolicy,
  'PROHIBIT_ENTITY_ORDER_CARRY_FORWARD',
  'a later missing entity must not inherit the previous entity process value',
);

console.log(JSON.stringify({
  check: 'm022a-stagedjson-selected-branch-inventory',
  status: 'PASS',
  inventory,
  carryForwardProbe,
}, null, 2));

function field(name) {
  const result = inventory.processFields.find((row) => row.field === name);
  assert.ok(result, `missing process field inventory for ${name}`);
  return result;
}

function syntheticCarryForwardProbe() {
  const hash = 'fnv1a64:0000000000000001';
  const synthetic = {
    schema: 'analysis-workspace-dataset/v1',
    datasetId: 'dataset:m022a-carry-forward-probe',
    sourceName: 'synthetic.json',
    sourceSha256: 'b'.repeat(64),
    sourceSnapshot: { sourceSemanticHash: hash },
    entities: [
      entity('BRANCH', 'BRANCH', 'component', {}),
      entity('P1', 'PIPE', 'pipe', { operatingTemperatureC: 100 }),
      entity('P2', 'PIPE', 'pipe', { operatingTemperatureC: null }),
    ],
  };
  return buildStagedJsonSelectedBranchInventory({
    dataset: synthetic,
    branchId: '/B1',
    materialSectionAuthority: {
      materials: [{ materialId: 'MAT', points: [
        { absoluteTemperature: 293.15 },
        { absoluteTemperature: 500 },
      ] }],
      sections: [{ sectionState: { sectionStateId: 'SEC' } }],
      entityResolutions: [{ entityId: 'P1' }, { entityId: 'P2' }],
    },
    materialSectionResolverSource: 'const MATERIAL_ALIASES = new Map(); const NPS8_SCH100 = {}; const EVALUATION_TEMPERATURE = 293.15;',
  });
}
function entity(entityId, entityType, category, enrichedAttributes) {
  return {
    entityId,
    entityType,
    category,
    branchId: '/B1',
    properties: { attributes: {}, enrichedAttributes },
  };
}
