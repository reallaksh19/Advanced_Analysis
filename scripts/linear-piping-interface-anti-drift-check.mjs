#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/core/linear-piping-interface');
const files = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(ROOT, name));

const forbidden = [
  ['UI_OR_WORKSPACE_AUTHORITY', /from\s+['"][^'"]*(?:workspace|svg|three|canvas)[^'"]*['"]/u],
  ['EMPIRICAL_REACTION', /tributary|percentageOfWeight|reactionFactor|estimatedReaction/u],
  ['SOLVER_REIMPLEMENTATION', /assembleGlobal|stiffnessMatrix|factorize|solveCholesky|solveLdlt/u],
  ['FRAME_INFERENCE', /camera|viewport|screenAxis|inferFrame|fallbackGlobalAxis/u],
  ['AMBIGUOUS_OFFSET_CONVENTION', /offsetNodeToReference/u],
  ['NONLINEAR_APPROXIMATION', /applyGap|contactIteration|frictionCoefficient\s*\*/u],
  ['RANDOM_IDENTITY', /Math\.random|randomUUID/u],
  ['LOCALE_ORDERING', /localeCompare/u],
  ['HIDDEN_DEFAULT_PARAMETER', /function\s+\w+\s*\([^)]*=/u],
];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/u).length;
  assert.ok(lines < 450, `${file} has ${lines} physical lines; limit is <450`);
  for (const [code, pattern] of forbidden) {
    assert.doesNotMatch(source, pattern, `${code}: ${file}`);
  }
}

const contracts = fs.readFileSync(path.join(ROOT, 'contracts.js'), 'utf8');
assert.match(contracts, /REFERENCE_TRANSFER_FORMULA/u);
assert.match(contracts, /leverReferenceToNodeLocal/u);
assert.match(contracts, /requireOrthonormalBasis/u);
assert.match(contracts, /PROHIBITED_INTERFACE_STATES/u);

const interfaceSet = fs.readFileSync(path.join(ROOT, 'interface-set.js'), 'utf8');
assert.match(interfaceSet, /requireMechanicalModelCompilation/u);
assert.match(interfaceSet, /validateSupportAttachmentModel/u);
assert.match(interfaceSet, /validateRestraintCapabilityModel/u);
assert.match(interfaceSet, /PIPING_INTERFACE_REACTION_OWNERSHIP_DUPLICATE/u);
assert.doesNotMatch(interfaceSet, /buildSupportAttachmentModel|buildRestraintCapabilityModel/u);

const recovery = fs.readFileSync(path.join(ROOT, 'recovery.js'), 'utf8');
assert.match(recovery, /analysisResult\.execution\.reactions/u);
assert.match(recovery, /cross\(definition\.leverReferenceToNodeLocal, forceLocal\)/u);
assert.match(recovery, /dot\(vectorGlobal, basis\.e1\)/u);
assert.doesNotMatch(recovery, /compileSolverExecution|compileResultRecovery/u);

const publicApi = fs.readFileSync(path.join(ROOT, 'public-api.js'), 'utf8');
assert.match(publicApi, /LINEAR_FEA_UNITS/u);
assert.match(publicApi, /Number\.isFinite/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:lfea-interfaces'],
  'node scripts/linear-piping-interface-check.mjs && node scripts/linear-piping-interface-anti-drift-check.mjs',
);
assert.match(packageValue.scripts['check:lfea-core'], /check:lfea-interfaces/u);
assert.match(packageValue.scripts.gate, /check:lfea-core/u);

console.log('Linear piping interface anti-drift check PASS');
