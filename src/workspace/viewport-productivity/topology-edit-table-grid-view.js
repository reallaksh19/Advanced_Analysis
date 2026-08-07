import {
  topologyEditTableVisibleRows,
} from '../topology-edit/table/topology-edit-table-view-state.js';

const MAX_RENDERED_ROWS = 300;
const COLUMNS = Object.freeze([
  ['tag', 'Tag'], ['elementType', 'Type'], ['connectFrom', 'From'], ['connectTo', 'To'],
  ['dnInMm', 'DN In'], ['dnOutMm', 'DN Out'], ['lengthMm', 'Length'],
  ['catalogueAuthority', 'Catalogue'], ['sourceStatus', 'Source'],
]);

export function renderTopologyEditTableGrid(runtime) {
  const element = runtime.element;
  if (!element) return;
  if (!runtime.projection) {
    element.innerHTML = `<div class="topology-edit-table__empty">${escapeHtml(runtime.error || runtime.message || 'Table projection unavailable.')}</div>`;
    return;
  }
  const rows = topologyEditTableVisibleRows(runtime.projection, runtime.viewState);
  const renderedRows = rows.slice(0, MAX_RENDERED_ROWS);
  const primary = runtime.projection.rows.find((row) => row.rowId === runtime.viewState.primaryRowId) ?? null;
  const selected = new Set(runtime.viewState.selectedRowIds);
  const staged = new Map((runtime.batch?.intents ?? []).map((intent) => [intent.target.canonicalId, intent]));
  const exportDisabled = runtime.pending || Boolean(
    runtime.batch || runtime.batchPlan || runtime.preview || runtime.validation || runtime.staleResult,
  );
  element.innerHTML = `
    <section class="topology-edit-table" data-table-phase="${escapeHtml(runtime.phase())}">
      <header class="topology-edit-table__header">
        <div><strong>Engineering table</strong><span>${rows.length} / ${runtime.projection.rows.length} rows</span></div>
        <label>Filter <input type="search" data-table-filter value="${escapeHtml(runtime.viewState.query)}" placeholder="Tag, type, ID, source…"></label>
      </header>
      <div class="topology-edit-table__scroll">
        <table role="grid" aria-label="Certified canonical engineering table">
          <thead><tr><th scope="col">Select</th>${COLUMNS.map(([key, label]) => sortHeader(key, label, runtime.viewState)).join('')}</tr></thead>
          <tbody>${renderedRows.map((row) => rowHtml(row, selected.has(row.rowId), staged.get(row.identity.canonicalId))).join('')}</tbody>
        </table>
      </div>
      ${rows.length > MAX_RENDERED_ROWS ? `<p class="topology-edit-table__notice">Showing first ${MAX_RENDERED_ROWS} filtered rows. Refine the filter to inspect more.</p>` : ''}
      ${primary ? editorHtml(primary, staged.get(primary.identity.canonicalId)) : '<p class="topology-edit-table__notice">Select an exact canonical row to inspect or edit it.</p>'}
      ${stagedPanel(runtime)}
      ${validationPanel(runtime)}
      <footer class="topology-edit-table__workflow">
        <button type="button" data-table-action="preview" ${!runtime.batchPlan || runtime.staleResult || runtime.pending ? 'disabled' : ''}>Preview</button>
        <button type="button" data-table-action="validate" ${!runtime.preview || runtime.pending ? 'disabled' : ''}>Validate</button>
        <button type="button" data-table-action="apply" ${runtime.validation?.status !== 'READY_TO_APPLY' || runtime.pending ? 'disabled' : ''}>Apply</button>
        <button type="button" data-table-action="discard" ${!runtime.batch && !runtime.preview ? 'disabled' : ''}>Discard staged</button>
        <span aria-hidden="true">│</span>
        <button type="button" data-table-action="export-csv" ${exportDisabled ? 'disabled' : ''}>Export CSV</button>
        <button type="button" data-table-action="export-xlsx" ${exportDisabled ? 'disabled' : ''}>Export XLSX</button>
      </footer>
      <output class="topology-edit-table__status" aria-live="polite">${escapeHtml(runtime.error || runtime.message)}</output>
    </section>`;
  publishEvidence(runtime, rows.length, renderedRows.length);
}

function rowHtml(row, isSelected, stagedIntent) {
  const staged = stagedIntent ? ' data-staged="true"' : '';
  return `<tr data-table-row-id="${escapeHtml(row.rowId)}" data-canonical-id="${escapeHtml(row.identity.canonicalId)}"${staged}>
    <td><button type="button" data-table-select="${escapeHtml(row.rowId)}" aria-pressed="${String(isSelected)}" title="${escapeHtml(row.identity.canonicalId)}">${isSelected ? '●' : '○'}</button></td>
    ${COLUMNS.map(([key]) => `<td>${escapeHtml(displayValue(value(row, key)))}</td>`).join('')}
  </tr>`;
}

function editorHtml(row, stagedIntent) {
  const identity = `<div class="topology-edit-table__identity"><strong>${escapeHtml(row.fields.tag ?? row.identity.canonicalId)}</strong><code>${escapeHtml(row.identity.canonicalId)}</code><span>${escapeHtml(row.elementType)}</span></div>`;
  if (row.elementType !== 'PIPE' || row.identity.canonicalKind !== 'EDGE') {
    return `<section class="topology-edit-table__editor">${identity}<p>This row is read-only in the current implementation slice. Its exact identity and custody remain selectable.</p></section>`;
  }
  const length = stagedIntent?.requestedValue?.lengthMm ?? row.fields.lengthMm ?? '';
  const anchor = stagedIntent?.geometryPolicy?.anchor ?? 'FROM';
  const propagation = stagedIntent?.geometryPolicy?.propagation ?? 'DOWNSTREAM';
  return `<section class="topology-edit-table__editor" data-table-editor-id="${escapeHtml(row.identity.canonicalId)}">
    ${identity}
    <div class="topology-edit-table__editor-grid">
      <label>Length (mm)<input type="number" step="any" min="0" data-table-edit-length value="${escapeHtml(length)}"></label>
      <label>Anchor<select data-table-edit-anchor><option ${anchor === 'FROM' ? 'selected' : ''}>FROM</option><option ${anchor === 'TO' ? 'selected' : ''}>TO</option></select></label>
      <label>Propagation<select data-table-edit-propagation><option ${propagation === 'DOWNSTREAM' ? 'selected' : ''}>DOWNSTREAM</option><option ${propagation === 'UPSTREAM' ? 'selected' : ''}>UPSTREAM</option></select></label>
      <button type="button" data-table-action="stage-pipe-length" data-canonical-id="${escapeHtml(row.identity.canonicalId)}">Stage change</button>
    </div>
    <div class="topology-edit-table__custody"><span>Source ${escapeHtml(row.custody.sourceStatus)}</span><span>Catalogue ${escapeHtml(row.custody.catalogueAuthority)}</span><span>Revision ${escapeHtml(shortHash(row.targetRevision))}</span></div>
  </section>`;
}

function stagedPanel(runtime) {
  const intents = runtime.batch?.intents ?? [];
  if (!intents.length && !runtime.staleResult) return '';
  const rows = intents.map((intent) => `<li><code>${escapeHtml(intent.target.canonicalId)}</code> length ${escapeHtml(intent.priorValue.lengthMm)} → ${escapeHtml(intent.requestedValue.lengthMm)} mm · ${escapeHtml(intent.geometryPolicy.anchor)} / ${escapeHtml(intent.geometryPolicy.propagation)}</li>`).join('');
  const stale = runtime.staleResult
    ? `<div class="topology-edit-table__conflict"><strong>Stale/conflicting batch</strong><ul>${runtime.staleResult.reasons.map((reason) => `<li>${escapeHtml(reason.code)}: ${escapeHtml(reason.message)}</li>`).join('')}</ul></div>`
    : '';
  return `<section class="topology-edit-table__staged"><strong>${intents.length} staged change(s)</strong><ul>${rows}</ul>${stale}</section>`;
}

function validationPanel(runtime) {
  const validation = runtime.validation;
  if (!validation) return '';
  const blockers = validation.blockingDiagnostics ?? [];
  if (!blockers.length) return '<section class="topology-edit-table__staged"><strong>Validation passed</strong><span>No new HIGH findings in the certified candidate.</span></section>';
  return `<section class="topology-edit-table__conflict" data-table-validation-blockers><strong>${blockers.length} blocking validation issue(s)</strong><ul>${blockers.map((row) => `<li>${escapeHtml(diagnosticCode(row))}: ${escapeHtml(row.message ?? row.details?.message ?? 'Candidate introduces a blocking HIGH finding.')}</li>`).join('')}</ul></section>`;
}

function diagnosticCode(row) { return row.issueKind ?? row.kind ?? row.code ?? row.diagnosticKind ?? 'HIGH'; }
function sortHeader(key, label, state) {
  const active = state.sortKey === key;
  const marker = active ? (state.sortDirection === 'ASC' ? ' ▲' : ' ▼') : '';
  return `<th scope="col"><button type="button" data-table-sort="${escapeHtml(key)}">${escapeHtml(label)}${marker}</button></th>`;
}
function value(row, key) { return key === 'elementType' ? row.elementType : row.fields?.[key] ?? null; }
function displayValue(valueInput) {
  if (valueInput === null || valueInput === undefined || valueInput === '') return '—';
  if (typeof valueInput === 'number') return Number.isInteger(valueInput) ? String(valueInput) : String(Number(valueInput.toFixed(4)));
  if (typeof valueInput === 'object') return JSON.stringify(valueInput);
  return String(valueInput);
}
function shortHash(valueInput) {
  const value = String(valueInput ?? '');
  return value.length > 16 ? `${value.slice(0, 13)}…` : value;
}
function publishEvidence(runtime, visibleCount, renderedCount) {
  const host = runtime.controller.hostElement;
  if (!host) return;
  const blockers = runtime.validation?.blockingDiagnostics ?? [];
  host.dataset.topologyEditTableProjectionHash = runtime.projection.projectionHash;
  host.dataset.topologyEditTableCanonicalHash = runtime.projection.authority.canonicalTopologyHash;
  host.dataset.topologyEditTableVisibleCount = String(visibleCount);
  host.dataset.topologyEditTableRenderedCount = String(renderedCount);
  host.dataset.topologyEditTableSelectedRowIds = runtime.viewState.selectedRowIds.join(',');
  host.dataset.topologyEditTableBatchHash = runtime.batch?.batchHash ?? '';
  host.dataset.topologyEditTablePlanHash = runtime.batchPlan?.planHash ?? '';
  host.dataset.topologyEditTablePreviewHash = runtime.preview?.previewHash ?? '';
  host.dataset.topologyEditTableValidationHash = runtime.validation?.tableValidationHash ?? '';
  host.dataset.topologyEditTableValidationStatus = runtime.validation?.status ?? '';
  host.dataset.topologyEditTableValidationBlockers = blockers.map(diagnosticCode).join(',');
  host.dataset.topologyEditTableTransactionHash = runtime.transaction?.tableTransactionHash ?? '';
  host.dataset.topologyEditTableStaleDisposition = runtime.staleResult?.disposition ?? '';
  host.dataset.topologyEditTableLastExportHash = runtime.lastExport?.exportHash ?? '';
  host.dataset.topologyEditTableLastExportFormat = runtime.lastExport?.format ?? '';
}
function escapeHtml(valueInput) {
  return String(valueInput ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
