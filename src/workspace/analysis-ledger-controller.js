import { AnalysisLedger } from './analysis-ledger-store.js';
import { buildAnalysisReport } from './analysis-report.js';
import { exportAnalysisReport, triggerAnalysisDownload } from './analysis-report-export.js';
import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';

export class AnalysisLedgerController {
  constructor(
    eventBus = EventBus,
    ledgerStore = AnalysisLedger,
    documentRef = globalThis.document,
    download = triggerAnalysisDownload,
  ) {
    this.eventBus = eventBus;
    this.ledgerStore = ledgerStore;
    this.documentRef = documentRef;
    this.download = download;
    this.unsubscribers = [];
  }

  init() {
    if (this.unsubscribers.length) return;
    this.unsubscribers = [
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOADED, ({ datasetId }) => this.resetDataset(datasetId)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => this.clearAll()),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_SESSION_CHANGED, ({ session }) => this.capture(session)),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_LEDGER_ACTIVE_REQUESTED, ({ entryId }) => this.activate(entryId)),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_LEDGER_COMPARISON_REQUESTED, (payload) => this.compare(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_LEDGER_COMPARISON_RESET_REQUESTED, () => this.resetComparison()),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_LEDGER_CLEAR_REQUESTED, () => this.clearEntries()),
      this.eventBus.subscribe(EVENT_TOPICS.ANALYSIS_EXPORT_REQUESTED, (payload) => this.export(payload)),
    ];
  }

  resetDataset(datasetId) {
    this.ledgerStore.resetForDataset(datasetId);
    this.publish();
  }

  capture(session) {
    try {
      const before = this.ledgerStore.getSnapshot().version;
      this.ledgerStore.archive(session);
      if (this.ledgerStore.getSnapshot().version !== before) this.publish();
    } catch (error) {
      this.publishFailure('LEDGER_ARCHIVE_FAILED', error);
    }
  }

  activate(entryId) {
    try {
      this.ledgerStore.selectActive(entryId);
      this.publish();
    } catch (error) {
      this.publishFailure('LEDGER_ACTIVE_FAILED', error);
    }
  }

  compare({ side, entryId }) {
    try {
      this.ledgerStore.setComparisonSide(side, entryId);
      this.publish();
    } catch (error) {
      this.publishFailure('LEDGER_COMPARISON_FAILED', error);
    }
  }

  resetComparison() {
    this.ledgerStore.clearComparison();
    this.publish();
  }

  clearEntries() {
    const datasetId = this.ledgerStore.getSnapshot().datasetId;
    if (datasetId) this.ledgerStore.resetForDataset(datasetId);
    else this.ledgerStore.clear();
    this.publish();
  }

  clearAll() {
    this.ledgerStore.clear();
    this.publish();
  }

  export({ format }) {
    try {
      const report = buildAnalysisReport(this.ledgerStore.getSnapshot());
      const artifact = exportAnalysisReport(report, format);
      this.download(this.documentRef, artifact);
      this.eventBus.publish(EVENT_TOPICS.ANALYSIS_EXPORT_COMPLETED, { artifact });
    } catch (error) {
      this.publishFailure('ANALYSIS_EXPORT_FAILED', error, EVENT_TOPICS.ANALYSIS_EXPORT_FAILED);
    }
  }

  publish() {
    this.eventBus.publish(EVENT_TOPICS.ANALYSIS_LEDGER_CHANGED, {
      ledger: this.ledgerStore.getSnapshot(),
    });
  }

  publishFailure(code, error, topic = EVENT_TOPICS.ANALYSIS_LEDGER_FAILED) {
    this.eventBus.publish(topic, {
      code,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.ledgerStore.clear();
  }
}
