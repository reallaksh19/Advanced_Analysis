import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanonicalFlangeHubGeometry } from '../src/core/bucket-b/flange-hub-geometry.js';
import { createFlangeHubMesh } from '../src/core/bucket-b/flange-hub-mesh.js';
import {
  FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
  FLANGE_HUB_TRANSITION_CANDIDATE_POLICY,
  createFlangeHubTransitionCandidateMesh,
} from '../src/core/bucket-b/flange-hub-transition-candidate.js';

test('BB-11 C1 transition candidate is conforming and deterministic', () => {
  const geometry = createCanonicalFlangeHubGeometry();
  const productionBefore = createFlangeHubMesh('M0', geometry);
  const candidateA = createFlangeHubTransitionCandidateMesh('M0', geometry);
  const candidateB = createFlangeHubTransitionCandidateMesh('M0', geometry);
  const productionAfter = createFlangeHubMesh('M0', geometry);

  assert.equal(
    candidateA.meshFamilyId,
    FLANGE_HUB_TRANSITION_CANDIDATE_FAMILY_ID,
  );
  assert.ok(candidateA.nodeCount < productionBefore.nodeCount);
  assert.equal(
    candidateA.nodeCount,
    productionBefore.nodeCount
      - candidateA.candidateMetadata.mergedInterfaceNodeCount,
  );
  assert.ok(candidateA.candidateMetadata.mergedInterfaceNodeCount > 0);
  assert.equal(candidateA.elementCount, productionBefore.elementCount);
  assert.equal(candidateA.quality.accepted, true);
  assert.equal(
    candidateA.candidateMetadata.interfaceEvidence.allConforming,
    true,
  );
  assert.equal(
    candidateA.candidateMetadata.interfaceEvidence.hangingNodeCount,
    0,
  );
  candidateA.candidateMetadata.interfaceEvidence.interfaces.forEach(
    (row) => {
      assert.equal(row.expectedNodeCount, 17);
      assert.equal(row.leftNodeCount, 17);
      assert.equal(row.rightNodeCount, 17);
      assert.equal(row.sharedNodeIdSetsIdentical, true);
      assert.equal(row.coordinateSetsIdentical, true);
    },
  );

  const b04 = candidateA.blocks.find((row) => row.blockId === 'FH-B04');
  assert.equal(b04.kind, 'GRADING_TRANSITION');
  assert.equal(b04.longitudinalElementCount, 2);
  assert.equal(b04.transverseElementCount, 8);

  const probeMatches = candidateA.nodes.filter((node) => (
    Math.hypot(node.r - 62.75, node.z - 30) <= 1e-12
  ));
  assert.equal(probeMatches.length, 1);
  assert.equal(
    candidateA.candidateMetadata.probeEvidence.positiveZBlockId,
    'FH-B04',
  );
  assert.equal(
    candidateA.candidateMetadata.probeEvidence
      .positiveZOwnershipVerified,
    true,
  );

  assert.equal(candidateA.semanticHash, candidateB.semanticHash);
  assert.equal(candidateA.meshHash, candidateB.meshHash);
  assert.notEqual(candidateA.meshHash, productionBefore.meshHash);
  assert.equal(productionBefore.semanticHash, productionAfter.semanticHash);
  assert.equal(
    candidateA.candidateMetadata.productionMeshHash,
    productionBefore.meshHash,
  );
  assert.equal(
    FLANGE_HUB_TRANSITION_CANDIDATE_POLICY.connectivityModified,
    true,
  );
  assert.equal(
    FLANGE_HUB_TRANSITION_CANDIDATE_POLICY
      .frozenConvergencePolicyModified,
    false,
  );
  assert.equal(
    FLANGE_HUB_TRANSITION_CANDIDATE_POLICY.productionMeshSelected,
    false,
  );
  assert.equal(
    FLANGE_HUB_TRANSITION_CANDIDATE_POLICY.bb12Authorized,
    false,
  );
});
