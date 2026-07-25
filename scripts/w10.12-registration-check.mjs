import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json','utf8'));
const expected = {
  'check:w10.12:contracts':'node scripts/w10.12-qa-evidence-contract-check.mjs',
  'check:w10.12:properties':'node scripts/w10.12-qa-evidence-property-check.mjs',
  'check:w10.12:source':'node scripts/w10.12-qa-evidence-source-guard.mjs && node scripts/w10.12-registration-check.mjs',
  'check:w10.12:browser':'playwright test e2e/w10.12-qa-evidence-consumer.spec.js',
  'check:w10.12':'npm run check:w10.12:contracts && npm run check:w10.12:properties && npm run check:w10.12:source && npm run check:w10.12:browser',
};
Object.entries(expected).forEach(([key,value]) => assert.equal(packageJson.scripts[key], value, `${key} registration mismatch.`));
const workflow = fs.readFileSync('.github/workflows/w10-12-qa-evidence-certification.yml','utf8');
for (const token of ['npm ci','playwright install chromium --with-deps','check:w10.12:contracts','check:w10.12:properties','check:w10.12:source','check:w10.12:browser','check:full','npm run build']) assert.ok(workflow.includes(token), `Workflow token missing: ${token}`);
assert.equal(fs.existsSync('e2e/w10.12-qa-evidence-consumer.spec.js'), true);
assert.equal(fs.existsSync('docs/main-tab-recovery/W10.12_QA_EVIDENCE_CONSUMER.md'), true);
console.log('✅ W10.12 package, workflow, browser and documentation registration passed.');
