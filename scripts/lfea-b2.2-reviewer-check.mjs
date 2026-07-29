#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LINEAR_MATERIAL_PROFILE_ID,
  LinearFeaMaterialError,
  computeMaterialProfileSemanticHash,
  computeMaterialResolutionEvidenceHash,
  computeMaterialResolutionSemanticHash,
  requireMaterialResolutionProfile,
  requireMaterialResolutionResult,
  resolveLinearFeaMaterialState,
  sealMaterialResolutionProfile,
} from '../src/core/linear-fea-material/index.js';
import {
  MATERIAL_PROFILE,
  MATERIAL_TABLE,
  materialRequest,
} from './lfea-b2.2-material-fixtures.mjs';

function expectCode(body, code) {
  assert.throws(body, (error) => {
    assert.ok(error instanceof LinearFeaMaterialError);
    assert.equal(error.code, code);
    return true;
  });
}

const substitutedProfile = {
  ...MATERIAL_PROFILE,
  profileId: 'LINEAR-MATERIAL-INTERPOLATION-R2',
  semanticHash: '',
};
substitutedProfile.semanticHash = computeMaterialProfileSemanticHash(substitutedProfile);

expectCode(
  () => requireMaterialResolutionProfile(substitutedProfile),
  'MATERIAL_PROFILE_INVALID',
);
expectCode(
  () => sealMaterialResolutionProfile({ ...substitutedProfile, semanticHash: '' }),
  'MATERIAL_PROFILE_INVALID',
);
expectCode(
  () => resolveLinearFeaMaterialState({
    table: MATERIAL_TABLE,
    request: materialRequest(),
    profile: substitutedProfile,
  }),
  'MATERIAL_PROFILE_INVALID',
);

const substitutedResult = structuredClone(resolveLinearFeaMaterialState({
  table: MATERIAL_TABLE,
  request: materialRequest(),
  profile: MATERIAL_PROFILE,
}));
substitutedResult.profileId = substitutedProfile.profileId;
substitutedResult.profileSemanticHash = substitutedProfile.semanticHash;
substitutedResult.semanticHash = computeMaterialResolutionSemanticHash(substitutedResult);
substitutedResult.evidenceHash = computeMaterialResolutionEvidenceHash(substitutedResult);
expectCode(
  () => requireMaterialResolutionResult(substitutedResult),
  'MATERIAL_PROFILE_INVALID',
);

const wrongHashResult = structuredClone(resolveLinearFeaMaterialState({
  table: MATERIAL_TABLE,
  request: materialRequest(),
  profile: MATERIAL_PROFILE,
}));
wrongHashResult.profileId = LINEAR_MATERIAL_PROFILE_ID;
wrongHashResult.profileSemanticHash = 'fnv1a64:0000000000000000';
wrongHashResult.semanticHash = computeMaterialResolutionSemanticHash(wrongHashResult);
wrongHashResult.evidenceHash = computeMaterialResolutionEvidenceHash(wrongHashResult);
expectCode(
  () => requireMaterialResolutionResult(wrongHashResult),
  'MATERIAL_PROFILE_INVALID',
);

console.log('LFEA B-2.2 reviewer profile-authority check PASS');
