import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { importPCFXToSketchGraph, validatePCFXRoundtrip } from '../src/core/pcfx/pcfxRoundtripAdapter.js';
import { parsePCFXText, serializePCFX } from '../src/core/pcfx/pcfxFileUtils.js';
import { createReportPCFXDebugSnapshot } from '../src/reporting/reportPcfxDebugSnapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const fixtureDir = path.join(repoRoot, 'benchmarks/fixtures/pcfx-roundtrip');

console.log('=== V16 PCFX UI Fixtures Behavior Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

// Test each golden fixture
const fixtures = ['bend', 'tee', 'olet', 'missing-component'];

for (const fixtureName of fixtures) {
  console.log(`\n${fixtureName.charAt(0).toUpperCase() + fixtureName.slice(1)} Fixture Test:`);
  const fixturePath = path.join(fixtureDir, `${fixtureName}.pcfx.json`);

  if (!fs.existsSync(fixturePath)) {
    test(fixtureName, false, `Fixture file ${fixtureName}.pcfx.json exists`);
    continue;
  }

  const fixtureJson = fs.readFileSync(fixturePath, 'utf-8');
  const result = parsePCFXText(fixtureJson);
  const fixture = result.pcfx;

  test(fixtureName, result.ok, `Parse JSON success`);

  const imported = importPCFXToSketchGraph(fixture);
  test(fixtureName, Object.keys(imported.nodes).length > 0, `Imported has nodes`);

  const validation = validatePCFXRoundtrip(fixture, imported);
  test(fixtureName, validation.ok || fixtureName === 'missing-component', `Roundtrip validation`);

  // Fixture-specific checks
  if (fixtureName === 'bend') {
    test(fixtureName, imported.nodes.B?.type === 'elbow', `B node type is elbow`);
    test(fixtureName, imported.nodes.B?.meta?.componentData, `B componentData preserved`);
  } else if (fixtureName === 'tee') {
    test(fixtureName, imported.nodes.T?.type === 'tee', `T node type is tee`);
    test(fixtureName, imported.nodes.T?.meta?.componentData, `T componentData preserved`);
  } else if (fixtureName === 'olet') {
    test(fixtureName, imported.nodes.O?.type === 'olet', `O node type is olet`);
    test(fixtureName, imported.nodes.O?.meta?.componentData, `O componentData preserved`);
  } else if (fixtureName === 'missing-component') {
    test(fixtureName, fixture.lossContract?.some(e => e.code === 'COMPONENT_DATA_NOT_QUALIFIED'), `Loss contract has COMPONENT_DATA_NOT_QUALIFIED`);
  }
}

// Test serialize/parse roundtrip
console.log('\nSerialize/Parse Roundtrip Test:');
{
  const bendPath = path.join(fixtureDir, 'bend.pcfx.json');
  const bendJson = fs.readFileSync(bendPath, 'utf-8');
  const bendFixture = JSON.parse(bendJson);

  const serialized = serializePCFX(bendFixture);
  const reparsed = parsePCFXText(serialized);

  test('serialize', reparsed.ok, 'Serialize/parse roundtrip succeeds');
  test('serialize', reparsed.pcfx?.pcfxVersion === 'PCFX1-SCREENING-JSON', 'PCFX version preserved');

  const invalidParse = parsePCFXText('invalid json');
  test('serialize', !invalidParse.ok, 'Invalid JSON parse fails');
}

// Test report debug snapshot
console.log('\nReport PCFX Debug Snapshot Test:');
{
  const snapshot = createReportPCFXDebugSnapshot({
    activeReportContext: {
      moduleId: 'calc-extended',
      methodId: 'FLUOR_GUIDED_CANTILEVER_MIST'
    },
    revision: {
      revisionId: 'rpt-v16'
    }
  });

  test('snapshot', snapshot.debugProfile === 'report-pcfx-debug-snapshot-v1', `debugProfile is correct`);
  test('snapshot', snapshot.normalized?.methodId === 'FLUOR_GUIDED_CANTILEVER_MIST', `normalized.methodId preserved`);
  test('snapshot', snapshot.derived?.revisionId === 'rpt-v16', `derived.revisionId preserved`);
}

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}/${passed + failed}\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All behavior tests passed!');
  process.exit(0);
}
