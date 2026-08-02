/** Structural and checker-policy validation for one full candidate. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditCandidate } from './topology-edit-candidate-builder.js';
import { validateTopologyEditCommandEffect } from './topology-edit-command-effect-validator.js';
import {
  canonicalTopologyStateHash,
  rebuildTopologyEditCrosswalk,
} from './topology-edit-canonical-state.js';

export const TOPOLOGY_EDIT_CANDIDATE_VALIDATION_SCHEMA = 'TopologyEditCandidateValidation.v1';

function finding(code, message, targetIds = []) {
  return { code, message, targetIds: [...targetIds].sort() };
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function finitePoint(point) {
  return point && ['x', 'y', 'z'].every((axis) => Number.isFinite(point[axis]));
}

function unorderedPair(left, right) {
  return [left, right].sort().join('\u0000');
}

function validateIdentities(topology, errors) {
  const collections = ['nodes', 'edges', 'junctions', 'supports', 'boundaries', 'rigids'];
  const all = [];
  for (const collection of collections) {
    const rows = topology[collection] ?? [];
    if (!Array.isArray(rows)) {
      errors.push(finding('COLLECTION_NOT_ARRAY', `${collection} must be an array.`, [collection]));
      continue;
    }
    for (const row of rows) {
      const id = String(row?.id ?? '').trim();
      if (!id) errors.push(finding('IDENTITY_MISSING', `${collection} contains a record without id.`, [collection]));
      else all.push(id);
    }
    for (const id of duplicateValues(rows.map((row) => row?.id).filter(Boolean))) {
      errors.push(finding('DUPLICATE_COLLECTION_ID', `${collection} contains duplicate id ${id}.`, [id]));
    }
  }
  for (const id of duplicateValues(all)) {
    errors.push(finding('DUPLICATE_CANONICAL_ID', `Canonical identity ${id} appears in multiple records.`, [id]));
  }
}

function validateNodes(topology, errors) {
  for (const node of topology.nodes ?? []) {
    if (!finitePoint(node.position)) {
      errors.push(finding('NODE_POSITION_INVALID', `Node ${node.id} must have finite x, y and z.`, [node.id]));
    }
    if (!Array.isArray(node.portKeys)) {
      errors.push(finding('NODE_PORT_KEYS_INVALID', `Node ${node.id} portKeys must be an array.`, [node.id]));
    } else if (duplicateValues(node.portKeys).length) {
      errors.push(finding('NODE_PORT_KEYS_DUPLICATE', `Node ${node.id} has duplicate port keys.`, [node.id]));
    }
  }
}

function validateEdges(topology, errors) {
  const nodes = new Map((topology.nodes ?? []).map((node) => [node.id, node]));
  const pairs = new Map();
  for (const edge of topology.edges ?? []) {
    const from = nodes.get(edge.fromNodeId);
    const to = nodes.get(edge.toNodeId);
    if (!from || !to) {
      errors.push(finding('EDGE_ENDPOINT_MISSING', `Edge ${edge.id} references missing endpoint node.`, [edge.id, edge.fromNodeId, edge.toNodeId]));
      continue;
    }
    if (edge.fromNodeId === edge.toNodeId) {
      errors.push(finding('EDGE_SELF_LOOP', `Edge ${edge.id} is a self-loop.`, [edge.id, edge.fromNodeId]));
    }
    const length = Math.hypot(
      to.position.x - from.position.x,
      to.position.y - from.position.y,
      to.position.z - from.position.z,
    );
    if (!(length > 0)) errors.push(finding('EDGE_ZERO_LENGTH', `Edge ${edge.id} has zero length.`, [edge.id]));
    const pair = unorderedPair(edge.fromNodeId, edge.toNodeId);
    if (pairs.has(pair)) {
      errors.push(finding('EDGE_DUPLICATE_PAIR', `Edges ${pairs.get(pair)} and ${edge.id} connect the same node pair.`, [pairs.get(pair), edge.id]));
    } else pairs.set(pair, edge.id);
  }
}

function validateJunctions(topology, errors) {
  const nodeIds = new Set((topology.nodes ?? []).map((node) => node.id));
  for (const junction of topology.junctions ?? []) {
    if (!Array.isArray(junction.nodeIds) || junction.nodeIds.length < 2) {
      errors.push(finding('JUNCTION_NODE_SET_INVALID', `Junction ${junction.id} requires at least two node IDs.`, [junction.id]));
      continue;
    }
    if (duplicateValues(junction.nodeIds).length) {
      errors.push(finding('JUNCTION_NODE_SET_DUPLICATE', `Junction ${junction.id} repeats a node ID.`, [junction.id]));
    }
    for (const nodeId of junction.nodeIds) {
      if (!nodeIds.has(nodeId)) errors.push(finding('JUNCTION_NODE_MISSING', `Junction ${junction.id} references missing node ${nodeId}.`, [junction.id, nodeId]));
    }
  }
}

function validateSupports(topology, errors) {
  const nodeIds = new Set((topology.nodes ?? []).map((node) => node.id));
  for (const support of topology.supports ?? []) {
    if (support.nodeId && !nodeIds.has(support.nodeId)) {
      errors.push(finding('SUPPORT_NODE_MISSING', `Support ${support.id} references missing node ${support.nodeId}.`, [support.id, support.nodeId]));
    }
    if (support.resolved === true && !support.nodeId) {
      errors.push(finding('SUPPORT_RESOLUTION_INVALID', `Support ${support.id} is marked resolved without a node.`, [support.id]));
    }
  }
}

function referencedIds(record, singular, plural) {
  const result = [];
  if (record?.[singular]) result.push(record[singular]);
  if (Array.isArray(record?.[plural])) result.push(...record[plural]);
  return result;
}

function validateGenericReferences(topology, errors) {
  const nodeIds = new Set((topology.nodes ?? []).map((node) => node.id));
  const edgeIds = new Set((topology.edges ?? []).map((edge) => edge.id));
  for (const collection of ['boundaries', 'rigids']) {
    for (const record of topology[collection] ?? []) {
      const referencedNodes = [
        ...referencedIds(record, 'nodeId', 'nodeIds'),
        ...referencedIds(record, 'fromNodeId', 'fromNodeIds'),
        ...referencedIds(record, 'toNodeId', 'toNodeIds'),
      ];
      for (const nodeId of referencedNodes) {
        if (!nodeIds.has(nodeId)) errors.push(finding('GENERIC_NODE_REFERENCE_MISSING', `${collection} ${record.id} references missing node ${nodeId}.`, [record.id, nodeId]));
      }
      for (const edgeId of referencedIds(record, 'edgeId', 'edgeIds')) {
        if (!edgeIds.has(edgeId)) errors.push(finding('GENERIC_EDGE_REFERENCE_MISSING', `${collection} ${record.id} references missing edge ${edgeId}.`, [record.id, edgeId]));
      }
    }
  }
}

function validateBasis(candidate, baseTopology, errors) {
  const topology = candidate.canonicalTopology;
  for (const key of ['schema', 'datasetId', 'datasetVersion', 'sourceHash', 'topologyGraphHash']) {
    if (topology[key] !== baseTopology[key]) errors.push(finding('BASIS_FIELD_CHANGED', `Candidate changed immutable basis field ${key}.`, [key]));
  }
  if (candidate.basis.sourceHash !== baseTopology.sourceHash) errors.push(finding('SOURCE_BASIS_MISMATCH', 'Command basis sourceHash differs from base topology.'));
  if (candidate.basis.baseCanonicalHash !== baseTopology.canonicalTopologyHash) errors.push(finding('BASE_HASH_MISMATCH', 'Command basis baseCanonicalHash differs from base topology.'));
  if (candidate.priorCanonicalTopologyHash === candidate.canonicalTopologyHash) errors.push(finding('COMMAND_NO_EFFECT', `Command ${candidate.commandId} produced no canonical topology change.`, [candidate.commandId]));
  if (topology.canonicalTopologyHash !== canonicalTopologyStateHash(topology)) errors.push(finding('CANONICAL_HASH_INVALID', 'Candidate canonical topology hash is invalid.'));
  if (semanticHash(topology.crosswalk) !== semanticHash(rebuildTopologyEditCrosswalk(topology))) errors.push(finding('CROSSWALK_INVALID', 'Candidate identity crosswalk does not match canonical records.'));
}

function validateCheckerPolicy(candidate, errors, warnings) {
  const policy = candidate.checkerPolicy;
  for (const issue of candidate.checkerDelta.introducedIssues) {
    const rejected = policy.rejectNewIssueKinds.includes(issue.kind)
      || policy.rejectNewSeverities.includes(issue.severity);
    const row = finding(
      rejected ? 'CHECKER_REGRESSION' : 'CHECKER_FINDING_INTRODUCED',
      `Command introduced ${issue.severity} ${issue.kind}: ${issue.id}.`,
      [issue.id, ...(issue.nodeIds ?? []), ...(issue.edgeId ? [issue.edgeId] : [])],
    );
    if (rejected) errors.push(row);
    else warnings.push(row);
  }
}

function sortedFindings(rows) {
  return [...rows].sort((left, right) => {
    const code = left.code.localeCompare(right.code);
    return code || left.message.localeCompare(right.message);
  });
}

function runCandidateChecks(candidate, baseTopology) {
  const errors = [];
  const warnings = [];
  validateBasis(candidate, baseTopology, errors);
  validateIdentities(candidate.canonicalTopology, errors);
  validateNodes(candidate.canonicalTopology, errors);
  validateEdges(candidate.canonicalTopology, errors);
  validateJunctions(candidate.canonicalTopology, errors);
  validateSupports(candidate.canonicalTopology, errors);
  validateGenericReferences(candidate.canonicalTopology, errors);
  errors.push(...validateTopologyEditCommandEffect(candidate));
  validateCheckerPolicy(candidate, errors, warnings);
  return { errors, warnings };
}

export function validateTopologyEditCandidate({ candidate: candidateInput, baseCanonicalTopology } = {}) {
  const candidate = assertTopologyEditCandidate(candidateInput);
  if (!baseCanonicalTopology || typeof baseCanonicalTopology !== 'object') {
    throw new TypeError('TopologyEditCandidateValidator: baseCanonicalTopology is required.');
  }
  const { errors, warnings } = runCandidateChecks(candidate, baseCanonicalTopology);
  const material = {
    schema: TOPOLOGY_EDIT_CANDIDATE_VALIDATION_SCHEMA,
    commandId: candidate.commandId,
    commandType: candidate.commandType,
    candidateDraftHash: candidate.candidateDraftHash,
    canonicalTopologyHash: candidate.canonicalTopologyHash,
    checkerPolicyHash: candidate.checkerPolicy.policyHash,
    valid: errors.length === 0,
    errors: sortedFindings(errors),
    warnings: sortedFindings(warnings),
  };
  return deepFreeze({ ...material, validationHash: semanticHash(material) });
}

export function assertValidTopologyEditCandidate(report) {
  if (report?.schema !== TOPOLOGY_EDIT_CANDIDATE_VALIDATION_SCHEMA) {
    throw new TypeError(`Validation report must use ${TOPOLOGY_EDIT_CANDIDATE_VALIDATION_SCHEMA}.`);
  }
  const material = { ...report };
  delete material.validationHash;
  if (report.validationHash !== semanticHash(material)) {
    throw new Error('TopologyEditCandidateValidator: validation authority hash mismatch.');
  }
  if (!report.valid) {
    throw new Error(`Topology edit candidate rejected: ${report.errors.map((row) => row.code).join(', ')}.`);
  }
  return report;
}
