#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../src/core/linear-fea-material/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { resolveBranchMaterialSectionAuthority } from '../src/workspace/analysis-authority-overlay/material-section-resolution.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceId = 'benchmarks/1885Sjson/EnrichedSjson';
const branchId = '/ASIM-1885-8"-S8810103-91261M7-HC-01/B1';
const sourceBytes = await readFile(resolve(root, sourceId));
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const dataset = normalizeWorkspaceDataset(JSON.parse(sourceBytes.toString('utf8')), sourceId, { sourceBytes, sourceSha256 });
const result = resolveBranchMaterialSectionAuthority(dataset, branchId);
assert.deepEqual(resolveBranchMaterialSectionAuthority(dataset, branchId), result, 'resolution must be deterministic');
assert.ok(Object.isFrozen(result), 'result must be recursively immutable');

const byEntity = new Map(result.entityResolutions.map((row) => [row.entityId, row]));
const elbow1 = required(byEntity, '=1006649732/51428');
const elbow2 = required(byEntity, '=1006649732/51429');
const flange = required(byEntity, '=1006649732/51439');
assert.equal(result.entityResolutions.length, 5, 'two elbows, one flange, and two inherited auto pipes must resolve');
assert.equal(result.materials.length, 2, 'A234-WPB and A105 must remain distinct governed materials');
assert.equal(result.sections.length, 1, 'all resolved entities must share NPS8 Schedule 100');
assert.equal(elbow1.materialStateId, elbow2.materialStateId);
assert.equal(elbow1.sectionStateId, elbow2.sectionStateId);
assert.notEqual(flange.materialStateId, elbow1.materialStateId);
assert.equal(flange.sectionStateId, elbow1.sectionStateId);
assert.equal(elbow1.materialStateId, 'MAT-CS_A234_WPB-293K');
assert.equal(flange.materialStateId, 'MAT-CS_A105-293K');
assert.equal(elbow1.sectionStateId, 'SEC-NPS8-SCH100');

const branchEntities = dataset.entities.filter((entity) => entity.branchId === branchId);
const autoEntities = branchEntities
  .filter((entity) => entity.properties?.attributes?.AUTO_GENERATED_PIPE === 'true')
  .sort((left, right) => ascii(left.entityId, right.entityId));
assert.equal(autoEntities.length, 2, 'target branch must contain two auto-generated pipes');
for (const autoEntity of autoEntities) {
  const inherited = required(byEntity, autoEntity.entityId);
  assert.equal(inherited.evidence.mode, 'INHERITED_ADJACENT_ENTITY');
  const source = required(byEntity, inherited.evidence.inheritedFromEntityId);
  assert.equal(inherited.materialStateId, source.materialStateId);
  assert.equal(inherited.sectionStateId, source.sectionStateId);
  assert.equal(inherited.materialResolutionSemanticHash, source.materialResolutionSemanticHash);
  assert.equal(inherited.sectionResolutionSemanticHash, source.sectionResolutionSemanticHash);
  assert.ok(shareEndpoint(autoEntity, branchEntities.find((entity) => entity.entityId === source.entityId)), 'inheritance source must be geometrically adjacent');
}

const skippedByEntity = new Map(result.skipped.map((row) => [row.entityId, row]));
assert.equal(result.skipped.length, 10, 'one gasket and nine supports must be explicitly skipped');
assert.equal(required(skippedByEntity, '=1006649732/51440').code, 'MATERIAL_SECTION_RESOLUTION_GASKET_NOT_APPLICABLE');
const supportEntities = branchEntities.filter((entity) => entity.category === 'support');
assert.equal(supportEntities.length, 9, 'target branch must contain nine support entities');
for (const support of supportEntities) {
  assert.equal(required(skippedByEntity, support.entityId).code, 'MATERIAL_SECTION_RESOLUTION_SUPPORT_OUT_OF_SCOPE');
  assert.equal(byEntity.has(support.entityId), false, 'support must not receive material/section authority');
}

const expectedTables = [materialAuthority('CS_A105', 'MAT-CS_A105-293K'), materialAuthority('CS_A234_WPB', 'MAT-CS_A234_WPB-293K')]
  .sort((left, right) => ascii(left.table.materialId, right.table.materialId));
assert.deepEqual(result.materials, expectedTables.map((row) => row.table), 'returned materials must be the actual sealed tables');
for (const expected of expectedTables) {
  const rows = result.entityResolutions.filter((row) => row.materialStateId === expected.resolution.materialState.materialStateId);
  assert.ok(rows.length > 0, `material ${expected.table.materialId} must be assigned`);
  for (const row of rows) assert.equal(row.materialResolutionSemanticHash, expected.resolution.semanticHash);
}

const expectedSection = sectionAuthority();
assert.deepEqual(result.sections, [expectedSection], 'returned section must be the actual production resolution');
for (const row of result.entityResolutions) assert.equal(row.sectionResolutionSemanticHash, expectedSection.semanticHash);

const compound = structuredClone(dataset);
compound.entities.find((entity) => entity.entityId === '=1006649732/51428').properties.attributes.MTXX = 'Body: ASTM A105 Trim: AISI 316';
assertCode(() => resolveBranchMaterialSectionAuthority(compound, branchId), 'MATERIAL_SECTION_RESOLUTION_MATERIAL_NOT_SIMPLE');
const noSchedule = structuredClone(dataset);
noSchedule.entities.find((entity) => entity.entityId === '=1006649732/51428').properties.attributes.DTXR = 'ELBOW 90 DEG LR BW';
assertCode(() => resolveBranchMaterialSectionAuthority(noSchedule, branchId), 'MATERIAL_SECTION_RESOLUTION_SCHEDULE_NOT_PARSEABLE');
const noInheritance = structuredClone(dataset);
noInheritance.entities.find((entity) => entity.entityId === autoEntities[0].entityId).properties.attributes.LBORE = '250mm';
assertCode(() => resolveBranchMaterialSectionAuthority(noInheritance, branchId), 'MATERIAL_SECTION_RESOLUTION_INHERITANCE_SOURCE_MISSING');

console.log(JSON.stringify({
  check: 'w11.4-material-section-resolution',
  status: 'PASS',
  branchId,
  entityResolutions: result.entityResolutions,
  skipped: result.skipped,
  materials: result.materials.map((table) => ({
    materialId: table.materialId,
    sourceEvidence: table.sourceEvidence,
    points: table.points,
    semanticHash: table.semanticHash,
  })),
  sections: result.sections.map((resolution) => ({
    sectionStateId: resolution.sectionState.sectionStateId,
    dimensions: resolution.dimensions,
    sectionState: resolution.sectionState,
    semanticHash: resolution.semanticHash,
    evidenceHash: resolution.evidenceHash,
  })),
}, null, 2));

function materialAuthority(materialId, materialStateId) {
  const points = [
    { absoluteTemperature: 293.15, elasticModulus: 2.0e11, shearModulus: 7.69e10, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.17e-5 },
    { absoluteTemperature: 393.15, elasticModulus: 1.94e11, shearModulus: 7.46e10, poissonRatio: 0.3, massDensity: 7850, thermalExpansionCoefficient: 1.2e-5 },
  ];
  const source = { sourceId: 'PUBLIC-CARBON-STEEL-BULK-PROPERTIES', sourceRevision: '2026-08-03', materialId, points };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId,
    sourceEvidence: { sourceId: source.sourceId, sourceRevision: source.sourceRevision, sourceSemanticHash: semanticHash(source) },
    points,
    semanticHash: '',
  });
  return {
    table,
    resolution: resolveLinearFeaMaterialState({
      table,
      request: { materialStateId, materialId, evaluationTemperature: 293.15 },
      profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
    }),
  };
}

function sectionAuthority() {
  const source = { sourceId: 'ASME-B36.10-NPS8-SCH100', sourceRevision: '2022', nps: 8, nominalBoreMm: 200, schedule: 100, outerDiameter: 0.2191, wallThickness: 0.01509 };
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId: 'SEC-NPS8-SCH100',
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: source.outerDiameter,
    wallThickness: source.wallThickness,
    sourceEvidence: { sourceId: source.sourceId, sourceRevision: source.sourceRevision, sourceSemanticHash: semanticHash(source) },
  };
  return resolvePipeSection({ request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) }, profile: PIPE_SECTION_PROFILE });
}

function shareEndpoint(left, right) {
  if (!right) return false;
  const a = geometryPoints(left);
  const b = geometryPoints(right);
  return a.some((point) => b.includes(point));
}
function geometryPoints(entity) {
  const start = entity.properties?.geometry?.start;
  const end = entity.properties?.geometry?.end;
  return [start, end].filter(Boolean).map((point) => `${point.x}|${point.y}|${point.z}`);
}
function required(map, key) { const value = map.get(key); assert.ok(value, `missing ${key}`); return value; }
function assertCode(callback, code) { assert.throws(callback, (error) => error?.code === code, `expected ${code}`); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
