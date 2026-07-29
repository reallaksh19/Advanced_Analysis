#!/usr/bin/env node

/**
 * LFEA InputXML ingestion check.
 *
 * Covers `src/core/geometry/adapters/{inputXmlToCanonicalGeometry,
 * inputxml-bend-arc,inputxml-tag-scanner}.js` — the CAESAR II InputXML path
 * that replaces `pcfToCanonicalGeometry.js` (removed; confirmed unused
 * anywhere in this repository before deletion) for LFEA. Also proves the new
 * path closes the `BEND_ARC_GEOMETRY_NOT_DECLARED` gap LFEA B-1 had to
 * degrade around for every PCF-imported elbow, by round-tripping through
 * `conditionGeometry`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conditionGeometry } from '../src/core/centerline-beam-fea/index.js';
import { inputXmlToCanonicalGeometry } from '../src/core/geometry/adapters/inputXmlToCanonicalGeometry.js';
import { checkDeclaredRadius, resolveBendArcCentre } from '../src/core/geometry/adapters/inputxml-bend-arc.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXACT = 1e-9;

console.log('\n--- LFEA InputXML ingestion check ---');
checkBendArcMath();
checkStraightRunAndSentinels();
checkBendClosesTheArcGeometryGap();
checkCompoundMiterIsRefusedNotGuessed();
checkBranchSharesNode();
checkInheritanceIsDiagnosedNotSilent();
checkDisconnectedNodeSetRejected();
checkRestraintClassification();
checkMissingUnitRejected();
checkThroughConditioning();
checkPcfRemoved();
console.log('\n✅ LFEA InputXML ingestion check passed.\n');

function checkBendArcMath() {
  // Hand-verified 90-degree case (see inputxml-bend-arc.js derivation comment).
  const resolved = resolveBendArcCentre({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 150, y: 150, z: 0 });
  assertClose(resolved.centre.x, 0, EXACT);
  assertClose(resolved.centre.y, 150, EXACT);
  assertClose(resolved.computedRadius, 150, EXACT);
  assertClose(resolved.sweepAngle, Math.PI / 2, EXACT);

  // Degenerate cases return null rather than throw or fabricate a centre.
  assert.equal(resolveBendArcCentre({ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }), null, 'non-unit incoming direction');
  assert.equal(resolveBendArcCentre({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }), null, 'chord parallel to incoming direction');
  assert.equal(resolveBendArcCentre({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), null, 'zero-length chord');

  const check = checkDeclaredRadius(150.0000001, 150, 1e-6);
  assert.equal(check.accepted, true);
  assert.equal(checkDeclaredRadius(200, 150, 1e-6).accepted, false);
  console.log('✅ Bend arc-centre resolution matches the hand-verified case and refuses degenerate geometry.');
}

/**
 * A verified fixture: node 10 at origin, a straight run to node 20 at
 * (0,0,-1000), a 90-degree bend (radius 150) from node 20 to node 30 at
 * (150,0,-850), and a branch leg from node 20 to node 50 sharing the bend's
 * start node (a tee). Sentinel deltas (-1.010100) appear on axes with no
 * offset, exactly as real CAESAR II InputXML exports them.
 */
function sampleXml(options = {}) {
  const restraint = options.includeRestraint === false ? '' : '<RESTRAINT NUM="1" NODE="10.000000" TYPE="0.000000" XCOSINE="0.000000" YCOSINE="0.000000" ZCOSINE="0.000000"/>';
  const secondElementAttrs = options.omitInheritedFields
    ? 'FROM_NODE="20.000000" TO_NODE="30.000000" DELTA_X="150.000000" DELTA_Y="0.000000" DELTA_Z="150.000000"'
    : 'FROM_NODE="20.000000" TO_NODE="30.000000" DELTA_X="150.000000" DELTA_Y="0.000000" DELTA_Z="150.000000" DIAMETER="114.299995" WALL_THICK="6.000000" MATERIAL_NAME="A106 B"';
  return `<CAESARII xmlns="COADE" VERSION="11.00" XML_TYPE="Input"><PIPINGMODEL xmlns="" JOBNAME="TEST-JOB"><PIPINGELEMENT FROM_NODE="10.000000" TO_NODE="20.000000" DELTA_X="-1.010100" DELTA_Y="-1.010100" DELTA_Z="-1000.000000" DIAMETER="114.299995" WALL_THICK="6.000000" MATERIAL_NAME="A106 B">${restraint}</PIPINGELEMENT><PIPINGELEMENT ${secondElementAttrs}><BEND RADIUS="150.000000" ANGLE1="90.000000" NODE1="30.000000"/></PIPINGELEMENT><PIPINGELEMENT FROM_NODE="20.000000" TO_NODE="50.000000" DELTA_X="0.000000" DELTA_Y="500.000000" DELTA_Z="0.000000" DIAMETER="60.299999" WALL_THICK="3.910000" MATERIAL_NAME="A106 B"><SIF SIF_NUM="1" NODE="20.000000" TYPE="3.000000"/></PIPINGELEMENT></PIPINGMODEL></CAESARII>`;
}

function checkStraightRunAndSentinels() {
  const geometry = inputXmlToCanonicalGeometry(sampleXml(), { unit: 'mm' });
  assert.equal(geometry.schemaVersion, 'canonical-geometry-v1');
  const node10 = geometry.nodes.find((row) => row.id === '10');
  const node20 = geometry.nodes.find((row) => row.id === '20');
  assert.deepEqual([node10.x, node10.y, node10.z], [0, 0, 0]);
  // Sentinel (-1.0101) deltas on X and Y resolve to zero offset, matching the
  // established CAESAR InputXML convention (see module doc).
  assertClose(node20.x, 0, EXACT);
  assertClose(node20.y, 0, EXACT);
  assertClose(node20.z, -1000, EXACT);
  const run = geometry.segments.find((row) => row.startNodeId === '10' && row.endNodeId === '20');
  assert.equal(run.type, 'PIPE');
  assert.equal(run.diameter, 114.299995);
  assert.equal(run.thickness, 6);
  assert.equal(run.material, 'A106 B');
  assertClose(run.length, 1000, EXACT);
  console.log('✅ Straight run solves from relative deltas; unset-axis sentinels resolve to zero offset.');
}

function checkBendClosesTheArcGeometryGap() {
  // This is the headline improvement over PCF: a declared RADIUS becomes a
  // real arc centre, not a straight chord with a diagnostic gap.
  const geometry = inputXmlToCanonicalGeometry(sampleXml(), { unit: 'mm' });
  const bend = geometry.segments.find((row) => row.startNodeId === '20' && row.endNodeId === '30');
  assert.equal(bend.type, 'BEND');
  assert.ok(bend.meta.bendArcCentre, 'bend arc centre must be resolved from the declared radius and incoming direction');
  assertClose(bend.meta.bendArcCentre.x, 150, 1e-6);
  assertClose(bend.meta.bendArcCentre.y, 0, 1e-6);
  assertClose(bend.meta.bendArcCentre.z, -1000, 1e-6);
  assertClose(bend.meta.bendComputedRadius, 150, 1e-6);
  assert.equal(geometry.diagnostics.some((row) => row.code === 'BEND_ARC_GEOMETRY_RESOLVED'), true);
  assert.equal(geometry.diagnostics.some((row) => row.code === 'BEND_ARC_GEOMETRY_NOT_DECLARED'), false);
  console.log('✅ A declared RADIUS resolves to a real arc centre — the gap every PCF-imported elbow left open is closed.');
}

function checkCompoundMiterIsRefusedNotGuessed() {
  // A real CAESAR II export (see module doc) mostly carries compound,
  // multi-cut miter bends: a second declared ANGLE2 means the element's
  // FROM/TO span covers more than one arc, which the single-circle resolver
  // cannot represent. It must refuse cleanly, not silently fit one wrong
  // circle across the whole span.
  const compoundXml = sampleXml().replace(
    '<BEND RADIUS="150.000000" ANGLE1="90.000000" NODE1="30.000000"/>',
    '<BEND RADIUS="150.000000" ANGLE1="45.000000" NODE1="39.000000" ANGLE2="20.000000" NODE2="38.000000"/>',
  );
  const geometry = inputXmlToCanonicalGeometry(compoundXml, { unit: 'mm' });
  const bend = geometry.segments.find((row) => row.startNodeId === '20' && row.endNodeId === '30');
  assert.equal(bend.meta.bendCompoundMiter, true);
  assert.equal(bend.meta.bendArcCentre, undefined, 'a compound miter must never get a single guessed centre');
  assert.equal(geometry.diagnostics.some((row) => row.code === 'BEND_COMPOUND_MITER_NOT_SUPPORTED' && row.data.segmentId === bend.id), true);
  console.log('✅ A compound multi-cut miter bend is refused with a clear diagnostic, never fitted to one wrong circle.');
}

function checkBranchSharesNode() {
  const geometry = inputXmlToCanonicalGeometry(sampleXml(), { unit: 'mm' });
  const touchingNode20 = geometry.segments.filter((row) => row.startNodeId === '20' || row.endNodeId === '20');
  assert.equal(touchingNode20.length, 3, 'the run, the bend and the branch leg must all reference node 20');
  const branch = geometry.segments.find((row) => row.startNodeId === '20' && row.endNodeId === '50');
  assert.equal(branch.type, 'TEE', 'a SIF TYPE=3 element is a welding tee');
  console.log('✅ A tee is a shared node across independently-listed elements, exactly as B-1 already expects — no special-case branch handling needed.');
}

function checkInheritanceIsDiagnosedNotSilent() {
  const geometry = inputXmlToCanonicalGeometry(sampleXml({ omitInheritedFields: true }), { unit: 'mm' });
  const bend = geometry.segments.find((row) => row.startNodeId === '20' && row.endNodeId === '30');
  assert.equal(bend.diameter, 114.299995, 'diameter inherits from the prior element');
  assert.equal(bend.thickness, 6, 'wall thickness inherits from the prior element');
  assert.equal(bend.material, 'A106 B', 'material inherits from the prior element');
  const inheritance = geometry.diagnostics.filter((row) => row.code.endsWith('_INHERITED_FROM_PRIOR_ELEMENT'));
  assert.ok(inheritance.length >= 3, 'every inheritance must be a visible diagnostic, never silent');
  console.log('✅ Diameter/thickness/material inheritance from the prior element is diagnosed, never silent.');
}

function checkDisconnectedNodeSetRejected() {
  const disconnectedXml = sampleXml().replace(
    '</PIPINGMODEL>',
    '<PIPINGELEMENT FROM_NODE="900.000000" TO_NODE="910.000000" DELTA_X="1000.000000" DELTA_Y="0.000000" DELTA_Z="0.000000" DIAMETER="60.299999" WALL_THICK="3.910000" MATERIAL_NAME="A106 B"/></PIPINGMODEL>',
  );
  const rejected = inputXmlToCanonicalGeometry(disconnectedXml, { unit: 'mm' });
  assert.equal(rejected.valid, false);
  assert.equal(rejected.diagnostics.some((row) => row.code === 'INPUTXML_DISCONNECTED_NODE_SET'), true);
  const disconnectedNode = rejected.nodes.find((row) => row.id === '900');
  assert.equal(disconnectedNode.x, null, 'an unsolved node is left unsolved, never silently placed at the origin');

  // Supplying an explicit origin for the second group resolves it instead.
  const placed = inputXmlToCanonicalGeometry(disconnectedXml, { unit: 'mm', componentOrigins: { '900': { x: 5000, y: 0, z: 0 } } });
  assert.equal(placed.diagnostics.some((row) => row.code === 'INPUTXML_DISCONNECTED_NODE_SET'), false);
  const placedNode = placed.nodes.find((row) => row.id === '910');
  assertClose(placedNode.x, 6000, EXACT);
  console.log('✅ A disconnected node group is rejected, never silently placed at the origin; an explicit origin resolves it.');
}

function checkRestraintClassification() {
  const withoutMap = inputXmlToCanonicalGeometry(sampleXml(), { unit: 'mm' });
  const node10Unmapped = withoutMap.nodes.find((row) => row.id === '10');
  assert.equal(node10Unmapped.restraint, 'UNKNOWN', 'a restraint TYPE code is never guessed into ANCHOR/GUIDE without a declared map');
  assert.equal(node10Unmapped.meta.restraints.length, 1);
  assert.equal(node10Unmapped.meta.restraints[0].typeCode, '0');

  const withMap = inputXmlToCanonicalGeometry(sampleXml(), { unit: 'mm', restraintTypeCodeMap: { 0: 'ANCHOR' } });
  assert.equal(withMap.nodes.find((row) => row.id === '10').restraint, 'ANCHOR');

  const withoutRestraint = inputXmlToCanonicalGeometry(sampleXml({ includeRestraint: false }), { unit: 'mm' });
  assert.equal(withoutRestraint.nodes.find((row) => row.id === '10').restraint, 'FREE');
  console.log('✅ Restraint classification requires a declared code map; absent, it stays UNKNOWN rather than guessed.');
}

function checkMissingUnitRejected() {
  assert.throws(() => inputXmlToCanonicalGeometry(sampleXml(), {}), TypeError);
  console.log('✅ A missing declared unit is rejected — InputXML does not self-declare length units reliably.');
}

function checkThroughConditioning() {
  // End to end: the InputXML-resolved arc centre feeds straight into LFEA
  // B-1's node-seeding, which curvature-seeds the bend instead of degrading
  // to BEND_ARC_GEOMETRY_NOT_DECLARED as every PCF import did.
  const geometry = inputXmlToCanonicalGeometry(sampleXml(), { unit: 'mm' });
  const profile = {
    spanSeedingLimit: { value: 5000, source: 'TEST-PROFILE' },
    bendSeedingSegments: { value: 4, source: 'TEST-PROFILE' },
    bendLengthErrorLimit: { value: 0.05, source: 'TEST-PROFILE' },
  };
  const result = conditionGeometry(geometry, [], profile);
  assert.equal(result.geometry.diagnostics.some((row) => row.code === 'BEND_ARC_GEOMETRY_NOT_DECLARED'), false);
  const bendChordNodes = result.geometry.nodes.filter((row) => row.meta?.bendChordOf);
  assert.equal(bendChordNodes.length, 3, 'bendSeedingSegments - 1 interior nodes, curvature-seeded from the resolved arc');
  console.log('✅ Through B-1 conditioning, the resolved bend is curvature-seeded — the InputXML path closes the gap PCF left open.');
}

function checkPcfRemoved() {
  const pcfPath = path.join(ROOT, 'src/core/geometry/adapters/pcfToCanonicalGeometry.js');
  assert.equal(fs.existsSync(pcfPath), false, 'pcfToCanonicalGeometry.js must be removed; LFEA ingestion is InputXML-based now');
  console.log('✅ PCF ingestion is removed, not just unused.');
}

function assertClose(actual, expected, tolerance) {
  const scale = Math.max(Math.abs(expected), Math.abs(actual), Number.MIN_VALUE);
  assert.ok(Math.abs(actual - expected) / scale <= tolerance, `${actual} != ${expected}`);
}
