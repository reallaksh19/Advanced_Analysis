import {
  topologyEditTableVisibleRows,
} from '../topology-edit/table/topology-edit-table-view-state.js';
import {
  describeTopologyEditTableIntent,
  renderTopologyEditTableEngineeringEditor,
} from './topology-edit-table-engineering-editor.js';
import {
  renderTopologyEditTableAllProperties,
  topologyEditTableTypeSummary,
  topologyEditTableVisibleColumns,
} from './topology-edit-table-properties-view.js';

const MAX_RENDERED_ROWS = 300;

export function renderTopologyEditTableGrid(runtime) {
  const element = runtime.element;
  if (!element) return;
  if (!runtime.projection) {
    element.innerHTML = `<div class="topology-edit-table__empty">${escapeHtml(runtime.error || runtime.message || 'Table projection unavailable.')}</div>`;
    return;
  }
  const rows = topologyEditTableVisibleRows(runtime.projection, runtime.viewState);
  if (runtime.projection.rows.length === 0) {
    element.innerHTML = emptyModelHtml(runtime);
    publishEvidence(runtime, 0, 0);
    return;
  }
  const renderedRows = rows.slice(0, MAX_RENDERED_ROWS);
  const columns = topologyEditTableVisibleColumns(runtime.projection);
  const primary = runtime.projection.rows.find((row) => row.rowId === runtime.viewState.primaryRowId) ?? null;
  const selected = new Set(runtime.viewState.selectedRowIds);
  const staged = new Map((runtime.batch?.intents ?? []).map((intent) => [intent.target.canonicalId, intent]));
  const exportDisabled = runtime.pending || Boolean(
    runtime.batch || runtime.batchPlan || runtime.preview || runtime.validation || runtime.staleResult,
  );
  const typeSummary = topologyEditTableTypeSummary(runtime.projection.rows);
  element.innerHTML = `
    <section class="topology-edit-table" data-table-phase="${escapeHtml(runtime.phase())}">
      <header class="topology-edit-table__header">
        <div><strong>Engineering table</strong><span>${rows.length} / ${runtime.projection.rows.length} rows · ${escapeHtml(typeSummary)}</span></div>
        <label>Filter <input type="search" data-table-filter value="${escapeHtml(runtime.viewState.query)}" placeholder="Tag, type, ID, property, source…"></label>
      </header>
      <div class="topology-edit-table__scroll">
        <table role="grid" aria-label="Certified canonical engineering table">
          <thead><tr><th scope="col">Select</th>${columns.map((column) => sortHeader(column.key, column.label, runtime.viewState)).join('')}</tr></thead>
          <tbody>${renderedRows.map((row) => rowHtml(
            row,
            columns,
            selected.has(row.rowId),
            staged.get(row.identity.canonicalId),
          )).join('')}</tbody>
        </table>
      </div>
      ${rows.length > MAX_RENDERED_ROWS ? `<p class="topology-edit-table__notice">Showing first ${MAX_RENDERED_ROWS} filtered rows. Refine the filter to inspect more.</p>` : ''}
      ${primary ? editorHtml(primary, staged.get(primary.identity.canonicalId), runtime.projection) : '<p class="topology-edit-table__notice">Select an exact canonical row to inspect or edit it.</p>'}
      ${primary ? renderTopologyEditTableAllProperties(primary, runtime) : ''}
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

function rowHtml(row, columns, isSelected, stagedIntent) {
  const staged = stagedIntent ? ' data-staged="true"' : '';
  return `<tr data-table-row-id="${escapeHtml(row.rowId)}" data-canonical-id="${escapeHtml(row.identity.canonicalId)}" data-element-type="${escapeHtml(row.elementType)}" data-selected="${String(isSelected)}"${staged}>
    <td><button type="button" data-table-select="${escapeHtml(row.rowId)}" aria-pressed="${String(isSelected)}" aria-label="${isSelected ? 'Deselect' : 'Select'} ${escapeHtml(row.identity.canonicalId)}">${isSelected ? 'Selected' : 'Select'}</button></td>
    ${columns.map((column) => `<td data-table-property="${escapeHtml(column.key)}">${escapeHtml(displayValue(value(row, column.key)))}</td>`).join('')}
  </tr>`;
}

/** Renders the first governed row when the canonical topology is empty. */
function emptyModelHtml(runtime) {
  const values = runtime.emptyRouteValues;
  const options = runtime.emptyRoutePipeOptions();
  const phase = runtime.emptyRoutePhase();
  const previewReady = phase === 'PREVIEW_READY';
  const applyReady = phase === 'READY_TO_APPLY';
  const active = !['IDLE', 'CANCELLED', 'APPLIED'].includes(phase);
  const optionHtml = options.map((record) => `<option value="${escapeHtml(record.recordId)}" ${
    values.catalogueRecordId === record.recordId ? 'selected' : ''
  }>${escapeHtml(`${record.recordId} · DN ${record.nominalSizeMm} · ${record.schedule}`)}</option>`).join('');
  return `<section class="topology-edit-table topology-edit-table--empty-model" data-table-phase="${escapeHtml(phase)}">
    <header class="topology-edit-table__header"><div><strong>Create first pipe</strong><span>Empty canonical model · exact typed coordinates</span></div></header>
    <p class="topology-edit-table__notice">Enter the first PIPE row. Preview and validation do not change the canonical model; Apply creates two nodes and one governed pipe atomically.</p>
    <div class="topology-edit-table__first-pipe">
      <fieldset><legend>Start point (mm)</legend>${pointInputs('start', values)}</fieldset>
      <fieldset><legend>End point (mm)</legend>${pointInputs('end', values)}</fieldset>
      <label class="topology-edit-table__wide">Pipe catalogue record<select data-empty-route-field="catalogueRecordId" ${options.length ? '' : 'disabled'}>${optionHtml || '<option>Catalogue is loading…</option>'}</select></label>
    </div>
    <footer class="topology-edit-table__workflow">
      <button type="button" data-table-action="empty-route-preview" ${runtime.pending || !options.length ? 'disabled' : ''}>Preview first pipe</button>
      <button type="button" data-table-action="empty-route-validate" ${runtime.pending || !previewReady ? 'disabled' : ''}>Validate</button>
      <button type="button" data-table-action="empty-route-apply" ${runtime.pending || !applyReady ? 'disabled' : ''}>Apply</button>
      <button type="button" data-table-action="empty-route-cancel" ${runtime.pending || !active ? 'disabled' : ''}>Cancel</button>
    </footer>
    <output class="topology-edit-table__status" aria-live="polite">${escapeHtml(runtime.error || runtime.message)}</output>
  </section>`;
}

function pointInputs(role, values) {
  return ['X', 'Y', 'Z'].map((axis) => {
    const key = `${role}${axis}`;
    return `<label>${axis}<input type="number" step="any" required data-empty-route-field="${key}" value="${escapeHtml(values[key])}"></label>`;
  }).join('');
}

function editorHtml(row, stagedIntent, projection) {
  const engineering = renderTopologyEditTableEngineeringEditor(row, stagedIntent, projection);
  if (engineering) return engineering;
  const identity = `<div class="topology-edit-table__identity"><strong>${escapeHtml(row.fields.tag ?? row.identity.canonicalId)}</strong><code>${escapeHtml(row.identity.canonicalId)}</code><span>${escapeHtml(row.elementType)}</span></div>`;
  if (row.elementType !== 'PIPE' || row.identity.canonicalKind !== 'EDGE') {
    return `<section class="topology-edit-table__editor">${identity}<p>This row is read-only in the current implementation slice. Its exact identity, engineering properties and custody remain visible below.</p></section>`;
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
  const rows = intents.map((intent) => `<li><code>${escapeHtml(intent.target.canonicalId)}</code> ${escapeHtml(describeTopologyEditTableIntent(intent))}</li>`).join('');
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
