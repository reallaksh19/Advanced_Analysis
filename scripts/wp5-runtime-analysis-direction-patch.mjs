import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./empirical-restraint-network-check.mjs', import.meta.url);
let source = readFileSync(path, 'utf8');
const before = `const rigidBySite = bySupportSite(rigidCase.supportResults);
console.log('WP5_RIGID_DIAGNOSTIC', JSON.stringify({
  supportResults: rigidCase.supportResults.map((row) => ({
    supportSiteId: row.supportSiteId,
    reactionComponentN: row.reactionComponentN,
    displacementM: row.displacementM,
    trialFreeMovementM: row.trialFreeMovementM,
  })),
  memberActions: rigidCase.memberActions,
}, null, 2));
const leftExpected = EA * 1e-5 * 100;
const rightExpected = (
  0.1 * 1e-5 * 100 + 0.5 * 2e-5 * 100
) / (0.6 / EA);`;
const after = `const rigidBySite = bySupportSite(rigidCase.supportResults);
const middleAttachment = rigidZ.supportAttachmentModel.attachments
  .find((row) => row.supportKey === 'LS-M');
assert(middleAttachment, 'The governed LS-M attachment must exist.');
const middleStationM = middleAttachment.projectedPointCanonical.z / 1000;
const junctionStationM = 0.5;
const terminalStationM = 1;
assert.equal(middleStationM, 0.25);
const leftLengthM = middleStationM;
const rightL1LengthM = junctionStationM - middleStationM;
const rightL2LengthM = terminalStationM - junctionStationM;
const leftExpected = (
  leftLengthM * 1e-5 * 100
) / (leftLengthM / EA);
const rightExpected = (
  rightL1LengthM * 1e-5 * 100
  + rightL2LengthM * 2e-5 * 100
) / ((rightL1LengthM + rightL2LengthM) / EA);`;
const first = source.indexOf(before);
assert.notEqual(first, -1, 'WP5 attachment-bound closed-form patch target not found.');
assert.equal(source.indexOf(before, first + 1), -1, 'WP5 attachment-bound target is not unique.');
source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
assert.doesNotMatch(source, /WP5_RIGID_DIAGNOSTIC/);
assert.match(source, /middleAttachment\.projectedPointCanonical\.z/);
writeFileSync(path, source);
console.log('wp5-attachment-bound-closed-form-patch: APPLIED');
