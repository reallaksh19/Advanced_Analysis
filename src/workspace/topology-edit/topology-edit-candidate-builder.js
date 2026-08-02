/** Build one complete deterministic candidate from one resolved command. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { checkCanonicalTopology } from './topology-edit-checker.js';
import { assertResolvedTopologyEditCommand } from './topology-edit-command-resolver.js';
import { applyResolvedTopologyEditCommand } from './topology-edit-pure-reducer.js';
import {
  assertCanonicalTopologyHash,
  canonicalTopologyStateHash,
} from './topology-edit-canonical-state.js';

export const TOPOLOGY_EDIT_CANDIDATE_SCHEMA = 'TopologyEditCandidate.v1';
export const TOPOLOGY_EDIT_CHECKER_POLICY_SCHEMA = 'TopologyEditCheckerPolicy.v1';
export const DEFAULT_TOPOLOGY_EDIT_CHECKER_POLICY = deepFreeze({
  schema: TOPOLOGY_EDIT_CHECKER_POLICY_SCHEMA,
  shortElementThresholdMm: 6,
  snapGapToleranceMm: 25,
  rejectNewSeverities: ['HIGH'],
  rejectNewIssueKinds: ['ORPHAN_EDGE_ENDPOINT'],
});

function positiveFinite(value, fallback, label) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
  return number;
}

function normalizeTextArray(value, fallback, label) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source)) throw new TypeError(`${label} must be an array.`);
  return [...new Set(source
    .map((row) => String(row ?? '').trim().toUpperCase())
    .filter(Boolean))]
    .sort();
}

export function normalizeTopologyEditCheckerPolicy(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const material = {
    schema: TOPOLOGY_EDIT_CHECKER_POLICY_SCHEMA,
    shortElementThresholdMm: positiveFinite(
      source.shortElementThresholdMm,
      DEFAULT_TOPOLOGY_EDIT_CHECKER_POLICY.shortElementThresholdMm,
      'shortElementThresholdMm',
    ),
    snapGapToleranceMm: positiveFinite(
      source.snapGapToleranceMm,
      DEFAULT_TOPOLOGY_EDIT_CHECKER_POLICY.snapGapToleranceMm,
      'snapGapToleranceMm',
    ),
    rejectNewSeverities: normalizeTextArray(
      source.rejectNewSeverities,
      DEFAULT_TOPOLOGY_EDIT_CHECKER_POLICY.rejectNewSeverities,
      'rejectNewSeverities',
    ),
    rejectNewIssueKinds: normalizeTextArray(
      source.rejectNewIssueKinds,
      DEFAULT_TOPOLOGY_EDIT_CHECKER_POLICY.rejectNewIssueKinds,
      'rejectNewIssueKinds',
    ),
  };
  return deepFreeze({ ...material, policyHash: semanticHash(material) });
}

function checkerOptions(policy) {
  return {
    shortElementThresholdMm: policy.shortElementThresholdMm,
    snapGapToleranceMm: policy.snapGapToleranceMm,
  };
}

function issueMaterial(issue) {
  return {
    id: issue.id,
    kind: issue.kind,
    severity: issue.severity,
    nodeIds: [...(issue.nodeIds ?? [])],
    edgeId: issue.edgeId ?? null,
    suggestedAutofix: issue.suggestedAutofix ?? null,
    distanceMm: issue.distanceMm ?? null,
  };
}

function checkerEvidence(topology, policy) {
  const issues = checkCanonicalTopology(topology, checkerOptions(policy)).map(issueMaterial);
  const material = {
    policyHash: policy.policyHash,
    issueCount: issues.length,
    issues,
  };
  return deepFreeze({ ...material, checkerHash: semanticHash(material) });
}

function recordMap(rows) {
  return new Map((rows ?? []).map((record) => [record.id, record]));
}

function collectionDelta(beforeRows, afterRows) {
  const before = recordMap(beforeRows);
  const after = recordMap(afterRows);
  const addedIds = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removedIds = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changedIds = [...after.keys()]
    .filter((id) => before.has(id) && semanticHash(after.get(id)) !== semanticHash(before.get(id)))
    .sort();
  return { addedIds, removedIds, changedIds };
}

export function buildTopologyEditCandidateDelta(before, after) {
  const material = {
    nodes: collectionDelta(before.nodes, after.nodes),
    edges: collectionDelta(before.edges, after.edges),
    junctions: collectionDelta(before.junctions, after.junctions),
    supports: collectionDelta(before.supports, after.supports),
    boundaries: collectionDelta(before.boundaries, after.boundaries),
    rigids: collectionDelta(before.rigids, after.rigids),
  };
  return deepFreeze({ ...material, deltaHash: semanticHash(material) });
}

function checkerDelta(before, after) {
  const beforeById = new Map(before.issues.map((issue) => [issue.id, issue]));
  const afterById = new Map(after.issues.map((issue) => [issue.id, issue]));
  const material = {
    introducedIssues: after.issues.filter((issue) => !beforeById.has(issue.id)),
    resolvedIssues: before.issues.filter((issue) => !afterById.has(issue.id)),
    unchangedIssueIds: after.issues
      .filter((issue) => beforeById.has(issue.id))
      .map((issue) => issue.id)
      .sort(),
  };
  return deepFreeze({ ...material, checkerDeltaHash: semanticHash(material) });
}

function assertCandidateBasis(topology, command) {
  assertCanonicalTopologyHash(topology);
  const currentHash = canonicalTopologyStateHash(topology);
  if (command.basis.priorDraftHash !== currentHash) {
    throw new Error('TopologyEditCandidateBuilder: resolved command is stale for the current canonical topology.');
  }
  return currentHash;
}

function buildCandidateEvidence(topology, command, policy) {
  const beforeChecker = checkerEvidence(topology, policy);
  const candidateTopology = applyResolvedTopologyEditCommand(topology, command);
  const afterChecker = checkerEvidence(candidateTopology, policy);
  return {
    beforeChecker,
    candidateTopology,
    afterChecker,
    topologyDelta: buildTopologyEditCandidateDelta(topology, candidateTopology),
    checkerDelta: checkerDelta(beforeChecker, afterChecker),
  };
}

function candidateMaterial(command, currentHash, policy, evidence) {
  return {
    schema: TOPOLOGY_EDIT_CANDIDATE_SCHEMA,
    commandId: command.commandId,
    commandType: command.commandType,
    basis: command.basis,
    requestHash: command.requestHash,
    resolutionHash: command.resolutionHash,
    priorCanonicalTopologyHash: currentHash,
    canonicalTopologyHash: evidence.candidateTopology.canonicalTopologyHash,
    checkerPolicy: policy,
    beforeChecker: evidence.beforeChecker,
    afterChecker: evidence.afterChecker,
    topologyDelta: evidence.topologyDelta,
    checkerDelta: evidence.checkerDelta,
  };
}

export function buildTopologyEditCandidate({
  canonicalTopology,
  resolvedCommand: resolvedCommandInput,
  checkerPolicy: checkerPolicyInput,
} = {}) {
  const command = assertResolvedTopologyEditCommand(resolvedCommandInput);
  const currentHash = assertCandidateBasis(canonicalTopology, command);
  const policy = normalizeTopologyEditCheckerPolicy(checkerPolicyInput);
  const evidence = buildCandidateEvidence(canonicalTopology, command, policy);
  const material = candidateMaterial(command, currentHash, policy, evidence);
  return deepFreeze({
    ...material,
    candidateDraftHash: semanticHash(material),
    canonicalTopology: evidence.candidateTopology,
  });
}

export function assertTopologyEditCandidate(value) {
  if (value?.schema !== TOPOLOGY_EDIT_CANDIDATE_SCHEMA) {
    throw new TypeError(`Topology edit candidate must use ${TOPOLOGY_EDIT_CANDIDATE_SCHEMA}.`);
  }
  assertCanonicalTopologyHash(value.canonicalTopology);
  const material = { ...value };
  delete material.candidateDraftHash;
  delete material.canonicalTopology;
  if (value.candidateDraftHash !== semanticHash(material)) {
    throw new Error('TopologyEditCandidateBuilder: candidate authority hash mismatch.');
  }
  if (value.canonicalTopologyHash !== value.canonicalTopology.canonicalTopologyHash) {
    throw new Error('TopologyEditCandidateBuilder: candidate topology hash mismatch.');
  }
  return value;
}
