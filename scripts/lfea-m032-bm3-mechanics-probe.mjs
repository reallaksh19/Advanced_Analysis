#!/usr/bin/env node

import { buildBm3Authorities } from './lfea-m028-bm3-fixtures.mjs';

const authorities = buildBm3Authorities({
  modelIdentity: 'BM3-M032-MECHANICS-PROBE',
  modelRevision: 1,
});

const nodes = new Map(authorities.normalized.geometry.nodes.map((node) => [node.id, node]));
const point = (nodeId) => {
  const node = nodes.get(nodeId);
  return node ? [node.x, node.y, node.z] : null;
};
const segments = authorities.normalized.geometry.segments;
const incident = (nodeId) => segments
  .filter((segment) => segment.startNodeId === nodeId || segment.endNodeId === nodeId)
  .map((segment) => ({
    id: segment.id,
    type: segment.type,
    startNodeId: segment.startNodeId,
    endNodeId: segment.endNodeId,
    diameter: segment.diameter,
    thickness: segment.thickness,
  }));

const bends = segments
  .filter((segment) => segment.type === 'BEND')
  .map((segment) => ({
    id: segment.id,
    startNodeId: segment.startNodeId,
    endNodeId: segment.endNodeId,
    start: point(segment.startNodeId),
    end: point(segment.endNodeId),
    diameter: segment.diameter,
    thickness: segment.thickness,
    length: segment.length,
    metaKeys: Object.keys(segment.meta ?? {}).sort(),
    meta: segment.meta,
    startIncident: incident(segment.startNodeId),
    endIncident: incident(segment.endNodeId),
  }));

const reducers = [...authorities.reducerDefinitions.entries()].map(([sourceSegmentId, definition]) => ({
  sourceSegmentId,
  source: {
    startNodeId: definition.sourceSegment.startNodeId,
    endNodeId: definition.sourceSegment.endNodeId,
    diameter: definition.sourceSegment.diameter,
    thickness: definition.sourceSegment.thickness,
    length: definition.sourceSegment.length,
  },
  previous: {
    id: definition.previous.id,
    diameter: definition.previous.diameter,
    thickness: definition.previous.thickness,
  },
  next: {
    id: definition.next.id,
    diameter: definition.next.diameter,
    thickness: definition.next.thickness,
  },
  T1: {
    stiffness: definition.T1.condensedStiffness,
    weight: definition.T1.gravity,
  },
  T2: {
    stiffness: definition.T2.condensedStiffness,
    weight: definition.T2.gravity,
  },
}));

const hangerNodes = ['20', '22'];
const hangerAdjacency = Object.fromEntries(hangerNodes.map((nodeId) => [nodeId, {
  sourceIncident: incident(nodeId),
  compiledEntries: authorities.modelEntries
    .filter((entry) => entry.referenceFromNode === nodeId || entry.referenceToNode === nodeId)
    .map((entry) => ({
      elementId: entry.elementId,
      sourceSegmentId: entry.sourceSegment.id,
      referenceFromNode: entry.referenceFromNode,
      referenceToNode: entry.referenceToNode,
      reducerIndex: entry.reducerIndex ?? null,
      rigid: entry.rigid ?? false,
      analysisRole: entry.segment?.meta?.analysisRole ?? null,
      sectionStateId: entry.section?.sectionState?.sectionStateId ?? null,
      section: entry.section?.dimensions ?? null,
    })),
}]));

console.log(JSON.stringify({
  sourceTopology: {
    nodes: authorities.normalized.geometry.nodes.length,
    segments: authorities.normalized.geometry.segments.length,
  },
  analysisTopology: {
    nodes: authorities.analysisGeometry.nodes.length,
    segments: authorities.analysisGeometry.segments.length,
  },
  bends,
  reducers,
  hangerAdjacency,
}, null, 2));
