export function assertTopologyEditReviewLedgerCurrentContext(
  currentBasis,
  canonicalTopology,
) {
  if (!currentBasis || typeof currentBasis !== 'object') {
    throw new TypeError('Current review basis is required for ledger creation.');
  }
  if (!Array.isArray(canonicalTopology?.nodes) || !Array.isArray(canonicalTopology?.edges)) {
    throw new TypeError('Current canonical topology is required for ledger creation.');
  }
}

export function topologyEditReviewLedgerAuthorityFlags() {
  return [
    'checkerAuthorityChanged',
    'autofixAuthorityChanged',
    'persistenceAuthorityChanged',
    'auditExportAuthorityChanged',
    'workspaceAuthorityChanged',
    'calculationAuthorityChanged',
    'engineeringApprovalAuthorityChanged',
  ];
}

export function topologyEditReviewLedgerNormalizedIds(values) {
  return [...new Set((values ?? []).map(topologyEditReviewLedgerToken).filter(Boolean))].sort();
}

export function topologyEditReviewLedgerToken(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

export function topologyEditReviewLedgerPositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return number;
}

export function topologyEditReviewLedgerNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
  return number;
}
