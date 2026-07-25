import fs from 'node:fs';
function fail(message) { console.error(`V18C check failed: ${message}`); process.exit(1); }
for (const file of ['src/sketcher/ElementListingPanel.jsx', 'src/sketcher/SketcherTab.jsx']) if (!fs.existsSync(file)) fail(`Missing required file: ${file}`);
const panel = fs.readFileSync('src/sketcher/ElementListingPanel.jsx', 'utf8');
for (const token of ['sketcher-element-listing-panel', 'element-panel-tab-pipes', 'element-panel-tab-fittings', 'element-panel-tab-components', 'element-panel-tab-supports', 'element-panel-tab-warnings']) if (!panel.includes(token)) fail(`ElementListingPanel missing token: ${token}`);
const tab = fs.readFileSync('src/sketcher/SketcherTab.jsx', 'utf8');
if (!tab.includes('ElementListingPanel')) fail('SketcherTab must import/render ElementListingPanel.');
console.log('V18C element listing panel static check passed.');
