/** Structural and checker-policy validation for one full candidate. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { assertTopologyEditCandidate } from './topology-edit-candidate-builder.js';
import { topologyEditEdgeReferencesBend } from './topology-edit-bend-edge-crosswalk.js';
import { validateTopologyEditCommandEffect } from './topology-edit-command-effect-dispatch.js';
import { canonicalTopologyStateHash, rebuildTopologyEditCrosswalk } from './topology-edit-canonical-state.js';

export const TOPOLOGY_EDIT_CANDIDATE_VALIDATION_SCHEMA = 'TopologyEditCandidateValidation.v1';
function finding(code, message, targetIds = []) {
  return { code, message, targetIds: [...targetIds].sort() };
}
function duplicateValues(values) {
  const seen = new Set(); const duplicates = new Set();
  for (const value of values) { if (seen.has(value)) duplicates.add(value); seen.add(value); }
  return [...duplicates].sort();
}
function finitePoint(point) {
  return point && ['x', 'y', 'z'].every((axis) => Number.isFinite(point[axis]));
}
function unorderedPair(left, right) { return [left, right].sort().join('\u0000'); }
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
  for (const id of duplicateValues(all)) errors.push(finding(
    'DUPLICATE_CANONICAL_ID', `Canonical identity ${id} appears in multiple records.`, [id]));
}
function validateNodes(topology, errors) {
  for (const node of topology.nodes ?? []) {
    if (!finitePoint(node.position)) errors.push(finding('NODE_POSITION_INVALID',
      `Node ${node.id} must have finite x, y and z.`, [node.id]));
    if (!Array.isArray(node.portKeys)) errors.push(finding('NODE_PORT_KEYS_INVALID',
      `Node ${node.id} portKeys must be an array.`, [node.id]));
    else if (duplicateValues(node.portKeys).length) errors.push(finding('NODE_PORT_KEYS_DUPLICATE',
      `Node ${node.id} has duplicate port keys.`, [node.id]));
  }
}
function edgeLength(edge, nodes) {
  const from = nodes.get(edge?.fromNodeId); const to = nodes.get(edge?.toNodeId);
  if (!finitePoint(from?.position) || !finitePoint(to?.position)) return null;
  return Math.hypot(
    to.position.x - from.position.x,
    to.position.y - from.position.y,
    to.position.z - from.position.z,
  );
}
function isInheritedZeroLengthEdge(edge, topologyNodes, baseTopology) {
  const baseEdge = (baseTopology.edges ?? []).find((row) => row.id === edge.id);
  if (!baseEdge
      || baseEdge.fromNodeId !== edge.fromNodeId
      || baseEdge.toNodeId !== edge.toNodeId) return false;
  const baseNodes = new Map((baseTopology.nodes ?? []).map((node) => [node.id, node]));
  if (!(edgeLength(baseEdge, baseNodes) === 0)) return false;
  return samePoint(topologyNodes.get(edge.fromNodeId)?.position,
    baseNodes.get(baseEdge.fromNodeId)?.position)
    && samePoint(topologyNodes.get(edge.toNodeId)?.position,
      baseNodes.get(baseEdge.toNodeId)?.position);
}
function validateEdges(topology, baseTopology, errors, warnings) {
  const nodes = new Map((topology.nodes ?? []).map((node) => [node.id, node]));
  const pairs = new Map();
  for (const edge of topology.edges ?? []) {
    const from = nodes.get(edge.fromNodeId); const to = nodes.get(edge.toNodeId);
    if (!from || !to) {
      errors.push(finding('EDGE_ENDPOINT_MISSING', `Edge ${edge.id} references missing endpoint node.`,
        [edge.id, edge.fromNodeId, edge.toNodeId]));
      continue;
    }
    if (edge.fromNodeId === edge.toNodeId) errors.push(finding('EDGE_SELF_LOOP',
      `Edge ${edge.id} is a self-loop.`, [edge.id, edge.fromNodeId]));
    const length = edgeLength(edge, nodes);
    if (!(length > 0)) {
      const inherited = isInheritedZeroLengthEdge(edge, nodes, baseTopology);
      const row = finding(
        inherited ? 'INHERITED_EDGE_ZERO_LENGTH' : 'EDGE_ZERO_LENGTH',
        inherited
          ? `Edge ${edge.id} retains an unchanged zero-length source representation.`
          : `Edge ${edge.id} has zero length.`,
        [edge.id],
      );
      (inherited ? warnings : errors).push(row);
    }
    const pair = unorderedPair(edge.fromNodeId, edge.toNodeId);
    if (pairs.has(pair)) errors.push(finding('EDGE_DUPLICATE_PAIR',
      `Edges ${pairs.get(pair)} and ${edge.id} connect the same node pair.`, [pairs.get(pair), edge.id]));
    else pairs.set(pair, edge.id);
  }
}
function validateJunctions(topology, errors) {
  const nodeIds = new Set((topology.nodes ?? []).map((node) => node.id));
  for (const junction of topology.junctions ?? []) {
    if (!Array.isArray(junction.nodeIds) || junction.nodeIds.length < 2) {
      errors.push(finding('JUNCTION_NODE_SET_INVALID',
        `Junction ${junction.id} requires at least two node IDs.`, [junction.id]));
      continue;
    }
    if (duplicateValues(junction.nodeIds).length) errors.push(finding('JUNCTION_NODE_SET_DUPLICATE',
      `Junction ${junction.id} repeats a node ID.`, [junction.id]));
    for (const nodeId of junction.nodeIds) if (!nodeIds.has(nodeId)) errors.push(finding(
      'JUNCTION_NODE_MISSING', `Junction ${junction.id} references missing node ${nodeId}.`, [junction.id, nodeId]));
  }
}
function validateSupports(topology, errors) {
  const nodeIds = new Set((topology.nodes ?? []).map((node) => node.id));
  for (const support of topology.supports ?? []) {
    if (support.nodeId && !nodeIds.has(support.nodeId)) errors.push(finding(
      'SUPPORT_NODE_MISSING', `Support ${support.id} references missing node ${support.nodeId}.`, [support.id, support.nodeId]));
    if (support.resolved === true && !support.nodeId) errors.push(finding(
      'SUPPORT_RESOLUTION_INVALID', `Support ${support.id} is marked resolved without a node.`, [support.id]));
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
      for (const nodeId of referencedNodes) if (!nodeIds.has(nodeId)) errors.push(finding(
        'GENERIC_NODE_REFERENCE_MISSING', `${collection} ${record.id} references missing node ${nodeId}.`, [record.id, nodeId]));
      for (const edgeId of referencedIds(record, 'edgeId', 'edgeIds')) if (!edgeIds.has(edgeId)) errors.push(finding(
        'GENERIC_EDGE_REFERENCE_MISSING', `${collection} ${record.id} references missing edge ${edgeId}.`, [record.id, edgeId]));
    }
  }
}
function validateBasis(candidate, baseTopology, errors) {
  const topology = candidate.canonicalTopology;
  for (const key of ['schema', 'datasetId', 'datasetVersion', 'sourceHash', 'topologyGraphHash']) {
    if (topology[key] !== baseTopology[key]) errors.push(finding('BASIS_FIELD_CHANGED',
      `Candidate changed immutable basis field ${key}.`, [key]));
  }
  if (candidate.basis.sourceHash !== baseTopology.sourceHash) errors.push(finding(
    'SOURCE_BASIS_MISMATCH', 'Command basis sourceHash differs from base topology.'));
  if (candidate.basis.baseCanonicalHash !== baseTopology.canonicalTopologyHash) errors.push(finding(
    'BASE_HASH_MISMATCH', 'Command basis baseCanonicalHash differs from base topology.'));
  if (candidate.priorCanonicalTopologyHash === candidate.canonicalTopologyHash) errors.push(finding(
    'COMMAND_NO_EFFECT', `Command ${candidate.commandId} produced no canonical topology change.`, [candidate.commandId]));
  if (topology.canonicalTopologyHash !== canonicalTopologyStateHash(topology)) errors.push(finding(
    'CANONICAL_HASH_INVALID', 'Candidate canonical topology hash is invalid.'));
  if (semanticHash(topology.crosswalk) !== semanticHash(rebuildTopologyEditCrosswalk(topology))) errors.push(finding(
    'CROSSWALK_INVALID', 'Candidate identity crosswalk does not match canonical records.'));
}
function validateCheckerPolicy(candidate, errors, warnings) {
  const policy = candidate.checkerPolicy;
  for (const issue of candidate.checkerDelta.introducedIssues) {
    const rejected = policy.rejectNewIssueKinds.includes(issue.kind)
      || policy.rejectNewSeverities.includes(issue.severity);
    const row = finding(rejected ? 'CHECKER_REGRESSION' : 'CHECKER_FINDING_INTRODUCED',
      `Command introduced ${issue.severity} ${issue.kind}: ${issue.id}.`,
      [issue.id, ...(issue.nodeIds ?? []), ...(issue.edgeId ? [issue.edgeId] : [])]);
    (rejected ? errors : warnings).push(row);
  }
}
function sortedFindings(rows) {
  return [...rows].sort((left, right) => left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message));
}

function samePoint(left, right) {
  return finitePoint(left) && finitePoint(right)
    && ['x', 'y', 'z'].every((axis) => Number(left[axis]) === Number(right[axis]));
}
function incidentEdges(topology, nodeId) {
  return (topology.edges ?? []).filter((edge) => (
    edge.fromNodeId === nodeId || edge.toNodeId === nodeId
  )).sort((a, b) => a.id.localeCompare(b.id));
}
function sameIds(left, right) {
  const a = [...new Set(left ?? [])].sort(); const b = [...new Set(right ?? [])].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
function edgeReferencesBend(edge, bendId) {
  try { return topologyEditEdgeReferencesBend(edge, bendId); } catch { return false; }
}
function validateBendDefinitions(topology, errors) {
  const nodes = new Map((topology.nodes ?? []).map((node) => [node.id, node]));
  const existing = new Set([...(topology.nodes ?? []), ...(topology.edges ?? []),
    ...(topology.junctions ?? []), ...(topology.supports ?? []),
    ...(topology.boundaries ?? []), ...(topology.rigids ?? [])]
    .map((row) => row?.id).filter(Boolean));
  const bendIds = new Set(); const bendsByNode = new Map();
  for (const bend of topology.bends ?? []) {
    if (!bend.id || bendIds.has(bend.id) || existing.has(bend.id)) errors.push(finding(
      'BEND_IDENTITY_INVALID', `Bend identity ${bend.id ?? '<missing>'} is missing or collides.`, [bend.id]));
    bendIds.add(bend.id);
    if (bendsByNode.has(bend.nodeId)) errors.push(finding('BEND_NODE_DUPLICATE',
      `Node ${bend.nodeId} has multiple bend definitions.`, [bend.id, bendsByNode.get(bend.nodeId)]));
    bendsByNode.set(bend.nodeId, bend.id);
    const node = nodes.get(bend.nodeId); const arms = incidentEdges(topology, bend.nodeId);
    if (!node || arms.length !== 2 || !sameIds(bend.edgeIds, arms.map((edge) => edge.id))) errors.push(finding(
      'BEND_ARM_SET_INVALID', `Bend ${bend.id} must bind the exact two incident route arms.`,
      [bend.id, bend.nodeId, ...(bend.edgeIds ?? [])]));
    if (!samePoint(bend.position, node?.position)) errors.push(finding('BEND_POSITION_INVALID',
      `Bend ${bend.id} position must equal its node position.`, [bend.id, bend.nodeId]));
    if (!(Number(bend.radiusMm) > 0) || !(Number(bend.angleDeg) > 0 && Number(bend.angleDeg) < 180)
        || !String(bend.radiusAuthority ?? '').trim()) errors.push(finding(
      'BEND_ENGINEERING_EVIDENCE_INVALID',
      `Bend ${bend.id} requires positive radius, bounded angle, and radius authority.`, [bend.id]));
    if (arms.some((edge) => !edgeReferencesBend(edge, bend.id))) errors.push(finding(
      'BEND_EDGE_CROSSWALK_INVALID', `Bend ${bend.id} is not cross-referenced by both route arms.`,
      [bend.id, ...arms.map((edge) => edge.id)]));
  }
}
function validateCreatedJunctions(topology, errors) {
  const nodes = new Map((topology.nodes ?? []).map((node) => [node.id, node]));
  for (const junction of topology.junctions ?? []) {
    if (!junction.createdByCommandId) continue;
    const node = nodes.get(junction.nodeId); const arms = incidentEdges(topology, junction.nodeId);
    const edgeIds = junction.participatingEdgeIds ?? junction.edgeIds;
    if (!node || arms.length !== 3 || !sameIds(edgeIds, arms.map((edge) => edge.id))) errors.push(finding(
      'JUNCTION_ARM_SET_INVALID', `Junction ${junction.id} must bind the exact three incident route arms.`,
      [junction.id, junction.nodeId, ...(edgeIds ?? [])]));
    if (!['TEE', 'OLET'].includes(String(junction.kind ?? '').toUpperCase())
        || !String(junction.inferenceAuthority ?? '').trim()) errors.push(finding(
      'JUNCTION_ENGINEERING_EVIDENCE_INVALID',
      `Junction ${junction.id} requires TEE/OLET kind and inference authority.`, [junction.id]));
    if (!samePoint(junction.position, node?.position) || Number(junction.expectedDegree) !== 3) errors.push(finding(
      'JUNCTION_NODE_EVIDENCE_INVALID',
      `Junction ${junction.id} must retain central-node position and degree three.`,
      [junction.id, junction.nodeId]));
  }
}
function runCandidateChecks(candidate, baseTopology) {
  const errors = []; const warnings = [];
  validateBasis(candidate, baseTopology, errors);
  validateIdentities(candidate.canonicalTopology, errors);
  validateNodes(candidate.canonicalTopology, errors);
  validateEdges(candidate.canonicalTopology, baseTopology, errors, warnings);
  validateJunctions(candidate.canonicalTopology, errors);
  validateSupports(candidate.canonicalTopology, errors);
  validateGenericReferences(candidate.canonicalTopology, errors);
  validateBendDefinitions(candidate.canonicalTopology, errors);
  validateCreatedJunctions(candidate.canonicalTopology, errors);
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
    commandId: candidate.commandId, commandType: candidate.commandType,
    candidateDraftHash: candidate.candidateDraftHash,
    canonicalTopologyHash: candidate.canonicalTopologyHash,
    checkerPolicyHash: candidate.checkerPolicy.policyHash,
    valid: errors.length === 0,
    errors: sortedFindings(errors), warnings: sortedFindings(warnings),
  };
  return deepFreeze({ ...material, validationHash: semanticHash(material) });
}
export function assertValidTopologyEditCandidate(report) {
  if (report?.schema !== TOPOLOGY_EDIT_CANDIDATE_VALIDATION_SCHEMA) {
    throw new TypeError(`Validation report must use ${TOPOLOGY_EDIT_CANDIDATE_VALIDATION_SCHEMA}.`);
  }
  const material = { ...report }; delete material.validationHash;
  if (report.validationHash !== semanticHash(material)) {
    throw new Error('TopologyEditCandidateValidator: validation authority hash mismatch.');
  }
  if (!report.valid) throw new Error(
    `Topology edit candidate rejected: ${report.errors.map((row) => row.code).join(', ')}.`);
  return report;
}
