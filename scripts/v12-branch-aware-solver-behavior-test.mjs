#!/usr/bin/env node

/**
 * V12 Behavior Test Suite
 * Tests topology classification, branch screening, and solver routing.
 */

import { classifySolverTopology, SOLVER_TOPOLOGY_TYPE } from '../src/core/solvers/routing/classifySolverTopology.js';
import { solveBranchScreening, BRANCH_SCREENING_SCHEMA_VERSION } from '../src/core/solvers/branch/solveBranchScreening.js';
import { solveByTopologyRouter } from '../src/core/solvers/routing/solveByTopologyRouter.js';

let testCount = 0;
let passCount = 0;

function assert(condition, message) {
  testCount++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASS: ${message}`);
  passCount++;
}

function test(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`❌ ERROR in test "${name}": ${e.message}`);
    process.exit(1);
  }
}

// ============================================================================
// Test 1: L-route (no branch) → GC3D_SUPPORTED_ROUTE
// ============================================================================
test('L-route classification', () => {
  const payload = {
    nodes: {
      A: { id: 'A', type: 'anchor', pos: [0, 0, 0] },
      B: { id: 'B', type: 'elbow', pos: [0, 100, 0] },
      C: { id: 'C', type: 'anchor', pos: [100, 100, 0] },
    },
    segments: [
      { id: 'S1', startNode: 'A', endNode: 'B' },
      { id: 'S2', startNode: 'B', endNode: 'C' },
    ],
  };

  const result = classifySolverTopology(payload);
  assert(result.topologyType === SOLVER_TOPOLOGY_TYPE.GC3D_SUPPORTED_ROUTE, 'L-route topology type is GC3D_SUPPORTED_ROUTE');
  assert(result.route === 'GC3D', 'L-route is mapped to GC3D');
  assert(result.canRunGC3D === true, 'L-route can run GC3D');
  assert(result.canRunBranchScreening === false, 'L-route cannot run branch screening');
});

// ============================================================================
// Test 2: Tee route → BRANCH_ROUTE
// ============================================================================
test('Tee route classification', () => {
  const payload = {
    nodes: {
      W: { id: 'W', type: 'anchor', pos: [0, 0, 0] },
      T: { id: 'T', type: 'tee', pos: [100, 0, 0] },
      E: { id: 'E', type: 'anchor', pos: [200, 0, 0] },
      N: { id: 'N', type: 'anchor', pos: [100, 100, 0] },
    },
    segments: [
      { id: 'WEST', startNode: 'W', endNode: 'T' },
      { id: 'EAST', startNode: 'T', endNode: 'E' },
      { id: 'BRANCH', startNode: 'T', endNode: 'N' },
    ],
  };

  const result = classifySolverTopology(payload);
  assert(result.topologyType === SOLVER_TOPOLOGY_TYPE.BRANCH_ROUTE, 'Tee topology type is BRANCH_ROUTE');
  assert(result.route === 'BRANCH_SCREENING', 'Tee is mapped to BRANCH_SCREENING');
  assert(result.canRunGC3D === false, 'Tee cannot run GC3D');
  assert(result.canRunBranchScreening === true, 'Tee can run branch screening');
  assert(result.branchDetails.length === 1, 'Tee has 1 branch detail');
  assert(result.branchDetails[0].branchNodeId === 'T', 'Branch node ID is T');
});

// ============================================================================
// Test 3: Empty topology
// ============================================================================
test('Empty topology classification', () => {
  const result = classifySolverTopology({ nodes: {}, segments: [] });
  assert(result.topologyType === SOLVER_TOPOLOGY_TYPE.EMPTY, 'Empty payload is EMPTY');
  assert(result.route === 'NONE', 'Empty route is NONE');
  assert(result.canRunGC3D === false, 'Empty cannot run GC3D');
  assert(result.canRunBranchScreening === false, 'Empty cannot run branch screening');
});

// ============================================================================
// Test 4: solveBranchScreening without BRLEN
// ============================================================================
test('Branch screening without BRLEN', () => {
  const payload = {
    nodes: {
      W: { id: 'W', type: 'anchor', pos: [0, 0, 0] },
      T: { id: 'T', type: 'tee', pos: [100, 0, 0] },
      E: { id: 'E', type: 'anchor', pos: [200, 0, 0] },
      N: { id: 'N', type: 'anchor', pos: [100, 100, 0] },
    },
    segments: [
      { id: 'WEST', startNode: 'W', endNode: 'T' },
      { id: 'EAST', startNode: 'T', endNode: 'E' },
      { id: 'BRANCH', startNode: 'T', endNode: 'N' },
    ],
    fittingData: {},
  };

  const result = solveBranchScreening(payload);
  assert(result.moduleId === 'branch-screening', 'Module ID is branch-screening');
  assert(result.methodId === 'BRANCH_TOPOLOGY_SCREENING_V1', 'Method ID is BRANCH_TOPOLOGY_SCREENING_V1');
  assert(result.status === 'BRANCH_SCREENING_ONLY', 'Status is BRANCH_SCREENING_ONLY');
  assert(result.formulaIds.includes('BRLEN_REQUIRED_GATE'), 'Formula IDs include BRLEN_REQUIRED_GATE');
  assert(result.diagnostics.some(d => d.code === 'BRLEN_REQUIRED'), 'Diagnostics include BRLEN_REQUIRED');
});

// ============================================================================
// Test 5: solveBranchScreening with BRLEN
// ============================================================================
test('Branch screening with BRLEN', () => {
  const payload = {
    nodes: {
      W: { id: 'W', type: 'anchor', pos: [0, 0, 0] },
      T: { id: 'T', type: 'tee', pos: [100, 0, 0] },
      E: { id: 'E', type: 'anchor', pos: [200, 0, 0] },
      N: { id: 'N', type: 'anchor', pos: [100, 100, 0] },
    },
    segments: [
      { id: 'WEST', startNode: 'W', endNode: 'T' },
      { id: 'EAST', startNode: 'T', endNode: 'E' },
      { id: 'BRANCH', startNode: 'T', endNode: 'N' },
    ],
    fittingData: {
      BRANCH: { BRLEN_in: 12 },
    },
  };

  const result = solveBranchScreening(payload);
  assert(result.status === 'BRANCH_SCREENING_ONLY', 'Status is BRANCH_SCREENING_ONLY');
  assert(result.results.branchChecks[0].hasBRLEN === true, 'Branch check has BRLEN');
});

// ============================================================================
// Test 6: solveByTopologyRouter with empty topology
// ============================================================================
test('Router with empty topology', async () => {
  const result = await solveByTopologyRouter({ nodes: {}, segments: [] });
  assert(result.status === 'NOT_QUALIFIED', 'Empty topology returns NOT_QUALIFIED');
  assert(result.methodId === 'SOLVER_TOPOLOGY_ROUTER_V1', 'Method ID is SOLVER_TOPOLOGY_ROUTER_V1');
  assert(result.routing.selectedSolver === 'NONE', 'Selected solver is NONE');
});

// ============================================================================
// Test 7: solveByTopologyRouter with GC3D stub
// ============================================================================
test('Router with GC3D stub', async () => {
  const payload = {
    nodes: {
      A: { id: 'A', type: 'anchor', pos: [0, 0, 0] },
      B: { id: 'B', type: 'elbow', pos: [0, 100, 0] },
      C: { id: 'C', type: 'anchor', pos: [100, 100, 0] },
    },
    segments: [
      { id: 'S1', startNode: 'A', endNode: 'B' },
      { id: 'S2', startNode: 'B', endNode: 'C' },
    ],
  };

  const gc3dStub = () => ({
    status: 'PASSED',
    moduleId: 'gc3d-stub',
    methodId: 'GC3D_STUB',
    formulaIds: ['STUB_FORMULA'],
    results: { legResults: [], nodeResults: [] },
    diagnostics: [],
    warnings: [],
  });

  const result = await solveByTopologyRouter(payload, { gc3dSolver: gc3dStub });
  assert(result.routing.selectedSolver === 'GC3D', 'Selected solver is GC3D');
  assert(result.status === 'PASSED', 'GC3D stub status is PASSED');
});

// ============================================================================
// Test 8: solveByTopologyRouter with tee and branch solver
// ============================================================================
test('Router with tee and branch solver', async () => {
  const payload = {
    nodes: {
      W: { id: 'W', type: 'anchor', pos: [0, 0, 0] },
      T: { id: 'T', type: 'tee', pos: [100, 0, 0] },
      E: { id: 'E', type: 'anchor', pos: [200, 0, 0] },
      N: { id: 'N', type: 'anchor', pos: [100, 100, 0] },
    },
    segments: [
      { id: 'WEST', startNode: 'W', endNode: 'T' },
      { id: 'EAST', startNode: 'T', endNode: 'E' },
      { id: 'BRANCH', startNode: 'T', endNode: 'N' },
    ],
    fittingData: {},
  };

  const result = await solveByTopologyRouter(payload, { branchSolver: solveBranchScreening });
  assert(result.routing.selectedSolver === 'BRANCH_SCREENING', 'Selected solver is BRANCH_SCREENING');
  assert(result.methodId === 'BRANCH_TOPOLOGY_SCREENING_V1', 'Method ID is BRANCH_TOPOLOGY_SCREENING_V1');
});

// ============================================================================
// Summary
// ============================================================================
console.log(`\n✅ All ${passCount}/${testCount} tests passed`);
process.exit(0);
