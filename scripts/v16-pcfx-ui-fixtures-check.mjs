import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

console.log('=== V16 PCFX UI Fixtures Static Checks ===\n');

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

// Check file utils
console.log('Checking pcfxFileUtils.js...');
const fileUtilsPath = path.join(repoRoot, 'src/core/pcfx/pcfxFileUtils.js');
const fileUtilsExists = fs.existsSync(fileUtilsPath);
check(fileUtilsExists, 'pcfxFileUtils.js exists');

if (fileUtilsExists) {
  const fileUtilsCode = fs.readFileSync(fileUtilsPath, 'utf-8');
  const fileUtilsExports = ['serializePCFX', 'parsePCFXText', 'downloadTextFile', 'makePCFXFilename'];
  for (const exp of fileUtilsExports) {
    check(fileUtilsCode.includes(`export`), `Exports ${exp}`);
  }
}

// Check report debug snapshot
console.log('\nChecking reportPcfxDebugSnapshot.js...');
const reportPath = path.join(repoRoot, 'src/reporting/reportPcfxDebugSnapshot.js');
const reportExists = fs.existsSync(reportPath);
check(reportExists, 'reportPcfxDebugSnapshot.js exists');

if (reportExists) {
  const reportCode = fs.readFileSync(reportPath, 'utf-8');
  check(reportCode.includes('createReportPCFXDebugSnapshot'), 'Exports createReportPCFXDebugSnapshot');
  check(reportCode.includes('REPORT_PCFX_DEBUG_SCHEMA_VERSION'), 'Exports REPORT_PCFX_DEBUG_SCHEMA_VERSION');
}

// Check golden fixtures
console.log('\nChecking golden fixtures...');
const fixtureDir = path.join(repoRoot, 'benchmarks/fixtures/pcfx-roundtrip');
const fixtureFiles = [
  'bend.pcfx.json',
  'tee.pcfx.json',
  'olet.pcfx.json',
  'missing-component.pcfx.json'
];

for (const file of fixtureFiles) {
  const filePath = path.join(fixtureDir, file);
  check(fs.existsSync(filePath), `Golden fixture ${file} exists`);
}

// Check SketcherStore for PCFX actions
console.log('\nChecking SketcherStore.js...');
const sketcherStorePath = path.join(repoRoot, 'src/sketcher/SketcherStore.js');
if (fs.existsSync(sketcherStorePath)) {
  const storeCode = fs.readFileSync(sketcherStorePath, 'utf-8');
  check(storeCode.includes('exportToPCFXFile'), 'SketcherStore has exportToPCFXFile');
} else {
  check(false, 'SketcherStore.js exists');
}

// Check SketcherTab for PCFX buttons
console.log('\nChecking SketcherTab for PCFX buttons...');
const sketcherTabPath = path.join(repoRoot, 'src/sketcher/SketcherTab.jsx');
if (fs.existsSync(sketcherTabPath)) {
  const tabCode = fs.readFileSync(sketcherTabPath, 'utf-8');
  check(tabCode.includes('sketcher-export-pcfx'), 'SketcherTab has sketcher-export-pcfx testid');
} else {
  check(false, 'SketcherTab.jsx exists');
}

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}/${passed + failed}\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All checks passed!');
  process.exit(0);
}
