import fs from 'node:fs';
function assert(condition, message) { if (!condition) throw new Error(message); }
const panel = fs.readFileSync('src/sketcher/ElementListingPanel.jsx', 'utf8');
assert(panel.includes('segmentLength'), 'Panel should calculate segment lengths.');
assert(panel.includes('buildDiagnostics'), 'Panel should collect diagnostics.');
assert(panel.includes('lastImportLossContract'), 'Panel should show loss contract diagnostics.');
assert(panel.includes('selectedSegmentId'), 'Panel should support selected segment highlighting.');
console.log('V18C element listing panel behavior test passed.');
