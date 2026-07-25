import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, '..', 'src');

console.log('=== V15 PCFX Roundtrip Static Checks ===\n');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.log(`✗ ${message}`);
    failed++;
  }
}

// Check file exists
const adapterPath = path.join(srcPath, 'core', 'pcfx', 'pcfxRoundtripAdapter.js');
const fileExists = fs.existsSync(adapterPath);
check(fileExists, 'pcfxRoundtripAdapter.js exists');

if (!fileExists) {
  console.log('\n=== Summary ===\nFailed: file does not exist');
  process.exit(1);
}

// Read and check exports
const adapterCode = fs.readFileSync(adapterPath, 'utf-8');

const requiredExports = [
  'PCFX_ROUNDTRIP_SCHEMA_VERSION',
  'PCFX_VERSION',
  'exportSketchGraphToPCFX',
  'importPCFXToSketchGraph',
  'validatePCFXRoundtrip',
];

console.log('\nChecking exports...');
for (const exp of requiredExports) {
  check(adapterCode.includes(`export ${exp === 'PCFX_ROUNDTRIP_SCHEMA_VERSION' || exp === 'PCFX_VERSION' ? 'const' : 'function'}`), `Exports ${exp}`);
}

const requiredContent = [
  'rawAttributes',
  'normalized',
  'derived',
  'lossContract',
  'graphTranslatorComponents',
  'componentData',
];

console.log('\nChecking content keywords...');
for (const keyword of requiredContent) {
  check(adapterCode.includes(keyword), `Contains keyword "${keyword}"`);
}

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}/${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
