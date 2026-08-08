import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import {
  THERMAL_LIFTOFF_BLOCKER_CODES,
  requireThermalLiftoffSourceIdentity,
} from './empirical-thermal-liftoff-authority.js';

export const THERMAL_FREE_EXPANSION_EVIDENCE_SCHEMA =
  'empirical-thermal-free-expansion-evidence/v1';
export const THERMAL_LIFTOFF_DISPLACEMENT_MAPPING_EVIDENCE_SCHEMA =
  'empirical-thermal-liftoff-displacement-mapping-evidence/v1';
export const THERMAL_LIFTOFF_USED_DISPLACEMENT_SCHEMA =
  'empirical-thermal-liftoff-used-displacement/v1';

const QUALIFIED_PROVENANCE = Object.freeze([
  'SOURCE_BACKED_SUPPORT_DISPLACEMENT',
  'QUALIFIED_FREE_EXPANSION_TO_SUPPORT_MAPPING',
]);

export function createThermalFreeExpansionEvidence(input) {
  exactKeys(input, [
    'evidenceId', 'referenceTemperatureC', 'analysisTemperatureC',
    'thermalExpansionPerK', 'activeLengthM', 'source',
  ], 'thermal free-expansion evidence input');
  const referenceTemperatureC = finite(input.referenceTemperatureC, 'referenceTemperatureC');
  const analysisTemperatureC = finite(input.analysisTemperatureC, 'analysisTemperatureC');
  const thermalExpansionPerK = nonnegative(input.thermalExpansionPerK, 'thermalExpansionPerK');
  const activeLengthM = positive(input.activeLengthM, 'activeLengthM');
  const deltaTemperatureK = analysisTemperatureC - referenceTemperatureC;
  const draft = {
    schema: THERMAL_FREE_EXPANSION_EVIDENCE_SCHEMA,
    evidenceId: requiredString(input.evidenceId, 'evidenceId'),
    evidenceKind: 'FREE_EXPANSION_ONLY',
    referenceTemperatureC,
    analysisTemperatureC,
    deltaTemperatureK,
    thermalExpansionPerK,
    activeLengthM,
    freeExpansionM: thermalExpansionPerK * deltaTemperatureK * activeLengthM,
    source: requireThermalLiftoffSourceIdentity(input.source, 'free-expansion source'),
    tl03Eligibility: 'EVIDENCE_ONLY',
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalFreeExpansionEvidence(value) {
  exactKeys(value, [
    'schema', 'evidenceId', 'evidenceKind', 'referenceTemperatureC',
    'analysisTemperatureC', 'deltaTemperatureK', 'thermalExpansionPerK',
    'activeLengthM', 'freeExpansionM', 'source', 'tl03Eligibility', 'semanticHash',
  ], 'thermal free-expansion evidence');
  if (value.schema !== THERMAL_FREE_EXPANSION_EVIDENCE_SCHEMA
    || value.evidenceKind !== 'FREE_EXPANSION_ONLY'
    || value.tl03Eligibility !== 'EVIDENCE_ONLY') {
    throw codedError('Free-expansion evidence cannot be promoted to TL-03 displacement.', 'THERMAL_FREE_EXPANSION_EVIDENCE_INVALID');
  }
  const normalized = createThermalFreeExpansionEvidence({
    evidenceId: value.evidenceId,
    referenceTemperatureC: value.referenceTemperatureC,
    analysisTemperatureC: value.analysisTemperatureC,
    thermalExpansionPerK: value.thermalExpansionPerK,
    activeLengthM: value.activeLengthM,
    source: value.source,
  });
  if (normalized.deltaTemperatureK !== value.deltaTemperatureK
    || normalized.freeExpansionM !== value.freeExpansionM
    || normalized.semanticHash !== value.semanticHash) {
    throw codedError('Thermal free-expansion evidence is stale or tampered.', 'THERMAL_FREE_EXPANSION_EVIDENCE_HASH_MISMATCH');
  }
  return normalized;
}

export function createThermalLiftoffDisplacementMappingEvidence(input) {
  exactKeys(input, [
    'mappingId', 'mappingRevision', 'sourceFreeExpansionEvidenceSemanticHash',
    'applicabilitySemanticHash', 'source', 'qualification',
  ], 'thermal lift-off displacement mapping evidence input');
  if (input.qualification !== 'QUALIFIED') {
    throw codedError(
      'Free-expansion-to-support mapping must carry explicit QUALIFIED authority.',
      THERMAL_LIFTOFF_BLOCKER_CODES.DISPLACEMENT_AUTHORITY_MISSING,
    );
  }
  const draft = {
    schema: THERMAL_LIFTOFF_DISPLACEMENT_MAPPING_EVIDENCE_SCHEMA,
    mappingId: requiredString(input.mappingId, 'mappingId'),
    mappingRevision: requiredString(input.mappingRevision, 'mappingRevision'),
    sourceFreeExpansionEvidenceSemanticHash: requiredHash(
      input.sourceFreeExpansionEvidenceSemanticHash,
      'sourceFreeExpansionEvidenceSemanticHash',
    ),
    applicabilitySemanticHash: requiredHash(
      input.applicabilitySemanticHash,
      'applicabilitySemanticHash',
    ),
    source: requireThermalLiftoffSourceIdentity(input.source, 'displacement mapping source'),
    qualification: 'QUALIFIED',
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalLiftoffDisplacementMappingEvidence(value) {
  exactKeys(value, [
    'schema', 'mappingId', 'mappingRevision', 'sourceFreeExpansionEvidenceSemanticHash',
    'applicabilitySemanticHash', 'source', 'qualification', 'semanticHash',
  ], 'thermal lift-off displacement mapping evidence');
  if (value.schema !== THERMAL_LIFTOFF_DISPLACEMENT_MAPPING_EVIDENCE_SCHEMA) {
    throw codedError('Unexpected displacement mapping evidence schema.', 'THERMAL_LIFTOFF_DISPLACEMENT_MAPPING_SCHEMA_INVALID');
  }
  const normalized = createThermalLiftoffDisplacementMappingEvidence({
    mappingId: value.mappingId,
    mappingRevision: value.mappingRevision,
    sourceFreeExpansionEvidenceSemanticHash: value.sourceFreeExpansionEvidenceSemanticHash,
    applicabilitySemanticHash: value.applicabilitySemanticHash,
    source: value.source,
    qualification: value.qualification,
  });
  if (normalized.semanticHash !== value.semanticHash) {
    throw codedError('Displacement mapping evidence semantic hash mismatch.', 'THERMAL_LIFTOFF_DISPLACEMENT_MAPPING_HASH_MISMATCH');
  }
  return normalized;
}

export function createThermalLiftoffUsedDisplacement(input) {
  exactKeys(input, [
    'displacementId', 'loadCaseId', 'supportSiteId', 'coordinateFrame',
    'pipeDisplacementM', 'supportDisplacementM', 'provenance', 'source',
    'mappingEvidence', 'horizontalComponentAuthority',
  ], 'thermal lift-off used-displacement input');

  const displacementId = requiredString(input.displacementId, 'displacementId');
  const loadCaseId = requiredString(input.loadCaseId, 'loadCaseId');
  const supportSiteId = requiredString(input.supportSiteId, 'supportSiteId');
  const coordinateFrame = requireCoordinateFrame(input.coordinateFrame);
  const pipeDisplacementM = requireVector(input.pipeDisplacementM, 'pipeDisplacementM');
  const supportDisplacementM = requireVector(input.supportDisplacementM, 'supportDisplacementM');
  const relativeDisplacementM = vectorSubtract(pipeDisplacementM, supportDisplacementM);
  const horizontalRelativeMagnitudeM = Math.hypot(
    relativeDisplacementM.x,
    relativeDisplacementM.y,
  );
  const source = requireThermalLiftoffSourceIdentity(input.source, 'used displacement source');
  const provenance = requiredString(input.provenance, 'provenance');
  const blockers = [];
  let mappingEvidence = null;
  let horizontalComponentAuthority = null;

  if (coordinateFrame.basis !== 'GLOBAL_Z_UP'
    || !sameVector(coordinateFrame.verticalUnitVector, { x: 0, y: 0, z: 1 })) {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.SUPPORT_DIRECTION_AMBIGUOUS,
      supportSiteId,
      'TL-03 requires displacement vectors resolved in the governed GLOBAL_Z_UP basis.',
    ));
  }

  if (provenance === 'QUALIFIED_FREE_EXPANSION_TO_SUPPORT_MAPPING') {
    if (!input.mappingEvidence) {
      blockers.push(blocker(
        THERMAL_LIFTOFF_BLOCKER_CODES.DISPLACEMENT_AUTHORITY_MISSING,
        supportSiteId,
        'A separately qualified free-expansion-to-support mapping is required.',
      ));
    } else {
      mappingEvidence = requireThermalLiftoffDisplacementMappingEvidence(input.mappingEvidence);
    }
  } else if (provenance === 'SOURCE_BACKED_SUPPORT_DISPLACEMENT') {
    if (input.mappingEvidence !== null) {
      throw new TypeError('Source-backed support displacement must not carry mappingEvidence.');
    }
  } else {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.DISPLACEMENT_AUTHORITY_MISSING,
      supportSiteId,
      'Only source-backed support displacement or a separately qualified mapping is TL-03 eligible.',
    ));
  }

  if (horizontalRelativeMagnitudeM > 0) {
    if (!input.horizontalComponentAuthority) {
      blockers.push(blocker(
        THERMAL_LIFTOFF_BLOCKER_CODES.HORIZONTAL_COMPONENT_UNQUALIFIED,
        supportSiteId,
        'Non-zero horizontal relative movement has no owner-qualified applicability assessment.',
      ));
    } else {
      horizontalComponentAuthority = requireHorizontalComponentAuthority(
        input.horizontalComponentAuthority,
      );
    }
  } else if (input.horizontalComponentAuthority !== null) {
    horizontalComponentAuthority = requireHorizontalComponentAuthority(
      input.horizontalComponentAuthority,
    );
  }

  const qualification = blockers.length === 0 && QUALIFIED_PROVENANCE.includes(provenance)
    ? 'QUALIFIED'
    : 'UNRESOLVED';
  const draft = {
    schema: THERMAL_LIFTOFF_USED_DISPLACEMENT_SCHEMA,
    displacementId,
    loadCaseId,
    supportSiteId,
    coordinateFrame,
    pipeDisplacementM,
    supportDisplacementM,
    relativeDisplacementM,
    usedUpwardRelativeDisplacementM: qualification === 'QUALIFIED'
      ? relativeDisplacementM.z
      : null,
    horizontalRelativeMagnitudeM,
    provenance,
    source,
    mappingEvidence,
    horizontalComponentAuthority,
    qualification,
    blockers,
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

export function requireThermalLiftoffUsedDisplacement(value) {
  exactKeys(value, [
    'schema', 'displacementId', 'loadCaseId', 'supportSiteId', 'coordinateFrame',
    'pipeDisplacementM', 'supportDisplacementM', 'relativeDisplacementM',
    'usedUpwardRelativeDisplacementM', 'horizontalRelativeMagnitudeM', 'provenance',
    'source', 'mappingEvidence', 'horizontalComponentAuthority', 'qualification',
    'blockers', 'semanticHash',
  ], 'thermal lift-off used displacement');
  if (value.schema !== THERMAL_LIFTOFF_USED_DISPLACEMENT_SCHEMA) {
    throw codedError('Unexpected TL-03 used-displacement schema.', 'THERMAL_LIFTOFF_DISPLACEMENT_SCHEMA_INVALID');
  }
  const normalized = createThermalLiftoffUsedDisplacement({
    displacementId: value.displacementId,
    loadCaseId: value.loadCaseId,
    supportSiteId: value.supportSiteId,
    coordinateFrame: value.coordinateFrame,
    pipeDisplacementM: value.pipeDisplacementM,
    supportDisplacementM: value.supportDisplacementM,
    provenance: value.provenance,
    source: value.source,
    mappingEvidence: value.mappingEvidence,
    horizontalComponentAuthority: value.horizontalComponentAuthority,
  });
  if (normalized.qualification !== value.qualification
    || normalized.usedUpwardRelativeDisplacementM !== value.usedUpwardRelativeDisplacementM
    || normalized.horizontalRelativeMagnitudeM !== value.horizontalRelativeMagnitudeM
    || semanticHash(normalized.blockers) !== semanticHash(value.blockers)
    || normalized.semanticHash !== value.semanticHash) {
    throw codedError('TL-03 used displacement is stale or tampered.', 'THERMAL_LIFTOFF_DISPLACEMENT_HASH_MISMATCH');
  }
  return normalized;
}

function requireCoordinateFrame(value) {
  exactKeys(value, ['basis', 'verticalUnitVector', 'semanticHash'], 'displacement coordinate frame');
  const payload = {
    basis: requiredString(value.basis, 'coordinateFrame.basis'),
    verticalUnitVector: requireVector(value.verticalUnitVector, 'coordinateFrame.verticalUnitVector'),
  };
  if (value.semanticHash !== semanticHash(payload)) {
    throw codedError('Displacement coordinate-frame semantic hash mismatch.', 'THERMAL_LIFTOFF_COORDINATE_FRAME_HASH_MISMATCH');
  }
  return deepFreeze({ ...payload, semanticHash: value.semanticHash });
}

function requireHorizontalComponentAuthority(value) {
  exactKeys(value, ['assessmentId', 'status', 'authoritySemanticHash'], 'horizontal component authority');
  if (value.status !== 'QUALIFIED_WITHIN_LIMIT') {
    throw codedError(
      'Horizontal component authority must be explicitly QUALIFIED_WITHIN_LIMIT.',
      THERMAL_LIFTOFF_BLOCKER_CODES.HORIZONTAL_COMPONENT_UNQUALIFIED,
    );
  }
  return deepFreeze({
    assessmentId: requiredString(value.assessmentId, 'assessmentId'),
    status: value.status,
    authoritySemanticHash: requiredHash(value.authoritySemanticHash, 'authoritySemanticHash'),
  });
}

function requireVector(value, label) {
  exactKeys(value, ['x', 'y', 'z'], label);
  return deepFreeze({
    x: finite(value.x, `${label}.x`),
    y: finite(value.y, `${label}.y`),
    z: finite(value.z, `${label}.z`),
  });
}

function vectorSubtract(left, right) {
  return deepFreeze({
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  });
}

function sameVector(left, right) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function blocker(code, scope, message) {
  return deepFreeze({ code, severity: 'ERROR', scope, message });
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} must be a non-empty string.`);
  return normalized;
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function positive(value, label) {
  const result = finite(value, label);
  if (result <= 0) throw new TypeError(`${label} must be positive.`);
  return result;
}

function nonnegative(value, label) {
  const result = finite(value, label);
  if (result < 0) throw new TypeError(`${label} must be non-negative.`);
  return result;
}

function requiredHash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  }
  return value;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
