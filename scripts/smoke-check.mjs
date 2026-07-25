import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const fail = (message) => { console.error(`SMOKE FAIL: ${message}`); process.exit(1); };
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const importSource = (file) => import(pathToFileURL(path.join(root, file)).href);

const requiredFiles = [
  'src/App.jsx',
  'src/config/version.js',
  'src/core/geometry/geometryTypes.js',
  'src/core/geometry/validateCanonicalGeometry.js',
  'src/core/geometry/adapters/pcfToCanonicalGeometry.js',
  'src/core/geometry/adapters/canonicalToGC3D.js',
  'src/core/geometry/adapters/canonicalToExtended.js',
  'src/core/geometry/adapters/canonicalToPipeRack.js',
  'src/core/solvers/piperack/solvePipeRack.js',
  'src/core/solvers/piperack/solveRackLayout.js',
  'src/core/reporting/createCalculationReport.js',
  'src/core/reporting/exportMarkdownReport.js',
  'src/core/reporting/exportJsonSnapshot.js',
  'src/core/reporting/exportCsvTables.js',
  'src/3d-analysis/AnalysisStore.js',
  'src/calc-extended/components/CalcExtendedTab.jsx',
  'src/calc-extended/store/useExtendedStore.js',
  'src/calc-extended/solver/ExtendedSolver.js',
  'src/piperack/components/PipeRackTab.jsx',
  'src/piperack/store/usePipeRackStore.js',

  'src/fixtures/spl2-benchmarks/case-001-l-bend.json',
  'src/fixtures/spl2-benchmarks/case-002-z-bend.json',
  'src/fixtures/spl2-benchmarks/case-003-loop.json',
];
for (const file of requiredFiles) if (!exists(file)) fail(`Required Phase 5 file missing: ${file}`);
if (exists('src/gc3d')) fail('Duplicate src/gc3d folder must remain retired.');
if (exists('src/calc-extended/adv-piperack')) fail('Duplicate adv-piperack folder must be retired in Phase 5.');

const version = read('src/config/version.js');
for (const token of ['phase5', 'piperack-result-v1', 'calculation-report-v1', 'spl2-benchmark-v1']) {
  if (!version.includes(token)) fail(`Version metadata missing Phase 5 token: ${token}`);
}

const calcTab = read('src/calc-extended/components/CalcExtendedTab.jsx');
if (calcTab.includes('Adv_PR') || calcTab.includes('adv-piperack')) fail('Calc Extended must not import/render duplicate adv-piperack.');
if (!calcTab.includes('Pipe Rack Calc')) fail('Official Pipe Rack tab missing from Calc Extended.');

const topNav = read('src/components/TopNav.jsx');
if (!topNav.includes('SPL2 Legacy Benchmark') && !topNav.includes('Benchmarks / Validation')) fail('TopNav must keep SPL2 labelled correctly.');

const piperackStore = read('src/piperack/store/usePipeRackStore.js');
for (const token of ['PIPE_RACK_STATE_SCHEMA_VERSION', 'exportState', 'importState', 'saveStateToLocalStorage', 'loadStateFromLocalStorage']) {
  if (!piperackStore.includes(token)) fail(`PipeRack store missing Phase 5 persistence/export token: ${token}`);
}

const rackGrid = read('src/piperack/components/RackResultsGrid.jsx');
for (const token of ['createCalculationReport', 'exportMarkdownReport', 'exportJsonSnapshot']) {
  if (!rackGrid.includes(token)) fail(`PipeRack report UI missing token: ${token}`);
}

const samplePcf = `PIPE
  END-POINT 0 0 0 100
  END-POINT 1000 0 0 100
  MATERIAL A106-B
PIPE
  END-POINT 1000 0 0 100
  END-POINT 1000 750 0 100
  MATERIAL A106-B
PIPE
  END-POINT 1000 750 0 100
  END-POINT 1800 750 0 100
  MATERIAL A106-B
`;
const { parsePcfWithDiagnostics } = await importSource('src/pcf/pcfParser.js');
const { pcfToCanonicalGeometry } = await importSource('src/core/geometry/adapters/pcfToCanonicalGeometry.js');
const { validateCanonicalGeometry } = await importSource('src/core/geometry/validateCanonicalGeometry.js');
const { canonicalToGC3D } = await importSource('src/core/geometry/adapters/canonicalToGC3D.js');
const { canonicalToExtended } = await importSource('src/core/geometry/adapters/canonicalToExtended.js');
const { canonicalToPipeRack } = await importSource('src/core/geometry/adapters/canonicalToPipeRack.js');
const { solvePipeRack } = await importSource('src/core/solvers/piperack/solvePipeRack.js');
const { solveRackLayout } = await importSource('src/core/solvers/piperack/solveRackLayout.js');
const { createCalculationReport, reportToMarkdown } = await importSource('src/core/reporting/createCalculationReport.js');
const { rowsToCsv } = await importSource('src/core/reporting/exportCsvTables.js');

const parsed = parsePcfWithDiagnostics(samplePcf);
if (parsed.components.length !== 3) fail(`Expected 3 sample pipes, got ${parsed.components.length}.`);
const canonical = pcfToCanonicalGeometry(parsed.components, { source: 'phase5-smoke', unit: 'mm' });
if (!canonical.nodes.length || canonical.segments.length !== 3) fail('PCF to canonical geometry failed.');

const validationResult = validateCanonicalGeometry(canonical);
if (!validationResult.ok) fail('Canonical geometry validation failed: ' + JSON.stringify(validationResult.errors));

const extendedInput = canonicalToExtended(canonical, { source: 'phase5-smoke' });
if (extendedInput.summary.segmentCount !== 3 || extendedInput.nodes.length < 2) fail('canonicalToExtended conversion failed.');

const pipeRackPayload = canonicalToPipeRack(canonical, { source: 'phase5-smoke', tOperate: 300 });
if (pipeRackPayload.lines.length !== 3) fail('canonicalToPipeRack conversion failed.');
const rackResult = solvePipeRack(pipeRackPayload.lines, { anchorDistanceFt: 200, defaultSpacingFt: 2.5, allowableStressPsi: 20000 }, 'FLUOR', {});
if (rackResult.lines.length !== 3 || !rackResult.schemaVersion) fail('Canonical PipeRack solver failed.');
const layout = solveRackLayout(pipeRackPayload.lines, { anchorDistanceFt: 200 }, { numTiers: 3, futureSpacePct: 20, tierElevations_mm: { 1: 4600, 2: 7600, 3: 10600 } });
if (!layout.layout.length || !layout.schemaVersion) fail('Canonical PipeRack layout failed.');

const report = createCalculationReport({ title: 'Phase 5 Smoke Report', module: 'piperack', input: pipeRackPayload, result: rackResult });
if (report.schemaVersion !== 'calculation-report-v2' && report.legacySchemaVersion !== 'calculation-report-v1-compat') fail('Report schema mismatch.');
if (!reportToMarkdown(report).includes('Phase 5 Smoke Report')) fail('Markdown report generation failed.');
if (!rowsToCsv([{ a: 1, b: 'x' }]).includes('a,b')) fail('CSV export generation failed.');

for (const file of ['case-001-l-bend.json', 'case-002-z-bend.json', 'case-003-loop.json']) {
  const fixture = JSON.parse(read(`src/fixtures/spl2-benchmarks/${file}`));
  if (fixture.schemaVersion !== 'spl2-benchmark-v1' || !fixture.id || !fixture.expected) fail(`Invalid SPL2 fixture: ${file}`);
}

console.log('Smoke check passed: Phase 5 pipe rack consolidation, report exports, SPL2 fixtures, and duplicate module retirement are valid.');

import { spawnSync } from 'child_process';
const benchResult = spawnSync(process.execPath, ['scripts/run-engineering-benchmarks.mjs'], { stdio: 'inherit' });
if (benchResult.status !== 0) {
  fail('Benchmark script failed to run.');
}

process.exit(0);
