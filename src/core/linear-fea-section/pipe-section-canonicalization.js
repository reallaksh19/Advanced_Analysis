import {
  canonicalizeJson,
  canonicalStringify,
  semanticHash,
} from '../shared-piping-model/canonical-json.js';

export function canonicalizePipeSectionValue(value) {
  return canonicalizeJson(value);
}

export function canonicalStringifyPipeSection(value) {
  return canonicalStringify(value);
}

export function pipeSectionSemanticHash(value) {
  return semanticHash(value);
}

export function pipeSectionRequestSemanticPayload(request) {
  return {
    schema: request.schema,
    sectionStateId: request.sectionStateId,
    formulationId: request.formulationId,
    outerDiameter: request.outerDiameter,
    wallThickness: request.wallThickness,
    sourceEvidence: request.sourceEvidence,
  };
}

export function pipeSectionProfileSemanticPayload(profile) {
  return {
    schema: profile.schema,
    profileId: profile.profileId,
    formulationId: profile.formulationId,
    arithmeticRule: profile.arithmeticRule,
    innerDiameterRule: profile.innerDiameterRule,
    solidSectionRule: profile.solidSectionRule,
  };
}

export function pipeSectionResolutionSemanticPayload(resolution) {
  return {
    schema: resolution.schema,
    profileId: resolution.profileId,
    profileSemanticHash: resolution.profileSemanticHash,
    requestSemanticHash: resolution.requestSemanticHash,
    dimensions: resolution.dimensions,
    sectionState: resolution.sectionState,
    verification: resolution.verification,
    limitations: resolution.limitations,
  };
}

export function pipeSectionEvidencePayload(resolution) {
  return {
    resolutionSemanticHash: resolution.semanticHash,
    diagnostics: resolution.diagnostics,
    diagnosticEvidence: resolution.diagnosticEvidence,
    qualificationEvidence: resolution.qualificationEvidence,
  };
}

export function computePipeSectionRequestSemanticHash(request) {
  return pipeSectionSemanticHash(pipeSectionRequestSemanticPayload(request));
}

export function computePipeSectionProfileSemanticHash(profile) {
  return pipeSectionSemanticHash(pipeSectionProfileSemanticPayload(profile));
}

export function computePipeSectionResolutionSemanticHash(resolution) {
  return pipeSectionSemanticHash(pipeSectionResolutionSemanticPayload(resolution));
}

export function computePipeSectionEvidenceHash(resolution) {
  return pipeSectionSemanticHash(pipeSectionEvidencePayload(resolution));
}
