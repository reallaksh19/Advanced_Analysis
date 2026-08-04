import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import { buildSupportAttachmentModel } from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';

const SJSON_URL = new URL('../public/Sjson.json', import.meta.url);

test('diagnose production Sjson support attachment evidence', async () => {
  const bytes = new Uint8Array(await readFile(SJSON_URL));
  const raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''));
  const dataset = normalizeWorkspaceDataset(raw, 'Sjson.json', {
    sourceBytes: bytes,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const model = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const supportEntities = dataset.entities
    .filter((entity) => entity.category === 'support')
    .slice(0, 12)
    .map((entity) => ({
      entityId: entity.entityId,
      sourceEntityId: entity.sourceEntityId,
      entityType: entity.entityType,
      sourcePath: entity.sourcePath,
      sourceNodeKey: entity.sourceNodeKey,
      parentSourceNodeKey: entity.parentSourceNodeKey,
      componentReference: entity.componentReference,
      attributes: entity.properties?.attributes,
      sourceAttributes: entity.properties?.sourceAttributes,
      nativeParams: entity.properties?.nativeParams,
      geometry: entity.properties?.geometry,
    }));
  throw new Error(JSON.stringify({
    summary: model.summary,
    supportProjection: model.supportProjection.supports.slice(0, 12),
    supportStates: model.supportStates.slice(0, 12),
    diagnostics: model.attachmentAudit?.diagnostics?.slice(0, 20) || [],
    supportEntities,
  }, null, 2));
});
