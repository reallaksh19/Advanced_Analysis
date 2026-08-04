import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { resolveEntityType } from '../src/workspace/dataset-types.js';
import { createDimensionAuthority } from '../src/workspace/topology-edit/dimension-authority.js';
import {
  normalizeTopologyEditCanonicalIds,
} from '../src/workspace/topology-edit/professional/topology-edit-canonical-id.js';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from '../src/workspace/topology-edit/support-restraint-family.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import {
  deriveTopologyVisualGeometry,
} from '../src/workspace/topology-edit/topology-edit-render-model.js';
import {
  buildCanonicalTopologyFromWorkspaceDataset,
} from '../src/workspace/topology-edit/topology-edit-source-adapter.js';

const SJSON_URL = new URL('../public/Sjson.json', import.meta.url);
const DEMO_URL = new URL(
  '../public/fixtures/topology-edit-20-element-demo.staged.json',
  import.meta.url,
);

async function loadWorkspace(url, sourceName) {
  const bytes = new Uint8Array(await readFile(url));
  const raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''));
  const dataset = normalizeWorkspaceDataset(raw, sourceName, {
    sourceBytes: bytes,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const restraints = buildRestraintCapabilityModel(attachments);
  const canonical = finalizeCanonicalTopology(
    buildCanonicalTopologyFromWorkspaceDataset(
      dataset,
      graph,
      attachments,
      restraints,
    ),
  );
  return { dataset, graph, attachments, restraints, canonical };
}

function allCanonicalIds(topology) {
  return [
    ...(topology.nodes || []),
    ...(topology.edges || []),
    ...(topology.junctions || []),
    ...(topology.supports || []),
    ...(topology.boundaries || []),
    ...(topology.rigids || []),
  ].map((row) => row.id);
}

function componentEvidence(dataset) {
  return Object.fromEntries(dataset.entities.map((entity) => {
    const attributes = {
      ...(entity.properties?.sourceAttributes || {}),
      ...(entity.properties?.attributes || {}),
      ...(entity.properties?.enrichedAttributes || {}),
    };
    return [entity.entityId, {
      workspaceEntityIds: [entity.entityId],
      sourcePath: entity.sourcePath,
      outsideDiameterMm: entity.outsideDiameterMm,
      boreMm: entity.boreMm,
      wallThicknessMm: entity.wallThicknessMm,
      centerlineRadiusMm: firstPositive(
        attributes.centerlineRadiusMm,
        attributes.CENTERLINE_RADIUS,
        attributes.BEND_RADIUS,
      ),
      center: entity.properties?.geometry?.center,
      reducerType: attributes.reducerType ?? attributes.REDUCER_TYPE,
      startOutsideDiameterMm: firstPositive(
        attributes.startOutsideDiameterMm,
        attributes.START_OUTSIDE_DIAMETER,
      ),
      endOutsideDiameterMm: firstPositive(
        attributes.endOutsideDiameterMm,
        attributes.END_OUTSIDE_DIAMETER,
      ),
      branchOutsideDiameterMm: firstPositive(
        attributes.branchOutsideDiameterMm,
        attributes.BRANCH_OUTSIDE_DIAMETER,
      ),
      hostEntityId: attributes.hostEntityId ?? attributes.HOST_ENTITY_ID,
      branchNodeId: attributes.branchNodeId ?? attributes.BRANCH_NODE_ID,
      runNodeIds: Array.isArray(attributes.runNodeIds)
        ? attributes.runNodeIds
        : undefined,
    }];
  }));
}

function firstPositive(...values) {
  for (const value of values) {
    const parsed = Number(String(value ?? '').replace(/\s*mm$/iu, ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

test('production Sjson creates exact canonical IDs and retains support host authority', async () => {
  const { canonical } = await loadWorkspace(SJSON_URL, 'Sjson.json');
  const canonicalIds = allCanonicalIds(canonical);

  assert.ok(canonicalIds.length > 253, 'The reported failing canonical index must be exercised.');
  assert.doesNotThrow(() => normalizeTopologyEditCanonicalIds(canonicalIds));
  assert.ok(
    canonicalIds.some((id) => id.includes(':hash-')),
    'Whitespace-bearing source identities must be converted to stable hashed canonical IDs.',
  );
  assert.ok(canonical.supports.length > 0, 'The production Sjson must retain support records.');
  assert.ok(
    canonical.supports.some((support) => support.hostEntityId),
    'At least one production support must retain its attached host component identity.',
  );

  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonical,
    verticalAxis: 'Z',
  });
  const projection = projectSupportGeometryToViewport(overlays);
  assert.ok(projection.glyphOverlays.length > 0);
  assert.ok(
    projection.glyphOverlays.some((overlay) => overlay.origin && overlay.hostEntityId),
    'At least one support overlay must have a resolved origin and host.',
  );
});

test('20-element demo resolves real valve, flange, and support geometry', async () => {
  const { dataset, canonical } = await loadWorkspace(DEMO_URL, 'topology-edit-demo');
  const valve = dataset.entities.find((entity) => entity.entityId === 'V-001');
  const flange = dataset.entities.find((entity) => entity.entityId === 'F-001');
  assert.equal(valve?.outsideDiameterMm, 114.3);
  assert.equal(flange?.outsideDiameterMm, 114.3);

  const visual = deriveTopologyVisualGeometry({
    canonicalTopology: canonical,
    dimensionAuthority: createDimensionAuthority(),
    componentEvidence: componentEvidence(dataset),
    visualPolicy: { modelRole: 'DRAFT' },
  });
  const kinds = visual.components.flatMap((component) => (
    component.primitives.map((primitive) => primitive.kind)
  ));
  assert.ok(kinds.includes('VALVE_BODY'), 'Valve must materialize as governed valve geometry.');
  assert.ok(kinds.includes('FLANGE_DISC'), 'Flange must materialize as governed flange geometry.');

  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonical,
    verticalAxis: 'Z',
  });
  const projection = projectSupportGeometryToViewport(overlays);
  assert.equal(projection.glyphOverlays.length, 5);
  assert.equal(projection.glyphOverlays.every((overlay) => overlay.origin), true);
  assert.equal(projection.glyphOverlays.every((overlay) => overlay.hostEntityId), true);
});

test('compact staged component codes normalize before typed visual derivation', () => {
  assert.equal(resolveEntityType({ type: 'FLAN' }), 'FLANGE');
  assert.equal(resolveEntityType({ type: 'VALV' }), 'VALVE');
  assert.equal(resolveEntityType({ type: 'REDU' }), 'REDUCER');
  assert.equal(resolveEntityType({ type: 'GASK' }), 'GASKET');

  const canonicalTopology = finalizeCanonicalTopology({
    schema: 'topology-edit-canonical-topology/v1',
    datasetId: 'compact-types',
    nodes: [
      { id: 'node:a', position: { x: 0, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:b', position: { x: 100, y: 0, z: 0 }, portKeys: [] },
      { id: 'node:c', position: { x: 200, y: 0, z: 0 }, portKeys: [] },
    ],
    edges: [
      {
        id: 'edge:flan', componentKey: 'FLAN-1', fromNodeId: 'node:a',
        toNodeId: 'node:b', entityType: resolveEntityType({ type: 'FLAN' }),
        diameterMm: 100, outsideDiameterMm: 114.3,
        diameterAuthority: 'OUTSIDE_DIAMETER',
      },
      {
        id: 'edge:valv', componentKey: 'VALV-1', fromNodeId: 'node:b',
        toNodeId: 'node:c', entityType: resolveEntityType({ type: 'VALV' }),
        diameterMm: 100, outsideDiameterMm: 114.3,
        diameterAuthority: 'OUTSIDE_DIAMETER',
      },
    ],
    junctions: [], supports: [], boundaries: [], rigids: [],
  });
  const visual = deriveTopologyVisualGeometry({
    canonicalTopology,
    dimensionAuthority: createDimensionAuthority(),
    componentEvidence: {
      'FLAN-1': { outsideDiameterMm: 114.3, workspaceEntityIds: ['FLAN-1'] },
      'VALV-1': { outsideDiameterMm: 114.3, workspaceEntityIds: ['VALV-1'] },
    },
    visualPolicy: { modelRole: 'DRAFT' },
  });
  const kinds = visual.components.flatMap((component) => (
    component.primitives.map((primitive) => primitive.kind)
  ));
  assert.deepEqual(kinds.sort(), ['FLANGE_DISC', 'VALVE_BODY']);
});
