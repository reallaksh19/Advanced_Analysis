/** Deterministic Wave 1 command certification receipts. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_COMMAND_RECEIPT_SCHEMA = 'TopologyEditCommandReceipt.v1';
export const TOPOLOGY_EDIT_RECEIPT_DISPOSITIONS = Object.freeze([
  'ACCEPTED',
  'REJECTED',
]);

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditAuthorityReceipt: ${label} is required.`);
  return text;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeBasis(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sessionVersion = Number(source.sessionVersion);
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) {
    throw new RangeError('TopologyEditAuthorityReceipt: basis.sessionVersion must be a non-negative integer.');
  }
  return {
    sourceHash: requiredText(source.sourceHash, 'basis.sourceHash'),
    baseCanonicalHash: requiredText(source.baseCanonicalHash, 'basis.baseCanonicalHash'),
    priorDraftHash: requiredText(source.priorDraftHash, 'basis.priorDraftHash'),
    sessionVersion,
  };
}

function normalizeReasons(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new TypeError('TopologyEditAuthorityReceipt: reasons must be an array.');
  }
  return value.map((row) => ({
    code: requiredText(row?.code, 'reason.code'),
    message: requiredText(row?.message, 'reason.message'),
  })).sort((left, right) => (
    left.code.localeCompare(right.code) || left.message.localeCompare(right.message)
  ));
}

function normalizeDisposition(value) {
  const disposition = requiredText(value, 'disposition').toUpperCase();
  if (!TOPOLOGY_EDIT_RECEIPT_DISPOSITIONS.includes(disposition)) {
    throw new RangeError(`TopologyEditAuthorityReceipt: unsupported disposition ${disposition}.`);
  }
  return disposition;
}

function normalizeResult(value) {
  return {
    candidateDraftHash: optionalText(value?.candidateDraftHash),
    canonicalTopologyHash: optionalText(value?.canonicalTopologyHash),
    editLedgerHash: optionalText(value?.editLedgerHash),
    validationHash: requiredText(value?.validationHash, 'result.validationHash'),
    checkerHash: optionalText(value?.checkerHash),
  };
}

function assertResultDisposition(result, disposition) {
  if (disposition === 'ACCEPTED') {
    const required = ['candidateDraftHash', 'canonicalTopologyHash', 'editLedgerHash', 'validationHash'];
    if (required.some((key) => !result[key])) {
      throw new TypeError('TopologyEditAuthorityReceipt: accepted receipts require candidate, canonical, ledger, and validation hashes.');
    }
  }
  if (disposition === 'REJECTED' && result.editLedgerHash !== null) {
    throw new TypeError('TopologyEditAuthorityReceipt: rejected receipts cannot issue an editLedgerHash.');
  }
}

function receiptMaterial(input) {
  const disposition = normalizeDisposition(input.disposition);
  const result = normalizeResult(input.result);
  assertResultDisposition(result, disposition);
  return {
    schema: TOPOLOGY_EDIT_COMMAND_RECEIPT_SCHEMA,
    commandId: requiredText(input.commandId, 'commandId'),
    commandType: requiredText(input.commandType, 'commandType').toUpperCase(),
    basis: normalizeBasis(input.basis),
    requestHash: requiredText(input.requestHash, 'requestHash'),
    resolutionHash: optionalText(input.resolutionHash),
    result,
    disposition,
    reasons: normalizeReasons(input.reasons),
  };
}

export function createTopologyEditAuthorityReceipt(input = {}) {
  const material = receiptMaterial(input);
  return deepFreeze({ ...material, receiptHash: semanticHash(material) });
}

export function assertTopologyEditAuthorityReceipt(value) {
  if (value?.schema !== TOPOLOGY_EDIT_COMMAND_RECEIPT_SCHEMA) {
    throw new TypeError(`Topology edit receipt must use ${TOPOLOGY_EDIT_COMMAND_RECEIPT_SCHEMA}.`);
  }
  const rebuilt = createTopologyEditAuthorityReceipt(value);
  if (rebuilt.receiptHash !== value.receiptHash) {
    throw new Error('TopologyEditAuthorityReceipt: receipt hash mismatch.');
  }
  return rebuilt;
}

export function proposedEditLedgerHash({
  basis,
  commandId,
  commandType,
  requestHash,
  resolutionHash,
  candidateDraftHash,
  validationHash,
} = {}) {
  return semanticHash({
    schema: 'TopologyEditAcceptedLedgerProjection.v1',
    basis: normalizeBasis(basis),
    commandId: requiredText(commandId, 'commandId'),
    commandType: requiredText(commandType, 'commandType').toUpperCase(),
    requestHash: requiredText(requestHash, 'requestHash'),
    resolutionHash: requiredText(resolutionHash, 'resolutionHash'),
    candidateDraftHash: requiredText(candidateDraftHash, 'candidateDraftHash'),
    validationHash: requiredText(validationHash, 'validationHash'),
  });
}
