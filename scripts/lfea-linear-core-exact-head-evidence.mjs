#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { conditionGeometry } from '../src/core/centerline-beam-fea/index.js';
import { compileSolverExecution } from '../src/core/linear-fea-solver/index.js';
import {
  cantileverCompilation,
  elementContributions,
  solverProfile,
  tipLoadCase,
} from './lfea-b3.3-solver-fixtures.mjs';

const OUTPUT_DIR = path.resolve('artifacts/lfea-linear-core-exact-head');
const EVIDENCE_SCHEMA = 'lfea-linear-core-exact-head-evidence/v1';
const CANDIDATE_SHA = process.env.GITHUB_SHA ?? 'LOCAL_UNBOUND';

const stationEvidence = retainedStationEvidence();
const solveEvidence = numericalSolveEvidence();
const draft = {
  schema: EVIDENCE_SCHEMA,
  candidateSha: CANDIDATE_SHA,
  equationChanges: [],
  units: {
    conditionedGeometryLength: 'm',
    stationFraction: 'dimensionless',
    displacement: 'm_or_rad_by_dof',
    reaction: 'N_or_Nm_by_dof',
  },
  retainedStationEvidence: stationEvidence.summary,
  toleranceSensitivity: stationEvidence.toleranceSensitivity,
  solverEvidence: solveEvidence,
};
const canonical = JSON.stringify(draft);
const evidence = {
  ...draft,
  evidenceSha256: createHash('sha256').update(canonical).digest('hex'),
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'evidence.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
  'utf8',
);
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'station-custody.csv'),
  stationEvidence.csv,
  'utf8',
);

console.log(JSON.stringify(evidence, null, 2));
console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_DIR)}/evidence.json`);
console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_DIR)}/station-custody.csv`);

function retainedStationEvidence() {
  const geometry = {
    schemaVersion: 'canonical-geometry-v1',
    source: 'LFEA_LINEAR_CORE_EXACT_HEAD_EVIDENCE',
    unit: 'm',
    diagnostics: [],
    summary: {},
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, restraint: 'FREE', meta: {} },
      { id: 'N2', x: 1, y: 0, z: 0, restraint: 'FREE', meta: {} },
    ],
    segments: [
      { id: 'S1', startNodeId: 'N1', endNodeId: 'N2', type: 'PIPE', length: 1 },
    ],
  };
  const points = [
    { attachmentPointId: 'END-I', segmentId: 'S1', fraction: 0, kind: 'EQUIPMENT_NOZZLE' },
    { attachmentPointId: 'GUIDE-A', segmentId: 'S1', fraction: 0.5, kind: 'GUIDE' },
    { attachmentPointId: 'REPORT-B', segmentId: 'S1', fraction: 0.5, kind: 'ATTACHMENT_LOAD_EXTRACTION' },
    { attachmentPointId: 'END-J', segmentId: 'S1', fraction: 1, kind: 'EQUIPMENT_NOZZLE' },
  ];
  const profile = {
    spanSeedingLimit: { value: 10, source: 'LFEA_LINEAR_CORE_EXACT_HEAD_EVIDENCE' },
    bendSeedingSegments: { value: 4, source: 'LFEA_LINEAR_CORE_EXACT_HEAD_EVIDENCE' },
    bendLengthErrorLimit: { value: 0.05, source: 'LFEA_LINEAR_CORE_EXACT_HEAD_EVIDENCE' },
  };
  const result = conditionGeometry(geometry, points, profile);
  const replay = conditionGeometry(result.geometry, points, profile);
  const insertedById = new Map(result.report.attachmentPointsInserted.map((row) => [row.attachmentPointId, row]));
  const pointById = new Map(points.map((row) => [row.attachmentPointId, row]));
  const nodeById = new Map(result.geometry.nodes.map((row) => [row.id, row]));
  const rows = [...pointById.keys()].sort(asciiCompare).map((attachmentPointId) => {
    const point = pointById.get(attachmentPointId);
    const inserted = insertedById.get(attachmentPointId);
    const node = nodeById.get(inserted.nodeId);
    return {
      attachmentPointId,
      kind: point.kind,
      segmentId: point.segmentId,
      fraction: point.fraction,
      nodeId: node.id,
      x: node.x,
      y: node.y,
      z: node.z,
      custodyCount: node.meta.attachmentPoints.length,
      custodyIds: node.meta.attachmentPoints.map((entry) => entry.attachmentPointId).join('|'),
    };
  });
  const coincidentNodeIds = rows
    .filter((row) => row.fraction === 0.5)
    .map((row) => row.nodeId);
  const zeroLengthSegmentCount = result.geometry.segments
    .filter((segment) => segment.length === 0)
    .length;
  assert.equal(new Set(coincidentNodeIds).size, 1);
  assert.equal(result.geometry.nodes.length, 3);
  assert.equal(result.geometry.segments.length, 2);
  assert.equal(zeroLengthSegmentCount, 0);
  assert.equal(replay.semanticHash, result.semanticHash);
  assert.equal(replay.report.attachmentPointsInserted.length, 0);

  const perturbed = conditionGeometry(geometry, [
    { attachmentPointId: 'PERTURBED-A', segmentId: 'S1', fraction: 0.5, kind: 'ATTACHMENT_LOAD_EXTRACTION' },
    { attachmentPointId: 'PERTURBED-B', segmentId: 'S1', fraction: 0.500000000001, kind: 'ATTACHMENT_LOAD_EXTRACTION' },
  ], profile);
  const perturbedNodeIds = perturbed.report.attachmentPointsInserted.map((row) => row.nodeId);
  assert.equal(new Set(perturbedNodeIds).size, 2);

  return {
    summary: {
      semanticHash: result.semanticHash,
      nodeCount: result.geometry.nodes.length,
      segmentCount: result.geometry.segments.length,
      insertedStationCount: result.report.attachmentPointsInserted.length,
      coincidentCustodyCount: rows.filter((row) => row.fraction === 0.5).length,
      coincidentPhysicalNodeCount: new Set(coincidentNodeIds).size,
      zeroLengthSegmentCount,
      bothBoundaryStationsRetained: rows.some((row) => row.attachmentPointId === 'END-I' && row.nodeId === 'N1')
        && rows.some((row) => row.attachmentPointId === 'END-J' && row.nodeId === 'N2'),
      replaySemanticHashExact: replay.semanticHash === result.semanticHash,
      replayInsertedStationCount: replay.report.attachmentPointsInserted.length,
    },
    toleranceSensitivity: {
      mergeRule: 'EXACT_DECLARED_SEGMENT_FRACTION_EQUALITY_V1',
      geometricToleranceApplied: false,
      perturbation: 1e-12,
      perturbedStationPhysicalNodeCount: new Set(perturbedNodeIds).size,
    },
    csv: toCsv(rows),
  };
}

function numericalSolveEvidence() {
  const compilation = cantileverCompilation();
  const loadCase = tipLoadCase(compilation);
  const execution = compileSolverExecution({
    compilation,
    elementContributions: elementContributions(),
    loadCase,
    solverProfile: solverProfile(),
  });
  assert.equal(execution.status, 'QUALIFIED');
  for (const diagnostic of Object.values(execution.diagnostics)) {
    assert.equal(diagnostic.status, 'PASS');
  }

  const reactionRows = execution.reactions
    .filter((entry) => entry.nodeId === 'N-000120')
    .map((entry) => ({ nodeId: entry.nodeId, dof: entry.dof, value: entry.value }));
  const expected = new Map([
    ['UX', 0],
    ['UY', -1500],
    ['UZ', 900],
    ['RX', -340],
    ['RY', -2160],
    ['RZ', -3600],
  ]);
  const reactionClosure = reactionRows.map((row) => ({
    ...row,
    expected: expected.get(row.dof),
    absoluteDifference: Math.abs(row.value - expected.get(row.dof)),
  }));

  return {
    status: execution.status,
    modelIdentity: execution.modelIdentity,
    modelRevision: execution.modelRevision,
    mechanicalModelSemanticHash: execution.mechanicalModelSemanticHash,
    stiffnessStateHash: execution.stiffnessStateHash,
    physicalLoadCaseHash: execution.physicalLoadCaseHash,
    executionHash: execution.executionHash,
    factorization: execution.factorization,
    diagnostics: execution.diagnostics,
    fixedNodeReactionClosure: reactionClosure,
    maximumReactionAbsoluteDifference: Math.max(...reactionClosure.map((row) => row.absoluteDifference)),
  };
}

function toCsv(rows) {
  const columns = [
    'attachmentPointId',
    'kind',
    'segmentId',
    'fraction',
    'nodeId',
    'x',
    'y',
    'z',
    'custodyCount',
    'custodyIds',
  ];
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
