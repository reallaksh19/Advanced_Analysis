import { normalizeLinearFeaNumber } from '../linear-fea-contract/conventions.js';
import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  LINEAR_FEA_MATERIAL_RESOLUTION_SCHEMA,
  LINEAR_MATERIAL_PROFILE_ID,
  MATERIAL_PROPERTY_KEYS,
  LinearFeaMaterialError,
} from './material-contract.js';
import {
  canonicalMaterialSourceEvidence,
  canonicalMaterialTablePoints,
  computeMaterialResolutionEvidenceHash,
  computeMaterialResolutionSemanticHash,
  requireMaterialResolutionProfile as requireMaterialResolutionProfileRecord,
  requireMaterialResolutionRequest,
  requireMaterialResolutionResult as requireMaterialResolutionResultRecord,
  requireMaterialTable,
  requireResolvedMaterialState,
  sealMaterialResolutionProfile as sealMaterialResolutionProfileRecord,
} from './material-validation.js';

function fail(message, code) {
  throw new LinearFeaMaterialError(message, code);
}

function requireSupportedProfileAuthority(profileId, profileSemanticHash) {
  if (profileId !== LINEAR_MATERIAL_PROFILE_ID
    || profileSemanticHash !== LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE.semanticHash) {
    fail(
      `Only ${LINEAR_MATERIAL_PROFILE_ID} is supported by B-2.2.`,
      'MATERIAL_PROFILE_INVALID',
    );
  }
}

export function requireMaterialResolutionProfile(profile) {
  const accepted = requireMaterialResolutionProfileRecord(profile);
  requireSupportedProfileAuthority(accepted.profileId, accepted.semanticHash);
  return accepted;
}

export function sealMaterialResolutionProfile(profile) {
  if (profile?.profileId !== LINEAR_MATERIAL_PROFILE_ID) {
    fail(
      `Only ${LINEAR_MATERIAL_PROFILE_ID} may be sealed by B-2.2.`,
      'MATERIAL_PROFILE_INVALID',
    );
  }
  return requireMaterialResolutionProfile(
    sealMaterialResolutionProfileRecord(profile),
  );
}

export function requireMaterialResolutionResult(result) {
  const accepted = requireMaterialResolutionResultRecord(result);
  requireSupportedProfileAuthority(
    accepted.profileId,
    accepted.profileSemanticHash,
  );
  return accepted;
}

export function resolveLinearFeaMaterialState({ table, request, profile }) {
  const acceptedTable = requireMaterialTable(table);
  const acceptedProfile = requireMaterialResolutionProfile(profile);
  const acceptedRequest = requireMaterialResolutionRequest(request);

  if (acceptedRequest.materialId !== acceptedTable.materialId) {
    fail('request.materialId does not match materialTable.materialId.', 'MATERIAL_ID_MISMATCH');
  }

  const points = canonicalMaterialTablePoints(acceptedTable);
  const temperature = acceptedRequest.evaluationTemperature;
  if (temperature < points[0].absoluteTemperature) {
    fail('request.evaluationTemperature is below the material table range.', 'MATERIAL_TEMPERATURE_BELOW_RANGE');
  }
  if (temperature > points.at(-1).absoluteTemperature) {
    fail('request.evaluationTemperature is above the material table range.', 'MATERIAL_TEMPERATURE_ABOVE_RANGE');
  }

  const exact = points.find((point) => point.absoluteTemperature === temperature);
  let resolution;
  let properties;
  if (exact) {
    resolution = {
      method: 'EXACT_TABLE_POINT',
      lowerTemperature: temperature,
      upperTemperature: temperature,
      interpolationFactor: 0,
    };
    properties = Object.fromEntries(
      MATERIAL_PROPERTY_KEYS.map((key) => [key, exact[key]]),
    );
  } else {
    const upperIndex = points.findIndex((point) => point.absoluteTemperature > temperature);
    if (upperIndex <= 0) {
      fail('No unique interpolation bracket exists.', 'MATERIAL_INTERPOLATION_BRACKET_MISSING');
    }
    const lower = points[upperIndex - 1];
    const upper = points[upperIndex];
    const factor = normalizeLinearFeaNumber(
      (temperature - lower.absoluteTemperature)
        / (upper.absoluteTemperature - lower.absoluteTemperature),
    );
    resolution = {
      method: 'LINEAR_INTERPOLATION',
      lowerTemperature: lower.absoluteTemperature,
      upperTemperature: upper.absoluteTemperature,
      interpolationFactor: factor,
    };
    properties = Object.fromEntries(MATERIAL_PROPERTY_KEYS.map((key) => [
      key,
      normalizeLinearFeaNumber(lower[key] + factor * (upper[key] - lower[key])),
    ]));
  }

  const sourceEvidence = canonicalMaterialSourceEvidence(acceptedTable);
  const materialState = {
    materialStateId: acceptedRequest.materialStateId,
    materialId: acceptedRequest.materialId,
    ...properties,
    evaluationTemperature: temperature,
    sourceEvidence: [sourceEvidence],
  };
  requireResolvedMaterialState(materialState);

  const methodCode = resolution.method === 'EXACT_TABLE_POINT'
    ? 'MATERIAL_EXACT_POINT_RESOLVED'
    : 'MATERIAL_LINEAR_INTERPOLATION_RESOLVED';
  const draft = {
    schema: LINEAR_FEA_MATERIAL_RESOLUTION_SCHEMA,
    profileId: acceptedProfile.profileId,
    profileSemanticHash: acceptedProfile.semanticHash,
    tableSemanticHash: acceptedTable.semanticHash,
    request: acceptedRequest,
    resolution,
    materialState,
    diagnostics: [{
      severity: 'INFO',
      code: methodCode,
      entityType: 'MATERIAL_STATE',
      entityId: acceptedRequest.materialStateId,
      message: resolution.method === 'EXACT_TABLE_POINT'
        ? 'Material properties resolved from an exact table point.'
        : 'Material properties resolved by linear bracket interpolation.',
      evidence: [{
        evidenceId: 'MATERIAL_TABLE_SOURCE',
        ...sourceEvidence,
      }],
      qualificationEvidenceIds: ['LFEA-B2.2'],
    }],
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeMaterialResolutionSemanticHash(draft);
  draft.evidenceHash = computeMaterialResolutionEvidenceHash(draft);
  return requireMaterialResolutionResult(draft);
}
