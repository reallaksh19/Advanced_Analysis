import {
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import {
  deepFreeze,
  isPlainRecord,
} from '../../core/shared-piping-model/immutable.js';
import {
  validateSharedPipingModel,
} from '../../core/shared-piping-model/shared-piping-model.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
} from './candidate-projection.js';
import {
  buildSharedModelStructuralAuthority,
} from './structural-authority.js';

export const ENRICHMENT_STRUCTURAL_IMPACT_SCHEMA =
  'EngineeringEnrichmentStructuralImpact.v1';

const INPUT_KEYS = Object.freeze([
  'sourceSharedModel',
  'candidateProjection',
]);
const REPORT_KEYS = Object.freeze([
  'schema',
  'sourceSharedModelHash',
  'candidateProjectionHash',
  'sourceStructuralHash',
  'candidateStructuralAuthorityHash',
  'changes',
  'blockers',
  'status',
  'topologyChanged',
  'sealEligible',
  'calculationEligible',
  'impactHash',
]);
const CHANGE_BUCKETS = Object.freeze([
  'centerlineEntities',
  'ports',
  'connectivity',
  'branchPlacement',
  'sourceSupports',
  'sourceReferences',
]);

export function buildEnrichmentStructuralImpactReport(input) {
  assertExactKeys(input, INPUT_KEYS, 'Structural impact input');
  assertValidSharedModel(input.sourceSharedModel);
  const candidate = assertEngineeringEnrichmentCandidateProjection(
    input.candidateProjection,
  );
  if (candidate.sourceSharedModelHash !== input.sourceSharedModel.semanticHash) {
    fail(
      'candidate sourceSharedModelHash differs from supplied model.',
      RangeError,
    );
  }
  const sourceAuthority = buildSharedModelStructuralAuthority(
    input.sourceSharedModel,
  );
  if (candidate.sourceStructuralHash !== sourceAuthority.structuralHash) {
    fail(
      'candidate structural authority is stale or mismatched.',
      RangeError,
    );
  }

  const changes = deepFreeze(Object.fromEntries(
    CHANGE_BUCKETS.map((bucket) => [bucket, []]),
  ));
  const material = {
    schema: ENRICHMENT_STRUCTURAL_IMPACT_SCHEMA,
    sourceSharedModelHash: input.sourceSharedModel.semanticHash,
    candidateProjectionHash: candidate.projectionHash,
    sourceStructuralHash: sourceAuthority.structuralHash,
    candidateStructuralAuthorityHash: candidate.sourceStructuralHash,
    changes,
    blockers: [],
    status: 'PASS_SHADOW_NO_STRUCTURAL_CHANGE',
    topologyChanged: false,
    sealEligible: false,
    calculationEligible: false,
  };
  return deepFreeze({
    ...material,
    impactHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentStructuralImpact(value) {
  assertExactKeys(
    value,
    REPORT_KEYS,
    'Engineering enrichment structural impact',
  );
  if (value.schema !== ENRICHMENT_STRUCTURAL_IMPACT_SCHEMA) {
    fail(`schema must be ${ENRICHMENT_STRUCTURAL_IMPACT_SCHEMA}.`);
  }
  if (value.status !== 'PASS_SHADOW_NO_STRUCTURAL_CHANGE') {
    fail('status is invalid.');
  }
  if (
    value.topologyChanged !== false
    || value.sealEligible !== false
    || value.calculationEligible !== false
  ) {
    fail('shadow structural report must not authorize topology, seal, or calculation.', RangeError);
  }
  if (!isPlainRecord(value.changes)) fail('changes must be an object.');
  CHANGE_BUCKETS.forEach((bucket) => {
    if (!Array.isArray(value.changes[bucket])) {
      fail(`changes.${bucket} must be an array.`);
    }
    if (value.changes[bucket].length !== 0) {
      fail(`changes.${bucket} must remain empty.`, RangeError);
    }
  });
  if (!Array.isArray(value.blockers) || value.blockers.length !== 0) {
    fail('blockers must be an empty array for a passing structural report.', RangeError);
  }
  if (value.sourceStructuralHash !== value.candidateStructuralAuthorityHash) {
    fail('candidate structural authority differs from source.', RangeError);
  }
  const material = {
    schema: value.schema,
    sourceSharedModelHash: value.sourceSharedModelHash,
    candidateProjectionHash: value.candidateProjectionHash,
    sourceStructuralHash: value.sourceStructuralHash,
    candidateStructuralAuthorityHash: value.candidateStructuralAuthorityHash,
    changes: canonicalizeJson(value.changes),
    blockers: canonicalizeJson(value.blockers),
    status: value.status,
    topologyChanged: value.topologyChanged,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
  };
  if (value.impactHash !== semanticHash(material)) {
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

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentStructuralImpact: ${message}`);
}
