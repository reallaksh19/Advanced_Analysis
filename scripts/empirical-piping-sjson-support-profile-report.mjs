import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import { buildSjsonParentBranchDiameterIndex } from '../src/workspace/topology-edit/topology-edit-sjson-parent-branch-diameter.js';
import { deriveSjsonTopoValidatorSupportProjection } from '../src/workspace/topology-edit/topology-edit-sjson-restraint-projection.js';
import { applySjsonParentBranchDiametersToSupportTopology } from '../src/workspace/topology-edit/topology-edit-sjson-support-parent-branch-diameter.js';
import {
  enrichCanonicalSupportsWithExactOrigins,
  supportTopologyForExactOrigins,
} from '../src/workspace/topology-edit/topology-edit-sjson-visual-authority.js';

const SJSON_URL = new URL('../public/Sjson.json', import.meta.url);
const bytes = new Uint8Array(await readFile(SJSON_URL));
const raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''));
const dataset = normalizeWorkspaceDataset(raw, 'Sjson.json', {
  sourceBytes: bytes,
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
});
const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
const restraints = buildRestraintCapabilityModel(attachments);
const baseCanonical = finalizeCanonicalTopology(
  buildCanonicalTopologyFromWorkspaceDataset(dataset, graph, attachments, restraints),
);
const canonical = enrichCanonicalSupportsWithExactOrigins(baseCanonical, dataset, attachments);
const exactSupportTopology = supportTopologyForExactOrigins(canonical);
const supportTopology = applySjsonParentBranchDiametersToSupportTopology(
  exactSupportTopology,
  dataset,
  buildSjsonParentBranchDiameterIndex(dataset),
);
const projection = deriveSjsonTopoValidatorSupportProjection({
  canonicalTopology: supportTopology,
  dataset,
  markerSizeMm: 70,
  verticalAxis: 'Z',
});

const overlaysById = new Map(projection.overlays.map((row) => [row.supportId, row]));
const rows = projection.anchors.map((anchor, index) => {
  const overlay = overlaysById.get(anchor.representativeSupportId)
    || projection.overlays.find((row) => anchor.memberSupportIds?.includes(row.supportId));
  const origin = anchor.origin || overlay?.origin || null;
  return {
    index: index + 1,
    anchorId: anchor.anchorId || anchor.supportAnchorId || null,
    representativeSupportId: anchor.representativeSupportId,
    memberSupportIds: anchor.memberSupportIds,
    sourceTags: anchor.sourceTags || anchor.supportTags || [],
    origin,
    hostEntityId: anchor.hostEntityId || overlay?.hostEntityId || null,
    hostOutsideDiameterMm: anchor.hostOutsideDiameterMm || overlay?.hostOutsideDiameterMm || null,
    restraintTypes: anchor.restraintTypes,
    restraintCount: anchor.restraintCount,
    restraints: (overlay?.restraints || []).map((restraint) => ({
      restraintId: restraint.restraintId,
      family: restraint.family,
      sourceType: restraint.sourceType || restraint.type || null,
      direction: restraint.direction,
      positiveContactPoint: restraint.positiveContactPoint,
      negativeContactPoint: restraint.negativeContactPoint,
      gapMm: restraint.gapMm ?? null,
      sourcePaths: restraint.sourcePaths || [],
    })),
  };
});

console.log('SJSON_SUPPORT_PROFILE_BEGIN');
console.log(JSON.stringify({
  datasetId: dataset.sharedModel.project.datasetId,
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  metrics: projection.metrics,
  rows,
}, null, 2));
console.log('SJSON_SUPPORT_PROFILE_END');
