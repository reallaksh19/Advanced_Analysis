import { freezeDeep } from '../dataset-utils.js';
import { nonFeaCommonInputStore } from '../non-fea-common-input-store.js';
import {
  NON_FEA_ENRICHMENT_SCHEMAS,
  acceptNonFeaEnrichmentProposal,
  createNonFeaEnrichmentProposal,
  createNonFeaEnrichmentSidecar,
} from '../../core/non-fea-enrichment/index.js';
import {
  validateNonFeaMasterExactCandidateBatch,
} from '../../core/non-fea-enrichment/master-exact-candidates.js';

/**
 * Stages exact enrichment proposals and accepted sidecar records.
 *
 * The store owns no source-model entities and no calculation result. Accepted
 * records remain bound to the exact source semantic hash on which they were
 * reviewed. A source change makes them stale until an explicit exact-match
 * revalidation action is completed by the view/controller.
 */
export class NonFeaEnrichmentStore {
  #snapshot = emptySnapshot(0);

  loadSource(sourceSemanticHash) {
    const next = typeof sourceSemanticHash === 'string' ? sourceSemanticHash : '';
    if (next === this.#snapshot.currentSourceSemanticHash) return this.#snapshot;
    const acceptedBecomeStale = Boolean(
      this.#snapshot.acceptedRecords.length
      && this.#snapshot.boundSourceSemanticHash
      && this.#snapshot.boundSourceSemanticHash !== next
    );
    const snapshot = this.#update({
      currentSourceSemanticHash: next,
      stale: acceptedBecomeStale,
      message: next ? 'Active source changed; accepted records were checked for staleness.' : '',
      error: '',
    });
    if (acceptedBecomeStale) nonFeaCommonInputStore.markStale('ENRICHMENT_SOURCE_CHANGED', 'enrichmentSidecarSemanticHash', 'Accepted enrichment records are bound to a different source model.');
    return snapshot;
  }

  stageProposal(input) {
    const proposal = createNonFeaEnrichmentProposal(input);
    const proposals = [
      ...this.#snapshot.proposals.filter((row) => row.proposalId !== proposal.proposalId),
      proposal,
    ].sort((left, right) => left.proposalId.localeCompare(right.proposalId));
    return this.#update({ proposals, message: `Staged exact proposal ${proposal.proposalId}.`, error: '' });
  }

  stageMasterCandidateBatch(input) {
    const batch = validateNonFeaMasterExactCandidateBatch(input);
    if (batch.status !== 'READY_FOR_REVIEW') {
      throw new TypeError('Blocked approved-master candidate batches cannot be staged for acceptance.');
    }
    const currentHash = requiredSourceHash(this.#snapshot.currentSourceSemanticHash);
    if (batch.sourceSemanticHash !== currentHash) {
      throw new TypeError('Approved-master candidate batch is stale against the active source model.');
    }
    const proposalsById = new Map(this.#snapshot.proposals.map((row) => [row.proposalId, row]));
    batch.proposals.forEach((proposal) => proposalsById.set(proposal.proposalId, proposal));
    return this.#update({
      proposals: [...proposalsById.values()].sort((left, right) => left.proposalId.localeCompare(right.proposalId)),
      message: `Staged ${batch.proposals.length} exact approved-master proposals for explicit review.`,
      error: '',
    });
  }

  stageMigratedRecords(report) {
    if (!report || report.schema !== NON_FEA_ENRICHMENT_SCHEMAS.LEGACY_MIGRATION) {
      throw new TypeError('A Non-FEA legacy migration report is required.');
    }
    const migrated = report.records.map((record) => createNonFeaEnrichmentProposal({
      proposalId: `migration:${record.recordId}`,
      record,
      rationale: `Review migrated ${record.migration?.legacyAuthority || 'legacy'} evidence before acceptance.`,
    }));
    const byId = new Map(this.#snapshot.proposals.map((row) => [row.proposalId, row]));
    migrated.forEach((row) => byId.set(row.proposalId, row));
    return this.#update({
      proposals: [...byId.values()].sort((left, right) => left.proposalId.localeCompare(right.proposalId)),
      migrationReport: report,
      message: report.blockers?.length
        ? `Staged ${migrated.length} migrated records; acceptance is blocked by ${report.blockers.length} migration decisions.`
        : `Staged ${migrated.length} migrated records for explicit review.`,
      error: '',
    });
  }

  importAcceptedSidecar(sidecar) {
    if (!sidecar || sidecar.schema !== NON_FEA_ENRICHMENT_SCHEMAS.SIDECAR) {
      throw new TypeError(`Expected ${NON_FEA_ENRICHMENT_SCHEMAS.SIDECAR}.`);
    }
    const validated = createNonFeaEnrichmentSidecar(sidecar);
    if (sidecar.semanticHash !== validated.semanticHash) {
      throw new TypeError('Imported enrichment sidecar semantic hash is invalid.');
    }
    return this.#updateAuthority({
      acceptedRecords: validated.records,
      boundSourceSemanticHash: validated.sourceSemanticHash,
      stale: validated.sourceSemanticHash !== this.#snapshot.currentSourceSemanticHash,
      proposals: [],
      migrationReport: null,
      message: `Imported ${validated.records.length} accepted common-enrichment records.`,
      error: '',
    }, 'ENRICHMENT_SIDECAR_IMPORTED', 'An accepted enrichment sidecar was imported.');
  }

  acceptProposal(proposalId, decision = {}) {
    const proposal = this.#snapshot.proposals.find((row) => row.proposalId === proposalId);
    if (!proposal) throw new RangeError(`Unknown enrichment proposal: ${proposalId}.`);
    if (proposal.record.migration && this.#snapshot.migrationReport?.blockers?.length) {
      throw new TypeError('Resolve all migration blockers before accepting migrated records.');
    }
    const currentHash = requiredSourceHash(this.#snapshot.currentSourceSemanticHash);
    const proposalSourceHash = proposal.record.evidence?.sourceSemanticHash;
    if (proposalSourceHash && proposalSourceHash !== currentHash) {
      throw new TypeError('Enrichment proposal is stale against the active source model.');
    }
    if (this.#snapshot.boundSourceSemanticHash && this.#snapshot.boundSourceSemanticHash !== currentHash) {
      throw new TypeError('Accepted records are stale. Revalidate or clear them before accepting another proposal.');
    }
    const accepted = acceptNonFeaEnrichmentProposal(proposal, decision);
    const records = [
      ...this.#snapshot.acceptedRecords.filter((row) => row.recordId !== accepted.recordId),
      accepted,
    ];
    createNonFeaEnrichmentSidecar({ sourceSemanticHash: currentHash, records });
    return this.#updateAuthority({
      acceptedRecords: records,
      boundSourceSemanticHash: currentHash,
      stale: false,
      proposals: this.#snapshot.proposals.filter((row) => row.proposalId !== proposalId),
      message: `Accepted exact enrichment record ${accepted.recordId}.`,
      error: '',
    }, 'ENRICHMENT_RECORD_ACCEPTED', `Accepted enrichment record ${accepted.recordId}.`);
  }

  acceptAllProposals() {
    if (this.#snapshot.migrationReport?.blockers?.length) {
      throw new TypeError('Resolve migration blockers before accepting all migrated records.');
    }
    let snapshot = this.#snapshot;
    for (const proposal of [...snapshot.proposals]) {
      this.acceptProposal(proposal.proposalId);
      snapshot = this.#snapshot;
    }
    return snapshot;
  }

  rejectProposal(proposalId) {
    return this.#update({
      proposals: this.#snapshot.proposals.filter((row) => row.proposalId !== proposalId),
      message: `Rejected proposal ${proposalId}.`,
      error: '',
    });
  }

  removeAccepted(recordId) {
    const records = this.#snapshot.acceptedRecords.filter((row) => row.recordId !== recordId);
    return this.#updateAuthority({
      acceptedRecords: records,
      boundSourceSemanticHash: records.length ? this.#snapshot.boundSourceSemanticHash : '',
      stale: records.length ? this.#snapshot.stale : false,
      message: `Removed accepted record ${recordId}.`,
      error: '',
    }, 'ENRICHMENT_RECORD_REMOVED', `Accepted enrichment record ${recordId} was removed.`);
  }

  rebindCurrentSource() {
    const currentHash = requiredSourceHash(this.#snapshot.currentSourceSemanticHash);
    if (!this.#snapshot.acceptedRecords.length) throw new TypeError('No accepted records require rebinding.');
    createNonFeaEnrichmentSidecar({ sourceSemanticHash: currentHash, records: this.#snapshot.acceptedRecords });
    return this.#updateAuthority({
      boundSourceSemanticHash: currentHash,
      stale: false,
      message: 'Accepted records were explicitly rebound after exact-match revalidation.',
      error: '',
    }, 'ENRICHMENT_REBOUND', 'Accepted enrichment records were rebound to the current source model.');
  }

  clear() {
    const hadAuthority = this.#snapshot.acceptedRecords.length > 0;
    this.#snapshot = emptySnapshot(this.#snapshot.version + 1);
    if (hadAuthority) nonFeaCommonInputStore.markStale('ENRICHMENT_CLEARED', 'enrichmentSidecarSemanticHash', 'Accepted enrichment authority was cleared.');
    return this.#snapshot;
  }

  setError(error) { return this.#update({ error: String(error), message: '' }); }
  setMessage(message) { return this.#update({ message: String(message), error: '' }); }
  getSnapshot() { return this.#snapshot; }

  #updateAuthority(patch, code, message) {
    const snapshot = this.#update(patch);
    nonFeaCommonInputStore.markStale(code, 'enrichmentSidecarSemanticHash', message);
    return snapshot;
  }

  #update(patch) {
    this.#snapshot = freezeDeep({
      ...this.#snapshot,
      ...patch,
      version: this.#snapshot.version + 1,
    });
    return this.#snapshot;
  }
}

export const nonFeaEnrichmentStore = new NonFeaEnrichmentStore();

function emptySnapshot(version) {
  return freezeDeep({
    currentSourceSemanticHash: '',
    boundSourceSemanticHash: '',
    stale: false,
    proposals: [],
    acceptedRecords: [],
    migrationReport: null,
    message: '',
    error: '',
    version,
  });
}

function requiredSourceHash(value) {
  if (typeof value !== 'string' || !value) throw new TypeError('An active shared-model source semantic hash is required.');
  return value;
}
