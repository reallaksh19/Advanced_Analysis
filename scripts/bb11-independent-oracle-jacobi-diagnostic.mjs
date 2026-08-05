import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourcePath = path.join(
  ROOT,
  'src/core/bucket-b/flange-hub-independent-oracle.js',
);
const outputDirectory = path.join(ROOT, 'reports/bb11-oracle-jacobi');
const reportPath = path.join(outputDirectory, 'o0-pressure-jacobi-diagnostic.json');
const temporaryPath = path.join(
  ROOT,
  'src/core/bucket-b',
  `.bb11-oracle-jacobi-${process.pid}.mjs`,
);

const governedBlockMap = `function blockMap(block) {
  const outer = profile(block.profile);
  if (block.kind === 'STRIP') {
    return (u, v) => {`;
const correctedBlockMap = `function blockMap(block) {
  if (block.kind === 'STRIP') {
    const outer = profile(block.profile);
    return (u, v) => {`;
const governedPreconditioner =
  '  const precondition = createSymmetricGaussSeidelPreconditioner(normalized, diagonal);';
const correctedPreconditioner =
  '  const precondition = createOracleJacobiPreconditioner(diagonal);';
const linearSystemExport =
  'export function solveIndependentOracleLinearSystem({ rows, rhs } = {}) {';
const diagnosticExport = `export function runIndependentOracleO0Diagnostic(
  loadCaseId = 'FH-PRES-001',
) {
  if (loadCaseId !== 'FH-PRES-001') {
    throw new TypeError('ORACLE_DIAGNOSTIC_PRESSURE_ONLY');
  }
  return solveLevel({ levelId: 'O0', refinement: 1 }, loadCaseId);
}

${linearSystemExport}`;
const sgsFunction = 'function createSymmetricGaussSeidelPreconditioner(rows, diagonal) {';
const jacobiFunction = `function createOracleJacobiPreconditioner(diagonal) {
  const result = new Float64Array(diagonal.length);
  return (residual) => {
    for (let index = 0; index < diagonal.length; index += 1) {
      result[index] = residual[index] / diagonal[index];
    }
    return result;
  };
}

${sgsFunction}`;

await mkdir(outputDirectory, { recursive: true });
const original = await readFile(sourcePath, 'utf8');
assert.equal(occurrences(original, governedBlockMap), 1);
assert.equal(occurrences(original, governedPreconditioner), 1);
assert.equal(occurrences(original, linearSystemExport), 1);
assert.equal(occurrences(original, sgsFunction), 1);

let transformed = original
  .replace(governedBlockMap, correctedBlockMap)
  .replace(governedPreconditioner, correctedPreconditioner)
  .replace(linearSystemExport, diagnosticExport)
  .replace(sgsFunction, jacobiFunction)
  .replaceAll(
    'DETERMINISTIC_SGS_PCG_EXPLICIT_RESIDUAL_V2',
    'DETERMINISTIC_JACOBI_PCG_EXPLICIT_RESIDUAL_DIAGNOSTIC_V1',
  );
assert.notEqual(transformed, original);
await writeFile(temporaryPath, transformed, 'utf8');

let report;
try {
  const moduleUrl = `${pathToFileURL(temporaryPath).href}?run=${Date.now()}`;
  const oracle = await import(moduleUrl);
  const result = oracle.runIndependentOracleO0Diagnostic('FH-PRES-001');
  report = {
    schema: 'bb11-independent-oracle-o0-jacobi-diagnostic/v1',
    status: 'PASS',
    authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
    loadCaseId: 'FH-PRES-001',
    levelId: 'O0',
    governedOracleSha256: sha256(original),
    transformedOracleSha256: sha256(transformed),
    corrections: [
      'DEFER_PROFILE_RESOLUTION_UNTIL_BLOCK_KIND_IS_STRIP',
      'REPLACE_SGS_WITH_SEPARATELY_CODED_JACOBI_PRECONDITIONER',
    ],
    result,
  };
} catch (error) {
  report = {
    schema: 'bb11-independent-oracle-o0-jacobi-diagnostic/v1',
    status: 'FAIL',
    authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
    loadCaseId: 'FH-PRES-001',
    levelId: 'O0',
    governedOracleSha256: sha256(original),
    transformedOracleSha256: sha256(transformed),
    error: error?.stack ?? String(error),
  };
} finally {
  await rm(temporaryPath, { force: true });
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;

function occurrences(text, target) {
  return text.split(target).length - 1;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
