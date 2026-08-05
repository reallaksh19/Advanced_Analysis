import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { materializeTopologyEditPrimitive } from '../src/workspace/topology-edit/topology-edit-primitive-geometry.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import {
  deriveAllSupportRestraintGeometry,
  projectSupportGeometryToViewport,
} from '../src/workspace/topology-edit/support-restraint-family.js';
import {
  buildSjsonParentBranchDiameterIndex,
  deriveSjsonCompleteVisualGeometry,
  parentBranchDiameterForEntity,
  referencedBranchDiameterForEntity,
} from '../src/workspace/topology-edit/topology-edit-sjson-parent-branch-diameter.js';
import {
  distinctExactSupportOriginCount,
  enrichCanonicalSupportsWithExactOrigins,
  supportTopologyForExactOrigins,
  visualPrimitiveKindCounts,
} from '../src/workspace/topology-edit/topology-edit-sjson-visual-authority.js';

const SJSON_URL = new URL('../public/Sjson.json', import.meta.url);
const RUN_DIAMETER_KINDS = new Set([
  'PIPE_CYLINDER',
  'ELBOW_ARC',
  'FLANGE_DISC',
  'VALVE_BODY',
  'GASKET_DISC',
  'INSTRUMENT_MARKER',
]);

async function loadProductionSjson() {
  const bytes = new Uint8Array(await readFile(SJSON_URL));
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  const raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''));
  const dataset = normalizeWorkspaceDataset(raw, 'Sjson.json', {
    sourceBytes: bytes,
    sourceSha256: sourceHash,
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const restraints = buildRestraintCapabilityModel(attachments);
  const baseCanonical = finalizeCanonicalTopology(
    buildCanonicalTopologyFromWorkspaceDataset(dataset, graph, attachments, restraints),
  );
  const canonical = enrichCanonicalSupportsWithExactOrigins(
    baseCanonical,
    dataset,
    attachments,
  );
  return { raw, dataset, graph, attachments, restraints, baseCanonical, canonical };
}

test('production Sjson materializes fittings and exact support sites deterministically', async () => {
  const { raw, dataset, baseCanonical, canonical } = await loadProductionSjson();
  assert.equal(canonical.sourceHash, baseCanonical.sourceHash);
  assert.equal(canonical.supports.length, baseCanonical.supports.length);
  assert.deepEqual(
    canonical.supports.map((row) => row.nodeId),
    baseCanonical.supports.map((row) => row.nodeId),
    'Exact visual origins must not replace canonical support node linkage.',
  );
  assert.ok(
    distinctExactSupportOriginCount(canonical) >= 37,
    'The 37 qualified physical support sites must remain spatially distinct.',
  );

  const first = deriveSjsonCompleteVisualGeometry({
    canonicalTopology: canonical,
    dataset,
    modelRole: 'DRAFT',
  });
  const second = deriveSjsonCompleteVisualGeometry({
    canonicalTopology: structuredClone(canonical),
    dataset: structuredClone(dataset),
    modelRole: 'DRAFT',
  });
  assert.equal(first.model.visualGeometryHash, second.model.visualGeometryHash);
  assert.deepEqual(first.projection.primitives, second.projection.primitives);
  assert.equal(
    first.parentBranchDiameterIndex.indexHash,
    second.parentBranchDiameterIndex.indexHash,
  );

  const independentBranchIndex = buildSjsonParentBranchDiameterIndex(dataset);
  assert.equal(first.parentBranchDiameterIndex.indexHash, independentBranchIndex.indexHash);
  assert.deepEqual(independentBranchIndex.conflicts, []);
  const sourceBranches = raw.filter((row) => canonicalType(row.type) === 'BRANCH');
  assert.equal(independentBranchIndex.contexts.length, sourceBranches.length);
  for (const branch of sourceBranches) {
    const expected = expectedTopoValidatorBranchDiameter(branch);
    const actual = independentBranchIndex.byBranchId[branch.name];
    assert.ok(actual, `Parent branch ${branch.name} must be indexed.`);
    assert.equal(actual.diameterMm, expected, `Parent branch ${branch.name} diameter mismatch.`);
  }

  const counts = visualPrimitiveKindCounts(first.model);
  assert.ok((counts.PIPE_CYLINDER || 0) >= 40, `Expected production pipe bodies, got ${counts.PIPE_CYLINDER || 0}.`);
  assert.ok((counts.ELBOW_ARC || 0) >= 10, `Expected production elbow bodies, got ${counts.ELBOW_ARC || 0}.`);
  assert.ok((counts.FLANGE_DISC || 0) >= 18, `Expected production flange bodies, got ${counts.FLANGE_DISC || 0}.`);
  assert.ok((counts.VALVE_BODY || 0) >= 4, `Expected production valve bodies, got ${counts.VALVE_BODY || 0}.`);
  assert.ok(
    ((counts.CONICAL_REDUCER || 0) + (counts.ECCENTRIC_REDUCER || 0)) >= 4,
    'Expected production reducer bodies.',
  );
  const teeDiagnostics = first.model.components
    .filter((component) => component.canonicalType === 'TEE')
    .map((component) => ({
      canonicalEntityId: component.canonicalEntityId,
      workspaceEntityIds: component.workspaceEntityIds,
      primitiveKinds: component.primitives.map((primitive) => primitive.kind),
      diagnostics: component.diagnostics.map((row) => ({ code: row.code, details: row.details })),
      evidence: first.componentEvidence[component.workspaceEntityIds[0]] || null,
    }));
  assert.ok(
    (counts.TEE_JUNCTION || 0) >= 3,
    `Expected production tee bodies, got ${counts.TEE_JUNCTION || 0}: ${JSON.stringify(teeDiagnostics)}`,
  );
  assert.ok(
    (counts.OLET_BRANCH || 0) >= 10,
    `Expected production OLET bodies, got ${counts.OLET_BRANCH || 0}.`,
  );

  const entities = new Map(dataset.entities.map((entity) => [entity.entityId, entity]));
  let parentBranchApplicationCount = 0;
  let referencedBranchApplicationCount = 0;
  for (const component of first.model.components) {
    const entity = component.workspaceEntityIds.map((id) => entities.get(id)).find(Boolean);
    if (!entity) continue;
    const parentBranch = parentBranchDiameterForEntity(independentBranchIndex, entity);
    for (const primitive of component.primitives) {
      if (RUN_DIAMETER_KINDS.has(primitive.kind)) {
        assert.ok(parentBranch, `${primitive.kind} ${primitive.canonicalEntityId} needs a parent branch.`);
        assert.equal(primitive.parameters.outsideDiameterMm, parentBranch.diameterMm);
        assert.equal(primitive.parameters.outsideDiameterAuthority, 'SOURCE_PARENT_BRANCH');
        parentBranchApplicationCount += 1;
      }
      if (primitive.kind === 'TEE_JUNCTION') {
        assert.ok(parentBranch, `TEE ${primitive.canonicalEntityId} needs a run parent branch.`);
        assert.equal(primitive.parameters.runOutsideDiameterMm, parentBranch.diameterMm);
        assert.equal(primitive.parameters.runOutsideDiameterAuthority, 'SOURCE_PARENT_BRANCH');
        const referenced = referencedBranchDiameterForEntity(
          independentBranchIndex,
          entity,
          primitive,
        );
        assert.ok(referenced, `TEE ${primitive.canonicalEntityId} needs a referenced branch.`);
        assert.equal(primitive.parameters.branchOutsideDiameterMm, referenced.diameterMm);
        assert.equal(
          primitive.parameters.branchOutsideDiameterAuthority,
          'SOURCE_REFERENCED_PARENT_BRANCH',
        );
        parentBranchApplicationCount += 1;
        referencedBranchApplicationCount += 1;
      }
      if (primitive.kind === 'OLET_BRANCH') {
        const referenced = referencedBranchDiameterForEntity(
          independentBranchIndex,
          entity,
          primitive,
        );
        assert.ok(referenced, `OLET ${primitive.canonicalEntityId} needs a referenced branch.`);
        assert.equal(primitive.parameters.branchOutsideDiameterMm, referenced.diameterMm);
        assert.equal(
          primitive.parameters.branchOutsideDiameterAuthority,
          'SOURCE_REFERENCED_PARENT_BRANCH',
        );
        referencedBranchApplicationCount += 1;
      }
      if (['CONICAL_REDUCER', 'ECCENTRIC_REDUCER'].includes(primitive.kind)) {
        const attributes = entityAttributes(entity);
        const expectedEnds = [positive(attributes.ABORE), positive(attributes.LBORE)]
          .filter(Boolean)
          .sort((left, right) => left - right);
        const actualEnds = [
          primitive.parameters.startOutsideDiameterMm,
          primitive.parameters.endOutsideDiameterMm,
        ].filter(Boolean).sort((left, right) => left - right);
        assert.deepEqual(actualEnds, expectedEnds, 'Reducer end bores must retain source asymmetry.');
      }
    }
  }
  assert.ok(parentBranchApplicationCount >= 100);
  assert.equal(
    referencedBranchApplicationCount,
    (counts.TEE_JUNCTION || 0) + (counts.OLET_BRANCH || 0),
  );

  assert.ok(
    first.model.diagnostics.some((row) => row.code === 'VISUAL_NOMINAL_BORE_PROXY_USED'),
    'Visual-only parent-branch bore proxy use must remain explicit in diagnostics.',
  );
  assert.ok(
    first.model.diagnostics.filter((row) => row.code === 'VISUAL_PARENT_BRANCH_DIAMETER_USED').length >= 100,
  );
  assert.equal(
    first.model.diagnostics.filter((row) => row.code === 'VISUAL_REFERENCED_BRANCH_DIAMETER_USED').length,
    (counts.TEE_JUNCTION || 0) + (counts.OLET_BRANCH || 0),
  );
  assert.equal(
    first.model.diagnostics.filter((row) => row.code === 'VISUAL_TWO_PORT_TEE_PROMOTED').length,
    3,
  );
  assert.ok(
    first.model.diagnostics.filter((row) => row.code === 'VISUAL_POINT_OLET_EXTENT_USED').length >= 10,
  );
  assert.equal(
    first.model.diagnostics.filter((row) => row.code === 'VISUAL_POINT_COMPONENT_EXTENT_USED').length,
    4,
  );

  const material = new THREE.MeshStandardMaterial();
  const failures = [];
  for (const primitive of first.projection.primitives) {
    try {
      const result = materializeTopologyEditPrimitive(primitive, {
        material,
        radialSegments: 12,
        markerSize: 70,
        pickUserData: {
          canonicalId: primitive.canonicalEntityId,
          pickTarget: {
            objectKind: 'component',
            objectId: primitive.canonicalEntityId,
            workspaceEntityIds: primitive.workspaceEntityIds,
          },
        },
      });
      result.object.traverse((object) => object.geometry?.dispose?.());
    } catch (error) {
      failures.push({
        primitiveId: primitive.primitiveId,
        canonicalEntityId: primitive.canonicalEntityId,
        workspaceEntityIds: primitive.workspaceEntityIds,
        kind: primitive.kind,
        parameters: primitive.parameters,
        componentDiagnostics: first.model.components
          .find((component) => component.canonicalEntityId === primitive.canonicalEntityId)
          ?.diagnostics?.map((row) => row.code) || [],
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  material.dispose();
  assert.deepEqual(failures, [], 'Every production typed primitive must materialize in Three.js.');

  const supportTopology = supportTopologyForExactOrigins(canonical);
  const overlays = deriveAllSupportRestraintGeometry({
    canonicalTopology: supportTopology,
    verticalAxis: 'Z',
  });
  const supportProjection = projectSupportGeometryToViewport(overlays, {
    markerSizeMm: 70,
  });
  const distinctProjectedOrigins = new Set(
    supportProjection.glyphOverlays
      .filter((row) => row.origin)
      .map((row) => `${row.origin.x.toFixed(6)}|${row.origin.y.toFixed(6)}|${row.origin.z.toFixed(6)}`),
  );
  assert.ok(distinctProjectedOrigins.size >= 37);
  assert.ok(supportProjection.glyphOverlays.every((row) => row.origin));
  assert.ok(supportProjection.glyphOverlays.some((row) => row.hostEntityId));
});

function expectedTopoValidatorBranchDiameter(branch) {
  const attributes = branch.attributes || {};
  const firstRouteChildDiameter = (branch.children || [])
    .map((child) => {
      const childAttributes = child.attributes || {};
      return Math.max(
        positive(childAttributes.ABORE) || 0,
        positive(childAttributes.LBORE) || 0,
      );
    })
    .find((value) => value > 0);
  return positive(branch.outsideDiameterMm)
    || positive(attributes.OUTSIDE_DIAMETER_MM)
    || positive(attributes.OUTSIDE_DIAMETER)
    || positive(branch._boreValue)
    || positive(branch.bore)
    || positive(attributes.HBOR)
    || positive(attributes.TBOR)
    || firstRouteChildDiameter
    || null;
}

function entityAttributes(entity) {
  return {
    ...(entity?.properties?.sourceAttributes || {}),
    ...(entity?.properties?.attributes || {}),
    ...(entity?.properties?.enrichedAttributes || {}),
    ...(entity?.properties?.nativeParams || {}),
  };
}

function canonicalType(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s/-]+/gu, '_');
}

function positive(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const match = String(value ?? '').replace(/,/gu, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/iu);
  const number = Number(match?.[0]);
  return Number.isFinite(number) && number > 0 ? number : null;
}
