import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import {
  PREPRODUCTION_SUPPORT_CONTACT_AUTHORITY_SCHEMA,
  requirePreproductionSupportContactAuthority,
} from './preproduction-support-contact-authority.js';

export const PREPRODUCTION_THERMAL_LIFTOFF_CONTACT_BRIDGE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-contact-bridge/v1';
export const THERMAL_LIFTOFF_SUPPORT_CONTACT_AUTHORITY_V1_SCHEMA =
  'empirical-thermal-liftoff-support-contact-authority/v1';

/**
 * Converts only rows already qualified for TL-03 contact intake into the exact
 * support-contact schema used by the existing TL-00/TL-03 shadow work.
 * This adapter does not execute the local screen or create stiffness,
 * displacement, reaction-tolerance, redistribution or final-reaction authority.
 */
export function buildPreproductionThermalLiftoffContactBridge(authorityValue) {
  const authority = requirePreproductionSupportContactAuthority(authorityValue);
  const qualifiedContacts = authority.rows
    .filter((row) => row.tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE')
    .map(toThermalLiftoffSupportContactAuthorityV1)
    .sort((left, right) => ascii(left.supportSiteId, right.supportSiteId));
  const unresolved = authority.rows
    .filter((row) => row.tl03Status !== 'READY_FOR_TL03_CONTACT_INTAKE')
    .map((row) => deepFreeze({
      supportKey: row.supportKey,
      supportSiteId: row.supportSiteId,
      tl03Status: row.tl03Status,
      blockerCodes: row.tl03Blockers.map((entry) => entry.code).sort(ascii),
      sourceRowSemanticHash: row.semanticHash,
    }))
    .sort((left, right) => ascii(left.supportKey, right.supportKey));
  const material = {
    schema: PREPRODUCTION_THERMAL_LIFTOFF_CONTACT_BRIDGE_SCHEMA,
    sourceAuthoritySchema: PREPRODUCTION_SUPPORT_CONTACT_AUTHORITY_SCHEMA,
    sourceAuthoritySemanticHash: authority.semanticHash,
    status: authority.status === 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY' && unresolved.length === 0
      ? 'READY_FOR_TL03_CONTACT_INTAKE'
      : qualifiedContacts.length
        ? 'PARTIAL_CONTACT_INTAKE_ONLY'
        : 'UNRESOLVED_GATE',
    qualifiedContacts,
    unresolved,
    summary: {
      sourceSupportCount: authority.rows.length,
      qualifiedContactCount: qualifiedContacts.length,
      unresolvedContactCount: unresolved.length,
    },
    policy: {
      tl03ContactShapeCompatibilityOnly: true,
      localScreenExecutionPerformed: false,
      fullCaseExecutionPermitted: false,
      displacementAuthorityCreated: false,
      tl02StiffnessAuthorityCreated: false,
      reactionToleranceAuthorityCreated: false,
      activeSetRedistributionPerformed: false,
      finalHotReactionPublicationPermitted: false,
      productionMethodRegistrationPermitted: false,
      defaultUiExposurePermitted: false,
      gravityMutationPermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffContactBridge(deepFreeze({
    ...material,
    semanticHash: semanticHash(material),
  }));
}

export function toThermalLiftoffSupportContactAuthorityV1(row) {
  if (!isPlainRecord(row) || row.tl03Status !== 'READY_FOR_TL03_CONTACT_INTAKE') {
    throw codedError(
      'Only a READY_FOR_TL03_CONTACT_INTAKE row may be adapted.',
      'PREPRODUCTION_SUPPORT_CONTACT_TL03_ROW_UNRESOLVED',
    );
  }
  if (row.capability !== 'UNILATERAL_REST'
      || row.verticalContactDirection !== 'GLOBAL_Z_PLUS'
      || row.tensileReactionPermitted !== false
      || row.initialState !== 'CONTACTING'
      || row.gapConvention !== 'POSITIVE_OPEN_PIPE_TO_SUPPORT'
      || !Number.isFinite(row.coldGapM)
      || row.coldGapM < 0) {
    throw codedError(
      'Support-contact row does not satisfy the frozen TL-00/TL-03 unilateral-contact contract.',
      'PREPRODUCTION_SUPPORT_CONTACT_TL03_CONTRACT_MISMATCH',
    );
  }
  const draft = {
    schema: THERMAL_LIFTOFF_SUPPORT_CONTACT_AUTHORITY_V1_SCHEMA,
    supportSiteId: requiredText(row.supportSiteId, 'row.supportSiteId'),
    routeChainageMm: finiteNumber(row.routeChainageMm, 'row.routeChainageMm'),
    capability: 'UNILATERAL_REST',
    verticalContactDirection: 'GLOBAL_Z_PLUS',
    coldGapM: row.coldGapM,
    gapConvention: 'POSITIVE_OPEN_PIPE_TO_SUPPORT',
    tensileReactionPermitted: false,
    initialState: 'CONTACTING',
    source: {
      sourceId: `PREPRODUCTION_SUPPORT_CONTACT:${requiredText(row.supportKey, 'row.supportKey')}`,
      sourceRevision: 'engineering-preproduction-support-contact-authority/v1',
      sourceSemanticHash: requiredHash(row.semanticHash, 'row.semanticHash'),
    },
    qualification: 'QUALIFIED',
    blockers: [],
  };
  return requireThermalLiftoffSupportContactAuthorityV1(deepFreeze({
    ...draft,
    semanticHash: semanticHash(draft),
  }));
}

export function requireThermalLiftoffSupportContactAuthorityV1(value) {
  exactKeys(value, [
    'schema', 'supportSiteId', 'routeChainageMm', 'capability',
    'verticalContactDirection', 'coldGapM', 'gapConvention',
    'tensileReactionPermitted', 'initialState', 'source',
    'qualification', 'blockers', 'semanticHash',
  ], 'TL-03 support-contact authority');
  if (value.schema !== THERMAL_LIFTOFF_SUPPORT_CONTACT_AUTHORITY_V1_SCHEMA) {
    throw codedError('Unexpected TL-03 support-contact authority schema.', 'PREPRODUCTION_TL03_CONTACT_SCHEMA_INVALID');
  }
  requiredText(value.supportSiteId, 'supportSiteId');
  finiteNumber(value.routeChainageMm, 'routeChainageMm');
  if (value.capability !== 'UNILATERAL_REST'
      || value.verticalContactDirection !== 'GLOBAL_Z_PLUS'
      || value.gapConvention !== 'POSITIVE_OPEN_PIPE_TO_SUPPORT'
      || value.tensileReactionPermitted !== false
      || value.initialState !== 'CONTACTING'
      || value.qualification !== 'QUALIFIED'
      || !Array.isArray(value.blockers)
      || value.blockers.length !== 0
      || !Number.isFinite(value.coldGapM)
      || value.coldGapM < 0) {
    throw codedError('TL-03 support-contact authority contract is invalid.', 'PREPRODUCTION_TL03_CONTACT_CONTRACT_INVALID');
  }
  exactKeys(value.source, ['sourceId', 'sourceRevision', 'sourceSemanticHash'], 'TL-03 support-contact source');
  requiredText(value.source.sourceId, 'source.sourceId');
  requiredText(value.source.sourceRevision, 'source.sourceRevision');
  requiredHash(value.source.sourceSemanticHash, 'source.sourceSemanticHash');
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw codedError('TL-03 support-contact authority semantic hash mismatch.', 'PREPRODUCTION_TL03_CONTACT_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

export function requirePreproductionThermalLiftoffContactBridge(value) {
  exactKeys(value, [
    'schema', 'sourceAuthoritySchema', 'sourceAuthoritySemanticHash', 'status',
    'qualifiedContacts', 'unresolved', 'summary', 'policy', 'semanticHash',
  ], 'preproduction thermal lift-off contact bridge');
  if (value.schema !== PREPRODUCTION_THERMAL_LIFTOFF_CONTACT_BRIDGE_SCHEMA
      || value.sourceAuthoritySchema !== PREPRODUCTION_SUPPORT_CONTACT_AUTHORITY_SCHEMA) {
    throw codedError('Unexpected preproduction TL contact bridge identity.', 'PREPRODUCTION_TL_CONTACT_BRIDGE_SCHEMA_INVALID');
  }
  requiredHash(value.sourceAuthoritySemanticHash, 'sourceAuthoritySemanticHash');
  if (!['READY_FOR_TL03_CONTACT_INTAKE', 'PARTIAL_CONTACT_INTAKE_ONLY', 'UNRESOLVED_GATE'].includes(value.status)) {
    throw codedError('Preproduction TL contact bridge status is invalid.', 'PREPRODUCTION_TL_CONTACT_BRIDGE_STATUS_INVALID');
  }
  if (!Array.isArray(value.qualifiedContacts) || !Array.isArray(value.unresolved)) {
    throw new TypeError('Preproduction TL contact bridge arrays are invalid.');
  }
  value.qualifiedContacts.forEach(requireThermalLiftoffSupportContactAuthorityV1);
  const ids = value.qualifiedContacts.map((row) => row.supportSiteId);
  if (!strictlySortedUnique(ids)) {
    throw codedError('Qualified TL contact rows must be supportSiteId-sorted and unique.', 'PREPRODUCTION_TL_CONTACT_BRIDGE_ORDER_INVALID');
  }
  const expectedSummary = {
    sourceSupportCount: value.qualifiedContacts.length + value.unresolved.length,
    qualifiedContactCount: value.qualifiedContacts.length,
    unresolvedContactCount: value.unresolved.length,
  };
  if (semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    throw codedError('Preproduction TL contact bridge summary is stale.', 'PREPRODUCTION_TL_CONTACT_BRIDGE_SUMMARY_INVALID');
  }
  if (value.policy?.tl03ContactShapeCompatibilityOnly !== true
      || value.policy?.localScreenExecutionPerformed !== false
      || value.policy?.fullCaseExecutionPermitted !== false
      || value.policy?.displacementAuthorityCreated !== false
      || value.policy?.tl02StiffnessAuthorityCreated !== false
      || value.policy?.reactionToleranceAuthorityCreated !== false
      || value.policy?.activeSetRedistributionPerformed !== false
      || value.policy?.finalHotReactionPublicationPermitted !== false
      || value.policy?.productionMethodRegistrationPermitted !== false
      || value.policy?.defaultUiExposurePermitted !== false
      || value.policy?.gravityMutationPermitted !== false) {
    throw codedError('Preproduction TL contact bridge crossed the non-executing boundary.', 'PREPRODUCTION_TL_CONTACT_BRIDGE_POLICY_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw codedError('Preproduction TL contact bridge semantic hash mismatch.', 'PREPRODUCTION_TL_CONTACT_BRIDGE_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredText(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
  return normalized;
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function requiredHash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  }
  return value;
}

function strictlySortedUnique(values) {
  return values.every((value, index) => index === 0 || ascii(values[index - 1], value) < 0);
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
