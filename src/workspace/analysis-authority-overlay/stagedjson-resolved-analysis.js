import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  STAGEDJSON_RESOLUTION_STATUS,
  STAGEDJSON_TEMPERATURE_ROLES,
  ascii,
  enumValue,
  exactKeys,
  fail,
  hash,
  normalizeDatasetRef,
  normalizeDiagnostics,
  normalizePositiveNumber,
  text,
  uniqueTextList,
} from './stagedjson-resolution-common.js';

export const STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA = 'stagedjson-resolved-analysis/v1';

const TOP_KEYS = [
  'schema',
  'analysisId',
  'datasetRef',
  'branchSubsetRef',
  'overlayRef',
  'processInheritancePolicy',
  'authorityRefs',
  'assignments',
  'temperatureStateRequirements',
  'conflicts',
  'limitations',
  'diagnostics',
  'semanticHash',
  'evidenceHash',
];
const AUTHORITY_REF_KEYS = ['authorityId', 'schema', 'semanticHash', 'evidenceHash'];
const AUTHORITY_COLLECTION_KEYS = ['materials', 'sections', 'process', 'supports', 'loadCases'];
const DOMAIN_TO_COLLECTION = deepFreeze({
  MATERIAL: 'materials',
  SECTION: 'sections',
  PROCESS: 'process',
  SUPPORT: 'supports',
  LOAD_CASE: 'loadCases',
});
const ASSIGNMENT_KEYS = ['assignmentId', 'entityId', 'domain', 'role', 'status', 'authorityId', 'diagnosticCodes'];
const TEMPERATURE_REQUIREMENT_KEYS = [
  'requirementId',
  'entityId',
  'role',
  'processField',
  'processStatus',
  'requestedTemperatureK',
  'materialStateStatus',
  'materialStateId',
  'diagnosticCodes',
];
const ROLE_TO_PROCESS_FIELD = deepFreeze({
  REFERENCE: 'referenceTemperature',
  OPERATING: 'operatingTemperature',
  DESIGN: 'designTemperature',
});

export function sealStagedJsonResolvedAnalysis(input, { dataset }) {
  const draft = normalizeResolvedAnalysis(input, dataset, false);
  draft.semanticHash = computeStagedJsonResolvedAnalysisSemanticHash(draft);
  draft.evidenceHash = computeStagedJsonResolvedAnalysisEvidenceHash(draft);
  return deepFreeze(draft);
}

export function requireStagedJsonResolvedAnalysis(value, { dataset }) {
  const accepted = normalizeResolvedAnalysis(value, dataset, true);
  if (accepted.semanticHash !== computeStagedJsonResolvedAnalysisSemanticHash(accepted)) {
    fail('STAGEDJSON_RESOLVED_ANALYSIS_SEMANTIC_HASH_MISMATCH', 'Resolved analysis semantic hash mismatch.');
  }
  if (accepted.evidenceHash !== computeStagedJsonResolvedAnalysisEvidenceHash(accepted)) {
    fail('STAGEDJSON_RESOLVED_ANALYSIS_EVIDENCE_HASH_MISMATCH', 'Resolved analysis evidence hash mismatch.');
  }
  return deepFreeze(accepted);
}

export function stagedJsonResolvedAnalysisSemanticProjection(value) {
  return {
    schema: value.schema,
    analysisId: value.analysisId,
    datasetRef: value.datasetRef,
    branchSubsetRef: value.branchSubsetRef,
    overlayRef: {
      schema: value.overlayRef.schema,
      overlayId: value.overlayRef.overlayId,
      semanticHash: value.overlayRef.semanticHash,
    },
    processInheritancePolicy: value.processInheritancePolicy,
    authorityRefs: Object.fromEntries(AUTHORITY_COLLECTION_KEYS.map((collection) => [
      collection,
      value.authorityRefs[collection].map((reference) => ({
        authorityId: reference.authorityId,
        schema: reference.schema,
        semanticHash: reference.semanticHash,
      })),
    ])),
    assignments: value.assignments,
    temperatureStateRequirements: value.temperatureStateRequirements,
    conflicts: value.conflicts,
    limitations: value.limitations,
  };
}

export function stagedJsonResolvedAnalysisEvidenceProjection(value) {
  return {
    semanticHash: value.semanticHash,
    overlayEvidenceHash: value.overlayRef.evidenceHash,
    authorityEvidence: Object.fromEntries(AUTHORITY_COLLECTION_KEYS.map((collection) => [
      collection,
      value.authorityRefs[collection].map((reference) => ({
        authorityId: reference.authorityId,
        evidenceHash: reference.evidenceHash,
      })),
    ])),
    diagnostics: value.diagnostics,
  };
}

export function computeStagedJsonResolvedAnalysisSemanticHash(value) {
  return semanticHash(stagedJsonResolvedAnalysisSemanticProjection(value));
}

export function computeStagedJsonResolvedAnalysisEvidenceHash(value) {
  return semanticHash(stagedJsonResolvedAnalysisEvidenceProjection(value));
}

function normalizeResolvedAnalysis(input, dataset, sealed) {
  exactKeys(input, sealed ? TOP_KEYS : TOP_KEYS.filter((key) => !['semanticHash', 'evidenceHash'].includes(key)), 'resolvedAnalysis');
  if (input.schema !== STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA) {
    fail('STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA_INVALID', `Expected ${STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA}.`);
  }
  const analysisId = text(input.analysisId, 'resolvedAnalysis.analysisId');
  const datasetRef = normalizeDatasetRef(input.datasetRef, dataset, 'resolvedAnalysis.datasetRef');
  const branchSubsetRef = normalizeBranchSubsetRef(input.branchSubsetRef, dataset);
  const overlayRef = normalizeOverlayRef(input.overlayRef);
  if (input.processInheritancePolicy !== STAGEDJSON_PROCESS_INHERITANCE_POLICY) {
    fail(
      'STAGEDJSON_RESOLVED_ANALYSIS_INHERITANCE_POLICY_INVALID',
      `Resolved analysis must declare ${STAGEDJSON_PROCESS_INHERITANCE_POLICY}.`,
    );
  }
  const authorityRefs = normalizeAuthorityRefs(input.authorityRefs);
  const assignments = normalizeAssignments(input.assignments, branchSubsetRef, authorityRefs);
  const temperatureStateRequirements = normalizeTemperatureRequirements(
    input.temperatureStateRequirements,
    branchSubsetRef,
  );
  return {
    schema: input.schema,
    analysisId,
    datasetRef,
    branchSubsetRef,
    overlayRef,
    processInheritancePolicy: input.processInheritancePolicy,
    authorityRefs,
    assignments,
    temperatureStateRequirements,
    conflicts: normalizeSemanticRecordList(input.conflicts, 'resolvedAnalysis.conflicts'),
    limitations: normalizeSemanticRecordList(input.limitations, 'resolvedAnalysis.limitations'),
    diagnostics: normalizeDiagnostics(input.diagnostics, 'resolvedAnalysis.diagnostics'),
    semanticHash: sealed ? hash(input.semanticHash, 'resolvedAnalysis.semanticHash') : '',
    evidenceHash: sealed ? hash(input.evidenceHash, 'resolvedAnalysis.evidenceHash') : '',
  };
}

function normalizeBranchSubsetRef(value, dataset) {
  exactKeys(value, ['schema', 'branchId', 'semanticHash', 'entityIds', 'supportEntityIds'], 'resolvedAnalysis.branchSubsetRef');
  if (value.schema !== 'workspace-branch-subset/v1') {
    fail('STAGEDJSON_RESOLVED_ANALYSIS_SUBSET_SCHEMA_INVALID', 'branchSubsetRef must reference workspace-branch-subset/v1.');
  }
  const branchId = text(value.branchId, 'resolvedAnalysis.branchSubsetRef.branchId');
  const entityIds = uniqueTextList(value.entityIds, 'resolvedAnalysis.branchSubsetRef.entityIds', false);
  const supportEntityIds = uniqueTextList(value.supportEntityIds, 'resolvedAnalysis.branchSubsetRef.supportEntityIds', true);
  const byId = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
  for (const entityId of entityIds) {
    const entity = byId.get(entityId);
    if (!entity || entity.branchId !== branchId) {
      fail('STAGEDJSON_RESOLVED_ANALYSIS_SUBSET_ENTITY_INVALID', `${entityId} is not in ${branchId}.`);
    }
  }
  const selected = new Set(entityIds);
  for (const supportEntityId of supportEntityIds) {
    const entity = byId.get(supportEntityId);
    if (!selected.has(supportEntityId) || !entity || entity.category !== 'support') {
      fail('STAGEDJSON_RESOLVED_ANALYSIS_SUBSET_SUPPORT_INVALID', `${supportEntityId} is not a selected support.`);
    }
  }
  return { schema: value.schema, branchId, semanticHash: hash(value.semanticHash, 'resolvedAnalysis.branchSubsetRef.semanticHash'), entityIds, supportEntityIds };
}

function normalizeOverlayRef(value) {
  exactKeys(value, ['schema', 'overlayId', 'semanticHash', 'evidenceHash'], 'resolvedAnalysis.overlayRef');
  if (value.schema !== 'analysis-authority-overlay/v1') {
    fail('STAGEDJSON_RESOLVED_ANALYSIS_OVERLAY_SCHEMA_INVALID', 'overlayRef must reference analysis-authority-overlay/v1.');
  }
  return {
    schema: value.schema,
    overlayId: text(value.overlayId, 'resolvedAnalysis.overlayRef.overlayId'),
    semanticHash: hash(value.semanticHash, 'resolvedAnalysis.overlayRef.semanticHash'),
    evidenceHash: hash(value.evidenceHash, 'resolvedAnalysis.overlayRef.evidenceHash'),
  };
}

function normalizeAuthorityRefs(value) {
  exactKeys(value, AUTHORITY_COLLECTION_KEYS, 'resolvedAnalysis.authorityRefs');
  const seen = new Set();
  return Object.fromEntries(AUTHORITY_COLLECTION_KEYS.map((collection) => {
    if (!Array.isArray(value[collection])) {
      fail('STAGEDJSON_RESOLVED_ANALYSIS_AUTHORITY_REFS_INVALID', `authorityRefs.${collection} must be an array.`);
    }
    const references = value[collection].map((reference, index) => {
      exactKeys(reference, AUTHORITY_REF_KEYS, `resolvedAnalysis.authorityRefs.${collection}[${index}]`);
      const result = {
        authorityId: text(reference.authorityId, `resolvedAnalysis.authorityRefs.${collection}[${index}].authorityId`),
        schema: text(reference.schema, `resolvedAnalysis.authorityRefs.${collection}[${index}].schema`),
        semanticHash: hash(reference.semanticHash, `resolvedAnalysis.authorityRefs.${collection}[${index}].semanticHash`),
        evidenceHash: hash(reference.evidenceHash, `resolvedAnalysis.authorityRefs.${collection}[${index}].evidenceHash`),
      };
      if (seen.has(result.authorityId)) {
        fail('STAGEDJSON_RESOLVED_ANALYSIS_AUTHORITY_ID_DUPLICATE', `Authority ${result.authorityId} is duplicated.`);
      }
      seen.add(result.authorityId);
      return result;
    }).sort((left, right) => ascii(left.authorityId, right.authorityId));
    return [collection, references];
  }));
}

function normalizeAssignments(value, subsetRef, authorityRefs) {
  if (!Array.isArray(value)) fail('STAGEDJSON_RESOLVED_ANALYSIS_ASSIGNMENTS_INVALID', 'assignments must be an array.');
  const entityIds = new Set(subsetRef.entityIds);
  const authorityIds = Object.fromEntries(AUTHORITY_COLLECTION_KEYS.map((collection) => [
    collection,
    new Set(authorityRefs[collection].map((reference) => reference.authorityId)),
  ]));
  const seen = new Set();
  return value.map((row, index) => {
    exactKeys(row, ASSIGNMENT_KEYS, `resolvedAnalysis.assignments[${index}]`);
    const assignmentId = text(row.assignmentId, `resolvedAnalysis.assignments[${index}].assignmentId`);
    if (seen.has(assignmentId)) fail('STAGEDJSON_RESOLVED_ANALYSIS_ASSIGNMENT_DUPLICATE', `Assignment ${assignmentId} is duplicated.`);
    seen.add(assignmentId);
    const entityId = text(row.entityId, `resolvedAnalysis.assignments[${index}].entityId`);
    if (!entityIds.has(entityId)) fail('STAGEDJSON_RESOLVED_ANALYSIS_ASSIGNMENT_ENTITY_INVALID', `${entityId} is outside the subset.`);
    const domain = enumValue(row.domain, Object.keys(DOMAIN_TO_COLLECTION), `resolvedAnalysis.assignments[${index}].domain`);
    const role = text(row.role, `resolvedAnalysis.assignments[${index}].role`);
    const status = enumValue(row.status, Object.values(STAGEDJSON_RESOLUTION_STATUS), `resolvedAnalysis.assignments[${index}].status`);
    const diagnosticCodes = uniqueTextList(row.diagnosticCodes, `resolvedAnalysis.assignments[${index}].diagnosticCodes`, true);
    let authorityId = null;
    if (status === STAGEDJSON_RESOLUTION_STATUS.MISSING) {
      if (row.authorityId !== null || diagnosticCodes.length === 0) {
        fail('STAGEDJSON_RESOLVED_ANALYSIS_MISSING_ASSIGNMENT_INVALID', `${assignmentId} MISSING must have no authorityId and at least one diagnostic.`);
      }
    } else {
      authorityId = text(row.authorityId, `resolvedAnalysis.assignments[${index}].authorityId`);
      const collection = DOMAIN_TO_COLLECTION[domain];
      if (!authorityIds[collection].has(authorityId)) {
        fail('STAGEDJSON_RESOLVED_ANALYSIS_ASSIGNMENT_AUTHORITY_INVALID', `${assignmentId} references unknown authority ${authorityId}.`);
      }
    }
    return { assignmentId, entityId, domain, role, status, authorityId, diagnosticCodes };
  }).sort((left, right) => ascii(left.assignmentId, right.assignmentId));
}

function normalizeTemperatureRequirements(value, subsetRef) {
  if (!Array.isArray(value)) {
    fail('STAGEDJSON_RESOLVED_ANALYSIS_TEMPERATURE_REQUIREMENTS_INVALID', 'temperatureStateRequirements must be an array.');
  }
  const entityIds = new Set(subsetRef.entityIds);
  const seen = new Set();
  return value.map((row, index) => {
    exactKeys(row, TEMPERATURE_REQUIREMENT_KEYS, `resolvedAnalysis.temperatureStateRequirements[${index}]`);
    const requirementId = text(row.requirementId, `resolvedAnalysis.temperatureStateRequirements[${index}].requirementId`);
    if (seen.has(requirementId)) fail('STAGEDJSON_RESOLVED_ANALYSIS_TEMPERATURE_REQUIREMENT_DUPLICATE', `${requirementId} is duplicated.`);
    seen.add(requirementId);
    const entityId = text(row.entityId, `resolvedAnalysis.temperatureStateRequirements[${index}].entityId`);
    if (!entityIds.has(entityId)) fail('STAGEDJSON_RESOLVED_ANALYSIS_TEMPERATURE_ENTITY_INVALID', `${entityId} is outside the subset.`);
    const role = enumValue(row.role, STAGEDJSON_TEMPERATURE_ROLES, `resolvedAnalysis.temperatureStateRequirements[${index}].role`);
    const processField = text(row.processField, `resolvedAnalysis.temperatureStateRequirements[${index}].processField`);
    if (processField !== ROLE_TO_PROCESS_FIELD[role]) {
      fail('STAGEDJSON_RESOLVED_ANALYSIS_TEMPERATURE_ROLE_INVALID', `${role} must use ${ROLE_TO_PROCESS_FIELD[role]}.`);
    }
    const processStatus = enumValue(row.processStatus, Object.values(STAGEDJSON_RESOLUTION_STATUS), `resolvedAnalysis.temperatureStateRequirements[${index}].processStatus`);
    let requestedTemperatureK = null;
    if (processStatus === STAGEDJSON_RESOLUTION_STATUS.MISSING) {
      if (row.requestedTemperatureK !== null) {
        fail('STAGEDJSON_RESOLVED_ANALYSIS_MISSING_TEMPERATURE_INVALID', `${requirementId} has no process temperature but carries requestedTemperatureK.`);
      }
    } else {
      requestedTemperatureK = normalizePositiveNumber(row.requestedTemperatureK, `resolvedAnalysis.temperatureStateRequirements[${index}].requestedTemperatureK`);
    }
    const materialStateStatus = enumValue(row.materialStateStatus, Object.values(STAGEDJSON_RESOLUTION_STATUS), `resolvedAnalysis.temperatureStateRequirements[${index}].materialStateStatus`);
    if (processStatus === STAGEDJSON_RESOLUTION_STATUS.MISSING
      && materialStateStatus !== STAGEDJSON_RESOLUTION_STATUS.MISSING) {
      fail(
        'STAGEDJSON_RESOLVED_ANALYSIS_MATERIAL_STATE_WITHOUT_TEMPERATURE',
        `${requirementId} cannot resolve a material state while its governing process temperature is missing.`,
      );
    }
    const diagnosticCodes = uniqueTextList(row.diagnosticCodes, `resolvedAnalysis.temperatureStateRequirements[${index}].diagnosticCodes`, true);
    let materialStateId = null;
    if (materialStateStatus === STAGEDJSON_RESOLUTION_STATUS.MISSING) {
      if (row.materialStateId !== null || diagnosticCodes.length === 0) {
        fail('STAGEDJSON_RESOLVED_ANALYSIS_MISSING_MATERIAL_STATE_INVALID', `${requirementId} MISSING material state requires diagnostics and no materialStateId.`);
      }
    } else {
      materialStateId = text(row.materialStateId, `resolvedAnalysis.temperatureStateRequirements[${index}].materialStateId`);
    }
    return { requirementId, entityId, role, processField, processStatus, requestedTemperatureK, materialStateStatus, materialStateId, diagnosticCodes };
  }).sort((left, right) => ascii(left.requirementId, right.requirementId));
}

function normalizeSemanticRecordList(value, path) {
  return normalizeDiagnostics(value, path).sort((left, right) => ascii(semanticHash(left), semanticHash(right)));
}
