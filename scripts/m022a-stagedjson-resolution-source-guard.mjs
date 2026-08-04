#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const guardedFiles = [
  'src/workspace/analysis-authority-overlay/stagedjson-resolution-common.js',
  'src/workspace/analysis-authority-overlay/stagedjson-process-authority.js',
  'src/workspace/analysis-authority-overlay/stagedjson-support-authority.js',
  'src/workspace/analysis-authority-overlay/stagedjson-resolved-analysis.js',
  'src/workspace/analysis-authority-overlay/stagedjson-selected-branch-inventory.js',
];
const source = Object.fromEntries(guardedFiles.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]));
const combined = Object.entries(source).map(([path, text]) => `\n/* ${path} */\n${text}`).join('\n');
const process = source[guardedFiles[1]];
const resolved = source[guardedFiles[3]];
const inventory = source[guardedFiles[4]];

function reject(pattern, message, text = combined) { assert.equal(pattern.test(text), false, message); }
for (const path of guardedFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

reject(/Object\.freeze\s*\(/u, 'M022-A contracts must reuse deepFreeze');
reject(/\.localeCompare\s*\(|\bIntl\./u, 'locale-dependent ordering is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');
reject(/from\s*['"][^'"]*(?:linear-fea-solver|linear-fea-model-compiler|geometry\/adapters|components\/|pages\/|views\/)[^'"]*['"]/u, 'M022-A must not wire solver, canonical projection, or UI');
reject(/inputXmlToCanonicalGeometry|inputxml-resolved-ground-truth|buildInputXml/iu, 'M022-A must not touch or depend on the InputXML path');
reject(/previous(?:Entity|Element)|carry\s*forward|sourceOrderAllowed\s*:\s*true/iu, 'entity-order process carry-forward is prohibited');

assert.match(combined, /PROHIBIT_ENTITY_ORDER_CARRY_FORWARD/u);
assert.match(process, /allowInherited:\s*false/u, 'process fields must reject inheritance in the source adapter contract');
assert.match(process, /REFERENCE:\s*'referenceTemperature'/u);
assert.match(process, /OPERATING:\s*'operatingTemperature'/u);
assert.match(process, /DESIGN:\s*'designTemperature'/u);
assert.match(resolved, /stagedjson-resolved-analysis\/v1/u);
assert.match(resolved, /temperatureStateRequirements/u);
assert.match(inventory, /STAGEDJSON_OPERATING_MATERIAL_TABLE_RANGE_INSUFFICIENT/u);
assert.match(inventory, /STAGEDJSON_MATERIAL_SECTION_CATALOG_GENERALIZATION_REQUIRED/u);
assert.match(inventory, /STAGEDJSON_SUPPORT_AUTHORITY_UNRESOLVED/u);
assert.match(inventory, /designPressureMpa/u);
assert.match(inventory, /operatingTemperatureC/u);
assert.match(inventory, /hydroPressure/u);
assert.match(inventory, /fluidDensityOpeKgM3/u);
assert.match(inventory, /insulationDensityKgM3/u);

const indexSource = readFileSync(resolve(root, 'src/workspace/analysis-authority-overlay/index.js'), 'utf8');
for (const file of [
  'stagedjson-resolution-common.js',
  'stagedjson-process-authority.js',
  'stagedjson-support-authority.js',
  'stagedjson-resolved-analysis.js',
  'stagedjson-selected-branch-inventory.js',
]) assert.match(indexSource, new RegExp(`export \\* from './${file.replace('.', '\\.')}'`, 'u'), `${file} must be exported`);

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:m022a'],
  'node scripts/m022a-stagedjson-resolution-contract-check.mjs && node scripts/m022a-stagedjson-selected-branch-inventory-check.mjs && node scripts/m022a-stagedjson-resolution-source-guard.mjs',
);
const aggregate = packageJson.scripts['check:workspace-contracts'];
assert.ok(aggregate.includes('npm run check:m022a'), 'M022-A checks must be registered in check:workspace-contracts');
assert.ok(aggregate.indexOf('npm run check:m022a') > aggregate.indexOf('npm run check:w11.4'), 'M022-A must run after the completed M008 checks');

console.log('M022-A StagedJSON resolution source guard PASS');
