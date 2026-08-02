import {
  ENRICHMENT_OBSERVED_AUTHORITY_SCHEMA,
  ENRICHMENT_REPRODUCIBILITY_RECEIPT_SCHEMA,
  ENRICHMENT_REVIEW_PACKET_SCHEMA,
  ENRICHMENT_STALENESS_REPORT_SCHEMA,
  assertEngineeringEnrichmentObservedAuthority,
  assertEngineeringEnrichmentReviewPacket,
  assertEngineeringEnrichmentShadowReproducibilityReceipt,
  assertEngineeringEnrichmentStalenessReport,
  buildEnrichmentObservedAuthority,
  buildEnrichmentReviewPacket as buildReviewPacketBase,
  buildEnrichmentShadowReproducibilityReceipt,
  buildEnrichmentStalenessReport,
} from './review-package.js';
import {
  assertEngineeringEnrichmentCandidateProjection,
} from './candidate-projection.js';
import {
  assertEngineeringEnrichmentProposalAuthority,
} from './master-adapters.js';
import {
  assertEngineeringEnrichmentNumericalImpact,
} from './numerical-impact-validation.js';
import {
  assertEngineeringEnrichmentResolution,
} from './resolution-validation.js';
import {
  assertEngineeringEnrichmentStructuralImpact,
} from './structural-impact.js';

export {
  ENRICHMENT_OBSERVED_AUTHORITY_SCHEMA,
  ENRICHMENT_REPRODUCIBILITY_RECEIPT_SCHEMA,
  ENRICHMENT_REVIEW_PACKET_SCHEMA,
  ENRICHMENT_STALENESS_REPORT_SCHEMA,
  assertEngineeringEnrichmentObservedAuthority,
  assertEngineeringEnrichmentReviewPacket,
  assertEngineeringEnrichmentShadowReproducibilityReceipt,
  assertEngineeringEnrichmentStalenessReport,
  buildEnrichmentObservedAuthority,
  buildEnrichmentShadowReproducibilityReceipt,
  buildEnrichmentStalenessReport,
};

export function buildEnrichmentReviewPacket(input) {
  input.proposals.forEach((proposal) => {
    assertEngineeringEnrichmentProposalAuthority({
      proposal,
      masterSnapshots: input.masterSnapshots,
    });
  });
  assertEngineeringEnrichmentResolution(input.resolution);
  assertEngineeringEnrichmentCandidateProjection(input.candidateProjection);
  assertEngineeringEnrichmentStructuralImpact(input.structuralImpact);
  assertEngineeringEnrichmentNumericalImpact(input.numericalImpact);
  return buildReviewPacketBase(input);
}
