import { inputXmlToCanonicalGeometry } from './inputXmlToCanonicalGeometry.js';
import { attributeValue, findAnyElements, findElements, firstElement } from './inputxml-tag-scanner.js';
import { parseInputXmlUnitSystem } from './inputxml-unit-system.js';

export const INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA = 'fea-inputxml-model-health-source/v1';

const CAESAR_UNSET_SENTINEL = -1.0101;
const SENTINEL_TOLERANCE = 0.001;
const CHILD_FEATURES = Object.freeze([
  Object.freeze({ kind: 'BEND', tags: Object.freeze(['BEND', 'BENDS', 'ELBOW', 'ELBOWS']) }),
  Object.freeze({ kind: 'RIGID', tags: Object.freeze(['RIGID', 'RIGIDS']) }),
  Object.freeze({ kind: 'SIF', tags: Object.freeze(['SIF', 'SIFS']) }),
  Object.freeze({ kind: 'HANGER', tags: Object.freeze(['HANGER', 'HANGERS']) }),
  Object.freeze({ kind: 'FORCES_MOMENTS', tags: Object.freeze(['FORCESMOMENTS']) }),
  Object.freeze({ kind: 'ALLOWABLE_STRESS', tags: Object.freeze(['ALLOWABLESTRESS']) }),
  Object.freeze({ kind: 'REDUCER', tags: Object.freeze(['REDUCER', 'REDUCERS', 'REDU', 'REDC', 'REDE']) }),
  Object.freeze({ kind: 'RESTRAINT', tags: Object.freeze(['RESTRAINT', 'RESTRAINTS']) }),
]);

const FIELD_SPECS = Object.freeze([
  field('DIAMETER', ['DIAMETER', 'BORE', 'NOMINAL_DIAMETER'], (segment) => segment?.diameter),
  field('WALL_THICK', ['WALL_THICK', 'THICKNESS'], (segment) => segment?.thickness),
  field('MATERIAL_NAME', ['MATERIAL_NAME'], (segment) => segment?.material, 'STRING'),
  field('MODULUS', ['MODULUS'], (segment) => segment?.meta?.analysis?.elasticModulus),
  field('POISSONS', ['POISSONS'], (segment) => segment?.meta?.analysis?.poissonRatio),
  field('TEMP_EXP_C1', ['TEMP_EXP_C1'], (segment) => segment?.meta?.analysis?.operatingTemperature),
  field('TEMP_EXP_C2', ['TEMP_EXP_C2'], (segment) => segment?.meta?.analysis?.operatingTemperature2),
  field('PRESSURE1', ['PRESSURE1'], (segment) => segment?.meta?.analysis?.pressure),
  field('HYDRO_PRESSURE', ['HYDRO_PRESSURE'], (segment) => segment?.meta?.analysis?.hydroPressure),
  field('FLUID_DENSITY', ['FLUID_DENSITY', 'FDENSITY'], (segment) => segment?.meta?.analysis?.fluidDensity),
  field('PIPE_DENSITY', ['PIPE_DENSITY', 'PDENSITY'], (segment) => segment?.meta?.analysis?.pipeDensity),
  field('INSUL_THICK', ['INSUL_THICK'], (segment) => segment?.meta?.analysis?.insulationThickness),
  field('INSUL_DENSITY', ['INSUL_DENSITY', 'IDENSITY'], (segment) => segment?.meta?.analysis?.insulationDensity),
  field('CORR_ALLOW', ['CORR_ALLOW'], (segment) => segment?.meta?.analysis?.corrosionAllowance),
]);

/**
 * Parse one governed InputXML source bundle for model-health consumers.
 *
 * Canonical mechanical meaning remains owned by `inputXmlToCanonicalGeometry`.
 * Raw source records are an inventory surface reconciled to that output by the
 * stable `PIPINGELEMENT[index]` identity. They never recompute geometry,
 * restraint mechanics, material state, or loads.
 */
export function parseInputXmlModelHealthSource(xmlText, options = {}) {
  if (typeof xmlText !== 'string') {
    fail('parseInputXmlModelHealthSource requires InputXML text.', 'INPUTXML_SOURCE_TEXT_INVALID');
  }
  const geometry = inputXmlToCanonicalGeometry(xmlText, options);
  const unitDiagnostics = [];
  const unitSystem = parseInputXmlUnitSystem(xmlText, options.unit, unitDiagnostics);
  requireUnitAgreement(unitSystem, geometry);

  const modelTag = firstElement(xmlText, ['PIPINGMODEL']);
  const elementTags = findElements(xmlText, 'PIPINGELEMENT');
  const segmentByFeatureId = indexCanonicalSegments(geometry);
  const effectiveByField = new Map();
  const elementRecords = elementTags.map((tag, sourceIndex) => {
    const sourceFeatureId = `PIPINGELEMENT[${sourceIndex}]`;
    const segment = segmentByFeatureId.get(sourceFeatureId) ?? null;
    const fieldEvidence = Object.fromEntries(FIELD_SPECS.map((spec) => {
      const evidence = fieldEvidenceFor({
        spec,
        attributes: tag.attributes,
        sourceFeatureId,
        sourceIndex,
        segment,
        effectiveByField,
        diagnostics: geometry.diagnostics ?? [],
      });
      return [spec.name, evidence];
    }));
    return freezeDeep({
      sourceFeatureId,
      sourceIndex,
      fromNodeId: cleanNodeId(attributeValue(tag.attributes, 'FROM_NODE', 'FROMNODE', 'FROM')),
      toNodeId: cleanNodeId(attributeValue(tag.attributes, 'TO_NODE', 'TONODE', 'TO')),
      rawDelta: Object.freeze({
        x: rawNumeric(attributeValue(tag.attributes, 'DELTA_X', 'DX')),
        y: rawNumeric(attributeValue(tag.attributes, 'DELTA_Y', 'DY')),
        z: rawNumeric(attributeValue(tag.attributes, 'DELTA_Z', 'DZ')),
      }),
      rawAttributes: sortedRecord(tag.attributes),
      childFeatures: childFeatureRecords(sourceFeatureId, tag.inner),
      fieldEvidence,
      canonicalSegmentId: segment?.id ?? null,
      canonicalSegmentType: segment?.type ?? null,
      canonicalStatus: segment ? 'RECONCILED' : 'UNRESOLVED',
    });
  });
  requireSourceGeometryReconciliation(elementRecords, segmentByFeatureId, geometry);

  return Object.freeze({
    schema: INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA,
    source: geometry.source ?? options.source ?? 'inputxml',
    fileName: options.fileName ?? null,
    jobName: geometry.summary?.jobName ?? null,
    modelFeatureId: modelTag ? 'PIPINGMODEL[0]' : null,
    modelAttributes: freezeDeep(sortedRecord(modelTag?.attributes ?? {})),
    unitSystem: freezeDeep(structuredClone(unitSystem)),
    elementRecords: Object.freeze(elementRecords),
    sourceRecordCount: elementRecords.length,
    canonicalSegmentCount: geometry.segments.length,
    geometry,
    diagnostics: Object.freeze((geometry.diagnostics ?? []).map((row) => freezeDeep(structuredClone(row)))),
  });
}

function field(name, aliases, canonicalValue, kind = 'NUMBER') {
  return Object.freeze({ name, aliases: Object.freeze(aliases), canonicalValue, kind });
}

function fieldEvidenceFor({
  spec,
  attributes,
  sourceFeatureId,
  sourceIndex,
  segment,
  effectiveByField,
  diagnostics,
}) {
  const raw = rawAttribute(attributes, spec.aliases);
  const prior = effectiveByField.get(spec.name) ?? null;
  const rawState = classifyRawField(raw, spec.kind);
  const canonicalValue = normalizeCanonical(spec.canonicalValue(segment));
  let disposition;
  let effectiveSourceFeatureId = null;

  if (rawState === 'EXPLICIT') {
    disposition = 'EXPLICIT';
    effectiveSourceFeatureId = sourceFeatureId;
  } else if (prior) {
    disposition = rawState === 'ABSENT' ? 'INHERITED' : `${rawState}_INHERITED`;
    effectiveSourceFeatureId = prior.sourceFeatureId;
  } else {
    disposition = rawState;
  }

  if (effectiveSourceFeatureId === sourceFeatureId || prior) {
    const expected = effectiveSourceFeatureId === sourceFeatureId ? canonicalValue : prior.canonicalValue;
    if (!sameValue(canonicalValue, expected)) {
      fail(
        `${sourceFeatureId} ${spec.name} source evidence disagrees with canonical geometry.`,
        'INPUTXML_SOURCE_CANONICAL_FIELD_MISMATCH',
        { sourceFeatureId, field: spec.name, canonicalValue, expected },
      );
    }
  }
  if (prior && disposition.endsWith('_INHERITED')) {
    requireInheritanceDiagnostic(diagnostics, sourceIndex, spec.name);
  }
  if (disposition === 'INHERITED') {
    requireInheritanceDiagnostic(diagnostics, sourceIndex, spec.name);
  }
  if (canonicalValue !== null && effectiveSourceFeatureId !== null) {
    effectiveByField.set(spec.name, Object.freeze({
      sourceFeatureId: effectiveSourceFeatureId,
      canonicalValue,
    }));
  }

  return freezeDeep({
    disposition,
    rawAttributeName: raw?.name ?? null,
    rawValue: raw?.value ?? null,
    effectiveSourceFeatureId,
    canonicalValue,
  });
}

function classifyRawField(raw, kind) {
  if (!raw) return 'ABSENT';
  if (!String(raw.value).trim()) return 'EMPTY';
  if (kind === 'STRING') return 'EXPLICIT';
  const value = rawNumeric(raw.value);
  if (value === null) return 'INVALID';
  if (Math.abs(value - CAESAR_UNSET_SENTINEL) < SENTINEL_TOLERANCE) return 'SENTINEL_UNSET';
  return 'EXPLICIT';
}

function requireInheritanceDiagnostic(diagnostics, sourceIndex, fieldName) {
  const code = `${fieldName}_INHERITED_FROM_PRIOR_ELEMENT`;
  const matched = diagnostics.some((row) => (
    row?.code === code && row?.data?.elementIndex === sourceIndex
  ));
  if (!matched) {
    fail(
      `PIPINGELEMENT[${sourceIndex}] ${fieldName} inheritance lacks canonical diagnostic custody.`,
      'INPUTXML_SOURCE_INHERITANCE_DIAGNOSTIC_MISSING',
      { sourceIndex, field: fieldName, code },
    );
  }
}

function childFeatureRecords(parentFeatureId, inner) {
  return Object.freeze(CHILD_FEATURES.flatMap(({ kind, tags }) => (
    findAnyElements(inner, tags).map((tag, ordinal) => freezeDeep({
      sourceFeatureId: `${parentFeatureId}/${kind}[${ordinal}]`,
      parentFeatureId,
      kind,
      ordinal,
      rawAttributes: sortedRecord(tag.attributes),
    }))
  )));
}

function indexCanonicalSegments(geometry) {
  const index = new Map();
  for (const segment of geometry.segments ?? []) {
    const featureId = segment.sourceComponentUid;
    if (typeof featureId !== 'string' || featureId.length === 0) {
      fail(
        `Canonical segment ${segment.id} lacks sourceComponentUid.`,
        'INPUTXML_SOURCE_COMPONENT_UID_MISSING',
        { segmentId: segment.id },
      );
    }
    if (index.has(featureId)) {
      fail(
        `Canonical source identity ${featureId} is duplicated.`,
        'INPUTXML_SOURCE_COMPONENT_UID_DUPLICATE',
        { sourceFeatureId: featureId },
      );
    }
    index.set(featureId, segment);
  }
  return index;
}

function requireSourceGeometryReconciliation(records, segmentByFeatureId, geometry) {
  const recordIds = new Set(records.map((record) => record.sourceFeatureId));
  const orphanSegments = [...segmentByFeatureId.keys()].filter((featureId) => !recordIds.has(featureId));
  if (orphanSegments.length > 0) {
    fail(
      'Canonical geometry contains segments outside the InputXML source inventory.',
      'INPUTXML_SOURCE_GEOMETRY_ORPHAN_SEGMENT',
      { orphanSourceFeatureIds: orphanSegments },
    );
  }
  if (geometry.valid === true && records.some((record) => record.canonicalStatus !== 'RECONCILED')) {
    fail(
      'Valid canonical geometry does not reconcile every InputXML element record.',
      'INPUTXML_SOURCE_GEOMETRY_RECONCILIATION_INCOMPLETE',
    );
  }
}

function requireUnitAgreement(unitSystem, geometry) {
  if (unitSystem.lengthUnit !== geometry.unit
    || unitSystem.declared !== geometry.summary?.inputXmlUnitsDeclared) {
    fail(
      'InputXML unit evidence disagrees with canonical geometry.',
      'INPUTXML_SOURCE_UNIT_SYSTEM_MISMATCH',
      {
        bundleLengthUnit: unitSystem.lengthUnit,
        geometryLengthUnit: geometry.unit,
        bundleDeclared: unitSystem.declared,
        geometryDeclared: geometry.summary?.inputXmlUnitsDeclared,
      },
    );
  }
}

function rawAttribute(attributes, names) {
  let empty = null;
  for (const name of names) {
    const key = Object.keys(attributes).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (!key) continue;
    const row = Object.freeze({ name: key, value: String(attributes[key]) });
    if (row.value.trim()) return row;
    if (!empty) empty = row;
  }
  return empty;
}

function rawNumeric(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeCanonical(value) {
  return value === undefined || value === null ? null : value;
}

function sameValue(left, right) {
  return Object.is(left, right) || left === right;
}

function cleanNodeId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? String(number) : text;
}

function sortedRecord(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareAscii(left, right)));
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message, code, data = {}) {
  const error = new TypeError(message);
  error.code = code;
  error.data = data;
  throw error;
}
