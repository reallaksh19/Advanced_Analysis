import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { composeStagedJsonAnalysisAuthority } from './stagedjson-authority-composition.js';
import {
  STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA,
  sealStagedJsonResolvedAnalysis,
} from './stagedjson-resolved-analysis.js';
import {
  STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  STAGEDJSON_RESOLUTION_STATUS,
} from './stagedjson-resolution-common.js';

export const STAGEDJSON_HOT_AUTHORITY_COMPOSITION_SCHEMA = 'stagedjson-hot-authority-composition/v1';

export function composeStagedJsonHotAnalysisAuthority({
  dataset,
  branchId,
  projectDataProfile,
  materialSectionAuthority,
  materialSectionResolverSource,
}) {
  requireCatalogAuthority(materialSectionAuthority);
  const base = composeStagedJsonAnalysisAuthority({
    dataset,
    branchId,
    projectDataProfile,
    materialSectionAuthority,
    materialSectionResolverSource,
  });
  const resolvedAnalysis = composeResolvedAnalysis({
    dataset,
    base,
    materialSectionAuthority,
  });
  const draft = {
    schema: STAGEDJSON_HOT_AUTHORITY_COMPOSITION_SCHEMA,
    branchId: base.branchId,
    status: 'BLOCKED_PENDING_QUALIFIED_CANONICAL_ADAPTER',
    branchSubset: base.branchSubset,
    inventory: base.inventory,
    processAuthorities: base.processAuthorities,
    supportAuthorities: base.supportAuthorities,
    materialSectionAuthority,
    overlay: base.overlay,
    resolvedAnalysis,
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash({
    schema: draft.schema,
    branchSubsetSemanticHash: draft.branchSubset.semanticHash,
    inventorySemanticHash: draft.inventory.semanticHash,
    materialSectionSemanticHash: materialSectionAuthority.semanticHash,
    processSemanticHashes: draft.processAuthorities.map((row) => row.semanticHash),
    supportSemanticHashes: draft.supportAuthorities.map((row) => row.semanticHash),
    overlaySemanticHash: draft.overlay.semanticHash,
    resolvedAnalysisSemanticHash: resolvedAnalysis.semanticHash,
  }) });
}

function composeResolvedAnalysis({ dataset, base, materialSectionAuthority }) {
  const materialRefs = materialAuthorityRefs(materialSectionAuthority.entityResolutions);
  const baselineAssignments = base.resolvedAnalysis.assignments.filter((row) => row.domain !== 'MATERIAL');
  const materialAssignments = [];
  const temperatureStateRequirements = [];
  const processByEntity = new Map(base.processAuthorities.map((row) => [row.scope.entityId, row]));
  const materialByEntity = new Map(materialSectionAuthority.entityResolutions.map((row) => [row.entityId, row]));

  for (const entityId of base.inventory.analysisEntityIds) {
    const resolution = materialByEntity.get(entityId);
    const process = processByEntity.get(entityId);
    if (!resolution || !process) fail('STAGEDJSON_HOT_COMPOSITION_AUTHORITY_MISSING', `${entityId} lacks catalog material or process authority.`);
    const baseline = requireState(resolution, 'BASELINE');
    const operating = resolution.materialStates.OPERATING;
    const design = resolution.materialStates.DESIGN;
    materialAssignments.push(
      assignment(`A:MATERIAL:BASELINE:${entityId}`, entityId, 'BASELINE_CATALOG', baseline),
      materialAssignmentForRole(entityId, 'OPERATING', process.fields.operatingTemperature, operating),
      materialAssignmentForRole(entityId, 'DESIGN', process.fields.designTemperature, design),
    );
    temperatureStateRequirements.push(
      temperatureRequirement(entityId, 'REFERENCE', process.fields.referenceTemperature, null, 'STAGEDJSON_REFERENCE_MATERIAL_STATE_MISSING'),
      temperatureRequirement(entityId, 'OPERATING', process.fields.operatingTemperature, operating, 'STAGEDJSON_OPERATING_MATERIAL_STATE_MISSING'),
      temperatureRequirement(entityId, 'DESIGN', process.fields.designTemperature, design, 'STAGEDJSON_DESIGN_MATERIAL_STATE_MISSING'),
    );
  }

  return sealStagedJsonResolvedAnalysis({
    schema: STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA,
    analysisId: `STAGEDJSON:ANALYSIS:${base.inventory.branchId}:R2`,
    datasetRef: base.resolvedAnalysis.datasetRef,
    branchSubsetRef: base.resolvedAnalysis.branchSubsetRef,
    overlayRef: base.resolvedAnalysis.overlayRef,
    processInheritancePolicy: STAGEDJSON_PROCESS_INHERITANCE_POLICY,
    authorityRefs: {
      materials: materialRefs,
      sections: base.resolvedAnalysis.authorityRefs.sections,
      process: base.resolvedAnalysis.authorityRefs.process,
      supports: base.resolvedAnalysis.authorityRefs.supports,
      loadCases: [],
    },
    assignments: [...baselineAssignments, ...materialAssignments],
    temperatureStateRequirements,
    conflicts: base.resolvedAnalysis.conflicts,
    limitations: base.resolvedAnalysis.limitations,
    diagnostics: [{
      severity: 'BLOCKER',
      code: 'STAGEDJSON_HOT_AUTHORITY_COMPOSITION_NOT_SOLVER_READY',
      message: 'Catalog-backed operating/design material states are sealed, but process/support/canonical-adapter gates still prohibit solver execution.',
    }],
  }, { dataset });
}

function materialAuthorityRefs(entityResolutions) {
  const byId = new Map();
  for (const row of entityResolutions) {
    for (const role of ['BASELINE', 'OPERATING', 'DESIGN']) {
      const state = row.materialStates?.[role];
      if (!state) continue;
      const previous = byId.get(state.materialStateId);
      const candidate = {
        authorityId: state.materialStateId,
        schema: 'fea-linear-material-resolution/v1',
        semanticHash: state.resolutionSemanticHash,
        evidenceHash: state.resolutionEvidenceHash,
      };
      if (previous && (previous.semanticHash !== candidate.semanticHash || previous.evidenceHash !== candidate.evidenceHash)) {
        fail('STAGEDJSON_HOT_COMPOSITION_MATERIAL_HASH_CONFLICT', `${state.materialStateId} has conflicting hashes.`);
      }
      byId.set(state.materialStateId, candidate);
    }
  }
  return [...byId.values()].sort((left, right) => ascii(left.authorityId, right.authorityId));
}

function materialAssignmentForRole(entityId, role, processField, state) {
  if (processField.status === STAGEDJSON_RESOLUTION_STATUS.MISSING || !state) {
    return {
      assignmentId: `A:MATERIAL:${role}:${entityId}`,
      entityId,
      domain: 'MATERIAL',
      role,
      status: STAGEDJSON_RESOLUTION_STATUS.MISSING,
      authorityId: null,
      diagnosticCodes: [...new Set([
        ...processField.diagnosticCodes,
        `STAGEDJSON_${role}_MATERIAL_STATE_MISSING`,
      ])].sort(ascii),
    };
  }
  return assignment(`A:MATERIAL:${role}:${entityId}`, entityId, role, state);
}

function assignment(assignmentId, entityId, role, state) {
  return {
    assignmentId,
    entityId,
    domain: 'MATERIAL',
    role,
    status: STAGEDJSON_RESOLUTION_STATUS.DECLARED,
    authorityId: state.materialStateId,
    diagnosticCodes: [],
  };
}

function temperatureRequirement(entityId, role, field, state, missingMaterialCode) {
  const processField = role === 'REFERENCE' ? 'referenceTemperature' : role === 'OPERATING' ? 'operatingTemperature' : 'designTemperature';
  const processMissing = field.status === STAGEDJSON_RESOLUTION_STATUS.MISSING;
  const materialMissing = processMissing || !state;
  return {
    requirementId: `T:${role}:${entityId}`,
    entityId,
    role,
    processField,
    processStatus: field.status,
    requestedTemperatureK: processMissing ? null : toKelvin(field.value, field.unit),
    materialStateStatus: materialMissing ? STAGEDJSON_RESOLUTION_STATUS.MISSING : STAGEDJSON_RESOLUTION_STATUS.DECLARED,
    materialStateId: materialMissing ? null : state.materialStateId,
    diagnosticCodes: materialMissing
      ? [...new Set([...field.diagnosticCodes, missingMaterialCode])].sort(ascii)
      : [...field.diagnosticCodes].sort(ascii),
  };
}

function requireCatalogAuthority(authority) {
  if (!authority || authority.schema !== 'stagedjson-material-section-authority/v1'
    || !Array.isArray(authority.entityResolutions) || authority.entityResolutions.length === 0) {
    fail('STAGEDJSON_HOT_COMPOSITION_MATERIAL_SECTION_AUTHORITY_INVALID', 'Catalog-backed StagedJSON material/section authority is required.');
  }
}

function requireState(resolution, role) {
  const state = resolution.materialStates?.[role];
  if (!state) fail('STAGEDJSON_HOT_COMPOSITION_BASELINE_STATE_MISSING', `${resolution.entityId} lacks ${role} material state.`);
  return state;
}

function toKelvin(value, unit) {
  if (!Number.isFinite(value)) fail('STAGEDJSON_HOT_COMPOSITION_TEMPERATURE_INVALID', 'Declared process temperature must be finite.');
  if (unit === 'K') return value;
  if (unit === 'degC') return Number((value + 273.15).toFixed(12));
  fail('STAGEDJSON_HOT_COMPOSITION_TEMPERATURE_UNIT_INVALID', `Unsupported temperature unit ${unit}.`);
}

function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message, details) {
  const error = new Error(message);
  error.name = 'StagedJsonHotAuthorityCompositionError';
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}
