import {
  canonicalStringify,
  semanticHash,
} from '../../core/shared-piping-model/canonical-json.js';
import {
  deepFreeze,
  isPlainRecord,
} from '../../core/shared-piping-model/immutable.js';
import {
  assertEngineeringEnrichmentPortableBundleComparison,
} from './bundle-comparison-validation.js';
import {
  assertEngineeringEnrichmentPortableBundle,
} from './portable-bundle-validation.js';

export const ENRICHMENT_EVIDENCE_LINEAGE_GRAPH_SCHEMA =
  'EngineeringEnrichmentEvidenceLineageGraph.v1';
export const ENRICHMENT_EVIDENCE_LINEAGE_IMPACT_SCHEMA =
  'EngineeringEnrichmentEvidenceLineageImpact.v1';

const FALSE_AUTHORITY_FIELDS = Object.freeze([
  'persistenceCreated',
  'reviewDecisionCreated',
  'approvalGranted',
  'current',
  'sealEligible',
  'calculationEligible',
  'resultAcceptanceEligible',
]);

const NODE_SPECS = deepFreeze([
  spec('MASTER_SNAPSHOT_SET', 'masterSnapshots', false, []),
  spec('PROPOSAL_SET', 'proposals', false, ['MASTER_SNAPSHOT_SET']),
  spec('STEP_1_RESOLUTION', 'resolution', false, [
    'MASTER_SNAPSHOT_SET',
    'PROPOSAL_SET',
  ]),
  spec('CANDIDATE_PROJECTION', 'candidateProjection', false, [
    'PROPOSAL_SET',
    'STEP_1_RESOLUTION',
  ]),
  spec('STEP_2_STRUCTURAL_IMPACT', 'structuralImpact', false, [
    'CANDIDATE_PROJECTION',
  ]),
  spec('ENGINE_DESCRIPTOR', 'engineDescriptor', false, []),
  spec('BASELINE_REFERENCE', 'baselineReference', false, []),
  spec('BASELINE_REQUEST', 'baselineRequest', false, [
    'BASELINE_REFERENCE',
    'CANDIDATE_PROJECTION',
    'ENGINE_DESCRIPTOR',
    'STEP_2_STRUCTURAL_IMPACT',
  ]),
  spec('CANDIDATE_REQUEST', 'candidateRequest', false, [
    'BASELINE_REFERENCE',
    'CANDIDATE_PROJECTION',
    'ENGINE_DESCRIPTOR',
    'STEP_2_STRUCTURAL_IMPACT',
  ]),
  spec('BASELINE_RESULT', 'baselineResult', false, [
    'BASELINE_REQUEST',
    'ENGINE_DESCRIPTOR',
  ]),
  spec('CANDIDATE_RESULT', 'candidateResult', false, [
    'CANDIDATE_REQUEST',
    'ENGINE_DESCRIPTOR',
  ]),
  spec('STEP_3_NUMERICAL_IMPACT', 'numericalImpact', false, [
    'BASELINE_REFERENCE',
    'BASELINE_RESULT',
    'CANDIDATE_PROJECTION',
    'CANDIDATE_RESULT',
    'ENGINE_DESCRIPTOR',
    'STEP_2_STRUCTURAL_IMPACT',
  ]),
  spec('REVIEW_PACKET', 'reviewPacket', false, [
    'BASELINE_REFERENCE',
    'BASELINE_RESULT',
    'CANDIDATE_PROJECTION',
    'CANDIDATE_RESULT',
    'ENGINE_DESCRIPTOR',
    'MASTER_SNAPSHOT_SET',
    'PROPOSAL_SET',
    'STEP_1_RESOLUTION',
    'STEP_2_STRUCTURAL_IMPACT',
    'STEP_3_NUMERICAL_IMPACT',
  ]),
  spec('OBSERVED_AUTHORITY', 'observedAuthority', true, [
    'REVIEW_PACKET',
  ]),
  spec('STALENESS_REPORT', 'stalenessReport', true, [
    'OBSERVED_AUTHORITY',
    'REVIEW_PACKET',
  ]),
  spec('REPEATED_CANDIDATE_RESULT', 'repeatedCandidateResult', true, [
    'CANDIDATE_REQUEST',
    'ENGINE_DESCRIPTOR',
  ]),
  spec(
    'SHADOW_REPRODUCIBILITY_RECEIPT',
    'reproducibilityReceipt',
    true,
    ['CANDIDATE_RESULT', 'REPEATED_CANDIDATE_RESULT'],
  ),
  spec('PORTABLE_BUNDLE', 'bundle', false, []),
]);

const IDENTITY_FIELD_TO_NODE = deepFreeze({
  masterSnapshotHashes: 'MASTER_SNAPSHOT_SET',
  proposalHashes: 'PROPOSAL_SET',
  resolutionHash: 'STEP_1_RESOLUTION',
  candidateProjectionHash: 'CANDIDATE_PROJECTION',
  structuralImpactHash: 'STEP_2_STRUCTURAL_IMPACT',
  engineDescriptorHash: 'ENGINE_DESCRIPTOR',
  baselineReferenceHash: 'BASELINE_REFERENCE',
  baselineRequestHash: 'BASELINE_REQUEST',
  candidateRequestHash: 'CANDIDATE_REQUEST',
  baselineResultHash: 'BASELINE_RESULT',
  candidateResultHash: 'CANDIDATE_RESULT',
  numericalImpactHash: 'STEP_3_NUMERICAL_IMPACT',
  reviewPacketHash: 'REVIEW_PACKET',
  observedAuthorityHash: 'OBSERVED_AUTHORITY',
  stalenessHash: 'STALENESS_REPORT',
  repeatedCandidateResultHash: 'REPEATED_CANDIDATE_RESULT',
  reproducibilityReceiptHash: 'SHADOW_REPRODUCIBILITY_RECEIPT',
});

const EVIDENCE_PREFIX_TO_NODE = deepFreeze([
  ['reviewPacket.', 'REVIEW_PACKET'],
  ['baselineResult.', 'BASELINE_RESULT'],
  ['candidateResult.', 'CANDIDATE_RESULT'],
  ['stalenessReport.', 'STALENESS_REPORT'],
  ['reproducibilityReceipt.', 'SHADOW_REPRODUCIBILITY_RECEIPT'],
]);

export function buildEnrichmentEvidenceLineageGraph(input) {
  assertExactKeys(input, ['bundle'], 'Lineage graph input');
  const bundle = assertEngineeringEnrichmentPortableBundle(input.bundle);
  const nodes = NODE_SPECS.map((definition) => buildNode(definition, bundle));
  const presentNodeIds = nodes
    .filter((node) => node.present)
    .map((node) => node.nodeId);
  const bundleIndex = nodes.findIndex((node) => node.nodeId === 'PORTABLE_BUNDLE');
  nodes[bundleIndex] = nodeValue({
    ...nodes[bundleIndex],
    dependencies: presentNodeIds
      .filter((nodeId) => nodeId !== 'PORTABLE_BUNDLE')
      .sort(compareAscii),
  });
  const canonicalNodes = deepFreeze(nodes.sort(compareNodes));
  const topologicalOrder = topologicalSort(canonicalNodes);
  const edgeCount = canonicalNodes.reduce(
    (total, node) => total + node.dependencies.length,
    0,
  );
  const material = {
    schema: ENRICHMENT_EVIDENCE_LINEAGE_GRAPH_SCHEMA,
    bundleHash: bundle.bundleHash,
    lineageBasis: 'DECLARED_CONTRACT_DEPENDENCIES_ONLY',
    nodes: canonicalNodes,
    topologicalOrder,
    summary: deepFreeze({
      nodeCount: canonicalNodes.length,
      presentNodeCount: canonicalNodes.filter((node) => node.present).length,
      optionalAbsentNodeCount: canonicalNodes.filter(
        (node) => node.optional && !node.present,
      ).length,
      edgeCount,
      status: 'RECORDED_SHADOW_LINEAGE_GRAPH',
    }),
    status: 'RECORDED_SHADOW_LINEAGE_GRAPH',
    persistenceCreated: false,
    reviewDecisionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    graphHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentEvidenceLineageGraph(value) {
  assertExactKeys(value, [
    'schema',
    'bundleHash',
    'lineageBasis',
    'nodes',
    'topologicalOrder',
    'summary',
    'status',
    ...FALSE_AUTHORITY_FIELDS,
    'graphHash',
  ], 'Engineering enrichment evidence lineage graph');
  if (value.schema !== ENRICHMENT_EVIDENCE_LINEAGE_GRAPH_SCHEMA) {
    fail(`graph schema must be ${ENRICHMENT_EVIDENCE_LINEAGE_GRAPH_SCHEMA}.`);
  }
  requiredText(value.bundleHash, 'bundleHash');
  if (
    value.lineageBasis !== 'DECLARED_CONTRACT_DEPENDENCIES_ONLY'
    || value.status !== 'RECORDED_SHADOW_LINEAGE_GRAPH'
  ) {
    fail('lineage basis or status is invalid.', RangeError);
  }
  assertFalseAuthority(value);
  if (!Array.isArray(value.nodes) || !Array.isArray(value.topologicalOrder)) {
    fail('nodes and topologicalOrder must be arrays.');
  }
  const nodes = value.nodes.map(assertNode);
  assertCanonicalNodeSet(nodes);
  const expectedOrder = topologicalSort(nodes);
  if (canonicalStringify(expectedOrder) !== canonicalStringify(value.topologicalOrder)) {
    fail('topologicalOrder is invalid.', RangeError);
  }
  assertSummary(value.summary, nodes);
  const material = graphMaterial(value);
  if (value.graphHash !== semanticHash(material)) {
    fail('graphHash is invalid.', RangeError);
  }
  return value;
}

export function buildEnrichmentEvidenceLineageImpact(input) {
  assertExactKeys(
    input,
    ['beforeGraph', 'afterGraph', 'comparison'],
    'Lineage impact input',
  );
  const beforeGraph = assertEngineeringEnrichmentEvidenceLineageGraph(
    input.beforeGraph,
  );
  const afterGraph = assertEngineeringEnrichmentEvidenceLineageGraph(
    input.afterGraph,
  );
  const comparison = assertEngineeringEnrichmentPortableBundleComparison(
    input.comparison,
  );
  if (
    beforeGraph.bundleHash !== comparison.beforeBundleHash
    || afterGraph.bundleHash !== comparison.afterBundleHash
  ) {
    fail('comparison bundle identities differ from lineage graphs.', RangeError);
  }

  const directChangedNodeIds = directChangedNodes(comparison);
  const dependencyUnion = unionDependents(beforeGraph.nodes, afterGraph.nodes);
  const allAffected = propagate(directChangedNodeIds, dependencyUnion);
  const downstreamAffectedNodeIds = [...allAffected]
    .filter((nodeId) => !directChangedNodeIds.includes(nodeId))
    .sort(compareAscii);
  const allAffectedNodeIds = [...allAffected].sort(compareAscii);
  const status = allAffectedNodeIds.length === 0
    ? 'NO_SHADOW_LINEAGE_IMPACT'
    : 'RECORDED_SHADOW_LINEAGE_IMPACT';
  const material = {
    schema: ENRICHMENT_EVIDENCE_LINEAGE_IMPACT_SCHEMA,
    beforeGraphHash: beforeGraph.graphHash,
    afterGraphHash: afterGraph.graphHash,
    comparisonHash: comparison.comparisonHash,
    directChangedNodeIds: deepFreeze(directChangedNodeIds),
    downstreamAffectedNodeIds: deepFreeze(downstreamAffectedNodeIds),
    allAffectedNodeIds: deepFreeze(allAffectedNodeIds),
    summary: deepFreeze({
      directChangeCount: directChangedNodeIds.length,
      downstreamAffectedCount: downstreamAffectedNodeIds.length,
      affectedNodeCount: allAffectedNodeIds.length,
      status,
    }),
    status,
    impactScope: 'DECLARED_SHADOW_LINEAGE_PROPAGATION_ONLY',
    reviewRequirement: 'NOT_AUTHORIZED',
    productionReadinessJudgement: 'NOT_AUTHORIZED',
    persistenceCreated: false,
    reviewDecisionCreated: false,
    approvalGranted: false,
    current: false,
    sealEligible: false,
    calculationEligible: false,
    resultAcceptanceEligible: false,
  };
  return deepFreeze({
    ...material,
    impactHash: semanticHash(material),
  });
}

export function assertEngineeringEnrichmentEvidenceLineageImpact(value) {
  assertExactKeys(value, [
    'schema',
    'beforeGraphHash',
    'afterGraphHash',
    'comparisonHash',
    'directChangedNodeIds',
    'downstreamAffectedNodeIds',
    'allAffectedNodeIds',
    'summary',
    'status',
    'impactScope',
    'reviewRequirement',
    'productionReadinessJudgement',
    ...FALSE_AUTHORITY_FIELDS,
    'impactHash',
  ], 'Engineering enrichment evidence lineage impact');
  if (value.schema !== ENRICHMENT_EVIDENCE_LINEAGE_IMPACT_SCHEMA) {
    fail(`impact schema must be ${ENRICHMENT_EVIDENCE_LINEAGE_IMPACT_SCHEMA}.`);
  }
  ['beforeGraphHash', 'afterGraphHash', 'comparisonHash'].forEach((field) => {
    requiredText(value[field], field);
  });
  if (
    value.impactScope !== 'DECLARED_SHADOW_LINEAGE_PROPAGATION_ONLY'
    || value.reviewRequirement !== 'NOT_AUTHORIZED'
    || value.productionReadinessJudgement !== 'NOT_AUTHORIZED'
  ) {
    fail('lineage impact scope or judgement is invalid.', RangeError);
  }
  assertFalseAuthority(value);
  const direct = sortedUniqueNodeIds(value.directChangedNodeIds, 'directChangedNodeIds');
  const downstream = sortedUniqueNodeIds(
    value.downstreamAffectedNodeIds,
    'downstreamAffectedNodeIds',
  );
  const all = sortedUniqueNodeIds(value.allAffectedNodeIds, 'allAffectedNodeIds');
  if (direct.some((nodeId) => downstream.includes(nodeId))) {
    fail('direct and downstream node sets must not overlap.', RangeError);
  }
  const expectedAll = [...new Set([...direct, ...downstream])].sort(compareAscii);
  if (canonicalStringify(expectedAll) !== canonicalStringify(all)) {
    fail('allAffectedNodeIds differs from direct and downstream sets.', RangeError);
  }
  const expectedStatus = all.length === 0
    ? 'NO_SHADOW_LINEAGE_IMPACT'
    : 'RECORDED_SHADOW_LINEAGE_IMPACT';
  if (value.status !== expectedStatus) {
    fail('lineage impact status is invalid.', RangeError);
  }
  if (!isPlainRecord(value.summary)) fail('impact summary must be an object.');
  const expectedSummary = {
    directChangeCount: direct.length,
    downstreamAffectedCount: downstream.length,
    affectedNodeCount: all.length,
    status: expectedStatus,
  };
  if (canonicalStringify(value.summary) !== canonicalStringify(expectedSummary)) {
    fail('lineage impact summary is invalid.', RangeError);
  }
  const material = impactMaterial(value);
  if (value.impactHash !== semanticHash(material)) {
    fail('impactHash is invalid.', RangeError);
  }
  return value;
}

function buildNode(definition, bundle) {
  const artifact = definition.artifactKey === 'bundle'
    ? bundle
    : bundle.artifacts[definition.artifactKey];
  const present = artifact !== null;
  const artifactSchemas = present
    ? schemasFor(definition.artifactKey, artifact)
    : [];
  const identityHashes = present
    ? hashesFor(definition.artifactKey, bundle)
    : [];
  const dependencies = present
    ? definition.dependencies.filter((nodeId) => nodePresent(nodeId, bundle))
    : [];
  return nodeValue({
    nodeId: definition.nodeId,
    artifactKey: definition.artifactKey,
    artifactSchemas,
    identityHashes,
    dependencies,
    optional: definition.optional,
    present,
  });
}

function schemasFor(artifactKey, artifact) {
  if (artifactKey === 'masterSnapshots' || artifactKey === 'proposals') {
    return [...new Set(artifact.map((row) => requiredText(
      row.schema,
      `${artifactKey}.schema`,
    )))].sort(compareAscii);
  }
  return [requiredText(artifact.schema, `${artifactKey}.schema`)];
}

function hashesFor(artifactKey, bundle) {
  const fields = {
    masterSnapshots: 'masterSnapshotHashes',
    proposals: 'proposalHashes',
    resolution: 'resolutionHash',
    candidateProjection: 'candidateProjectionHash',
    structuralImpact: 'structuralImpactHash',
    engineDescriptor: 'engineDescriptorHash',
    baselineReference: 'baselineReferenceHash',
    baselineRequest: 'baselineRequestHash',
    candidateRequest: 'candidateRequestHash',
    baselineResult: 'baselineResultHash',
    candidateResult: 'candidateResultHash',
    numericalImpact: 'numericalImpactHash',
    reviewPacket: 'reviewPacketHash',
    observedAuthority: 'observedAuthorityHash',
    stalenessReport: 'stalenessHash',
    repeatedCandidateResult: 'repeatedCandidateResultHash',
    reproducibilityReceipt: 'reproducibilityReceiptHash',
  };
  if (artifactKey === 'bundle') return [bundle.bundleHash];
  const value = bundle.artifactHashes[fields[artifactKey]];
  const hashes = Array.isArray(value) ? [...value] : [value];
  return hashes.map((hash, index) => requiredText(
    hash,
    `${artifactKey}.identityHashes[${index}]`,
  )).sort(compareAscii);
}

function nodePresent(nodeId, bundle) {
  const definition = NODE_SPECS.find((row) => row.nodeId === nodeId);
  if (!definition) fail(`unknown dependency node: ${nodeId}.`, RangeError);
  if (definition.artifactKey === 'bundle') return true;
  return bundle.artifacts[definition.artifactKey] !== null;
}

function nodeValue(value) {
  return deepFreeze({
    nodeId: value.nodeId,
    artifactKey: value.artifactKey,
    artifactSchemas: deepFreeze([...value.artifactSchemas].sort(compareAscii)),
    identityHashes: deepFreeze([...value.identityHashes].sort(compareAscii)),
    dependencies: deepFreeze([...value.dependencies].sort(compareAscii)),
    optional: value.optional,
    present: value.present,
  });
}

function assertNode(value) {
  assertExactKeys(value, [
    'nodeId',
    'artifactKey',
    'artifactSchemas',
    'identityHashes',
    'dependencies',
    'optional',
    'present',
  ], 'Lineage node');
  const nodeId = requiredText(value.nodeId, 'nodeId');
  const definition = NODE_SPECS.find((row) => row.nodeId === nodeId);
  if (!definition) fail(`unknown nodeId: ${nodeId}.`, RangeError);
  if (
    value.artifactKey !== definition.artifactKey
    || value.optional !== definition.optional
    || typeof value.present !== 'boolean'
  ) {
    fail(`node ${nodeId} metadata is invalid.`, RangeError);
  }
  const artifactSchemas = sortedUniqueText(
    value.artifactSchemas,
    `${nodeId}.artifactSchemas`,
    value.present,
  );
  const identityHashes = sortedUniqueText(
    value.identityHashes,
    `${nodeId}.identityHashes`,
    value.present,
  );
  const dependencies = sortedUniqueNodeIds(
    value.dependencies,
    `${nodeId}.dependencies`,
  );
  if (!value.present && (artifactSchemas.length || identityHashes.length || dependencies.length)) {
    fail(`absent optional node ${nodeId} must not carry evidence.`, RangeError);
  }
  if (!value.optional && !value.present) {
    fail(`required node ${nodeId} must be present.`, RangeError);
  }
  return nodeValue({
    nodeId,
    artifactKey: value.artifactKey,
    artifactSchemas,
    identityHashes,
    dependencies,
    optional: value.optional,
    present: value.present,
  });
}

function assertCanonicalNodeSet(nodes) {
  if (nodes.length !== NODE_SPECS.length) {
    fail('lineage graph must contain every declared node.', RangeError);
  }
  const nodeIds = nodes.map((node) => node.nodeId);
  const expectedNodeIds = NODE_SPECS.map((row) => row.nodeId).sort(compareAscii);
  if (canonicalStringify(nodeIds) !== canonicalStringify(expectedNodeIds)) {
    fail('lineage nodes must be sorted and complete.', RangeError);
  }
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  nodes.forEach((node) => {
    const definition = NODE_SPECS.find((row) => row.nodeId === node.nodeId);
    const expectedDependencies = node.nodeId === 'PORTABLE_BUNDLE'
      ? nodes
        .filter((candidate) => candidate.present && candidate.nodeId !== 'PORTABLE_BUNDLE')
        .map((candidate) => candidate.nodeId)
        .sort(compareAscii)
      : definition.dependencies
        .filter((dependency) => byId.get(dependency)?.present)
        .sort(compareAscii);
    if (
      canonicalStringify(node.dependencies)
      !== canonicalStringify(node.present ? expectedDependencies : [])
    ) {
      fail(`node ${node.nodeId} dependencies differ from declared lineage.`, RangeError);
    }
  });
}

function topologicalSort(nodes) {
  const present = nodes.filter((node) => node.present);
  const byId = new Map(present.map((node) => [node.nodeId, node]));
  const indegree = new Map(present.map((node) => [node.nodeId, 0]));
  const dependents = new Map(present.map((node) => [node.nodeId, []]));
  present.forEach((node) => {
    node.dependencies.forEach((dependency) => {
      if (!byId.has(dependency)) {
        fail(`node ${node.nodeId} depends on absent node ${dependency}.`, RangeError);
      }
      indegree.set(node.nodeId, indegree.get(node.nodeId) + 1);
      dependents.get(dependency).push(node.nodeId);
    });
  });
  dependents.forEach((rows) => rows.sort(compareAscii));
  const ready = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId)
    .sort(compareAscii);
  const order = [];
  while (ready.length) {
    const nodeId = ready.shift();
    order.push(nodeId);
    dependents.get(nodeId).forEach((dependent) => {
      const count = indegree.get(dependent) - 1;
      indegree.set(dependent, count);
      if (count === 0) {
        ready.push(dependent);
        ready.sort(compareAscii);
      }
    });
  }
  if (order.length !== present.length) {
    fail('lineage graph contains a dependency cycle.', RangeError);
  }
  return deepFreeze(order);
}

function assertSummary(summary, nodes) {
  if (!isPlainRecord(summary)) fail('graph summary must be an object.');
  const expected = {
    nodeCount: nodes.length,
    presentNodeCount: nodes.filter((node) => node.present).length,
    optionalAbsentNodeCount: nodes.filter(
      (node) => node.optional && !node.present,
    ).length,
    edgeCount: nodes.reduce((total, node) => total + node.dependencies.length, 0),
    status: 'RECORDED_SHADOW_LINEAGE_GRAPH',
  };
  if (canonicalStringify(summary) !== canonicalStringify(expected)) {
    fail('graph summary is invalid.', RangeError);
  }
}

function directChangedNodes(comparison) {
  const direct = new Set();
  comparison.identityChanges.forEach((change) => {
    const nodeId = IDENTITY_FIELD_TO_NODE[change.field];
    if (!nodeId) fail(`unmapped identity change field: ${change.field}.`, RangeError);
    direct.add(nodeId);
  });
  if (comparison.candidateChanges.length) direct.add('CANDIDATE_PROJECTION');
  if (comparison.metricChanges.length) direct.add('STEP_3_NUMERICAL_IMPACT');
  comparison.evidenceChanges.forEach((change) => {
    const match = EVIDENCE_PREFIX_TO_NODE.find(([prefix]) => (
      change.field.startsWith(prefix)
    ));
    if (match) direct.add(match[1]);
  });
  if (comparison.summary.differenceCount > 0 && direct.size === 0) {
    fail('comparison differences could not be mapped to lineage nodes.', RangeError);
  }
  return [...direct].sort(compareAscii);
}

function unionDependents(beforeNodes, afterNodes) {
  const dependents = new Map(NODE_SPECS.map((row) => [row.nodeId, new Set()]));
  [...beforeNodes, ...afterNodes].forEach((node) => {
    node.dependencies.forEach((dependency) => {
      dependents.get(dependency).add(node.nodeId);
    });
  });
  return dependents;
}

function propagate(directNodeIds, dependents) {
  const affected = new Set(directNodeIds);
  const queue = [...directNodeIds];
  while (queue.length) {
    const nodeId = queue.shift();
    [...(dependents.get(nodeId) || [])].sort(compareAscii).forEach((dependent) => {
      if (affected.has(dependent)) return;
      affected.add(dependent);
      queue.push(dependent);
    });
  }
  return affected;
}

function graphMaterial(value) {
  return {
    schema: value.schema,
    bundleHash: value.bundleHash,
    lineageBasis: value.lineageBasis,
    nodes: value.nodes,
    topologicalOrder: value.topologicalOrder,
    summary: value.summary,
    status: value.status,
    persistenceCreated: value.persistenceCreated,
    reviewDecisionCreated: value.reviewDecisionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
    resultAcceptanceEligible: value.resultAcceptanceEligible,
  };
}

function impactMaterial(value) {
  return {
    schema: value.schema,
    beforeGraphHash: value.beforeGraphHash,
    afterGraphHash: value.afterGraphHash,
    comparisonHash: value.comparisonHash,
    directChangedNodeIds: value.directChangedNodeIds,
    downstreamAffectedNodeIds: value.downstreamAffectedNodeIds,
    allAffectedNodeIds: value.allAffectedNodeIds,
    summary: value.summary,
    status: value.status,
    impactScope: value.impactScope,
    reviewRequirement: value.reviewRequirement,
    productionReadinessJudgement: value.productionReadinessJudgement,
    persistenceCreated: value.persistenceCreated,
    reviewDecisionCreated: value.reviewDecisionCreated,
    approvalGranted: value.approvalGranted,
    current: value.current,
    sealEligible: value.sealEligible,
    calculationEligible: value.calculationEligible,
    resultAcceptanceEligible: value.resultAcceptanceEligible,
  };
}

function sortedUniqueText(value, label, required) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const rows = value.map((row, index) => requiredText(row, `${label}[${index}]`));
  const sorted = [...new Set(rows)].sort(compareAscii);
  if (sorted.length !== rows.length || canonicalStringify(rows) !== canonicalStringify(sorted)) {
    fail(`${label} must be sorted and unique.`, RangeError);
  }
  if (required && rows.length === 0) fail(`${label} must not be empty.`, RangeError);
  return rows;
}

function sortedUniqueNodeIds(value, label) {
  const rows = sortedUniqueText(value, label, false);
  rows.forEach((nodeId) => {
    if (!NODE_SPECS.some((row) => row.nodeId === nodeId)) {
      fail(`${label} contains unknown nodeId: ${nodeId}.`, RangeError);
    }
  });
  return rows;
}

function assertFalseAuthority(value) {
  FALSE_AUTHORITY_FIELDS.forEach((field) => {
    if (value[field] !== false) fail(`${field} must remain false.`, RangeError);
  });
}

function spec(nodeId, artifactKey, optional, dependencies) {
  return {
    nodeId,
    artifactKey,
    optional,
    dependencies: [...dependencies].sort(compareAscii),
  };
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function compareNodes(left, right) {
  return compareAscii(left.nodeId, right.nodeId);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentEvidenceLineage: ${message}`);
}
