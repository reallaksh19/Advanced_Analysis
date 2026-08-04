import { spawnSync } from 'node:child_process';

const checks = [
  ['authorized-input', ['scripts/authorized-empirical-load-input-check.mjs']],
  ['authorized-input-anti-drift', ['scripts/authorized-empirical-load-input-anti-drift-check.mjs']],
  ['authorized-execution', ['scripts/authorized-empirical-load-execution-check.mjs']],
  ['authorized-execution-anti-drift', ['scripts/authorized-empirical-load-execution-anti-drift-check.mjs']],
  ['runtime-package-and-state', ['scripts/empirical-authorized-runtime-check.mjs']],
  ['legacy-authorized-parity', ['scripts/empirical-authorized-parity-check.mjs']],
  ['production-routing', ['scripts/empirical-authorized-cutover-production-check.mjs']],
  ['changed-file-manifest', ['scripts/empirical-authorized-cutover-manifest-check.mjs']],
  ['consumer-controller', ['scripts/authorized-enrichment-consumer-controller-check.mjs']],
  ['consumer-controller-anti-drift', ['scripts/authorized-enrichment-consumer-controller-anti-drift-check.mjs']],
  ['workspace-api', ['scripts/authorized-enrichment-workspace-api-check.mjs']],
  ['workspace-api-anti-drift', ['scripts/authorized-enrichment-workspace-api-anti-drift-check.mjs']],
  ['load-view-anti-drift', ['scripts/authorized-empirical-execution-view-anti-drift-check.mjs']],
  ['engineering-controller', ['--test', 'tests/engineering-model-controller-dataset-guard.test.mjs']],
];

const results = [];
for (const [id, args] of checks) {
  const result = spawnSync(process.execPath, args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const record = {
    id,
    command: [process.execPath, ...args].join(' '),
    exitCode: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
  results.push(record);
  if (result.status !== 0) {
    console.error(JSON.stringify({ status: 'FAIL', failedCheck: id, results }, null, 2));
    process.exit(result.status || 1);
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  aggregate: 'EMP01_AUTHORIZED_EMPIRICAL_CUTOVER',
  checkCount: results.length,
  results,
}, null, 2));
