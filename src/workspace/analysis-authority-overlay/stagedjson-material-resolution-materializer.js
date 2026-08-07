import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
} from '../../core/linear-fea-material/index.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';

export function materializeStagedJsonMaterialResolutions(authority) {
  if (!authority || authority.schema !== 'stagedjson-material-section-authority/v1') {
    throw new TypeError('Catalog-backed StagedJSON material/section authority is required.');
  }
  const tableById = new Map(authority.materials.map((table) => [table.materialId, table]));
  const expectedById = new Map();
  for (const row of authority.entityResolutions) {
    for (const role of ['BASELINE', 'OPERATING', 'DESIGN']) {
      const state = row.materialStates?.[role];
      if (!state) continue;
      const prior = expectedById.get(state.materialStateId);
      const expected = { materialId: row.materialId, role, ...state };
      if (prior && (prior.resolutionSemanticHash !== expected.resolutionSemanticHash
        || prior.resolutionEvidenceHash !== expected.resolutionEvidenceHash
        || prior.materialId !== expected.materialId)) {
        const error = new Error(`${state.materialStateId} has conflicting material authority references.`);
        error.code = 'STAGEDJSON_MATERIAL_MATERIALIZATION_CONFLICT';
        throw error;
      }
      expectedById.set(state.materialStateId, expected);
    }
  }
  const resolutions = [];
  for (const expected of [...expectedById.values()].sort((left, right) => ascii(left.materialStateId, right.materialStateId))) {
    const table = tableById.get(expected.materialId);
    if (!table) {
      const error = new Error(`Material table ${expected.materialId} is missing.`);
      error.code = 'STAGEDJSON_MATERIAL_MATERIALIZATION_TABLE_MISSING';
      throw error;
    }
    const resolution = resolveLinearFeaMaterialState({
      table,
      request: {
        materialStateId: expected.materialStateId,
        materialId: expected.materialId,
        evaluationTemperature: expected.evaluationTemperatureK,
      },
      profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
    });
    if (resolution.semanticHash !== expected.resolutionSemanticHash
      || resolution.evidenceHash !== expected.resolutionEvidenceHash) {
      const error = new Error(`Material resolution ${expected.materialStateId} does not reproduce its sealed hashes.`);
      error.code = 'STAGEDJSON_MATERIAL_MATERIALIZATION_HASH_MISMATCH';
      throw error;
    }
    resolutions.push(resolution);
  }
  return deepFreeze(resolutions);
}

function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
