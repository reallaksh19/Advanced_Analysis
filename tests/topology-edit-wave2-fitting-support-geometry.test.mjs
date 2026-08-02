import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTopologyVisualGeometry,
  projectVisualGeometryToViewport,
} from '../src/workspace/topology-edit/topology-edit-render-model.js';
import { deriveSupportRestraintGeometry } from '../src/workspace/topology-edit/support-restraint-geometry.js';
import { projectSupportGeometryToViewport } from '../src/workspace/topology-edit/support-restraint-projector.js';
import { createDimensionAuthority } from '../src/workspace/topology-edit/dimension-authority.js';

const dimensionAuthority = createDimensionAuthority({
  branchInheritance: { enabled: true, allowedComponentTypes: ['TEE', 'OLET'] },
});

function topology(parts = {}) {
  const base = {
    canonicalTopologyHash: 'canonical:test',
    nodes: [
      { id: 'n0', position: { x: 0, y: 0, z: 0 } },
      { id: 'n1', position: { x: 1000, y: 0, z: 0 } },
      { id: 'n2', position: { x: 0, y: 1000, z: 0 } },
      { id: 'n3', position: { x: 0, y: 0, z: 1000 } },
    ],
    edges: [],
    junctions: [],
    supports: [],
  };
  return { ...base, ...parts };
}

function visual(canonical, evidence = {}) {
  return deriveTopologyVisualGeometry({
    canonicalTopology: canonical,
    componentEvidence: evidence,
    dimensionAuthority,
  });
}

test('pipe geometry is deterministic and identity preserving', () => {
  const canonical = topology({ edges: [
    { id: 'edge:a', componentKey: 'A', fromNodeId: 'n0', toNodeId: 'n1', entityType: 'PIPE' },
    { id: 'edge:b', componentKey: 'B', fromNodeId: 'n0', toNodeId: 'n1', entityType: 'PIPE' },
  ] });
  const evidence = { A: { outsideDiameterMm: 114.3 }, B: { outsideDiameterMm: 114.3 } };
  const first = visual(canonical, evidence);
  const second = visual(structuredClone(canonical), structuredClone(evidence));
  assert.equal(first.visualGeometryHash, second.visualGeometryHash);
  assert.equal(first.components[0].visualSignature, first.components[1].visualSignature);
  assert.notEqual(first.components[0].canonicalEntityId, first.components[1].canonicalEntityId);
  assert.deepEqual(first.components.map((row) => row.canonicalEntityId), ['edge:a', 'edge:b']);
});

test('missing pipe diameter emits diagnostic centerline', () => {
  const canonical = topology({ edges: [
    { id: 'edge:a', componentKey: 'A', fromNodeId: 'n0', toNodeId: 'n1', entityType: 'PIPE' },
  ] });
  const model = visual(canonical);
  assert.equal(model.components[0].primitives[0].kind, 'DIAGNOSTIC_CENTERLINE');
  assert.ok(model.diagnostics.some((row) => row.code === 'OUTSIDE_DIAMETER_MISSING'));
});

test('non-axis-aligned elbow derives deterministic arc tessellation', () => {
  const canonical = topology({
    nodes: [
      { id: 'a', position: { x: 100, y: 0, z: 0 } },
      { id: 'b', position: { x: 0, y: 100, z: 0 } },
    ],
    edges: [{ id: 'elbow:1', componentKey: 'E1', fromNodeId: 'a', toNodeId: 'b', entityType: 'ELBOW' }],
  });
  const model = visual(canonical, {
    E1: { outsideDiameterMm: 60, center: { x: 0, y: 0, z: 0 }, centerlineRadiusMm: 100 },
  });
  const arc = model.components[0].primitives[0];
  assert.equal(arc.kind, 'ELBOW_ARC');
  assert.ok(arc.parameters.angleRad > 1.5 && arc.parameters.angleRad < 1.6);
  assert.ok(arc.parameters.segmentCount >= 6);
  assert.equal(arc.parameters.arcPoints.length, arc.parameters.segmentCount + 1);
});

test('identical elbows at different locations share geometry signature', () => {
  const canonical = topology({
    nodes: [
      { id: 'a0', position: { x: 100, y: 0, z: 0 } },
      { id: 'a1', position: { x: 0, y: 100, z: 0 } },
      { id: 'b0', position: { x: 1100, y: 0, z: 0 } },
      { id: 'b1', position: { x: 1000, y: 100, z: 0 } },
    ],
    edges: [
      { id: 'elbow:a', componentKey: 'EA', fromNodeId: 'a0', toNodeId: 'a1', entityType: 'ELBOW' },
      { id: 'elbow:b', componentKey: 'EB', fromNodeId: 'b0', toNodeId: 'b1', entityType: 'ELBOW' },
    ],
  });
  const evidence = {
    EA: { outsideDiameterMm: 60, center: { x: 0, y: 0, z: 0 }, centerlineRadiusMm: 100 },
    EB: { outsideDiameterMm: 60, center: { x: 1000, y: 0, z: 0 }, centerlineRadiusMm: 100 },
  };
  const model = visual(canonical, evidence);
  assert.equal(model.components[0].visualSignature, model.components[1].visualSignature);
});

test('reducer preserves exact start and end outside diameters', () => {
  const canonical = topology({ edges: [
    { id: 'reducer:1', componentKey: 'R1', fromNodeId: 'n0', toNodeId: 'n1', entityType: 'REDUCER' },
  ] });
  const model = visual(canonical, {
    R1: { startOutsideDiameterMm: 168.3, endOutsideDiameterMm: 114.3 },
  });
  const reducer = model.components[0].primitives[0];
  assert.equal(reducer.kind, 'CONICAL_REDUCER');
  assert.equal(reducer.parameters.startOutsideDiameterMm, 168.3);
  assert.equal(reducer.parameters.endOutsideDiameterMm, 114.3);
});

test('eccentric reducer requires direction evidence', () => {
  const canonical = topology({ edges: [
    { id: 'reducer:1', componentKey: 'R1', fromNodeId: 'n0', toNodeId: 'n1', entityType: 'REDUCER' },
  ] });
  const model = visual(canonical, {
    R1: { reducerType: 'ECCENTRIC', startOutsideDiameterMm: 168.3, endOutsideDiameterMm: 114.3 },
  });
  assert.equal(model.components[0].primitives[0].kind, 'DIAGNOSTIC_CENTERLINE');
  assert.ok(model.diagnostics.some((row) => row.code === 'ECCENTRIC_DIRECTION_MISSING'));
});

test('TEE uses exact branch evidence and explicit inheritance rule', () => {
  const canonical = topology({ junctions: [
    { id: 'tee:1', componentKey: 'T1', nodeIds: ['n1', 'n2', 'n3'], entityType: 'TEE' },
  ] });
  const model = visual(canonical, {
    T1: {
      center: { x: 0, y: 0, z: 0 },
      outsideDiameterMm: 100,
      runOutsideDiameterMm: 100,
      allowBranchSizeInheritance: true,
      runNodeIds: ['n1', 'n2'],
      branchNodeId: 'n3',
    },
  });
  const tee = model.components[0].primitives[0];
  assert.equal(tee.kind, 'TEE_JUNCTION');
  assert.equal(tee.parameters.branchOutsideDiameterMm, 100);
  assert.equal(tee.parameters.branchNodeId, 'n3');
});

test('viewport projection never invents engineering radius', () => {
  const canonical = topology({ edges: [
    { id: 'edge:a', componentKey: 'A', fromNodeId: 'n0', toNodeId: 'n1', entityType: 'PIPE' },
  ] });
  const projected = projectVisualGeometryToViewport(visual(canonical), canonical);
  const segment = projected.segments.find((row) => row.entityId === 'edge:a');
  assert.equal(segment.radiusMm, 2);
  assert.equal(segment.type, 'DIAGNOSTIC_CENTERLINE');
});

test('support preserves multiple directional restraint records', () => {
  const canonical = topology({ edges: [
    { id: 'edge:p', componentKey: 'P', fromNodeId: 'n0', toNodeId: 'n1', outsideDiameterMm: 100 },
  ] });
  const support = { id: 'support:1', nodeId: 'n0', hostEntityId: 'P', restraints: [
    { id: 'guide', kind: 'GUIDE', gapMm: 5 },
    { id: 'stop', kind: 'LINE_STOP', gapMm: 3 },
    { id: 'rest', kind: 'REST', gapMm: 0 },
    { id: 'unknown', kind: 'OTHER' },
  ] };
  const overlay = deriveSupportRestraintGeometry({ canonicalTopology: canonical, support, verticalAxis: 'Z' });
  assert.equal(overlay.restraints.length, 4);
  assert.deepEqual(overlay.restraints.find((row) => row.restraintId === 'stop').direction, { x: 1, y: 0, z: 0 });
  assert.deepEqual(overlay.restraints.find((row) => row.restraintId === 'guide').direction, { x: 0, y: 1, z: 0 });
  assert.deepEqual(overlay.restraints.find((row) => row.restraintId === 'rest').direction, { x: 0, y: 0, z: 1 });
  assert.equal(overlay.restraints.find((row) => row.restraintId === 'unknown').status, 'UNRESOLVED');
});

test('support frame is invariant when host endpoint order reverses', () => {
  const support = {
    id: 'support:1', nodeId: 'n0', hostEntityId: 'P',
    restraints: [{ id: 'stop', kind: 'LINE_STOP', gapMm: 3 }],
  };
  const forward = topology({ edges: [
    { id: 'edge:p', componentKey: 'P', fromNodeId: 'n0', toNodeId: 'n1', outsideDiameterMm: 100 },
  ] });
  const reverse = topology({ edges: [
    { id: 'edge:p', componentKey: 'P', fromNodeId: 'n1', toNodeId: 'n0', outsideDiameterMm: 100 },
  ] });
  const left = deriveSupportRestraintGeometry({ canonicalTopology: forward, support });
  const right = deriveSupportRestraintGeometry({ canonicalTopology: reverse, support });
  assert.deepEqual(left.restraints[0].direction, right.restraints[0].direction);
  assert.deepEqual(left.restraints[0].positiveContactPoint, right.restraints[0].positiveContactPoint);
});

test('vertical-axis transform is explicit and deterministic', () => {
  const canonical = topology({ edges: [
    { id: 'edge:p', componentKey: 'P', fromNodeId: 'n0', toNodeId: 'n1', outsideDiameterMm: 100 },
  ] });
  const support = {
    id: 'support:1', nodeId: 'n0', hostEntityId: 'P',
    restraints: [{ id: 'rest', kind: 'REST', gapMm: 0 }],
  };
  const zUp = deriveSupportRestraintGeometry({ canonicalTopology: canonical, support, verticalAxis: 'Z' });
  const yUp = deriveSupportRestraintGeometry({ canonicalTopology: canonical, support, verticalAxis: 'Y' });
  assert.deepEqual(zUp.restraints[0].direction, { x: 0, y: 0, z: 1 });
  assert.deepEqual(yUp.restraints[0].direction, { x: 0, y: 1, z: 0 });
});

test('restraint projection retains complete restraint identity', () => {
  const canonical = topology({ edges: [
    { id: 'edge:p', componentKey: 'P', fromNodeId: 'n0', toNodeId: 'n1', outsideDiameterMm: 100 },
  ] });
  const support = {
    id: 'support:1', nodeId: 'n0', hostEntityId: 'P',
    restraints: [{ id: 'guide', kind: 'GUIDE', gapMm: 5 }],
  };
  const overlay = deriveSupportRestraintGeometry({ canonicalTopology: canonical, support });
  const projected = projectSupportGeometryToViewport([overlay]);
  assert.equal(projected.segments[0].pickTarget.supportId, 'support:1');
  assert.equal(projected.segments[0].pickTarget.restraintId, 'guide');
  assert.equal(projected.segments[0].pickTarget.restraintFamily, 'GUIDE');
});
