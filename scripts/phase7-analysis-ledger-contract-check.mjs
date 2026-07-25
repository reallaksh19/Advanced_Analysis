#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AnalysisLedgerController } from '../src/workspace/analysis-ledger-controller.js';
import { compareLedgerEntries } from '../src/workspace/analysis-ledger-comparison.js';
import {
  AnalysisLedgerStore,
  MAX_ANALYSIS_LEDGER_ENTRIES,
} from '../src/workspace/analysis-ledger-store.js';
import { buildAnalysisReport, validateAnalysisReport } from '../src/workspace/analysis-report.js';
import { exportAnalysisReport } from '../src/workspace/analysis-report-export.js';
import { EventBus } from '../src/workspace/event-bus.js';
import { EVENT_TOPICS } from '../src/workspace/event-topics.js';

const completedOne = session({
  sessionId: 'analysis-session-1',
  requestId: 'analysis-1',
  version: 3,
  od: 168.3,
  load: 12.5,
});
const completedTwo = session({
  sessionId: 'analysis-session-1',
  requestId: 'analysis-2',
  version: 6,
  od: 219.1,
  load: 19.75,
});
const failed = session({
  sessionId: 'analysis-session-2',
  requestId: 'analysis-3',
  version: 2,
  status: 'failed',
  od: 0,
  load: null,
});

console.log('\n--- Phase 7 Analysis Ledger Contract Check ---');

const store = new AnalysisLedgerStore();
store.resetForDataset('DATASET-A');
assert.equal(store.archive({ ...completedOne, status: 'ready' }), null);
const first = store.archive(completedOne);
assert.equal(first.entryId, 'analysis-ledger-entry-1');
assert.equal(store.archive(completedOne).entryId, first.entryId);
assert.equal(store.getSnapshot().entries.length, 1);
const second = store.archive(completedTwo);
const third = store.archive(failed);
assert.equal(second.entryId, 'analysis-ledger-entry-2');
assert.equal(third.entryId, 'analysis-ledger-entry-3');
assert.equal(store.getSnapshot().activeEntryId, third.entryId);
assert.ok(Object.isFrozen(store.getSnapshot()));
assert.ok(Object.isFrozen(store.getSnapshot().entries));
assert.ok(Object.isFrozen(first.session));
console.log('✅ Terminal sessions archive once with deterministic immutable entries.');

store.selectActive(first.entryId);
assert.equal(store.getSnapshot().activeEntryId, first.entryId);
assert.throws(() => store.selectActive('missing-entry'), /not available/);
store.setComparisonSide('left', first.entryId);
store.setComparisonSide('right', second.entryId);
assert.deepEqual(store.getSnapshot().comparison, {
  leftEntryId: first.entryId,
  rightEntryId: second.entryId,
});
assert.throws(() => store.setComparisonSide('right', first.entryId), /distinct/);
console.log('✅ Active selection and compatible comparison are deterministic.');

const comparison = compareLedgerEntries(first, second);
assert.equal(comparison.schema, 'analysis-ledger-comparison/v1');
assert.ok(comparison.counts.changed > 0);
assert.ok(comparison.rows.some((row) => row.path === 'overrides.pipeOdMm' && row.status === 'changed'));
assert.ok(comparison.rows.some((row) => row.path === 'requestId' && row.status === 'changed'));
assert.ok(comparison.rows.some((row) => row.path === 'archiveKey' && row.status === 'changed'));
assert.ok(Object.isFrozen(comparison.rows));
console.log('✅ Comparison emits stable path-level engineering and request trace evidence.');

const comparisonReport = buildAnalysisReport(store.getSnapshot());
assert.equal(comparisonReport.schema, 'analysis-report/v1');
assert.equal(comparisonReport.mode, 'comparison');
assert.equal(comparisonReport.entries[0].archiveKey, 'analysis-session-1:analysis-1');
assert.equal(comparisonReport.entries[0].sessionSchema, 'analysis-session/v1');
assert.deepEqual(comparisonReport.entries[0].fieldErrors, {});
assert.equal(validateAnalysisReport(comparisonReport).ok, true);
const jsonOne = exportAnalysisReport(comparisonReport, 'json');
const jsonTwo = exportAnalysisReport(comparisonReport, 'json');
const csv = exportAnalysisReport(comparisonReport, 'csv');
const markdown = exportAnalysisReport(comparisonReport, 'markdown');
assert.equal(jsonOne.content, jsonTwo.content);
assert.equal(jsonOne.filename, jsonTwo.filename);
assert.match(jsonOne.filename, /^analysis-dataset-a-analysis-ledger-entry-1-vs-analysis-ledger-entry-2\.json$/);
assert.ok(csv.content.includes('comparison'));
assert.ok(markdown.content.includes('# Analysis Report'));
assert.ok(!/createdAt|timestamp|Date\(/i.test(jsonOne.content));
console.log('✅ JSON, CSV, and Markdown exports are byte-stable, traceable, and timestamp-free.');

store.clearComparison();
const singleReport = buildAnalysisReport(store.getSnapshot());
assert.equal(singleReport.mode, 'single');
assert.equal(singleReport.activeEntryId, first.entryId);
assert.equal(validateAnalysisReport(singleReport).ok, true);
console.log('✅ Single-entry report follows the active ledger result.');

const boundedStore = new AnalysisLedgerStore();
boundedStore.resetForDataset('DATASET-A');
for (let index = 1; index <= MAX_ANALYSIS_LEDGER_ENTRIES + 2; index += 1) {
  boundedStore.archive(session({
    sessionId: `analysis-session-${index}`,
    requestId: `analysis-${index}`,
    version: index,
    od: 100 + index,
    load: index,
  }));
}
const boundedSnapshot = boundedStore.getSnapshot();
assert.equal(boundedSnapshot.entries.length, MAX_ANALYSIS_LEDGER_ENTRIES);
assert.equal(boundedSnapshot.entries[0].entryId, 'analysis-ledger-entry-3');
assert.equal(boundedSnapshot.activeEntryId, `analysis-ledger-entry-${MAX_ANALYSIS_LEDGER_ENTRIES + 2}`);
assert.equal(boundedStore.getEntry('analysis-ledger-entry-1'), null);
console.log('✅ Ledger retains a bounded 100-entry immutable history with monotonic IDs.');

const comparisonPruneStore = new AnalysisLedgerStore();
comparisonPruneStore.resetForDataset('DATASET-A');
const comparisonFirst = comparisonPruneStore.archive(completedOne);
const comparisonSecond = comparisonPruneStore.archive(completedTwo);
comparisonPruneStore.setComparisonSide('left', comparisonFirst.entryId);
comparisonPruneStore.setComparisonSide('right', comparisonSecond.entryId);
for (let index = 3; index <= MAX_ANALYSIS_LEDGER_ENTRIES + 1; index += 1) {
  comparisonPruneStore.archive(session({
    sessionId: `rollover-session-${index}`,
    requestId: `rollover-analysis-${index}`,
    version: index,
    od: 150 + index,
    load: index,
  }));
}
assert.equal(comparisonPruneStore.getSnapshot().comparison, null);
console.log('✅ Rollover clears comparison state when a selected entry is pruned.');

const controllerStore = new AnalysisLedgerStore();
const downloads = [];
const controller = new AnalysisLedgerController(
  EventBus,
  controllerStore,
  {},
  (_, artifact) => downloads.push(artifact),
);
let changedCount = 0;
let exportArtifact = null;
const unsubscribeChanged = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_LEDGER_CHANGED, () => { changedCount += 1; });
const unsubscribeExport = EventBus.subscribe(EVENT_TOPICS.ANALYSIS_EXPORT_COMPLETED, ({ artifact }) => {
  exportArtifact = artifact;
});
controller.init();
EventBus.publish(EVENT_TOPICS.DATASET_LOADED, { datasetId: 'DATASET-A', nodeCount: 1 });
EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_CHANGED, { session: completedOne, version: 1 });
EventBus.publish(EVENT_TOPICS.ANALYSIS_SESSION_CHANGED, { session: completedOne, version: 2 });
assert.equal(controllerStore.getSnapshot().entries.length, 1);
EventBus.publish(EVENT_TOPICS.ANALYSIS_EXPORT_REQUESTED, { format: 'json' });
assert.equal(downloads.length, 1);
assert.equal(exportArtifact.filename, downloads[0].filename);
EventBus.publish(EVENT_TOPICS.ANALYSIS_LEDGER_CLEAR_REQUESTED, {});
assert.equal(controllerStore.getSnapshot().entries.length, 0);
assert.equal(controllerStore.getSnapshot().datasetId, 'DATASET-A');
assert.ok(changedCount >= 3);
controller.destroy();
unsubscribeChanged();
unsubscribeExport();
for (const topic of ledgerTopics()) assert.equal(EventBus.listenerCount(topic), 0);
console.log('✅ Controller archives idempotently, exports explicitly, clears, and detaches.');

const runtimeFiles = [
  'src/workspace/analysis-ledger-store.js',
  'src/workspace/analysis-ledger-controller.js',
  'src/workspace/analysis-ledger-comparison.js',
  'src/workspace/analysis-report.js',
  'src/workspace/analysis-report-export.js',
  'src/workspace/analysis-ledger-view.js',
  'src/workspace/properties-panel.js',
  'src/workspace/event-topics.js',
];
for (const file of runtimeFiles) {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  const lines = source.split(/\r?\n/).length;
  assert.ok(lines <= 300, `${file} exceeds 300 lines (${lines}).`);
  assert.ok(!source.includes('Math.random'), `${file} must not use Math.random.`);
  assert.ok(!source.includes('Date.now'), `${file} must not use Date.now.`);
  assert.ok(!source.includes('new Date('), `${file} must not use timestamps.`);
  assert.ok(!/from ['"](?:react|zustand)/.test(source), `${file} must remain framework-neutral.`);
}
const panelSource = fs.readFileSync(path.join(process.cwd(), 'src/workspace/properties-panel.js'), 'utf8');
for (const forbidden of ['analysis-ledger-store', 'analysis-report', 'analysis-report-export']) {
  assert.ok(!panelSource.includes(forbidden), `PropertiesPanel must not import ${forbidden}.`);
}
console.log('✅ Runtime modules satisfy size, determinism, framework, and panel-isolation guards.');
console.log('\n✅ Phase 7 analysis ledger contract check passed.\n');

function session({ sessionId, requestId, version, status = 'completed', od, load }) {
  return Object.freeze({
    schema: 'analysis-session/v1',
    sessionId,
    targetId: 'PIPE-1',
    analysisType: 'support-load',
    datasetId: 'DATASET-A',
    workspaceVersion: 2,
    version,
    status,
    requestId,
    inputs: Object.freeze([
      Object.freeze({
        key: 'pipeOdMm',
        label: 'Pipe OD',
        unit: 'mm',
        kind: 'number',
        required: true,
        editable: true,
        value: od,
        source: 'override',
        sourcePath: 'analysisSession.overrides.pipeOdMm',
        validation: 'positive',
      }),
    ]),
    overrides: Object.freeze({ pipeOdMm: od }),
    fieldErrors: Object.freeze({}),
    readiness: Object.freeze({ enabled: status === 'completed', reason: '', missing: [] }),
    result: status === 'completed' ? Object.freeze({
      schema: 'solver-result-contract-v1',
      status: 'CALCULATED',
      summary: Object.freeze({ load }),
      results: Object.freeze({ vertical: Object.freeze({ load }) }),
      warnings: Object.freeze([]),
      diagnostics: Object.freeze([]),
      meta: Object.freeze({ analysisSessionId: sessionId }),
    }) : null,
    failure: status === 'failed' ? Object.freeze({ code: 'CAPABILITY_NOT_READY', message: 'Missing inputs.' }) : null,
  });
}

function ledgerTopics() {
  return [
    EVENT_TOPICS.DATASET_LOADED,
    EVENT_TOPICS.DATASET_CLEARED,
    EVENT_TOPICS.ANALYSIS_SESSION_CHANGED,
    EVENT_TOPICS.ANALYSIS_LEDGER_ACTIVE_REQUESTED,
    EVENT_TOPICS.ANALYSIS_LEDGER_COMPARISON_REQUESTED,
    EVENT_TOPICS.ANALYSIS_LEDGER_COMPARISON_RESET_REQUESTED,
    EVENT_TOPICS.ANALYSIS_LEDGER_CLEAR_REQUESTED,
    EVENT_TOPICS.ANALYSIS_EXPORT_REQUESTED,
  ];
}
