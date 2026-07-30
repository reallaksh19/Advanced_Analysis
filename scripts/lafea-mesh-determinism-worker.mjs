#!/usr/bin/env node

/**
 * Cross-process determinism worker for `lafea.10-determinism-check.mjs`.
 * Meshes a fixed topology and prints the result as JSON; the parent script
 * runs this twice in separate `node` invocations and diffs the output.
 */

import { canonicalTopology } from '../src/core/lafea-geometry/index.js';
import { triangulateRegion } from '../src/core/lafea-meshing/index.js';

const topology = canonicalTopology({
  schema: 'lafea-geometry-topology/v1',
  vertices: [
    { vertexId: 'V1', x: 0, y: 0 }, { vertexId: 'V2', x: 10, y: 0 },
    { vertexId: 'V3', x: 10, y: 10 }, { vertexId: 'V4', x: 0, y: 10 },
  ],
  curves: [
    { curveId: 'C1', type: 'LINE', startVertexId: 'V1', endVertexId: 'V2', arc: null },
    { curveId: 'C2', type: 'LINE', startVertexId: 'V2', endVertexId: 'V3', arc: null },
    { curveId: 'C3', type: 'LINE', startVertexId: 'V3', endVertexId: 'V4', arc: null },
    { curveId: 'C4', type: 'LINE', startVertexId: 'V4', endVertexId: 'V1', arc: null },
  ],
  loops: [{ loopId: 'OUTER', curveIds: ['C1', 'C2', 'C3', 'C4'] }],
  regions: [{ regionId: 'PLATE', outerLoopId: 'OUTER', holeLoopIds: [] }],
});

const elements = triangulateRegion(topology, 'PLATE', { targetSize: 1.7, chordErrorLimit: 0.02 });
process.stdout.write(JSON.stringify(elements));
