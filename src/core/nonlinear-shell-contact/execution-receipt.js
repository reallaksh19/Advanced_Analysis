import {
  SCHEMAS,
  assertEnum,
  assertExactKeys,
  assertGitSha,
  assertHash,
  assertId,
  clonePlain,
  semanticHash,
} from './contracts.js';
import { QUALIFICATION_STATES } from './authority.js';

export function validateExecutionReceipt(receipt) {
  assertExactKeys(receipt, [
    'schema',
    'requestId',
    'exactHeadSha',
    'baseSha',
    'canonicalModelHash',
    'solverProfileHash',
    'deckProfileHash',
    'deckSha256',
    'rawOutputManifestHash',
    'parsedResultHash',
    'stdoutHash',
    'stderrHash',
    'executionDisposition',
    'authorityState',
    'semanticHash',
  ], 'executionReceipt');
  if (receipt.schema !== SCHEMAS.EXECUTION_RECEIPT) throw new TypeError('Unknown receipt schema.');
  assertId(receipt.requestId, 'executionReceipt.requestId');
  assertGitSha(receipt.exactHeadSha, 'executionReceipt.exactHeadSha');
  assertGitSha(receipt.baseSha, 'executionReceipt.baseSha');
  [
    'canonicalModelHash',
    'solverProfileHash',
    'deckProfileHash',
    'deckSha256',
    'rawOutputManifestHash',
    'parsedResultHash',
    'stdoutHash',
    'stderrHash',
    'semanticHash',
  ].forEach((field) => assertHash(receipt[field], `executionReceipt.${field}`));
  assertEnum(receipt.executionDisposition, ['EXECUTED', 'BLOCKED', 'FAILED'], 'executionReceipt.executionDisposition');
  const expectedState = receipt.executionDisposition === 'EXECUTED'
    ? QUALIFICATION_STATES.CONTRACT_QUALIFIED
    : QUALIFICATION_STATES.UNREGISTERED;
  if (receipt.authorityState !== expectedState) {
    throw new TypeError('Receipt authority state conflicts with execution disposition.');
  }
  const copy = clonePlain(receipt);
  delete copy.semanticHash;
  if (semanticHash(copy) !== receipt.semanticHash) {
    throw new TypeError('Execution receipt semantic hash mismatch.');
  }
  return true;
}

export function assertExecutionReceiptExactHead(receipt, expectedHeadSha) {
  validateExecutionReceipt(receipt);
  assertGitSha(expectedHeadSha, 'expectedHeadSha');
  if (receipt.exactHeadSha !== expectedHeadSha) {
    throw new TypeError('Execution receipt exact-head evidence is stale.');
  }
  return true;
}
