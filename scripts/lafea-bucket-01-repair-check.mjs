#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.resolve(
  ROOT,
  process.env.LAFEA_BUCKET_01_REPAIR_REPORT_PATH
    ?? 'reports/qualification/lafea-bucket-01-repair-check.json',
);

const checkDefinitions = [
  {
    id: 'PRODUCTION_T6_MESH_QUALIFICATION',
    script: 'scripts/lafea-bucket-01-mesh-qualification-check.mjs',
  },
  {
    id: 'GOVERNED_T3_PATCH_RECEIPT',
    script: 'scripts/lafea-bucket-01-t3-patch-check.mjs',
  },
  {
    id: 'GOVERNED_PURE_SHEAR_RECEIPT',
    script: 'scripts/lafea-bucket-01-pure-shear-check.mjs',
  },
  {
    id: 'MANUFACTURED_PURE_BENDING_PANEL',
    script: 'scripts/lafea-bucket-01-pure-bending-panel-check.mjs',
  },
  {
    id: 'THREE_LEVEL_GCI_EVALUATOR',
    script: 'scripts/lafea-bucket-01-convergence-check.mjs',
  },
  {
    id: 'FIXED_PHYSICAL_PROBE_RECOVERY',
    script: 'scripts/lafea-bucket-01-fixed-probe-check.mjs',
  },
  {
    id: 'FIXED_PROBE_STRESS_CONVERGENCE',
    script: 'scripts/lafea-bucket-01-stress-convergence-check.mjs',
  },
];

const checks = checkDefinitions.map((definition) => runNodeCheck(definition));
const failed = checks.filter((check) => check.status !== 'PASS');
const repairChecksPass = failed.length === 0;
const report = {
  schema: 'lafea-bucket-01-repair-check-report/v5',
  status: repairChecksPass ? 'REPAIR_CHECKS_PASS' : 'REPAIR_CHECKS_FAIL',
  bucketId: 'LAFEA-BENCH-B01-CONTINUUM-LUG-PINHOLE',
  target: 'C2D-LUG-PINHOLE -> LAFEA.3',
  checks,
  blockingCheckIds: failed.map((check) => check.id),
  evidenceState: {
    productionMeshQualificationEvidenceGenerated: repairChecksPass,
    governedT3PatchOracleFrozen: true,
    governedT3PatchEvidenceGenerated: repairChecksPass,
    governedPureShearOracleFrozen: true,
    governedPureShearEvidenceGenerated: repairChecksPass,
    manufacturedPanelOracleFrozen: true,
    manufacturedPanelEvidenceGenerated: repairChecksPass,
    productionProbeEvidenceGenerated: false,
    fullIndependentOraclePackageFrozen: false,
    exactHeadRepositoryExecutionProven: false,
  },
  qualificationStates: {
    implemented: true,
    contractVerified: false,
    meshVerified: false,
    solverVerified: false,
    stressVerified: false,
    codeVerified: false,
    integrationVerified: false,
    bucketQualified: false,
  },
  authority: {
    meshQualificationInfrastructureImplemented: repairChecksPass,
    governedT3PatchBenchmarkImplemented: repairChecksPass,
    governedPureShearBenchmarkImplemented: repairChecksPass,
    manufacturedPanelBenchmarkImplemented: repairChecksPass,
    fixedPhysicalProbeInfrastructureImplemented: repairChecksPass,
    asymptoticGciInfrastructureImplemented: repairChecksPass,
    movingMaximumAcceptanceAuthorized: false,
    nodalProjectionAcceptanceAuthorized: false,
    arbitraryGeometryAuthorized: false,
    shellAuthorized: false,
    codeAssessmentAuthorized: false,
    reportAuthority: false,
    releaseQualified: false,
  },
  disposition: repairChecksPass
    ? 'REPAIR_INFRASTRUCTURE_ACCEPTED_BUCKET_NOT_QUALIFIED'
    : 'REPAIR_INFRASTRUCTURE_FAILED_BUCKET_NOT_QUALIFIED',
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report));
if (!repairChecksPass) process.exit(1);

function runNodeCheck(definition) {
  const result = spawnSync(process.execPath, [definition.script], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    id: definition.id,
    command: `${process.execPath} ${definition.script}`,
    status: result.status === 0 && !result.error ? 'PASS' : 'FAIL',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    stdout: result.stdout?.trim() || null,
    stderr: result.stderr?.trim() || null,
    error: result.error?.message ?? null,
  };
}
