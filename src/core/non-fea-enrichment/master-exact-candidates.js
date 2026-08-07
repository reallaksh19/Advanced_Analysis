import {
  createNonFeaEnrichmentProposal,
  listNonFeaEnrichmentFields,
} from './index.js';
import {
  canonicalStringify,
  canonicalizeJson,
  semanticHash,
} from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { validateSharedPipingModel } from '../shared-piping-model/shared-piping-model.js';

export const NON_FEA_APPROVED_MASTER_SNAPSHOT_SCHEMA = 'non-fea-approved-master-snapshot/v1';
export const NON_FEA_MASTER_EXACT_ADAPTER_POLICY_SCHEMA = 'non-fea-master-exact-adapter-policy/v1';
export const NON_FEA_MASTER_EXACT_CANDIDATE_BATCH_SCHEMA = 'non-fea-master-exact-candidate-batch/v1';

export const NON_FEA_MASTER_KEYS = Object.freeze([
  'lineList',
  'materialMap',
  'pipingClass',
  'weight',
]);

export const NON_FEA_MASTER_SELECTOR_KINDS = Object.freeze([
  'ENTITY',
  'PIPING_CLASS_BORE',
  'COMPONENT_TYPE_BORE',
  'SUPPORT_KIND',
]);

const SNAPSHOT_INPUT_KEYS = Object.freeze([
  'masterKey', 'source', 'mapping', 'normalizedRows', 'diagnostics', 'approval',
]);
const SNAPSHOT_KEYS = Object.freeze([
  'schema', 'masterKey', 'source', 'mapping', 'mappingSemanticHash',
  'normalizedRows', 'normalizedRowsSemanticHash', 'diagnostics', 'approval',
  'approvalSemanticHash', 'semanticHash',
]);
const SOURCE_KEYS = Object.freeze(['fileName', 'sheetName', 'sha256', 'byteLength']);
const APPROVAL_KEYS = Object.freeze(['status', 'approvedBy', 'approvedAt', 'basis']);
const POLICY_INPUT_KEYS = Object.freeze([
  'schema', 'policyId', 'masterKey', 'fieldId', 'selectorKind', 'selectorMap',
  'valueColumn', 'valueKind', 'unit',
]);
const POLICY_KEYS = Object.freeze([
  'schema', 'policyId', 'masterKey', 'fieldId', 'targetKind', 'selectorKind',
  'selectorMap', 'valueColumn', 'valueKind', 'unit', 'semanticHash',
]);
const BATCH_KEYS = Object.freeze([
  'schema', 'sourceSemanticHash', 'approvedMasterSnapshotSemanticHash',
  'policySemanticHash', 'status', 'proposalOnly', 'acceptedRecordCreated',
  'rows', 'proposals', 'blockers', 'semanticHash',
]);
const SELECTOR_PARTS = Object.freeze({
  ENTITY: Object.freeze(['entityId']),
  PIPING_CLASS_BORE: Object.freeze(['bore', 'pipingClass']),
  COMPONENT_TYPE_BORE: Object.freeze(['bore', 'componentType']),
  SUPPORT_KIND: Object.freeze(['supportKind']),
});
const VALUE_KINDS = Object.freeze(['NUMBER', 'TEXT']);

export function createNonFeaApprovedMasterSnapshot(input) {
  assertExactKeys(input, SNAPSHOT_INPUT_KEYS, 'approved master snapshot input');
  const masterKey = enumValue(input.masterKey, NON_FEA_MASTER_KEYS, 'Master key');
  const source = normalizeSource(input.source);
  const mapping = normalizeMapping(input.mapping);
  const normalizedRows = canonicalRecords(input.normalizedRows, 'normalizedRows');
  const diagnostics = canonicalRecords(input.diagnostics, 'diagnostics');
  const approval = normalizeApproval(input.approval);
  const material = {
    schema: NON_FEA_APPROVED_MASTER_SNAPSHOT_SCHEMA,
    masterKey,
    source,
    mapping,
    mappingSemanticHash: semanticHash(mapping),
    normalizedRows,
    normalizedRowsSemanticHash: semanticHash(normalizedRows),
    diagnostics,
    approval,
    approvalSemanticHash: semanticHash(approval),
  };
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}

export function validateNonFeaApprovedMasterSnapshot(value) {
  assertExactKeys(value, SNAPSHOT_KEYS, 'approved master snapshot');
  if (value.schema !== NON_FEA_APPROVED_MASTER_SNAPSHOT_SCHEMA) {
    throw new TypeError(`Expected ${NON_FEA_APPROVED_MASTER_SNAPSHOT_SCHEMA}.`);
  }
  const rebuilt = createNonFeaApprovedMasterSnapshot({
    masterKey: value.masterKey,
    source: value.source,
    mapping: value.mapping,
    normalizedRows: value.normalizedRows,
    diagnostics: value.diagnostics,
    approval: value.approval,
  });
  if (canonicalStringify(rebuilt) !== canonicalStringify(value)) {
    throw new TypeError('Approved master snapshot semantic evidence is invalid.');
  }
  return value;
}

export function createNonFeaMasterExactAdapterPolicy(input) {
  assertExactKeys(input, POLICY_INPUT_KEYS, 'master exact-adapter policy input');
  if (input.schema !== NON_FEA_MASTER_EXACT_ADAPTER_POLICY_SCHEMA) {
    throw new TypeError(`Expected ${NON_FEA_MASTER_EXACT_ADAPTER_POLICY_SCHEMA}.`);
  }
  const masterKey = enumValue(input.masterKey, NON_FEA_MASTER_KEYS, 'Master key');
  const fieldId = requiredText(input.fieldId, 'Field ID');
  const field = listNonFeaEnrichmentFields().find((row) => row.fieldId === fieldId);
  if (!field) throw new TypeError(`Unsupported Non-FEA enrichment field: ${fieldId}.`);
  if (field.targetKind === 'SENSITIVITY') {
    throw new TypeError(`${fieldId} cannot be supplied by approved Master Data.`);
  }
  const selectorKind = enumValue(input.selectorKind, NON_FEA_MASTER_SELECTOR_KINDS, 'Selector kind');
  assertSelectorAllowed(field.targetKind, selectorKind);
  const selectorMap = normalizeSelectorMap(selectorKind, input.selectorMap);
  const valueKind = enumValue(input.valueKind, VALUE_KINDS, 'Value kind');
  const material = {
    schema: NON_FEA_MASTER_EXACT_ADAPTER_POLICY_SCHEMA,
    policyId: requiredText(input.policyId, 'Policy ID'),
    masterKey,
    fieldId,
    targetKind: field.targetKind,
    selectorKind,
    selectorMap,
    valueColumn: requiredText(input.valueColumn, 'Value column'),
    valueKind,
    unit: requiredText(input.unit, 'Unit'),
  };
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}

export function validateNonFeaMasterExactAdapterPolicy(value) {
  assertExactKeys(value, POLICY_KEYS, 'master exact-adapter policy');
  const rebuilt = createNonFeaMasterExactAdapterPolicy({
    schema: value.schema,
    policyId: value.policyId,
    masterKey: value.masterKey,
    fieldId: value.fieldId,
    selectorKind: value.selectorKind,
    selectorMap: value.selectorMap,
    valueColumn: value.valueColumn,
    valueKind: value.valueKind,
    unit: value.unit,
  });
  if (rebuilt.targetKind !== value.targetKind || rebuilt.semanticHash !== value.semanticHash) {
    throw new TypeError('Master exact-adapter policy semantic evidence is invalid.');
  }
  return value;
}

export function buildNonFeaApprovedMasterCandidateBatch(input) {
  if (!isPlainRecord(input)) throw new TypeError('Master exact-candidate batch input must be an object.');
  assertExactKeys(input, ['sourceModel', 'approvedMasterSnapshot', 'policy'], 'master exact-candidate batch input');
  const validation = validateSharedPipingModel(input.sourceModel);
  if (!validation.ok) throw new TypeError(`Invalid source model: ${validation.errors.join(' ')}`);
  const snapshot = validateNonFeaApprovedMasterSnapshot(input.approvedMasterSnapshot);
  const policy = validateNonFeaMasterExactAdapterPolicy(input.policy);
  if (snapshot.masterKey !== policy.masterKey) {
    throw new TypeError(`Approved master ${snapshot.masterKey} does not match adapter policy ${policy.masterKey}.`);
  }

  const mutableRows = snapshot.normalizedRows.map((row, index) => buildRowCandidate({
    sourceModel: input.sourceModel,
    snapshot,
    policy,
    row,
    index,
  }));
  const conflicts = applyTargetFieldConflicts(mutableRows, policy);
  const blockers = [...new Map([
    ...mutableRows.flatMap((row) => row.blockers),
    ...conflicts,
  ].map((item) => [`${item.code}|${item.path}|${item.message}`, item])).values()].sort(issueOrder);
  const proposals = mutableRows
    .flatMap((row) => row.proposals)
    .sort((left, right) => left.proposalId.localeCompare(right.proposalId));
  assertUnique(proposals.map((row) => row.proposalId), 'proposal IDs');
  const rows = mutableRows.map(finalizeRow).sort((left, right) => left.sourceRowSemanticHash.localeCompare(right.sourceRowSemanticHash));
  const material = {
    schema: NON_FEA_MASTER_EXACT_CANDIDATE_BATCH_SCHEMA,
    sourceSemanticHash: input.sourceModel.semanticHash,
    approvedMasterSnapshotSemanticHash: snapshot.semanticHash,
    policySemanticHash: policy.semanticHash,
    status: blockers.length ? 'BLOCKED' : 'READY_FOR_REVIEW',
    proposalOnly: true,
    acceptedRecordCreated: false,
    rows,
    proposals,
    blockers,
  };
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}

export function validateNonFeaMasterExactCandidateBatch(value) {
  assertExactKeys(value, BATCH_KEYS, 'master exact-candidate batch');
  if (value.schema !== NON_FEA_MASTER_EXACT_CANDIDATE_BATCH_SCHEMA) {
    throw new TypeError(`Expected ${NON_FEA_MASTER_EXACT_CANDIDATE_BATCH_SCHEMA}.`);
  }
  if (!['READY_FOR_REVIEW', 'BLOCKED'].includes(value.status)) {
    throw new TypeError('Master exact-candidate batch status is invalid.');
  }
  if (value.proposalOnly !== true || value.acceptedRecordCreated !== false) {
    throw new TypeError('Master exact-candidate batches are proposal-only and cannot create accepted authority.');
  }
  requiredText(value.sourceSemanticHash, 'Source semantic hash');
  requiredText(value.approvedMasterSnapshotSemanticHash, 'Approved master snapshot semantic hash');
  requiredText(value.policySemanticHash, 'Policy semantic hash');
  if (!Array.isArray(value.rows) || !Array.isArray(value.proposals) || !Array.isArray(value.blockers)) {
    throw new TypeError('Master exact-candidate batch rows, proposals, and blockers must be arrays.');
  }
  value.proposals.forEach(validateProposal);
  if (value.status === 'READY_FOR_REVIEW' && value.blockers.length) {
    throw new TypeError('READY_FOR_REVIEW master candidate batch cannot contain blockers.');
  }
  if (value.status === 'BLOCKED' && !value.blockers.length) {
    throw new TypeError('BLOCKED master candidate batch requires at least one blocker.');
  }
  const material = Object.fromEntries(BATCH_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
  if (semanticHash(material) !== value.semanticHash) {
    throw new TypeError('Master exact-candidate batch semantic hash is invalid.');
  }
  return value;
}

function buildRowCandidate({ sourceModel, snapshot, policy, row, index }) {
  const sourceRowSemanticHash = semanticHash(row);
  const blockers = [];
  const proposals = [];
  let selectorKey = null;
  let value = null;
  try {
    selectorKey = selectorKeyFromRow(policy, row);
  } catch (error) {
    blockers.push(issue('MASTER_EXACT_SELECTOR_INVALID', `normalizedRows[${index}]`, messageOf(error)));
  }
  try {
    value = valueFromRow(policy, row);
  } catch (error) {
    blockers.push(issue('MASTER_VALUE_INVALID', `normalizedRows[${index}]`, messageOf(error)));
  }
  const targets = selectorKey === null ? [] : exactTargets(sourceModel, policy, selectorKey);
  if (selectorKey !== null && targets.length === 0) {
    blockers.push(issue(
      'MASTER_EXACT_SELECTOR_NOT_MATCHED',
      `normalizedRows[${index}]`,
      `${policy.selectorKind}:${selectorKey} did not match an exact governed ${policy.targetKind.toLowerCase()}.`,
    ));
  }
  if (policy.selectorKind === 'ENTITY' && targets.length > 1) {
    blockers.push(issue(
      'MASTER_ENTITY_SELECTOR_AMBIGUOUS',
      `normalizedRows[${index}]`,
      `ENTITY:${selectorKey} matched multiple governed ${policy.targetKind.toLowerCase()} records.`,
    ));
  }
  if (!blockers.length) {
    targets.forEach((target) => proposals.push(proposalForTarget({
      sourceModel,
      snapshot,
      policy,
      row,
      sourceRowSemanticHash,
      selectorKey,
      target,
      value,
    })));
  }
  return {
    index,
    sourceRowSemanticHash,
    sourceRowNumber: nullableInteger(row._sourceRowNumber),
    sourceRowIndex: nullableInteger(row._sourceRowIndex),
    selectorKind: policy.selectorKind,
    selectorKey,
    targetIds: targets.map((target) => target.targetId).sort(),
    blockers,
    proposals,
  };
}

function proposalForTarget({
  sourceModel, snapshot, policy, row, sourceRowSemanticHash, selectorKey, target, value,
}) {
  const recordId = `master:${semanticHash({
    sourceSemanticHash: sourceModel.semanticHash,
    snapshotSemanticHash: snapshot.semanticHash,
    policySemanticHash: policy.semanticHash,
    sourceRowSemanticHash,
    targetKind: target.targetKind,
    targetId: target.targetId,
    fieldId: policy.fieldId,
  })}`;
  return createNonFeaEnrichmentProposal({
    proposalId: `proposal:${recordId}`,
    rationale: `Approved ${snapshot.masterKey} evidence exactly matched ${target.targetKind.toLowerCase()} ${target.targetId}.`,
    record: {
      recordId,
      selectorKind: 'ENTITY',
      selectorKey: target.targetId,
      fieldId: policy.fieldId,
      value,
      unit: policy.unit,
      authority: 'EXACT_APPROVED_MASTER',
      sourceId: `master:${snapshot.semanticHash}`,
      revision: snapshot.semanticHash,
      evidence: {
        source: 'APPROVED_MASTER_SNAPSHOT',
        sourceSemanticHash: sourceModel.semanticHash,
        masterKey: snapshot.masterKey,
        masterSnapshotSemanticHash: snapshot.semanticHash,
        masterSourceSha256: snapshot.source.sha256,
        sourceFileName: snapshot.source.fileName,
        sourceSheetName: snapshot.source.sheetName,
        sourceRowSemanticHash,
        sourceRowNumber: nullableInteger(row._sourceRowNumber),
        sourceRowIndex: nullableInteger(row._sourceRowIndex),
        approvalSemanticHash: snapshot.approvalSemanticHash,
        approvedBy: snapshot.approval.approvedBy,
        approvedAt: snapshot.approval.approvedAt,
        approvalBasis: snapshot.approval.basis,
        adapterPolicyId: policy.policyId,
        adapterPolicySemanticHash: policy.semanticHash,
        sourceSelectorKind: policy.selectorKind,
        sourceSelectorKey: selectorKey,
        exactTargetKind: target.targetKind,
        exactTargetId: target.targetId,
        matchMode: 'EXACT',
      },
      migration: null,
    },
  });
}

function applyTargetFieldConflicts(rows, policy) {
  const groups = new Map();
  rows.forEach((row) => row.proposals.forEach((proposal) => {
    const key = `${proposal.record.selectorKey}|${policy.fieldId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, proposal });
  }));
  const blockers = [];
  groups.forEach((entries, key) => {
    const sourceRows = new Set(entries.map((entry) => entry.row.sourceRowSemanticHash));
    if (sourceRows.size <= 1) return;
    const blocker = issue(
      'MASTER_TARGET_FIELD_AMBIGUOUS',
      key,
      'Multiple approved Master Data rows resolve to the same exact target field.',
    );
    blockers.push(blocker);
    entries.forEach(({ row, proposal }) => {
      row.blockers.push(blocker);
      row.proposals = row.proposals.filter((candidate) => candidate.proposalId !== proposal.proposalId);
    });
  });
  return blockers;
}

function finalizeRow(row) {
  const blockers = [...new Map(row.blockers.map((item) => [`${item.code}|${item.path}|${item.message}`, item])).values()]
    .sort(issueOrder);
  const proposals = [...row.proposals].sort((left, right) => left.proposalId.localeCompare(right.proposalId));
  return deepFreeze({
    sourceRowSemanticHash: row.sourceRowSemanticHash,
    sourceRowNumber: row.sourceRowNumber,
    sourceRowIndex: row.sourceRowIndex,
    selectorKind: row.selectorKind,
    selectorKey: row.selectorKey,
    targetIds: [...row.targetIds],
    status: blockers.length ? 'BLOCKED' : 'EXACT_MATCH_PROPOSAL_ONLY',
    proposalIds: proposals.map((proposal) => proposal.proposalId),
    bindingCreated: false,
    blockers,
  });
}

function exactTargets(model, policy, selectorKey) {
  if (policy.targetKind === 'COMPONENT') {
    return model.components
      .filter((component) => componentSelectorMatches(component, policy.selectorKind, selectorKey))
      .map((component) => ({ targetKind: 'COMPONENT', targetId: component.componentKey || component.sourceEntityId }))
      .sort(targetOrder);
  }
  return model.supports
    .filter((support) => supportSelectorMatches(support, policy.selectorKind, selectorKey))
    .map((support) => ({ targetKind: 'SUPPORT', targetId: support.supportKey || support.sourceEntityId }))
    .sort(targetOrder);
}

function componentSelectorMatches(component, selectorKind, selectorKey) {
  if (selectorKind === 'ENTITY') {
    return [component.componentKey, component.sourceEntityId].includes(selectorKey);
  }
  if (selectorKind === 'PIPING_CLASS_BORE') {
    return selectorKey === `${component.identity?.pipingClass || component.identity?.lineClass || ''}|${componentBore(component)}`;
  }
  if (selectorKind === 'COMPONENT_TYPE_BORE') {
    return selectorKey === `${component.type}|${componentBore(component)}`;
  }
  return false;
}

function supportSelectorMatches(support, selectorKind, selectorKey) {
  if (selectorKind === 'ENTITY') {
    return [support.supportKey, support.sourceEntityId].includes(selectorKey);
  }
  if (selectorKind !== 'SUPPORT_KIND') return false;
  const kind = String(firstEvidenceValue(support.supportEvidence?.supportTypes) || support.type || '').toUpperCase();
  return selectorKey === kind;
}

function selectorKeyFromRow(policy, row) {
  const parts = Object.fromEntries(Object.entries(policy.selectorMap).map(([part, column]) => [
    part,
    exactPart(row[column], `${policy.policyId}.${column}`),
  ]));
  if (policy.selectorKind === 'ENTITY') return parts.entityId;
  if (policy.selectorKind === 'PIPING_CLASS_BORE') return `${parts.pipingClass}|${parts.bore}`;
  if (policy.selectorKind === 'COMPONENT_TYPE_BORE') return `${parts.componentType}|${parts.bore}`;
  if (policy.selectorKind === 'SUPPORT_KIND') return parts.supportKind.toUpperCase();
  throw new TypeError(`Unsupported selector kind: ${policy.selectorKind}.`);
}

function valueFromRow(policy, row) {
  const raw = row[policy.valueColumn];
  if (policy.valueKind === 'NUMBER') {
    const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    if (!Number.isFinite(value)) throw new TypeError(`${policy.valueColumn} must be a finite number.`);
    return Object.is(value, -0) ? 0 : value;
  }
  return requiredText(raw, policy.valueColumn);
}

function normalizeSource(value) {
  assertExactKeys(value, SOURCE_KEYS, 'approved master source');
  const sha256 = requiredText(value.sha256, 'Source SHA-256').toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(sha256)) throw new TypeError('Source SHA-256 must be 64 hexadecimal characters.');
  const byteLength = Number(value.byteLength);
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new TypeError('Source byte length must be a non-negative safe integer.');
  }
  return deepFreeze({
    fileName: requiredText(value.fileName, 'Source file name'),
    sheetName: requiredText(value.sheetName, 'Source sheet name'),
    sha256,
    byteLength,
  });
}

function normalizeApproval(value) {
  assertExactKeys(value, APPROVAL_KEYS, 'approved master approval');
  if (value.status !== 'APPROVED') throw new TypeError('Master Data must be explicitly APPROVED before candidate generation.');
  const approvedAt = requiredText(value.approvedAt, 'Approved at');
  if (new Date(approvedAt).toISOString() !== approvedAt) {
    throw new TypeError('Approved at must be a canonical ISO-8601 timestamp.');
  }
  return deepFreeze({
    status: 'APPROVED',
    approvedBy: requiredText(value.approvedBy, 'Approved by'),
    approvedAt,
    basis: requiredText(value.basis, 'Approval basis'),
  });
}

function normalizeMapping(value) {
  if (!isPlainRecord(value)) throw new TypeError('Master mapping must be an object.');
  const normalized = {};
  Object.keys(value).sort().forEach((key) => {
    normalized[requiredText(key, 'Mapping field')] = requiredText(value[key], `Mapping ${key}`);
  });
  return deepFreeze(canonicalizeJson(normalized));
}

function normalizeSelectorMap(selectorKind, value) {
  if (!isPlainRecord(value)) throw new TypeError('Selector map must be an object.');
  const expected = SELECTOR_PARTS[selectorKind];
  assertExactKeys(value, expected, `${selectorKind} selector map`);
  return deepFreeze(Object.fromEntries(expected.map((part) => [part, requiredText(value[part], `${part} selector column`)])));
}

function assertSelectorAllowed(targetKind, selectorKind) {
  const componentAllowed = ['ENTITY', 'PIPING_CLASS_BORE', 'COMPONENT_TYPE_BORE'];
  const supportAllowed = ['ENTITY', 'SUPPORT_KIND'];
  const allowed = targetKind === 'COMPONENT' ? componentAllowed : supportAllowed;
  if (!allowed.includes(selectorKind)) {
    throw new TypeError(`${selectorKind} cannot target ${targetKind} enrichment fields.`);
  }
}

function validateProposal(value) {
  if (!isPlainRecord(value) || value.schema !== 'non-fea-enrichment-proposal/v1') {
    throw new TypeError('Master candidate batch contains an invalid enrichment proposal.');
  }
  const rebuilt = createNonFeaEnrichmentProposal({
    proposalId: value.proposalId,
    rationale: value.rationale,
    record: value.record,
  });
  if (rebuilt.semanticHash !== value.semanticHash) {
    throw new TypeError('Master candidate proposal semantic hash is invalid.');
  }
  if (value.record.authority !== 'EXACT_APPROVED_MASTER' || value.record.selectorKind !== 'ENTITY') {
    throw new TypeError('Master candidate proposals must be exact ENTITY proposals with approved-master authority.');
  }
}

function canonicalRecords(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const rows = value.map((row, index) => {
    if (!isPlainRecord(row)) throw new TypeError(`${label}[${index}] must be an object.`);
    return deepFreeze(canonicalizeJson(row));
  });
  rows.sort((left, right) => semanticHash(left).localeCompare(semanticHash(right))
    || canonicalStringify(left).localeCompare(canonicalStringify(right)));
  return deepFreeze(rows);
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function enumValue(value, allowed, label) {
  const text = requiredText(value, label);
  if (!allowed.includes(text)) throw new TypeError(`${label} must be one of: ${allowed.join(', ')}.`);
  return text;
}
function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required.`);
  return value.trim();
}
function exactPart(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
    return String(Object.is(value, -0) ? 0 : value);
  }
  return requiredText(value, label);
}
function nullableInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function componentBore(component) {
  return component.geometry?.boreMm ?? component.engineeringProperties?.nominalBoreMm?.value ?? '';
}
function firstEvidenceValue(rows) {
  return Array.isArray(rows) && rows.length ? rows[0]?.value : null;
}
function targetOrder(left, right) {
  return `${left.targetKind}|${left.targetId}`.localeCompare(`${right.targetKind}|${right.targetId}`);
}
function issue(code, path, message) {
  return deepFreeze({ code, path, message });
}
function issueOrder(left, right) {
  return `${left.code}|${left.path}|${left.message}`.localeCompare(`${right.code}|${right.path}|${right.message}`);
}
function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label}.`);
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
