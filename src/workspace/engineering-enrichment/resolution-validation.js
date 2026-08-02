import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  ENRICHMENT_RESOLUTION_SCHEMA,
  ENRICHMENT_TARGET_KINDS,
} from './resolution.js';

const RESOLUTION_KEYS = Object.freeze([
  'schema', 'sourceDatasetHash', 'sourceSharedModelHash', 'masterSnapshotHashes',
  'proposalHashes', 'rows', 'summary', 'bindingCreated', 'resolutionHash',
]);
const ROW_KEYS = Object.freeze([
  'proposalId', 'disposition', 'targetIds', 'targetRefs', 'selectedTargetId',
  'selectedTargetRef', 'bindingCreated', 'blockers',
]);
const REF_KEYS = Object.freeze(['targetKind', 'targetId']);
const DISPOSITIONS = Object.freeze([
  'BLOCKED_PROPOSAL', 'NO_MATCH', 'AMBIGUOUS_MATCH', 'EXACT_MATCH_PROPOSAL_ONLY',
]);

export function assertEngineeringEnrichmentResolution(value) {
  assertExactKeys(value, RESOLUTION_KEYS, 'Engineering enrichment resolution');
  if (value.schema !== ENRICHMENT_RESOLUTION_SCHEMA) {
    fail(`schema must be ${ENRICHMENT_RESOLUTION_SCHEMA}.`);
  }
  requireSha(value.sourceDatasetHash, 'sourceDatasetHash');
  requiredText(value.sourceSharedModelHash, 'sourceSharedModelHash');
  const snapshotHashes = sortedUniqueText(
    value.masterSnapshotHashes,
    'masterSnapshotHashes',
    true,
  );
  const proposalHashes = sortedUniqueText(value.proposalHashes, 'proposalHashes', false);
  if (value.bindingCreated !== false) {
    fail('foundation resolution must not create bindings.', RangeError);
  }
  if (!Array.isArray(value.rows)) fail('rows must be an array.');
  const rows = value.rows.map(validateRow);
  const proposalIds = rows.map((row) => row.proposalId);
  if (!sameList(proposalIds, [...new Set(proposalIds)].sort(compareAscii))) {
    fail('rows must be sorted and unique by proposalId.', RangeError);
  }
  const summary = summarize(rows);
  if (canonicalStringify(value.summary) !== canonicalStringify(summary)) {
    fail('summary is invalid.', RangeError);
  }
  const material = {
    schema: value.schema,
    sourceDatasetHash: value.sourceDatasetHash,
    sourceSharedModelHash: value.sourceSharedModelHash,
    masterSnapshotHashes: snapshotHashes,
    proposalHashes,
    rows: value.rows,
    summary: value.summary,
    bindingCreated: value.bindingCreated,
  };
  if (value.resolutionHash !== semanticHash(material)) {
    fail('resolutionHash is invalid.', RangeError);
  }
  return value;
}

function validateRow(row, index) {
  assertExactKeys(row, ROW_KEYS, `rows[${index}]`);
  const proposalId = requiredText(row.proposalId, `rows[${index}].proposalId`);
  if (!DISPOSITIONS.includes(row.disposition)) {
    fail(`rows[${index}].disposition is invalid.`);
  }
  if (row.bindingCreated !== false) {
    fail(`rows[${index}] created a binding.`, RangeError);
  }
  const refs = validateRefs(row.targetRefs, `rows[${index}].targetRefs`);
  const targetIds = refs.map((ref) => ref.targetId);
  if (canonicalStringify(row.targetIds) !== canonicalStringify(targetIds)) {
    fail(`rows[${index}].targetIds differ from targetRefs.`, RangeError);
  }
  const selected = row.selectedTargetRef === null
    ? null
    : validateRef(row.selectedTargetRef, `rows[${index}].selectedTargetRef`);
  if ((selected?.targetId ?? null) !== row.selectedTargetId) {
    fail(`rows[${index}] selected target fields disagree.`, RangeError);
  }
  if (selected && !refs.some((ref) => sameRef(ref, selected))) {
    fail(`rows[${index}] selected target is not in targetRefs.`, RangeError);
  }
  const blockers = canonicalRecords(row.blockers, `rows[${index}].blockers`);
  if (canonicalStringify(blockers) !== canonicalStringify(row.blockers)) {
    fail(`rows[${index}].blockers must be canonical.`, RangeError);
  }
  const exact = row.disposition === 'EXACT_MATCH_PROPOSAL_ONLY';
  if (exact !== (refs.length === 1 && selected !== null && blockers.length === 0)) {
    fail(`rows[${index}] exact disposition evidence is inconsistent.`, RangeError);
  }
  if (row.disposition === 'AMBIGUOUS_MATCH' && refs.length < 2) {
    fail(`rows[${index}] ambiguous match requires multiple targets.`, RangeError);
  }
  if (row.disposition !== 'EXACT_MATCH_PROPOSAL_ONLY' && blockers.length === 0) {
    fail(`rows[${index}] unresolved disposition requires blockers.`, RangeError);
  }
  return { proposalId, disposition: row.disposition };
}

function validateRefs(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const refs = value.map((row, index) => validateRef(row, `${label}[${index}]`));
  const identities = refs.map(refIdentity);
  if (!sameList(identities, [...new Set(identities)].sort(compareAscii))) {
    fail(`${label} must be sorted and unique.`, RangeError);
  }
  return refs;
}
function validateRef(value, label) {
  assertExactKeys(value, REF_KEYS, label);
  if (!ENRICHMENT_TARGET_KINDS.includes(value.targetKind)) {
    fail(`${label}.targetKind is invalid.`);
  }
  return deepFreeze({
    targetKind: value.targetKind,
    targetId: requiredText(value.targetId, `${label}.targetId`),
  });
}
function refIdentity(value) { return `${value.targetKind}\u0000${value.targetId}`; }
function sameRef(left, right) {
  return left.targetKind === right.targetKind && left.targetId === right.targetId;
}
function summarize(rows) {
  const dispositions = {};
  rows.forEach((row) => {
    dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;
  });
  const exactMatchCount = dispositions.EXACT_MATCH_PROPOSAL_ONLY || 0;
  return {
    proposalCount: rows.length,
    exactMatchCount,
    unresolvedCount: rows.length - exactMatchCount,
    dispositions: canonicalizeJson(dispositions),
    status: exactMatchCount === rows.length ? 'READY_FOR_REVIEW' : 'BLOCKED',
  };
}
function canonicalRecords(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const rows = value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`${label}[${index}] must be an object.`);
    return canonicalizeJson(row);
  });
  rows.sort((left, right) => compareAscii(semanticHash(left), semanticHash(right))
    || compareAscii(canonicalStringify(left), canonicalStringify(right)));
  return rows;
}
function sortedUniqueText(value, label, required) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    fail(`${label} must be ${required ? 'a non-empty ' : 'an '}array.`);
  }
  const rows = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  if (!sameList(rows, [...new Set(rows)].sort(compareAscii))) {
    fail(`${label} must be sorted and unique.`, RangeError);
  }
  return rows;
}
function requireSha(value, label) {
  const text = requiredText(value, label);
  if (!/^[a-f0-9]{64}$/u.test(text)) fail(`${label} must be lowercase SHA-256.`);
  return text;
}
function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (!sameList(actual, wanted)) fail(`${label} keys are invalid.`);
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function sameList(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
function compareAscii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentValidation: ${message}`);
}
