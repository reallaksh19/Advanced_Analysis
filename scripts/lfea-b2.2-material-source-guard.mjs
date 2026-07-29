#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = path.join(ROOT, 'src/core/linear-fea-material');
const PRODUCTION_FILES = [
  'material-contract.js',
  'material-canonicalization.js',
  'material-resolution.js',
  'material-validation.js',
  'index.js',
];

const PROHIBITED = [
  ['locale-sensitive ordering', /\.localeCompare\s*\(/u],
  ['private FNV implementation', /FNV|0xcbf29ce4|0x100000001b3|hashBytes\s*\(|new\s+TextEncoder/u],
  ['caller array in-place sorting', /\bpoints\s*\.sort\s*\(/u],
  ['temperature clamping', /\bclamp\s*\(|Math\.(?:min|max)\s*\([^\n]*temperature/iu],
  ['nearest-point fallback', /nearest(?:Point|Temperature|Table)?/iu],
  ['installation-temperature substitution', /installationTemperature/iu],
  ['operating-temperature substitution', /operatingTemperature/iu],
  ['design-temperature substitution', /designTemperature/iu],
  ['load-case-temperature substitution', /loadCaseTemperature/iu],
  ['thermal-strain integration', /integrat(?:e|ion)[^\n]*(?:alpha|thermal)|thermal[^\n]*integrat/iu],
  ['derived shear modulus', /elasticModulus\s*\/\s*\(\s*2\s*\*\s*\(\s*1\s*\+/u],
  ['section-property formula', /Math\.PI|secondMoment|polarMoment|pipe(?:Diameter|Thickness)/u],
  ['local-axis construction', /\bcross\s*\(|localAxes|referenceVector|fallbackCandidates/u],
  ['stiffness matrix construction', /stiffnessMatrix|assembleStiffness|matrixAssembly/iu],
  ['load construction', /nodalForce|distributedLoad|gravityVector|loadCase/iu],
  ['solver import', /from\s+['"][^'"]*(?:solver|element-fea|centerline-beam-fea)[^'"]*['"]/u],
  ['UI import', /from\s+['"][^'"]*(?:workspace|ui|renderer|viewport)[^'"]*['"]/u],
];

export function scanMaterialSourceText(source) {
  return PROHIBITED
    .filter(([, pattern]) => pattern.test(source))
    .map(([label]) => label);
}

export async function runMaterialSourceGuard() {
  for (const filename of PRODUCTION_FILES) {
    const pathname = path.join(PACKAGE_DIR, filename);
    const source = await readFile(pathname, 'utf8');
    const findings = scanMaterialSourceText(source);
    assert.deepEqual(findings, [], `${filename}: ${findings.join(', ')}`);
  }

  const validationPath = path.join(
    ROOT,
    'src/core/linear-fea-contract/model-validation.js',
  );
  const modelValidation = await readFile(validationPath, 'utf8');
  assert.doesNotMatch(
    modelValidation,
    /linear-fea-material|material(?:Catalogue|Catalog|Lookup|Interpolation)/iu,
    'B-2.1 model validation must not perform material resolution.',
  );

  const packageJson = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['check:lfea-b2.2'],
    'node scripts/lfea-b2.2-material-check.mjs && node scripts/lfea-b2.2-reviewer-check.mjs && node scripts/lfea-b2.2-material-source-guard.mjs',
  );
  assert.match(
    packageJson.scripts['check:lfea-core'],
    /check:lfea-b2\.0.*check:lfea-b2\.1.*check:lfea-b2\.4.*check:lfea-b2\.2/u,
  );

  console.log('QUALIFIED LFEA B-2.2 material source guard');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await runMaterialSourceGuard();
