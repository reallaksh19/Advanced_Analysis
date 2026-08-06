#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA,
  parseInputXmlModelHealthSource,
} from '../src/core/geometry/adapters/inputxml-model-health-source.js';
import {
  parseInputXmlToCanonicalGeometry,
} from '../src/core/linear-piping-analysis-consumer/inputxml-source-binding.js';

console.log('\n--- InputXML model-health source bundle ---');

const source = `<PIPINGMODEL JOBNAME="MODEL_HEALTH_FIXTURE">
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1000" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="100" WALL_THICK="5" MATERIAL_NAME="A106-B">
    <SIF NODE="20" TYPE="3" SIF_IN="1.25" SIF_OUT="1.5"/>
  </PIPINGELEMENT>
  <PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DELTA_X="500" DELTA_Y="0" DELTA_Z="0"
    DIAMETER="-1.0101">
    <RESTRAINT NODE="30" TYPE="1" XCOSINE="1" YCOSINE="0" ZCOSINE="0"/>
  </PIPINGELEMENT>
</PIPINGMODEL>`;

const options = Object.freeze({
  unit: 'mm',
  source: 'MODEL_HEALTH_FIXTURE',
  fileName: 'model-health-fixture.xml',
  restraintTypeCodeMap: Object.freeze({ 1: 'ANCHOR' }),
});
const bundle = parseInputXmlModelHealthSource(source, options);
assert.equal(bundle.schema, INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA);
assert.equal(bundle.sourceRecordCount, 2);
assert.equal(bundle.canonicalSegmentCount, 2);
assert.equal(bundle.geometry.valid, true);
assert.equal(bundle.unitSystem.declared, false);
assert.equal(bundle.unitSystem.lengthUnit, 'mm');
assert.equal(bundle.jobName, 'MODEL_HEALTH_FIXTURE');
assert.equal(bundle.modelFeatureId, 'PIPINGMODEL[0]');
assert.equal(Object.isFrozen(bundle.elementRecords[0]), true);
assert.deepEqual(bundle.elementRecords.map((row) => row.sourceFeatureId), [
  'PIPINGELEMENT[0]',
  'PIPINGELEMENT[1]',
]);
assert.deepEqual(bundle.elementRecords.map((row) => row.canonicalSegmentId), ['IX-S1', 'IX-S2']);
console.log('✅ Source elements reconcile one-to-one with canonical segment custody.');

const first = bundle.elementRecords[0];
const second = bundle.elementRecords[1];
assert.deepEqual(first.childFeatures.map((row) => row.sourceFeatureId), [
  'PIPINGELEMENT[0]/SIF[0]',
]);
assert.deepEqual(second.childFeatures.map((row) => row.sourceFeatureId), [
  'PIPINGELEMENT[1]/RESTRAINT[0]',
]);
assert.equal(first.fieldEvidence.DIAMETER.disposition, 'EXPLICIT');
assert.equal(first.fieldEvidence.DIAMETER.effectiveSourceFeatureId, 'PIPINGELEMENT[0]');
assert.equal(first.fieldEvidence.WALL_THICK.disposition, 'EXPLICIT');
assert.equal(first.fieldEvidence.MATERIAL_NAME.disposition, 'EXPLICIT');
console.log('✅ Element and child feature identifiers are stable and source-indexed.');

assert.equal(second.fieldEvidence.DIAMETER.disposition, 'SENTINEL_UNSET_INHERITED');
assert.equal(second.fieldEvidence.DIAMETER.rawValue, '-1.0101');
assert.equal(second.fieldEvidence.DIAMETER.effectiveSourceFeatureId, 'PIPINGELEMENT[0]');
assert.equal(second.fieldEvidence.DIAMETER.canonicalValue, 100);
assert.equal(second.fieldEvidence.WALL_THICK.disposition, 'INHERITED');
assert.equal(second.fieldEvidence.WALL_THICK.effectiveSourceFeatureId, 'PIPINGELEMENT[0]');
assert.equal(second.fieldEvidence.MATERIAL_NAME.disposition, 'INHERITED');
assert.equal(second.fieldEvidence.MATERIAL_NAME.effectiveSourceFeatureId, 'PIPINGELEMENT[0]');
assert.ok(bundle.geometry.diagnostics.some((row) => (
  row.code === 'DIAMETER_INHERITED_FROM_PRIOR_ELEMENT' && row.data.elementIndex === 1
)));
console.log('✅ Raw sentinel, inherited authority, and canonical value remain distinguishable.');

const compatibilityGeometry = parseInputXmlToCanonicalGeometry(source, options);
assert.deepEqual(compatibilityGeometry, bundle.geometry);
console.log('✅ Existing geometry-only API remains an exact bundle projection.');

const malformed = parseInputXmlModelHealthSource(`<PIPINGMODEL>
  <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DELTA_X="1" DIAMETER="10"/>
  <PIPINGELEMENT FROM_NODE="" TO_NODE="30" DELTA_X="1"/>
</PIPINGMODEL>`, { unit: 'mm' });
assert.equal(malformed.sourceRecordCount, 2);
assert.equal(malformed.canonicalSegmentCount, 1);
assert.equal(malformed.elementRecords[1].canonicalStatus, 'UNRESOLVED');
assert.equal(malformed.elementRecords[1].fieldEvidence.DIAMETER.disposition, 'ABSENT');
assert.equal(malformed.elementRecords[1].fieldEvidence.DIAMETER.effectiveSourceFeatureId, null);
assert.equal(malformed.geometry.valid, false);
console.log('✅ Invalid source rows remain inventoried without claiming canonical inheritance.');

assert.throws(
  () => parseInputXmlModelHealthSource(null, options),
  (error) => error instanceof TypeError && error.code === 'INPUTXML_SOURCE_TEXT_INVALID',
);
console.log('✅ Non-text input fails closed at the source-bundle boundary.');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const consumerRoot = path.join(root, 'src/core/linear-piping-analysis-consumer');
const directBundleImports = fs.readdirSync(consumerRoot)
  .filter((name) => name.endsWith('.js'))
  .filter((name) => fs.readFileSync(path.join(consumerRoot, name), 'utf8')
    .includes("geometry/adapters/inputxml-model-health-source.js"));
assert.deepEqual(directBundleImports, ['inputxml-source-binding.js']);
console.log('✅ Raw consumer access remains confined to the governed source gateway.');

console.log('\n✅ InputXML model-health source bundle check passed.\n');
