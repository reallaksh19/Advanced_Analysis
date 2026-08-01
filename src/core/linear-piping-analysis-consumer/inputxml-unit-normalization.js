import { cleanNumber } from '../shared-analysis-contract/numeric.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { CANONICAL_GEOMETRY_SCHEMA_VERSION } from '../geometry/geometryTypes.js';
import { validateCanonicalGeometry } from '../geometry/validateCanonicalGeometry.js';
import {
  failInputXml,
  requireExactKeys,
  requireFinite,
  requireRecord,
  requireText,
} from './inputxml-source-contract.js';
import {
  LINEAR_PIPING_INPUTXML_UNIT_RESULT_SCHEMA,
  computeInputXmlUnitResultEvidenceHash,
  computeInputXmlUnitResultSemanticHash,
  inputXmlGeometryProjection,
  inputXmlLengthUnitDefinition,
  requireLinearPipingInputXmlUnitProfile,
  requireLinearPipingInputXmlUnitResult,
} from './inputxml-unit-contract.js';

const LENGTH_META_FIELDS = Object.freeze(['bendDeclaredRadius', 'bendComputedRadius']);
const DIMENSIONLESS_META_FIELDS = new Set([
  'materialNumber', 'sourceType', 'sourceIndex', 'bendAngle1', 'bendAngle2',
  'numMiter', 'bendCompoundMiter',
]);

export function normalizeLinearPipingInputXmlGeometry(geometry, profileValue) {
  const profile = requireLinearPipingInputXmlUnitProfile(profileValue);
  requireInputXmlGeometry(geometry);
  const sourceUnit = requireText(geometry.unit, 'inputXmlGeometry.unit');
  const scale = inputXmlLengthUnitDefinition(sourceUnit);
  if (!scale || !profile.allowedSourceUnits.includes(sourceUnit)) {
    failInputXml(
      'InputXML source unit is not authorized by the normalization profile.',
      'PIPING_INPUTXML_UNIT_NOT_AUTHORIZED',
    );
  }
  const inputGeometrySemanticHash = semanticHash(inputXmlGeometryProjection(geometry));
  const normalized = normalizeGeometry(geometry, scale, sourceUnit, profile);
  const validation = validateCanonicalGeometry(normalized, { requireKnownUnit: true });
  if (!validation.ok || normalized.unit !== 'm') {
    failInputXml(
      'Normalized InputXML geometry is invalid.',
      'PIPING_INPUTXML_UNIT_NORMALIZATION_INVALID',
      { errors: validation.errors.map((row) => row.code) },
    );
  }
  const normalizedGeometrySemanticHash = semanticHash(inputXmlGeometryProjection(normalized));
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

function normalizeGeometry(geometry, scale, sourceUnit, profile) {
  const nodes = geometry.nodes.map((node, index) => normalizeNode(node, scale, index));
  const segments = geometry.segments.map((segment, index) => (
    normalizeSegment(segment, scale, index)
  ));
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
  rejectUnknownNumericMetadata(
    node.meta,
    new Set(['caesarNodeNumber']),
    `nodes[${index}].meta`,
  );
  rejectUnknownNumericFields(node, new Set(['x', 'y', 'z']), `nodes[${index}]`);
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
    if (typeof segment[field] === 'number') {
      result[field] = scaleNumber(segment[field], scale, `segments[${index}].${field}`);
    }
  }
  const meta = segment.meta ? { ...structuredClone(segment.meta) } : segment.meta;
  if (meta) {
    for (const field of LENGTH_META_FIELDS) {
      if (typeof meta[field] === 'number') {
        meta[field] = scaleNumber(meta[field], scale, `segments[${index}].meta.${field}`);
      }
    }
    if (meta.bendArcCentre) {
      meta.bendArcCentre = normalizePoint(
        meta.bendArcCentre,
        scale,
        `segments[${index}].meta.bendArcCentre`,
      );
    }
    rejectUnknownNumericMetadata(
      meta,
      new Set([...DIMENSIONLESS_META_FIELDS, ...LENGTH_META_FIELDS, 'bendArcCentre']),
      `segments[${index}].meta`,
    );
    result.meta = meta;
  }
  rejectUnknownNumericFields(
    segment,
    new Set(['length', 'diameter', 'thickness']),
    `segments[${index}]`,
  );
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

function requireInputXmlGeometry(geometry) {
  requireRecord(geometry, 'inputXmlGeometry');
  if (geometry.schemaVersion !== CANONICAL_GEOMETRY_SCHEMA_VERSION
    || !Array.isArray(geometry.nodes) || !Array.isArray(geometry.segments)) {
    failInputXml(
      'InputXML canonical geometry is invalid.',
      'PIPING_INPUTXML_UNIT_GEOMETRY_INVALID',
    );
  }
}

function scaleNumber(value, scale, field) {
  return cleanNumber((requireFinite(value, field) * scale.numerator) / scale.denominator);
}

function rejectUnknownNumericFields(value, allowed, field) {
  const structural = new Set([
    'id', 'startNodeId', 'endNodeId', 'type', 'sourceComponentUid', 'restraint',
    'material', 'meta',
  ]);
  for (const [key, entry] of Object.entries(value)) {
    if (allowed.has(key) || structural.has(key)) continue;
    if (typeof entry === 'number' || containsNumericLeaf(entry)) {
      failInputXml(
        `${field}.${key} may contain an unclassified length.`,
        'PIPING_INPUTXML_UNIT_FIELD_UNCLASSIFIED',
      );
    }
  }
}

function rejectUnknownNumericMetadata(value, allowed, field) {
  if (value === undefined || value === null) return;
  if (!isPlainRecord(value)) {
    failInputXml(`${field} must be a record.`, 'PIPING_INPUTXML_UNIT_FIELD_UNCLASSIFIED');
  }
  for (const [key, entry] of Object.entries(value)) {
    if (allowed.has(key)) continue;
    if (typeof entry === 'number' || containsNumericLeaf(entry)) {
      failInputXml(
        `${field}.${key} may contain an unclassified length.`,
        'PIPING_INPUTXML_UNIT_FIELD_UNCLASSIFIED',
      );
    }
  }
}

function containsNumericLeaf(value) {
  if (typeof value === 'number') return true;
  if (Array.isArray(value)) return value.some(containsNumericLeaf);
  if (isPlainRecord(value)) return Object.values(value).some(containsNumericLeaf);
  return false;
}
