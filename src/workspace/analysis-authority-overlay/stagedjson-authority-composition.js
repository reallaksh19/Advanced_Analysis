import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import { buildSupportSiteModel } from '../support-sites/support-site-model.js';
import { extractBranchSubset } from './branch-extraction.js';
import {
  ANALYSIS_AUTHORITY_OVERLAY_SCHEMA,
  sealAnalysisAuthorityOverlay,
} from './overlay-contract.js';
import {
  STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA,
  sealStagedJsonResolvedAnalysis,
} from './stagedjson-resolved-analysis.js';
import {
  STAGEDJSON_PROCESS_INHERITANCE_POLICY,
  STAGEDJSON_RESOLUTION_STATUS,
} from './stagedjson-resolution-common.js';
import { buildStagedJsonSelectedBranchInventory } from './stagedjson-selected-branch-inventory.js';
import { resolveStagedJsonProcessAuthorities } from './stagedjson-process-resolution.js';
import { resolveStagedJsonSupportAuthorities } from './stagedjson-support-resolution.js';

export const STAGEDJSON_AUTHORITY_COMPOSITION_SCHEMA = 'stagedjson-authority-composition/v1';

export function composeStagedJsonAnalysisAuthority({
  dataset,
  branchId,
  projectDataProfile,
  materialSectionAuthority,
  materialSectionResolverSource,
}) {
  requireDataset(dataset);
  const selectedBranchId = requireText(branchId, 'branchId');
  requireMaterialSectionAuthority(materialSectionAuthority);
  const branchSubset = extractBranchSubset(dataset, selectedBranchId, projectDataProfile);
  const supportSiteModel = buildSupportSiteModel(dataset, projectDataProfile);
  const inventory = buildStagedJsonSelectedBranchInventory({
    dataset,
    branchId: selectedBranchId,
    materialSectionAuthority,
    materialSectionResolverSource,
  });
  requireSubsetMatchesInventory(branchSubset, inventory);
  const processAuthorities = resolveStagedJsonProcessAuthorities({
    dataset,
    branchId: selectedBranchId,
    analysisEntityIds: inventory.analysisEntityIds,
  });
  const supportAuthorities = resolveStagedJsonSupportAuthorities({
    dataset,
    branchId: selectedBranchId,
    supportSiteModel,
  });
  const overlay = composeOverlay({
    dataset,
    branchId: selectedBranchId,
    materialSectionAuthority,
    supportAuthorities,
  });
  const resolvedAnalysis = composeResolvedAnalysis({
    dataset,
    branchSubset,
    inventory,
    overlay,
    materialSectionAuthority,
    processAuthorities,
    supportAuthorities,
  });
  return deepFreeze({
    schema: STAGEDJSON_AUTHORITY_COMPOSITION_SCHEMA,
    branchId: selectedBranchId,
    status: 'BLOCKED_PENDING_QUALIFIED_CANONICAL_ADAPTER',
    branchSubset,
    inventory,
    processAuthorities,
    supportAuthorities,
    overlay,
    resolvedAnalysis,
    semanticHash: semanticHash({
      schema: STAGEDJSON_AUTHORITY_COMPOSITION_SCHEMA,
      branchSubsetSemanticHash: branchSubset.semanticHash,
      inventorySemanticHash: inventory.semanticHash,
      processSemanticHashes: processAuthorities.map((row) => row.semanticHash),
      supportSemanticHashes: supportAuthorities.map((row) => row.semanticHash),
      overlaySemanticHash: overlay.semanticHash,
      resolvedAnalysisSemanticHash: resolvedAnalysis.semanticHash,
    }),
  });
}

function composeOverlay({ dataset, branchId, materialSectionAuthority, supportAuthorities }) {
  const materialRecords = uniqueResolutionRecords(
    materialSectionAuthority.entityResolutions,
    'materialStateId',
    'materialResolutionSemanticHash',
  );
  const sectionRecords = uniqueResolutionRecords(
    materialSectionAuthority.entityResolutions,
    'sectionStateId',
    'sectionResolutionSemanticHash',
  );
  const entityAssignments = materialSectionAuthority.entityResolutions.map((resolution) => ({
    entityId: resolution.entityId,
    material: approvedReference(
      { materialStateId: resolution.materialStateId },
      'M008_C_MATERIAL_RESOLUTION',
      resolution.entityId,
      resolution.materialResolutionSemanticHash,
    ),
    section: approvedReference(
      { sectionStateId: resolution.sectionStateId },
      'M008_C_SECTION_RESOLUTION',
      resolution.entityId,
      resolution.sectionResolutionSemanticHash,
    ),
  }));
  for (const authority of supportAuthorities) {
    for (const entityId of authority.sourceEntityIds) {
      entityAssignments.push({
        entityId,
        support: approvedReference(
          { supportAuthorityId: authority.supportAuthorityId },
          'M022_C_STAGED_SUPPORT_AUTHORITY',
          entityId,
          authority.semanticHash,
        ),
      });
    }
  }
  return sealAnalysisAuthorityOverlay({
    schema: ANALYSIS_AUTHORITY_OVERLAY_SCHEMA,
    overlayId: `STAGEDJSON:OVERLAY:${branchId}:R1`,
    revision: 1,
    datasetRef: datasetRef(dataset),
    scope: { kind: 'BRANCH', branchId },
    authorityRecords: {
      materials: materialRecords.map((row) => ({ materialStateId: row.id, resolutionSemanticHash: row.hash })),
      sections: sectionRecords.map((row) => ({ sectionStateId: row.id, resolutionSemanticHash: row.hash })),
      supports: supportAuthorities.map((authority) => ({
        supportAuthorityId: authority.supportAuthorityId,
        resolutionSemanticHash: authority.semanticHash,
      })),
      loadCases: [],
    },
    assignments: {
      branches: [],
      entities: entityAssignments,
    },
    governance: {
      precedence: ['ENTITY', 'BRANCH'],
      missingAssignment: 'BLOCK',
      ambiguousAssignment: 'BLOCK',
      conflictingAssignment: 'BLOCK',
      orphanAssignment: 'BLOCK',
      staleEvidence: 'BLOCK',
    },
  }, { dataset });
}

function composeResolvedAnalysis({
  dataset,
  branchSubset,
  inventory,
  overlay,
  materialSectionAuthority,
  processAuthorities,
  supportAuthorities,
}) {
  const materialRefs = authorityRefsFromResolutions(
    materialSectionAuthority.entityResolutions,
    'materialStateId',
    'materialResolutionSemanticHash',
    'fea-linear-material-resolution/v1',
  );
  const sectionRefs = authorityRefsFromResolutions(
    materialSectionAuthority.entityResolutions,
    'sectionStateId',
    'sectionResolutionSemanticHash',
    'fea-linear-pipe-section-resolution/v1',
  );
  const processByEntity = new Map(processAuthorities.map((row) => [row.scope.entityId, row]));
  const supportByEntity = new Map();
  for (const authority of supportAuthorities) {
    for (const entityId of authority.sourceEntityIds) supportByEntity.set(entityId, authority);
  }
  const materialByEntity = new Map(materialSectionAuthority.entityResolutions.map((row) => [row.entityId, row]));
  const assignments = [];
  const temperatureStateRequirements = [];
  for (const entityId of inventory.analysisEntityIds) {
    const resolution = materialByEntity.get(entityId);
    const process = processByEntity.get(entityId);
    if (!resolution || !process) fail('STAGEDJSON_COMPOSITION_ANALYSIS_ENTITY_AUTHORITY_MISSING', `${entityId} lacks material/section/process authority.`);
    assignments.push(
      assignment(`A:MATERIAL:BASE:${entityId}`, entityId, 'MATERIAL', 'BASE_M008_C', 'DECLARED', resolution.materialStateId, []),
      assignment(`A:MATERIAL:OPERATING:${entityId}`, entityId, 'MATERIAL', 'OPERATING', 'MISSING', null, ['STAGEDJSON_OPERATING_MATERIAL_STATE_MISSING']),
      assignment(`A:MATERIAL:DESIGN:${entityId}`, entityId, 'MATERIAL', 'DESIGN', 'MISSING', null, ['STAGEDJSON_DESIGN_MATERIAL_STATE_MISSING']),
      assignment(`A:SECTION:${entityId}`, entityId, 'SECTION', 'PIPE_SECTION', 'DECLARED', resolution.sectionStateId, []),
      assignment(`A:PROCESS:${entityId}`, entityId, 'PROCESS', 'EFFECTIVE_PROCESS', 'DECLARED', process.processAuthorityId, []),
    );
    temperatureStateRequirements.push(
      temperatureRequirement(entityId, 'REFERENCE', process.fields.referenceTemperature, 'STAGEDJSON_REFERENCE_MATERIAL_STATE_MISSING'),
      temperatureRequirement(entityId, 'OPERATING', process.fields.operatingTemperature, 'STAGEDJSON_OPERATING_MATERIAL_STATE_MISSING'),
      temperatureRequirement(entityId, 'DESIGN', process.fields.designTemperature, 'STAGEDJSON_DESIGN_MATERIAL_STATE_MISSING'),
    );
  }
  for (const entityId of inventory.supportEntityIds) {
    const authority = supportByEntity.get(entityId);
    if (!authority) fail('STAGEDJSON_COMPOSITION_SUPPORT_AUTHORITY_MISSING', `${entityId} lacks staged support authority.`);
    assignments.push(assignment(
      `A:SUPPORT:${entityId}`,
      entityId,
      'SUPPORT',
      'SOURCE_SUPPORT_GROUPING',
      'DECLARED',
      authority.supportAuthorityId,
      [],
    ));
  }
  const limitations = [
    ...inventory.qualificationBlockers,
    {
      code: 'ENRICHED_SJSON_CANONICAL_PIPING_ADAPTER_NOT_WIRED',
      scope: 'PIPELINE',
      details: 'M022-C ends at governed authority composition. Canonical geometry and B-2.5 compilation remain a separate qualification batch.',
    },
    {
      code: 'STAGEDJSON_SUPPORT_SOLVER_AUTHORITY_UNRESOLVED',
      scope: 'SUPPORT',
      details: 'Support grouping is governed, but attachment/restraint/linearization fields remain MISSING until canonical support authority can be proven.',
    },
  ];
  return sealStagedJsonResolvedAnalysis({
    schema: STAGEDJSON_RESOLVED_ANALYSIS_SCHEMA,
    analysisId: `STAGEDJSON:ANALYSIS:${inventory.branchId}:R1`,
    datasetRef: datasetRef(dataset),
    branchSubsetRef: {
      schema: branchSubset.schema,
      branchId: branchSubset.branchId,
      semanticHash: branchSubset.semanticHash,
      entityIds: branchSubset.entityIds,
      supportEntityIds: branchSubset.supportEntityIds,
    },
    overlayRef: {
      schema: overlay.schema,
      overlayId: overlay.overlayId,
      semanticHash: overlay.semanticHash,
      evidenceHash: overlay.evidenceHash,
    },
    processInheritancePolicy: STAGEDJSON_PROCESS_INHERITANCE_POLICY,
    authorityRefs: {
      materials: materialRefs,
      sections: sectionRefs,
      process: processAuthorities.map(contractAuthorityRef),
      supports: supportAuthorities.map(contractAuthorityRef),
      loadCases: [],
    },
    assignments,
    temperatureStateRequirements,
    conflicts: inventory.sourceConflicts,
    limitations,
    diagnostics: [{
      severity: 'BLOCKER',
      code: 'STAGEDJSON_AUTHORITY_COMPOSITION_NOT_SOLVER_READY',
      message: 'Governed source authorities are sealed, but unresolved hot-material/support/canonical-adapter gates prohibit solver execution.',
    }],
  }, { dataset });
}

function authorityRefsFromResolutions(rows, idKey, hashKey, schema) {
  return uniqueResolutionRecords(rows, idKey, hashKey).map((row) => ({
    authorityId: row.id,
    schema,
    semanticHash: row.hash,
    evidenceHash: semanticHash({
      schema: 'stagedjson-resolution-evidence-ref/v1',
      authorityId: row.id,
      resolutionSemanticHash: row.hash,
      entityIds: rows.filter((candidate) => candidate[idKey] === row.id).map((candidate) => candidate.entityId).sort(ascii),
      evidence: rows.filter((candidate) => candidate[idKey] === row.id).map((candidate) => candidate.evidence),
    }),
  }));
}

function uniqueResolutionRecords(rows, idKey, hashKey) {
  const byId = new Map();
  for (const row of rows) {
    const id = requireText(row[idKey], idKey);
    const hash = requireText(row[hashKey], hashKey);
    if (byId.has(id) && byId.get(id) !== hash) {
      fail('STAGEDJSON_COMPOSITION_RESOLUTION_CONFLICT', `${id} has conflicting resolution hashes.`);
    }
    byId.set(id, hash);
  }
  return [...byId.entries()].sort(([left], [right]) => ascii(left, right)).map(([id, hash]) => ({ id, hash }));
}

function contractAuthorityRef(authority) {
  const authorityId = authority.processAuthorityId || authority.supportAuthorityId;
  return {
    authorityId,
    schema: authority.schema,
    semanticHash: authority.semanticHash,
    evidenceHash: authority.evidenceHash,
  };
}

function approvedReference(value, source, locator, sourceSemanticHash) {
  return {
    value,
    evidence: { source, locator, sourceSemanticHash },
    approved: true,
  };
}
function assignment(assignmentId, entityId, domain, role, status, authorityId, diagnosticCodes) {
  return { assignmentId, entityId, domain, role, status, authorityId, diagnosticCodes };
}
function temperatureRequirement(entityId, role, field, missingMaterialCode) {
  const processField = role === 'REFERENCE' ? 'referenceTemperature' : role === 'OPERATING' ? 'operatingTemperature' : 'designTemperature';
  const processMissing = field.status === STAGEDJSON_RESOLUTION_STATUS.MISSING;
  return {
    requirementId: `T:${role}:${entityId}`,
    entityId,
    role,
    processField,
    processStatus: field.status,
    requestedTemperatureK: processMissing ? null : toKelvin(field.value, field.unit),
    materialStateStatus: STAGEDJSON_RESOLUTION_STATUS.MISSING,
    materialStateId: null,
    diagnosticCodes: [...new Set([...field.diagnosticCodes, missingMaterialCode])].sort(ascii),
  };
}
function toKelvin(value, unit) {
  if (!Number.isFinite(value)) fail('STAGEDJSON_COMPOSITION_TEMPERATURE_INVALID', 'Declared process temperature must be finite.');
  if (unit === 'K') return value;
  if (unit === 'degC') return Number((value + 273.15).toFixed(12));
  fail('STAGEDJSON_COMPOSITION_TEMPERATURE_UNIT_INVALID', `Unsupported temperature unit ${unit}.`);
}
function datasetRef(dataset) {
  return {
    datasetId: dataset.datasetId,
    sourceId: dataset.sourceName,
    sourceSha256: dataset.sourceSha256,
    sourceSnapshotSemanticHash: dataset.sourceSnapshot.sourceSemanticHash,
  };
}
function requireSubsetMatchesInventory(subset, inventory) {
  if (JSON.stringify([...subset.entityIds].sort(ascii)) !== JSON.stringify([...inventory.entityIds].sort(ascii))
    || JSON.stringify([...subset.supportEntityIds].sort(ascii)) !== JSON.stringify([...inventory.supportEntityIds].sort(ascii))) {
    fail('STAGEDJSON_COMPOSITION_SUBSET_INVENTORY_MISMATCH', 'Branch subset and selected-branch inventory disagree.');
  }
}
function requireMaterialSectionAuthority(authority) {
  if (!authority || !Array.isArray(authority.entityResolutions) || authority.entityResolutions.length === 0) {
    fail('STAGEDJSON_COMPOSITION_MATERIAL_SECTION_AUTHORITY_INVALID', 'M008-C material/section authority is required.');
  }
}
function requireDataset(dataset) {
  if (!dataset || dataset.schema !== 'analysis-workspace-dataset/v1' || !Array.isArray(dataset.entities)) {
    fail('STAGEDJSON_COMPOSITION_DATASET_INVALID', 'A normalized workspace dataset is required.');
  }
}
function requireText(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail('STAGEDJSON_COMPOSITION_INPUT_INVALID', `${path} must be a nonempty string.`);
  return value.trim();
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message, details) {
  const error = new Error(message);
  error.name = 'StagedJsonAuthorityCompositionError';
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}
