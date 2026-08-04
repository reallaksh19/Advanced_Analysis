import { inputXmlToCanonicalGeometry } from '../geometry/adapters/inputXmlToCanonicalGeometry.js';
import { convertInputXmlLengthToMetres } from '../geometry/adapters/inputxml-unit-system.js';
import {
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  fail,
  requireRecord,
} from './contract.js';
import { bendGeometry, reducerGeometry, weldingTeeGeometry } from './geometry.js';
import { calculateB31Factors } from './calculator.js';
import { indexSupplementaryGeometrySet } from './supplementary-geometry.js';

function sourceLengthToMetres(canonicalGeometry, value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite source length.`, 'B31_FACTOR_INPUTXML_LENGTH_MISSING');
  }
  try {
    return convertInputXmlLengthToMetres(value, canonicalGeometry.unit);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 'B31_FACTOR_INPUTXML_LENGTH_UNIT_UNSUPPORTED');
  }
}

function supplementaryLengthToMetres(supplementary, value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${field} must be a finite supplementary length.`, 'B31_FACTOR_SUPPLEMENTARY_GEOMETRY_INVALID');
  }
  try {
    return convertInputXmlLengthToMetres(value, supplementary.lengthUnit);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 'B31_FACTOR_SUPPLEMENTARY_LENGTH_UNIT_UNSUPPORTED');
  }
}

function sourceEvidence(canonicalGeometry, segment, supplementary) {
  if (supplementary !== null) {
    return {
      sourceId: `${canonicalGeometry.source}:${segment.sourceComponentUid || segment.id}+${supplementary.sourceEvidence.sourceId}`,
      sourceRevision: `${canonicalGeometry.summary?.jobName || canonicalGeometry.schemaVersion || 'canonical-geometry'}:${supplementary.sourceEvidence.sourceRevision}`,
    };
  }
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

function bendFromSegment(canonicalGeometry, segment, supplementary) {
  const extra = supplementary?.geometry ?? null;
  const pressure = extra?.pressure ?? requireAnalysisValue(segment, 'pressure');
  const elasticModulus = extra?.elasticModulus ?? requireAnalysisValue(segment, 'elasticModulus');
  const bendRadius = extra?.bendRadius
    ?? segment.meta?.bendDeclaredRadius
    ?? segment.meta?.bendComputedRadius;
  if (!(typeof bendRadius === 'number' && bendRadius > 0)) {
    fail(`Canonical bend ${segment.id} has no resolved bend radius.`, 'B31_FACTOR_BEND_RADIUS_MISSING');
  }
  const bendAngleDegrees = extra?.bendAngleDegrees ?? segment.meta?.bendAngle1 ?? null;
  const smooth90FlexibilityCorrection = extra?.smooth90FlexibilityCorrection ?? false;
  return bendGeometry({
    lengthUnit: 'm',
    ...(bendAngleDegrees === null ? {} : { bendAngleDegrees }),
    smooth90FlexibilityCorrection,
    outerDiameter: extra?.outerDiameter === null || extra === null
      ? sourceLengthToMetres(canonicalGeometry, segment.diameter, `${segment.id}.diameter`)
      : supplementaryLengthToMetres(supplementary, extra.outerDiameter, `${segment.id}.outerDiameter`),
    wallThickness: extra?.wallThickness === null || extra === null
      ? sourceLengthToMetres(canonicalGeometry, segment.thickness, `${segment.id}.thickness`)
      : supplementaryLengthToMetres(supplementary, extra.wallThickness, `${segment.id}.wallThickness`),
    bendRadius: extra?.bendRadius === null || extra === null
      ? sourceLengthToMetres(canonicalGeometry, bendRadius, `${segment.id}.bendRadius`)
      : supplementaryLengthToMetres(supplementary, extra.bendRadius, `${segment.id}.bendRadius`),
    pressure,
    elasticModulus,
    sourceEvidence: sourceEvidence(canonicalGeometry, segment, supplementary),
  });
}

function teeFromSegment(canonicalGeometry, segment, supplementary) {
  if (supplementary === null) {
    fail(
      `Canonical tee ${segment.id} does not carry matching branch diameter/thickness; a sealed supplementary geometry set is required.`,
      'B31_FACTOR_TEE_SUPPLEMENTARY_GEOMETRY_REQUIRED',
    );
  }
  const extra = supplementary.geometry;
  return weldingTeeGeometry({
    lengthUnit: 'm',
    runOuterDiameter: extra.runOuterDiameter === null
      ? sourceLengthToMetres(canonicalGeometry, segment.diameter, `${segment.id}.runOuterDiameter`)
      : supplementaryLengthToMetres(supplementary, extra.runOuterDiameter, `${segment.id}.runOuterDiameter`),
    runWallThickness: extra.runWallThickness === null
      ? sourceLengthToMetres(canonicalGeometry, segment.thickness, `${segment.id}.runWallThickness`)
      : supplementaryLengthToMetres(supplementary, extra.runWallThickness, `${segment.id}.runWallThickness`),
    branchOuterDiameter: supplementaryLengthToMetres(supplementary, extra.branchOuterDiameter, `${segment.id}.branchOuterDiameter`),
    branchWallThickness: supplementaryLengthToMetres(supplementary, extra.branchWallThickness, `${segment.id}.branchWallThickness`),
    fittingQuality: extra.fittingQuality,
    sourceEvidence: sourceEvidence(canonicalGeometry, segment, supplementary),
  });
}

function reducerFromSegment(canonicalGeometry, segment, supplementary) {
  if (supplementary === null) {
    fail(
      `Reducer ${segment.id} needs endpoint and taper geometry in a sealed supplementary geometry set.`,
      'B31_FACTOR_REDUCER_SUPPLEMENTARY_GEOMETRY_REQUIRED',
    );
  }
  const extra = supplementary.geometry;
  return reducerGeometry({
    lengthUnit: 'm',
    largeEndOuterDiameter: extra.largeEndOuterDiameter === null
      ? sourceLengthToMetres(canonicalGeometry, segment.diameter, `${segment.id}.largeEndOuterDiameter`)
      : supplementaryLengthToMetres(supplementary, extra.largeEndOuterDiameter, `${segment.id}.largeEndOuterDiameter`),
    largeEndWallThickness: extra.largeEndWallThickness === null
      ? sourceLengthToMetres(canonicalGeometry, segment.thickness, `${segment.id}.largeEndWallThickness`)
      : supplementaryLengthToMetres(supplementary, extra.largeEndWallThickness, `${segment.id}.largeEndWallThickness`),
    smallEndOuterDiameter: supplementaryLengthToMetres(supplementary, extra.smallEndOuterDiameter, `${segment.id}.smallEndOuterDiameter`),
    smallEndWallThickness: supplementaryLengthToMetres(supplementary, extra.smallEndWallThickness, `${segment.id}.smallEndWallThickness`),
    coneAngleDegrees: extra.coneAngleDegrees,
    smallEndTransitionRadius: supplementaryLengthToMetres(supplementary, extra.smallEndTransitionRadius, `${segment.id}.smallEndTransitionRadius`),
    smallEndCylinderLength: supplementaryLengthToMetres(supplementary, extra.smallEndCylinderLength, `${segment.id}.smallEndCylinderLength`),
    bodyMinimumWallThickness: supplementaryLengthToMetres(supplementary, extra.bodyMinimumWallThickness, `${segment.id}.bodyMinimumWallThickness`),
    sourceEvidence: sourceEvidence(canonicalGeometry, segment, supplementary),
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
  supplementaryGeometrySet = null,
}) {
  requireRecord(canonicalGeometry, 'canonicalGeometry', 'B31_FACTOR_CANONICAL_GEOMETRY_INVALID');
  if (!Array.isArray(canonicalGeometry.segments)) {
    fail('canonicalGeometry.segments must be an array.', 'B31_FACTOR_CANONICAL_GEOMETRY_INVALID');
  }
  const supplementaryIndex = indexSupplementaryGeometrySet(supplementaryGeometrySet);
  const selected = segmentIds === null ? null : new Set(segmentIds);
  const found = new Set();
  const results = [];
  for (const segment of canonicalGeometry.segments) {
    if (selected !== null && !selected.has(segment.id)) continue;
    if (selected !== null) found.add(segment.id);
    const supplementary = supplementaryIndex.get(segment.id) ?? null;
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
  supplementaryGeometrySet = null,
}) {
  const canonicalGeometry = inputXmlToCanonicalGeometry(xmlText, inputXmlOptions);
  return calculateB31FactorsFromCanonicalGeometry({
    canonicalGeometry,
    editionProfileId,
    momentDirectionMapping,
    segmentIds,
    supplementaryGeometrySet,
  });
}
