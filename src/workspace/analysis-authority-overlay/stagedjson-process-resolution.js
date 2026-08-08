import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  STAGEDJSON_PROCESS_AUTHORITY_SCHEMA,
  sealStagedJsonProcessAuthority,
} from './stagedjson-process-authority.js';
import {
  STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  STAGEDJSON_RESOLUTION_STATUS,
} from './stagedjson-resolution-common.js';

const REFERENCE_TEMPERATURE_FIELDS = Object.freeze([
  'referenceTemperatureC',
  'installationTemperatureC',
  'ambientTemperatureC',
]);
const OPERATING_PRESSURE_MPA_FIELDS = Object.freeze([
  'operatingPressureMpa',
  'pressureOperatingMpa',
]);

export function resolveStagedJsonProcessAuthorities({ dataset, branchId, analysisEntityIds }) {
  requireDataset(dataset);
  const selectedBranchId = requireText(branchId, 'branchId');
  const entityIds = uniqueSortedText(analysisEntityIds, 'analysisEntityIds');
  const byId = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
  const authorities = entityIds.map((entityId) => {
    const entity = byId.get(entityId);
    if (!entity || entity.branchId !== selectedBranchId) {
      fail('STAGEDJSON_PROCESS_RESOLUTION_ENTITY_OUTSIDE_SCOPE', `${entityId} is outside ${selectedBranchId}.`);
    }
    return resolveEntityProcessAuthority(dataset, selectedBranchId, entity);
  });
  return deepFreeze(authorities.sort((left, right) => ascii(left.processAuthorityId, right.processAuthorityId)));
}

function resolveEntityProcessAuthority(dataset, branchId, entity) {
  const attrs = entity.properties?.enrichedAttributes || {};
  const datasetRef = {
    datasetId: dataset.datasetId,
    sourceId: dataset.sourceName,
    sourceSha256: dataset.sourceSha256,
    sourceSnapshotSemanticHash: dataset.sourceSnapshot.sourceSemanticHash,
  };
  const fields = {
    designPressure: numericField(dataset, entity, attrs, ['designPressureMpa'], 'MPa', 'STAGEDJSON_DESIGN_PRESSURE_MISSING'),
    operatingAnalysisPressure: operatingPressureField(dataset, entity, attrs),
    hydrotestPressure: hydrotestPressureField(dataset, entity, attrs),
    referenceTemperature: numericField(dataset, entity, attrs, REFERENCE_TEMPERATURE_FIELDS, 'degC', 'STAGEDJSON_REFERENCE_TEMPERATURE_MISSING'),
    operatingTemperature: numericField(dataset, entity, attrs, ['operatingTemperatureC'], 'degC', 'STAGEDJSON_OPERATING_TEMPERATURE_MISSING'),
    designTemperature: numericField(dataset, entity, attrs, ['designTemperatureC'], 'degC', 'STAGEDJSON_DESIGN_TEMPERATURE_MISSING'),
    operatingFluidDensity: numericField(dataset, entity, attrs, ['fluidDensityOpeKgM3'], 'kg/m3', 'STAGEDJSON_OPERATING_FLUID_DENSITY_MISSING'),
    hydrotestFluidDensity: numericField(dataset, entity, attrs, ['fluidDensityHydKgM3'], 'kg/m3', 'STAGEDJSON_HYDROTEST_FLUID_DENSITY_MISSING'),
    insulationThickness: numericField(dataset, entity, attrs, ['insulationThicknessMm'], 'mm', 'STAGEDJSON_INSULATION_THICKNESS_MISSING'),
    insulationDensity: numericField(dataset, entity, attrs, ['insulationDensityKgM3'], 'kg/m3', 'STAGEDJSON_INSULATION_DENSITY_MISSING'),
    materialDensity: numericField(dataset, entity, attrs, ['materialDensityKgM3'], 'kg/m3', 'STAGEDJSON_MATERIAL_DENSITY_MISSING'),
    corrosionAllowance: numericField(dataset, entity, attrs, ['corrosionAllowanceMm'], 'mm', 'STAGEDJSON_CORROSION_ALLOWANCE_MISSING'),
    fluidPhase: textField(dataset, entity, attrs, ['fluidPhase'], 'STAGEDJSON_FLUID_PHASE_MISSING'),
    fluidService: textField(dataset, entity, attrs, ['fluidService'], 'STAGEDJSON_FLUID_SERVICE_MISSING'),
  };
  return sealStagedJsonProcessAuthority({
    schema: STAGEDJSON_PROCESS_AUTHORITY_SCHEMA,
    processAuthorityId: `STAGEDJSON:PROCESS:${entity.entityId}`,
    datasetRef,
    scope: { branchId, entityId: entity.entityId },
    inheritancePolicy: STAGEDJSON_PROCESS_INHERITANCE_POLICY,
    temperatureRoles: {
      REFERENCE: 'referenceTemperature',
      OPERATING: 'operatingTemperature',
      DESIGN: 'designTemperature',
    },
    fields,
    diagnostics: processDiagnostics(fields),
  }, { dataset });
}

function operatingPressureField(dataset, entity, attrs) {
  const explicit = declaredCandidates(attrs, OPERATING_PRESSURE_MPA_FIELDS, Number.isFinite);
  if (explicit.length > 0) return declaredFromCandidates(dataset, entity, explicit, 'MPa');
  if (Number.isFinite(attrs.operatingPressure)) {
    return missing('MPa', 'STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_UNIT_UNDECLARED');
  }
  return missing('MPa', 'STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_POLICY_MISSING');
}

function hydrotestPressureField(dataset, entity, attrs) {
  if (!Number.isFinite(attrs.hydroPressure)) {
    return missing('UNDECLARED', 'STAGEDJSON_HYDRO_PRESSURE_MISSING');
  }
  return declared(dataset, entity, 'hydroPressure', attrs.hydroPressure, 'UNDECLARED', [
    'STAGEDJSON_HYDRO_PRESSURE_UNIT_UNDECLARED',
  ]);
}

function numericField(dataset, entity, attrs, sourceFields, unit, missingCode) {
  const candidates = declaredCandidates(attrs, sourceFields, Number.isFinite);
  if (candidates.length === 0) return missing(unit, missingCode);
  return declaredFromCandidates(dataset, entity, candidates, unit);
}

function textField(dataset, entity, attrs, sourceFields, missingCode) {
  const candidates = declaredCandidates(attrs, sourceFields, (value) => typeof value === 'string' && value.trim().length > 0)
    .map((row) => ({ ...row, value: row.value.trim() }));
  if (candidates.length === 0) return missing('NONE', missingCode);
  return declaredFromCandidates(dataset, entity, candidates, 'NONE');
}

function declaredFromCandidates(dataset, entity, candidates, unit) {
  const distinct = new Map(candidates.map((row) => [semanticHash(row.value), row]));
  if (distinct.size > 1) {
    fail('STAGEDJSON_PROCESS_SOURCE_CONFLICT', `Entity ${entity.entityId} has conflicting declarations for ${candidates.map((row) => row.field).join(', ')}.`, {
      entityId: entity.entityId,
      candidates,
    });
  }
  return declared(dataset, entity, candidates[0].field, candidates[0].value, unit, []);
}

function declaredCandidates(attrs, fields, predicate) {
  return fields
    .filter((field) => predicate(attrs[field]))
    .map((field) => ({ field, value: attrs[field] }));
}

function declared(dataset, entity, sourceField, value, unit, diagnosticCodes) {
  return {
    status: STAGEDJSON_RESOLUTION_STATUS.DECLARED,
    value,
    unit,
    sourceEntityId: entity.entityId,
    sourceField,
    fromEntityId: null,
    diagnosticCodes,
    evidence: [{
      source: 'ENRICHED_SJSON_ENTITY_FIELD',
      locator: `${entity.jsonPointer || entity.entityId}/properties/enrichedAttributes/${sourceField}`,
      sourceSemanticHash: semanticHash({
        datasetSemanticHash: dataset.sourceSnapshot.sourceSemanticHash,
        entityId: entity.entityId,
        sourceField,
        value,
      }),
    }],
  };
}

function missing(unit, code) {
  return {
    status: STAGEDJSON_RESOLUTION_STATUS.MISSING,
    value: null,
    unit,
    sourceEntityId: null,
    sourceField: null,
    fromEntityId: null,
    diagnosticCodes: [code],
    evidence: [],
  };
}

function processDiagnostics(fields) {
  return Object.entries(fields)
    .flatMap(([field, value]) => value.diagnosticCodes.map((code) => ({
      severity: value.status === STAGEDJSON_RESOLUTION_STATUS.MISSING ? 'BLOCKER' : 'WARNING',
      code,
      field,
    })))
    .sort((left, right) => ascii(`${left.code}|${left.field}`, `${right.code}|${right.field}`));
}

function uniqueSortedText(value, path) {
  if (!Array.isArray(value) || value.length === 0) fail('STAGEDJSON_PROCESS_RESOLUTION_INPUT_INVALID', `${path} must be a nonempty array.`);
  const rows = value.map((item, index) => requireText(item, `${path}[${index}]`)).sort(ascii);
  if (new Set(rows).size !== rows.length) fail('STAGEDJSON_PROCESS_RESOLUTION_INPUT_INVALID', `${path} contains duplicates.`);
  return rows;
}
function requireDataset(dataset) {
  if (!dataset || dataset.schema !== 'analysis-workspace-dataset/v1' || !Array.isArray(dataset.entities)) {
    fail('STAGEDJSON_PROCESS_RESOLUTION_DATASET_INVALID', 'A normalized workspace dataset is required.');
  }
}
function requireText(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail('STAGEDJSON_PROCESS_RESOLUTION_INPUT_INVALID', `${path} must be a nonempty string.`);
  return value.trim();
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message, details) {
  const error = new Error(message);
  error.name = 'StagedJsonProcessResolutionError';
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}
