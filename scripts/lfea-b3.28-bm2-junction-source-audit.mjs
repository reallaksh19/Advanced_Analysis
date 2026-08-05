#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { buildBm2SolveAuthorities } from './lfea-b3.26-bm2-solve-fixtures.mjs';
import {
  BM2_CII_OUTPUT_PATH,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';

const authorities = buildBm2SolveAuthorities();
const geometry = authorities.normalized.geometry;
const nodeById = new Map(geometry.nodes.map((node) => [node.id, node]));
const output = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
const outputPairs = [...output.globalForce.get('OPE').keys()];

const subtract = (left, right) => left.map((value, index) => value - right[index]);
const norm = (vector) => Math.hypot(...vector);
const unit = (vector) => {
  const length = norm(vector);
  if (!(length > 0)) throw new Error('Junction incident vector has zero length.');
  return vector.map((value) => value / length);
};
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);
const point = (nodeId) => {
  const node = nodeById.get(nodeId);
  if (!node) throw new Error(`BM2 junction node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
};

const incidentByNode = new Map();
for (const segment of geometry.segments) {
  for (const [nodeId, otherNodeId, end] of [
    [segment.startNodeId, segment.endNodeId, 'I'],
    [segment.endNodeId, segment.startNodeId, 'J'],
  ]) {
    if (!incidentByNode.has(nodeId)) incidentByNode.set(nodeId, []);
    incidentByNode.get(nodeId).push({
      segment,
      otherNodeId,
      end,
      directionAway: unit(subtract(point(otherNodeId), point(nodeId))),
    });
  }
}

const junctions = [];
for (const [nodeId, incident] of incidentByNode) {
  if (incident.length !== 3) continue;
  const pairs = [];
  for (let left = 0; left < incident.length; left += 1) {
    for (let right = left + 1; right < incident.length; right += 1) {
      pairs.push({
        left,
        right,
        dot: dot(incident[left].directionAway, incident[right].directionAway),
      });
    }
  }
  pairs.sort((a, b) => a.dot - b.dot);
  const runPair = pairs[0];
  const branchIndex = [0, 1, 2].find(
    (index) => index !== runPair.left && index !== runPair.right,
  );
  const run = [incident[runPair.left], incident[runPair.right]];
  const branch = incident[branchIndex];
  const runOuterDiameters = run.map((row) => row.segment.diameter);
  const runOuterDiameter = Math.max(...runOuterDiameters);
  const candidateSurfaceNodeId = String(Number(nodeId) + 1);
  const relevantOutputPairs = outputPairs.filter((pairKey) => {
    const [fromNode, toNode] = pairKey.split('-');
    return [fromNode, toNode].includes(nodeId)
      || [fromNode, toNode].includes(candidateSurfaceNodeId);
  });
  const sifEvidence = incident.flatMap((row) => (
    (row.segment.meta.analysis.sifs ?? []).map((sif) => ({
      segmentId: row.segment.id,
      sourceIndex: row.segment.meta.sourceIndex,
      ...sif,
    }))
  ));
  junctions.push({
    nodeId,
    candidateSurfaceNodeId,
    runCollinearity: runPair.dot,
    run: run.map((row) => ({
      segmentId: row.segment.id,
      sourceIndex: row.segment.meta.sourceIndex,
      fromNode: row.segment.startNodeId,
      toNode: row.segment.endNodeId,
      sourceType: row.segment.type,
      diameter: row.segment.diameter,
      thickness: row.segment.thickness,
      endAtJunction: row.end,
      directionAway: row.directionAway,
    })),
    branch: {
      segmentId: branch.segment.id,
      sourceIndex: branch.segment.meta.sourceIndex,
      fromNode: branch.segment.startNodeId,
      toNode: branch.segment.endNodeId,
      sourceType: branch.segment.type,
      diameter: branch.segment.diameter,
      thickness: branch.segment.thickness,
      endAtJunction: branch.end,
      directionAway: branch.directionAway,
      sourceLength: branch.segment.length,
    },
    runOuterDiameter,
    candidateSurfaceOffset: runOuterDiameter / 2,
    candidateSurfacePoint: point(nodeId).map(
      (value, index) => value + branch.directionAway[index] * runOuterDiameter / 2,
    ),
    sifEvidence,
    relevantOutputPairs,
  });
}

junctions.sort((left, right) => Number(left.nodeId) - Number(right.nodeId));
console.log(JSON.stringify({
  schema: 'lfea-bm2-junction-source-audit/v1',
  junctionCount: junctions.length,
  junctions,
}, null, 2));
