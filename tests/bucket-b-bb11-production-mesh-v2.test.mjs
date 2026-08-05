import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalFlangeHubGeometry } from '../src/core/bucket-b/flange-hub-geometry.js';
import {
  createFlangeHubMesh,
  FLANGE_HUB_MESH_FAMILY_ID,
  FLANGE_HUB_MESH_LEVELS,
  FLANGE_HUB_MESH_V2_POLICY,
} from '../src/core/bucket-b/flange-hub-mesh-v2.js';

test('BB-11 production mesh V2 is deterministic and conforming', () => {
  const geometry = createCanonicalFlangeHubGeometry();
  for (const { levelId } of FLANGE_HUB_MESH_LEVELS.slice(0, 2)) {
    const first = createFlangeHubMesh(levelId, geometry);
    const second = createFlangeHubMesh(levelId, geometry);
    assert.equal(first.meshFamilyId, FLANGE_HUB_MESH_FAMILY_ID);
    assert.equal(first.meshHash, second.meshHash);
    assert.equal(first.canonicalModelHash, second.canonicalModelHash);
    assert.equal(first.quality.accepted, true);
    assert.equal(first.duplicateInterfaceNodes.length, 0);
    assert.equal(first.meshV2Metadata.interfaceEvidence.allConforming, true);
    assert.equal(first.meshV2Metadata.interfaceEvidence.hangingNodeCount, 0);
    assert.equal(first.meshV2Metadata.probeEvidence.positiveZOwnershipVerified, true);
  }
  assert.equal(
    FLANGE_HUB_MESH_V2_POLICY.authority,
    'GOVERNED_PRODUCTION_MESH_PENDING_EXACT_HEAD',
  );
  assert.equal(FLANGE_HUB_MESH_V2_POLICY.grantsMergeAuthority, false);
  assert.equal(FLANGE_HUB_MESH_V2_POLICY.grantsBb12Authority, false);
});
