import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { canonicalStringify, semanticHash } from '../../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';
import { normalizeWorkspaceDataset } from '../../src/workspace/dataset-adapter.js';
import { projectDataStore } from '../../src/workspace/project-data/project-data-store.js';
import { buildSupportSiteModel } from '../../src/workspace/support-sites/support-site-model.js';
import { buildRoutePartitionModel } from '../../src/workspace/routes/route-partition-model.js';
import { projectDatasetForModelZone } from '../../src/workspace/model-zone-selector.js';
import {
  filterResolvedGeometryForModelZone,
  projectSupportSiteModelForModelZone,
} from '../../src/workspace/model-zone-viewport-projection.js';
import { buildResolvedEngineeringGeometry } from '../../src/workspace/resolved-engineering-geometry.js';
import { buildViewportRenderModel } from '../../src/workspace/viewport-render-model.js';
import {
  clearThreeSceneObjects,
  renderThreeModel,
  resolveThreeEntityId,
} from '../../src/workspace/three-viewport-scene.js';
import { WorkspaceState } from '../../src/workspace/workspace-state.js';
import {
  P1_PROTECTED_FIELDS,
  P1_PROTECTED_MANIFEST_SCHEMA,
  codeUnitCompare,
  requireSha1,
  requireString,
} from './p1-contracts.mjs';
import { requireP1ProtectedManifest } from './p1-protected-manifest-validator.mjs';

export async function buildP1ProtectedManifest({
  fixturePath,
  fixtureRole,
  exactHeadSha,
  executionId,
}) {
  requireString(fixturePath, 'fixturePath');
  requireString(fixtureRole, 'fixtureRole');
  requireSha1(exactHeadSha, 'exactHeadSha');
  requireString(executionId, 'executionId');

  const bytes = await readFile(fixturePath);
  const sourceSha256 = sha256(bytes);
  const rawPackage = JSON.parse(bytes.toString('utf8'));
  const sourcePackageHash = semanticHash(rawPackage);
  let sceneBackend = null;
  try {
    const dataset = normalizeWorkspaceDataset(rawPackage, fixturePath, {
      sourceBytes: bytes,
      sourceSha256,
    });
    WorkspaceState.loadDataset(dataset);
    const profile = projectDataStore.getProfile();
    const supportSites = buildSupportSiteModel(dataset, profile);
    const routes = buildRoutePartitionModel(dataset, profile);
    const zoneProjection = projectDatasetForModelZone(dataset, null);
    const scopedSupports = projectSupportSiteModelForModelZone(supportSites, zoneProjection);
    const resolvedGeometry = filterResolvedGeometryForModelZone(
      buildResolvedEngineeringGeometry(dataset, profile, scopedSupports),
      zoneProjection,
      scopedSupports,
    );
    const renderModel = buildViewportRenderModel(resolvedGeometry);
    const renderItems = allRenderItems(renderModel);
    const diagnosticManifest = diagnosticRows(renderModel);
    const canonicalObjectManifest = canonicalObjectRows(renderItems);

    sceneBackend = createManifestBackend();
    renderThreeModel(sceneBackend, renderModel, { resetCamera: false });
    const pickTargetManifest = installedPickRows(sceneBackend.objects);
    const sceneBounds = canonicalSceneBounds(renderModel.bounds);

    const sourcePackageHashAfter = semanticHash(rawPackage);
    const sourceSha256After = sha256(await readFile(fixturePath));
    if (sourcePackageHashAfter !== sourcePackageHash || sourceSha256After !== sourceSha256) {
      const error = new Error('P1 protected-manifest execution mutated source bytes or source data.');
      error.code = 'P1_SOURCE_MUTATED';
      throw error;
    }

    return deepFreeze({
      schema: P1_PROTECTED_MANIFEST_SCHEMA,
      exactHeadSha,
      executionId,
      fixtureRole,
      fixturePath,
      sourceSha256,
      sourcePackageHash,
      sourcePackageHashAfter,
      sourceMutationStatus: 'UNCHANGED',
      materializationAuthority: 'PRODUCTION_RENDER_THREE_MODEL',
      datasetHash: semanticHash(dataset),
      hierarchyHash: semanticHash(dataset.hierarchy),
      sharedModelHash: semanticHash(dataset.sharedModel),
      supportSiteHash: semanticHash(supportSites),
      routePartitionHash: semanticHash(routes),
      modelZoneHash: semanticHash({
        schema: zoneProjection.schema,
        datasetId: zoneProjection.datasetId,
        zoneId: zoneProjection.zoneId,
        entityIds: zoneProjection.entityIds,
      }),
      resolvedGeometryHash: semanticHash(resolvedGeometry),
      renderModelHash: semanticHash(renderModel),
      diagnosticManifestHash: semanticHash(diagnosticManifest),
      canonicalObjectManifestHash: semanticHash(canonicalObjectManifest),
      pickTargetManifestHash: semanticHash(pickTargetManifest),
      sceneBoundsHash: semanticHash(sceneBounds),
      diagnosticManifest,
      canonicalObjectManifest,
      pickTargetManifest,
      sceneBounds,
      counts: deepFreeze({
        entityCount: dataset.entities.length,
        diagnosticCount: diagnosticManifest.length,
        renderItemCount: renderItems.length,
        materializedPickRootCount: pickTargetManifest.length,
        materializedPickNodeCount: pickTargetManifest.reduce(
          (total, row) => total + row.nodes.length,
          0,
        ),
      }),
    });
  } finally {
    if (sceneBackend) clearThreeSceneObjects(sceneBackend);
    try { WorkspaceState.clearDataset(); } catch { /* best-effort cleanup */ }
  }
}

export function compareP1ProtectedManifests(before, after) {
  requireP1ProtectedManifest(before);
  requireP1ProtectedManifest(after);
  const differences = [];
  for (const field of P1_PROTECTED_FIELDS) {
    if (canonicalStringify(before[field]) !== canonicalStringify(after[field])) {
      differences.push(deepFreeze({ field, before: before[field], after: after[field] }));
    }
  }
  return deepFreeze({
    schema: 'non-fea-p1-protected-manifest-comparison/v1',
    beforeExactHeadSha: before.exactHeadSha,
    afterExactHeadSha: after.exactHeadSha,
    differenceCount: differences.length,
    differences,
    status: differences.length ? 'REJECTED_IDENTITY_DRIFT' : 'PASS_IDENTITY_PARITY',
  });
}

export { requireP1ProtectedManifest };

function createManifestBackend() {
  return {
    physicalGroup: new THREE.Group(),
    supportGroup: new THREE.Group(),
    diagnosticGroup: new THREE.Group(),
    objects: new Map(),
    sceneBoundsCache: null,
    model: null,
    selectedEntityId: '',
    hostElement: null,
    hasFittedFirstModel: true,
    controls: { update() {} },
    applyModelConfiguration() {},
  };
}
function allRenderItems(model) {
  return [
    ...(model.physicalPrimitives ?? []),
    ...(model.supportOverlayPrimitives ?? []),
    ...(model.diagnosticPrimitives ?? []),
  ];
}
function diagnosticRows(model) {
  return (model.diagnosticPrimitives ?? []).map(identityRow).sort(compareIdentityRows);
}
function canonicalObjectRows(items) { return items.map(identityRow).sort(compareIdentityRows); }
function identityRow(item) {
  return deepFreeze({
    primitiveId: String(item.primitiveId || ''),
    objectId: String(item.objectId || ''),
    componentKind: String(item.componentKind || ''),
    resolutionStatus: String(item.resolutionStatus || ''),
    layer: String(item.layer || ''),
    primitiveKind: String(item.primitive?.kind || ''),
  });
}
function installedPickRows(objectMap) {
  const rows = [];
  [...objectMap.entries()].sort(([left], [right]) => codeUnitCompare(left, right))
    .forEach(([mapEntityId, roots]) => roots.forEach((root, rootIndex) => {
      const nodes = [];
      walkObject(root, '0', nodes);
      rows.push(deepFreeze({
        mapEntityId,
        rootIndex,
        rootResolvedEntityId: resolveThreeEntityId(root),
        nodes: deepFreeze(nodes),
      }));
    }));
  return rows;
}
function walkObject(object, objectPath, rows) {
  rows.push(deepFreeze({
    path: objectPath,
    objectType: String(object.type || object.constructor?.name || ''),
    entityId: resolveThreeEntityId(object),
  }));
  object.children.forEach((child, index) => walkObject(child, `${objectPath}/${index}`, rows));
}
function canonicalSceneBounds(bounds) {
  return deepFreeze({
    min: finitePoint(bounds?.min, 'bounds.min'),
    max: finitePoint(bounds?.max, 'bounds.max'),
    center: finitePoint(bounds?.center, 'bounds.center'),
    size: finitePoint(bounds?.size, 'bounds.size'),
  });
}
function finitePoint(point, label) {
  const result = {};
  for (const axis of ['x', 'y', 'z']) {
    const value = Number(point?.[axis]);
    if (!Number.isFinite(value)) throw new TypeError(`${label}.${axis} must be finite.`);
    result[axis] = Object.is(value, -0) ? 0 : value;
  }
  return deepFreeze(result);
}
function compareIdentityRows(left, right) {
  return codeUnitCompare(`${left.objectId}\u0000${left.primitiveId}`,
    `${right.objectId}\u0000${right.primitiveId}`);
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
