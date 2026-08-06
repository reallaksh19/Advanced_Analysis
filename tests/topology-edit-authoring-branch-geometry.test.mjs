import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTopologyEditAuthoringBranchGeometry,
  deriveTopologyEditAuthoringBranchGeometry,
  normalizeTopologyEditAuthoringBranchClocking,
} from '../src/workspace/topology-edit/authoring/topology-edit-authoring-branch-geometry.js';

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

function closePoint(actual, expected) {
  close(actual.x, expected.x);
  close(actual.y, expected.y);
  close(actual.z, expected.z);
}

test('tee geometry creates exact host station, component face, and branch endpoint', () => {
  const geometry = deriveTopologyEditAuthoringBranchGeometry({
    branchFamily: 'tee',
    hostFrom: { x: 0, y: 0, z: 0 },
    hostTo: { x: 1000, y: 0, z: 0 },
    stationMm: 400,
    clockingDeg: 0,
    componentLengthMm: 80,
    branchPipeLengthMm: 420,
  });

  assert.equal(geometry.branchFamily, 'TEE');
  assert.equal(geometry.hostLengthMm, 1000);
  assert.equal(geometry.upstreamPipeLengthMm, 400);
  assert.equal(geometry.downstreamPipeLengthMm, 600);
  assert.equal(geometry.totalBranchReachMm, 500);
  closePoint(geometry.junctionPoint, { x: 400, y: 0, z: 0 });
  closePoint(geometry.componentFacePoint, { x: 400, y: 0, z: 80 });
  closePoint(geometry.branchEndPoint, { x: 400, y: 0, z: 500 });
  assert.equal(assertTopologyEditAuthoringBranchGeometry(geometry), geometry);
  assert.ok(Object.isFrozen(geometry));
});

test('clocking rotates around the certified host axis without camera evidence', () => {
  const zero = deriveTopologyEditAuthoringBranchGeometry({
    branchFamily: 'OLET',
    hostFrom: { x: 0, y: 0, z: 0 },
    hostTo: { x: 1000, y: 0, z: 0 },
    stationMm: 500,
    clockingDeg: 0,
    componentLengthMm: 60,
    branchPipeLengthMm: 300,
  });
  const quarter = deriveTopologyEditAuthoringBranchGeometry({
    branchFamily: 'OLET',
    hostFrom: { x: 0, y: 0, z: 0 },
    hostTo: { x: 1000, y: 0, z: 0 },
    stationMm: 500,
    clockingDeg: 90,
    componentLengthMm: 60,
    branchPipeLengthMm: 300,
  });

  close(zero.branchAxis.x, 0);
  close(quarter.branchAxis.x, 0);
  close(
    zero.branchAxis.x * quarter.branchAxis.x
      + zero.branchAxis.y * quarter.branchAxis.y
      + zero.branchAxis.z * quarter.branchAxis.z,
    0,
  );
  closePoint(quarter.junctionPoint, zero.junctionPoint);
  assert.notEqual(quarter.geometryHash, zero.geometryHash);
});

test('equivalent clocking values produce identical normalized replay authority', () => {
  assert.equal(normalizeTopologyEditAuthoringBranchClocking(450), 90);
  assert.equal(normalizeTopologyEditAuthoringBranchClocking(-270), 90);

  const input = {
    branchFamily: 'TEE',
    hostFrom: { x: 0, y: 0, z: 0 },
    hostTo: { x: 0, y: 1200, z: 0 },
    stationMm: 300,
    componentLengthMm: 75,
    branchPipeLengthMm: 425,
  };
  const left = deriveTopologyEditAuthoringBranchGeometry({
    ...input,
    clockingDeg: 450,
  });
  const right = deriveTopologyEditAuthoringBranchGeometry({
    ...input,
    clockingDeg: -270,
  });

  assert.deepEqual(left, right);
});

test('least-aligned fallback remains deterministic for every principal host axis', () => {
  const geometries = [
    { hostTo: { x: 1000, y: 0, z: 0 } },
    { hostTo: { x: 0, y: 1000, z: 0 } },
    { hostTo: { x: 0, y: 0, z: 1000 } },
  ].map(({ hostTo }) => deriveTopologyEditAuthoringBranchGeometry({
    branchFamily: 'OLET',
    hostFrom: { x: 0, y: 0, z: 0 },
    hostTo,
    stationMm: 500,
    clockingDeg: 37,
    componentLengthMm: 50,
    branchPipeLengthMm: 250,
  }));

  for (const geometry of geometries) {
    const dot = geometry.hostAxis.x * geometry.branchAxis.x
      + geometry.hostAxis.y * geometry.branchAxis.y
      + geometry.hostAxis.z * geometry.branchAxis.z;
    close(dot, 0);
    close(Math.hypot(
      geometry.branchAxis.x,
      geometry.branchAxis.y,
      geometry.branchAxis.z,
    ), 1);
  }
  assert.equal(new Set(geometries.map((value) => value.geometryHash)).size, 3);
});

test('geometry fails closed on invalid host, station, lengths, family, and tampering', () => {
  const valid = {
    branchFamily: 'TEE',
    hostFrom: { x: 0, y: 0, z: 0 },
    hostTo: { x: 1000, y: 0, z: 0 },
    stationMm: 500,
    clockingDeg: 0,
    componentLengthMm: 80,
    branchPipeLengthMm: 420,
  };

  assert.throws(
    () => deriveTopologyEditAuthoringBranchGeometry({
      ...valid,
      hostTo: valid.hostFrom,
    }),
    /positive length/u,
  );
  assert.throws(
    () => deriveTopologyEditAuthoringBranchGeometry({
      ...valid,
      stationMm: 1000,
    }),
    /fit strictly inside/u,
  );
  assert.throws(
    () => deriveTopologyEditAuthoringBranchGeometry({
      ...valid,
      branchPipeLengthMm: 0,
    }),
    /must be positive/u,
  );
  assert.throws(
    () => deriveTopologyEditAuthoringBranchGeometry({
      ...valid,
      branchFamily: 'LATERAL',
    }),
    /unsupported branch family/u,
  );

  const geometry = deriveTopologyEditAuthoringBranchGeometry(valid);
  assert.throws(
    () => assertTopologyEditAuthoringBranchGeometry({
      ...geometry,
      stationMm: 501,
    }),
    /hash mismatch/u,
  );
});
