#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_PROFILE_SCHEMA,
  PipeSectionError,
  computePipeSectionEvidenceHash,
  computePipeSectionProfileSemanticHash,
  computePipeSectionResolutionSemanticHash,
  requirePipeSectionProfile,
  requirePipeSectionResolution,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import { pipeSectionRequest } from './lfea-b2.3-pipe-section-fixtures.mjs';

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.ok(error instanceof PipeSectionError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

const expectedProfileHash = computePipeSectionProfileSemanticHash({
  schema: PIPE_SECTION_PROFILE_SCHEMA,
  profileId: PIPE_SECTION_PROFILE.profileId,
  formulationId: PIPE_SECTION_PROFILE.formulationId,
  arithmeticRule: PIPE_SECTION_PROFILE.arithmeticRule,
  innerDiameterRule: PIPE_SECTION_PROFILE.innerDiameterRule,
  solidSectionRule: PIPE_SECTION_PROFILE.solidSectionRule,
});
assert.equal(PIPE_SECTION_PROFILE.semanticHash, expectedProfileHash);

const schemaMutant = {
  ...structuredClone(PIPE_SECTION_PROFILE),
  schema: 'fea-linear-pipe-section-profile/v999',
};
assert.notEqual(
  computePipeSectionProfileSemanticHash(schemaMutant),
  PIPE_SECTION_PROFILE.semanticHash,
  'profile schema must participate in the profile semantic hash',
);

const substitutedProfile = {
  ...structuredClone(PIPE_SECTION_PROFILE),
  profileId: 'PIPE-CIRCULAR-ANNULUS-R2',
};
substitutedProfile.semanticHash = computePipeSectionProfileSemanticHash(substitutedProfile);
expectCode(
  () => requirePipeSectionProfile(substitutedProfile),
  'PIPE_SECTION_PROFILE_INVALID',
);

const result = resolvePipeSection({ request: pipeSectionRequest() });
const substitutedResult = structuredClone(result);
substitutedResult.profileSemanticHash = 'fnv1a64:1111111111111111';
substitutedResult.semanticHash = computePipeSectionResolutionSemanticHash(substitutedResult);
substitutedResult.evidenceHash = computePipeSectionEvidenceHash(substitutedResult);
expectCode(
  () => requirePipeSectionResolution(substitutedResult),
  'PIPE_SECTION_HASH_MISMATCH',
);

console.log('QUALIFIED LFEA B-2.3 reviewer checks: profile schema and R1 profile authority are hash-bound.');
