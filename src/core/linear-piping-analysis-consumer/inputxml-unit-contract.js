import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { validateCanonicalGeometry } from '../geometry/validateCanonicalGeometry.js';
import {
  compareAscii,
  failInputXml,
  requireExactKeys,
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

export function inputXmlLengthUnitDefinition(unit) {
  return UNIT_DEFINITIONS[unit] ?? null;
}

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
    unitDefinitions: value.allowedSourceUnits.map((unit) => ({
      unit,
      ...UNIT_DEFINITIONS[unit],
    })),
    sourceEvidence: value.sourceEvidence,
  });
}

export function requireLinearPipingInputXmlUnitResult(value, profileValue) {
  requireRecord(value, 'inputXmlUnitResult');
  requireExactKeys(value, INPUTXML_UNIT_RESULT_KEYS, 'inputXmlUnitResult');
  const profile = requireLinearPipingInputXmlUnitProfile(profileValue);
  if (value.schema !== LINEAR_PIPING_INPUTXML_UNIT_RESULT_SCHEMA
    || value.profileId !== profile.profileId
    || value.profileSemanticHash !== profile.semanticHash
    || value.targetUnit !== 'm'
    || !profile.allowedSourceUnits.includes(value.sourceUnit)) {
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
  const validation = validateCanonicalGeometry(value.geometry, { requireKnownUnit: true });
  if (!validation.ok || value.geometry.unit !== 'm') {
    failInputXml('InputXML unit result geometry is invalid.', 'PIPING_INPUTXML_UNIT_RESULT_INVALID');
  }
  if (semanticHash(inputXmlGeometryProjection(value.geometry))
      !== value.normalizedGeometrySemanticHash
    || computeInputXmlUnitResultSemanticHash(value) !== value.semanticHash
    || computeInputXmlUnitResultEvidenceHash(value, profile) !== value.evidenceHash) {
    failInputXml('InputXML unit result hashes are stale.', 'PIPING_INPUTXML_UNIT_RESULT_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

export function computeInputXmlUnitResultSemanticHash(value) {
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

export function computeInputXmlUnitResultEvidenceHash(value, profile) {
  return semanticHash({
    semanticHash: value.semanticHash,
    profileSourceEvidence: profile.sourceEvidence,
    geometryDiagnosticCodes: (value.geometry.diagnostics ?? [])
      .map((row) => row.code)
      .filter(Boolean),
  });
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

export function inputXmlGeometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, valid: _valid, ...projection } = geometry;
  return projection;
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
  requireExactKeys(
    value,
    ['authority', 'documentId', 'revision', 'sourceSemanticHash'],
    'inputXmlUnitProfile.sourceEvidence',
  );
  requireText(value.authority, 'inputXmlUnitProfile.sourceEvidence.authority');
  requireText(value.documentId, 'inputXmlUnitProfile.sourceEvidence.documentId');
  requireText(value.revision, 'inputXmlUnitProfile.sourceEvidence.revision');
  requireHash(value.sourceSemanticHash, 'inputXmlUnitProfile.sourceEvidence.sourceSemanticHash');
  return deepFreeze({ ...value });
}
