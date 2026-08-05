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

test('production Sjson projects Topo validator native restraint records only', async () => {
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
    markerSizeMm: 70,
    verticalAxis: 'Z',
  });
  const second = deriveSjsonTopoValidatorSupportProjection({
    canonicalTopology: structuredClone(supportTopology),
    markerSizeMm: 70,
    verticalAxis: 'Z',
  });

  assert.equal(first.authority, 'TOPO_VALIDATOR_NATIVE_RESTRAINT_RECORDS');
  assert.equal(first.groupingAuthority, 'EXACT_SITE_HOST_AND_RESTRAINT_FAMILY');
  assert.equal(first.authorityHash, second.authorityHash);
  assert.deepEqual(first.projection, second.projection);
  assert.equal(first.metrics.rawSupportCount, 139);
  assert.equal(first.metrics.nativeRestraintRecordCount, 47);
  assert.equal(first.metrics.collapsedSourceSupportCount, 92);
  assert.equal(first.metrics.projectedSupportMarkerCount, 47);
  assert.equal(first.metrics.distinctOriginCount, 37);
  assert.equal(first.metrics.resolvedNativeRestraintCount, 36);
  assert.equal(first.metrics.diagnosticNativeRestraintCount, 11);
  assert.equal(first.projection.glyphOverlays.length, 47);
  assert.equal(first.groups.length, 47);
  assert.equal(first.decisions.length, canonical.supports.length);
  assert.equal(
    first.decisions.filter((row) => row.disposition === 'REPRESENTATIVE').length,
    47,
  );
  assert.equal(
    first.decisions.filter((row) => row.disposition === 'COLLAPSED_TO_REPRESENTATIVE').length,
    92,
  );
  assert.equal(
    new Set(first.groups.flatMap((row) => row.memberSupportIds)).size,
    canonical.supports.length,
  );
  assert.ok(first.groups.every((row) => row.representativeSupportId));
  assert.ok(first.groups.every((row) => row.memberSupportIds.length >= 1));
  assert.equal(
    first.overlays.flatMap((row) => row.restraints || [])
      .flatMap((row) => row.diagnostics || [])
      .filter((row) => row.code === 'HOST_OUTSIDE_DIAMETER_MISSING').length,
    0,
  );
});
