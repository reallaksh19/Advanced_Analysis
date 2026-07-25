import fs from 'fs';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { buildSharedPipingModelFromWorkspaceDataset } from '../src/core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';

const inputPath = 'D:\\Code3\\Vertical load benchmark\\benchmark_30_complex_3d_support_load_stagedjson.json';
const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const dataset = normalizeWorkspaceDataset(rawData, 'benchmark');
const sharedModel = buildSharedPipingModelFromWorkspaceDataset(dataset);
const topologyGraph = buildPipingPortTopologyGraph(sharedModel);

console.log('Number of networks:', topologyGraph.connectedComponents?.length);
console.log('Number of branches:', topologyGraph.branches?.length);
if (topologyGraph.branches?.length > 0) {
  console.log('Branches:', JSON.stringify(topologyGraph.branches, null, 2));
}
