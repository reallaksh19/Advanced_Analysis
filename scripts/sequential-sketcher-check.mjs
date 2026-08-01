/**
 * Sequential Sketcher Verification Check Script
 */
import assert from 'node:assert/strict';
import { parseStagedJson, buildBranchInventory } from '../src/workspace/sequential-sketcher/sequential-sketcher-source.js';
import { buildBranchTopology } from '../src/workspace/sequential-sketcher/sequential-sketcher-topology.js';
import { planSequentialTraversal } from '../src/workspace/sequential-sketcher/sequential-sketcher-traversal.js';
import { buildSequentialEngineeringSvgSceneFromTopology } from '../src/workspace/sequential-sketcher/sequential-engineering-svg-scene.js';
import { serializeSequentialSketcherCertificationFixture } from './sequential-sketcher-fixtures.mjs';

console.log('--- [SIMULATED] Sequential Sketcher Verification Check ---');

const content = serializeSequentialSketcherCertificationFixture();
const records = parseStagedJson(content);
assert.equal(records.length, 1);
console.log('SEQUENTIAL-SKETCHER-T01 PASS parseStagedJson parsed the repository certification fixture.');

const branch = records[0];
const inventory = buildBranchInventory(branch);
assert.equal(inventory.branchId, 'SEQ-BRANCH-001');
assert.equal(inventory.routeComponents.length, 5);
assert.equal(inventory.supportRecords.length, 1);
console.log('SEQUENTIAL-SKETCHER-T02 PASS buildBranchInventory retained route and support evidence.');

const topology = buildBranchTopology(inventory);
assert.equal(topology.schema, 'SequentialBranchSketch.v1');
assert.equal(topology.branchId, inventory.branchId);
assert.equal(topology.segments.length, 3);
assert.equal(topology.inventory.supportRecordCount, 1);
assert.equal(topology.issues.filter((issue) => issue.severity === 'ERROR').length, 0);
console.log('SEQUENTIAL-SKETCHER-T03 PASS buildBranchTopology constructed the governed branch graph.');

const traversal = planSequentialTraversal(topology);
assert.equal(traversal.commands.filter((command) => command.op === 'DRAW_SEGMENT').length, 3);
assert.equal(traversal.commands.filter((command) => command.op === 'MARK_COMPONENT').length, 2);
assert.equal(traversal.issues.filter((issue) => issue.severity === 'ERROR').length, 0);
console.log('SEQUENTIAL-SKETCHER-T04 PASS planSequentialTraversal accounted for every route component.');

const sceneResult = buildSequentialEngineeringSvgSceneFromTopology(topology, {
  sceneId: 'sequential-certification-scene',
  projection: 'ISO',
});
assert.equal(sceneResult.scene.schema, 'EngineeringScene.v1');
assert.equal(sceneResult.scene.sceneId, 'sequential-certification-scene');
console.log('SEQUENTIAL-SKETCHER-T05 PASS source-derived EngineeringScene.v1 generated.');

console.log('Sequential Sketcher verification PASS');
