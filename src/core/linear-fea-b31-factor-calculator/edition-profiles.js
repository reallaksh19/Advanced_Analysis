import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { fail } from './contract.js';

const profiles = {
  B31_3_2018_APPENDIX_D: {
    profileId: 'B31_3_2018_APPENDIX_D',
    codeStandard: 'ASME_B31_3',
    codeEdition: '2018',
    factorStandard: 'ASME_B31_3_APPENDIX_D',
    factorEdition: '2018',
    formulaFamily: 'B31_3_APPENDIX_D_2018',
    sustainedRule: 'B31_3_2018_320_2_DEFAULT',
    sourceRevision: 'TABLE_D300',
  },
  B31_3_2020_B31J_2017: {
    profileId: 'B31_3_2020_B31J_2017',
    codeStandard: 'ASME_B31_3',
    codeEdition: '2020',
    factorStandard: 'ASME_B31J',
    factorEdition: '2017',
    formulaFamily: 'B31J_2017_TABLE_1_1',
    sustainedRule: 'B31J_2017_GENERAL_NOTE_D',
    sourceRevision: 'TABLE_1_1',
  },
  B31_3_2022_B31J_2017: {
    profileId: 'B31_3_2022_B31J_2017',
    codeStandard: 'ASME_B31_3',
    codeEdition: '2022',
    factorStandard: 'ASME_B31J',
    factorEdition: '2017',
    formulaFamily: 'B31J_2017_TABLE_1_1',
    sustainedRule: 'B31J_2017_GENERAL_NOTE_D',
    sourceRevision: 'TABLE_1_1',
  },
  B31_3_2024_B31J_2023: {
    profileId: 'B31_3_2024_B31J_2023',
    codeStandard: 'ASME_B31_3',
    codeEdition: '2024',
    factorStandard: 'ASME_B31J',
    factorEdition: '2023',
    formulaFamily: 'B31J_2023_TABLE_1_1',
    sustainedRule: 'B31J_2023_GENERAL_NOTE_D',
    sourceRevision: 'TABLE_1_1',
  },
};

for (const profile of Object.values(profiles)) {
  profile.sourceSemanticHash = semanticHash({
    standard: profile.factorStandard,
    edition: profile.factorEdition,
    sourceRevision: profile.sourceRevision,
    formulaFamily: profile.formulaFamily,
  });
  Object.freeze(profile);
}

export const B31_FACTOR_EDITION_PROFILES = deepFreeze({ ...profiles });

export function resolveB31FactorEditionProfile(profileId) {
  const profile = B31_FACTOR_EDITION_PROFILES[profileId];
  if (!profile) {
    fail(
      `Edition profile ${profileId} is not implemented. There is no ASME B31J-2022 edition; B31.3-2020/2022 map to B31J-2017 and B31.3-2024 maps to B31J-2023.`,
      'B31_FACTOR_EDITION_PROFILE_NOT_IMPLEMENTED',
    );
  }
  return profile;
}
