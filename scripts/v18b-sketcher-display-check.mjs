import fs from 'node:fs';
function fail(message) { console.error(`V18B check failed: ${message}`); process.exit(1); }
for (const file of ['src/sketcher/SketcherDisplaySettingsPanel.jsx', 'src/sketcher/SketcherStore.js', 'src/sketcher/SketcherAnnotations.jsx', 'src/sketcher/SketcherTab.jsx']) if (!fs.existsSync(file)) fail(`Missing required file: ${file}`);
const panel = fs.readFileSync('src/sketcher/SketcherDisplaySettingsPanel.jsx', 'utf8');
for (const token of ['sketcher-display-settings-panel', 'sketcher-toggle-node-coordinates', 'sketcher-toggle-segment-lengths', 'sketcher-toggle-measure-mode', 'sketcher-label-opacity', 'sketcher-grid-opacity']) if (!panel.includes(token)) fail(`Display panel missing token: ${token}`);
const store = fs.readFileSync('src/sketcher/SketcherStore.js', 'utf8');
for (const token of ['showNodeCoordinates', 'labelOpacity', 'gridOpacity', 'toggleNodeCoordinates']) if (!store.includes(token)) fail(`SketcherStore missing display token: ${token}`);
const annotations = fs.readFileSync('src/sketcher/SketcherAnnotations.jsx', 'utf8');
if (!annotations.includes('showNodeCoordinates') || !annotations.includes('labelOpacity')) fail('SketcherAnnotations must use showNodeCoordinates and labelOpacity.');
console.log('V18B sketcher display static check passed.');
