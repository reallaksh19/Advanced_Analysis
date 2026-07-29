import { canonicalStringify, semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { LINEAR_FEA_UNITS, requireLinearFeaUnits } from '../linear-fea-contract/units.js';
import {
  LOAD_CASE_DIAGNOSTIC_KEYS,
  LOAD_CASE_LIMITATION_KEYS,
  PHYSICAL_LOAD_CASE_CLASSES,
  PHYSICAL_LOAD_CASE_SCHEMA,
  PRESENTATION_KEYS,
  compareAscii,
  fail,
  requireArray,
  requireExactKeys,
  requireHash,
  requireIdentity,
  requireLoadCaseProfile,
  requireMember,
  requireNotCodeCategoryTag,
  requireRecord,
} from './load-case-contract.js';
import { requireModelReference } from './load-case-model-reference.js';
import { requireLoadPrimitive, sealLoadPrimitive } from './load-primitives.js';

const RESULT_CODE = 'LOAD_CASE_RESULT_INVALID';

export const PHYSICAL_LOAD_CASE_INPUT_KEYS = Object.freeze([
  'loadCaseId',
  'loadCaseClass',
  'presentation',
  'modelReference',
  'primitives',
  'profile',
]);

export const PHYSICAL_LOAD_CASE_RECORD_KEYS = Object.freeze([
  'schema',
  'profileId',
  'loadCaseProfileSemanticHash',
  'loadCaseId',
  'loadCaseClass',
  'units',
  'presentation',
  'modelReference',
  'primitives',
  'limitations',
  'diagnostics',
  'physicalLoadCaseHash',
  'semanticHash',
  'evidenceHash',
]);

/**
 * One entity may hold at most one state of these kinds inside a single load
 * case. Two pressure states on one element, two temperature states on one
 * element, two values for one prescribed slot or two gravity fields are
 * contradictions, and a contradiction is refused rather than resolved by
 * position, sum or last-write.
 */
const SINGLE_STATE_KINDS = Object.freeze({
  GRAVITY: Object.freeze({ keyOf: () => 'GRAVITY', code: 'LOAD_CASE_GRAVITY_AMBIGUOUS' }),
  PRESSURE: Object.freeze({
    keyOf: (primitive) => primitive.elementId,
    code: 'LOAD_CASE_PRESSURE_STATE_AMBIGUOUS',
  }),
  TEMPERATURE: Object.freeze({
    keyOf: (primitive) => primitive.elementId,
    code: 'LOAD_CASE_TEMPERATURE_STATE_AMBIGUOUS',
  }),
  PRESCRIBED_MOVEMENT: Object.freeze({
    keyOf: (primitive) => primitive.prescribedSlotId,
    code: 'LOAD_CASE_PRESCRIBED_SLOT_DOUBLE_BOUND',
  }),
});

/**
 * Compile one physical load-case package — the LFEA-B3.0 exit boundary.
 *
 * The package declares what is applied, to which model entity, under which
 * declared basis and with which traceable source. It computes no right-hand
 * side, no element thermal strain and no stiffness contribution: section 7.2
 * defines a solved state as one factorizable stiffness state plus one physical
 * right-hand side, and this package owns only the second half's declaration.
 *
 * The load-case content hash is a pure function of the load-case content. The
 * mechanical model is cited by identity and never folded into it, so
 * `stiffnessStateHash` stays a sibling input of the section 2.1 chain and
 * factorization reuse remains keyed by stiffness state, not by load case.
 *
 * @param {object} input Explicit inputs — see `PHYSICAL_LOAD_CASE_INPUT_KEYS`.
 * @returns {Readonly<object>} `fea-linear-physical-load-case/v1`.
 */
export function compilePhysicalLoadCase(input) {
  requireExactKeys(input, PHYSICAL_LOAD_CASE_INPUT_KEYS, 'input', 'LOAD_CASE_INPUT_INVALID');
  const profile = requireLoadCaseProfile(
    requireRecord(input.profile, 'profile', 'LOAD_CASE_PROFILE_INVALID'),
  );
  const modelReference = requireModelReference(
    requireRecord(input.modelReference, 'modelReference', 'LOAD_CASE_MODEL_REFERENCE_INVALID'),
  );
  const loadCaseId = requireIdentity(input.loadCaseId, 'loadCaseId', 'LOAD_CASE_INPUT_INVALID');
  requireNotCodeCategoryTag(loadCaseId, 'loadCaseId');
  const loadCaseClass = requireMember(
    requireNotCodeCategoryTag(input.loadCaseClass, 'loadCaseClass'),
    PHYSICAL_LOAD_CASE_CLASSES,
    'loadCaseClass',
    'LOAD_CASE_CLASS_UNSUPPORTED',
  );
  const presentation = requirePresentation(input.presentation);

  requireArray(input.primitives, 'primitives', 'LOAD_CASE_INPUT_INVALID');
  if (input.primitives.length === 0) {
    fail('primitives must declare at least one physical load primitive.', 'LOAD_CASE_EMPTY');
  }
  const context = { profile, modelReference };
  const primitives = input.primitives.map((primitive) => sealLoadPrimitive(primitive, context));
  requireUniquePrimitiveIds(primitives);
  requireSingleStatePerEntity(primitives);

  const ordered = [...primitives].sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  const limitations = mergeLimitationRecords(ordered.flatMap((primitive) => primitive.limitations));
  const diagnostics = ordered.map((primitive) => primitiveDiagnostic(primitive));

  const draft = {
    schema: PHYSICAL_LOAD_CASE_SCHEMA,
    profileId: profile.profileId,
    loadCaseProfileSemanticHash: profile.semanticHash,
    loadCaseId,
    loadCaseClass,
    units: LINEAR_FEA_UNITS,
    presentation,
    modelReference,
    primitives: ordered,
    limitations,
    diagnostics,
    physicalLoadCaseHash: '',
    semanticHash: '',
    evidenceHash: '',
  };
  draft.physicalLoadCaseHash = computePhysicalLoadCaseHash(draft);
  draft.semanticHash = computeLoadCaseSemanticHash(draft);
  draft.evidenceHash = computeLoadCaseEvidenceHash(draft);
  return requirePhysicalLoadCase(draft);
}

/**
 * Label and description are display-only. They are carried on the record so a
 * workbench has somewhere to put them, and they enter no hash: section 13.1
 * requires a display preference to leave every engineering identity unchanged.
 */
function requirePresentation(presentation) {
  requireExactKeys(presentation, PRESENTATION_KEYS, 'presentation', 'LOAD_CASE_INPUT_INVALID');
  for (const key of PRESENTATION_KEYS) {
    if (typeof presentation[key] !== 'string') {
      fail(`presentation.${key} must be a string.`, 'LOAD_CASE_INPUT_INVALID');
    }
  }
  return { label: presentation.label, description: presentation.description };
}

function requireUniquePrimitiveIds(primitives) {
  const seen = new Set();
  for (const primitive of primitives) {
    if (seen.has(primitive.primitiveId)) {
      fail(
        `primitives declares ${primitive.primitiveId} more than once.`,
        'LOAD_CASE_PRIMITIVE_AMBIGUOUS',
      );
    }
    seen.add(primitive.primitiveId);
  }
}

function requireSingleStatePerEntity(primitives) {
  const occupied = new Map();
  for (const primitive of primitives) {
    const rule = SINGLE_STATE_KINDS[primitive.kind];
    if (rule === undefined) continue;
    const slot = `${primitive.kind}:${rule.keyOf(primitive)}`;
    const existing = occupied.get(slot);
    if (existing !== undefined) {
      fail(
        `Primitives ${existing} and ${primitive.primitiveId} both declare ${slot} in one load case.`,
        rule.code,
      );
    }
    occupied.set(slot, primitive.primitiveId);
  }
}

/**
 * Merge disclosures by code. Two authorities disclosing one code with different
 * content is a contradiction, not something to reconcile silently, so the case
 * is blocked rather than one disclosure being dropped.
 */
function mergeLimitationRecords(limitations) {
  const merged = new Map();
  for (const entry of limitations) {
    requireExactKeys(entry, LOAD_CASE_LIMITATION_KEYS, `limitation[${String(entry?.code)}]`, RESULT_CODE);
    const encoded = canonicalStringify(entry);
    const existing = merged.get(entry.code);
    if (existing === undefined) merged.set(entry.code, encoded);
    else if (existing !== encoded) {
      fail(`Limitation ${entry.code} is disclosed with conflicting content.`, 'LOAD_CASE_LIMITATION_CONFLICT');
    }
  }
  return [...merged.keys()]
    .sort(compareAscii)
    .map((code) => JSON.parse(merged.get(code)));
}

function primitiveDiagnostic(primitive) {
  return {
    severity: 'INFO',
    code: 'LOAD_CASE_PRIMITIVE_ACCEPTED',
    entityType: 'LOAD_PRIMITIVE',
    entityId: primitive.primitiveId,
    message: `Physical load primitive ${primitive.kind} accepted and bound to the mechanical model by identity only.`,
    evidence: [
      {
        evidenceId: 'LOAD-PRIMITIVE-SOURCE',
        sourceId: primitive.sourceEvidence.sourceId,
        sourceRevision: primitive.sourceEvidence.sourceRevision,
        sourceSemanticHash: primitive.sourceEvidence.sourceSemanticHash,
      },
    ],
    qualificationEvidenceIds: ['LFEA-B3.0'],
  };
}

/**
 * Content identity of the load case.
 *
 * The projection deliberately omits the model reference, the presentation and
 * the diagnostics. Section 2.1 places `physicalLoadCaseHash` after
 * `stiffnessStateHash` as the next link, not as a function of it: a load case
 * that absorbed the stiffness state would make one right-hand side unusable
 * across the factorization it was built for, and section 7.2 keys factorization
 * reuse by stiffness state and constrained partition precisely so it stays
 * usable.
 */
export function physicalLoadCaseContentProjection(record) {
  return {
    schema: record.schema,
    profileId: record.profileId,
    loadCaseProfileSemanticHash: record.loadCaseProfileSemanticHash,
    loadCaseId: record.loadCaseId,
    loadCaseClass: record.loadCaseClass,
    units: record.units,
    primitives: [...record.primitives]
      .map((primitive) => ({
        primitiveId: primitive.primitiveId,
        kind: primitive.kind,
        semanticHash: primitive.semanticHash,
      }))
      .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId)),
    limitations: [...record.limitations].sort((left, right) => compareAscii(left.code, right.code)),
  };
}

/** Accepted-record identity: the content, bound to the model it was declared against. */
export function loadCaseSemanticProjection(record) {
  return {
    physicalLoadCaseHash: record.physicalLoadCaseHash,
    modelIdentity: record.modelReference.modelIdentity,
    modelRevision: record.modelReference.modelRevision,
    mechanicalModelSemanticHash: record.modelReference.mechanicalModelSemanticHash,
    stiffnessStateHash: record.modelReference.stiffnessStateHash,
    modelReferenceSemanticHash: record.modelReference.semanticHash,
  };
}

export function loadCaseEvidenceProjection(record) {
  return {
    semanticHash: record.semanticHash,
    diagnostics: [...record.diagnostics],
  };
}

export function computePhysicalLoadCaseHash(record) {
  return semanticHash(physicalLoadCaseContentProjection(record));
}

export function computeLoadCaseSemanticHash(record) {
  return semanticHash(loadCaseSemanticProjection(record));
}

export function computeLoadCaseEvidenceHash(record) {
  return semanticHash(loadCaseEvidenceProjection(record));
}

export function requirePhysicalLoadCase(record) {
  requireExactKeys(record, PHYSICAL_LOAD_CASE_RECORD_KEYS, 'loadCase', RESULT_CODE);
  if (record.schema !== PHYSICAL_LOAD_CASE_SCHEMA) {
    fail('loadCase.schema is unsupported.', RESULT_CODE);
  }
  requireIdentity(record.profileId, 'loadCase.profileId', RESULT_CODE);
  requireIdentity(record.loadCaseId, 'loadCase.loadCaseId', RESULT_CODE);
  requireNotCodeCategoryTag(record.loadCaseClass, 'loadCase.loadCaseClass');
  requireMember(record.loadCaseClass, PHYSICAL_LOAD_CASE_CLASSES, 'loadCase.loadCaseClass', 'LOAD_CASE_CLASS_UNSUPPORTED');
  requireLinearFeaUnits(record.units);
  requirePresentation(record.presentation);
  const modelReference = requireModelReference(record.modelReference);
  for (const field of ['loadCaseProfileSemanticHash', 'physicalLoadCaseHash', 'semanticHash', 'evidenceHash']) {
    requireHash(record[field], `loadCase.${field}`, RESULT_CODE);
  }
  requireArray(record.primitives, 'loadCase.primitives', RESULT_CODE);
  if (record.primitives.length === 0) fail('loadCase.primitives must not be empty.', 'LOAD_CASE_EMPTY');
  const primitives = record.primitives.map((primitive) => requireLoadPrimitive(primitive));
  requireUniquePrimitiveIds(primitives);
  requireSingleStatePerEntity(primitives);
  requireArray(record.limitations, 'loadCase.limitations', RESULT_CODE);
  record.limitations.forEach((entry, index) => {
    requireExactKeys(entry, LOAD_CASE_LIMITATION_KEYS, `loadCase.limitations[${index}]`, RESULT_CODE);
    if (entry.stiffnessRelevant !== false) {
      fail(
        `loadCase.limitations[${index}] declares a stiffness-relevant limitation; a physical load case never alters stiffness identity.`,
        'LOAD_CASE_LIMITATION_STIFFNESS_RELEVANT_PROHIBITED',
      );
    }
  });
  requireArray(record.diagnostics, 'loadCase.diagnostics', RESULT_CODE);
  record.diagnostics.forEach((entry, index) => {
    requireExactKeys(entry, LOAD_CASE_DIAGNOSTIC_KEYS, `loadCase.diagnostics[${index}]`, RESULT_CODE);
  });
  if (record.physicalLoadCaseHash !== computePhysicalLoadCaseHash(record)
    || record.semanticHash !== computeLoadCaseSemanticHash(record)
    || record.evidenceHash !== computeLoadCaseEvidenceHash(record)) {
    fail('loadCase hashes are stale.', 'LOAD_CASE_HASH_MISMATCH');
  }
  return deepFreeze({
    ...record,
    modelReference,
    primitives: [...primitives].sort((left, right) => compareAscii(left.primitiveId, right.primitiveId)),
    limitations: [...record.limitations].sort((left, right) => compareAscii(left.code, right.code)),
    diagnostics: [...record.diagnostics],
  });
}
