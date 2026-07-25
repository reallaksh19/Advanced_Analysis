import fs from 'node:fs';
function assert(condition, message) { if (!condition) throw new Error(message); }
const store = fs.readFileSync('src/sketcher/SketcherStore.js', 'utf8');
const panel = fs.readFileSync('src/sketcher/SketcherDisplaySettingsPanel.jsx', 'utf8');
const annotations = fs.readFileSync('src/sketcher/SketcherAnnotations.jsx', 'utf8');
assert(store.includes('toggleNodeCoordinates'), 'toggleNodeCoordinates action missing.');
assert(panel.includes('sketcher-toggle-node-coordinates'), 'Coordinate toggle missing.');
assert(panel.includes('sketcher-toggle-segment-lengths'), 'Length toggle missing.');
assert(annotations.includes('showNodeCoordinates'), 'Annotation label should conditionally show coordinates.');
console.log('V18B sketcher display behavior test passed.');
