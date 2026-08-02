import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { assertMasterDataSnapshot } from './master-snapshot.js';
import { assertExactSelector, buildExactSelector } from './selectors.js';

export const COMPONENT_WEIGHT_POLICY_SCHEMA = 'ComponentWeightAdapterPolicy.v1';
export const ENRICHMENT_PROPOSAL_SCHEMA = 'EngineeringEnrichmentProposal.v1';

const POLICY_KEYS = Object.freeze([
  'schema', 'adapterId', 'selectorKind', 'selectorMap', 'valueColumn',
  'sourceUnit', 'canonicalUnit',
]);
const PROPOSAL_KEYS = Object.freeze([
  'schema', 'proposalId', 'adapterId', 'masterKey', 'sourceSnapshotHash',
  'sourceRowHash', 'fieldId', 'selector', 'value', 'unit', 'authorityLevel',
  'status', 'blockers', 'evidence', 'proposalHash',
]);
const EVIDENCE_KEYS = Object.freeze([
  'sourceFileName', 'sourceSheetName', 'sourceSha256', 'sourceRowNumber',
  'sourceRowIndex', 'policy', 'policyHash',
]);

export function buildComponentWeightProposals(input) {
  assertExactKeys(input, ['snapshot', 'policy'], 'Component-weight adapter input');
  const snapshot = assertMasterDataSnapshot(input.snapshot);
  if (snapshot.masterKey !== 'weight') fail('snapshot.masterKey must be weight.', RangeError);
  const policy = validateComponentWeightPolicy(input.policy);
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
  if (value.schema !== ENRICHMENT_PROPOSAL_SCHEMA) {
    fail(`schema must be ${ENRICHMENT_PROPOSAL_SCHEMA}.`);
  }
  if (value.masterKey !== 'weight') fail('masterKey must be weight.');
  if (value.fieldId !== 'componentWeightKg') fail('fieldId must be componentWeightKg.');
  if (value.unit !== 'kg') fail('unit must be kg.');
  if (value.authorityLevel !== 'AUTHORIZED_MASTER_CANDIDATE') {
    fail('authorityLevel is invalid.');
  }
  if (!['BLOCKED', 'PROPOSAL_ONLY'].includes(value.status)) fail('status is invalid.');
  if (!Array.isArray(value.blockers)) fail('blockers must be an array.');
  const blockers = canonicalRecords(value.blockers, 'blockers');
  if (canonicalStringify(blockers) !== canonicalStringify(value.blockers)) {
    fail('blockers must be in canonical order.', RangeError);
  }
  const evidence = validateEvidence(value.evidence);
  if (value.selector !== null) assertExactSelector(value.selector);
  if (value.value !== null && (!Number.isFinite(value.value) || value.value <= 0)) {
    fail('value must be null or a positive finite number.', RangeError);
  }
  if (value.status === 'PROPOSAL_ONLY'
    && (value.selector === null || value.value === null || blockers.length !== 0)) {
    fail('PROPOSAL_ONLY requires a selector, value, and no blockers.', RangeError);
  }
  if (value.status === 'BLOCKED' && blockers.length === 0) {
    fail('BLOCKED requires at least one blocker.', RangeError);
  }
  if (value.proposalHash !== semanticHash(proposalMaterial(value))) {
    fail('proposalHash is invalid.', RangeError);
  }
  if (value.proposalId !== semanticHash({
    adapterId: value.adapterId,
    sourceSnapshotHash: value.sourceSnapshotHash,
    sourceRowHash: value.sourceRowHash,
    fieldId: value.fieldId,
    selector: value.selector,
  })) fail('proposalId is invalid.', RangeError);
  if (evidence.policyHash !== semanticHash(evidence.policy)) {
    fail('evidence.policyHash is invalid.', RangeError);
  }
  return value;
}

export function assertEngineeringEnrichmentProposalAuthority(input) {
  assertExactKeys(input, ['proposal', 'masterSnapshots'], 'Proposal authority input');
  const proposal = assertEngineeringEnrichmentProposal(input.proposal);
  if (!Array.isArray(input.masterSnapshots) || input.masterSnapshots.length === 0) {
    fail('masterSnapshots must be a non-empty array.');
  }
  const snapshots = input.masterSnapshots.map(assertMasterDataSnapshot);
  const snapshot = snapshots.find((row) => row.snapshotHash === proposal.sourceSnapshotHash);
  if (!snapshot) fail(`proposal ${proposal.proposalId} references an unknown snapshot.`, RangeError);
  if (snapshot.masterKey !== proposal.masterKey) {
    fail(`proposal ${proposal.proposalId} masterKey differs from its snapshot.`, RangeError);
  }
  const matchingRows = snapshot.normalizedRows.filter(
    (row) => semanticHash(row) === proposal.sourceRowHash,
  );
  if (matchingRows.length !== 1) {
    fail(`proposal ${proposal.proposalId} does not resolve to exactly one snapshot row.`, RangeError);
  }
  const [row] = matchingRows;
  const evidence = proposal.evidence;
  if (evidence.sourceFileName !== snapshot.source.fileName
    || evidence.sourceSheetName !== snapshot.source.sheetName
    || evidence.sourceSha256 !== snapshot.source.sha256) {
    fail(`proposal ${proposal.proposalId} source evidence differs from its snapshot.`, RangeError);
  }
  if ((row._sourceRowNumber ?? null) !== evidence.sourceRowNumber
    || (row._sourceRowIndex ?? null) !== evidence.sourceRowIndex) {
    fail(`proposal ${proposal.proposalId} row identity differs from its snapshot row.`, RangeError);
  }
  const rebuilt = buildComponentWeightProposals({
    snapshot,
    policy: evidence.policy,
  }).find((candidate) => candidate.sourceRowHash === proposal.sourceRowHash);
  if (!rebuilt || canonicalStringify(rebuilt) !== canonicalStringify(proposal)) {
    fail(`proposal ${proposal.proposalId} cannot be reconstructed from source authority.`, RangeError);
  }
  return proposal;
}

export function validateComponentWeightPolicy(value) {
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
  const selectorMap = {};
  Object.keys(value.selectorMap).sort(compareAscii).forEach((partName) => {
    selectorMap[partName] = requiredText(
      value.selectorMap[partName],
      `policy.selectorMap.${partName}`,
    );
  });
  buildExactSelector(value.selectorKind, Object.fromEntries(
    Object.keys(selectorMap).map((partName) => [partName, `__${partName}__`]),
  ));
  return deepFreeze({
    schema: COMPONENT_WEIGHT_POLICY_SCHEMA,
    adapterId,
    selectorKind: value.selectorKind,
    selectorMap: deepFreeze(selectorMap),
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
    selector = buildExactSelector(policy.selectorKind, Object.fromEntries(
      Object.entries(policy.selectorMap).map(
        ([partName, columnName]) => [partName, row[columnName]],
      ),
    ));
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
    policy,
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
    value: Number.isFinite(value) && value > 0 ? value : null,
    unit: policy.canonicalUnit,
    authorityLevel: 'AUTHORIZED_MASTER_CANDIDATE',
    status: blockers.length ? 'BLOCKED' : 'PROPOSAL_ONLY',
    blockers: canonicalRecords(blockers, 'blockers'),
    evidence,
  };
  return deepFreeze({ ...material, proposalHash: semanticHash(material) });
}

function validateEvidence(value) {
  assertExactKeys(value, EVIDENCE_KEYS, 'Engineering enrichment proposal evidence');
  const policy = validateComponentWeightPolicy(value.policy);
  const sourceSha256 = requiredText(value.sourceSha256, 'evidence.sourceSha256');
  if (!/^[a-f0-9]{64}$/u.test(sourceSha256)) {
    fail('evidence.sourceSha256 must be lowercase SHA-256.', RangeError);
  }
  nullableNonnegativeInteger(value.sourceRowNumber, 'evidence.sourceRowNumber');
  nullableNonnegativeInteger(value.sourceRowIndex, 'evidence.sourceRowIndex');
  return {
    sourceFileName: requiredText(value.sourceFileName, 'evidence.sourceFileName'),
    sourceSheetName: requiredText(value.sourceSheetName, 'evidence.sourceSheetName'),
    sourceSha256,
    sourceRowNumber: value.sourceRowNumber,
    sourceRowIndex: value.sourceRowIndex,
    policy,
    policyHash: requiredText(value.policyHash, 'evidence.policyHash'),
  };
}

function proposalMaterial(value) {
  const material = { ...value };
  delete material.proposalHash;
  return material;
}

function canonicalRecords(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const rows = value.map((row, index) => {
    if (!isPlainRecord(row)) fail(`${label}[${index}] must be an object.`);
    return deepFreeze(canonicalizeJson(row));
  });
  rows.sort((left, right) => compareAscii(semanticHash(left), semanticHash(right))
    || compareAscii(canonicalStringify(left), canonicalStringify(right)));
  return deepFreeze(rows);
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}.`, RangeError);
}
function nullableNonnegativeInteger(value, label) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    fail(`${label} must be null or a non-negative safe integer.`, RangeError);
  }
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
