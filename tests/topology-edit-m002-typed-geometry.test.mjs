import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import { createDimensionAuthority } from '../src/workspace/topology-edit/dimension-authority.js';
import {
  deriveTopologyVisualGeometry,
  projectVisualGeometryToViewport,
} from '../src/workspace/topology-edit/topology-edit-render-model.js';
import {
  materializeTopologyEditPrimitive,
  TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR,
} from '../src/workspace/topology-edit/topology-edit-primitive-geometry.js';
import {
  TopologyEditTypedViewportBackend,
  retainTypedTopologyEditPrimitives,
} from '../src/workspace/topology-edit/topology-edit-typed-viewport-backend.js';

const CONFIGURATION = {
  supportMarkerSize: 70,
  pickingRadius: 28,
  cameraFitMargin: 1.25,
  clickTimingMs: 300,
  doubleClickTimingMs: 300,
  clickTravelTolerancePx: 5,
  zoomRate: 1,
  navigationSensitivity: 1,
  perspectiveFovDeg: 45,
  meshRadialSegments: 12,
  cameraNearMm: 0.1,
  cameraFarMm: 1_000_000,
};
const DIMENSIONS = createDimensionAuthority();

test('M002 production projection retains every typed primitive and exact junction placement evidence', () => {
  const canonical = typedTopology();
  const before = semanticHash(canonical);
  const model = deriveTopologyVisualGeometry({
    canonicalTopology: canonical,
    componentEvidence: typedEvidence(),
    dimensionAuthority: DIMENSIONS,
  });
  const projection = retainTypedTopologyEditPrimitives(
    model,
    projectVisualGeometryToViewport(model, canonical),
  );

  assert.deepEqual(
    [...new Set(projection.primitives.map((row) => row.kind))].sort(),
    [
      'CONICAL_REDUCER',
      'ECCENTRIC_REDUCER',
      'ELBOW_ARC',
      'FLANGE_DISC',
      'GASKET_DISC',
      'INSTRUMENT_MARKER',
      'OLET_BRANCH',
      'PIPE_CYLINDER',
      'TEE_JUNCTION',
      'VALVE_BODY',
    ].sort(),
  );
  const tee = projection.primitives.find((row) => row.kind === 'TEE_JUNCTION');
  const olet = projection.primitives.find((row) => row.kind === 'OLET_BRANCH');
  assert.equal(tee.parameters.runDirections.length, 2);
  approxVector(tee.parameters.branchDirection, { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 });
  approxVector(olet.parameters.branchDirection, { x: 0, y: -5 / Math.sqrt(34), z: 3 / Math.sqrt(34) });
  assert.deepEqual(tee.parameters.runEnds, [
    { x: -300, y: 300, z: 0 },
    { x: 300, y: 300, z: 0 },
  ]);
  assert.deepEqual(tee.parameters.branchEnd, { x: 0, y: 0, z: 300 });
  assert.deepEqual(olet.parameters.branchEnd, { x: 500, y: 0, z: 300 });
  assert.equal(semanticHash(canonical), before);
});

test('M002 production backend materializes typed assemblies without generic component markers', () => {
  const canonical = typedTopology();
  const model = deriveTopologyVisualGeometry({
    canonicalTopology: canonical,
    componentEvidence: typedEvidence(),
    dimensionAuthority: DIMENSIONS,
  });
  const projection = retainTypedTopologyEditPrimitives(
    model,
    projectVisualGeometryToViewport(model, canonical),
  );
  const backend = new TopologyEditTypedViewportBackend({ navigationConfiguration: CONFIGURATION });

  backend.renderSession({ draft: projection });

  const byKind = new Map();
  backend.groups.draftGroup.traverse((object) => {
    const kind = object.userData?.primitiveKind;
    if (!kind || !object.isMesh) return;
    const rows = byKind.get(kind) || [];
    rows.push(object);
    byKind.set(kind, rows);
  });
  const expectedByKind = new Map(projection.primitives.map((primitive) => [primitive.kind, primitive]));
  for (const [kind, primitive] of expectedByKind) {
    assert.ok(byKind.has(kind), `${kind} must materialize`);
    for (const object of byKind.get(kind)) {
      assert.equal(object.userData.pickTarget.objectKind, 'component');
      assert.equal(object.userData.pickTarget.objectId, primitive.canonicalEntityId);
      assert.equal(object.userData.partRole, primitive.partRole);
    }
  }
  assert.equal(byKind.get('TEE_JUNCTION').length, 3);
  assert.equal(byKind.get('OLET_BRANCH').length, 2);
  assert.equal(byKind.get('VALVE_BODY').length, 3);
  assert.equal(byKind.get('FLANGE_DISC').length, 1);
  assert.ok(byKind.get('ELBOW_ARC')[0].geometry.type === 'TubeGeometry');
  assert.equal(byKind.get('CONICAL_REDUCER')[0].geometry.type, 'CylinderGeometry');
  assert.equal(byKind.get('ECCENTRIC_REDUCER')[0].geometry.type, 'CylinderGeometry');

  const teeHeights = byKind.get('TEE_JUNCTION')
    .map((object) => object.geometry.parameters.height)
    .sort((left, right) => left - right);
  assert.deepEqual(teeHeights, [300, 300, Math.sqrt(180000)]);
  const oletBranch = byKind.get('OLET_BRANCH')
    .find((object) => object.geometry.type === 'CylinderGeometry');
  assert.ok(Math.abs(oletBranch.geometry.parameters.height - Math.sqrt(340000)) <= 1e-9);

  const componentMarkerKinds = new Set(
    projection.elements.filter((row) => row.type !== 'node').map((row) => row.type),
  );
  let genericComponentMarkerCount = 0;
  backend.groups.draftGroup.children.forEach((child) => {
    if (child.isMesh && componentMarkerKinds.has(child.userData?.type)) genericComponentMarkerCount += 1;
  });
  assert.equal(genericComponentMarkerCount, 0);
  backend.destroy();
});

test('typed geometry bounds include physical radius and remain engineering-space evidence', () => {
  const canonical = {
    canonicalTopologyHash: 'typed:pipe',
    nodes: [
      { id: 'a', position: { x: 0, y: 0, z: 0 } },
      { id: 'b', position: { x: 1000, y: 0, z: 0 } },
    ],
    edges: [{ id: 'pipe', componentKey: 'P', fromNodeId: 'a', toNodeId: 'b', entityType: 'PIPE' }],
    junctions: [], supports: [],
  };
  const model = deriveTopologyVisualGeometry({
    canonicalTopology: canonical,
    componentEvidence: { P: { outsideDiameterMm: 100 } },
    dimensionAuthority: DIMENSIONS,
  });
  const backend = new TopologyEditTypedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderSession({
    draft: retainTypedTopologyEditPrimitives(model, projectVisualGeometryToViewport(model, canonical)),
  });
  assert.ok(backend.engineeringBounds.min.y <= -49.999);
  assert.ok(backend.engineeringBounds.max.y >= 49.999);
  assert.ok(backend.engineeringBounds.min.z <= -49.999);
  assert.ok(backend.engineeringBounds.max.z >= 49.999);
  assert.deepEqual(canonical.nodes[0].position, { x: 0, y: 0, z: 0 });
  backend.destroy();
});

test('section planes are applied to every child mesh in a typed component assembly', () => {
  const primitive = primitiveRecord('VALVE_BODY', {
    start: { x: -100, y: 0, z: 0 },
    end: { x: 100, y: 0, z: 0 },
    center: { x: 0, y: 0, z: 0 },
    outsideDiameterMm: 80,
  });
  const backend = new TopologyEditTypedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderSession({ draft: { elements: [], segments: [], primitives: [primitive] } });
  backend.setPresentationSectionPlanes(sectionBox());
  let meshCount = 0;
  backend.groups.draftGroup.traverse((object) => {
    if (!object.isMesh) return;
    meshCount += 1;
    assert.equal(object.material.clippingPlanes.length, 6);
  });
  assert.equal(meshCount, 3);
  backend.destroy();
});

test('M002 stable visual ordering avoids locale-dependent hash inputs and installs the typed backend', async () => {
  const contractSource = await readFile(
    new URL('../src/workspace/topology-edit/visual-geometry-contract.js', import.meta.url),
    'utf8',
  );
  const controllerSource = await readFile(
    new URL('../src/workspace/topology-edit-3d-view-controller.js', import.meta.url),
    'utf8',
  );
  const primitiveSource = await readFile(
    new URL('../src/workspace/topology-edit/topology-edit-primitive-geometry.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(contractSource, /localeCompare/u);
  assert.match(contractSource, /compareCodeUnits/u);
  assert.match(controllerSource, /installTypedViewportBackend\(\)/u);
  assert.match(controllerSource, /new TopologyEditTypedViewportBackend\(\)/u);
  assert.doesNotMatch(primitiveSource, /teeRunLengthFactor|oletLengthFactor|valveNeckRadiusFactor|instrumentStemRadiusFactor/u);
  assert.match(primitiveSource, /parameters\.runEnds/u);
  assert.match(primitiveSource, /parameters\.branchEnd/u);
});

test('invalid typed primitive input fails closed with the named geometry code', () => {
  const material = new THREE.MeshStandardMaterial();
  assert.throws(
    () => materializeTopologyEditPrimitive(
      primitiveRecord('TEE_JUNCTION', {
        center: { x: 0, y: 0, z: 0 },
        runOutsideDiameterMm: 100,
        branchOutsideDiameterMm: 50,
      }),
      {
        material,
        radialSegments: 12,
        markerSize: 10,
        pickUserData: { pickTarget: { objectKind: 'component', objectId: 'component:1' } },
      },
    ),
    (error) => error.code === TOPOLOGY_EDIT_PRIMITIVE_GEOMETRY_ERROR
      && error.detailCode === 'TEE_RUN_ENDS_INVALID',
  );
  material.dispose();
});

test('invalid typed geometry becomes a named non-pickable diagnostic representation', () => {
  const backend = new TopologyEditTypedViewportBackend({ navigationConfiguration: CONFIGURATION });
  backend.renderSession({
    draft: {
      elements: [],
      segments: [],
      primitives: [primitiveRecord('TEE_JUNCTION', {
        center: { x: 10, y: 20, z: 30 },
        runOutsideDiameterMm: 100,
        branchOutsideDiameterMm: 50,
      })],
    },
  });
  assert.equal(backend.typedGeometryDiagnostics.length, 1);
  assert.equal(backend.typedGeometryDiagnostics[0].detailCode, 'TEE_RUN_ENDS_INVALID');
  let diagnostic = null;
  backend.groups.draftGroup.traverse((object) => {
    if (object.isMesh && object.userData?.diagnostic) diagnostic = object;
  });
  assert.ok(diagnostic);
  assert.equal(diagnostic.userData.nonPickable, true);
  assert.equal(diagnostic.userData.pickTarget, undefined);
  backend.destroy();
});

function typedTopology() {
  return {
    canonicalTopologyHash: 'canonical:m002-typed',
    nodes: [
      node('p0', -1200, 0, 0), node('p1', -800, 0, 0),
      node('e0', -600, 100, 0), node('e1', -700, 200, 0),
      node('r0', -400, 0, 0), node('r1', -200, 0, 0),
      node('re0', 0, 0, 0), node('re1', 200, 0, 0),
      node('f0', 300, 0, 0), node('f1', 360, 0, 0),
      node('v0', 450, 0, 0), node('v1', 650, 0, 0),
      node('g0', 700, 0, 0), node('g1', 720, 0, 0),
      node('i0', 800, 0, 0), node('i1', 900, 0, 0),
      node('tr0', -300, 300, 0), node('tr1', 300, 300, 0), node('tb', 0, 0, 300),
      node('or0', 200, 500, 0), node('or1', 800, 500, 0), node('ob', 500, 0, 300),
    ],
    edges: [
      edge('pipe', 'P', 'p0', 'p1', 'PIPE'),
      edge('elbow', 'E', 'e0', 'e1', 'ELBOW'),
      edge('reducer', 'R', 'r0', 'r1', 'REDUCER'),
      edge('eccentric', 'RE', 're0', 're1', 'REDUCER'),
      edge('flange', 'F', 'f0', 'f1', 'FLANGE'),
      edge('valve', 'V', 'v0', 'v1', 'VALVE'),
      edge('gasket', 'G', 'g0', 'g1', 'GASKET'),
      edge('instrument', 'I', 'i0', 'i1', 'INSTRUMENT'),
    ],
    junctions: [
      { id: 'tee', componentKey: 'T', nodeIds: ['tr0', 'tr1', 'tb'], entityType: 'TEE' },
      { id: 'olet', componentKey: 'O', nodeIds: ['or0', 'or1', 'ob'], entityType: 'OLET' },
    ],
    supports: [],
  };
}

function typedEvidence() {
  return {
    P: { outsideDiameterMm: 100 },
    E: { outsideDiameterMm: 80, center: { x: -700, y: 100, z: 0 }, centerlineRadiusMm: 100 },
    R: { startOutsideDiameterMm: 120, endOutsideDiameterMm: 80 },
    RE: {
      reducerType: 'ECCENTRIC', startOutsideDiameterMm: 120, endOutsideDiameterMm: 80,
      eccentricOffsetDirection: { x: 0, y: 0, z: 1 },
    },
    F: { outsideDiameterMm: 100 },
    V: { outsideDiameterMm: 100 },
    G: { outsideDiameterMm: 100 },
    I: { outsideDiameterMm: 80 },
    T: {
      center: { x: 0, y: 300, z: 0 }, outsideDiameterMm: 100,
      branchOutsideDiameterMm: 60, runNodeIds: ['tr0', 'tr1'], branchNodeId: 'tb',
    },
    O: {
      center: { x: 500, y: 500, z: 0 }, hostEntityId: 'pipe',
      branchOutsideDiameterMm: 50, branchNodeId: 'ob',
    },
  };
}

function approxVector(actual, expected, tolerance = 1e-12) {
  for (const key of ['x', 'y', 'z']) {
    assert.ok(Math.abs(actual[key] - expected[key]) <= tolerance, `${key}: ${actual[key]} != ${expected[key]}`);
  }
}

function primitiveRecord(kind, parameters) {
  return {
    primitiveId: `visual:${kind}`,
    canonicalEntityId: `component:${kind}`,
    canonicalType: kind,
    modelRole: 'DRAFT',
    partRole: 'body',
    kind,
    sourcePaths: [],
    workspaceEntityIds: [`workspace:${kind}`],
    parameters,
  };
}

function node(id, x, y, z) { return { id, position: { x, y, z } }; }
function edge(id, componentKey, fromNodeId, toNodeId, entityType) {
  return { id, componentKey, fromNodeId, toNodeId, entityType };
}

function sectionBox() {
  return [
    plane(1, 0, 0, 1000), plane(-1, 0, 0, 1000),
    plane(0, 1, 0, 1000), plane(0, -1, 0, 1000),
    plane(0, 0, 1, 1000), plane(0, 0, -1, 1000),
  ];
}
function plane(x, y, z, constant) { return { normal: { x, y, z }, constant }; }
