import {
  deepFreeze,
  semanticHash,
} from '../../../shared-piping-model/index.js';
import {
  deepClone,
  unitRecords,
} from './common.js';

export const T3_RESULT_UNIT_PROJECTION_POLICY_ID =
  'LAFEA-T3-ASCII-RESULT-UNIT-PROJECTION/V1';
export const T3_RESULT_UNIT_PROJECTION_DIAGNOSTIC =
  'T3_RESULT_UNIT_IDENTITY_PROJECTED_TO_PRINTABLE_ASCII';
export const T3_RESULT_UNIT_PROJECTION_PROFILE_SCHEMA =
  'lafea-t3-result-unit-projection-profile/v1';

const PROFILE_MAPPINGS = [
  {
    dimension: 'force',
    canonicalModelUnit: 'N',
    resultUnit: 'N',
    numericalScale: 1,
  },
  {
    dimension: 'length',
    canonicalModelUnit: 'mm',
    resultUnit: 'mm',
    numericalScale: 1,
  },
  {
    dimension: 'moment',
    canonicalModelUnit: 'N·mm',
    resultUnit: 'N*mm',
    numericalScale: 1,
  },
  {
    dimension: 'pressure',
    canonicalModelUnit: 'MPa',
    resultUnit: 'MPa',
    numericalScale: 1,
  },
  {
    dimension: 'stress',
    canonicalModelUnit: 'MPa',
    resultUnit: 'MPa',
    numericalScale: 1,
  },
];
const PROFILE_BASE = {
  schema: T3_RESULT_UNIT_PROJECTION_PROFILE_SCHEMA,
  profileId: T3_RESULT_UNIT_PROJECTION_POLICY_ID,
  mappings: PROFILE_MAPPINGS,
  sourceIdentityPolicy: 'RETAIN_AUTHORITATIVE_DECLARED_UNIT',
  resultIdentityPolicy: 'EXACT_PROFILE_MAPPING_TO_PRINTABLE_ASCII',
  unsupportedIdentityPolicy: 'REJECT_FAIL_CLOSED',
};

export const T3_RESULT_UNIT_PROJECTION_PROFILE = deepFreeze({
  ...PROFILE_BASE,
  semanticHash: semanticHash(PROFILE_BASE),
});

const RESULT_UNIT_DIMENSIONS = Object.freeze(
  T3_RESULT_UNIT_PROJECTION_PROFILE.mappings.map((mapping) => mapping.dimension),
);

validateProjectionProfile(T3_RESULT_UNIT_PROJECTION_PROFILE);

export function projectT3ResultUnits(units) {
  if (!units || typeof units !== 'object' || Array.isArray(units)) {
    throw new TypeError('T3_RESULT_UNIT_PROJECTION_REQUIRES_CANONICAL_UNITS');
  }
  if (
    !units.declared
    || typeof units.declared !== 'object'
    || Array.isArray(units.declared)
    || !units.canonical
    || typeof units.canonical !== 'object'
    || Array.isArray(units.canonical)
  ) {
    throw new TypeError(
      'T3_RESULT_UNIT_PROJECTION_REQUIRES_DECLARED_AND_CANONICAL_UNITS',
    );
  }

  const declaredSourceUnits = requireExactUnitRecord(
    units.declared,
    'T3_DECLARED_SOURCE_UNITS',
  );
  const canonicalModelUnits = requireExactUnitRecord(
    units.canonical,
    'T3_CANONICAL_MODEL_UNITS',
  );
  const resultUnits = {};

  T3_RESULT_UNIT_PROJECTION_PROFILE.mappings.forEach((mapping) => {
    const canonicalUnit = canonicalModelUnits[mapping.dimension];
    if (canonicalUnit !== mapping.canonicalModelUnit) {
      throw new TypeError(
        `T3_RESULT_UNIT_IDENTITY_NOT_CANONICALIZABLE:${mapping.dimension}`,
      );
    }
    resultUnits[mapping.dimension] = mapping.resultUnit;
  });

  return deepFreeze({
    records: unitRecords(resultUnits),
    resultUnits,
    ancestry: {
      policyId: T3_RESULT_UNIT_PROJECTION_POLICY_ID,
      profileSemanticHash: T3_RESULT_UNIT_PROJECTION_PROFILE.semanticHash,
      declaredSourceUnits,
      canonicalModelUnits,
      geometryAndLoadResultUnits: deepClone(resultUnits),
      stageSourceRetainsDeclaredUnits: true,
    },
    diagnostics: [T3_RESULT_UNIT_PROJECTION_DIAGNOSTIC],
  });
}

function requireExactUnitRecord(value, label) {
  const actual = Object.keys(value).sort(codeSort);
  if (JSON.stringify(actual) !== JSON.stringify(RESULT_UNIT_DIMENSIONS)) {
    throw new TypeError(`${label}_KEYS_INVALID`);
  }
  const result = {};
  RESULT_UNIT_DIMENSIONS.forEach((dimension) => {
    const unit = value[dimension];
    if (typeof unit !== 'string' || !unit) {
      throw new TypeError(`${label}_IDENTITY_REQUIRED:${dimension}`);
    }
    result[dimension] = unit;
  });
  return deepClone(result);
}

function validateProjectionProfile(profile) {
  if (profile.schema !== T3_RESULT_UNIT_PROJECTION_PROFILE_SCHEMA) {
    throw new TypeError('T3_RESULT_UNIT_PROJECTION_PROFILE_SCHEMA_INVALID');
  }
  if (profile.profileId !== T3_RESULT_UNIT_PROJECTION_POLICY_ID) {
    throw new TypeError('T3_RESULT_UNIT_PROJECTION_PROFILE_ID_INVALID');
  }
  if (profile.semanticHash !== semanticHash(PROFILE_BASE)) {
    throw new TypeError('T3_RESULT_UNIT_PROJECTION_PROFILE_HASH_INVALID');
  }
  const dimensions = profile.mappings.map((mapping) => mapping.dimension);
  if (
    JSON.stringify([...dimensions].sort(codeSort))
    !== JSON.stringify(RESULT_UNIT_DIMENSIONS)
    || new Set(dimensions).size !== dimensions.length
  ) {
    throw new TypeError('T3_RESULT_UNIT_PROJECTION_PROFILE_DIMENSIONS_INVALID');
  }
  profile.mappings.forEach((mapping) => {
    if (
      typeof mapping.canonicalModelUnit !== 'string'
      || !mapping.canonicalModelUnit
      || typeof mapping.resultUnit !== 'string'
      || !mapping.resultUnit
      || mapping.numericalScale !== 1
    ) {
      throw new TypeError(
        `T3_RESULT_UNIT_PROJECTION_PROFILE_MAPPING_INVALID:${mapping.dimension}`,
      );
    }
    if (/[^\x20-\x7e]/u.test(mapping.resultUnit)) {
      throw new TypeError(
        `T3_RESULT_UNIT_PROJECTION_PROFILE_RESULT_NOT_ASCII:${mapping.dimension}`,
      );
    }
  });
}

function codeSort(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}
