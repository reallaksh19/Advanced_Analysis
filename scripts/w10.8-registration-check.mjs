import fs from 'node:fs';

const requiredFiles = [
  'docs/workspace-consumers/W10.8_WORKSPACE_CONSUMERS.md',
  'scripts/w10.8-workspace-consumer-contract-check.mjs',
  'scripts/w10.8-workspace-consumer-property-check.mjs',
  'scripts/w10.8-workspace-consumer-source-guard.mjs',
  'e2e/w10.8-workspace-consumers.spec.js',
  'src/core/workspace-consumers/index.js',
  'src/workspace/application-shell-controller.js',
  'src/workspace/reports-consumer-controller.js',
];
const errors = requiredFiles.filter((file) => !fs.existsSync(file)).map((file) => `Missing W10.8 release evidence: ${file}`);
const browser = fs.existsSync('e2e/w10.8-workspace-consumers.spec.js')
  ? fs.readFileSync('e2e/w10.8-workspace-consumers.spec.js', 'utf8') : '';
[
  'getWorkspaceConsumerContext', 'getWorkspaceConsumerReadiness', 'getApplicationViewState',
  'SCREENING_AND_VERTICAL_BEAM', 'screenedVerticalForceN', 'signedSupportForceN',
  '__w108UrlAudit', 'AnalysisWorkspace.destroy()',
].forEach((token) => { if (!browser.includes(token)) errors.push(`W10.8 browser evidence is missing ${token}.`); });
if (errors.length) {
  errors.forEach((error) => console.error(`❌ ${error}`));
  process.exit(1);
}
console.log('✅ W10.8 release and browser registration evidence passed.');
