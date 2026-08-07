import { nonFeaCommonInputStore } from './non-fea-common-input-store.js';
import {
  evaluateCurrentNonFeaCommonInput,
  exportCurrentNonFeaCommonInput,
  reimportNonFeaCommonInput,
  sealCurrentNonFeaCommonInput,
} from './non-fea-common-input-runtime.js';

export function renderNonFeaSealExportView(container, onChanged) {
  if (!container) throw new TypeError('Seal & Export requires a container.');
  evaluateCurrentNonFeaCommonInput();
  const snapshot = nonFeaCommonInputStore.getSnapshot();
  container.innerHTML = `${styles()}${markup(snapshot)}`;
  bind(container, onChanged);
}

function markup(snapshot) {
  const report = snapshot.report;
  const commonInput = snapshot.commonInput;
  const current = commonInput && snapshot.staleness?.stale === false;
  return `<section class="seal-export" data-role="non-fea-seal-export" data-state="${escape(current ? commonInput.packageState : report?.packageState || 'BLOCKED')}">
    <header class="seal-export__header"><div><span class="panel-eyebrow">PHASE 4 · EXPLICIT SEAL</span><h2>Seal & Export</h2>
      <p>Evaluation, sealing, export and calculation remain separate explicit actions.</p></div>
      <button type="button" data-load-calc-tab="method-basis">Review Method Basis</button></header>
    <section class="seal-export__boundary"><strong>No implicit authority:</strong> a checker report is not a seal; a seal is not a calculation; an exported or historical package cannot become current without exact binding equivalence.</section>
    ${snapshot.error ? `<p class="message error">${escape(snapshot.error)}</p>` : ''}${snapshot.message ? `<p class="message">${escape(snapshot.message)}</p>` : ''}
    <section class="seal-export__metrics">
      ${metric('Checker package', report?.packageState || 'NOT_EVALUATED', statusClass(report?.packageState))}
      ${metric('Seal state', current ? 'CURRENT' : commonInput ? 'STALE' : 'NOT_SEALED', current ? 'ready' : 'blocked')}
      ${metric('Sealed methods', commonInput?.sealedMethodIds?.length || 0)}
      ${metric('Blocked methods', report?.blockedMethodIds?.length || 0, report?.blockedMethodIds?.length ? 'warning' : 'ready')}
      ${metric('Common input hash', compact(commonInput?.semanticHash))}
      ${metric('Export', snapshot.exportArtifact ? 'CREATED' : 'NOT_CREATED', snapshot.exportArtifact ? 'ready' : '')}
    </section>
    <div class="seal-export__layout"><main>
      ${sealForm(report, current)}
      ${commonInputMarkup(commonInput, snapshot.staleness)}
      ${lineageMarkup(commonInput)}
    </main><aside>
      ${exportMarkup(snapshot, current)}
      ${consumptionMarkup(snapshot)}
    </aside></div>
  </section>`;
}

function sealForm(report, current) {
  const blocked = report?.blockedMethodIds || [];
  const sealable = report && report.packageState !== 'BLOCKED' && report.readyMethodIds.length > 0;
  return `<section class="seal-panel"><header><div><span class="panel-eyebrow">CONFIRMATION</span><h3>${current ? 'Current common input is sealed' : 'Explicitly seal the current report'}</h3></div><span class="chip ${statusClass(report?.packageState)}">${escape(report?.packageState || 'NOT_EVALUATED')}</span></header>
    <dl><dt>Ready methods</dt><dd>${escape(report?.readyMethodIds?.join(', ') || 'NONE')}</dd><dt>Blocked methods</dt><dd>${escape(blocked.join(', ') || 'NONE')}</dd><dt>Candidate</dt><dd><code>${escape(report?.candidateSemanticHash || 'NOT_AVAILABLE')}</code></dd></dl>
    <form data-common-seal-form>
      <label>Confirmed by<input name="confirmedBy" required placeholder="Engineer or reviewer identity"></label>
      <label>Confirmation statement<textarea name="statement" required>Reviewed current source, Project Data, exact enrichment, method blockers and partial-package scope.</textarea></label>
      <label class="check"><input type="checkbox" name="acceptPartial" ${report?.packageState === 'PARTIALLY_READY' ? '' : 'checked'}>Accept the exact partial package and acknowledge every blocked method</label>
      <button type="submit" ${sealable ? '' : 'disabled'}>${current ? 'Reseal current report' : 'Seal common input'}</button>
    </form>
    ${blocked.length ? `<ul class="blocked-methods">${blocked.map((methodId) => `<li>${escape(methodId)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function commonInputMarkup(commonInput, staleness) {
  if (!commonInput) return '<section class="seal-panel"><h3>No common input seal</h3><p class="empty">Evaluate Method Basis and explicitly confirm a READY or PARTIALLY_READY package.</p></section>';
  return `<section class="seal-panel"><header><div><span class="panel-eyebrow">IMMUTABLE COMMON INPUT</span><h3>${staleness?.stale ? 'Historical / stale seal' : 'Current sealed authority'}</h3></div><span class="chip ${staleness?.stale ? 'blocked' : 'ready'}">${staleness?.stale ? 'STALE' : 'CURRENT'}</span></header>
    <dl><dt>Schema</dt><dd>${escape(commonInput.schema)}</dd><dt>Package</dt><dd>${escape(commonInput.packageState)}</dd><dt>Source SHA-256</dt><dd><code>${escape(commonInput.sourceDatasetSha256)}</code></dd><dt>Source model</dt><dd><code>${escape(commonInput.sourceModelSemanticHash)}</code></dd><dt>Resolution ledger</dt><dd><code>${escape(commonInput.resolutionLedgerSemanticHash)}</code></dd><dt>Project Data</dt><dd><code>${escape(commonInput.projectDataProfileSemanticHash)}</code></dd><dt>Seal</dt><dd>${escape(commonInput.seal.confirmedBy)} · ${escape(commonInput.seal.confirmedAt)}</dd></dl>
    ${staleness?.changes?.length ? `<ul class="changes">${staleness.changes.map((row) => `<li><strong>${escape(row.path)}</strong><p>${escape(row.message)}</p></li>`).join('')}</ul>` : ''}
  </section>`;
}

function lineageMarkup(commonInput) {
  return `<section class="seal-panel"><header><div><span class="panel-eyebrow">LINEAGE GRAPH</span><h3>Exact parent bindings</h3></div></header>
    ${commonInput ? `<div class="table-wrap"><table><thead><tr><th>Node</th><th>Identity</th><th>Algorithm</th></tr></thead><tbody>${commonInput.lineage.nodes.map((row) => `<tr><td>${escape(row.nodeId)}</td><td><code>${escape(row.identity)}</code></td><td>${escape(row.algorithm)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No lineage graph until seal.</p>'}
  </section>`;
}

function exportMarkup(snapshot, current) {
  const artifact = snapshot.exportArtifact;
  return `<section class="seal-panel"><header><div><span class="panel-eyebrow">DETERMINISTIC STAGED JSON</span><h3>Export / re-import</h3></div></header>
    <button type="button" data-common-export ${current ? '' : 'disabled'}>Create deterministic export</button>
    <button type="button" data-common-download ${artifact ? '' : 'disabled'}>Download JSON</button>
    <label class="import">Re-import staged JSON<input type="file" accept="application/json,.json" data-common-import></label>
    <dl><dt>File</dt><dd>${escape(artifact?.fileName || 'NOT_CREATED')}</dd><dt>Bytes</dt><dd>${artifact?.byteLength ?? 0}</dd><dt>Export hash</dt><dd><code>${escape(artifact?.exportSemanticHash || 'NOT_CREATED')}</code></dd><dt>Artifact hash</dt><dd><code>${escape(artifact?.semanticHash || 'NOT_CREATED')}</code></dd></dl>
    <p>Re-import verifies the export hash, embedded common-input hash and current authority bindings. A non-equivalent import remains historical.</p>
  </section>`;
}

function consumptionMarkup(snapshot) {
  return `<section class="seal-panel"><header><div><span class="panel-eyebrow">METHOD CONSUMPTION</span><h3>Authorization and execution receipts</h3></div></header>
    <dl><dt>Authorizations</dt><dd>${snapshot.consumptionAuthorizations.length}</dd><dt>Executions</dt><dd>${snapshot.consumptionExecutions.length}</dd></dl>
    ${snapshot.consumptionExecutions.length ? `<ul>${snapshot.consumptionExecutions.map((row) => `<li><strong>${escape(row.executionId)}</strong><code>${escape(row.commonInputSemanticHash)}</code></li>`).join('')}</ul>` : '<p class="empty">No production method has consumed this seal.</p>'}
  </section>`;
}

function bind(container, onChanged) {
  container.querySelector('[data-common-seal-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const report = nonFeaCommonInputStore.getReport();
      sealCurrentNonFeaCommonInput({
        confirmationId: generatedId('COMMON-SEAL'),
        confirmedAt: new Date().toISOString(),
        confirmedBy: String(data.get('confirmedBy') || '').trim(),
        acceptPartial: data.get('acceptPartial') === 'on',
        acknowledgedBlockedMethods: report?.blockedMethodIds || [],
        statement: String(data.get('statement') || '').trim(),
      });
    } catch (error) {
      nonFeaCommonInputStore.setError(error);
    }
    onChanged?.();
  });
  container.querySelector('[data-common-export]')?.addEventListener('click', () => {
    try { exportCurrentNonFeaCommonInput(); } catch (error) { nonFeaCommonInputStore.setError(error); }
    onChanged?.();
  });
  container.querySelector('[data-common-download]')?.addEventListener('click', () => {
    try { download(container.ownerDocument, nonFeaCommonInputStore.getExportArtifact()); } catch (error) { nonFeaCommonInputStore.setError(error); onChanged?.(); }
  });
  container.querySelector('[data-common-import]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { reimportNonFeaCommonInput(await file.text()); } catch (error) { nonFeaCommonInputStore.setError(error); }
    event.target.value = '';
    onChanged?.();
  });
}

function download(documentRef, artifact) {
  if (!artifact) throw new TypeError('Create an export before downloading.');
  const url = URL.createObjectURL(new Blob([artifact.text], { type: artifact.mimeType }));
  try {
    const anchor = documentRef.createElement('a');
    anchor.href = url; anchor.download = artifact.fileName; anchor.hidden = true;
    documentRef.body.append(anchor); anchor.click(); anchor.remove();
  } finally { URL.revokeObjectURL(url); }
}
function generatedId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${id}`;
}
function metric(label, value, state = '') { return `<article class="metric ${state}"><span>${escape(label)}</span><strong title="${escape(value)}">${escape(value)}</strong></article>`; }
function compact(value) { return value ? (value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value) : 'NOT_AVAILABLE'; }
function statusClass(value) { return value === 'READY' || value === 'CURRENT' ? 'ready' : value === 'PARTIALLY_READY' ? 'warning' : 'blocked'; }
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
function styles() {
  return `<style>
    .seal-export{height:100%;overflow:auto;padding:16px;box-sizing:border-box;background:#07101e;color:#e2e8f0}.seal-export__header,.seal-panel>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.seal-export h2,.seal-export h3{margin:3px 0}.seal-export p{color:#94a3b8}.seal-export button,.seal-export .import{border:1px solid #334155;border-radius:5px;background:#111c2f;color:#e2e8f0;padding:8px 10px;cursor:pointer;display:inline-block;margin:3px}.seal-export button:disabled{opacity:.45;cursor:not-allowed}.seal-export__boundary{margin:12px 0;padding:10px;border:1px solid #155e75;border-radius:6px;background:#082f49;color:#bae6fd}.seal-export__metrics{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:8px}.metric{padding:10px;border:1px solid #293548;border-radius:6px;background:#0d1728;overflow:hidden}.metric span{display:block;color:#94a3b8;font-size:10px}.metric strong{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis}.metric.ready{border-color:#166534}.metric.warning{border-color:#92400e}.metric.blocked{border-color:#7f1d1d}.seal-export__layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(320px,1fr);gap:12px;margin-top:12px;align-items:start}.seal-export__layout main,.seal-export__layout aside{display:flex;flex-direction:column;gap:12px}.seal-panel{padding:13px;border:1px solid #293548;border-radius:7px;background:#0b1424}.seal-panel form{display:flex;flex-direction:column;gap:8px}.seal-panel form label{display:flex;flex-direction:column;gap:4px}.seal-panel form .check{flex-direction:row}.seal-panel input,.seal-panel textarea{padding:8px;border:1px solid #334155;background:#07101e;color:#e2e8f0}.seal-panel textarea{min-height:70px}.seal-panel dl{display:grid;grid-template-columns:130px 1fr;gap:7px}.seal-panel dt{color:#94a3b8}.seal-panel dd{margin:0;overflow-wrap:anywhere}.seal-panel code{display:block;color:#64748b;overflow-wrap:anywhere}.chip{padding:3px 7px;border:1px solid #475569;border-radius:999px;font-size:10px}.chip.ready{color:#4ade80}.chip.warning{color:#fbbf24}.chip.blocked{color:#f87171}.table-wrap{overflow:auto}.seal-panel table{width:100%;border-collapse:collapse}.seal-panel th,.seal-panel td{text-align:left;padding:7px;border-bottom:1px solid #223047}.blocked-methods,.changes{color:#fca5a5}.message{padding:8px;border:1px solid #155e75;background:#082f49}.message.error{border-color:#7f1d1d;background:#3f1118;color:#fecaca}.import input{display:block;margin-top:6px}.panel-eyebrow{display:block;color:#38bdf8;font-size:10px;font-weight:800;letter-spacing:.1em}@media(max-width:1100px){.seal-export__metrics{grid-template-columns:repeat(3,1fr)}.seal-export__layout{grid-template-columns:1fr}}@media(max-width:700px){.seal-export__metrics{grid-template-columns:repeat(2,1fr)}}
  </style>`;
}
