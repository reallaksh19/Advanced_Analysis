import { canonicalizeJson, semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { assertMasterDataSnapshot } from './master-snapshot.js';
import { buildExactSelector } from './selectors.js';

export const COMPONENT_WEIGHT_POLICY_SCHEMA = 'ComponentWeightAdapterPolicy.v1';
export const ENRICHMENT_PROPOSAL_SCHEMA = 'EngineeringEnrichmentProposal.v1';

const POLICY_KEYS = Object.freeze([
  'schema',
  'adapterId',
  'selectorKind',
  'selectorMap',
  'valueColumn',
  'sourceUnit',
  'canonicalUnit',
]);
const PROPOSAL_KEYS = Object.freeze([
  'schema',
  'proposalId',
  'adapterId',
  'masterKey',
  'sourceSnapshotHash',
  'sourceRowHash',
  'fieldId',
  'selector',
  'value',
  'unit',
  'authorityLevel',
  'status',
  'blockers',
  'evidence',
  'proposalHash',
]);

export function buildComponentWeightProposals(input) {
  assertExactKeys(input, ['snapshot', 'policy'], 'Component-weight adapter input');
  const snapshot = assertMasterDataSnapshot(input.snapshot);
  if (snapshot.masterKey !== 'weight') fail('snapshot.masterKey must be weight.', RangeError);
  const policy = validatePolicy(input.policy);
  const policyHash = semanticHash(policy);
  const proposals = snapshot.normalizedRows.map((row) => proposalFromRow(
    snapshot,
    policy,
    policyHash,
    row,
  ));
  proposals.sort((left, right) => compareAscii(left.proposalId, right.proposalId));
  assertUnique(proposals.map((row) => row.proposalId), 'proposalId');
  return deepFreeze(proposals);
}

export function assertEngineeringEnrichmentProposal(value) {
  assertExactKeys(value, PROPOSAL_KEYS, 'Engineering enrichment proposal');
  if (value.schema !== ENRICHMENT_PROPOSAL_SCHEMA) fail(`schema must be ${ENRICHMENT_PROPOSAL_SCHEMA}.`);
  if (value.masterKey !== 'weight') fail('masterKey must be weight.');
  if (value.fieldId !== 'componentWeightKg') fail('fieldId must be componentWeightKg.');
  if (value.unit !== 'kg') fail('unit must be kg.');
  if (value.authorityLevel !== 'AUTHORIZED_MASTER_CANDIDATE') fail('authorityLevel is invalid.');
  if (!['BLOCKED', 'PROPOSAL_ONLY'].includes(value.status)) fail('status is invalid.');
  if (!Array.isArray(value.blockers)) fail('blockers must be an array.');
  const material = proposalMaterial(value);
  if (value.proposalHash !== semanticHash(material)) fail('proposalHash is invalid.', RangeError);
  if (value.proposalId !== semanticHash({
    adapterId: value.adapterId,
    sourceSnapshotHash: value.sourceSnapshotHash,
    sourceRowHash: value.sourceRowHash,
    fieldId: value.fieldId,
    selector: value.selector,
  })) fail('proposalId is invalid.', RangeError);
  return value;
}

function validatePolicy(value) {
  assertExactKeys(value, POLICY_KEYS, 'Component-weight adapter policy');
  if (value.schema !== COMPONENT_WEIGHT_POLICY_SCHEMA) {
    fail(`policy.schema must be ${COMPONENT_WEIGHT_POLICY_SCHEMA}.`);
  }
  const adapterId = requiredText(value.adapterId, 'policy.adapterId');
  const valueColumn = requiredText(value.valueColumn, 'policy.valueColumn');
  const sourceUnit = requiredText(value.sourceUnit, 'policy.sourceUnit');
  const canonicalUnit = requiredText(value.canonicalUnit, 'policy.canonicalUnit');
  if (sourceUnit !== canonicalUnit) fail('unit conversion is not authorized.', RangeError);
  if (canonicalUnit !== 'kg') fail('component-weight canonicalUnit must be kg.', RangeError);
  if (!isPlainRecord(value.selectorMap)) fail('policy.selectorMap must be an object.');
  const selectorMap = canonicalizeJson(value.selectorMap);
  const semanticParts = {};
  Object.entries(selectorMap).forEach(([partName, columnName]) => {
    semanticParts[partName] = requiredText(columnName, `policy.selectorMap.${partName}`);
  });
  buildExactSelector(value.selectorKind, Object.fromEntries(
    Object.keys(semanticParts).map((partName) => [partName, `__${partName}__`]),
  ));
  return deepFreeze({
    schema: COMPONENT_WEIGHT_POLICY_SCHEMA,
    adapterId,
    selectorKind: value.selectorKind,
    selectorMap: semanticParts,
    valueColumn,
    sourceUnit,
    canonicalUnit,
  });
}

function proposalFromRow(snapshot, policy, policyHash, row) {
  const sourceRowHash = semanticHash(row);
  const blockers = [];
  let selector = null;
  try {
    const parts = Object.fromEntries(Object.entries(policy.selectorMap).map(
      ([partName, columnName]) => [partName, row[columnName]],
    ));
    selector = buildExactSelector(policy.selectorKind, parts);
  } catch (error) {
    blockers.push({
      code: 'MISSING_EXACT_SELECTOR_VALUE',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const value = Number(row[policy.valueColumn]);
  if (!Number.isFinite(value) || value <= 0) {
    blockers.push({
      code: 'INVALID_COMPONENT_WEIGHT',
      column: policy.valueColumn,
      observed: row[policy.valueColumn] ?? null,
    });
  }
  const evidence = deepFreeze({
    sourceFileName: snapshot.source.fileName,
    sourceSheetName: snapshot.source.sheetName,
    sourceSha256: snapshot.source.sha256,
    sourceRowNumber: row._sourceRowNumber ?? null,
    sourceRowIndex: row._sourceRowIndex ?? null,
    policyHash,
  });
  const proposalId = semanticHash({
    adapterId: policy.adapterId,
    sourceSnapshotHash: snapshot.snapshotHash,
    sourceRowHash,
    fieldId: 'componentWeightKg',
    selector,
  });
  const material = {
    schema: ENRICHMENT_PROPOSAL_SCHEMA,
    proposalId,
    adapterId: policy.adapterId,
    masterKey: snapshot.masterKey,
    sourceSnapshotHash: snapshot.snapshotHash,
    sourceRowHash,
    fieldId: 'componentWeightKg',
    selector,
    value: Number.isFinite(value) ? value : null,
    unit: policy.canonicalUnit,
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    status: blockers.length ? 'BLOCKED' : 'PROPOSAL_ONLY',
    blockers: canonicalizeJson(blockers),
    evidence,
  };
  return deepFreeze({ ...material, proposalHash: semanticHash(material) });
}

function proposalMaterial(value) {
  return {
    schema: value.schema,
    proposalId: value.proposalId,
    adapterId: value.adapterId,
    masterKey: value.masterKey,
    sourceSnapshotHash: value.sourceSnapshotHash,
    sourceRowHash: value.sourceRowHash,
    fieldId: value.fieldId,
    selector: value.selector,
    value: value.value,
    unit: value.unit,
    authorityLevel: value.authorityLevel,
    status: value.status,
    blockers: value.blockers,
    evidence: value.evidence,
  };
}

function assertUnique(values, label) {
  const seen = new Set();
  values.forEach((value) => {
    if (seen.has(value)) fail(`duplicate ${label}: ${value}.`, RangeError);
    seen.add(value);
  });
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function compareAscii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`ComponentWeightAdapter: ${message}`);
}
