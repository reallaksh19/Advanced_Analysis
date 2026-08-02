import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { validateSharedPipingModel } from '../../core/shared-piping-model/shared-piping-model.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
  SHADOW_NONSTRUCTURAL_FIELD_REGISTRY,
} from './candidate-projection.js';
import { buildSharedModelStructuralAuthority } from './structural-authority.js';

export const ENRICHMENT_STRUCTURAL_IMPACT_SCHEMA =
  'EngineeringEnrichmentStructuralImpact.v2';

const INPUT_KEYS = Object.freeze(['sourceSharedModel', 'candidateProjection']);
const REPORT_KEYS = Object.freeze([
  'schema', 'sourceSharedModelHash', 'candidateProjectionHash',
  'sourceStructuralHash', 'candidateStructuralAuthorityHash',
  'verificationBasis', 'verifiedNonstructuralFieldIds', 'fieldScopeHash',
  'changes', 'blockers', 'status', 'topologyChanged', 'sealEligible',
  'calculationEligible', 'impactHash',
]);
const CHANGE_BUCKETS = Object.freeze([
  'centerlineEntities', 'ports', 'connectivity', 'branchPlacement',
  'sourceSupports', 'sourceReferences',
]);

export function buildEnrichmentStructuralImpactReport(input) {
  exact(input, INPUT_KEYS, 'Structural impact input');
  assertValidSharedModel(input.sourceSharedModel);
  const candidate = assertEngineeringEnrichmentCandidateProjection(
    input.candidateProjection,
  );
  if (candidate.sourceSharedModelHash !== input.sourceSharedModel.semanticHash) {
    fail('candidate sourceSharedModelHash differs from supplied model.', RangeError);
  }
  const sourceAuthority = buildSharedModelStructuralAuthority(input.sourceSharedModel);
  if (candidate.sourceStructuralHash !== sourceAuthority.structuralHash) {
    fail('candidate structural authority is stale or mismatched.', RangeError);
  }
  const verifiedNonstructuralFieldIds = [...new Set(
    candidate.rows.map((row) => row.fieldId),
  )].sort(ascii);
  verifiedNonstructuralFieldIds.forEach((fieldId) => {
    if (!SHADOW_NONSTRUCTURAL_FIELD_REGISTRY[fieldId]) {
      fail(`candidate field ${fieldId} is outside nonstructural scope.`, RangeError);
    }
  });
  const fieldScope = candidate.rows.map((row) => ({
    proposalId: row.proposalId,
    targetKind: row.targetKind,
    targetId: row.targetId,
    fieldId: row.fieldId,
    unit: row.unit,
    disposition: row.disposition,
  }));
  const changes = deepFreeze(Object.fromEntries(
    CHANGE_BUCKETS.map((bucket) => [bucket, []]),
  ));
  const material = {
    schema: ENRICHMENT_STRUCTURAL_IMPACT_SCHEMA,
    sourceSharedModelHash: input.sourceSharedModel.semanticHash,
    candidateProjectionHash: candidate.projectionHash,
    sourceStructuralHash: sourceAuthority.structuralHash,
    candidateStructuralAuthorityHash: sourceAuthority.structuralHash,
    verificationBasis: 'NONSTRUCTURAL_FIELD_SCOPE_CONTAINMENT',
    verifiedNonstructuralFieldIds: deepFreeze(verifiedNonstructuralFieldIds),
    fieldScopeHash: semanticHash(fieldScope),
    changes,
    blockers: [],
    status: 'PASS_SHADOW_NO_STRUCTURAL_CHANGE',
    topologyChanged: false,
    sealEligible: false,
    calculationEligible: false,
  };
  return deepFreeze({ ...material, impactHash: semanticHash(material) });
}

export function assertEngineeringEnrichmentStructuralImpact(value) {
  exact(value, REPORT_KEYS, 'Engineering enrichment structural impact');
  if (value.schema !== ENRICHMENT_STRUCTURAL_IMPACT_SCHEMA) {
    fail(`schema must be ${ENRICHMENT_STRUCTURAL_IMPACT_SCHEMA}.`);
  }
  if (value.status !== 'PASS_SHADOW_NO_STRUCTURAL_CHANGE'
    || value.verificationBasis !== 'NONSTRUCTURAL_FIELD_SCOPE_CONTAINMENT') {
    fail('status or verificationBasis is invalid.');
  }
  if (value.topologyChanged !== false
    || value.sealEligible !== false
    || value.calculationEligible !== false) {
    fail('structural report must not authorize topology, seal, or calculation.', RangeError);
  }
  const fields = sortedUniqueText(
    value.verifiedNonstructuralFieldIds,
    'verifiedNonstructuralFieldIds',
  );
  fields.forEach((fieldId) => {
    if (!SHADOW_NONSTRUCTURAL_FIELD_REGISTRY[fieldId]) {
      fail(`unregistered nonstructural field ${fieldId}.`, RangeError);
    }
  });
  requiredText(value.fieldScopeHash, 'fieldScopeHash');
  if (!isPlainRecord(value.changes)) fail('changes must be an object.');
  if (!same(Object.keys(value.changes).sort(ascii), [...CHANGE_BUCKETS].sort(ascii))) {
    fail('changes keys are invalid.');
  }
  CHANGE_BUCKETS.forEach((bucket) => {
    if (!Array.isArray(value.changes[bucket]) || value.changes[bucket].length !== 0) {
      fail(`changes.${bucket} must remain empty.`, RangeError);
    }
  });
  if (!Array.isArray(value.blockers) || value.blockers.length !== 0) {
    fail('blockers must be empty for a passing structural report.', RangeError);
  }
  if (value.sourceStructuralHash !== value.candidateStructuralAuthorityHash) {
    fail('candidate structural authority differs from source.', RangeError);
  }
  const material = { ...value };
  delete material.impactHash;
  if (value.impactHash !== semanticHash(canonicalizeJson(material))) {
    fail('impactHash is invalid.', RangeError);
  }
  return value;
}

function assertValidSharedModel(model) {
  const validation = validateSharedPipingModel(model);
  if (!validation.ok) {
    fail(`sourceSharedModel is invalid: ${validation.errors.join(' | ')}.`);
  }
}
function sortedUniqueText(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array.`);
  }
  const rows = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  if (!same(rows, [...new Set(rows)].sort(ascii))) {
    fail(`${label} must be sorted and unique.`);
  }
  return rows;
}
function exact(value, keys, label) {
  if (!isPlainRecord(value)
    || !same(Object.keys(value).sort(ascii), [...keys].sort(ascii))) {
    fail(`${label} keys are invalid.`);
  }
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function same(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentStructuralImpact: ${message}`);
}
