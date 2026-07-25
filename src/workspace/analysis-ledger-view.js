import { compareLedgerEntries } from './analysis-ledger-comparison.js';

export function renderAnalysisLedger(documentRef, ledger, status = {}) {
  const section = documentRef.createElement('section');
  section.className = 'analysis-ledger';
  section.dataset.role = 'analysis-ledger';

  const heading = documentRef.createElement('div');
  heading.className = 'analysis-ledger__heading';
  const title = documentRef.createElement('h3');
  title.textContent = 'Analysis history';
  const count = documentRef.createElement('span');
  count.dataset.role = 'analysis-ledger-count';
  count.textContent = `${ledger?.entries?.length || 0} entries`;
  heading.append(title, count);
  section.append(heading);

  if (!ledger?.entries?.length) {
    section.append(emptyText(documentRef, 'Completed and failed reviewed sessions will appear here.'));
    return section;
  }

  const list = documentRef.createElement('div');
  list.className = 'analysis-ledger__list';
  ledger.entries.forEach((entry) => list.append(renderEntry(documentRef, entry, ledger)));
  section.append(list);
  section.append(renderComparison(documentRef, ledger));
  section.append(renderExportControls(documentRef, ledger, status));
  return section;
}

function renderEntry(documentRef, entry, ledger) {
  const article = documentRef.createElement('article');
  article.className = 'analysis-ledger-entry';
  article.dataset.entryId = entry.entryId;
  if (ledger.activeEntryId === entry.entryId) article.classList.add('analysis-ledger-entry--active');

  const header = documentRef.createElement('div');
  header.className = 'analysis-ledger-entry__header';
  const identity = documentRef.createElement('strong');
  identity.textContent = entry.entryId;
  const status = documentRef.createElement('span');
  status.textContent = entry.session.status;
  status.dataset.status = entry.session.status;
  header.append(identity, status);

  const meta = documentRef.createElement('p');
  meta.textContent = `${entry.session.analysisType} · ${entry.session.targetId} · ${entry.session.requestId}`;

  const actions = documentRef.createElement('div');
  actions.className = 'analysis-ledger-entry__actions';
  actions.append(
    actionButton(documentRef, 'activate', 'Set active', entry.entryId, ledger.activeEntryId === entry.entryId),
    actionButton(documentRef, 'compare-left', 'Compare left', entry.entryId, ledger.comparison?.leftEntryId === entry.entryId),
    actionButton(documentRef, 'compare-right', 'Compare right', entry.entryId, ledger.comparison?.rightEntryId === entry.entryId),
  );
  article.append(header, meta, actions);
  return article;
}

function renderComparison(documentRef, ledger) {
  const block = documentRef.createElement('div');
  block.className = 'analysis-ledger-comparison';
  block.dataset.role = 'analysis-ledger-comparison';
  const title = documentRef.createElement('h4');
  title.textContent = 'Comparison';
  block.append(title);

  const leftId = ledger.comparison?.leftEntryId || '';
  const rightId = ledger.comparison?.rightEntryId || '';
  if (!leftId || !rightId) {
    block.append(emptyText(documentRef, 'Choose distinct left and right entries from the same capability.'));
    return block;
  }

  const left = ledger.entries.find((entry) => entry.entryId === leftId);
  const right = ledger.entries.find((entry) => entry.entryId === rightId);
  if (!left || !right) {
    block.append(emptyText(documentRef, 'Comparison entries are unavailable.'));
    return block;
  }

  try {
    const comparison = compareLedgerEntries(left, right);
    const summary = documentRef.createElement('p');
    summary.dataset.role = 'analysis-comparison-summary';
    summary.textContent = [
      `${comparison.counts.changed} changed`,
      `${comparison.counts.equal} equal`,
      `${comparison.counts['left-only']} left-only`,
      `${comparison.counts['right-only']} right-only`,
    ].join(' · ');
    block.append(summary);
    const changedRows = comparison.rows.filter((row) => row.status !== 'equal').slice(0, 40);
    if (changedRows.length) block.append(renderComparisonRows(documentRef, changedRows));
    block.append(simpleAction(documentRef, 'reset-comparison', 'Reset comparison'));
  } catch (error) {
    const message = documentRef.createElement('p');
    message.className = 'analysis-error';
    message.textContent = error instanceof Error ? error.message : String(error);
    block.append(message);
  }
  return block;
}

function renderComparisonRows(documentRef, rows) {
  const table = documentRef.createElement('div');
  table.className = 'analysis-ledger-comparison__rows';
  rows.forEach((row) => {
    const item = documentRef.createElement('div');
    item.className = 'analysis-ledger-comparison__row';
    item.dataset.comparisonStatus = row.status;
    const path = documentRef.createElement('strong');
    path.textContent = row.path;
    const values = documentRef.createElement('span');
    values.textContent = `${row.left} → ${row.right}`;
    item.append(path, values);
    table.append(item);
  });
  return table;
}

function renderExportControls(documentRef, ledger, status) {
  const controls = documentRef.createElement('div');
  controls.className = 'analysis-ledger-export';
  controls.dataset.role = 'analysis-ledger-export';
  ['json', 'csv', 'markdown'].forEach((format) => {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.dataset.ledgerAction = 'export';
    button.dataset.exportFormat = format;
    button.textContent = `Export ${format === 'markdown' ? 'Markdown' : format.toUpperCase()}`;
    button.disabled = !ledger.activeEntryId;
    controls.append(button);
  });
  controls.append(simpleAction(documentRef, 'clear-ledger', 'Clear history'));
  const output = documentRef.createElement('output');
  output.dataset.role = 'analysis-export-status';
  output.textContent = exportStatusText(status);
  controls.append(output);
  return controls;
}

function actionButton(documentRef, action, label, entryId, selected) {
  const button = simpleAction(documentRef, action, label);
  button.dataset.ledgerEntryId = entryId;
  button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  return button;
}

function simpleAction(documentRef, action, label) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.ledgerAction = action;
  button.textContent = label;
  return button;
}

function emptyText(documentRef, text) {
  const empty = documentRef.createElement('p');
  empty.className = 'panel-empty';
  empty.textContent = text;
  return empty;
}

function exportStatusText(status) {
  if (status?.state === 'completed') return `Exported ${status.filename} · ${status.byteLength} bytes`;
  if (status?.state === 'failed') return `${status.code}: ${status.message}`;
  if (status?.state === 'ledger-failed') return `${status.code}: ${status.message}`;
  return 'No report export has been generated.';
}
