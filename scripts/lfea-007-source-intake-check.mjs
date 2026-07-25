import assert from 'node:assert/strict';
import { hashUtf8 } from '../src/core/shared-piping-model/canonical-json.js';
import {
  createInitialLfeaConsumerProfile, inspectLfeaSourceObject, parseLfeaSourceText,
  safeDownloadFilename, validateSuppliedFileForDownload,
} from '../src/core/lfea-consumer/index.js';
import { q4ConsumerFixture } from './lfea-007-fixtures.mjs';

const profile = createInitialLfeaConsumerProfile();
const fixture = q4ConsumerFixture({ projection:true, sourceArtifacts:true });
const reviewText = JSON.stringify(fixture.review);
const direct = parseLfeaSourceText(reviewText, {
  profile, sourceName:'qualified-review.json', sourceByteLength:Buffer.byteLength(reviewText),
});
assert.equal(direct.sourceKind, 'ENGINEERING_REVIEW');
assert.equal(direct.review.semanticHash, fixture.review.semanticHash);
assert.equal(direct.export, null);

const exportText = JSON.stringify(fixture.exportValue);
const exported = parseLfeaSourceText(exportText, {
  profile, sourceName:'qualified-export.json', sourceByteLength:Buffer.byteLength(exportText),
});
assert.equal(exported.sourceKind, 'EVIDENCE_EXPORT');
assert.equal(exported.review.reviewIdentity, fixture.review.reviewIdentity);
assert.equal(exported.review.semanticHash, fixture.exportValue.reviewSemanticHash);
assert.equal(exported.export.exportIdentity, fixture.exportValue.exportIdentity);
assert.equal(exported.suppliedFiles.length, fixture.exportValue.files.length);
assert.deepEqual(exported.suppliedFiles.map((row)=>row.path), [...fixture.exportValue.files].map((row)=>row.path));

const reviewFile = exported.suppliedFiles.find((row) => row.path === 'review.json');
const artifact = validateSuppliedFileForDownload(reviewFile, exported.export);
assert.equal(artifact.content, reviewFile.content);
assert.equal(artifact.contentHash, hashUtf8(artifact.content));
assert.equal(artifact.filename, 'review.json');
assert.equal(safeDownloadFilename('tables/raw-stress.csv'), 'raw-stress.csv');
assert.throws(() => safeDownloadFilename('../review.json'), /unsafe/i);
assert.throws(() => safeDownloadFilename('folder\\review.json'), /unsafe/i);

const objectBundle = inspectLfeaSourceObject(fixture.review, {
  profile, sourceName:'object-review.json', sourceByteLength:0,
});
assert.equal(objectBundle.review.semanticHash, fixture.review.semanticHash);
assert(Object.isFrozen(objectBundle));
console.log('LFEA-007 source intake qualification passed.');
