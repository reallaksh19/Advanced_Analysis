import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  STAGEDJSON_SUPPORT_AUTHORITY_SCHEMA,
  sealStagedJsonSupportAuthority,
} from './stagedjson-support-authority.js';
import { STAGEDJSON_RESOLUTION_STATUS } from './stagedjson-resolution-common.js';

export function resolveStagedJsonSupportAuthorities({ dataset, branchId, supportSiteModel }) {
  requireDataset(dataset);
  const selectedBranchId = requireText(branchId, 'branchId');
  requireSupportSiteModel(supportSiteModel, dataset);
  const selectedSupportIds = dataset.entities
    .filter((entity) => entity.branchId === selectedBranchId && entity.category === 'support')
    .map((entity) => entity.entityId)
    .sort(ascii);
  const authorities = supportSiteModel.assemblies
    .filter((assembly) => assembly.branchId === selectedBranchId)
    .map((assembly) => sealAssemblyAuthority(dataset, selectedBranchId, assembly, supportSiteModel))
    .sort((left, right) => ascii(left.supportAuthorityId, right.supportAuthorityId));
  requireExactCoverage(selectedSupportIds, authorities);
  return deepFreeze(authorities);
}

function sealAssemblyAuthority(dataset, branchId, assembly, supportSiteModel) {
  const sourceEntityIds = [...assembly.memberEntityIds].sort(ascii);
  if (sourceEntityIds.length === 0) {
    fail('STAGEDJSON_SUPPORT_RESOLUTION_ASSEMBLY_EMPTY', `${assembly.assemblyId} has no source support records.`);
  }
  const site = supportSiteModel.sites.find((row) => row.assemblyIds.includes(assembly.assemblyId));
  if (!site) fail('STAGEDJSON_SUPPORT_RESOLUTION_SITE_MISSING', `${assembly.assemblyId} is absent from support-site grouping.`);
  const members = sourceEntityIds.map((entityId) => {
    const member = assembly.members.find((row) => row.entityId === entityId);
    if (!member) fail('STAGEDJSON_SUPPORT_RESOLUTION_MEMBER_MISSING', `${entityId} is absent from ${assembly.assemblyId}.`);
    return member;
  });
  const assemblyField = declaredAssembly(dataset, assembly, site, members);
  const diagnostics = [
    diagnostic('STAGEDJSON_SUPPORT_ATTACHMENT_UNRESOLVED', 'Attachment authority requires a qualified canonical/shared piping model and is not created from source text.'),
    diagnostic('STAGEDJSON_SUPPORT_RESTRAINT_UNRESOLVED', 'Solver restraint authority remains unresolved until governed attachment/restraint compilation.'),
    diagnostic('STAGEDJSON_SUPPORT_LINEARIZATION_UNDECLARED', 'No linearization policy is inferred from raw support text.'),
  ];
  if (site.branchIds.length > 1) {
    diagnostics.push(diagnostic(
      'STAGEDJSON_SUPPORT_SITE_CROSS_BRANCH',
      `Support site ${site.siteId} is shared by branches ${[...site.branchIds].sort(ascii).join(', ')}.`,
    ));
  }
  return sealStagedJsonSupportAuthority({
    schema: STAGEDJSON_SUPPORT_AUTHORITY_SCHEMA,
    supportAuthorityId: `STAGEDJSON:SUPPORT:${assembly.assemblyId}`,
    datasetRef: datasetRef(dataset),
    scope: { branchId },
    sourceEntityIds,
    fields: {
      assembly: assemblyField,
      attachment: missing('NONE', 'STAGEDJSON_SUPPORT_ATTACHMENT_UNRESOLVED'),
      restraintModel: missing('NONE', 'STAGEDJSON_SUPPORT_RESTRAINT_UNRESOLVED'),
      linearizationPolicy: missing('NONE', 'STAGEDJSON_SUPPORT_LINEARIZATION_UNDECLARED'),
    },
    diagnostics: diagnostics.sort((left, right) => ascii(left.code, right.code)),
  }, { dataset });
}

function declaredAssembly(dataset, assembly, site, members) {
  const sourceEntityId = [...assembly.memberEntityIds].sort(ascii)[0];
  const sourceTypes = [...new Set(members.map((member) => member.sourceType).filter(Boolean))].sort(ascii);
  return {
    status: STAGEDJSON_RESOLUTION_STATUS.DECLARED,
    value: {
      assemblyId: assembly.assemblyId,
      siteId: site.siteId,
      tag: assembly.tag,
      branchId: assembly.branchId,
      positionMm: assembly.positionMm,
      sourceEntityIds: [...assembly.memberEntityIds].sort(ascii),
      sourceTypes,
      sourceCount: assembly.memberEntityIds.length,
    },
    unit: 'NONE',
    sourceEntityId,
    sourceField: 'SUPPORT_SITE_MODEL_ASSEMBLY',
    fromEntityId: null,
    diagnosticCodes: [],
    evidence: members.map((member) => ({
      source: 'SUPPORT_SITE_MODEL_SOURCE_RECORD',
      locator: member.jsonPointer || member.entityId,
      sourceSemanticHash: semanticHash({
        datasetSemanticHash: dataset.sourceSnapshot.sourceSemanticHash,
        entityId: member.entityId,
        tag: member.tag,
        sourceTag: member.sourceTag,
        sourceType: member.sourceType,
        positionMm: member.positionMm,
      }),
    })).sort((left, right) => ascii(left.locator, right.locator)),
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

function requireExactCoverage(selectedSupportIds, authorities) {
  const claimed = authorities.flatMap((authority) => authority.sourceEntityIds).sort(ascii);
  if (new Set(claimed).size !== claimed.length) {
    fail('STAGEDJSON_SUPPORT_RESOLUTION_COVERAGE_CONFLICT', 'A support source record is claimed by more than one support authority.');
  }
  if (JSON.stringify(claimed) !== JSON.stringify(selectedSupportIds)) {
    fail('STAGEDJSON_SUPPORT_RESOLUTION_COVERAGE_INCOMPLETE', 'Support authority grouping does not exactly cover the selected branch support records.', {
      selectedSupportIds,
      claimed,
    });
  }
}

function requireSupportSiteModel(model, dataset) {
  if (!model || model.schema !== 'support-site-model/v1' || model.datasetId !== dataset.datasetId) {
    fail('STAGEDJSON_SUPPORT_RESOLUTION_SITE_MODEL_INVALID', 'A support-site model for the active dataset is required.');
  }
  if (model.status !== 'READY') {
    fail('STAGEDJSON_SUPPORT_RESOLUTION_SITE_MODEL_BLOCKED', 'Support-site grouping must be READY before authority composition.', model.blockers);
  }
  if (!Array.isArray(model.assemblies) || !Array.isArray(model.sites)) {
    fail('STAGEDJSON_SUPPORT_RESOLUTION_SITE_MODEL_INVALID', 'Support-site model assemblies and sites are required.');
  }
}
function datasetRef(dataset) {
  return {
    datasetId: dataset.datasetId,
    sourceId: dataset.sourceName,
    sourceSha256: dataset.sourceSha256,
    sourceSnapshotSemanticHash: dataset.sourceSnapshot.sourceSemanticHash,
  };
}
function diagnostic(code, message) { return { severity: 'BLOCKER', code, message }; }
function requireDataset(dataset) {
  if (!dataset || dataset.schema !== 'analysis-workspace-dataset/v1' || !Array.isArray(dataset.entities)) {
    fail('STAGEDJSON_SUPPORT_RESOLUTION_DATASET_INVALID', 'A normalized workspace dataset is required.');
  }
}
function requireText(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail('STAGEDJSON_SUPPORT_RESOLUTION_INPUT_INVALID', `${path} must be a nonempty string.`);
  return value.trim();
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message, details) {
  const error = new Error(message);
  error.name = 'StagedJsonSupportResolutionError';
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}
