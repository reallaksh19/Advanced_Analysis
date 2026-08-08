#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildBm4SolveAuthorities } from './lfea-m034-bm4-solve-fixtures.mjs';

const authorities = buildBm4SolveAuthorities();
const geometry = authorities.normalized.geometry;

const frictionRows = geometry.nodes.flatMap((node) => (
  (node.meta?.restraints ?? [])
    .filter((restraint) => Number.isFinite(restraint.frictionCoefficient) && restraint.frictionCoefficient > 0)
    .map((restraint) => Object.freeze({
      nodeId: String(node.id),
      sourceTypeCode: restraint.sourceTypeCode,
      typeCode: restraint.typeCode,
      frictionCoefficient: restraint.frictionCoefficient,
      gap: restraint.gap,
      xCosine: restraint.xCosine,
      yCosine: restraint.yCosine,
      zCosine: restraint.zCosine,
    }))
)).sort((left, right) => Number(left.nodeId) - Number(right.nodeId));

assert.ok(frictionRows.length > 0, 'BM4 must retain explicit positive friction coefficients in source restraints.');
assert.ok(
  frictionRows.every((row) => row.frictionCoefficient === 0.3),
  'Every positive BM4 source friction coefficient must currently be 0.3.',
);

console.log(JSON.stringify({
  schema: 'm040-bm4-friction-source-probe/v1',
  frictionRowCount: frictionRows.length,
  nodeIds: [...new Set(frictionRows.map((row) => row.nodeId))],
  rows: frictionRows,
}, null, 2));
