#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const guardedFiles = [
  'src/workspace/analysis-authority-overlay/stagedjson-process-resolution.js',
  'src/workspace/analysis-authority-overlay/stagedjson-support-resolution.js',
  'src/workspace/analysis-authority-overlay/stagedjson-authority-composition.js',
];
const source = Object.fromEntries(guardedFiles.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]));
const combined = Object.entries(source).map(([path, text]) => `\n/* ${path} */\n${text}`).join('\n');
const process = source[guardedFiles[0]];
const support = source[guardedFiles[1]];
const composition = source[guardedFiles[2]];

function reject(pattern, message, text = combined) { assert.equal(pattern.test(text), false, message); }
for (const path of guardedFiles) assert.ok(source[path].length > 0, `missing required source file ${path}`);

reject(/\.localeCompare\s*\(|\bIntl\./u, 'locale-dependent ordering is prohibited');
reject(/Math\.random|Date\.now|new\s+Date\s*\(/u, 'nondeterministic sources are prohibited');
reject(/from\s*['"][^'"]*(?:linear-fea-model-compiler|linear-fea-solver|linear-piping-analysis-consumer|geometry\/adapters|lfea-shell-v2|components\/|pages\/|views\/)[^'"]*['"]/u, 'M022-C must not wire compiler, solver, canonical geometry, or UI');
reject(/compileMechanicalModel|inputXmlToCanonicalGeometry|buildPipingPortTopologyGraph|buildSupportAttachmentModel|buildRestraintCapabilityModel/u, 'M022-C must stop before canonical/support solver compilation');
reject(/benchmarks\/|JSON\.parse\s*\(/u, 'production M022-C modules must not read fixture files or parse source documents');
reject(/previous(?:Entity|Element)|carry\s*forward|sourceOrderAllowed\s*:\s*true/iu, 'entity-order process carry-forward is prohibited');
reject(/operatingAnalysisPressure\s*:\s*[^\n]*designPressureMpa/u, 'design pressure must never substitute for operating analysis pressure');
reject(/status:\s*['"](?:QUALIFIED|READY_FOR_SOLVE)['"]/u, 'M022-C must not claim solver qualification');

assert.match(process, /OPERATING_PRESSURE_MPA_FIELDS/u);
assert.match(process, /STAGEDJSON_OPERATING_ANALYSIS_PRESSURE_POLICY_MISSING/u);
assert.match(process, /STAGEDJSON_REFERENCE_TEMPERATURE_MISSING/u);
assert.match(process, /STAGEDJSON_HYDRO_PRESSURE_UNIT_UNDECLARED/u);
assert.match(process, /STAGEDJSON_PROCESS_INHERITANCE_POLICY/u);
assert.doesNotMatch(
  process.match(/const OPERATING_PRESSURE_MPA_FIELDS[\s\S]*?\];/u)?.[0] || '',
  /designPressureMpa/u,
  'operating pressure source list must not include design pressure',
);

assert.match(support, /sealStagedJsonSupportAuthority/u);
assert.match(support, /supportSiteModel\.assemblies/u, 'support resolution must consume production support-site grouping');
assert.match(support, /STAGEDJSON_SUPPORT_ATTACHMENT_UNRESOLVED/u);
assert.match(support, /STAGEDJSON_SUPPORT_RESTRAINT_UNRESOLVED/u);
assert.match(support, /STAGEDJSON_SUPPORT_LINEARIZATION_UNDECLARED/u);
assert.match(support, /requireExactCoverage/u, 'all selected support source records must be accounted for exactly once');

assert.match(composition, /extractBranchSubset/u, 'composition must reuse deterministic M008-B branch extraction');
assert.match(composition, /buildSupportSiteModel/u, 'composition must reuse production support-site grouping');
assert.match(composition, /sealAnalysisAuthorityOverlay/u, 'composition must seal the M008-A overlay');
assert.match(composition, /sealStagedJsonResolvedAnalysis/u, 'composition must seal the M022-A resolved-analysis contract');
assert.match(composition, /BLOCKED_PENDING_QUALIFIED_CANONICAL_ADAPTER/u);
assert.match(composition, /ENRICHED_SJSON_CANONICAL_PIPING_ADAPTER_NOT_WIRED/u);
assert.match(composition, /STAGEDJSON_SUPPORT_SOLVER_AUTHORITY_UNRESOLVED/u);
assert.match(composition, /loadCases:\s*\[\]/u, 'M022-C must not invent a governed load case');

const indexSource = readFileSync(resolve(root, 'src/workspace/analysis-authority-overlay/index.js'), 'utf8');
for (const file of [
  'stagedjson-process-resolution.js',
  'stagedjson-support-resolution.js',
  'stagedjson-authority-composition.js',
]) {
  assert.match(indexSource, new RegExp(`export \\* from './${file.replace('.', '\\.')}'`, 'u'), `${file} must be exported`);
}

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['check:m022c'],
  'node scripts/m022c-stagedjson-authority-composition-check.mjs && node scripts/m022c-stagedjson-authority-source-guard.mjs',
);
const aggregate = packageJson.scripts['check:workspace-contracts'];
assert.ok(aggregate.includes('npm run check:m022c'), 'M022-C checks must be registered in check:workspace-contracts');
assert.ok(aggregate.indexOf('npm run check:m022c') > aggregate.indexOf('npm run check:m022a'), 'M022-C must run after M022-A');

console.log('M022-C governed StagedJSON authority source guard PASS');
