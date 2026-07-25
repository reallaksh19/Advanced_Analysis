import assert from 'node:assert/strict';
import { adaptMeshPackage } from '../src/core/element-fea/index.js';
import { adapterProfile, disconnectedBoundaryPackage, holePackage, mixedPackage, rectangularQ4Package, twoElementQ4Package } from './lfea-005-fixtures.mjs';

function accepted(input){const result=adaptMeshPackage(input,adapterProfile());assert.equal(result.status,'ACCEPTED',JSON.stringify(result.diagnostics));return result;}
const rectangle=accepted(rectangularQ4Package());
assert.equal(rectangle.topologyEvidence.edgeCount,4);assert.equal(rectangle.topologyEvidence.exteriorEdgeCount,4);assert.equal(rectangle.topologyEvidence.interiorEdgeCount,0);
assert.deepEqual(rectangle.topologyEvidence.edges.map((row)=>row.classification),Array(4).fill('EXTERIOR_EDGE'));
const two=accepted(twoElementQ4Package());assert.equal(two.topologyEvidence.edgeCount,7);assert.equal(two.topologyEvidence.exteriorEdgeCount,6);assert.equal(two.topologyEvidence.interiorEdgeCount,1);
const interior=two.topologyEvidence.edges.find((row)=>row.classification==='INTERIOR_EDGE');assert.equal(interior.incidenceCount,2);assert.deepEqual(interior.incidentElementIds,['E1','E2']);
const mixed=accepted(mixedPackage());assert.ok(mixed.topologyEvidence.interiorEdgeCount>=2);assert.equal(mixed.qualifiedModel.elements.map((row)=>row.type).join(','),'Q4,T3,T3');
const hole=accepted(holePackage({pressure:true}));const holeBoundary=hole.entityEvidence.boundaries.find((row)=>row.boundaryId==='B_HOLE');assert.equal(holeBoundary.closedLoopCount,1);assert.equal(holeBoundary.openChainCount,0);assert.equal(holeBoundary.connectedComponentCount,1);assert.equal(holeBoundary.endpointIdentities.length,0);assert.equal(holeBoundary.branchNodeIdentities.length,0);assert.equal(holeBoundary.edgeCount,4);
const disconnected=accepted(disconnectedBoundaryPackage());const sides=disconnected.entityEvidence.boundaries.find((row)=>row.boundaryId==='B_SIDES');assert.equal(sides.connectedComponentCount,2);assert.equal(sides.openChainCount,2);assert.equal(sides.closedLoopCount,0);assert.deepEqual(sides.nodeIdentities,[...sides.nodeIdentities].sort());
assert.ok(rectangle.topologyEvidence.topologyIdentity.startsWith('fnv1a64:'));assert.ok(Object.isFrozen(rectangle.topologyEvidence));assert.ok(Object.isFrozen(rectangle.entityEvidence.boundaries));
console.log(`LFEA-005 deterministic edge-incidence and boundary topology passed: ${hole.topologyEvidence.topologyIdentity}`);
