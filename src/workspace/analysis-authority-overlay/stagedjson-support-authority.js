import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../core/shared-piping-model/immutable.js';
import {
  exactKeys,
  fail,
  hash,
  normalizeDatasetRef,
  normalizeDiagnostics,
  normalizeJsonValue,
  normalizeScope,
  normalizeStagedJsonResolvedField,
  stagedJsonFieldEvidenceProjection,
  stagedJsonFieldSemanticProjection,
  text,
  uniqueTextList,
} from './stagedjson-resolution-common.js';

export const STAGEDJSON_SUPPORT_AUTHORITY_SCHEMA = 'stagedjson-support-authority/v1';
export const STAGEDJSON_SUPPORT_FIELD_KEYS = deepFreeze([
  'assembly',
  'attachment',
  'restraintModel',
  'linearizationPolicy',
]);

const TOP_KEYS = [
  'schema',
  'supportAuthorityId',
  'datasetRef',
  'scope',
  'sourceEntityIds',
  'fields',
  'diagnostics',
  'semanticHash',
  'evidenceHash',
];
const FIELD_RULES = deepFreeze({
  assembly: { units: ['NONE'] },
  attachment: { units: ['mm', 'm', 'NONE'] },
  restraintModel: { units: ['NONE'] },
  linearizationPolicy: { units: ['NONE'] },
});

export function sealStagedJsonSupportAuthority(input, { dataset }) {
  const draft = normalizeSupportAuthority(input, dataset, false);
  draft.semanticHash = computeStagedJsonSupportAuthoritySemanticHash(draft);
  draft.evidenceHash = computeStagedJsonSupportAuthorityEvidenceHash(draft);
  return deepFreeze(draft);
}

export function requireStagedJsonSupportAuthority(value, { dataset }) {
  const accepted = normalizeSupportAuthority(value, dataset, true);
  if (accepted.semanticHash !== computeStagedJsonSupportAuthoritySemanticHash(accepted)) {
    fail('STAGEDJSON_SUPPORT_AUTHORITY_SEMANTIC_HASH_MISMATCH', 'Support authority semantic hash mismatch.');
  }
  if (accepted.evidenceHash !== computeStagedJsonSupportAuthorityEvidenceHash(accepted)) {
    fail('STAGEDJSON_SUPPORT_AUTHORITY_EVIDENCE_HASH_MISMATCH', 'Support authority evidence hash mismatch.');
  }
  return deepFreeze(accepted);
}

export function stagedJsonSupportAuthoritySemanticProjection(value) {
  return {
    schema: value.schema,
    supportAuthorityId: value.supportAuthorityId,
    datasetRef: value.datasetRef,
    scope: value.scope,
    sourceEntityIds: value.sourceEntityIds,
    fields: Object.fromEntries(STAGEDJSON_SUPPORT_FIELD_KEYS.map((field) => [
      field,
      stagedJsonFieldSemanticProjection(value.fields[field]),
    ])),
  };
}

export function stagedJsonSupportAuthorityEvidenceProjection(value) {
  return {
    semanticHash: value.semanticHash,
    fields: Object.fromEntries(STAGEDJSON_SUPPORT_FIELD_KEYS.map((field) => [
      field,
      stagedJsonFieldEvidenceProjection(value.fields[field]),
    ])),
    diagnostics: value.diagnostics,
  };
}

export function computeStagedJsonSupportAuthoritySemanticHash(value) {
  return semanticHash(stagedJsonSupportAuthoritySemanticProjection(value));
}

export function computeStagedJsonSupportAuthorityEvidenceHash(value) {
  return semanticHash(stagedJsonSupportAuthorityEvidenceProjection(value));
}

function normalizeSupportAuthority(input, dataset, sealed) {
  exactKeys(input, sealed ? TOP_KEYS : TOP_KEYS.filter((key) => !['semanticHash', 'evidenceHash'].includes(key)), 'supportAuthority');
  if (input.schema !== STAGEDJSON_SUPPORT_AUTHORITY_SCHEMA) {
    fail('STAGEDJSON_SUPPORT_AUTHORITY_SCHEMA_INVALID', `Expected ${STAGEDJSON_SUPPORT_AUTHORITY_SCHEMA}.`);
  }
  const supportAuthorityId = text(input.supportAuthorityId, 'supportAuthority.supportAuthorityId');
  const datasetRef = normalizeDatasetRef(input.datasetRef, dataset, 'supportAuthority.datasetRef');
  const scope = normalizeScope(input.scope, dataset, { path: 'supportAuthority.scope' });
  const sourceEntityIds = uniqueTextList(input.sourceEntityIds, 'supportAuthority.sourceEntityIds', false);
  const entitiesById = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
  for (const entityId of sourceEntityIds) {
    const entity = entitiesById.get(entityId);
    if (!entity || entity.branchId !== scope.branchId || entity.category !== 'support') {
      fail(
        'STAGEDJSON_SUPPORT_AUTHORITY_SOURCE_ENTITY_INVALID',
        `${entityId} is not a support in ${scope.branchId}.`,
      );
    }
  }
  exactKeys(input.fields, STAGEDJSON_SUPPORT_FIELD_KEYS, 'supportAuthority.fields');
  const fields = Object.fromEntries(STAGEDJSON_SUPPORT_FIELD_KEYS.map((field) => {
    const normalized = normalizeStagedJsonResolvedField(input.fields[field], {
      path: `supportAuthority.fields.${field}`,
      allowedUnits: FIELD_RULES[field].units,
      allowInherited: false,
      normalizeValue: normalizeJsonValue,
    });
    if (normalized.sourceEntityId !== null && !sourceEntityIds.includes(normalized.sourceEntityId)) {
      fail(
        'STAGEDJSON_SUPPORT_AUTHORITY_SOURCE_ENTITY_MISMATCH',
        `${field} cites a source entity outside supportAuthority.sourceEntityIds.`,
      );
    }
    return [field, normalized];
  }));
  return {
    schema: input.schema,
    supportAuthorityId,
    datasetRef,
    scope,
    sourceEntityIds,
    fields,
    diagnostics: normalizeDiagnostics(input.diagnostics, 'supportAuthority.diagnostics'),
    semanticHash: sealed ? hash(input.semanticHash, 'supportAuthority.semanticHash') : '',
    evidenceHash: sealed ? hash(input.evidenceHash, 'supportAuthority.evidenceHash') : '',
  };
}
