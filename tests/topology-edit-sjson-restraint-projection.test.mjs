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
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';
import {
  buildSjsonParentBranchDiameterIndex,
} from '../src/workspace/topology-edit/topology-edit-sjson-parent-branch-diameter.js';
import {
  deriveSjsonTopoValidatorSupportProjection,
} from '../src/workspace/topology-edit/topology-edit-sjson-restraint-projection.js';
import {
  applySjsonParentBranchDiametersToSupportTopology,
} from '../src/workspace/topology-edit/topology-edit-sjson-support-parent-branch-diameter.js';
import {
  enrichCanonicalSupportsWithExactOrigins,
  supportTopologyForExactOrigins,
} from '../src/workspace/topology-edit/topology-edit-sjson-visual-authority.js';

const SJSON_URL = new URL('../public/Sjson.json', import.meta.url);

test('production Sjson matches Topo validator support anchors and restraint arrays', async () => {
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
  const canonical = enrichCanonicalSupportsWithExactOrigins(
    baseCanonical,
    dataset,
    attachments,
  );
  const exactSupportTopology = supportTopologyForExactOrigins(canonical);
  const supportTopology = applySjsonParentBranchDiametersToSupportTopology(
    exactSupportTopology,
    dataset,
    buildSjsonParentBranchDiameterIndex(dataset),
  );

  const first = deriveSjsonTopoValidatorSupportProjection({
    canonicalTopology: supportTopology,
    dataset,
    markerSizeMm: 70,
    verticalAxis: 'Z',
  });
  const second = deriveSjsonTopoValidatorSupportProjection({
    canonicalTopology: structuredClone(supportTopology),
    dataset: structuredClone(dataset),
    markerSizeMm: 70,
    verticalAxis: 'Z',
  });

  assert.equal(first.authority, 'TOPO_VALIDATOR_SUPPORT_HIERARCHY_POSITION_RESTRAINT_ARRAY');
  assert.equal(
    first.groupingAuthority,
    'MDSSREF_MDSGUIDEREF_PREV_NAME_THEN_POSITION_0_001MM',
  );
  assert.equal(first.restraintAuthority, 'TOPO_VALIDATOR_SJ_RESTRAINT_RESOLVER');
  assert.equal(first.authorityHash, second.authorityHash);
  assert.deepEqual(first.projection, second.projection);
  assert.equal(first.metrics.rawSupportCount, 139);
  assert.equal(first.metrics.supportAnchorCount, 37);
  assert.equal(first.metrics.nativeRestraintRecordCount, 47);
  assert.equal(first.metrics.projectedSupportMarkerCount, 37);
  assert.equal(first.metrics.distinctOriginCount, 37);
  assert.equal(
    first.metrics.collapsedSourceSupportCount,
    first.metrics.projectedSourceSupportCount - first.metrics.supportAnchorCount,
  );
  assert.equal(first.projection.glyphOverlays.length, 37);
  assert.equal(first.anchors.length, 37);
  assert.equal(first.decisions.length, canonical.supports.length);
  assert.equal(
    first.anchors.reduce((sum, anchor) => sum + anchor.restraintCount, 0),
    47,
  );
  assert.equal(
    new Set(first.anchors.flatMap((anchor) => anchor.memberSupportIds)).size,
    first.metrics.projectedSourceSupportCount,
  );
  assert.ok(first.anchors.every((anchor) => anchor.representativeSupportId));
  assert.ok(first.anchors.every((anchor) => anchor.memberSupportIds.length >= 1));
  assert.ok(first.anchors.every((anchor) => anchor.restraintTypes.length >= 1));
  assert.equal(
    first.overlays.flatMap((row) => row.restraints || [])
      .flatMap((row) => row.diagnostics || [])
      .filter((row) => row.code === 'HOST_OUTSIDE_DIAMETER_MISSING').length,
    0,
  );
});
