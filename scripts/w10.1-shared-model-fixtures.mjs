export function stagedPackageFixture() {
  return {
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'W10.1-STAGED',
    unit: 'mm',
    project: { name: 'W10.1 staged model' },
    objects: [{
      id: 'MODEL-ROOT',
      name: 'MODEL',
      type: 'BRANCH',
      sourcePath: '/MODEL',
      sourceAttributes: { SYSTEM_ID: 'SYS-1', ZONE_ID: 'ZONE-A' },
      children: [
        pipeFixture(),
        valveFixture(),
        supportFixture(),
      ],
    }],
  };
}

export function canonicalGeometryFixture() {
  return {
    schemaVersion: 'canonical-geometry-v1',
    unit: 'mm',
    project: { id: 'W10.1-CANONICAL', name: 'Canonical fixture' },
    source: 'manual',
    nodes: [
      { id: 'N-1', x: 0, y: 0, z: 0 },
      { id: 'N-2', x: 1200, y: 0, z: 0 },
      { id: 'N-3', x: 600, y: 0, z: 0 },
    ],
    segments: [{
      id: 'SEG-1', name: 'Canonical pipe', startNodeId: 'N-1', endNodeId: 'N-2',
      type: 'PIPE', length: 1200, diameter: 168.3, thickness: 7.11,
      material: 'A106-B', lineId: 'LINE-CANONICAL',
    }],
    components: [{ id: 'COMP-1', name: 'Inline item', type: 'VALVE', nodeId: 'N-3' }],
    supports: [{ id: 'SUP-C1', name: 'Canonical support', type: 'SUPPORT', nodeId: 'N-1' }],
    diagnostics: [],
  };
}

export function lossyCanonicalFixture() {
  const value = canonicalGeometryFixture();
  value.nodes[0].restraint = 'ANCHOR';
  value.segments[0].customCoefficient = 5;
  value.components[0].vendorData = { model: 'V-1' };
  value.loads = [{ id: 'LOAD-1', force: [0, -100, 0] }];
  value.materials = [{ id: 'MAT-1', modulus: 200000 }];
  return value;
}

export function duplicateAndMissingIdentityFixture() {
  return {
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'W10.1-DUPLICATES',
    unit: 'mm',
    objects: [{
      id: 'ROOT', type: 'BRANCH', children: [
        { id: 'DUP', name: 'First', type: 'PIPE', nativeParams: endpoints(0, 100) },
        { id: 'DUP', name: 'Second', type: 'PIPE', nativeParams: endpoints(100, 200) },
        { name: 'Missing ID', type: 'VALVE', nativeParams: { center: [250, 0, 0] } },
      ],
    }],
  };
}

export function invalidChildrenFixture() {
  return {
    schema: 'inputxml-managed-stage/v1',
    objects: [{ id: 'ROOT', type: 'BRANCH', children: ['invalid-child'] }],
  };
}

export function repeatedReferenceGraph() {
  const child = { id: 'CHILD', type: 'PIPE', nativeParams: endpoints(0, 100) };
  return { schema: 'inputxml-managed-stage/v1', objects: [{ id: 'ROOT', type: 'BRANCH', children: [child, child] }] };
}

export function cyclicSourceGraph() {
  const root = { id: 'ROOT', type: 'BRANCH', children: [] };
  root.children.push(root);
  return { schema: 'inputxml-managed-stage/v1', objects: [root] };
}

function pipeFixture() {
  return {
    id: 'PIPE-1', name: 'Pipe 1', type: 'PIPE', sourcePath: '/MODEL/LINE-1/PIPE-1',
    nativeParams: endpoints(0, 1000),
    sourceAttributes: {
      LINE_ID: 'LINE-1', BRANCH_ID: 'BRANCH-1', LENGTH_MM: 1000,
      CHAINAGE_START_MM: 0, CHAINAGE_END_MM: 1000, CHAINAGE_CENTER_MM: 500,
    },
    enrichedAttributes: {
      pipeOdMm: 168.3, wallThicknessMm: 7.11, pipeWeightKgPerM: 28,
      fluidWeightOpeKgPerM: 10, fluidWeightHydKgPerM: 15,
      insulationWeightKgPerM: 2,
    },
  };
}

function valveFixture() {
  return {
    id: 'VALVE-1', name: 'Valve 1', type: 'VALVE', sourcePath: '/MODEL/LINE-1/VALVE-1',
    nativeParams: { center: [1500, 0, 0] },
    sourceAttributes: { LINE_ID: 'LINE-1', BRANCH_ID: 'BRANCH-1', CHAINAGE_CENTER_MM: 1500 },
    enrichedAttributes: { componentWeightKg: 50 },
  };
}

function supportFixture() {
  return {
    id: 'SUP-1', name: 'Support 1', type: 'SUPPORT', sourcePath: '/MODEL/LINE-1/SUP-1',
    sourceAttributes: {
      LINE_ID: 'LINE-1', BRANCH_ID: 'BRANCH-1', POS: { x: 500, y: 0, z: 0 },
      CHAINAGE_CENTER_MM: 500, VERTICAL_CAPABILITY: 'YES', SUPPORT_TYPE: 'REST',
    },
  };
}

function endpoints(startX, endX) {
  return { startPoint: [startX, 0, 0], endPoint: [endX, 0, 0] };
}
