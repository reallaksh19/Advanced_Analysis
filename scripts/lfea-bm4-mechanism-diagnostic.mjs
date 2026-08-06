#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RESTRAINT_TYPE_CODE_MAP } from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import { parseInputXmlToCanonicalGeometry } from '../src/core/linear-piping-analysis-consumer/inputxml-source-binding.js';
import { constraintDeclarations } from '../src/core/linear-piping-analysis-consumer/generic-inputxml-solve-model.js';

const INPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM4/InputXML_BM4.xml', import.meta.url));
const xmlText = readFileSync(INPUT_PATH, 'utf8');
const modelId = 'BM4';
const geometry = parseInputXmlToCanonicalGeometry(xmlText, {
  source: modelId,
  fileName: 'InputXML_BM4.xml',
  restraintTypeCodeMap: { ...DEFAULT_RESTRAINT_TYPE_CODE_MAP },
  bendRadiusTolerance: 1e-6,
});

const adjacency = new Map(geometry.nodes.map((node) => [String(node.id), new Set()]));
for (const segment of geometry.segments) {
  const a = String(segment.startNodeId);
  const b = String(segment.endNodeId);
  if (!adjacency.has(a)) adjacency.set(a, new Set());
  if (!adjacency.has(b)) adjacency.set(b, new Set());
  adjacency.get(a).add(b);
  adjacency.get(b).add(a);
}

function componentFrom(seed) {
  const seen = new Set();
  const queue = [String(seed)];
  while (queue.length > 0) {
    const node = queue.shift();
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort((a, b) => Number(a) - Number(b));
}

const componentNodes = componentFrom('20010');
const componentSet = new Set(componentNodes);
const nodeById = new Map(geometry.nodes.map((node) => [String(node.id), node]));
const componentSegments = geometry.segments
  .filter((segment) => componentSet.has(String(segment.startNodeId)) || componentSet.has(String(segment.endNodeId)))
  .map((segment) => ({
    id: segment.id,
    from: String(segment.startNodeId),
    to: String(segment.endNodeId),
    rigid: Boolean(segment.meta?.rigid),
    bendDeclaredRadius: segment.meta?.bendDeclaredRadius ?? null,
  }));

const nodeDiagnostics = componentNodes.map((nodeId) => {
  const node = nodeById.get(nodeId);
  return {
    nodeId,
    restraint: node?.restraint ?? null,
    restraints: (node?.meta?.restraints ?? []).map((row) => ({
      sourceTypeCode: row.sourceTypeCode ?? null,
      typeCode: row.typeCode ?? null,
      classification: row.classification ?? null,
      mutationApplied: row.mutationApplied ?? null,
      mutationLabel: row.mutationLabel ?? null,
      xCosine: row.xCosine ?? null,
      yCosine: row.yCosine ?? null,
      zCosine: row.zCosine ?? null,
      cNode: row.cNode ?? row.cnode ?? null,
      frictionCoefficient: row.frictionCoefficient ?? row.fricCoef ?? null,
      gap: row.gap ?? null,
      stiffness: row.stiffness ?? null,
    })),
  };
});

const { declarations, unresolvedRestraintNodes } = constraintDeclarations(geometry, modelId);
const componentConstraints = declarations
  .filter((row) => componentSet.has(String(row.nodeId).replace(`${modelId}.N`, '')))
  .map((row) => ({ nodeId: row.nodeId, dof: row.dof, declarationId: row.declarationId }));

const report = {
  geometryValid: geometry.valid,
  geometryUnit: geometry.unit,
  geometryDiagnostics: (geometry.diagnostics ?? []).filter((row) => row.severity === 'error' || row.severity === 'ERROR'),
  componentSeed: '20010',
  componentNodeCount: componentNodes.length,
  componentNodes,
  componentSegments,
  nodeDiagnostics,
  componentConstraints,
  unresolvedRestraintNodes: unresolvedRestraintNodes.filter((row) => componentSet.has(String(row.nodeId))),
};

console.log('BM4_MECHANISM_DIAGNOSTIC_BEGIN');
console.log(JSON.stringify(report, null, 2));
console.log('BM4_MECHANISM_DIAGNOSTIC_END');
