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
  const deduplicationEvidence = restraintDeduplicationEvidence(first.overlays);
  console.log(`SJSON_RESTRAINT_DEDUPLICATION_EVIDENCE=${JSON.stringify({
    metrics: first.metrics,
    deduplicationEvidence,
  })}`);

  assert.equal(first.authority, 'TOPO_VALIDATOR_NATIVE_RESTRAINT_RECORDS');
  assert.equal(first.authorityHash, second.authorityHash);
  assert.deepEqual(first.projection, second.projection);
  assert.equal(first.metrics.rawSupportCount, 139);
  assert.equal(first.metrics.nativeRestraintRecordCount, 47);
  assert.equal(first.metrics.excludedSupportCount, 92);
  assert.equal(first.metrics.projectedSupportMarkerCount, 47);
  assert.equal(first.metrics.distinctOriginCount, 37);
  assert.equal(first.projection.glyphOverlays.length, 47);
  assert.equal(first.decisions.length, canonical.supports.length);
  assert.ok(first.decisions.every((row) => row.supportId));
  assert.ok(first.decisions.some((row) => row.disposition === 'EXCLUDE'));
  assert.ok(first.decisions.filter((row) => row.disposition === 'INCLUDE')
    .every((row) => [
      'EXPLICITLY_RESOLVED',
      'TYPE_CLASSIFIED',
      'PARTIALLY_RESOLVED',
    ].includes(row.qualification)));
  assert.equal(
    first.overlays.flatMap((row) => row.restraints || [])
      .flatMap((row) => row.diagnostics || [])
      .filter((row) => row.code === 'HOST_OUTSIDE_DIAMETER_MISSING').length,
    0,
  );
});

function restraintDeduplicationEvidence(overlays) {
  const origin = (point) => [point.x, point.y, point.z]
    .map((value) => Number(value).toFixed(6)).join('|');
  const direction = (vector) => vector
    ? [vector.x, vector.y, vector.z].map((value) => Number(value).toFixed(6)).join('|')
    : 'NONE';
  const records = overlays.flatMap((overlay) => (
    (overlay.restraints || []).map((restraint) => ({ overlay, restraint }))
  ));
  return {
    restraintRows: records.length,
    uniqueSiteFamily: new Set(records.map(({ overlay, restraint }) => (
      `${origin(overlay.origin)}|${restraint.family}`
    ))).size,
    uniqueSiteFamilyDirection: new Set(records.map(({ overlay, restraint }) => (
      `${origin(overlay.origin)}|${restraint.family}|${direction(restraint.direction)}`
    ))).size,
    uniqueSiteDirection: new Set(records.map(({ overlay, restraint }) => (
      `${origin(overlay.origin)}|${direction(restraint.direction)}`
    ))).size,
    uniqueSiteHostFamily: new Set(records.map(({ overlay, restraint }) => (
      `${origin(overlay.origin)}|${overlay.hostEntityId}|${restraint.family}`
    ))).size,
  };
}
