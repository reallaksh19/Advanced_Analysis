import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-checker.js';

const NEW_KINDS = new Set([
  'OVERLAPPING_ELEMENTS','PHYSICAL_CLEARANCE_CLASH','CENTERLINE_CLASH','PIPE_BACKTRACK',
  'BEND_WITHOUT_DIRECTION_CHANGE','RIGHT_ANGLE_WITHOUT_BEND','UNDEFINED_KINK',
  'MULTIWAY_WITHOUT_JUNCTION','JUNCTION_WITHOUT_MULTIWAY','BEND_AT_JUNCTION',
  'ORPHAN_SUPPORT','UNKNOWN_RESTRAINT_FAMILY','UNRESOLVED_RESTRAINT_DIRECTION','ORPHAN_RIGID',
]);
const p = (id, x, y, z = 0) => ({ id, position: { x, y, z } });
const e = (id, fromNodeId, toNodeId, extra = {}) => ({ id, fromNodeId, toNodeId, entityType: 'PIPE', ...extra });
function model({ nodes = [], edges = [], junctions = [], supports = [], rigids = [] } = {}) {
  return { nodes, edges, junctions, supports, rigids };
}
function kinds(value, options) { return new Set(checkCanonicalTopology(value, options).map((row) => row.kind)); }
function assertKind(kind, value, options) { assert.ok(kinds(value, options).has(kind), `${kind} not found`); }

test('detects pair geometry rules from canonical source-space segments', () => {
  const overlap = model({ nodes:[p('a',0,0),p('b',10,0),p('c',5,0),p('d',15,0)], edges:[e('e1','a','b'),e('e2','c','d')] });
  assertKind('OVERLAPPING_ELEMENTS', overlap);
  assertKind('CENTERLINE_CLASH', overlap);
  const physical = model({ nodes:[p('a',0,0),p('b',10,0),p('c',0,5),p('d',10,5)], edges:[e('e1','a','b',{outsideDiameterMm:10}),e('e2','c','d',{outsideDiameterMm:10})] });
  assertKind('PHYSICAL_CLEARANCE_CLASH', physical);
  const crossing = model({ nodes:[p('a',-5,0),p('b',5,0),p('c',0,-5),p('d',0,5)], edges:[e('e1','a','b'),e('e2','c','d')] });
  assertKind('CENTERLINE_CLASH', crossing);
});

test('does not promote nominal diameter to physical clearance evidence', () => {
  const value = model({ nodes:[p('a',0,0),p('b',10,0),p('c',0,5),p('d',10,5)], edges:[e('e1','a','b',{diameterMm:100}),e('e2','c','d',{diameterMm:100})] });
  assert.equal(kinds(value).has('PHYSICAL_CLEARANCE_CLASH'), false);
});

test('detects two-way fitting rules', () => {
  assertKind('PIPE_BACKTRACK', model({nodes:[p('n',0,0),p('a',10,0),p('b',20,0)],edges:[e('e1','n','a'),e('e2','n','b')]}));
  assertKind('RIGHT_ANGLE_WITHOUT_BEND', model({nodes:[p('n',0,0),p('a',10,0),p('b',0,10)],edges:[e('e1','n','a'),e('e2','n','b')]}));
  assertKind('UNDEFINED_KINK', model({nodes:[p('n',0,0),p('a',10,0),p('b',10,10)],edges:[e('e1','n','a'),e('e2','n','b')]}));
});

test('detects bend and junction rules', () => {
  assertKind('BEND_WITHOUT_DIRECTION_CHANGE', model({nodes:[p('a',0,0),p('b',10,0)],edges:[e('bend','a','b',{entityType:'BEND',bendAngleDeg:0})]}));
  const multi = model({nodes:[p('n',0,0),p('a',10,0),p('b',0,10),p('c',-10,0)],edges:[e('e1','n','a'),e('e2','n','b'),e('e3','n','c')]});
  assertKind('MULTIWAY_WITHOUT_JUNCTION', multi);
  const wrongJunction = model({nodes:[p('a',0,0),p('b',10,0)],edges:[e('e1','a','b')],junctions:[{id:'j1',nodeIds:['a']}]});
  assertKind('JUNCTION_WITHOUT_MULTIWAY', wrongJunction);
  const bendAtJunction = model({nodes:[p('n',0,0),p('a',10,0),p('b',0,10),p('c',-10,0)],edges:[e('bend','n','a',{entityType:'ELBOW'}),e('e2','n','b'),e('e3','n','c')],junctions:[{id:'j1',nodeIds:['n']}]});
  assertKind('BEND_AT_JUNCTION', bendAtJunction);
});

test('detects attachment rules', () => {
  assertKind('ORPHAN_SUPPORT', model({nodes:[p('a',0,0)],supports:[{id:'s1',nodeId:'missing',resolved:false}]}));
  assertKind('UNKNOWN_RESTRAINT_FAMILY', model({nodes:[p('a',0,0)],supports:[{id:'s1',nodeId:'a',restraints:[{id:'r1',kind:'MYSTERY'}]}]}));
  assertKind('UNRESOLVED_RESTRAINT_DIRECTION', model({nodes:[p('a',0,0)],supports:[{id:'s1',nodeId:'a',restraints:[{id:'r1',kind:'GUIDE'}]}]}));
  assertKind('ORPHAN_RIGID', model({nodes:[p('a',0,0)],rigids:[{id:'rigid1',nodeIds:['a','missing']}]}));
});

test('new Wave 3A findings are detection-only', () => {
  const value = model({
    nodes:[p('n',0,0),p('a',10,0),p('b',0,10),p('c',-10,0),p('x',50,0),p('y',60,0)],
    edges:[e('bend','n','a',{entityType:'BEND',bendAngleDeg:0}),e('e2','n','b'),e('e3','n','c'),e('e4','x','y')],
    supports:[{id:'s1',nodeId:'missing',restraints:[{id:'r1',kind:'MYSTERY'}]}],
    rigids:[{id:'rigid1',nodeIds:['missing']}],
  });
  for (const finding of checkCanonicalTopology(value)) {
    if (!NEW_KINDS.has(finding.kind)) continue;
    assert.equal(finding.suggestedAutofix, null);
    assert.equal('command' in finding, false);
    assert.equal('payload' in finding, false);
  }
});

test('finding output is deterministic under input ordering changes', () => {
  const value = model({nodes:[p('n',0,0),p('a',10,0),p('b',0,10),p('c',-10,0)],edges:[e('e1','n','a'),e('e2','n','b'),e('e3','n','c')],supports:[{id:'s1',nodeId:'missing'}]});
  const reversed = model({nodes:[...value.nodes].reverse(),edges:[...value.edges].reverse(),supports:[...value.supports].reverse()});
  assert.deepEqual(checkCanonicalTopology(value), checkCanonicalTopology(reversed));
});
