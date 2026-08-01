import { WorkspaceState } from './workspace-state.js';

/**
 * Renders source-preserving JSON trace rows from the normalized active dataset.
 * It does not load example data, substitute resolver configuration, or infer IDs.
 */
export function renderJsonTraceUI(documentRef) {
  if (!documentRef) throw new TypeError('JSON Trace UI requires a document.');
  const container = documentRef.createElement('section');
  container.className = 'json-trace-ui';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:#0b1120;color:#e2e8f0;padding:16px;box-sizing:border-box;gap:10px;';
  const dataset = WorkspaceState.getSnapshot()?.dataset ?? null;
  if (!dataset) {
    container.innerHTML = '<h2>JSON Trace</h2><p class="load-blockers">BLOCKED: import an authoritative SJSON dataset.</p>';
    return container;
  }

  const rows = dataset.entities.map(traceRow);
  container.innerHTML = `<header style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
    <div><h2 style="margin:0;color:#38bdf8">JSON Trace and DTXR evidence</h2><p style="margin:4px 0;color:#94a3b8">${escapeHtml(dataset.sourceName)} · ${escapeHtml(dataset.sourceSha256)} · ${rows.length} normalized records</p></div>
    <input type="search" data-json-trace-search placeholder="Search source ID, pointer, branch, DTXR" aria-label="Filter JSON trace rows">
  </header><div data-json-trace-table style="overflow:auto;flex:1"></div>`;
  const tableHost = container.querySelector('[data-json-trace-table]');
  renderRows(tableHost, rows);
  container.querySelector('[data-json-trace-search]').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    renderRows(tableHost, query ? rows.filter((row) => row.searchText.includes(query)) : rows);
  });
  return container;
}

function traceRow(entity) {
  const dtxr = entity.properties?.attributes?.DTXR ?? '';
  const values = {
    sourceEntityId: entity.sourceEntityId ?? '',
    jsonPointer: entity.jsonPointer ?? '',
    branchOwner: entity.branchOwner ?? '',
    lineKey: entity.lineKey ?? '',
    pipingClass: entity.pipingClass ?? '',
    componentReference: entity.componentReference ?? '',
    dtxr,
  };
  return {
    ...values,
    status: values.sourceEntityId && values.jsonPointer ? 'TRACEABLE' : 'BLOCKED',
    searchText: Object.values(values).join(' ').toLowerCase(),
  };
}

function renderRows(container, rows) {
  container.innerHTML = `<table><thead><tr><th>Status</th><th>Source ID</th><th>JSON pointer</th><th>Branch owner</th><th>Line</th><th>Class</th><th>Component reference</th><th>DTXR</th></tr></thead>
    <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.sourceEntityId)}</td><td><code>${escapeHtml(row.jsonPointer)}</code></td><td>${escapeHtml(row.branchOwner)}</td><td>${escapeHtml(row.lineKey)}</td><td>${escapeHtml(row.pipingClass)}</td><td>${escapeHtml(row.componentReference)}</td><td>${escapeHtml(row.dtxr)}</td></tr>`).join('')}</tbody></table>`;
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
