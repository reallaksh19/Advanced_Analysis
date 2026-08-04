import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { semanticHash } from '../../src/core/shared-piping-model/canonical-json.js';
import { normalizeWorkspaceDataset } from '../../src/workspace/dataset-adapter.js';
import { WorkspaceState } from '../../src/workspace/workspace-state.js';
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
import { NonFeaStageRecorder } from './stage-recorder.mjs';

export async function executeNonFeaFixtureSample({ fixturePath, fixture, executionId, sampleKind, sampleIndex }) {
  const recorder = new NonFeaStageRecorder({ executionId, fixturePath: fixture, sampleKind, sampleIndex });
  let bytes;
  let raw;
  let dataset;
  let sourceSha256 = null;
  let rawBeforeHash = null;
  let rawAfterHash = null;
  let products = {};
  let identity = {};
  try {
    bytes = await recorder.capture('FILE_READ', () => readFile(fixturePath));
    sourceSha256 = sha256(bytes);
    const text = await recorder.capture('UTF8_DECODE', () => bytes.toString('utf8'));
    raw = await recorder.capture('JSON_PARSE', () => JSON.parse(text));
    rawBeforeHash = semanticHash(raw);
    dataset = await recorder.capture('NORMALIZATION', () => normalizeWorkspaceDataset(raw, fixture, { sourceBytes: bytes, sourceSha256 }));
    products = { dataset: semanticHash(dataset), hierarchy: semanticHash(dataset.hierarchy), sharedModel: semanticHash(dataset.sharedModel) };
    rawAfterHash = semanticHash(raw);
    if (rawBeforeHash !== rawAfterHash || sha256(bytes) !== sourceSha256) {
      const error = new Error('Source package or bytes changed during read-only baseline execution.');
      error.code = 'P0_SOURCE_MUTATED';
      throw error;
    }
    await recorder.capture('WORKSPACE_SNAPSHOT', () => WorkspaceState.loadDataset(dataset));
    const profile = projectDataStore.getProfile();
    const supportSites = await recorder.capture('SUPPORT_SITES', () => buildSupportSiteModel(dataset, profile));
    const routes = await recorder.capture('ROUTE_PARTITION', () => buildRoutePartitionModel(dataset, profile));
    const zoneProjection = await recorder.capture('MODEL_ZONE_PROJECTION', () => projectDatasetForModelZone(dataset, null));
    const scopedSupports = projectSupportSiteModelForModelZone(supportSites, zoneProjection);
    const resolved = await recorder.capture('RESOLVED_GEOMETRY', () => filterResolvedGeometryForModelZone(
      buildResolvedEngineeringGeometry(dataset, profile, scopedSupports), zoneProjection, scopedSupports,
    ));
    const renderModel = await recorder.capture('RENDER_MODEL', () => buildViewportRenderModel(resolved));
    products = {
      ...products,
      supportSites: semanticHash(supportSites),
      routes: semanticHash(routes),
      zoneProjection: semanticHash(zoneProjection),
      resolvedGeometry: semanticHash(resolved),
      renderModel: semanticHash(renderModel),
      diagnostics: semanticHash({ skippedEntityIds: renderModel.skippedEntityIds, summary: renderModel.summary }),
    };
    identity = {
      datasetId: dataset.datasetId,
      sourceSchema: dataset.sourceSchema,
      entityCount: dataset.entities.length,
      pipeCount: dataset.summary.pipes,
      supportCount: dataset.summary.supports,
      componentCount: dataset.summary.components,
      supportSourceRecordCount: supportSites.summary.sourceSupportRecordCount,
      supportAssemblyCount: supportSites.summary.supportAssemblyCount,
      supportPhysicalLocationCount: supportSites.summary.physicalLocationCount,
      routeCount: routes.summary.routeCount,
      renderableCount: renderModel.summary.renderableCount,
      diagnosticCount: renderModel.diagnosticPrimitives.length,
    };
  } catch {
    // The stage recorder owns exact failure evidence; P0 still writes the full ledger.
  } finally {
    try { WorkspaceState.clearDataset(); } catch { /* read-only cleanup best effort */ }
  }
  return Object.freeze({
    fixture: Object.freeze({
      sourceSha256,
      identity,
      authorityNotes: dataset ? ['Normalized through production normalizeWorkspaceDataset.'] : ['Production normalization did not complete.'],
    }),
    run: Object.freeze({
      ...recorder.snapshot(),
      identity: Object.freeze(identity),
      products,
      sourceHashes: { before: rawBeforeHash, after: rawAfterHash, bytes: sourceSha256 },
    }),
  });
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
