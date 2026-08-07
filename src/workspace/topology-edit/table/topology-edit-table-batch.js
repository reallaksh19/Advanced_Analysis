import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditTableIntent,
  rebaseTopologyEditTableIntent,
} from './topology-edit-table-intent.js';

export const TOPOLOGY_EDIT_TABLE_BATCH_SCHEMA = 'TopologyEditTableBatch.v1';

export function createTopologyEditTableBatch({ intents: input } = {}) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError('TopologyEditTableBatch: intents must be a non-empty array.');
  }
  const intents = input.map(assertTopologyEditTableIntent).sort(compareIntents);
  const authorityHash = intents[0].authority.authorityHash;
  if (intents.some((intent) => intent.authority.authorityHash !== authorityHash)) {
    throw new Error('TopologyEditTableBatch: every intent must share one exact edit authority.');
  }
  assertUniqueTargets(intents);
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_BATCH_SCHEMA,
    authority: intents[0].authority,
    intentCount: intents.length,
    intentHashes: intents.map((intent) => intent.intentHash),
    intents,
  };
  return deepFreeze({ ...material, batchHash: semanticHash(material) });
}

export function assertTopologyEditTableBatch(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_BATCH_SCHEMA || !Array.isArray(value.intents)) {
    throw new TypeError(`Table batch must use ${TOPOLOGY_EDIT_TABLE_BATCH_SCHEMA}.`);
  }
  const rebuilt = createTopologyEditTableBatch({ intents: value.intents });
  const material = { ...value };
  delete material.batchHash;
  if (semanticHash(material) !== value.batchHash || rebuilt.batchHash !== value.batchHash) {
    throw new Error('TopologyEditTableBatch: batch differs from immutable normalized authority.');
  }
  return value;
}

export function rebaseTopologyEditTableBatch(batchInput, projection, sessionSnapshot) {
  const batch = assertTopologyEditTableBatch(batchInput);
  const intents = batch.intents.map((intent) => (
    rebaseTopologyEditTableIntent(intent, projection, sessionSnapshot)
  ));
  return createTopologyEditTableBatch({ intents });
}

function assertUniqueTargets(intents) {
  const seen = new Set();
  for (const intent of intents) {
    const key = `${intent.target.canonicalId}\u0000${intent.intentKind}`;
    if (seen.has(key)) {
      throw new RangeError(`TopologyEditTableBatch: duplicate intent target ${intent.target.canonicalId} / ${intent.intentKind}.`);
    }
    seen.add(key);
  }
}
function compareIntents(left, right) {
  return left.target.canonicalId.localeCompare(right.target.canonicalId)
    || left.intentKind.localeCompare(right.intentKind)
    || left.intentHash.localeCompare(right.intentHash);
}
