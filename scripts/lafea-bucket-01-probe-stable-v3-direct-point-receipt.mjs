#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
  evaluateLafeaBucket01FixedPhysicalProbe,
} from '../src/workspace/lafea-bucket-01-fixed-probe.js';
import {
  LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION,
  LAFEA_BUCKET_01_CANDIDATE_STRESS_INPUT_SCHEMA,
  evaluateLafeaBucket01CandidateStress,
} from '../src/workspace/lafea-bucket-01-candidate-stress.js';
import {
  buildLafeaBucket01CandidateV3Bundle,
} from '../src/workspace/lafea-bucket-01-candidate-v3-bundle.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_PATH = path.join(ROOT,
  'validation/bucket-01/13-probe-stable-polar-mesh-design.json');
const PROBE_SPEC_PATH = path.join(ROOT,
  'validation/bucket-01/08-production-lug-fixed-probe-spec.json');
const RESPONSE_SPEC_PATH = path.join(ROOT,
  'validation/bucket-01/06-production-response-convergence-spec.json');
const PROJECTION_PATH = outputPath(
  'LAFEA_BUCKET_01_CANDIDATE_PROJECTION_PATH',
  'reports/qualification/lafea-bucket-01-candidate-v3-projection.json',
);
const EXECUTION_PATH = outputPath(
  'LAFEA_BUCKET_01_CANDIDATE_EXECUTION_PATH',
  'reports/qualification/lafea-bucket-01-candidate-v3-execution.json',
);
const REPORT_PATH = outputPath(
  'LAFEA_BUCKET_01_CANDIDATE_STRESS_PATH',
  'reports/qualification/lafea-bucket-01-candidate-v3-stress.json',
);
const exactHeadSha = gitHead();
const expectedHeadSha = process.env.EXPECTED_HEAD_SHA?.trim() || exactHeadSha;
const design = readJson(DESIGN_PATH);
const probeSpec = readJson(PROBE_SPEC_PATH);
const responseSpec = readJson(RESPONSE_SPEC_PATH);
const partial = { locationRecords: [], reasons: [] };
let receipt;
try {
  if (exactHeadSha !== expectedHeadSha) {
    throw new Error(`EXACT_HEAD_MISMATCH:${expectedHeadSha}:${exactHeadSha}`);
  }
  receipt = executeReceipt();
} catch (error) {
  partial.reasons.push(error?.code ?? error?.message
    ?? 'UNEXPECTED_CANDIDATE_STRESS_FAILURE');
  receipt = blockedReceipt();
}
writeJson(REPORT_PATH, receipt);
console.log(JSON.stringify(receipt));
if (receipt.status !== 'PASS') process.exit(1);

function executeReceipt() {
  const projection = readRequiredReport(PROJECTION_PATH);
  const execution = readRequiredReport(EXECUTION_PATH);
  const bundle = buildLafeaBucket01CandidateV3Bundle({
    exactHeadSha,
    design,
    probeSpec,
  });
  assertParents(projection, execution, bundle);
  const locations = fixedLocations();
  const stressInputLocations = locations.map((definition) => {
    const probeEvidence = [];
    const observations = [];
    const topologySignatures = [];
    const hValues = [];
    for (let levelIndex = 0; levelIndex < 4; levelIndex += 1) {
      const projectionLevel = projection.levels[levelIndex];
      const result = acceptedResult(
        execution.controllerResult.levelResults[levelIndex],
        levelIndex + 1,
      );
      const evidence = evaluateLafeaBucket01FixedPhysicalProbe({
        schema: LAFEA_BUCKET_01_FIXED_PROBE_INPUT_SCHEMA,
        meshEvidence: projectionLevel.meshEvidence,
        material: {
          elasticModulus: responseSpec.material.elasticModulus,
          poissonRatio: responseSpec.material.poissonRatio,
        },
        displacementByNodeId: displacementMap(result.displacements),
        location: { x: definition.x, y: definition.y },
        component: definition.component,
        loadCaseId: probeSpec.loadCaseId,
        units: definition.units,
      });
      if (!evidence || typeof evidence.semanticHash !== 'string') {
        throw new Error(
          `FIXED_PROBE_EVIDENCE_INVALID:${definition.locationId}:L${levelIndex + 1}`,
        );
      }
      const topology = bundle.locationHistories
        .find((row) => row.probeId === definition.locationId)
        ?.observations[levelIndex];
      if (!topology) {
        throw new Error(
          `CANDIDATE_TOPOLOGY_MISSING:${definition.locationId}:L${levelIndex + 1}`,
        );
      }
      probeEvidence.push(evidence);
      observations.push(recoveredScalar(evidence));
      topologySignatures.push(topology.topologySignature);
      hValues.push(localCharacteristicH(
        bundle.packages[levelIndex],
        definition,
      ));
    }
    const locationDefinitionHash = canonicalLafeaSha256({
      schema: 'lafea-bucket-01-candidate-fixed-location/v1',
      locationId: definition.locationId,
      x: definition.x,
      y: definition.y,
      radius: definition.radius,
      angleDegrees: definition.angleDegrees,
      component: definition.component,
      units: definition.units,
      zone: definition.zone,
    });
    partial.locationRecords.push({
      ...definition,
      locationDefinitionHash,
      hValues,
      observations,
      topologySignatures,
      probeEvidenceHashes: probeEvidence.map((row) => row.semanticHash),
      probeEvidence,
    });
    return {
      locationId: definition.locationId,
      locationDefinitionHash,
      component: definition.component,
      units: definition.units,
      zone: definition.zone,
      radius: definition.radius,
      angleDegrees: definition.angleDegrees,
      hValues,
      observations,
      topologySignatures,
      probeEvidenceHashes: probeEvidence.map((row) => row.semanticHash),
    };
  });
  const stressEvidence = evaluateLafeaBucket01CandidateStress({
    schema: LAFEA_BUCKET_01_CANDIDATE_STRESS_INPUT_SCHEMA,
    exactHeadSha,
    designHash: bundle.designHash,
    probeSpecHash: canonicalLafeaSha256(probeSpec),
    localCharacteristicHDefinition:
      LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION,
    locations: stressInputLocations,
    tolerances: {
      highGradientGciMax: probeSpec.tolerances.highGradientGciMax,
      nonSingularGciMax: probeSpec.tolerances.nonSingularGciMax,
      minimumObservedOrder: probeSpec.tolerances.minimumObservedOrder,
      asymptoticRatioBounds: probeSpec.tolerances.asymptoticRatioBounds,
    },
  });
  return {
    schema: 'lafea-bucket-01-probe-stable-v3-direct-point-receipt/v1',
    status: stressEvidence.status,
    exactHeadSha,
    designId: design.designId,
    designHash: bundle.designHash,
    probeSpecHash: canonicalLafeaSha256(probeSpec),
    responseSpecHash: canonicalLafeaSha256(responseSpec),
    projectionHash: projection.projectionHash,
    executionHash: execution.executionHash,
    candidateIntakeEvidenceHash: bundle.intakeEvidence.semanticHash,
    localCharacteristicHDefinition:
      LAFEA_BUCKET_01_CANDIDATE_LOCAL_H_DEFINITION,
    locationRecords: partial.locationRecords,
    stressEvidence,
    blockingLocationIds: stressEvidence.blockingLocationIds,
    reasons: stressEvidence.reasons,
    authority: receiptAuthority(true),
  };
}

function assertParents(projection, execution, bundle) {
  if (projection.exactHeadSha !== exactHeadSha
    || execution.exactHeadSha !== exactHeadSha
    || projection.designHash !== bundle.designHash
    || execution.designHash !== bundle.designHash
    || projection.candidateIntakeEvidenceHash
      !== bundle.intakeEvidence.semanticHash
    || execution.candidateIntakeEvidenceHash
      !== bundle.intakeEvidence.semanticHash
    || execution.projectionHash !== projection.projectionHash
    || execution.accepted !== true
    || execution.controllerResult?.accepted !== true
    || projection.levels?.length !== 4
    || execution.controllerResult?.levelResults?.length !== 4) {
    throw new Error('CANDIDATE_STRESS_PARENT_CUSTODY_INVALID');
  }
}

function fixedLocations() {
  return [
    ...probeSpec.probes.map((probe) => ({
      locationId: probe.probeId,
      x: probe.x,
      y: probe.y,
      radius: probe.radius,
      angleDegrees: probe.angleDegrees,
      component: probe.component,
      units: probe.units,
      zone: probe.zone,
    })),
    ...probeSpec.paths.flatMap((pathValue) =>
      pathValue.stations.map((station) => ({
        locationId: `${pathValue.pathId}:${station.stationId}`,
        x: station.x,
        y: station.y,
        radius: station.radius,
        angleDegrees: pathValue.angleDegrees,
        component: pathValue.component,
        units: pathValue.units,
        zone: station.zone,
      }))),
  ];
}

function localCharacteristicH(packageValue, definition) {
  const radialCell = packageValue.spec.radialAxis.anchorCells.find(
    (row) => Math.abs(row.anchorValue - definition.radius) <= 1e-12,
  );
  const angularCell = packageValue.spec.circumferentialAxis.anchorCells.find(
    (row) => Math.abs(row.anchorValue - definition.angleDegrees) <= 1e-12,
  );
  if (!radialCell || !angularCell) {
    throw new Error(`LOCAL_H_ANCHOR_MISSING:${definition.locationId}`);
  }
  const value = Math.sqrt(
    radialCell.width
      * definition.radius
      * angularCell.width * Math.PI / 180,
  );
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new Error(`LOCAL_H_INVALID:${definition.locationId}`);
  }
  return value;
}

function recoveredScalar(evidence) {
  const candidates = [
    evidence.value,
    evidence.componentValue,
    evidence.stressValue,
    evidence.recoveredValue,
    evidence.scalarValue,
    evidence.stress?.value,
    evidence.recovery?.value,
    evidence.result?.value,
  ].filter((value) => typeof value === 'number' && Number.isFinite(value));
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) {
    throw new Error(`FIXED_PROBE_SCALAR_NOT_UNIQUE:${evidence.semanticHash}`);
  }
  return unique[0];
}

function displacementMap(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('CANDIDATE_DISPLACEMENTS_MISSING');
  }
  return Object.fromEntries(rows.map((row) => [row.nodeId, {
    ux: row.ux,
    uy: row.uy,
  }]));
}

function acceptedResult(levelResult, ordinal) {
  const result = levelResult?.result;
  if (!result || result.status !== 'ACCEPTED'
    || result.solver?.accepted !== true
    || !Array.isArray(result.displacements)) {
    throw new Error(`CANDIDATE_RESULT_NOT_ACCEPTED:L${ordinal}`);
  }
  return result;
}

function blockedReceipt() {
  return {
    schema: 'lafea-bucket-01-probe-stable-v3-direct-point-receipt/v1',
    status: 'BLOCKED',
    exactHeadSha,
    designId: design.designId,
    designHash: canonicalLafeaSha256(design),
    probeSpecHash: canonicalLafeaSha256(probeSpec),
    responseSpecHash: canonicalLafeaSha256(responseSpec),
    projectionPath: fs.existsSync(PROJECTION_PATH)
      ? path.relative(ROOT, PROJECTION_PATH) : null,
    executionPath: fs.existsSync(EXECUTION_PATH)
      ? path.relative(ROOT, EXECUTION_PATH) : null,
    locationRecords: partial.locationRecords,
    reasons: partial.reasons,
    authority: receiptAuthority(partial.locationRecords.length > 0),
  };
}

function receiptAuthority(executed) {
  return {
    candidateOnly: true,
    directT6PointRecoveryExecuted: executed,
    actualLocalCharacteristicHUsed: executed,
    topologyCompatibilityEvaluated: executed,
    independentCheckerExecution: false,
    productionSwitchAuthorized: false,
    productionSwitchApplied: false,
    productionMeshAuthority: false,
    stressAcceptanceAuthority: false,
    qualificationAuthority: false,
    bucketQualified: false,
  };
}

function outputPath(environmentKey, fallback) {
  return path.resolve(ROOT, process.env[environmentKey] ?? fallback);
}
function readJson(absolute) {
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}
function readRequiredReport(absolute) {
  if (!fs.existsSync(absolute)) {
    throw new Error(`MISSING_REQUIRED_REPORT:${path.relative(ROOT, absolute)}`);
  }
  return readJson(absolute);
}
function writeJson(absolute, value) {
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.error) {
    throw new Error(result.stderr?.trim()
      || result.error?.message
      || 'git rev-parse HEAD failed');
  }
  return result.stdout.trim();
}
