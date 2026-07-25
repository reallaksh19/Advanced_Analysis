import { buildGraphFromComponents } from './src/sketcher/GraphTranslator.js';

const components = [
    { id: 'p1', type: 'PIPE', points: [{x:0, y:0, z:0}, {x:50, y:0, z:0}] },
    { id: 'e1', type: 'ELBOW', points: [{x:50, y:0, z:0}, {x:100, y:50, z:0}], centrePoint: undefined },
    { id: 'p2', type: 'PIPE', points: [{x:100, y:50, z:0}, {x:100, y:100, z:0}] }
];

const res = buildGraphFromComponents(components);
console.log(JSON.stringify(res, null, 2));
