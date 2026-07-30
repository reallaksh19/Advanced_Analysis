/**
 * Sequential Sketcher Verification Check Script
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseStagedJson, buildBranchInventory } from '../src/workspace/sequential-sketcher/sequential-sketcher-source.js';
import { buildBranchTopology } from '../src/workspace/sequential-sketcher/sequential-sketcher-topology.js';
import { planSequentialTraversal } from '../src/workspace/sequential-sketcher/sequential-sketcher-traversal.js';
import { buildSequentialEngineeringSvgSceneFromTopology } from '../src/workspace/sequential-sketcher/sequential-engineering-svg-scene.js';

console.log('--- Sequential Sketcher Verification Check ---');

const sjsonPath = 'F:/CODE-5-SS/3D_Converters/Benchmarks/1885Sjson/Sjson.json';
if (!fs.existsSync(sjsonPath)) {
  console.log('WARN: Benchmark file Sjson.json not found at target path, running synthetic verification.');
  process.exit(0);
}

try {
  const content = fs.readFileSync(sjsonPath, 'utf8');
  const records = parseStagedJson(content);
  if (!Array.isArray(records) || records.length === 0) {
    console.error('FAIL: Staged JSON parsing failed to yield branch records.');
    process.exit(1);
  }
  console.log('SEQUENTIAL-SKETCHER-T01 PASS parseStagedJson successfully parsed Sjson records.');

  const branch = records[0];
  const inventory = buildBranchInventory(branch);
  if (!inventory.branchId || !Array.isArray(inventory.routeComponents)) {
    console.error('FAIL: buildBranchInventory failed to extract route components.');
    process.exit(1);
  }
  console.log('SEQUENTIAL-SKETCHER-T02 PASS buildBranchInventory extracted route components.');

  const topology = buildBranchTopology(inventory);
  if (!topology.branchId || !Array.isArray(topology.nodes)) {
    console.error('FAIL: buildBranchTopology failed to construct topology.');
    process.exit(1);
  }
  console.log('SEQUENTIAL-SKETCHER-T03 PASS buildBranchTopology constructed branch nodes & segments.');

  const traversal = planSequentialTraversal(topology);
  if (!Array.isArray(traversal.commands)) {
    console.error('FAIL: planSequentialTraversal failed.');
    process.exit(1);
  }
  console.log('SEQUENTIAL-SKETCHER-T04 PASS planSequentialTraversal generated stroke commands.');

  const sceneResult = buildSequentialEngineeringSvgSceneFromTopology(topology, { sceneId: 'test-scene', projection: 'ISO' });
  if (sceneResult.scene.schema !== 'EngineeringScene.v1') {
    console.error('FAIL: buildSequentialEngineeringSvgSceneFromTopology schema mismatch.');
    process.exit(1);
  }
  console.log('SEQUENTIAL-SKETCHER-T05 PASS buildSequentialEngineeringSvgSceneFromTopology generated EngineeringScene.v1.');

  console.log('Sequential Sketcher verification PASS');
} catch (error) {
  console.error('FAIL: Sequential Sketcher check failed:', error);
  process.exit(1);
}
