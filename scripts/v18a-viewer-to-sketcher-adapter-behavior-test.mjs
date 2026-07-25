import { convertViewerComponentsToSketcher } from '../src/sketcher/adapters/viewerToSketcherAdapter.js';
function assert(condition, message) { if (!condition) throw new Error(message); }
const result = convertViewerComponentsToSketcher([{ id: 'P1', type: 'PIPE', ep1: [0,0,0], ep2: [1000,0,0], bore: 100 }]);
assert(result.schemaVersion === 'viewer-to-sketcher-adapter-v18a', 'Schema mismatch.');
assert(result.nodes && typeof result.nodes === 'object', 'Nodes object expected.');
assert(Array.isArray(result.segments), 'Segments array expected.');
assert(Array.isArray(result.diagnostics), 'Diagnostics array expected.');
assert(Array.isArray(result.lossContract), 'Loss contract array expected.');
console.log('V18A viewer-to-sketcher adapter behavior test passed.');
