import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  firstHash,
  receipt,
  writeHashedJson,
} from './lafea-bucket-01-controlled-replay-support.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function materializeReferenceRoot({
  routeId,
  exactHeadSha,
  designHash,
  namespace,
  projection,
}) {
  const elementCounts = (projection.levels ?? []).map(
    (row) => row.meshEvidence?.mesh?.elements?.length ?? 0,
  );
  const root = writeHashedJson(ROOT, namespace, 'reference-mesh-ladder.json', {
    schema: 'lafea-bucket-01-controlled-replay-reference-mesh-ladder/v1',
    producerRevision: 'B01-CONTROLLED-REFERENCE-ROOT.1',
    routeId,
    routeKind: 'REFERENCE',
    exactHeadSha,
    designHash,
    elementCounts,
    projectionHash: firstHash(
      projection.projectionHash,
      canonicalLafeaSha256(projection),
    ),
    status: JSON.stringify(elementCounts) === JSON.stringify([64, 256, 1024, 4096])
      ? 'PASS' : 'BLOCKED',
    reasons: JSON.stringify(elementCounts) === JSON.stringify([64, 256, 1024, 4096])
      ? [] : ['REFERENCE_MESH_LADDER_INVALID'],
  });
  return receipt(ROOT, {
    artifactId: `${routeId}:REFERENCE_MESH_LADDER:GLOBAL`,
    artifactKind: 'REFERENCE_MESH_LADDER',
    artifactScope: 'REFERENCE_MESH_BOUND',
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: [],
    relativePath: root.relativePath,
  });
}

export function materializeGlobalArtifacts({
  routeKind,
  routeId,
  exactHeadSha,
  designHash,
  namespace,
  paths,
  projection,
  response,
  stress,
  kirsch,
  exactHead,
  levelArtifacts,
  independent,
  stageRecords,
}) {
  const scope = routeKind === 'CANDIDATE'
    ? 'CANDIDATE_MESH_BOUND' : 'REFERENCE_MESH_BOUND';
  const executionParents = levelArtifacts.executionReceipts.map(
    (row) => row.semanticHash,
  );
  const meshParents = levelArtifacts.receipts
    .filter((row) => row.artifactKind === 'ANALYSIS_MESH_EVIDENCE')
    .map((row) => row.semanticHash);
  const responseReceipt = receipt(ROOT, {
    artifactId: `${routeId}:RESPONSE_EVIDENCE:GLOBAL`,
    artifactKind: 'RESPONSE_EVIDENCE',
    artifactScope: scope,
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: executionParents,
    relativePath: paths.response,
  });
  const stressReceipt = receipt(ROOT, {
    artifactId: `${routeId}:PRODUCTION_STRESS_EVIDENCE:GLOBAL`,
    artifactKind: 'PRODUCTION_STRESS_EVIDENCE',
    artifactScope: scope,
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: executionParents,
    relativePath: paths.stress,
  });
  const topologyBase = {
    schema: 'lafea-bucket-01-controlled-replay-topology-audit/v1',
    producerRevision: 'B01-CONTROLLED-REPLAY-TOPOLOGY.1',
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    sourceEvidenceHash: routeKind === 'CANDIDATE'
      ? independent.evidence.semanticHash
      : firstHash(stress.evidenceHash, stress.semanticHash, canonicalLafeaSha256(stress)),
    allLocationsPass: routeKind === 'CANDIDATE'
      ? independent.evidence.status === 'PASS'
      : productionTopologyPass(stress),
    status: routeKind === 'CANDIDATE'
      ? independent.evidence.status
      : productionTopologyPass(stress) ? 'PASS' : 'BLOCKED',
    reasons: routeKind === 'CANDIDATE'
      ? independent.evidence.reasons
      : productionTopologyPass(stress) ? [] : ['PRODUCTION_TOPOLOGY_AUDIT_BLOCKED'],
  };
  const topology = writeHashedJson(
    ROOT,
    namespace,
    'topology-audit.json',
    topologyBase,
  );
  const topologyReceipt = receipt(ROOT, {
    artifactId: `${routeId}:TOPOLOGY_AUDIT_EVIDENCE:GLOBAL`,
    artifactKind: 'TOPOLOGY_AUDIT_EVIDENCE',
    artifactScope: scope,
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: meshParents,
    relativePath: topology.relativePath,
  });
  const allLocationsPass = routeKind === 'CANDIDATE'
    ? response.status === 'PASS' && stress.status === 'PASS'
    : stress.status === 'PASS';
  const convergence = writeHashedJson(
    ROOT,
    namespace,
    'stress-convergence.json',
    {
      schema: 'lafea-bucket-01-controlled-replay-convergence/v1',
      producerRevision: 'B01-CONTROLLED-REPLAY-CONVERGENCE.1',
      routeId,
      routeKind,
      exactHeadSha,
      designHash,
      responseEvidenceHash: responseReceipt.semanticHash,
      stressEvidenceHash: stressReceipt.semanticHash,
      allLocationsPass,
      status: allLocationsPass ? 'PASS' : 'BLOCKED',
      reasons: allLocationsPass ? [] : ['CONTROLLED_REPLAY_STRESS_CONVERGENCE_BLOCKED'],
    },
  );
  const convergenceReceipt = receipt(ROOT, {
    artifactId: `${routeId}:CONVERGENCE_EVIDENCE:GLOBAL`,
    artifactKind: 'CONVERGENCE_EVIDENCE',
    artifactScope: scope,
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: executionParents,
    relativePath: convergence.relativePath,
  });
  const kirschReceipt = receipt(ROOT, {
    artifactId: `${routeId}:KIRSCH_EVIDENCE:GLOBAL`,
    artifactKind: 'KIRSCH_EVIDENCE',
    artifactScope: 'REPOSITORY_REGRESSION',
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: [],
    relativePath: paths.kirsch,
  });
  const repositoryReceipt = receipt(ROOT, {
    artifactId: `${routeId}:REPOSITORY_GATE_REPORT:GLOBAL`,
    artifactKind: 'REPOSITORY_GATE_REPORT',
    artifactScope: 'REPOSITORY_REGRESSION',
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: [],
    relativePath: paths.exactHead,
  });
  const summaryPath = `${namespace}/controlled-replay-stage-summary.log`;
  fs.writeFileSync(
    path.resolve(ROOT, summaryPath),
    `${JSON.stringify({ routeId, routeKind, exactHeadSha, stageRecords })}\n`,
    'utf8',
  );
  const errorPath = `${namespace}/controlled-replay-stage-errors.log`;
  fs.writeFileSync(
    path.resolve(ROOT, errorPath),
    stageRecords.filter((row) => row.status !== 'PASS')
      .map((row) => `${row.script}:${row.exitCode}:${row.error ?? ''}`)
      .join('\n'),
    'utf8',
  );
  const stdoutReceipt = receipt(ROOT, {
    artifactId: `${routeId}:STDOUT_LOG:GLOBAL`,
    artifactKind: 'STDOUT_LOG',
    artifactScope: 'EXECUTION_ENVIRONMENT',
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: [],
    relativePath: summaryPath,
  });
  const stderrReceipt = receipt(ROOT, {
    artifactId: `${routeId}:STDERR_LOG:GLOBAL`,
    artifactKind: 'STDERR_LOG',
    artifactScope: 'EXECUTION_ENVIRONMENT',
    routeId,
    levelOrdinal: null,
    exactHeadSha,
    designHash,
    parentArtifactHashes: [],
    relativePath: errorPath,
  });
  return [
    responseReceipt,
    kirschReceipt,
    stressReceipt,
    topologyReceipt,
    convergenceReceipt,
    repositoryReceipt,
    stdoutReceipt,
    stderrReceipt,
  ];
}

function productionTopologyPass(stress) {
  const rows = [
    ...(stress.standaloneProbeReceipts ?? []),
    ...(stress.pathReceipts ?? []).flatMap((row) => row.stationReceipts ?? []),
  ];
  return rows.length > 0
    && rows.every((row) => row.topologyAudit?.status === 'PASS');
}
