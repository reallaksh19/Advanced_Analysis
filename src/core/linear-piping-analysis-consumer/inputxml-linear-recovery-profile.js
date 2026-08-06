import {
  RECOVERY_PROFILE_ID,
  RECOVERY_PROFILE_SCHEMA,
  sealRecoveryProfile,
} from '../linear-fea-result-recovery/index.js';

export const INPUTXML_LINEAR_RECOVERY_PROFILE_SOURCE =
  'WP-R7-INPUTXML-RESULT-RECOVERY-R1';

export function inputXmlLinearRecoveryProfile() {
  return sealRecoveryProfile({
    schema: RECOVERY_PROFILE_SCHEMA,
    profileId: RECOVERY_PROFILE_ID,
    elementForceStationsPerSpan: {
      value: 5,
      source: INPUTXML_LINEAR_RECOVERY_PROFILE_SOURCE,
    },
    codePointConsistencyTolerance: {
      value: 1e-9,
      source: INPUTXML_LINEAR_RECOVERY_PROFILE_SOURCE,
    },
    retainLocalAndGlobalActions: true,
    semanticHash: '',
  });
}
