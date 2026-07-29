import { SharedAnalysisContractError } from '../shared-analysis-contract/errors.js';

const CANONICAL_NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function identifierError(message, code) {
  return new SharedAnalysisContractError(message, code);
}

export const CANONICAL_NODE_ID_GRAMMAR_ID =
  'ASCII_ALNUM_START_ALNUM_DOT_UNDERSCORE_HYPHEN_V1';

export const CANONICAL_ID_ORDER_ID =
  'CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1';

export const CANONICAL_ORDERING_CONVENTION_SCHEMA =
  'fea-linear-canonical-ordering/v1';

export function requireCanonicalNodeId(nodeId) {
  if (typeof nodeId !== 'string') {
    throw identifierError(
      'Canonical node ID must be a string.',
      'INVALID_CANONICAL_NODE_ID',
    );
  }

  if (nodeId.length === 0) {
    throw identifierError(
      'Canonical node ID must not be empty.',
      'INVALID_CANONICAL_NODE_ID',
    );
  }

  if (!CANONICAL_NODE_ID_PATTERN.test(nodeId)) {
    throw identifierError(
      'Canonical node ID does not match the canonical ASCII grammar.',
      'INVALID_CANONICAL_NODE_ID',
    );
  }

  return nodeId;
}

export function compareCanonicalIds(left, right) {
  const a = requireCanonicalNodeId(left);
  const b = requireCanonicalNodeId(right);
  const length = Math.min(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index);
    if (difference < 0) return -1;
    if (difference > 0) return 1;
  }

  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}
