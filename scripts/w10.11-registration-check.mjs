import fs from 'node:fs';

const requiredFiles = [
  'docs/pipe-solver-consumer/W10.11_PIPE_SOLVER_CONSUMER.md',
  'scripts/w10.11-pipe-solver-contract-check.mjs',
  'scripts/w10.11-pipe-solver-property-check.mjs',
  'scripts/w10.11-pipe-solver-source-guard.mjs',
  'e2e/w10.11-pipe-solver-consumer.spec.js',
  'src/core/pipe-solver-consumer/index.js',
  'src/workspace/pipe-solver-consumer-adapter.js',
  'src/workspace/pipe-solver-consumer-controller.js',
  'src/workspace/pipe-solver-consumer-view.js',
];
const errors = requiredFiles.filter((file) => !fs.existsSync(file))
  .map((file) => `Missing W10.11 release evidence: ${file}`);
const browser = read('e2e/w10.11-pipe-solver-consumer.spec.js');
[
  'getPipeSolverReviewModel',
  'application-view-state/v4',
  'pipe-solver-review-model/v1',
  'analysis:sessionOpenRequested',
  'analysis:sessionOverrideRequested',
  'analysis:requested',
  'analysis:exportRequested',
  'Not final piping-code stress analysis',
  'AnalysisWorkspace.destroy()',
].forEach((token) => {
  if (!browser.includes(token)) errors.push(`W10.11 browser evidence is missing ${token}.`);
});
const packageJson = read('package.json');
const releaseWorkflow = read('.github/workflows/release-candidate.yml');
[
  'check:w10.11:static', 'check:w10.11:browser', 'e2e/w10.11-pipe-solver-consumer.spec.js',
  'w10.11-registration-check.mjs',
].forEach((token) => {
  if (!packageJson.includes(token)) errors.push(`package.json W10.11 registration is missing ${token}.`);
});
if (!releaseWorkflow.includes('npm run check:u7') || !releaseWorkflow.includes('npm run check:release')) {
  errors.push('Release Candidate Certification must retain the U7 and release registration paths.');
}
if (!releaseWorkflow.includes('npm run check:workspace-browser')) {
  errors.push('Release Candidate Certification must retain consolidated Workspace browser certification.');
}
if (errors.length) {
  errors.forEach((error) => console.error(`❌ ${error}`));
  process.exit(1);
}
console.log('✅ W10.11 release and browser registration evidence passed without the retired Phase U0 gate.');
function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; }
