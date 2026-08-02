import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireCommonEnrichedPropertiesCandidate } from './candidate.js';
import { failCommonEnrichment } from './errors.js';
import {
  publishCommonEnrichedPropertiesBaseline,
  requireCommonEnrichedPropertiesBaseline,
  requireCommonEnrichedPublicationDecision,
} from './publication.js';
import {
  requireExactKeys,
  requireIdentity,
  requireIsoDateTime,
  requireMember,
  requirePositiveInteger,
  requireSemanticHash,
} from './validation.js';

export const COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA =
  'common-enriched-publication-orchestration/v1';
export const COMMON_ENRICHED_PUBLICATION_OUTCOME_SCHEMA =
  'common-enriched-publication-outcome/v1';
export const COMMON_ENRICHED_PUBLICATION_OUTCOME_STATUSES = Object.freeze([
  'PUBLISHED',
  'REJECTED',
]);

const ORCHESTRATION_INPUT_KEYS = Object.freeze([
  'schema',
  'transactionId',
  'candidate',
  'decision',
  'previousBaseline',
  'publicationIdentity',
]);
const PUBLICATION_IDENTITY_KEYS = Object.freeze(['baselineId', 'publishedAt']);
const OUTCOME_KEYS = Object.freeze([
  'schema',
  'transactionId',
  'projectId',
  'candidateSemanticHash',
  'candidateRevision',
  'candidateCreatedAt',
  'candidateReviewLedgerHash',
  'decision',
  'decisionSemanticHash',
  'previousBaselineId',
  'previousBaselineRevision',
  'previousBaselinePublishedAt',
  'previousBaselineSemanticHash',
  'status',
  'publishedAt',
  'baseline',
  'semanticHash',
]);

export function publicationOutcomeSemanticProjection(value) {
  return Object.fromEntries(OUTCOME_KEYS
    .filter((key) => key !== 'semanticHash')
    .map((key) => [key, value[key]]));
}

export function computePublicationOutcomeSemanticHash(value) {
  return semanticHash(publicationOutcomeSemanticProjection(value));
}

export function orchestrateCommonEnrichedPublication(input) {
  requireExactKeys(input, ORCHESTRATION_INPUT_KEYS, 'publicationOrchestrationDraft');
  if (input.schema !== COMMON_ENRICHED_PUBLICATION_ORCHESTRATION_SCHEMA) {
    failCommonEnrichment(
      'publicationOrchestrationDraft.schema is unsupported.',
      'COMMON_ENRICHED_SCHEMA_INVALID',
    );
  }

  const transactionId = requireIdentity(
    input.transactionId,
    'publicationOrchestration.transactionId',
  );
  const candidate = requireCommonEnrichedPropertiesCandidate(input.candidate);
  const decision = requireCommonEnrichedPublicationDecision(input.decision);
  const previousBaseline = input.previousBaseline === null
    ? null
    : requireCommonEnrichedPropertiesBaseline(input.previousBaseline);

  requireDecisionBinding(candidate, decision);
  requireRevisionChain(candidate, previousBaseline);
  requireCandidateChronology(candidate, decision, previousBaseline);

  let baseline = null;
  let publishedAt = null;
  let status = 'REJECTED';

  if (decision.decision === 'APPROVE') {
    if (input.publicationIdentity === null) {
      failCommonEnrichment(
        'An approved candidate requires explicit publication identity.',
        'COMMON_ENRICHED_PUBLICATION_IDENTITY_REQUIRED',
      );
    }
    requireExactKeys(
      input.publicationIdentity,
      PUBLICATION_IDENTITY_KEYS,
      'publicationOrchestration.publicationIdentity',
    );
    const baselineId = requireIdentity(
      input.publicationIdentity.baselineId,
      'publicationOrchestration.publicationIdentity.baselineId',
    );
    publishedAt = requireIsoDateTime(
      input.publicationIdentity.publishedAt,
      'publicationOrchestration.publicationIdentity.publishedAt',
    );
    if (previousBaseline && previousBaseline.baselineId === baselineId) {
      failCommonEnrichment(
        'A new revision requires a new baseline identity.',
        'COMMON_ENRICHED_PUBLICATION_BASELINE_ID_REUSED',
        { baselineId },
      );
    }
    requireNotBefore(
      publishedAt,
      decision.decidedAt,
      'Publication timestamp precedes the approval decision.',
      'COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID',
    );
    baseline = publishCommonEnrichedPropertiesBaseline(candidate, decision, {
      baselineId,
      revision: candidate.revision,
      publishedAt,
    });
    status = 'PUBLISHED';
  } else if (input.publicationIdentity !== null) {
    failCommonEnrichment(
      'A rejected candidate must not carry publication identity.',
      'COMMON_ENRICHED_PUBLICATION_REJECTED_IDENTITY_INVALID',
    );
  }

  const draft = {
    schema: COMMON_ENRICHED_PUBLICATION_OUTCOME_SCHEMA,
    transactionId,
    projectId: candidate.projectId,
    candidateSemanticHash: candidate.semanticHash,
    candidateRevision: candidate.revision,
    candidateCreatedAt: candidate.createdAt,
    candidateReviewLedgerHash: candidate.reviewLedgerHash,
    decision,
    decisionSemanticHash: semanticHash(decision),
    previousBaselineId: previousBaseline?.baselineId ?? null,
    previousBaselineRevision: previousBaseline?.revision ?? null,
    previousBaselinePublishedAt: previousBaseline?.publishedAt ?? null,
    previousBaselineSemanticHash: previousBaseline?.semanticHash ?? null,
    status,
    publishedAt,
    baseline,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return requireCommonEnrichedPublicationOutcome({
    ...draft,
    semanticHash: computePublicationOutcomeSemanticHash(draft),
  });
}

export function requireCommonEnrichedPublicationOutcome(value) {
  requireExactKeys(value, OUTCOME_KEYS, 'publicationOutcome');
  if (value.schema !== COMMON_ENRICHED_PUBLICATION_OUTCOME_SCHEMA) {
    failCommonEnrichment('publicationOutcome.schema is unsupported.', 'COMMON_ENRICHED_SCHEMA_INVALID');
  }
  const decision = requireCommonEnrichedPublicationDecision(value.decision);
  const previous = normalizePreviousBaselineEvidence(value);
  const outcome = {
    schema: value.schema,
    transactionId: requireIdentity(value.transactionId, 'publicationOutcome.transactionId'),
    projectId: requireIdentity(value.projectId, 'publicationOutcome.projectId'),
    candidateSemanticHash: requireSemanticHash(
      value.candidateSemanticHash,
      'publicationOutcome.candidateSemanticHash',
    ),
    candidateRevision: requirePositiveInteger(
      value.candidateRevision,
      'publicationOutcome.candidateRevision',
    ),
    candidateCreatedAt: requireIsoDateTime(
      value.candidateCreatedAt,
      'publicationOutcome.candidateCreatedAt',
    ),
    candidateReviewLedgerHash: requireSemanticHash(
      value.candidateReviewLedgerHash,
      'publicationOutcome.candidateReviewLedgerHash',
    ),
    decision,
    decisionSemanticHash: requireSemanticHash(
      value.decisionSemanticHash,
      'publicationOutcome.decisionSemanticHash',
    ),
    ...previous,
    status: requireMember(
      value.status,
      COMMON_ENRICHED_PUBLICATION_OUTCOME_STATUSES,
      'publicationOutcome.status',
    ),
    publishedAt: value.publishedAt === null
      ? null
      : requireIsoDateTime(value.publishedAt, 'publicationOutcome.publishedAt'),
    baseline: value.baseline === null
      ? null
      : requireCommonEnrichedPropertiesBaseline(value.baseline),
    semanticHash: requireSemanticHash(value.semanticHash, 'publicationOutcome.semanticHash'),
  };

  requireOutcomeBindings(outcome);
  const expectedHash = computePublicationOutcomeSemanticHash(outcome);
  if (outcome.semanticHash !== expectedHash) {
    failCommonEnrichment(
      'publicationOutcome.semanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
      { expected: expectedHash, actual: outcome.semanticHash },
    );
  }
  return deepFreeze(outcome);
}

function requireDecisionBinding(candidate, decision) {
  if (decision.candidateSemanticHash !== candidate.semanticHash) {
    failCommonEnrichment(
      'Publication decision is bound to a different candidate.',
      'COMMON_ENRICHED_PUBLICATION_BINDING_MISMATCH',
    );
  }
  if (decision.evidenceHash !== candidate.reviewLedgerHash) {
    failCommonEnrichment(
      'Publication decision evidence does not bind the candidate review ledger.',
      'COMMON_ENRICHED_PUBLICATION_REVIEW_LEDGER_MISMATCH',
      {
        expected: candidate.reviewLedgerHash,
        actual: decision.evidenceHash,
      },
    );
  }
}

function requireRevisionChain(candidate, previousBaseline) {
  if (previousBaseline === null) {
    if (candidate.revision !== 1) {
      failCommonEnrichment(
        'The first published candidate revision must be 1.',
        'COMMON_ENRICHED_PUBLICATION_REVISION_CHAIN_INVALID',
        { expected: 1, actual: candidate.revision },
      );
    }
    return;
  }
  if (previousBaseline.projectId !== candidate.projectId) {
    failCommonEnrichment(
      'Previous baseline belongs to a different project.',
      'COMMON_ENRICHED_PUBLICATION_PROJECT_MISMATCH',
    );
  }
  if (candidate.revision !== previousBaseline.revision + 1) {
    failCommonEnrichment(
      'Candidate revision does not continue the baseline chain.',
      'COMMON_ENRICHED_PUBLICATION_REVISION_CHAIN_INVALID',
      {
        expected: previousBaseline.revision + 1,
        actual: candidate.revision,
      },
    );
  }
}

function requireCandidateChronology(candidate, decision, previousBaseline) {
  if (previousBaseline) {
    requireNotBefore(
      candidate.createdAt,
      previousBaseline.publishedAt,
      'Candidate predates the previous published baseline.',
      'COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID',
    );
  }
  requireNotBefore(
    decision.decidedAt,
    candidate.createdAt,
    'Publication decision predates the candidate.',
    'COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID',
  );
}

function normalizePreviousBaselineEvidence(value) {
  const entries = [
    value.previousBaselineId,
    value.previousBaselineRevision,
    value.previousBaselinePublishedAt,
    value.previousBaselineSemanticHash,
  ];
  const nullCount = entries.filter((entry) => entry === null).length;
  if (nullCount !== 0 && nullCount !== entries.length) {
    failCommonEnrichment(
      'Previous baseline evidence must be entirely present or entirely null.',
      'COMMON_ENRICHED_PUBLICATION_PREDECESSOR_EVIDENCE_INVALID',
    );
  }
  if (nullCount === entries.length) {
    return {
      previousBaselineId: null,
      previousBaselineRevision: null,
      previousBaselinePublishedAt: null,
      previousBaselineSemanticHash: null,
    };
  }
  return {
    previousBaselineId: requireIdentity(
      value.previousBaselineId,
      'publicationOutcome.previousBaselineId',
    ),
    previousBaselineRevision: requirePositiveInteger(
      value.previousBaselineRevision,
      'publicationOutcome.previousBaselineRevision',
    ),
    previousBaselinePublishedAt: requireIsoDateTime(
      value.previousBaselinePublishedAt,
      'publicationOutcome.previousBaselinePublishedAt',
    ),
    previousBaselineSemanticHash: requireSemanticHash(
      value.previousBaselineSemanticHash,
      'publicationOutcome.previousBaselineSemanticHash',
    ),
  };
}

function requireOutcomeBindings(outcome) {
  if (outcome.decisionSemanticHash !== semanticHash(outcome.decision)) {
    failCommonEnrichment(
      'publicationOutcome.decisionSemanticHash is stale.',
      'COMMON_ENRICHED_HASH_MISMATCH',
    );
  }
  if (outcome.decision.candidateSemanticHash !== outcome.candidateSemanticHash) {
    failCommonEnrichment(
      'Outcome decision is bound to a different candidate.',
      'COMMON_ENRICHED_PUBLICATION_BINDING_MISMATCH',
    );
  }
  if (outcome.decision.evidenceHash !== outcome.candidateReviewLedgerHash) {
    failCommonEnrichment(
      'Outcome decision evidence does not bind the candidate review ledger.',
      'COMMON_ENRICHED_PUBLICATION_REVIEW_LEDGER_MISMATCH',
    );
  }
  const hasPrevious = outcome.previousBaselineRevision !== null;
  const expectedRevision = hasPrevious ? outcome.previousBaselineRevision + 1 : 1;
  if (outcome.candidateRevision !== expectedRevision) {
    failCommonEnrichment(
      'Outcome revision chain is invalid.',
      'COMMON_ENRICHED_PUBLICATION_REVISION_CHAIN_INVALID',
    );
  }
  if (hasPrevious) {
    requireNotBefore(
      outcome.candidateCreatedAt,
      outcome.previousBaselinePublishedAt,
      'Outcome candidate predates its previous baseline.',
      'COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID',
    );
  }
  requireNotBefore(
    outcome.decision.decidedAt,
    outcome.candidateCreatedAt,
    'Outcome decision predates its candidate.',
    'COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID',
  );

  if (outcome.status === 'PUBLISHED') {
    if (outcome.decision.decision !== 'APPROVE'
      || outcome.baseline === null
      || outcome.publishedAt === null) {
      failCommonEnrichment(
        'PUBLISHED outcome requires approval, a baseline, and a publication timestamp.',
        'COMMON_ENRICHED_PUBLICATION_OUTCOME_INVALID',
      );
    }
    requireNotBefore(
      outcome.publishedAt,
      outcome.decision.decidedAt,
      'Outcome publication predates its decision.',
      'COMMON_ENRICHED_PUBLICATION_CHRONOLOGY_INVALID',
    );
    if (outcome.baseline.projectId !== outcome.projectId
      || outcome.baseline.revision !== outcome.candidateRevision
      || outcome.baseline.candidateSemanticHash !== outcome.candidateSemanticHash
      || outcome.baseline.publishedAt !== outcome.publishedAt
      || semanticHash(outcome.baseline.publicationDecision) !== outcome.decisionSemanticHash) {
      failCommonEnrichment(
        'Published baseline does not match the orchestration outcome.',
        'COMMON_ENRICHED_PUBLICATION_OUTCOME_INVALID',
      );
    }
    if (outcome.previousBaselineId !== null
      && outcome.baseline.baselineId === outcome.previousBaselineId) {
      failCommonEnrichment(
        'Published outcome reuses its predecessor baseline identity.',
        'COMMON_ENRICHED_PUBLICATION_BASELINE_ID_REUSED',
      );
    }
    return;
  }

  if (outcome.decision.decision !== 'REJECT'
    || outcome.baseline !== null
    || outcome.publishedAt !== null) {
    failCommonEnrichment(
      'REJECTED outcome must not contain a baseline or publication timestamp.',
      'COMMON_ENRICHED_PUBLICATION_OUTCOME_INVALID',
    );
  }
}

function requireNotBefore(actual, minimum, message, code) {
  if (Date.parse(actual) < Date.parse(minimum)) {
    failCommonEnrichment(message, code, { actual, minimum });
  }
}
