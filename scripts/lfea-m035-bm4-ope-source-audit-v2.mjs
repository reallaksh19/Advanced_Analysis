#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BM4_COMPARISON_POLICY } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';

const ATTRIBUTION_PATH = fileURLToPath(new URL('../reports/m035-m036-bm4-failure-attribution.json', import.meta.url));
const REPORT_JSON = fileURLToPath(new URL('../reports/m035-bm4-ope-source-audit.json', import.meta.url));
const REPORT_MD = fileURLToPath(new URL('../reports/m035-bm4-ope-source-audit.md', import.meta.url));
const NODE_PREFIX = 'BM4M035.N';
const QUALIFIED_BASE_SHA = '65acbd5ca6f13e431d913ae8b227148894171812';
const MAX_FRICTION_DISTANCE = 8;

function correctedNodeId(nodeId) {
  return String(nodeId).replace(/^BM4M035\.N/u, '').replace(/^BM4\.N/u, '');
}

function sourceRestraints(node) {
  return (node?.meta?.restraints ?? []).map((row) => ({
    sourceTypeRaw: row.sourceTypeRaw,
    sourceTypeCode: row.sourceTypeCode,
    typeCode: row.typeCode,
    xCosine: row.xCosine,
    yCosine: row.yCosine,
    zCosine: row.zCosine,
    gap: row.gap,
    frictionCoefficient: row.frictionCoefficient,
    mutationApplied: row.mutationApplied,
  }));
}

function touchedNodes(row) {
  return row.family === 'displacement' || row.family === 'restraint'
    ? [String(row.identifier)]
    : String(row.identifier).split('-');
}

function sourceGraph(authorities) {
  const graph = new Map(authorities.sourceGeometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const entry of authorities.base.entries) {
    const source = entry.sourceSegment;
    const i = String(source.startNodeId);
    const j = String(source.endNodeId);
    graph.get(i)?.add(j);
    graph.get(j)?.add(i);
  }
  return graph;
}

function rigidGraph(authorities) {
  const graph = new Map(authorities.sourceGeometry.nodes.map((node) => [String(node.id), new Set()]));
  for (const entry of authorities.base.entries) {
    if (entry.rigidAuthority === null) continue;
    const source = entry.sourceSegment;
    const i = String(source.startNodeId);
    const j = String(source.endNodeId);
    graph.get(i)?.add(j);
    graph.get(j)?.add(i);
  }
  return graph;
}

function distanceToSet(starts, targets, graph, limit = MAX_FRICTION_DISTANCE) {
  const queue = starts.map((node) => [String(node), 0]);
  const visited = new Set();
  while (queue.length) {
    const [node, distance] = queue.shift();
    if (visited.has(node) || distance > limit) continue;
    visited.add(node);
    if (targets.has(node)) return distance;
    if (distance < limit) for (const next of graph.get(node) ?? []) queue.push([next, distance + 1]);
  }
  return null;
}

function sharesRigidComponent(starts, frictionNodes, graph) {
  for (const start of starts) {
    const queue = [String(start)];
    const visited = new Set();
    while (queue.length) {
      const node = queue.shift();
      if (visited.has(node)) continue;
      visited.add(node);
      if (frictionNodes.has(node)) return true;
      for (const next of graph.get(node) ?? []) queue.push(next);
    }
  }
  return false;
}

function incidentSources(authorities, nodes) {
  const selected = new Set(nodes.map(String));
  return authorities.base.entries.filter((entry) => {
    const source = entry.sourceSegment;
    return selected.has(String(source.startNodeId)) || selected.has(String(source.endNodeId));
  }).map((entry) => ({
    sourceSegmentId: String(entry.sourceSegment.id),
    pair: `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`,
    sourceType: entry.sourceSegment.type,
    rigid: entry.rigidAuthority !== null,
    analysisDescendants: authorities.entries
      .filter((row) => row.sourceSegmentId === String(entry.sourceSegment.id))
      .map((row) => row.elementId),
  }));
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function classifyUnexplained(row, evidence) {
  if (evidence.directFriction) return 'UNSUPPORTED_FRICTION_DIRECT';
  if (evidence.sameRigidComponentAsFriction) return 'UNSUPPORTED_FRICTION_RIGID_COMPONENT';
  if (evidence.frictionDistanceEdges === 1) return 'UNSUPPORTED_FRICTION_ADJACENT_1_EDGE';
  if (evidence.referenceToNearZeroThresholdRatio <= 10) return 'SMALL_REFERENCE_PERCENT_AMPLIFICATION';
  return 'RESIDUAL_MECHANICS_OR_RECOVERY';
}

function markdown(report) {
  const lines = [
    '# M035/M036 BM4 OPE source-level audit',
    '',
    `Qualified base: \`${report.qualifiedBaseSha}\``,
    '',
    '## Frozen mechanics',
    '',
    `- source nodes/elements: ${report.invariants.sourceNodes}/${report.invariants.sourceElements}`,
    `- analysis nodes/elements: ${report.invariants.analysisNodes}/${report.invariants.analysisElements}`,
    `- bend components: ${report.invariants.bendComponents}`,
    `- tee junctions: ${report.invariants.teeJunctions}`,
    `- reducer candidates / active condensation: ${report.invariants.reducerCandidates}/${report.invariants.reducerCondensationActive}`,
    '',
    '## OPE row disposition',
    '',
    `- matched OPE failures above ±5%: ${report.ope.failureCount}`,
    `- direct/rigid/one-edge unsupported-friction rows reclassified from unexplained: ${report.ope.unexplainedFrictionEvidenceCount}`,
    `- residual mechanics/recovery rows after source evidence: ${report.ope.residualMechanicsOrRecoveryCount}`,
    '',
    '### Refined failure categories',
    '',
  ];
  for (const [key, value] of Object.entries(report.ope.refinedCategories).sort((a, b) => b[1] - a[1])) lines.push(`- ${key}: ${value}`);
  lines.push('', '## Friction source nodes', '', `The InputXML carries nonzero friction at ${report.source.frictionNodes.length} source nodes. Friction is not modeled by the current solver and is not approximated in this PR.`, '',
    report.source.frictionNodes.join(', '), '', '## Highest residual mechanics/recovery candidates', '',
    '| family | row | field | ours | CAESAR | error % | friction distance | source context |',
    '|---|---|---|---:|---:|---:|---:|---|');
  for (const row of report.ope.topResidualMechanicsOrRecovery.slice(0, 25)) {
    lines.push(`| ${row.family} | ${row.identifier}${row.end ? `/${row.end}` : ''} | ${row.field} | ${row.ours} | ${row.cii} | ${row.percentDifference == null ? 'near-zero' : row.percentDifference.toFixed(2)} | ${row.sourceEvidence.frictionDistanceEdges ?? 'n/a'} | ${row.sourceEvidence.incidentSources.map((entry) => `${entry.pair}${entry.rigid ? ':RIGID' : ''}${entry.sourceType === 'BEND' ? ':BEND' : ''}`).join('; ')} |`);
  }
  lines.push('', '## Guardrails', '',
    '- PR #840 bend ingestion remains frozen; the audit asserts 12 bends and 327 analysis nodes.',
    '- Existing M036 active-set behavior is not broadened by this audit.',
    '- Friction is an explicit unsupported-physics boundary, not a tuning knob.',
    '- Reducer condensation remains fail-closed.',
    '- Percentage-only failures on tiny references are surfaced separately from mechanically large residuals.',
    '');
  return `${lines.join('\n')}\n`;
}

const attribution = JSON.parse(readFileSync(ATTRIBUTION_PATH, 'utf8'));
const combined = solveBm4M035M036Combined();
assert.equal(combined.authorities.bendExpansion.components.length, 12, 'qualified bend count drift');
assert.equal(combined.authorities.analysisGeometry.nodes.length, 327, 'qualified analysis node count drift');

const sourceNodes = new Map(combined.authorities.sourceGeometry.nodes.map((node) => [String(node.id), node]));
const frictionNodes = new Set();
const plusYNodes = new Set();
const anchorNodes = new Set();
for (const node of combined.authorities.sourceGeometry.nodes) {
  for (const restraint of node.meta?.restraints ?? []) {
    if ((restraint.frictionCoefficient ?? 0) > 0) frictionNodes.add(String(node.id));
    if (String(restraint.typeCode) === '14') plusYNodes.add(String(node.id));
    if (String(restraint.typeCode) === '0') anchorNodes.add(String(node.id));
  }
}
const graph = sourceGraph(combined.authorities);
const rigids = rigidGraph(combined.authorities);
const reducerNodes = new Set(combined.authorities.inlineReducers.transitions.map((row) => String(row.nodeId)));
const activeUnilateralNodes = new Set(combined.inventory.unilateral.map((row) => correctedNodeId(row.nodeId)));

const opeFailures = attribution.matchedFailures.filter((row) => row.caseLabel === 'OPE').map((row) => {
  const nodes = touchedNodes(row);
  const directFriction = nodes.some((node) => frictionNodes.has(node));
  const sameRigidComponentAsFriction = sharesRigidComponent(nodes, frictionNodes, rigids);
  const frictionDistanceEdges = distanceToSet(nodes, frictionNodes, graph);
  const reducerDistanceEdges = distanceToSet(nodes, reducerNodes, graph, 4);
  const anchorDistanceEdges = distanceToSet(nodes, anchorNodes, graph, 4);
  const nodeEvidence = nodes.map((nodeId) => {
    const node = sourceNodes.get(nodeId);
    return {
      nodeId,
      position: node ? [node.x, node.y, node.z] : null,
      restraints: sourceRestraints(node),
      plusY: plusYNodes.has(nodeId),
      unilateralInQualifiedM036: activeUnilateralNodes.has(nodeId),
    };
  });
  const sourceEvidence = {
    touchedNodes: nodes,
    directFriction,
    sameRigidComponentAsFriction,
    frictionDistanceEdges,
    reducerDistanceEdges,
    anchorDistanceEdges,
    referenceToNearZeroThresholdRatio: Math.abs(row.cii) / Math.max(BM4_COMPARISON_POLICY.nearZeroReferenceThreshold, Number.EPSILON),
    nodeEvidence,
    incidentSources: incidentSources(combined.authorities, nodes),
  };
  const refinedCategory = row.primaryCategory === 'UNEXPLAINED_MATCHED'
    ? classifyUnexplained(row, sourceEvidence)
    : row.primaryCategory;
  return { ...row, refinedCategory, sourceEvidence };
});

const unexplained = opeFailures.filter((row) => row.primaryCategory === 'UNEXPLAINED_MATCHED');
const unexplainedFrictionEvidence = unexplained.filter((row) => row.refinedCategory.startsWith('UNSUPPORTED_FRICTION_'));
const residualMechanicsOrRecovery = unexplained.filter((row) => row.refinedCategory === 'RESIDUAL_MECHANICS_OR_RECOVERY')
  .sort((a, b) => b.normalizedSeverity - a.normalizedSeverity);
const smallReference = unexplained.filter((row) => row.refinedCategory === 'SMALL_REFERENCE_PERCENT_AMPLIFICATION');

const report = {
  schema: 'm035-bm4-ope-source-audit/v3',
  qualifiedBaseSha: QUALIFIED_BASE_SHA,
  invariants: {
    sourceNodes: combined.authorities.sourceGeometry.nodes.length,
    sourceElements: combined.authorities.base.entries.length,
    analysisNodes: combined.authorities.analysisGeometry.nodes.length,
    analysisElements: combined.authorities.entries.length,
    bendComponents: combined.authorities.bendExpansion.components.length,
    teeJunctions: combined.authorities.teeJunctions.length,
    reducerCandidates: combined.authorities.inlineReducers.transitions.length,
    reducerCondensationActive: 0,
    operatingSolverStatus: combined.operating.execution.qualificationStatus,
    operatingForceEquilibrium: combined.operating.execution.diagnostics.forceEquilibrium,
  },
  source: {
    frictionNodes: [...frictionNodes].sort(),
    plusYNodes: [...plusYNodes].sort(),
    activeUnilateralNodes: [...activeUnilateralNodes].sort(),
    reducerNodes: [...reducerNodes].sort(),
    anchorNodes: [...anchorNodes].sort(),
  },
  ope: {
    failureCount: opeFailures.length,
    originalCategories: countBy(opeFailures, (row) => row.primaryCategory),
    refinedCategories: countBy(opeFailures, (row) => row.refinedCategory),
    unexplainedCount: unexplained.length,
    unexplainedFrictionEvidenceCount: unexplainedFrictionEvidence.length,
    smallReferenceCount: smallReference.length,
    residualMechanicsOrRecoveryCount: residualMechanicsOrRecovery.length,
    topResidualMechanicsOrRecovery: residualMechanicsOrRecovery.slice(0, 50),
    topUnexplainedFrictionEvidence: unexplainedFrictionEvidence.sort((a, b) => b.normalizedSeverity - a.normalizedSeverity).slice(0, 50),
    smallReferenceRows: smallReference.sort((a, b) => b.normalizedSeverity - a.normalizedSeverity).slice(0, 50),
    failures: opeFailures,
  },
  falsifiedHypotheses: {
    globalAllPlusY: {
      verdict: 'FALSIFIED_EQUILIBRIUM',
      evidence: 'Evidence-only all-+Y active-set counterfactual produced vertical equilibrium relative residual 0.0025873376585519425 against the qualified 0.0001 envelope; production M036 is unchanged.',
    },
  },
  limitations: [
    'Nonzero InputXML friction is preserved as source evidence but Coulomb stick/slip is not modeled.',
    'Inline reducer transitions remain detected without activated reducer condensation.',
    'No off-node CAESAR station interpolation is invented.',
  ],
};

mkdirSync(fileURLToPath(new URL('../reports', import.meta.url)), { recursive: true });
writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(REPORT_MD, markdown(report));

console.log(`BM4_OPE_SOURCE_AUDIT_SUMMARY=${JSON.stringify({
  invariants: report.invariants,
  source: {
    frictionNodes: report.source.frictionNodes,
    plusYCount: report.source.plusYNodes.length,
    activeUnilateralNodes: report.source.activeUnilateralNodes,
  },
  ope: {
    failureCount: report.ope.failureCount,
    originalCategories: report.ope.originalCategories,
    refinedCategories: report.ope.refinedCategories,
    unexplainedFrictionEvidenceCount: report.ope.unexplainedFrictionEvidenceCount,
    smallReferenceCount: report.ope.smallReferenceCount,
    residualMechanicsOrRecoveryCount: report.ope.residualMechanicsOrRecoveryCount,
    topResidualMechanicsOrRecovery: report.ope.topResidualMechanicsOrRecovery.slice(0, 12).map((row) => ({
      family: row.family,
      identifier: row.identifier,
      end: row.end,
      field: row.field,
      ours: row.ours,
      cii: row.cii,
      percentDifference: row.percentDifference,
      frictionDistanceEdges: row.sourceEvidence.frictionDistanceEdges,
      reducerDistanceEdges: row.sourceEvidence.reducerDistanceEdges,
      anchorDistanceEdges: row.sourceEvidence.anchorDistanceEdges,
      incidentSources: row.sourceEvidence.incidentSources.map((entry) => ({ pair: entry.pair, sourceType: entry.sourceType, rigid: entry.rigid })),
    })),
  },
  falsifiedHypotheses: report.falsifiedHypotheses,
})}`);
