import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { compareCanonicalIds } from '../linear-fea-contract/identifiers.js';
import { DOF_ORDER } from '../linear-fea-contract/conventions.js';
import {
  DOF_MAP_RECORD_KEYS,
  DOF_MAP_SCHEMA,
  fail,
  requireArray,
  requireExactKeys,
  requireHash,
  requireIdentity,
  requireMember,
} from './solver-contract.js';

const CODE = 'SOLVER_DOF_MAP_INVALID';

/** Section 2.1 / section 8 DOF indexing: `CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1`. */
export const NODE_ORDERING_RULE = 'CANONICAL_ASCII_LEXICOGRAPHIC_ASCENDING_V1';

/**
 * Build the canonical DOF map (section 8 "DOF indexing"): every node of the
 * bound mechanical model, ordered by the B-2.0 canonical ascending ASCII
 * order, each carrying the frozen six-DOF order. The map is exported as
 * evidence and is the only place a nodeId/dof pair is turned into a global
 * index anywhere in this package.
 *
 * @param {Readonly<object>} model Sealed `fea-linear-model/v1`.
 * @returns {Readonly<object>} `fea-linear-dof-map/v1`.
 */
export function buildDofMap(model) {
  const nodeOrder = model.nodes.map((node) => node.nodeId).sort(compareCanonicalIds);
  const entries = [];
  nodeOrder.forEach((nodeId, nodeIndex) => {
    DOF_ORDER.forEach((dof, dofIndex) => {
      entries.push({ nodeId, dof, globalIndex: nodeIndex * DOF_ORDER.length + dofIndex });
    });
  });
  const draft = {
    schema: DOF_MAP_SCHEMA,
    orderingRule: NODE_ORDERING_RULE,
    dofOrder: [...DOF_ORDER],
    nodeOrder,
    dofCount: entries.length,
    entries,
    semanticHash: '',
  };
  draft.semanticHash = computeDofMapSemanticHash(draft);
  return requireDofMap(draft);
}

export function dofMapSemanticProjection(record) {
  return {
    schema: record.schema,
    orderingRule: record.orderingRule,
    dofOrder: [...record.dofOrder],
    nodeOrder: [...record.nodeOrder],
    dofCount: record.dofCount,
    entries: record.entries.map((entry) => ({ ...entry })),
  };
}

export function computeDofMapSemanticHash(record) {
  return semanticHash(dofMapSemanticProjection(record));
}

export function requireDofMap(record) {
  requireExactKeys(record, DOF_MAP_RECORD_KEYS, 'dofMap', CODE);
  if (record.schema !== DOF_MAP_SCHEMA) fail(`dofMap.schema must be ${DOF_MAP_SCHEMA}.`, CODE);
  if (record.orderingRule !== NODE_ORDERING_RULE) fail(`dofMap.orderingRule must be ${NODE_ORDERING_RULE}.`, CODE);
  requireArray(record.dofOrder, 'dofMap.dofOrder', CODE);
  if (record.dofOrder.length !== DOF_ORDER.length || record.dofOrder.some((dof, index) => dof !== DOF_ORDER[index])) {
    fail('dofMap.dofOrder must be the frozen B-2.0 six-DOF order.', CODE);
  }
  requireArray(record.nodeOrder, 'dofMap.nodeOrder', CODE);
  const nodeOrder = record.nodeOrder.map((nodeId, index) => requireIdentity(nodeId, `dofMap.nodeOrder[${index}]`, CODE));
  for (let index = 1; index < nodeOrder.length; index += 1) {
    if (compareCanonicalIds(nodeOrder[index - 1], nodeOrder[index]) >= 0) {
      fail('dofMap.nodeOrder must be strictly ascending canonical order.', CODE);
    }
  }
  if (record.dofCount !== nodeOrder.length * DOF_ORDER.length) fail('dofMap.dofCount is inconsistent.', CODE);
  requireArray(record.entries, 'dofMap.entries', CODE);
  if (record.entries.length !== record.dofCount) fail('dofMap.entries length must equal dofCount.', CODE);
  record.entries.forEach((entry, index) => {
    const field = `dofMap.entries[${index}]`;
    requireExactKeys(entry, ['nodeId', 'dof', 'globalIndex'], field, CODE);
    requireIdentity(entry.nodeId, `${field}.nodeId`, CODE);
    requireMember(entry.dof, DOF_ORDER, `${field}.dof`, CODE);
    if (entry.globalIndex !== index) fail(`${field}.globalIndex must equal its position.`, CODE);
  });
  requireHash(record.semanticHash, 'dofMap.semanticHash', CODE);
  if (record.semanticHash !== computeDofMapSemanticHash(record)) fail('dofMap.semanticHash is stale.', 'SOLVER_HASH_MISMATCH');
  return deepFreeze({
    ...dofMapSemanticProjection(record),
    semanticHash: record.semanticHash,
  });
}

/**
 * Resolve one nodeId/dof pair to its global index. This is the only sanctioned
 * way to turn an identity pair into an index anywhere in this package; the
 * `dofMap` record itself stays a plain, hashable data record with no attached
 * behavior.
 */
export function dofIndexOf(dofMap, nodeId, dof) {
  const nodeIndex = dofMap.nodeOrder.indexOf(nodeId);
  if (nodeIndex === -1) fail(`dofMap has no node ${nodeId}.`, 'SOLVER_DOF_MAP_NODE_UNKNOWN');
  const dofIndex = DOF_ORDER.indexOf(dof);
  if (dofIndex === -1) fail(`dofMap has no dof ${dof}.`, 'SOLVER_DOF_MAP_DOF_UNKNOWN');
  return nodeIndex * DOF_ORDER.length + dofIndex;
}
