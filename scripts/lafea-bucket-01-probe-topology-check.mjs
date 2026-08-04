#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
  generateLafeaLugPinholeT6Mesh,
} from '../src/core/lafea-meshing/lug-pinhole-t6.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA,
  LAFEA_BUCKET_01_FIXED_PROBE_REVISION,
  observeLafeaBucket01ProbeTopology,
} from '../src/workspace/lafea-bucket-01-fixed-probe.js';
import {
  LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_INPUT_SCHEMA,
  evaluateLafeaBucket01ProbeTopologyAudit,
  validateLafeaBucket01ProbeTopologyAuditEvidence,
} from '../src/workspace/lafea-bucket-01-probe-topology.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exactHeadSha = 'a'.repeat(40);
const locationDefinitionHash = `sha256:${'d'.repeat(64)}`;
const definitions = [
  [1, 2, 16, 0, 3, 'A', 10],
  [2, 4, 32, 1, 7, 'A', 9],
  [3, 8, 64, 3, 15, 'A', 8.5],
  [4, 16, 128, 7, 31, 'A', 8.25],
];
const probes = definitions.map((definition) => probeEvidence(...definition));
const input = {
  schema: LAFEA_BUCKET_01_PROBE_TOPOLOGY_AUDIT_INPUT_SCHEMA,
  exactHeadSha,
  governedLevelOrdinals: [1, 2, 3, 4],
  probeEvidences: probes,
  minimumNaturalMargin: 0.0001,
};
const evidence = evaluateLafeaBucket01ProbeTopologyAudit(input);
assert.equal(evidence.status, 'PASS');
assert.equal(evidence.levels.length, 4);
assert.equal(evidence.transitions.length, 3);
assert.equal(evidence.transitions.every((row) => row.compatible), true);
assert.equal(evidence.diagnosis.genuineStressFieldCandidate, true);
assert.equal(evidence.diagnosis.stressSequenceClassification, 'MONOTONIC');
assert.equal(
  validateLafeaBucket01ProbeTopologyAuditEvidence(evidence, probes).ok,
  true,
);

const sideChanged = [...probes];
sideChanged[2] = probeEvidence(3, 8, 64, 3, 15, 'B', 8.5);
const sideEvidence = evaluateLafeaBucket01ProbeTopologyAudit({
  ...input,
  probeEvidences: sideChanged,
});
assert.equal(sideEvidence.status, 'BLOCKED');
assert.equal(sideEvidence.diagnosis.triangleSideMovement, true);
assert.ok(sideEvidence.reasons.some((row) =>
  row.endsWith('TOPOLOGY_SIGNATURE_CHANGED')));

const sectorMoved = [...probes];
sectorMoved[2] = probeEvidence(3, 8, 64, 3, 16, 'A', 8.5);
const sectorEvidence = evaluateLafeaBucket01ProbeTopologyAudit({
  ...input,
  probeEvidences: sectorMoved,
});
assert.equal(sectorEvidence.status, 'BLOCKED');
assert.equal(sectorEvidence.diagnosis.circumferentialCellPhaseMovement, true);
assert.ok(sectorEvidence.reasons.some((row) =>
  row.endsWith('CIRCUMFERENTIAL_PARENT_MISMATCH')));

const edgeNear = [...probes];
edgeNear[3] = probeEvidence(4, 16, 128, 7, 31, 'A', 8.25, 0.00001);
const edgeEvidence = evaluateLafeaBucket01ProbeTopologyAudit({
  ...input,
  probeEvidences: edgeNear,
});
assert.equal(edgeEvidence.status, 'BLOCKED');
assert.equal(edgeEvidence.diagnosis.edgeProximity, true);
assert.ok(edgeEvidence.reasons.includes('LEVEL_4_NATURAL_MARGIN_BELOW_MINIMUM'));

verifyGovernedParentCellLineage();
verifyProductionReceiptRetainsGovernedFailures();

console.log('Bucket-01 governed probe-topology audit checks passed.');

function verifyGovernedParentCellLineage() {
  const radius = 27;
  const angleRadians = 17 * Math.PI / 180;
  const point = {
    probeId: 'LINEAGE-PROBE',
    x: radius * Math.cos(angleRadians),
    y: radius * Math.sin(angleRadians),
  };
  for (const [radialDivisions, circumferentialDivisions] of [
    [2, 16], [4, 32], [8, 64], [16, 128],
  ]) {
    const meshPackage = generateLafeaLugPinholeT6Mesh({
      schema: LAFEA_LUG_PINHOLE_T6_MESH_SPEC_SCHEMA,
      meshIdentity: `LINEAGE-${radialDivisions}-${circumferentialDivisions}`,
      center: { x: 0, y: 0 },
      holeRadius: 20,
      outerRadius: 100,
      radialDivisions,
      circumferentialDivisions,
      startAngleDegrees: 0,
    });
    const observation = observeLafeaBucket01ProbeTopology(
      meshPackage.mesh,
      point,
    );
    const expected = [];
    let radial = radialDivisions;
    let circumferential = circumferentialDivisions;
    while (true) {
      expected.push([radial, circumferential]);
      if (radial <= 2 || circumferential <= 16) break;
      radial /= 2;
      circumferential /= 2;
    }
    assert.deepEqual(
      observation.meshTopology.parentCellLineage.map((row) => [
        row.radialDivisions,
        row.circumferentialDivisions,
      ]),
      expected,
    );
    assert.equal(
      observation.meshTopology.parentCellLineage.some((row) =>
        row.radialDivisions === 1 || row.circumferentialDivisions === 8),
      false,
    );
  }
}

function verifyProductionReceiptRetainsGovernedFailures() {
  const receiptSource = fs.readFileSync(
    path.join(ROOT, 'scripts/lafea-bucket-01-production-lug-probe-receipt.mjs'),
    'utf8',
  );
  assert.equal(
    receiptSource.includes(
      'assert.equal(evidence.meshTopology.metadataAvailable, true);',
    ),
    false,
  );
  assert.equal(
    receiptSource.includes(
      'evidence.minimumNaturalMargin\n        >= spec.tolerances.naturalCoordinateMarginMin',
    ),
    false,
  );
  assert.match(
    receiptSource,
    /governedAcceptanceFailuresRetainedBeforeExit:\s*true/u,
  );
  assert.match(
    receiptSource,
    /RECOVERY_LEVEL_\$\{level\.ordinal\}_MAPPING_RESIDUAL_EXCEEDED/u,
  );
  const auditIndex = receiptSource.indexOf(
    'const topologyAudit = evaluateLafeaBucket01ProbeTopologyAudit',
  );
  const statusIndex = receiptSource.indexOf(
    'const status = recoveryReasons.length === 0',
  );
  assert.ok(auditIndex >= 0 && statusIndex > auditIndex);
}

function probeEvidence(ordinal, radialDivisions, circumferentialDivisions,
  ring, sector, side, authoritativeValue, margin = 0.2) {
  const naturalCoordinates = {
    xi: margin,
    eta: 0.3,
    lambda1: 0.7 - margin,
    lambda2: margin,
    lambda3: 0.3,
  };
  const topologySignature = canonicalLafeaSha256({
    schema: 'test-compatible-topology/v1',
    triangleSide: side,
    orientation: 'COUNTER_CLOCKWISE',
  });
  const elementPhaseSignature = canonicalLafeaSha256({
    schema: 'test-element-phase/v1',
    radialDivisions,
    circumferentialDivisions,
    ring,
    sector,
    naturalCoordinates,
  });
  const topologyObservationBase = {
    schema: 'lafea-bucket-01-probe-topology-observation/v1',
    meshIdentity: `M${ordinal}`,
    probeId: 'P1',
    physicalCoordinates: { x: 1, y: 2 },
    elementId: `E-R${ring}-S${sector}-${side}`,
    meshTopology: {
      metadataAvailable: true,
      radialDivisions,
      circumferentialDivisions,
      radialRingIndex: ring,
      circumferentialSectorIndex: sector,
      triangleSide: side,
      orientation: 'COUNTER_CLOCKWISE',
      parentCellLineage: [],
    },
    naturalCoordinates,
    minimumNaturalMargin: Math.min(
      naturalCoordinates.lambda1,
      naturalCoordinates.lambda2,
      naturalCoordinates.lambda3,
    ),
    mappedPhysicalCoordinates: { x: 1, y: 2 },
    mappingResidual: 0,
    jacobianDeterminant: 1,
    signedCornerArea: 0.5,
    localElementSize: 1,
    probeToEdgeDistances: {
      lambda1Zero: 0.2,
      lambda2Zero: 0.3,
      lambda3Zero: 0.4,
    },
    minimumPhysicalEdgeDistance: 0.2,
    topologySignature,
    elementPhaseSignature,
    containmentCandidateCount: 1,
    edgeDistanceMethod: 'EXACT_T6_QUADRATIC_EDGE_STATIONARY_POINT_SEARCH',
    status: 'PASS',
  };
  const topologyObservation = {
    ...topologyObservationBase,
    semanticHash: canonicalLafeaSha256(topologyObservationBase),
  };
  const base = {
    schema: LAFEA_BUCKET_01_FIXED_PROBE_EVIDENCE_SCHEMA,
    producerRevision: LAFEA_BUCKET_01_FIXED_PROBE_REVISION,
    exactHeadSha,
    probe: {
      probeId: 'P1',
      loadCaseId: 'LC1',
      x: 1,
      y: 2,
      component: 'SIGMA_X',
      units: 'MPa',
      locationDefinitionHash,
    },
    elementId: topologyObservation.elementId,
    naturalCoordinates,
    minimumNaturalMargin: topologyObservation.minimumNaturalMargin,
    jacobianDeterminant: 1,
    localElementSize: 1,
    probeToEdgeDistances: topologyObservation.probeToEdgeDistances,
    minimumPhysicalEdgeDistance: 0.2,
    topologySignature,
    elementPhaseSignature,
    topologyObservationHash: topologyObservation.semanticHash,
    topologyObservation,
    authoritativeValue,
    status: 'PASS',
  };
  return Object.freeze({ ...base, semanticHash: canonicalLafeaSha256(base) });
}
