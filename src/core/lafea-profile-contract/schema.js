import { LafeaProfileContractError } from './errors.js';
import { FIELD_VALIDATORS } from './field-schemas.js';
import { PROFILE_ENVELOPE_FIELDS, PROFILE_KINDS, PROFILE_SCHEMA_IDS } from './constants.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

/**
 * Canonicalize and qualify a `<kind>Profile` record against spec §15.
 *
 * Exact-key rejection at every level: an unknown key on the envelope or on
 * `fields` is a rejection, never a silently ignored extra. The semantic hash
 * is reconstructable — if the caller supplies one it must match, otherwise it
 * is computed here, so the same profile always yields the same hash.
 *
 * @param {string} kind One of `PROFILE_KINDS`.
 * @param {object} source Candidate profile record.
 * @returns {Readonly<object>} Frozen canonical profile.
 */
export function canonicalProfile(kind, source) {
  member(kind, Object.values(PROFILE_KINDS), 'profileKind');
  exactKeys(source, PROFILE_ENVELOPE_FIELDS, kind);
  if (source.schema !== PROFILE_SCHEMA_IDS[kind]) {
    throw new LafeaProfileContractError(`${kind}.schema must be ${PROFILE_SCHEMA_IDS[kind]}`, 'UNSUPPORTED_SCHEMA');
  }
  const envelope = {
    schema: PROFILE_SCHEMA_IDS[kind],
    profileIdentity: nonEmptyString(source.profileIdentity, `${kind}.profileIdentity`),
    sourceRevision: nonEmptyString(source.sourceRevision, `${kind}.sourceRevision`),
    fields: FIELD_VALIDATORS[kind](source.fields ?? {}),
  };
  const hash = semanticHash(envelope);
  if (source.semanticHash !== undefined && source.semanticHash !== hash) {
    throw new LafeaProfileContractError(`${kind}.semanticHash does not match its canonical content`, 'HASH_MISMATCH');
  }
  return Object.freeze({ ...envelope, semanticHash: hash });
}

/**
 * Recompute a profile's semantic hash from its content, ignoring any
 * `semanticHash` the object currently carries. Used to detect tampering and
 * to prove hash repeatability.
 *
 * @param {Readonly<object>} profile Canonical profile.
 * @returns {string} Reconstructed semantic hash.
 */
export function reconstructProfileSemanticHash(profile) {
  const { semanticHash: _ignored, ...envelope } = profile;
  return semanticHash(envelope);
}
