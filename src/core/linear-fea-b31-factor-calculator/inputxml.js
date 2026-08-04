import { inputXmlToCanonicalGeometry } from '../geometry/adapters/inputXmlToCanonicalGeometry.js';
import { convertInputXmlLengthToMetres } from '../geometry/adapters/inputxml-unit-system.js';
import {
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  SUPPLEMENTARY_GEOMETRY_SCHEMA,
  fail,
  requireRecord,
} from './contract.js';
import { bendGeometry, reducerGeometry, weldingTeeGeometry } from './geometry.js';
import { calculateB31Factors } from './calculator.js';


function sourceLengthToMetres(canonicalGeometry, value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite source length.`, 'B31_FACTOR_INPUTXML_LENGTH_MISSING');
  }
  try {
    return convertInputXmlLengthToMetres(value, canonicalGeometry.unit);
  } catch (error) {
    fail(
      error instanceof Error ? error.message : String(error),
      'B31_FACTOR_INPUTXML_LENGTH_UNIT_UNSUPPORTED',
    );
  }
}

function supplementaryLengthToMetres(supplementary, value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite supplementary length.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  }
  try {
    return convertInputXmlLengthToMetres(value, supplementary.lengthUnit);
  } catch (error) {
    fail(
      error instanceof Error ? error.message : String(error),
      'B31_FACTOR_SUPPLEMENTARY_LENGTH_UNIT_UNSUPPORTED',
    );
  }
}

function sourceEvidence(canonicalGeometry, segment) {
  return {
    sourceId: `${canonicalGeometry.source}:${segment.sourceComponentUid || segment.id}`,
    sourceRevision: canonicalGeometry.summary?.jobName || canonicalGeometry.schemaVersion || 'canonical-geometry',
  };
}

function requireAnalysisValue(segment, field) {
  const value = segment.meta?.analysis?.[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(
      `Canonical segment ${segment.id} is missing numeric meta.analysis.${field}; provide it in the InputXML or supplementary geometry.`,
      'B31_FACTOR_INPUTXML_ANALYSIS_VALUE_MISSING',
    );
  }
  return value;
}

function supplementaryFor(segment, supplementaryGeometryBySegmentId) {
  const entry = supplementaryGeometryBySegmentId[segment.id] ?? null;
  if (entry === null) return null;
  requireRecord(entry, `supplementaryGeometryBySegmentId.${segment.id}`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  if (entry.schema !== SUPPLEMENTARY_GEOMETRY_SCHEMA) {
    fail(
      `Supplementary geometry for ${segment.id} must use ${SUPPLEMENTARY_GEOMETRY_SCHEMA}.`,
      'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID',
    );
  }
  if (typeof entry.lengthUnit !== 'string' || entry.lengthUnit.trim().length === 0) {
    fail(`Supplementary geometry for ${segment.id} must declare lengthUnit.`, 'B31_FACTOR_SUPPLEMENTARY_LENGTH_UNIT_REQUIRED');
  }
  if (!['BEND', 'WELDING_TEE', 'REDUCER'].includes(entry.componentType)) {
    fail(`Supplementary geometry for ${segment.id} must declare a supported componentType.`, 'B31_FACTOR_SUPPLEMENTARY_COMPONENT_TYPE_INVALID');
  }
  return entry;
}

function bendFromSegment(canonicalGeometry, segment, supplementary) {
  const pressure = supplementary?.pressure ?? requireAnalysisValue(segment, 'pressure');
  const elasticModulus = supplementary?.elasticModulus ?? requireAnalysisValue(segment, 'elasticModulus');
  const bendRadius = supplementary?.bendRadius
    ?? segment.meta?.bendDeclaredRadius
    ?? segment.meta?.bendComputedRadius;
  if (!(typeof bendRadius === 'number' && bendRadius > 0)) {
    fail(`Canonical bend ${segment.id} has no resolved bend radius.`, 'B31_FACTOR_BEND_RADIUS_MISSING');
  }
  const bendAngleDegrees = supplementary?.bendAngleDegrees ?? segment.meta?.bendAngle1 ?? null;
  const smooth90FlexibilityCorrection = supplementary?.smooth90FlexibilityCorrection ?? false;
  return bendGeometry({
    lengthUnit: 'm',
    ...(bendAngleDegrees === null ? {} : { bendAngleDegrees }),
    smooth90FlexibilityCorrection,
    outerDiameter: supplementary?.outerDiameter === undefined
      ? sourceLengthToMetres(canonicalGeometry, segment.diameter, `${segment.id}.diameter`)
      : supplementaryLengthToMetres(supplementary, supplementary.outerDiameter, `${segment.id}.outerDiameter`),
    wallThickness: supplementary?.wallThickness === undefined
      ? sourceLengthToMetres(canonicalGeometry, segment.thickness, `${segment.id}.thickness`)
      : supplementaryLengthToMetres(supplementary, supplementary.wallThickness, `${segment.id}.wallThickness`),
    bendRadius: supplementary?.bendRadius === undefined
      ? sourceLengthToMetres(canonicalGeometry, bendRadius, `${segment.id}.bendRadius`)
      : supplementaryLengthToMetres(supplementary, supplementary.bendRadius, `${segment.id}.bendRadius`),
    pressure,
    elasticModulus,
    sourceEvidence: sourceEvidence(canonicalGeometry, segment),
  });
}

function teeFromSegment(canonicalGeometry, segment, supplementary) {
  if (supplementary === null) {
    fail(
      `Canonical tee ${segment.id} does not carry matching branch diameter/thickness; supplementary geometry is required.`,
      'B31_FACTOR_TEE_SUPPLEMENTARY_GEOMETRY_REQUIRED',
    );
  }
  return weldingTeeGeometry({
    lengthUnit: 'm',
    runOuterDiameter: supplementary.runOuterDiameter === undefined
      ? sourceLengthToMetres(canonicalGeometry, segment.diameter, `${segment.id}.runOuterDiameter`)
      : supplementaryLengthToMetres(supplementary, supplementary.runOuterDiameter, `${segment.id}.runOuterDiameter`),
    runWallThickness: supplementary.runWallThickness === undefined
      ? sourceLengthToMetres(canonicalGeometry, segment.thickness, `${segment.id}.runWallThickness`)
      : supplementaryLengthToMetres(supplementary, supplementary.runWallThickness, `${segment.id}.runWallThickness`),
    branchOuterDiameter: supplementaryLengthToMetres(supplementary, supplementary.branchOuterDiameter, `${segment.id}.branchOuterDiameter`),
    branchWallThickness: supplementaryLengthToMetres(supplementary, supplementary.branchWallThickness, `${segment.id}.branchWallThickness`),
    fittingQuality: supplementary.fittingQuality,
    sourceEvidence: sourceEvidence(canonicalGeometry, segment),
  });
}

function reducerFromSegment(canonicalGeometry, segment, supplementary) {
  if (supplementary === null) {
    fail(
      `Reducer ${segment.id} needs endpoint and taper geometry that the canonical InputXML segment does not retain.`,
      'B31_FACTOR_REDUCER_SUPPLEMENTARY_GEOMETRY_REQUIRED',
    );
  }
  return reducerGeometry({
    lengthUnit: 'm',
    largeEndOuterDiameter: supplementary.largeEndOuterDiameter === undefined
      ? sourceLengthToMetres(canonicalGeometry, segment.diameter, `${segment.id}.largeEndOuterDiameter`)
      : supplementaryLengthToMetres(supplementary, supplementary.largeEndOuterDiameter, `${segment.id}.largeEndOuterDiameter`),
    largeEndWallThickness: supplementary.largeEndWallThickness === undefined
      ? sourceLengthToMetres(canonicalGeometry, segment.thickness, `${segment.id}.largeEndWallThickness`)
      : supplementaryLengthToMetres(supplementary, supplementary.largeEndWallThickness, `${segment.id}.largeEndWallThickness`),
    smallEndOuterDiameter: supplementaryLengthToMetres(supplementary, supplementary.smallEndOuterDiameter, `${segment.id}.smallEndOuterDiameter`),
    smallEndWallThickness: supplementaryLengthToMetres(supplementary, supplementary.smallEndWallThickness, `${segment.id}.smallEndWallThickness`),
    coneAngleDegrees: supplementary.coneAngleDegrees,
    smallEndTransitionRadius: supplementaryLengthToMetres(supplementary, supplementary.smallEndTransitionRadius, `${segment.id}.smallEndTransitionRadius`),
    smallEndCylinderLength: supplementaryLengthToMetres(supplementary, supplementary.smallEndCylinderLength, `${segment.id}.smallEndCylinderLength`),
    bodyMinimumWallThickness: supplementaryLengthToMetres(supplementary, supplementary.bodyMinimumWallThickness, `${segment.id}.bodyMinimumWallThickness`),
    sourceEvidence: sourceEvidence(canonicalGeometry, segment),
  });
}

function componentTypeFor(segment, supplementary) {
  if (supplementary?.componentType === 'REDUCER') return 'REDUCER';
  if (segment.type === 'BEND') return 'BEND';
  if (segment.type === 'TEE') return 'WELDING_TEE';
  return null;
}

export function calculateB31FactorsFromCanonicalGeometry({
  canonicalGeometry,
  editionProfileId,
  momentDirectionMapping,
  segmentIds = null,
  supplementaryGeometryBySegmentId = {},
}) {
  requireRecord(canonicalGeometry, 'canonicalGeometry', 'B31_FACTOR_CANONICAL_GEOMETRY_INVALID');
  if (!Array.isArray(canonicalGeometry.segments)) {
    fail('canonicalGeometry.segments must be an array.', 'B31_FACTOR_CANONICAL_GEOMETRY_INVALID');
  }
  const selected = segmentIds === null ? null : new Set(segmentIds);
  const found = new Set();
  const results = [];
  for (const segment of canonicalGeometry.segments) {
    if (selected !== null && !selected.has(segment.id)) continue;
    if (selected !== null) found.add(segment.id);
    const supplementary = supplementaryFor(segment, supplementaryGeometryBySegmentId);
    const componentType = componentTypeFor(segment, supplementary);
    if (componentType === null) {
      if (selected !== null) {
        fail(`Selected segment ${segment.id} is not a supported bend, welding tee, or reducer.`, 'B31_FACTOR_SELECTED_SEGMENT_NOT_SUPPORTED');
      }
      continue;
    }
    const geometry = componentType === 'BEND'
      ? bendFromSegment(canonicalGeometry, segment, supplementary)
      : componentType === 'WELDING_TEE'
        ? teeFromSegment(canonicalGeometry, segment, supplementary)
        : reducerFromSegment(canonicalGeometry, segment, supplementary);
    results.push(calculateB31Factors({
      schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
      calculationId: `${segment.id}.B31.FACTORS`,
      componentId: segment.id,
      editionProfileId,
      componentType,
      geometry,
      momentDirectionMapping,
      semanticHash: '',
    }));
  }
  if (selected !== null) {
    const missing = [...selected].filter((segmentId) => !found.has(segmentId));
    if (missing.length > 0) {
      fail(`Selected canonical segment(s) were not found: ${missing.join(', ')}.`, 'B31_FACTOR_CANONICAL_SEGMENT_NOT_FOUND');
    }
  }
  return Object.freeze(results);
}


export function calculateB31FactorsFromInputXml({
  xmlText,
  inputXmlOptions = {},
  editionProfileId,
  momentDirectionMapping,
  segmentIds = null,
  supplementaryGeometryBySegmentId = {},
}) {
  const canonicalGeometry = inputXmlToCanonicalGeometry(xmlText, inputXmlOptions);
  return calculateB31FactorsFromCanonicalGeometry({
    canonicalGeometry,
    editionProfileId,
    momentDirectionMapping,
    segmentIds,
    supplementaryGeometryBySegmentId,
  });
}
