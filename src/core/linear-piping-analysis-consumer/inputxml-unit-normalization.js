import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { CANONICAL_GEOMETRY_SCHEMA_VERSION } from '../geometry/geometryTypes.js';
import { validateCanonicalGeometry } from '../geometry/validateCanonicalGeometry.js';
import {
  compareAscii,
  failInputXml,
  requireExactKeys,
  requireFinite,
  requireHash,
  requireRecord,
  requireText,
} from './inputxml-source-contract.js';

export const INPUTXML_LENGTH_UNIT_REGISTRY_ID = 'INPUTXML-LENGTH-TO-METRE-EXACT-R1';
export const LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA =
  'linear-piping-inputxml-unit-normalization-profile/v1';
export const LINEAR_PIPING_INPUTXML_UNIT_RESULT_SCHEMA =
  'linear-piping-inputxml-unit-normalization/v1';
export const INPUTXML_UNIT_PROFILE_KEYS = Object.freeze([
  'schema', 'profileId', 'registryId', 'allowedSourceUnits', 'sourceEvidence', 'semanticHash',
]);
export const INPUTXML_UNIT_RESULT_KEYS = Object.freeze([
  'schema', 'profileId', 'profileSemanticHash', 'sourceUnit', 'targetUnit', 'scale',
  'inputGeometrySemanticHash', 'normalizedGeometrySemanticHash', 'geometry',
  'semanticHash', 'evidenceHash',
]);

const UNIT_DEFINITIONS = Object.freeze({
  m: Object.freeze({ numerator: 1, denominator: 1 }),
  mm: Object.freeze({ numerator: 1, denominator: 1000 }),
  cm: Object.freeze({ numerator: 1, denominator: 100 }),
  in: Object.freeze({ numerator: 127, denominator: 5000 }),
  ft: Object.freeze({ numerator: 381, denominator: 1250 }),
});
const LENGTH_META_FIELDS = Object.freeze(['bendDeclaredRadius', 'bendComputedRadius']);
const DIMENSIONLESS_META_FIELDS = new Set([
  'materialNumber', 'sourceType', 'sourceIndex', 'bendAngle1', 'bendAngle2',
  'numMiter', 'bendCompoundMiter',
]);

export function sealLinearPipingInputXmlUnitProfile(input) {
  requireRecord(input, 'inputXmlUnitProfile');
  requireExactKeys(input, INPUTXML_UNIT_PROFILE_KEYS, 'inputXmlUnitProfile');
  if (input.schema !== LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA
    || input.registryId !== INPUTXML_LENGTH_UNIT_REGISTRY_ID) {
    failInputXml('InputXML unit profile authority is unsupported.', 'PIPING_INPUTXML_UNIT_PROFILE_INVALID');
  }
  const allowedSourceUnits = requireAllowedUnits(input.allowedSourceUnits);
  const sourceEvidence = requireSourceEvidence(input.sourceEvidence);
  const draft = {
    schema: input.schema,
    profileId: requireText(input.profileId, 'inputXmlUnitProfile.profileId'),
    registryId: input.registryId,
    allowedSourceUnits,
    sourceEvidence,
    semanticHash: '',
  };
  draft.semanticHash = computeInputXmlUnitProfileSemanticHash(draft);
  if (input.semanticHash !== '' && input.semanticHash !== draft.semanticHash) {
    failInputXml('InputXML unit profile hash is stale.', 'PIPING_INPUTXML_UNIT_PROFILE_HASH_MISMATCH');
  }
  return deepFreeze(draft);
}

export function requireLinearPipingInputXmlUnitProfile(value) {
  const sealed = sealLinearPipingInputXmlUnitProfile(value);
  if (value.semanticHash !== sealed.semanticHash) {
    failInputXml('InputXML unit profile must carry its current hash.', 'PIPING_INPUTXML_UNIT_PROFILE_HASH_MISMATCH');
  }
  return sealed;
}

export function computeInputXmlUnitProfileSemanticHash(value) {
  return semanticHash({
    schema: value.schema,
    profileId: value.profileId,
    registryId: value.registryId,
    allowedSourceUnits: [...value.allowedSourceUnits],
    unitDefinitions: value.allowedSourceUnits.map((unit) => ({ unit, ...UNIT_DEFINITIONS[unit] })),
    sourceEvidence: value.sourceEvidence,
  });
}

export function normalizeLinearPipingInputXmlGeometry(geometry, profileValue) {
  const profile = requireLinearPipingInputXmlUnitProfile(profileValue);
  requireInputXmlGeometry(geometry);
  const sourceUnit = requireText(geometry.unit, 'inputXmlGeometry.unit');
  const scale = UNIT_DEFINITIONS[sourceUnit];
  if (!scale || !profile.allowedSourceUnits.includes(sourceUnit)) {
    failInputXml('InputXML source unit is not authorized by the normalization profile.', 'PIPING_INPUTXML_UNIT_NOT_AUTHORIZED');
  }
  const inputGeometrySemanticHash = semanticHash(geometryProjection(geometry));
  const normalized = normalizeGeometry(geometry, scale, sourceUnit, profile);
  const validation = validateCanonicalGeometry(normalized, { requireKnownUnit: true });
  if (!validation.ok || normalized.unit !== 'm') {
    failInputXml('Normalized InputXML geometry is invalid.', 'PIPING_INPUTXML_UNIT_NORMALIZATION_INVALID', {
      errors: validation.errors.map((row) => row.code),
    });
  }
  const normalizedGeometrySemanticHash = semanticHash(geometryProjection(normalized));
  const draft = {
    schema: LINEAR_PIPING_INPUTXML_UNIT_RESULT_SCHEMA,
    profileId: profile.profileId,
    profileSemanticHash: profile.semanticHash,
    sourceUnit,
    targetUnit: 'm',
    scale: { ...scale },
    inputGeometrySemanticHash,
    normalizedGeometrySemanticHash,
    geometry: normalized,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInputXmlUnitResultSemanticHash(draft);
  draft.evidenceHash = computeInputXmlUnitResultEvidenceHash(draft, profile);
  return requireLinearPipingInputXmlUnitResult(draft, profile);
}

export function requireLinearPipingInputXmlUnitResult(value, profileValue) {
  requireRecord(value, 'inputXmlUnitResult');
  requireExactKeys(value, INPUTXML_UNIT_RESULT_KEYS, 'inputXmlUnitResult');
  const profile = requireLinearPipingInputXmlUnitProfile(profileValue);
  if (value.schema !== LINEAR_PIPING_INPUTXML_UNIT_RESULT_SCHEMA
    || value.profileId !== profile.profileId
    || value.profileSemanticHash !== profile.semanticHash
    || value.targetUnit !== 'm') {
    failInputXml('InputXML unit result authority is invalid.', 'PIPING_INPUTXML_UNIT_RESULT_INVALID');
  }
  const expectedScale = UNIT_DEFINITIONS[value.sourceUnit];
  requireExactKeys(value.scale, ['numerator', 'denominator'], 'inputXmlUnitResult.scale');
  if (!expectedScale || value.scale.numerator !== expectedScale.numerator
    || value.scale.denominator !== expectedScale.denominator) {
    failInputXml('InputXML unit result scale is invalid.', 'PIPING_INPUTXML_UNIT_SCALE_MISMATCH');
  }
  for (const field of [
    'profileSemanticHash', 'inputGeometrySemanticHash', 'normalizedGeometrySemanticHash',
    'semanticHash', 'evidenceHash',
  ]) requireHash(value[field], `inputXmlUnitResult.${field}`);
  requireInputXmlGeometry(value.geometry, 'm');
  if (semanticHash(geometryProjection(value.geometry)) !== value.normalizedGeometrySemanticHash
    || computeInputXmlUnitResultSemanticHash(value) !== value.semanticHash
    || computeInputXmlUnitResultEvidenceHash(value, profile) !== value.evidenceHash) {
    failInputXml('InputXML unit result hashes are stale.', 'PIPING_INPUTXML_UNIT_RESULT_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

export function inputXmlUnitEvidenceProjection(result) {
  return deepFreeze({
    schema: result.schema,
    profileId: result.profileId,
    profileSemanticHash: result.profileSemanticHash,
    sourceUnit: result.sourceUnit,
    targetUnit: result.targetUnit,
    scale: { ...result.scale },
    inputGeometrySemanticHash: result.inputGeometrySemanticHash,
    normalizedGeometrySemanticHash: result.normalizedGeometrySemanticHash,
    semanticHash: result.semanticHash,
    evidenceHash: result.evidenceHash,
  });
}

function computeInputXmlUnitResultSemanticHash(value) {
  return semanticHash({
    schema: value.schema,
    profileId: value.profileId,
    profileSemanticHash: value.profileSemanticHash,
    sourceUnit: value.sourceUnit,
    targetUnit: value.targetUnit,
    scale: value.scale,
    inputGeometrySemanticHash: value.inputGeometrySemanticHash,
    normalizedGeometrySemanticHash: value.normalizedGeometrySemanticHash,
  });
}

function computeInputXmlUnitResultEvidenceHash(value, profile) {
  return semanticHash({
    semanticHash: value.semanticHash,
    profileSourceEvidence: profile.sourceEvidence,
    geometryDiagnosticCodes: (value.geometry.diagnostics ?? []).map((row) => row.code).filter(Boolean),
  });
}

function normalizeGeometry(geometry, scale, sourceUnit, profile) {
  const nodes = geometry.nodes.map((node, index) => normalizeNode(node, scale, index));
  const segments = geometry.segments.map((segment, index) => normalizeSegment(segment, scale, index));
  const diagnostic = {
    severity: 'info',
    code: 'INPUTXML_LENGTH_UNIT_NORMALIZED',
    message: `InputXML geometry normalized from ${sourceUnit} to m.`,
    data: {
      sourceUnit,
      targetUnit: 'm',
      numerator: scale.numerator,
      denominator: scale.denominator,
      profileSemanticHash: profile.semanticHash,
    },
  };
  return deepFreeze({
    ...structuredClone(geometry),
    nodes,
    segments,
    unit: 'm',
    diagnostics: [...(geometry.diagnostics ?? []).map((row) => structuredClone(row)), diagnostic],
    summary: geometry.summary ? { ...structuredClone(geometry.summary), unit: 'm' } : geometry.summary,
  });
}

function normalizeNode(node, scale, index) {
  requireRecord(node, `inputXmlGeometry.nodes[${index}]`);
  rejectUnknownNumericMetadata(node.meta, new Set(['caesarNodeNumber']), `nodes[${index}].meta`);
  return {
    ...structuredClone(node),
    x: scaleNumber(node.x, scale, `nodes[${index}].x`),
    y: scaleNumber(node.y, scale, `nodes[${index}].y`),
    z: scaleNumber(node.z, scale, `nodes[${index}].z`),
  };
}

function normalizeSegment(segment, scale, index) {
  requireRecord(segment, `inputXmlGeometry.segments[${index}]`);
  const result = { ...structuredClone(segment) };
  for (const field of ['length', 'diameter', 'thickness']) {
    if (typeof segment[field] === 'number') result[field] = scaleNumber(segment[field], scale, `segments[${index}].${field}`);
  }
  const meta = segment.meta ? { ...structuredClone(segment.meta) } : segment.meta;
  if (meta) {
    for (const field of LENGTH_META_FIELDS) {
      if (typeof meta[field] === 'number') meta[field] = scaleNumber(meta[field], scale, `segments[${index}].meta.${field}`);
    }
    if (meta.bendArcCentre) meta.bendArcCentre = normalizePoint(meta.bendArcCentre, scale, `segments[${index}].meta.bendArcCentre`);
    rejectUnknownNumericMetadata(meta, new Set([...DIMENSIONLESS_META_FIELDS, ...LENGTH_META_FIELDS, 'bendArcCentre']), `segments[${index}].meta`);
    result.meta = meta;
  }
  rejectUnknownNumericFields(segment, new Set(['length', 'diameter', 'thickness']), `segments[${index}]`);
  return result;
}

function normalizePoint(point, scale, field) {
  requireRecord(point, field);
  requireExactKeys(point, ['x', 'y', 'z'], field);
  return {
    x: scaleNumber(point.x, scale, `${field}.x`),
    y: scaleNumber(point.y, scale, `${field}.y`),
    z: scaleNumber(point.z, scale, `${field}.z`),
  };
}

function requireInputXmlGeometry(geometry, expectedUnit) {
  requireRecord(geometry, 'inputXmlGeometry');
  if (geometry.schemaVersion !== CANONICAL_GEOMETRY_SCHEMA_VERSION
    || !Array.isArray(geometry.nodes) || !Array.isArray(geometry.segments)
    || (expectedUnit && geometry.unit !== expectedUnit)) {
    failInputXml('InputXML canonical geometry is invalid.', 'PIPING_INPUTXML_UNIT_GEOMETRY_INVALID');
  }
}

function requireAllowedUnits(value) {
  if (!Array.isArray(value) || value.length === 0) {
    failInputXml('InputXML allowed source units must be non-empty.', 'PIPING_INPUTXML_UNIT_PROFILE_INVALID');
  }
  const units = value.map((unit) => requireText(unit, 'allowedSourceUnits item')).sort(compareAscii);
  if (new Set(units).size !== units.length || units.some((unit) => !UNIT_DEFINITIONS[unit])) {
    failInputXml('InputXML allowed source units are invalid.', 'PIPING_INPUTXML_UNIT_PROFILE_INVALID');
  }
  return Object.freeze(units);
}

function requireSourceEvidence(value) {
  requireRecord(value, 'inputXmlUnitProfile.sourceEvidence');
  requireExactKeys(value, ['authority', 'documentId', 'revision', 'sourceSemanticHash'], 'inputXmlUnitProfile.sourceEvidence');
  requireText(value.authority, 'inputXmlUnitProfile.sourceEvidence.authority');
  requireText(value.documentId, 'inputXmlUnitProfile.sourceEvidence.documentId');
  requireText(value.revision, 'inputXmlUnitProfile.sourceEvidence.revision');
  requireHash(value.sourceSemanticHash, 'inputXmlUnitProfile.sourceEvidence.sourceSemanticHash');
  return deepFreeze({ ...value });
}

function scaleNumber(value, scale, field) {
  return cleanNumber((requireFinite(value, field) * scale.numerator) / scale.denominator);
}

function rejectUnknownNumericFields(value, allowed, field) {
  for (const [key, entry] of Object.entries(value)) {
    if (allowed.has(key) || ['id', 'startNodeId', 'endNodeId', 'type', 'sourceComponentUid', 'material', 'meta'].includes(key)) continue;
    if (typeof entry === 'number' || containsNumericLeaf(entry)) {
      failInputXml(`${field}.${key} may contain an unclassified length.`, 'PIPING_INPUTXML_UNIT_FIELD_UNCLASSIFIED');
    }
  }
}

function rejectUnknownNumericMetadata(value, allowed, field) {
  if (value === undefined || value === null) return;
  if (!isPlainRecord(value)) failInputXml(`${field} must be a record.`, 'PIPING_INPUTXML_UNIT_FIELD_UNCLASSIFIED');
  for (const [key, entry] of Object.entries(value)) {
    if (allowed.has(key)) continue;
    if (typeof entry === 'number' || containsNumericLeaf(entry)) {
      failInputXml(`${field}.${key} may contain an unclassified length.`, 'PIPING_INPUTXML_UNIT_FIELD_UNCLASSIFIED');
    }
  }
}

function containsNumericLeaf(value) {
  if (typeof value === 'number') return true;
  if (Array.isArray(value)) return value.some(containsNumericLeaf);
  if (isPlainRecord(value)) return Object.values(value).some(containsNumericLeaf);
  return false;
}

function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, valid: _valid, ...projection } = geometry;
  return projection;
}
