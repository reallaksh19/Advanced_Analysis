import { freezeDeep } from './dataset-utils.js';
import { compareLedgerEntries } from './analysis-ledger-comparison.js';

export const ANALYSIS_REPORT_SCHEMA = 'analysis-report/v1';

export function buildAnalysisReport(ledgerSnapshot) {
  assertLedgerSnapshot(ledgerSnapshot);
  const comparison = resolveComparison(ledgerSnapshot);
  if (comparison) {
    const left = requireEntry(ledgerSnapshot, comparison.leftEntryId);
    const right = requireEntry(ledgerSnapshot, comparison.rightEntryId);
    return freezeDeep({
      schema: ANALYSIS_REPORT_SCHEMA,
      reportId: `analysis-report-${left.entryId}-vs-${right.entryId}`,
      mode: 'comparison',
      datasetId: ledgerSnapshot.datasetId,
      activeEntryId: ledgerSnapshot.activeEntryId,
      entryIds: [left.entryId, right.entryId],
      entries: [reportEntry(left), reportEntry(right)],
      comparison: compareLedgerEntries(left, right),
    });
  }

  const active = requireEntry(ledgerSnapshot, ledgerSnapshot.activeEntryId);
  return freezeDeep({
    schema: ANALYSIS_REPORT_SCHEMA,
    reportId: `analysis-report-${active.entryId}`,
    mode: 'single',
    datasetId: ledgerSnapshot.datasetId,
    activeEntryId: active.entryId,
    entryIds: [active.entryId],
    entries: [reportEntry(active)],
    comparison: null,
  });
}

export function validateAnalysisReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object') errors.push('Report must be an object.');
  if (report?.schema !== ANALYSIS_REPORT_SCHEMA) errors.push(`Report schema must be ${ANALYSIS_REPORT_SCHEMA}.`);
  if (!['single', 'comparison'].includes(report?.mode)) errors.push('Report mode is invalid.');
  if (typeof report?.datasetId !== 'string' || !report.datasetId) errors.push('Report datasetId is required.');
  if (!Array.isArray(report?.entries) || !report.entries.length) errors.push('Report entries are required.');
  if (report?.mode === 'comparison' && report?.comparison?.schema !== 'analysis-ledger-comparison/v1') {
    errors.push('Comparison report requires a valid comparison contract.');
  }
  return freezeDeep({ ok: errors.length === 0, errors });
}

function reportEntry(entry) {
  const session = entry.session;
  return {
    entryId: entry.entryId,
    sequence: entry.sequence,
    archiveKey: entry.archiveKey,
    sessionSchema: session.schema,
    sessionId: session.sessionId,
    requestId: session.requestId,
    targetId: session.targetId,
    analysisType: session.analysisType,
    datasetId: session.datasetId,
    workspaceVersion: session.workspaceVersion,
    sessionVersion: session.version,
    status: session.status,
    inputs: session.inputs,
    overrides: session.overrides,
    fieldErrors: session.fieldErrors,
    readiness: session.readiness,
    result: session.result,
    failure: session.failure,
  };
}

function resolveComparison(snapshot) {
  const comparison = snapshot.comparison;
  if (!comparison?.leftEntryId || !comparison?.rightEntryId) return null;
  return comparison;
}

function requireEntry(snapshot, entryId) {
  const entry = snapshot.entries.find((item) => item.entryId === entryId);
  if (!entry) throw new Error(`Analysis report entry is not available: ${entryId}.`);
  return entry;
}

function assertLedgerSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== 'analysis-ledger/v1') {
    throw new TypeError('Analysis report requires analysis-ledger/v1.');
  }
  if (!snapshot.entries.length) throw new Error('Analysis report requires at least one ledger entry.');
}
