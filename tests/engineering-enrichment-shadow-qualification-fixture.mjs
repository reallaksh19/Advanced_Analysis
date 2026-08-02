import {
  buildEnrichmentEvidenceIndex,
  buildEnrichmentEvidenceLineageGraph,
  buildEnrichmentObservedAuthority,
  buildEnrichmentPortableBundle,
  buildEnrichmentProposalHandoff,
  buildEnrichmentQualificationManifest,
  buildEnrichmentReviewPacket,
  buildEnrichmentShadowReproducibilityReceipt,
  buildEnrichmentStalenessReport,
  executeEnrichmentShadowCalculation,
} from '../src/workspace/engineering-enrichment/index.js';
import { buildPipeline, engineOutput } from './engineering-enrichment-test-fixture.mjs';

function context() {
  return {
    projectDataHash: null,
    overrideSetHash: null,
    approximationSetHash: null,
    selectorRegistryHash: 'fnv1a64:7777777777777777',
  };
}

function completeEvidence(setup) {
  const reviewPacket = buildEnrichmentReviewPacket({
    masterSnapshots: [setup.masterSnapshot],
    proposals: setup.proposals,
    resolution: setup.resolution,
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    numericalImpact: setup.numericalImpact,
    contextIdentities: context(),
  });
  const observedAuthority = buildEnrichmentObservedAuthority({
    ...reviewPacket.evidenceRefs,
    contextIdentities: reviewPacket.contextIdentities,
  });
  const stalenessReport = buildEnrichmentStalenessReport({ reviewPacket, observedAuthority });
  const repeatedCandidateResult = executeEnrichmentShadowCalculation({
    descriptor: setup.descriptor,
    request: setup.candidateRequest,
    runEngine: () => engineOutput(12),
  });
  const reproducibilityReceipt = buildEnrichmentShadowReproducibilityReceipt({
    referenceCandidateResult: setup.candidateResult,
    repeatedCandidateResult,
  });
  return { reviewPacket, observedAuthority, stalenessReport, repeatedCandidateResult, reproducibilityReceipt };
}

export function buildQualificationPackage({
  setup = buildPipeline(),
  optionalLifecycle = true,
} = {}) {
  const evidence = completeEvidence(setup);
  const bundle = buildEnrichmentPortableBundle({
    masterSnapshots: [setup.masterSnapshot],
    proposals: setup.proposals,
    resolution: setup.resolution,
    candidateProjection: setup.candidateProjection,
    structuralImpact: setup.structuralImpact,
    engineDescriptor: setup.descriptor,
    baselineReference: setup.baselineReference,
    baselineRequest: setup.baselineRequest,
    candidateRequest: setup.candidateRequest,
    baselineResult: setup.baselineResult,
    candidateResult: setup.candidateResult,
    numericalImpact: setup.numericalImpact,
    reviewPacket: evidence.reviewPacket,
    observedAuthority: optionalLifecycle ? evidence.observedAuthority : null,
    stalenessReport: optionalLifecycle ? evidence.stalenessReport : null,
    repeatedCandidateResult: optionalLifecycle ? evidence.repeatedCandidateResult : null,
    reproducibilityReceipt: optionalLifecycle ? evidence.reproducibilityReceipt : null,
  });
  const lineageGraph = buildEnrichmentEvidenceLineageGraph({ bundle });
  const qualificationManifest = buildEnrichmentQualificationManifest({ bundle, lineageGraph });
  const evidenceIndex = buildEnrichmentEvidenceIndex({ bundle, lineageGraph, qualificationManifest });
  const proposalHandoff = buildEnrichmentProposalHandoff({ bundle, lineageGraph, qualificationManifest, evidenceIndex });
  return { bundle, lineageGraph, qualificationManifest, evidenceIndex, proposalHandoff };
}
