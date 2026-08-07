import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { validateRestraintCapabilityModel } from '../support-restraints/index.js';

export const NON_FEA_EFFECTIVE_RESTRAINT_CAPABILITY_SCHEMA =
  'non-fea-effective-restraint-capability/v1';

const ACTIVE_STATES = Object.freeze(['RESTRAINED', 'GAP', 'SPRING']);

/**
 * Compiles source restraint capability plus explicitly accepted calculation
 * overrides into one immutable effective-restraint authority. This contract
 * does not move supports, mutate topology, infer geometry, authorize a method,
 * or execute mechanics.
 */
export function createNonFeaEffectiveRestraintCapabilityModel(input = {}) {
  const sourceModel = input.restraintCapabilityModel;
  const validation = validateRestraintCapabilityModel(sourceModel);
  if (!validation.ok) {
    throw new TypeError(`Effective restraint capability requires a valid source restraint model: ${validation.errors.join(' ')}`);
  }
  const overrides = normalizeOverrides(input.overrides || []);
  assertUnique(overrides.map((row) => row.overrideId), 'override IDs');
  assertUnique(overrides.map((row) => row.restraintId), 'overridden restraint IDs');
  const sourceById = new Map(sourceModel.restraints.map((row) => [row.restraintId, row]));
  const overrideById = new Map(overrides.map((row) => [row.restraintId, row]));
  const blockers = [];

  overrides.forEach((override) => {
    if (!sourceById.has(override.restraintId)) {
      blockers.push(issue(
        'EFFECTIVE_RESTRAINT_OVERRIDE_TARGET_MISSING',
        override.restraintId,
        `Override ${override.overrideId} does not target a governed source restraint.`,
      ));
    }
  });

  const restraints = sourceModel.restraints.map((restraint) => {
    const sourceCapability = sourceCapabilityRecord(restraint);
    const override = overrideById.get(restraint.restraintId) || null;
    if (override) {
      if (override.supportSiteId !== restraint.supportKey) {
        blockers.push(issue(
          'EFFECTIVE_RESTRAINT_SUPPORT_SITE_MISMATCH',
          restraint.restraintId,
          `Override ${override.overrideId} is bound to a different support site.`,
        ));
      }
      blockers.push(...sourceSnapshotBlockers(sourceCapability, override, restraint.restraintId));
      if (override.effectiveDirection !== sourceCapability.direction && !override.effectiveAxis) {
        blockers.push(issue(
          'EFFECTIVE_RESTRAINT_AXIS_REQUIRED',
          restraint.restraintId,
          'A direction-changing effective restraint requires an explicit effective axis.',
        ));
      }
    }
    const effectiveCapability = override
      ? applyOverride(sourceCapability, override)
      : sourceCapability;
    return deepFreeze({
      restraintId: restraint.restraintId,
      supportSiteId: restraint.supportKey,
      attachmentId: restraint.attachmentId || null,
      attachedComponentKey: restraint.attachedComponentKey || null,
      sourceCapability,
      effectiveCapability,
      authority: override ? 'ACCEPTED_OVERRIDE' : 'SOURCE_RESTRAINT_CAPABILITY',
      overrideId: override?.overrideId || null,
      overrideReason: override?.reason || null,
      overrideSemanticHash: override?.semanticHash || null,
      geometryMutation: false,
      sourceQualification: restraint.qualification,
      solverEligible: restraint.solverEligible === true,
    });
  }).sort(byField('restraintId'));

  const normalizedBlockers = uniqueIssues(blockers);
  const base = {
    schema: NON_FEA_EFFECTIVE_RESTRAINT_CAPABILITY_SCHEMA,
    datasetId: sourceModel.datasetId,
    sharedModelSemanticHash: sourceModel.sharedModelSemanticHash,
    topologySemanticHash: sourceModel.topologySemanticHash,
    attachmentModelSemanticHash: sourceModel.attachmentModelSemanticHash,
    sourceRestraintCapabilitySemanticHash: sourceModel.semanticHash,
    state: normalizedBlockers.length ? 'BLOCKED' : 'READY',
    restraints,
    blockers: normalizedBlockers,
    policy: {
      topologyMutationPermitted: false,
      geometryMutationPermitted: false,
      calculationAuthorizationAuthority: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaEffectiveRestraintCapabilityModel(value) {
  const errors = [];
  if (!isRecord(value)) return deepFreeze({ ok: false, errors: ['Effective restraint model must be an object.'] });
  if (value.schema !== NON_FEA_EFFECTIVE_RESTRAINT_CAPABILITY_SCHEMA) {
    errors.push(`Expected ${NON_FEA_EFFECTIVE_RESTRAINT_CAPABILITY_SCHEMA}.`);
  }
  if (!['READY', 'BLOCKED'].includes(value.state)) errors.push('Effective restraint model state is invalid.');
  if (!validHash(value.sourceRestraintCapabilitySemanticHash)) {
    errors.push('Source restraint capability semantic hash is required.');
  }
  if (!Array.isArray(value.restraints)) errors.push('Effective restraint rows must be an array.');
  else {
    const ids = value.restraints.map((row) => row?.restraintId);
    if (ids.some((id) => !stringValue(id))) errors.push('Every effective restraint row requires restraintId.');
    if (new Set(ids).size !== ids.length) errors.push('Effective restraint IDs must be unique.');
    value.restraints.forEach((row) => validateRow(row, errors));
  }
  if (!Array.isArray(value.blockers)) errors.push('Effective restraint blockers must be an array.');
  if (value.semanticHash !== semanticHash(withoutHash(value))) {
    errors.push('Effective restraint semantic hash is invalid.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeOverrides(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Effective restraint overrides must be an array.');
  return rows.map((row) => {
    if (!isRecord(row)) throw new TypeError('Effective restraint override must be an object.');
    if (row.geometryMutation !== false) {
      throw new TypeError('Effective restraint override must set geometryMutation=false.');
    }
    return deepFreeze({
      overrideId: requiredText(row.overrideId, 'overrideId'),
      supportSiteId: requiredText(row.supportSiteId, 'supportSiteId'),
      restraintId: requiredText(row.restraintId, 'restraintId'),
      sourceType: nullableText(row.sourceType),
      effectiveType: requiredText(row.effectiveType, 'effectiveType'),
      sourceDirection: nullableText(row.sourceDirection),
      effectiveDirection: requiredText(row.effectiveDirection, 'effectiveDirection'),
      sourceAxis: nullableAxis(row.sourceAxis, 'sourceAxis'),
      effectiveAxis: nullableAxis(row.effectiveAxis, 'effectiveAxis'),
      sourceGapMm: nullableNumber(row.sourceGapMm, 'sourceGapMm', (number) => number >= 0),
      effectiveGapMm: nullableNumber(row.effectiveGapMm, 'effectiveGapMm', (number) => number >= 0),
      sourceStiffnessNPerM: nullableNumber(row.sourceStiffnessNPerM, 'sourceStiffnessNPerM', (number) => number > 0),
      effectiveStiffnessNPerM: nullableNumber(row.effectiveStiffnessNPerM, 'effectiveStiffnessNPerM', (number) => number > 0),
      sourceFriction: nullableNumber(row.sourceFriction, 'sourceFriction', (number) => number >= 0),
      effectiveFriction: nullableNumber(row.effectiveFriction, 'effectiveFriction', (number) => number >= 0),
      reason: requiredText(row.reason, 'reason'),
      geometryMutation: false,
      semanticHash: validHash(row.semanticHash) ? row.semanticHash : semanticHash({
        overrideId: row.overrideId,
        supportSiteId: row.supportSiteId,
        restraintId: row.restraintId,
        effectiveType: row.effectiveType,
        effectiveDirection: row.effectiveDirection,
        effectiveAxis: row.effectiveAxis || null,
        effectiveGapMm: row.effectiveGapMm ?? null,
        effectiveStiffnessNPerM: row.effectiveStiffnessNPerM ?? null,
        effectiveFriction: row.effectiveFriction ?? null,
        reason: row.reason,
        geometryMutation: false,
      }),
    });
  }).sort(byField('overrideId'));
}

function sourceCapabilityRecord(restraint) {
  const type = stringValue(restraint.supportType || 'SUPPORT').toUpperCase();
  const anchor = /(^|_)ANC(HOR)?($|_)/.test(type) || /ANCHOR/.test(type);
  return deepFreeze({
    type,
    direction: anchor ? 'ANC' : inferredDirection(restraint),
    explicitAxis: null,
    gapMm: firstEvidenceNumber(restraint.gapEvidence),
    stiffnessNPerM: firstEvidenceNumber(restraint.stiffnessEvidence),
    friction: firstEvidenceNumber(restraint.frictionEvidence),
    translationalStates: {
      vertical: restraint.vertical.state,
      lateral: restraint.lateral.state,
      longitudinal: restraint.longitudinal.state,
    },
  });
}

function inferredDirection(restraint) {
  const active = [
    ['VERTICAL', restraint.vertical.state],
    ['LATERAL', restraint.lateral.state],
    ['LONGITUDINAL', restraint.longitudinal.state],
  ].filter(([, state]) => ACTIVE_STATES.includes(state));
  return active.length === 1 ? active[0][0] : active.length > 1 ? 'MULTI' : 'UNRESOLVED';
}

function applyOverride(source, override) {
  return deepFreeze({
    ...source,
    type: override.effectiveType,
    direction: override.effectiveDirection,
    explicitAxis: override.effectiveAxis || null,
    gapMm: override.effectiveGapMm,
    stiffnessNPerM: override.effectiveStiffnessNPerM,
    friction: override.effectiveFriction,
  });
}

function sourceSnapshotBlockers(source, override, scope) {
  const checks = [
    ['sourceType', source.type, override.sourceType],
    ['sourceDirection', source.direction, override.sourceDirection],
    ['sourceGapMm', source.gapMm, override.sourceGapMm],
    ['sourceStiffnessNPerM', source.stiffnessNPerM, override.sourceStiffnessNPerM],
    ['sourceFriction', source.friction, override.sourceFriction],
  ];
  return checks
    .filter(([, actual, declared]) => declared !== null && !sameValue(actual, declared))
    .map(([field, actual, declared]) => issue(
      'EFFECTIVE_RESTRAINT_OVERRIDE_SOURCE_STALE',
      scope,
      `Override ${override.overrideId} ${field} does not match current source restraint authority.`,
      { field, expected: actual, actual: declared },
    ));
}

function validateRow(row, errors) {
  if (!isRecord(row)) return errors.push('Effective restraint row must be an object.');
  if (!['SOURCE_RESTRAINT_CAPABILITY', 'ACCEPTED_OVERRIDE'].includes(row.authority)) {
    errors.push(`Effective restraint ${row.restraintId} authority is invalid.`);
  }
  if (row.geometryMutation !== false) errors.push(`Effective restraint ${row.restraintId} cannot mutate geometry.`);
  if (!isRecord(row.sourceCapability) || !isRecord(row.effectiveCapability)) {
    errors.push(`Effective restraint ${row.restraintId} requires source/effective capability records.`);
  }
}

function firstEvidenceNumber(value) {
  const rows = Array.isArray(value)
    ? value
    : Object.values(value || {}).flatMap((row) => Array.isArray(row) ? row : []);
  for (const row of rows) {
    const number = Number(row?.value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function nullableAxis(value, field) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new TypeError(`${field} must be a finite 3-vector or null.`);
  }
  const magnitude = Math.hypot(...value);
  if (!(magnitude > 1e-12)) throw new TypeError(`${field} cannot be a zero vector.`);
  return deepFreeze(value.map((item) => item / magnitude));
}
function nullableNumber(value, field, predicate) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || !predicate(value)) throw new TypeError(`${field} is invalid.`);
  return value;
}
function nullableText(value) { return value === null || value === undefined ? null : requiredText(value, 'text'); }
function requiredText(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}
function sameValue(left, right) { return Object.is(left, right); }
function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique.`);
}
function issue(code, scope, message, details = null) { return deepFreeze({ code, severity: 'ERROR', scope, message, details }); }
function uniqueIssues(rows) {
  return [...new Map(rows.map((row) => [`${row.code}|${row.scope}|${row.message}`, row])).values()]
    .sort((left, right) => `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`));
}
function byField(field) { return (left, right) => String(left[field]).localeCompare(String(right[field])); }
function validHash(value) { return typeof value === 'string' && value.includes(':'); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function withoutHash(value) { const copy = structuredClone(value); delete copy.semanticHash; return copy; }
