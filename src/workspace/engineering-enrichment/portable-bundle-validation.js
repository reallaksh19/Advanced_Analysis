import {
  assertEngineeringEnrichmentPortableBundle as assertPortableBundleBase,
  buildEnrichmentPortableBundle as buildPortableBundleBase,
  parseAndVerifyEnrichmentPortableBundle as parsePortableBundleBase,
  serializeEnrichmentPortableBundle as serializePortableBundleBase,
  verifyEngineeringEnrichmentPortableBundle as verifyPortableBundleBase,
} from './portable-bundle.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
} from './candidate-projection.js';
import {
  assertEngineeringEnrichmentProposalAuthority,
} from './master-adapters.js';
import {
  assertEngineeringEnrichmentNumericalImpactAuthority,
  assertEnrichmentEngineDescriptor,
  assertEnrichmentShadowCalculationRequest,
  assertEnrichmentShadowCalculationResultAuthority,
} from './numerical-impact-validation.js';
import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import {
  assertEngineeringEnrichmentStructuralImpact,
} from './structural-impact.js';

export {
  ENRICHMENT_PORTABLE_BUNDLE_SCHEMA,
  ENRICHMENT_PORTABLE_VERIFICATION_SCHEMA,
  assertEngineeringEnrichmentPortableBundleVerification,
} from './portable-bundle.js';

export function buildEnrichmentPortableBundle(input) {
  return assertPortableAuthority(buildPortableBundleBase(input));
}

export function assertEngineeringEnrichmentPortableBundle(value) {
  return assertPortableAuthority(assertPortableBundleBase(value));
}

export function serializeEnrichmentPortableBundle(value) {
  return serializePortableBundleBase(
    assertEngineeringEnrichmentPortableBundle(value),
  );
}

export function verifyEngineeringEnrichmentPortableBundle(value, options) {
  const bundle = assertEngineeringEnrichmentPortableBundle(value);
  return options === undefined
    ? verifyPortableBundleBase(bundle)
    : verifyPortableBundleBase(bundle, options);
}

export function parseAndVerifyEnrichmentPortableBundle(text) {
  const parsed = parsePortableBundleBase(text);
  assertPortableAuthority(parsed.bundle);
  return parsed;
}

function assertPortableAuthority(bundle) {
  const artifacts = bundle.artifacts;
  artifacts.proposals.forEach((proposal) => {
    assertEngineeringEnrichmentProposalAuthority({
      proposal,
      masterSnapshots: artifacts.masterSnapshots,
    });
  });
  const candidate = assertEngineeringEnrichmentCandidateProjection(
    artifacts.candidateProjection,
  );
  const structural = assertEngineeringEnrichmentStructuralImpact(
    artifacts.structuralImpact,
  );
  if (structural.candidateProjectionHash !== candidate.projectionHash
    || structural.sourceSharedModelHash !== candidate.sourceSharedModelHash
    || structural.sourceStructuralHash !== candidate.sourceStructuralHash) {
    fail('candidate/structural identity mismatch.');
  }
  const fieldScope = candidate.rows.map((row) => ({
    proposalId: row.proposalId,
    targetKind: row.targetKind,
    targetId: row.targetId,
    fieldId: row.fieldId,
    unit: row.unit,
    disposition: row.disposition,
  }));
  const fieldIds = [...new Set(candidate.rows.map((row) => row.fieldId))].sort();
  if (structural.fieldScopeHash !== semanticHash(fieldScope)
    || JSON.stringify(structural.verifiedNonstructuralFieldIds) !== JSON.stringify(fieldIds)) {
    fail('structural field-scope evidence differs from candidate.');
  }
  const descriptor = assertEnrichmentEngineDescriptor(artifacts.engineDescriptor);
  const baselineRequest = assertEnrichmentShadowCalculationRequest(
    artifacts.baselineRequest,
  );
  const candidateRequest = assertEnrichmentShadowCalculationRequest(
    artifacts.candidateRequest,
  );
  const baselineResult = assertEnrichmentShadowCalculationResultAuthority({
    descriptor,
    request: baselineRequest,
    result: artifacts.baselineResult,
  });
  const candidateResult = assertEnrichmentShadowCalculationResultAuthority({
    descriptor,
    request: candidateRequest,
    result: artifacts.candidateResult,
  });
  assertEngineeringEnrichmentNumericalImpactAuthority({
    candidateProjection: candidate,
    structuralImpact: structural,
    baselineResult,
    candidateResult,
    numericalImpact: artifacts.numericalImpact,
  });
  if (artifacts.repeatedCandidateResult !== null) {
    assertEnrichmentShadowCalculationResultAuthority({
      descriptor,
      request: candidateRequest,
      result: artifacts.repeatedCandidateResult,
    });
  }
  assertRequestCandidateAuthority(candidate, baselineRequest, 'baseline');
  assertRequestCandidateAuthority(candidate, candidateRequest, 'candidate');
  return bundle;
}

function assertRequestCandidateAuthority(candidate, request, label) {
  if (request.sourceDatasetHash !== candidate.sourceDatasetHash
    || request.sourceSharedModelHash !== candidate.sourceSharedModelHash
    || request.sourceStructuralHash !== candidate.sourceStructuralHash
    || request.comparisonCandidateProjectionHash !== candidate.projectionHash) {
    fail(`${label} request differs from candidate authority.`);
  }
}

function fail(message) {
  throw new RangeError(`EngineeringEnrichmentPortableBundleValidation: ${message}`);
}
