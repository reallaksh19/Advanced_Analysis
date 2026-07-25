import fs from 'node:fs';
function fail(message) { console.error(`V18A check failed: ${message}`); process.exit(1); }
for (const file of ['src/sketcher/adapters/viewerToSketcherAdapter.js', 'src/sketcher/SketcherStore.js']) if (!fs.existsSync(file)) fail(`Missing required file: ${file}`);
const adapter = fs.readFileSync('src/sketcher/adapters/viewerToSketcherAdapter.js', 'utf8');
for (const token of ['VIEWER_TO_SKETCHER_ADAPTER_SCHEMA_VERSION', 'convertViewerComponentsToSketcher', 'convertCanonicalGeometryToSketcher', 'lossContract']) if (!adapter.includes(token)) fail(`Adapter missing token: ${token}`);
const store = fs.readFileSync('src/sketcher/SketcherStore.js', 'utf8');
for (const token of ['importFromViewerComponents', 'lastImportDiagnostics', 'lastImportLossContract']) if (!store.includes(token)) fail(`SketcherStore missing token: ${token}`);
console.log('V18A viewer-to-sketcher adapter static check passed.');
