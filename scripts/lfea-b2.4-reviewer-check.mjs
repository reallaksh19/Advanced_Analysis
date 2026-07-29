import assert from 'node:assert/strict';
import {
  canonicalStringify as sharedCanonicalStringify,
  semanticHash as sharedSemanticHash,
} from '../src/core/shared-piping-model/canonical-json.js';
import {
  FRAME_LOCAL_AXIS_PROFILE,
  canonicalStringify,
  computeFrameLocalAxisProfileSemanticHash,
  profileSemanticPayload,
  requireFrameLocalAxisProfile,
  semanticHash,
} from '../src/core/centerline-beam-fea/index.js';

const unicodeProfile = structuredClone(FRAME_LOCAL_AXIS_PROFILE);
unicodeProfile.fallbackCandidates[0].candidateId = 'GLOBAL_Ω';
unicodeProfile.semanticHash = computeFrameLocalAxisProfileSemanticHash(unicodeProfile);
const governedUnicodeProfile = requireFrameLocalAxisProfile(unicodeProfile);
const payload = profileSemanticPayload(governedUnicodeProfile);

assert.equal(
  canonicalStringify(payload),
  sharedCanonicalStringify(payload),
  'B-2.4 canonical JSON must use the repository authority',
);
assert.equal(
  semanticHash(payload),
  sharedSemanticHash(payload),
  'B-2.4 semantic hash must use the repository UTF-8 authority',
);
assert.equal(
  governedUnicodeProfile.semanticHash,
  sharedSemanticHash(payload),
  'profile hash must remain repository-compatible for non-ASCII profile data',
);

console.log('LFEA B-2.4 reviewer hash-authority check PASS');
