import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  CODE_COMBINATION_RULE,
  COMBINATION_SEMANTICS_RULE,
  LOAD_CASE_COMBINATION_SCHEMA,
  LOAD_CASE_PROFILE_ID,
  PRESENTATION_KEYS,
  compareAscii,
  fail,
  requireArray,
  requireExactKeys,
  requireFinite,
  requireHash,
  requireIdentity,
  requireMember,
  requireNotCodeCategoryTag,
  requireRecord,
} from './load-case-contract.js';
import { requirePhysicalLoadCase } from './physical-load-case.js';

const COMBINATION_CODE = 'LOAD_CASE_COMBINATION_INVALID';

/**
 * The only combination this package builds is a linear superposition of solver
 * load cases. The B31.3 category combination is named so it can be refused by
 * name: section 7.2 keeps it out of the solver load-case space entirely, and
 * B-4.0 builds it from qualified result components under edition rules.
 */
export const COMBINATION_KINDS = Object.freeze(['SOLVER_LINEAR_SUPERPOSITION']);
export const CODE_CATEGORY_COMBINATION_KIND = 'CODE_CATEGORY_COMBINATION';

export const COMBINATION_INPUT_KEYS = Object.freeze([
  'combinationId',
  'combinationKind',
  'members',
  'presentation',
]);

export const COMBINATION_MEMBER_INPUT_KEYS = Object.freeze(['loadCaseId', 'scale']);

export const COMBINATION_MEMBER_KEYS = Object.freeze([
  'loadCaseId',
  'componentSemanticsId',
  'physicalLoadCaseHash',
  'scale',
]);

export const COMBINATION_RECORD_KEYS = Object.freeze([
  'schema',
  'profileId',
  'combinationId',
  'combinationKind',
  'combinationSemanticsRule',
  'codeCombinationRule',
  'stiffnessStateHash',
  'members',
  'presentation',
  'limitations',
  'semanticHash',
]);

export const COMBINATION_SEMANTICS_LIMITATION_CODE =
  'LOAD_CASE_LIMITATION_COMBINATION_SEMANTICS_UNVERIFIED';

/**
 * Declare the identity of a linear combination of solver load cases.
 *
 * Section 7.2 permits solved results to be combined only when component
 * semantics and sign are compatible. That test needs solved results, which do
 * not exist at this layer, so this package declares the membership, the scale
 * and each member's component semantics, records that compatibility is
 * unverified here, and leaves the verification to the package that owns the
 * solved state. Nothing is summed, scaled or superposed here.
 *
 * Members are read from the sealed load-case records themselves, so a member
 * hash cannot drift from the case it names.
 *
 * @param {object} input Combination declaration — see `COMBINATION_INPUT_KEYS`.
 * @param {ReadonlyArray<object>} loadCases Sealed `fea-linear-physical-load-case/v1` records.
 * @returns {Readonly<object>} `fea-linear-load-case-combination/v1`.
 */
export function sealLoadCaseCombination(input, loadCases) {
  requireExactKeys(input, COMBINATION_INPUT_KEYS, 'combination', COMBINATION_CODE);
  if (input.combinationKind === CODE_CATEGORY_COMBINATION_KIND) {
    fail(
      'combination.combinationKind is a B31.3 category combination; code combinations reference qualified result components and are not solver load cases.',
      'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
    );
  }
  const combinationKind = requireMember(
    input.combinationKind,
    COMBINATION_KINDS,
    'combination.combinationKind',
    COMBINATION_CODE,
  );
  const combinationId = requireNotCodeCategoryTag(
    requireIdentity(input.combinationId, 'combination.combinationId', COMBINATION_CODE),
    'combination.combinationId',
  );
  const presentation = requirePresentation(input.presentation);

  requireArray(loadCases, 'loadCases', COMBINATION_CODE);
  const accepted = new Map();
  for (const loadCase of loadCases) {
    const sealed = requirePhysicalLoadCase(requireRecord(loadCase, 'loadCases[]', COMBINATION_CODE));
    if (accepted.has(sealed.loadCaseId)) {
      fail(`loadCases declares ${sealed.loadCaseId} more than once.`, COMBINATION_CODE);
    }
    accepted.set(sealed.loadCaseId, sealed);
  }

  requireArray(input.members, 'combination.members', COMBINATION_CODE);
  if (input.members.length === 0) {
    fail('combination.members must name at least one solver load case.', 'LOAD_CASE_COMBINATION_EMPTY');
  }
  const seen = new Set();
  const members = input.members.map((member, index) => {
    const field = `combination.members[${index}]`;
    requireExactKeys(member, COMBINATION_MEMBER_INPUT_KEYS, field, COMBINATION_CODE);
    const loadCaseId = requireIdentity(member.loadCaseId, `${field}.loadCaseId`, COMBINATION_CODE);
    if (seen.has(loadCaseId)) {
      fail(`${field} names ${loadCaseId}, which is already a member.`, 'LOAD_CASE_COMBINATION_MEMBER_AMBIGUOUS');
    }
    seen.add(loadCaseId);
    const sealed = accepted.get(loadCaseId);
    if (sealed === undefined) {
      fail(
        `${field} names load case ${loadCaseId}, which was not supplied as a sealed physical load case.`,
        'LOAD_CASE_COMBINATION_MEMBER_UNKNOWN',
      );
    }
    const scale = requireFinite(member.scale, `${field}.scale`, COMBINATION_CODE);
    if (scale === 0) {
      fail(
        `${field}.scale is zero; a member that contributes nothing is removed from the combination rather than declared.`,
        'LOAD_CASE_COMBINATION_SCALE_INVALID',
      );
    }
    return {
      loadCaseId,
      componentSemanticsId: sealed.loadCaseClass,
      physicalLoadCaseHash: sealed.physicalLoadCaseHash,
      scale,
    };
  });

  const stiffnessStates = new Set(
    members.map((member) => accepted.get(member.loadCaseId).modelReference.stiffnessStateHash),
  );
  if (stiffnessStates.size !== 1) {
    fail(
      'combination.members were declared against different stiffness states; a solved state is one factorizable stiffness state plus one physical right-hand side.',
      'LOAD_CASE_COMBINATION_STIFFNESS_STATE_MISMATCH',
    );
  }

  const draft = {
    schema: LOAD_CASE_COMBINATION_SCHEMA,
    profileId: LOAD_CASE_PROFILE_ID,
    combinationId,
    combinationKind,
    combinationSemanticsRule: COMBINATION_SEMANTICS_RULE,
    codeCombinationRule: CODE_COMBINATION_RULE,
    stiffnessStateHash: [...stiffnessStates][0],
    members: [...members].sort((left, right) => compareAscii(left.loadCaseId, right.loadCaseId)),
    presentation,
    limitations: [
      {
        code: COMBINATION_SEMANTICS_LIMITATION_CODE,
        severity: 'WARNING',
        scope: 'LOAD_CASE_COMBINATION',
        stiffnessRelevant: false,
        details: {
          disclosure: 'Component semantics and sign compatibility are declared here and verified against solved results by the package that owns the solved state; this record asserts membership and scale only.',
        },
      },
    ],
    semanticHash: '',
  };
  draft.semanticHash = computeCombinationSemanticHash(draft);
  return requireLoadCaseCombination(draft);
}

function requirePresentation(presentation) {
  requireExactKeys(presentation, PRESENTATION_KEYS, 'combination.presentation', COMBINATION_CODE);
  for (const key of PRESENTATION_KEYS) {
    if (typeof presentation[key] !== 'string') {
      fail(`combination.presentation.${key} must be a string.`, COMBINATION_CODE);
    }
  }
  return { label: presentation.label, description: presentation.description };
}

export function combinationSemanticProjection(record) {
  return {
    schema: record.schema,
    profileId: record.profileId,
    combinationId: record.combinationId,
    combinationKind: record.combinationKind,
    combinationSemanticsRule: record.combinationSemanticsRule,
    codeCombinationRule: record.codeCombinationRule,
    stiffnessStateHash: record.stiffnessStateHash,
    members: [...record.members].sort((left, right) => compareAscii(left.loadCaseId, right.loadCaseId)),
    limitations: [...record.limitations].sort((left, right) => compareAscii(left.code, right.code)),
  };
}

export function computeCombinationSemanticHash(record) {
  return semanticHash(combinationSemanticProjection(record));
}

export function requireLoadCaseCombination(record) {
  requireExactKeys(record, COMBINATION_RECORD_KEYS, 'combination', COMBINATION_CODE);
  if (record.schema !== LOAD_CASE_COMBINATION_SCHEMA) {
    fail('combination.schema is unsupported.', COMBINATION_CODE);
  }
  if (record.combinationKind === CODE_CATEGORY_COMBINATION_KIND) {
    fail(
      'combination.combinationKind is a B31.3 category combination and is not a solver load case.',
      'LOAD_CASE_CODE_CATEGORY_NOT_A_SOLVER_CASE',
    );
  }
  requireMember(record.combinationKind, COMBINATION_KINDS, 'combination.combinationKind', COMBINATION_CODE);
  for (const [key, expected] of [
    ['combinationSemanticsRule', COMBINATION_SEMANTICS_RULE],
    ['codeCombinationRule', CODE_COMBINATION_RULE],
  ]) {
    if (record[key] !== expected) fail(`combination.${key} must equal ${expected}.`, COMBINATION_CODE);
  }
  requireNotCodeCategoryTag(record.combinationId, 'combination.combinationId');
  requireHash(record.stiffnessStateHash, 'combination.stiffnessStateHash', COMBINATION_CODE);
  requireArray(record.members, 'combination.members', COMBINATION_CODE);
  if (record.members.length === 0) fail('combination.members must not be empty.', 'LOAD_CASE_COMBINATION_EMPTY');
  record.members.forEach((member, index) => {
    const field = `combination.members[${index}]`;
    requireExactKeys(member, COMBINATION_MEMBER_KEYS, field, COMBINATION_CODE);
    requireIdentity(member.loadCaseId, `${field}.loadCaseId`, COMBINATION_CODE);
    requireHash(member.physicalLoadCaseHash, `${field}.physicalLoadCaseHash`, COMBINATION_CODE);
    requireFinite(member.scale, `${field}.scale`, COMBINATION_CODE);
  });
  requirePresentation(record.presentation);
  requireArray(record.limitations, 'combination.limitations', COMBINATION_CODE);
  requireHash(record.semanticHash, 'combination.semanticHash', COMBINATION_CODE);
  if (record.semanticHash !== computeCombinationSemanticHash(record)) {
    fail('combination.semanticHash is stale.', 'LOAD_CASE_HASH_MISMATCH');
  }
  return deepFreeze({
    ...record,
    members: [...record.members].sort((left, right) => compareAscii(left.loadCaseId, right.loadCaseId)),
    limitations: [...record.limitations].sort((left, right) => compareAscii(left.code, right.code)),
  });
}
