import {
  scalarText,
  workbenchButton,
  workbenchElement,
} from '../workbench-dom.js';
import {
  lfeaResultColumnKeys,
  projectLfeaResultRows,
} from './results-view-model.js';

const PAGE_SIZE = 100;

export function renderLfeaExplorerTable(root, rows, uiState, handlers) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const projected = projectLfeaResultRows(
    sourceRows,
    uiState.query,
    uiState.sortKey,
    uiState.sortDirection,
  );
  const keys = lfeaResultColumnKeys(sourceRows);
  const maximumPage = Math.max(0, Math.ceil(projected.length / PAGE_SIZE) - 1);
  const page = Math.min(uiState.page, maximumPage);
  const start = page * PAGE_SIZE;
  const pageRows = projected.slice(start, start + PAGE_SIZE);

  const wrapper = workbenchElement(root, 'section', 'lfea-results-table');
  wrapper.dataset.role = 'lfea-results-table';
  wrapper.append(
    tableControls(root, keys, sourceRows.length, projected.length, uiState, handlers),
    pageControls(root, start, pageRows.length, projected.length, sourceRows.length, page, maximumPage, handlers),
    tableBody(root, keys, pageRows),
  );
  return wrapper;
}

function tableControls(root, keys, total, filtered, uiState, handlers) {
  const controls = workbenchElement(root, 'div', 'lfea-results-table__controls');
  const filter = workbenchElement(root, 'input');
  filter.type = 'search';
  filter.placeholder = 'Filter exact result cells';
  filter.value = uiState.query;
  filter.dataset.role = 'lfea-results-filter';
  filter.setAttribute('aria-label', 'Filter result rows');
  filter.addEventListener('input', () => handlers.onResultsQuery(filter.value));

  const sortKey = workbenchElement(root, 'select');
  sortKey.dataset.role = 'lfea-results-sort-key';
  sortKey.setAttribute('aria-label', 'Sort result rows by column');
  const original = workbenchElement(root, 'option', null, 'Original order');
  original.value = '';
  original.selected = !uiState.sortKey;
  sortKey.append(original);
  for (const key of keys) {
    const option = workbenchElement(root, 'option', null, key);
    option.value = key;
    option.selected = key === uiState.sortKey;
    sortKey.append(option);
  }
  sortKey.addEventListener('change', () => handlers.onResultsSortKey(sortKey.value));

  const direction = workbenchElement(root, 'select');
  direction.dataset.role = 'lfea-results-sort-direction';
  direction.setAttribute('aria-label', 'Sort direction');
  for (const value of ['asc', 'desc']) {
    const option = workbenchElement(root, 'option', null, value === 'asc' ? 'Ascending' : 'Descending');
    option.value = value;
    option.selected = value === uiState.sortDirection;
    direction.append(option);
  }
  direction.disabled = !uiState.sortKey;
  direction.addEventListener('change', () => handlers.onResultsSortDirection(direction.value));

  const reset = workbenchButton(root, 'Reset table', handlers.onResultsReset);
  reset.dataset.role = 'lfea-results-reset';
  const count = workbenchElement(root, 'output', 'lfea-results-table__count', `${filtered} of ${total} rows`);
  count.dataset.role = 'lfea-results-row-count';
  controls.append(filter, sortKey, direction, reset, count);
  return controls;
}

function pageControls(root, start, count, filtered, total, page, maximumPage, handlers) {
  const controls = workbenchElement(root, 'div', 'lfea-workbench__pagination');
  const end = start + count;
  const label = workbenchElement(
    root,
    'output',
    null,
    `Showing ${filtered ? start + 1 : 0}–${end} of ${filtered} filtered (${total} source)`,
  );
  const previous = workbenchButton(root, 'Previous', () => handlers.onResultsPage(page - 1));
  previous.disabled = page <= 0;
  const next = workbenchButton(root, 'Next', () => handlers.onResultsPage(page + 1));
  next.disabled = page >= maximumPage;
  controls.append(label, previous, next);
  return controls;
}

function tableBody(root, keys, rows) {
  const scroll = workbenchElement(root, 'div', 'lfea-workbench__table lfea-results-table__scroll');
  if (!rows.length) {
    scroll.append(workbenchElement(root, 'p', 'lfea-shell-v2__muted', 'No rows match the current filter.'));
    return scroll;
  }
  const table = workbenchElement(root, 'table');
  const header = workbenchElement(root, 'tr');
  keys.forEach((key) => header.append(workbenchElement(root, 'th', null, key)));
  table.append(header);
  rows.forEach((row) => {
    const tr = workbenchElement(root, 'tr');
    keys.forEach((key) => tr.append(workbenchElement(root, 'td', null, scalarText(row?.[key]))));
    table.append(tr);
  });
  scroll.append(table);
  return scroll;
}
