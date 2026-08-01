/** Deterministic Wave 1 command certification receipts. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_COMMAND_RECEIPT_SCHEMA = 'TopologyEditCommandReceipt.v1';
export const TOPOLOGY_EDIT_RECEIPT_DISPOSITIONS = Object.freeze(['ACCEPTED', 'REJECTED']);

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
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) throw new RangeError('TopologyEditAuthorityReceipt: basis.sessionVersion must be a non-negative integer.');
  return {
    sourceHash: requiredText(source.sourceHash, 'basis.sourceHash'),
    baseCanonicalHash: requiredText(source.baseCanonicalHash, 'basis.baseCanonicalHash'),
    priorDraftHash: requiredText(source.priorDraftHash, 'basis.priorDraftHash'),
    sessionVersion,
  };
}

function normalizeReasons(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError('TopologyEditAuthorityReceipt: reasons must be an array.');
  return value.map((row) => ({
    code: requiredText(row?.code, 'reason.code'),
    message: requiredText(row?.message, 'reason.message'),
  })).sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
}

export function createTopologyEditAuthorityReceipt(input = {}) {
  const disposition = requiredText(input.disposition, 'disposition').toUpperCase();
  if (!TOPOLOGY_EDIT_RECEIPT_DISPOSITIONS.includes(disposition)) throw new RangeError(`TopologyEditAuthorityReceipt: unsupported disposition ${disposition}.`);
  const accepted = disposition === 'ACCEPTED';
  const result = {
    candidateDraftHash: optionalText(input.result?.candidateDraftHash),
    canonicalTopologyHash: optionalText(input.result?.canonicalTopologyHash),
    editLedgerHash: optionalText(input.result?.editLedgerHash),
    validationHash: requiredText(input.result?.validationHash, 'result.validationHash'),
    checkerHash: optionalText(input.result?.checkerHash),
  };
  if (accepted && Object.entries(result).some(([key, value]) => key !== 'checkerHash' && !value)) {
    throw new TypeError('TopologyEditAuthorityReceipt: accepted receipts require candidate, canonical, ledger, and validation hashes.');
  }
  if (!accepted && result.editLedgerHash !== null) {
    throw new TypeError('TopologyEditAuthorityReceipt: rejected receipts cannot issue an editLedgerHash.');
  }
  const material = {
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
  return deepFreeze({ ...material, receiptHash: semanticHash(material) });
}

export function assertTopologyEditAuthorityReceipt(value) {
  if (value?.schema !== TOPOLOGY_EDIT_COMMAND_RECEIPT_SCHEMA) throw new TypeError(`Topology edit receipt must use ${TOPOLOGY_EDIT_COMMAND_RECEIPT_SCHEMA}.`);
  const rebuilt = createTopologyEditAuthorityReceipt(value);
  if (rebuilt.receiptHash !== value.receiptHash) throw new Error('TopologyEditAuthorityReceipt: receipt hash mismatch.');
  return rebuilt;
}

export function proposedEditLedgerHash({ basis, commandId, commandType, requestHash, resolutionHash, candidateDraftHash, validationHash } = {}) {
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
