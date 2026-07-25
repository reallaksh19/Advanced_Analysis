import assert from 'node:assert/strict';
import {
  createInitialLfeaConsumerProfile, createQualifiedLfeaConsumerSession,
  createLfeaConsumerViewModel, inspectLfeaSourceObject,
} from '../src/core/lfea-consumer/index.js';
import { canonicalStringify } from '../src/core/shared-piping-model/index.js';
import { clone, q4ConsumerFixture } from './lfea-007-fixtures.mjs';

const profile = createInitialLfeaConsumerProfile();
const fixture = q4ConsumerFixture({ projection:true, sourceArtifacts:true });
const firstBundle = inspectLfeaSourceObject(fixture.exportValue, { profile, sourceName:'one.json', sourceByteLength:10 });
const secondBundle = inspectLfeaSourceObject(clone(fixture.exportValue), { profile, sourceName:'two.json', sourceByteLength:10 });
const firstSession = createQualifiedLfeaConsumerSession(firstBundle);
const secondSession = createQualifiedLfeaConsumerSession(secondBundle);
assert.notEqual(firstSession.sourceName, secondSession.sourceName);
assert.equal(firstSession.semanticHash, secondSession.semanticHash, 'source file name participated in session semantic identity');
const firstModel = createLfeaConsumerViewModel(firstBundle, firstSession, profile);
const secondModel = createLfeaConsumerViewModel(secondBundle, secondSession, profile);
assert.equal(firstModel.semanticHash, secondModel.semanticHash);
assert.equal(canonicalStringify(firstModel), canonicalStringify(secondModel));
assert.deepEqual(firstModel.display.tables.rawStress.rows, fixture.review.rawStressReview.rows.slice(0,profile.tablePageSize));
assert.deepEqual(firstModel.suppliedFiles.map((row)=>row.path), [...firstModel.suppliedFiles].map((row)=>row.path).sort());
console.log(`LFEA-007 determinism passed: ${firstSession.semanticHash} / ${firstModel.semanticHash}`);
