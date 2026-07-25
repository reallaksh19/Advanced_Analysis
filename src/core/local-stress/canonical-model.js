import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { BASE_LIMITATIONS, MODEL_SCHEMA, THICKNESS_POLICIES } from './constants.js';
import { modelError } from './errors.js';
import { canonicalNumber, toleranceFor, withinTolerance } from './numeric.js';
import { canonicalizeUnits, convertScalar, convertVector } from './units.js';
import { normalizeSourceModel } from './source-model.js';
import {
  canonicalModelSemanticHash, sourceSemanticHash, transformationEvidence,
  transformationEvidenceHash,
} from './model-hashes.js';

export function createCanonicalLocalAttachmentFoundationModel(input) {
  return sealNormalizedSource(normalizeSourceModel(input));
}

export function validateCanonicalLocalAttachmentFoundationModel(input) {
  if (!input || input.schema !== MODEL_SCHEMA) throw modelError('SCHEMA_MISMATCH', 'schema', `schema must be ${MODEL_SCHEMA}.`);
  const model = deepClone(input);
  const sourceHash = sourceSemanticHash(model.sourceEvidence);
  assertHash(model.sourceAncestry?.sourceSemanticHash, sourceHash, 'sourceAncestry.sourceSemanticHash');
  const transformHash = transformationEvidenceHash(model);
  assertHash(model.sourceAncestry?.transformationEvidenceHash, transformHash, 'sourceAncestry.transformationEvidenceHash');
  if (semanticHash(model.transformationEvidence) !== transformHash) {
    throw modelError('TRANSFORMATION_EVIDENCE_MISMATCH', 'transformationEvidence', 'Transformation evidence is stale or forged.');
  }
  const modelHash = canonicalModelSemanticHash(model);
  assertHash(model.sourceAncestry?.canonicalModelSemanticHash, modelHash, 'sourceAncestry.canonicalModelSemanticHash');
  assertHash(model.semanticHash, modelHash, 'semanticHash');
  const rawSource = { ...model.sourceEvidence, schema: MODEL_SCHEMA };
  const expected = sealNormalizedSource(normalizeSourceModel(rawSource));
  if (semanticHash(model) !== semanticHash(expected)) {
    throw modelError('CANONICAL_SOURCE_MISMATCH', 'model', 'Canonical model does not reconstruct from retained source evidence.');
  }
  return deepFreeze(model);
}

function sealNormalizedSource(sourceEvidence) {
  const model = buildCanonicalModel(sourceEvidence);
  model.sourceAncestry.sourceSemanticHash = sourceSemanticHash(sourceEvidence);
  model.transformationEvidence = transformationEvidence(model);
  model.sourceAncestry.transformationEvidenceHash = transformationEvidenceHash(model);
  const modelHash = canonicalModelSemanticHash(model);
  model.sourceAncestry.canonicalModelSemanticHash = modelHash;
  model.semanticHash = modelHash;
  return deepFreeze(model);
}

function buildCanonicalModel(source) {
  const units = canonicalizeUnits(source.units);
  const profile = source.qualificationProfile;
  const thicknessBasis = canonicalThickness(source.thicknessBasis, units, profile);
  const outsideDiameter = convertEvidence(source.pipeGeometry.outsideDiameter, 'length', units, 'pipeGeometry.outsideDiameter');
  if (thicknessBasis.assessmentPipeThickness.value >= outsideDiameter.value / 2) {
    throw modelError('INVALID_PIPE_RADII', 'thicknessBasis.assessmentPipeThickness', 'Assessment thickness must leave a positive inner radius.');
  }
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: source.modelIdentity,
    modelVersion: source.modelVersion,
    sourceAncestry: { ...source.sourceAncestry },
    sourceEvidence: source,
    units,
    pipeGeometry: { outsideDiameter },
    pipeCoordinateSystem: canonicalCoordinate(source.pipeCoordinateSystem, units),
    materials: source.materials,
    thicknessBasis,
    pressureDefinitions: source.pressureDefinitions.map((row) => canonicalPressure(row, units)),
    loadReferencePoints: source.loadReferencePoints.map((row) => ({ ...row, point: convertVectorEvidence(row.point, 'length', units, `loadReferencePoints.${row.identity}.point`) })),
    loadCases: source.loadCases.map((row) => canonicalLoad(row, units)),
    resultRequests: canonicalRequests(source.resultRequests, units),
    qualificationProfile: profile,
    limitations: mergedLimitations(source.limitations),
  };
}
function canonicalCoordinate(source, units) {
  return {
    identity: source.identity,
    origin: convertVectorEvidence(source.origin, 'length', units, 'pipeCoordinateSystem.origin'),
    axialDirection: source.axialDirection,
    radialHint: source.radialHint,
    circumferentialHint: source.circumferentialHint,
  };
}
function canonicalLoad(source, units) {
  return {
    ...source,
    force: convertVectorEvidence(source.force, 'force', units, `loadCases.${source.identity}.force`),
    moment: convertVectorEvidence(source.moment, 'moment', units, `loadCases.${source.identity}.moment`),
  };
}
function canonicalPressure(source, units) {
  const result = {
    ...source,
    internalPressure: convertEvidence(source.internalPressure, 'pressure', units, `pressureDefinitions.${source.identity}.internalPressure`),
    externalPressure: convertEvidence(source.externalPressure, 'pressure', units, `pressureDefinitions.${source.identity}.externalPressure`),
  };
  if (source.explicitAxialResultant) result.explicitAxialResultant = convertEvidence(source.explicitAxialResultant, 'force', units, `pressureDefinitions.${source.identity}.explicitAxialResultant`);
  return result;
}
function canonicalRequests(source, units) {
  return {
    requestedAnalyses: source.requestedAnalyses,
    transformedLoadCaseIdentities: source.transformedLoadCaseIdentities,
    pressure: source.pressure.map((row) => ({
      ...row,
      requestedRadii: row.requestedRadii.map((radius, index) => convertEvidence(radius, 'length', units, `resultRequests.pressure.${row.identity}.requestedRadii[${index}]`)),
    })),
  };
}
function canonicalThickness(source, units, profile) {
  const nominal = convertEvidence(source.nominalPipeThickness, 'length', units, 'thicknessBasis.nominalPipeThickness');
  const corrosion = convertEvidence(source.corrosionAllowance, 'length', units, 'thicknessBasis.corrosionAllowance');
  if (corrosion.value >= nominal.value) throw modelError('CORROSION_EXCEEDS_NOMINAL', 'thicknessBasis.corrosionAllowance', 'Corrosion must be lower than nominal thickness.');
  const derived = canonicalNumber(nominal.value - corrosion.value, 'assessment thickness');
  const supplied = source.assessmentPipeThickness ? convertEvidence(source.assessmentPipeThickness, 'length', units, 'thicknessBasis.assessmentPipeThickness') : null;
  const assessment = assessmentThickness(source.policy, supplied, derived, profile, nominal.sourceRef, corrosion.sourceRef);
  return {
    policy: source.policy,
    nominalPipeThickness: nominal,
    corrosionAllowance: corrosion,
    assessmentPipeThickness: assessment,
    wearPadThickness: convertEvidence(source.wearPadThickness, 'length', units, 'thicknessBasis.wearPadThickness'),
    cradleThickness: convertEvidence(source.cradleThickness, 'length', units, 'thicknessBasis.cradleThickness'),
    effectiveAnalyticalThickness: convertEvidence(source.effectiveAnalyticalThickness, 'length', units, 'thicknessBasis.effectiveAnalyticalThickness'),
    pressureWallBasis: 'ASSESSMENT_PIPE_THICKNESS_ONLY',
  };
}
function assessmentThickness(policy, supplied, derived, profile, nominalRef, corrosionRef) {
  if (policy === THICKNESS_POLICIES.EXPLICIT_ASSESSMENT) {
    if (!supplied || supplied.value <= 0) throw modelError('ASSESSMENT_THICKNESS_REQUIRED', 'thicknessBasis.assessmentPipeThickness', 'Positive explicit assessment thickness is required.');
    return { ...supplied, derivation: 'EXPLICIT' };
  }
  const tolerance = toleranceFor(profile, 'length', derived, supplied?.value ?? derived);
  if (supplied && !withinTolerance(supplied.value, derived, tolerance)) {
    throw modelError('ASSESSMENT_THICKNESS_CONFLICT', 'thicknessBasis.assessmentPipeThickness', 'Supplied assessment thickness conflicts with nominal minus corrosion.');
  }
  return { value: derived, sourceRef: `${nominalRef}+${corrosionRef}`, derivation: 'NOMINAL_MINUS_CORROSION', tolerance };
}
function convertEvidence(source, dimension, units, path) {
  return { value: convertScalar(source.value, dimension, units, `${path}.value`), sourceRef: source.sourceRef, sourceUnit: units.declared[dimension], canonicalUnit: units.canonical[dimension] };
}
function convertVectorEvidence(source, dimension, units, path) {
  return { value: convertVector(source.value, dimension, units, `${path}.value`), sourceRef: source.sourceRef, sourceUnit: units.declared[dimension], canonicalUnit: units.canonical[dimension] };
}
function mergedLimitations(values) { return [...new Set([...BASE_LIMITATIONS, ...values])].sort((a, b) => a < b ? -1 : a > b ? 1 : 0); }
function assertHash(actual, expected, path) {
  if (typeof actual !== 'string') throw modelError('HASH_REQUIRED', path, `${path} is required.`);
  if (actual !== expected) throw modelError('HASH_MISMATCH', path, `${path} does not reconstruct.`);
}
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
