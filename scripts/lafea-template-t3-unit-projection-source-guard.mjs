#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? null : process.argv[baseIndex + 1];
if (!base) {
  throw new TypeError(
    'Usage: node scripts/lafea-template-t3-unit-projection-source-guard.mjs --base <sha>',
  );
}

const expected = [
  'scripts/lafea-template-t3-analytical-compiler-check.mjs',
  'scripts/lafea-template-t3-unit-projection-source-guard.mjs',
  'src/core/lafea-application-templates/compilers/analytical/load-reference-transfer.js',
  'src/core/lafea-application-templates/compilers/analytical/pipe-section-combined.js',
  'src/core/lafea-application-templates/compilers/analytical/result-unit-projection.js',
].sort();
const changed = git(['diff', '--name-only', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changed, expected);

const statuses = git(['diff', '--name-status', `${base}...HEAD`])
  .trim().split('\n').filter(Boolean);
assert.equal(statuses.filter((line) => line.startsWith('M\t')).length, 3);
assert.equal(statuses.filter((line) => line.startsWith('A\t')).length, 2);

const transferCompiler = read(
  'src/core/lafea-application-templates/compilers/analytical/load-reference-transfer.js',
);
const screeningCompiler = read(
  'src/core/lafea-application-templates/compilers/analytical/pipe-section-combined.js',
);
const projection = read(
  'src/core/lafea-application-templates/compilers/analytical/result-unit-projection.js',
);
const check = read('scripts/lafea-template-t3-analytical-compiler-check.mjs');

for (const required of [
  "'LAFEA-T3-ASCII-RESULT-UNIT-PROJECTION/V1'",
  "'lafea-t3-result-unit-projection-profile/v1'",
  "'T3_RESULT_UNIT_IDENTITY_PROJECTED_TO_PRINTABLE_ASCII'",
  'export const T3_RESULT_UNIT_PROJECTION_PROFILE',
  'export function projectT3ResultUnits(units)',
  "canonicalModelUnit: 'N·mm'",
  "resultUnit: 'N*mm'",
  'numericalScale: 1',
  "sourceIdentityPolicy: 'RETAIN_AUTHORITATIVE_DECLARED_UNIT'",
  "resultIdentityPolicy: 'EXACT_PROFILE_MAPPING_TO_PRINTABLE_ASCII'",
  "unsupportedIdentityPolicy: 'REJECT_FAIL_CLOSED'",
  'profileSemanticHash: T3_RESULT_UNIT_PROJECTION_PROFILE.semanticHash',
  'declaredSourceUnits,',
  'canonicalModelUnits,',
  'geometryAndLoadResultUnits: deepClone(resultUnits)',
  'stageSourceRetainsDeclaredUnits: true',
  'T3_RESULT_UNIT_IDENTITY_NOT_CANONICALIZABLE',
  "'T3_CANONICAL_MODEL_UNITS'",
  '_KEYS_INVALID',
]) {
  assert.equal(
    projection.includes(required),
    true,
    `Missing governed T3 result-unit profile token: ${required}`,
  );
}

for (const required of [
  'projectT3ResultUnits(canonicalModel.units)',
  'resultUnitProjection: resultUnitProjection.ancestry',
  "'SOURCE_UNIT_IDENTITY_RETAINED_IN_STAGE_SOURCE'",
  'loadCases(\n      canonicalModel,\n      status,\n      resultUnitProjection.resultUnits,\n    )',
  'unit: resultUnits.moment',
  'unit: resultUnits.force',
  'RESULT_UNIT_PROJECTION_POLICY:${T3_RESULT_UNIT_PROJECTION_POLICY_ID}',
]) {
  assert.equal(
    transferCompiler.includes(required),
    true,
    `Missing load-transfer projection token: ${required}`,
  );
}

for (const required of [
  'projectT3ResultUnits(foundationModel.units)',
  'units: resultUnitProjection.records',
  'resultUnitProjection: resultUnitProjection.ancestry',
  '...resultUnitProjection.diagnostics',
  'projectCoordinateEvidence(foundationModel.pipeCoordinateSystem)',
  "'T3_CANONICAL_VECTOR_TO_GEOMETRY_EVIDENCE/V1'",
  "'CANONICAL_COORDINATE_METADATA_RETAINED_IN_STAGE_SOURCE'",
  "'GEOMETRY_COORDINATE_EVIDENCE_PROJECTED_TO_EXACT_VECTOR_CONTRACT'",
  "'SOURCE_UNIT_IDENTITY_RETAINED_IN_STAGE_SOURCE'",
  'function exactVectorEvidence(value, label)',
  'value: deepClone(value.value)',
  'sourceRef: value.sourceRef',
]) {
  assert.equal(
    screeningCompiler.includes(required),
    true,
    `Missing screening projection token: ${required}`,
  );
}

for (const required of [
  "assert.equal(loadTransferSource.units.moment, 'N·mm')",
  'T3_RESULT_UNIT_PROJECTION_PROFILE.semanticHash',
  'assert.deepEqual(directProjection.resultUnits, EXPECTED_RESULT_UNITS)',
  "moment: 'kN·m'",
  '/T3_RESULT_UNIT_IDENTITY_NOT_CANONICALIZABLE:moment/u',
  '/T3_CANONICAL_MODEL_UNITS_KEYS_INVALID/u',
  'assert.deepEqual(repeatedTransfer, transfer)',
  'assert.deepEqual(repeatedScreening, screening)',
  'assert.deepEqual(geometryUnits(transfer), EXPECTED_RESULT_UNITS)',
  'assert.deepEqual(geometryUnits(screening), EXPECTED_RESULT_UNITS)',
  "assert.equal(transfer.handoff.stageSource.units.moment, 'N·mm')",
  "assert.equal(geometryUnit(transfer, 'moment'), 'N*mm')",
  "assert.equal(loadPrimitiveUnit(transfer, 'MOMENT_RESULTANT'), 'N*mm')",
  "model.units.moment = 'N·m'",
  '[0, 0, 1000]',
  'screening.handoff.stageSource.sourceEvidence.foundationModel.units.declared.moment',
  'assert.equal(validateTemplateGeometryResult(screening.geometry).ok, true)',
]) {
  assert.equal(
    check.includes(required),
    true,
    `Missing executable T3 unit-profile evidence: ${required}`,
  );
}

assert.equal(occurrences(projection, "canonicalModelUnit: 'N·mm'"), 1);
assert.equal(occurrences(projection, "resultUnit: 'N*mm'"), 1);
assert.equal(occurrences(projection, "canonicalModelUnit: 'N'"), 1);
assert.equal(occurrences(projection, "canonicalModelUnit: 'mm'"), 1);
assert.equal(occurrences(projection, "canonicalModelUnit: 'MPa'"), 2);
assert.equal(occurrences(projection, 'numericalScale: 1'), 5);
assert.equal(occurrences(transferCompiler, 'projectT3ResultUnits('), 1);
assert.equal(occurrences(screeningCompiler, 'projectT3ResultUnits('), 1);
assert.equal(occurrences(transferCompiler, 'units: resultUnitProjection.records'), 1);
assert.equal(occurrences(screeningCompiler, 'units: resultUnitProjection.records'), 1);
assert.equal(occurrences(screeningCompiler, 'projectCoordinateEvidence('), 2);
assert.equal(occurrences(screeningCompiler, 'pipeCoordinateArtifacts('), 1);
assert.equal(occurrences(check, 'projectT3ResultUnits({'), 3);

for (const forbiddenPath of [
  'scripts/lafea.1-fixtures.mjs',
  'scripts/lafea.2-fixtures.mjs',
  'src/core/local-stress/constants.js',
  'src/core/local-stress/units.js',
  'src/core/local-stress/canonical-model.js',
  'src/core/lafea-application-templates/contracts.js',
  'src/core/lafea-application-templates/compilers/analytical/common.js',
  'src/core/lafea-application-templates/compilers/continuum/',
  'src/workspace/',
  'package.json',
  '.github/workflows/',
]) {
  assert.equal(
    changed.some((path) => path === forbiddenPath || path.startsWith(forbiddenPath)),
    false,
    `Forbidden T3 unit-profile write path: ${forbiddenPath}`,
  );
}

for (const forbidden of [
  'replace(',
  'replaceAll(',
  'normalizeUnicode',
  'sanitizeUnit',
  "model.units.moment = 'N*mm'",
  "source.units.moment = 'N*mm'",
]) {
  assert.equal(
    [transferCompiler, screeningCompiler, projection]
      .some((source) => source.includes(forbidden)),
    false,
    `Forbidden ad hoc T3 unit sanitization: ${forbidden}`,
  );
}
for (const forbidden of [
  'delete value.sourceUnit',
  'delete value.canonicalUnit',
  'foundationModel.pipeCoordinateSystem.origin =',
]) {
  assert.equal(
    screeningCompiler.includes(forbidden),
    false,
    `Forbidden mutation of retained T3 coordinate evidence: ${forbidden}`,
  );
}

console.log(JSON.stringify({
  check: 'lafea-template-t3-unit-projection-source-guard',
  status: 'PASS',
  changedFiles: expected.length,
  modifiedExistingFiles: 3,
  additiveFiles: 2,
  sourceFixturesModified: false,
  canonicalUnitSystemModified: false,
  globalAsciiContractModified: false,
  commonCompilerHelperModified: false,
  continuumCompilerModified: false,
  agent1ImplementationModified: false,
  workbenchModified: false,
  lifecycleModified: false,
  rendererModified: false,
  certificationImplementationModified: false,
  sharedUnitProjectionProfiles: 1,
  unitProjectionConsumerPaths: 2,
  coordinateEvidenceProjectionPaths: 1,
  sourceUnitRetained: true,
  profileHashBoundInEvidence: true,
  unrelatedUnitsIdentityMapped: true,
  unsupportedMappingsFailClosed: true,
  fixtureOnlySanitizationPrevented: true,
}, null, 2));

function occurrences(source, token) {
  return source.split(token).length - 1;
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}
