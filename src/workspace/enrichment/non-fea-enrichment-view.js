import {
  NON_FEA_ENRICHMENT_AUTHORITIES,
  NON_FEA_ENRICHMENT_SCHEMAS,
  NON_FEA_SELECTOR_KINDS,
  createNonFeaEnrichedProjection,
  createNonFeaEnrichmentImpactPreview,
  createNonFeaEnrichmentSidecar,
  listNonFeaEnrichmentFields,
  migrateFirstCutEnrichment,
  resolveNonFeaEnrichment,
} from '../../core/non-fea-enrichment/index.js';
import { WorkspaceState } from '../workspace-state.js';
import { nonFeaEnrichmentStore } from './non-fea-enrichment-store.js';

/** Common exact enrichment and override review surface. */
export function renderNonFeaEnrichmentView(container, onChanged) {
  if (!container) throw new TypeError('Non-FEA enrichment requires a container.');
  const sourceModel = WorkspaceState.getSnapshot()?.dataset?.sharedModel || null;
  nonFeaEnrichmentStore.loadSource(sourceModel?.semanticHash || '');
  const snapshot = nonFeaEnrichmentStore.getSnapshot();
  const derived = deriveCurrent(sourceModel, snapshot);
  container.innerHTML = `${styles()}${markup(snapshot, derived, sourceModel)}`;
  bind(container, sourceModel, derived, onChanged);
}

function deriveCurrent(sourceModel, snapshot) {
  if (!sourceModel) return emptyDerived('Load an active shared piping model.');
  if (!snapshot.acceptedRecords.length) return emptyDerived('');
  try {
    const sidecar = createNonFeaEnrichmentSidecar({
      sourceSemanticHash: snapshot.boundSourceSemanticHash || sourceModel.semanticHash,
      records: snapshot.acceptedRecords,
    });
    const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
    const impact = createNonFeaEnrichmentImpactPreview({ resolutionLedger: ledger });
    const projection = ledger.status === 'READY'
      ? createNonFeaEnrichedProjection({ sourceModel, resolutionLedger: ledger })
      : null;
    return { sidecar, ledger, impact, projection, error: '' };
  } catch (error) {
    return emptyDerived(messageOf(error));
  }
}

function emptyDerived(error) {
  return { sidecar: null, ledger: null, impact: null, projection: null, error };
}

function markup(snapshot, derived, sourceModel) {
  const state = !sourceModel ? 'BLOCKED'
    : snapshot.stale ? 'STALE'
      : derived.ledger?.status || (snapshot.proposals.length ? 'REVIEW_REQUIRED' : 'NOT_EVALUATED');
  return `<section class="nfe" data-role="non-fea-enrichment" data-state="${escape(state)}">
    <header class="nfe__header">
      <div><div class="nfe__title"><span class="panel-eyebrow">COMMON PREPROCESSING</span><span class="nfe__badge">PHASE 3 · ENRICHMENT & OVERRIDES</span></div>
        <h2>Enrichment & Overrides</h2><p>Review exact source-bound evidence without mutating the imported model or repairing topology.</p></div>
      <div class="nfe__actions">
        <label>Import legacy records / sidecar<input type="file" accept=".json,.csv,application/json,text/csv" data-enrichment-import hidden></label>
        <button type="button" data-enrichment-export ${derived.sidecar ? '' : 'disabled'}>Export accepted sidecar</button>
        <button type="button" data-enrichment-clear>Clear staged state</button>
      </div>
    </header>
    <section class="nfe__boundary"><strong>Boundary:</strong> exact selectors only. Fuzzy candidates remain proposals. Enrichment cannot alter coordinates, ports, connectivity, attachment, support membership, or canonical topology.</section>
    ${messages(snapshot, derived)}
    <section class="nfe__metrics">
      ${metric('Source', sourceModel ? 'CURRENT' : 'NOT_LOADED', sourceModel ? 'ready' : 'blocked')}
      ${metric('Accepted records', snapshot.acceptedRecords.length)}
      ${metric('Proposals', snapshot.proposals.length)}
      ${metric('Resolution', derived.ledger?.status || 'NOT_EVALUATED', statusClass(derived.ledger?.status))}
      ${metric('Affected entities', derived.impact?.affectedEntities?.length || 0)}
      ${metric('Topology mutation', derived.impact?.topologyMutation ? 'PROHIBITED' : 'NONE', derived.impact?.topologyMutation ? 'blocked' : 'ready')}
    </section>
    <div class="nfe__layout"><main>
      ${proposalForm()}
      ${proposalTable(snapshot)}
      ${acceptedTable(snapshot)}
      ${resolutionTable(derived)}
    </main><aside>
      ${sourceBinding(snapshot, sourceModel, derived)}
      ${impactMarkup(derived)}
      ${migrationMarkup(snapshot.migrationReport)}
    </aside></div>
  </section>`;
}

function proposalForm() {
  return `<section class="nfe-panel"><header><div><span class="panel-eyebrow">EXACT CANDIDATE</span><h3>Stage enrichment proposal</h3></div></header>
    <form data-enrichment-proposal-form class="nfe-form">
      <label>Record ID<input name="recordId" required></label>
      <label>Selector kind<select name="selectorKind">${NON_FEA_SELECTOR_KINDS.map(option).join('')}</select></label>
      <label>Exact selector key<input name="selectorKey" required></label>
      <label>Field<select name="fieldId">${listNonFeaEnrichmentFields().map((row) => option(row.fieldId)).join('')}</select></label>
      <label>Value<input name="value" required></label>
      <label>Unit<input name="unit" required value="1"></label>
      <label>Authority<select name="authority">${NON_FEA_ENRICHMENT_AUTHORITIES.filter((row) => !row.startsWith('SOURCE_')).map(option).join('')}</select></label>
      <label>Source ID<input name="sourceId" required></label>
      <label>Revision<input name="revision" required></label>
      <label class="wide">Review rationale<input name="rationale" required value="Exact reviewed enrichment candidate."></label>
      <button type="submit">Stage proposal</button>
    </form>
  </section>`;
}

function proposalTable(snapshot) {
  return `<section class="nfe-panel" data-role="enrichment-proposals"><header><div><span class="panel-eyebrow">PROPOSAL / ACCEPTANCE</span><h3>Staged proposals</h3></div>${snapshot.proposals.length ? '<button type="button" data-enrichment-accept-all>Accept all unblocked</button>' : ''}</header>
    ${snapshot.proposals.length ? table(
      ['Proposal', 'Exact selector', 'Field / value', 'Authority', 'Decision'],
      snapshot.proposals.map((proposal) => `<tr><td><strong>${escape(proposal.proposalId)}</strong><small>${escape(proposal.rationale)}</small></td><td>${escape(proposal.record.selectorKind)}<code>${escape(proposal.record.selectorKey)}</code></td><td>${escape(proposal.record.fieldId)}<code>${escape(proposal.record.value)} ${escape(proposal.record.unit)}</code></td><td>${escape(proposal.record.authority)}</td><td><button type="button" data-enrichment-accept="${escape(proposal.proposalId)}">Accept exact</button><button type="button" data-enrichment-reject="${escape(proposal.proposalId)}">Reject</button></td></tr>`),
    ) : '<p class="empty">No proposals are staged.</p>'}
  </section>`;
}

function acceptedTable(snapshot) {
  return `<section class="nfe-panel" data-role="enrichment-accepted"><header><div><span class="panel-eyebrow">ACCEPTED SIDECAR</span><h3>Exact reusable records</h3></div><strong>${snapshot.acceptedRecords.length}</strong></header>
    ${snapshot.acceptedRecords.length ? table(
      ['Record', 'Selector', 'Field / value', 'Source', ''],
      snapshot.acceptedRecords.map((row) => `<tr><td><strong>${escape(row.recordId)}</strong><small>${escape(row.authority)}</small></td><td>${escape(row.selectorKind)}<code>${escape(row.selectorKey)}</code></td><td>${escape(row.fieldId)}<code>${escape(row.value)} ${escape(row.unit)}</code></td><td>${escape(row.sourceId)}@${escape(row.revision)}</td><td><button type="button" data-enrichment-remove="${escape(row.recordId)}">Remove</button></td></tr>`),
    ) : '<p class="empty">No accepted records. Source values remain unchanged.</p>'}
  </section>`;
}

function resolutionTable(derived) {
  const ledger = derived.ledger;
  return `<section class="nfe-panel" data-role="enrichment-resolution"><header><div><span class="panel-eyebrow">FIELD-RESOLUTION LEDGER</span><h3>Resolved authority by entity</h3></div><span class="chip ${statusClass(ledger?.status)}">${escape(ledger?.status || 'NOT_EVALUATED')}</span></header>
    ${ledger?.rows?.length ? table(
      ['Target', 'Field', 'State', 'Selected authority', 'Value'],
      ledger.rows.map((row) => `<tr><td>${escape(row.targetKind)}<code>${escape(row.targetId)}</code></td><td>${escape(row.fieldId)}</td><td>${escape(row.status)}</td><td>${escape(row.selected?.authority || 'BLOCKED')}</td><td>${row.selected ? `${escape(row.selected.value)} ${escape(row.selected.unit)}` : '—'}</td></tr>`),
    ) : '<p class="empty">Accept records to create a source-bound resolution ledger.</p>'}
    ${blockerList(ledger?.blockers || [])}
  </section>`;
}

function sourceBinding(snapshot, sourceModel, derived) {
  return `<section class="nfe-panel"><header><div><span class="panel-eyebrow">SOURCE BINDING</span><h3>${snapshot.stale ? 'Accepted records are stale' : 'Exact source custody'}</h3></div></header>
    <dl><dt>Current source</dt><dd><code>${escape(sourceModel?.semanticHash || 'NOT_LOADED')}</code></dd><dt>Accepted source</dt><dd><code>${escape(snapshot.boundSourceSemanticHash || 'NOT_BOUND')}</code></dd><dt>Sidecar hash</dt><dd><code>${escape(derived.sidecar?.semanticHash || 'NOT_AVAILABLE')}</code></dd><dt>Projection hash</dt><dd><code>${escape(derived.projection?.semanticHash || 'NOT_CREATED')}</code></dd></dl>
    ${snapshot.stale ? '<button type="button" data-enrichment-rebind>Exact-match revalidate and rebind</button>' : ''}<p>No accepted record is silently rebound after a dataset change.</p>
  </section>`;
}

function impactMarkup(derived) {
  const impact = derived.impact;
  return `<section class="nfe-panel" data-role="enrichment-impact"><header><div><span class="panel-eyebrow">IMPACT PREVIEW</span><h3>Derived-model consequences</h3></div></header>
    <dl><dt>Source mutation</dt><dd>${impact?.sourceMutation ? 'PROHIBITED' : 'NONE'}</dd><dt>Topology mutation</dt><dd>${impact?.topologyMutation ? 'PROHIBITED' : 'NONE'}</dd><dt>Support removal</dt><dd>${impact?.supportRemoval ? 'PROHIBITED' : 'NONE'}</dd></dl>
    <h4>Affected entities</h4>${impact?.affectedEntities?.length ? `<ul>${impact.affectedEntities.map((row) => `<li>${escape(row.targetKind)} ${escape(row.targetId)} · ${escape(row.fieldId)}${row.sensitivityOnly ? ' · SENSITIVITY ONLY' : ''}</li>`).join('')}</ul>` : '<p class="empty">None.</p>'}
    <h4>Rebuild after acceptance</h4>${impact?.invalidatedDerivedModels?.length ? `<ul>${impact.invalidatedDerivedModels.map((row) => `<li>${escape(row)}</li>`).join('')}</ul>` : '<p class="empty">No derived-model invalidation yet.</p>'}
  </section>`;
}

function migrationMarkup(report) {
  return `<section class="nfe-panel" data-role="enrichment-migration"><header><div><span class="panel-eyebrow">LEGACY COMPATIBILITY</span><h3>Migration review</h3></div><span class="chip ${statusClass(report?.status)}">${escape(report?.status || 'NOT_IMPORTED')}</span></header>
    <p>Legacy records are staged as proposals and never become common authority until explicitly accepted.</p>
    ${report ? `<dl><dt>Records</dt><dd>${report.records.length}</dd><dt>Report hash</dt><dd><code>${escape(report.semanticHash)}</code></dd></dl>${blockerList(report.blockers)}` : ''}
  </section>`;
}

function bind(container, sourceModel, derived, onChanged) {
  container.querySelector('[data-enrichment-proposal-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    attempt(() => {
      const data = new FormData(event.currentTarget);
      const recordId = text(data, 'recordId');
      nonFeaEnrichmentStore.stageProposal({
        proposalId: recordId,
        rationale: text(data, 'rationale'),
        record: {
          recordId,
          selectorKind: text(data, 'selectorKind'),
          selectorKey: text(data, 'selectorKey'),
          fieldId: text(data, 'fieldId'),
          value: numericOrString(text(data, 'value')),
          unit: text(data, 'unit'),
          authority: text(data, 'authority'),
          sourceId: text(data, 'sourceId'),
          revision: text(data, 'revision'),
          evidence: { source: text(data, 'sourceId'), locator: text(data, 'selectorKey') },
        },
      });
    }, onChanged);
  });
  container.addEventListener('click', (event) => {
    const accept = event.target.closest('[data-enrichment-accept]')?.dataset.enrichmentAccept;
    if (accept) return attempt(() => nonFeaEnrichmentStore.acceptProposal(accept), onChanged);
    const reject = event.target.closest('[data-enrichment-reject]')?.dataset.enrichmentReject;
    if (reject) return attempt(() => nonFeaEnrichmentStore.rejectProposal(reject), onChanged);
    const remove = event.target.closest('[data-enrichment-remove]')?.dataset.enrichmentRemove;
    if (remove) return attempt(() => nonFeaEnrichmentStore.removeAccepted(remove), onChanged);
    if (event.target.closest('[data-enrichment-accept-all]')) return attempt(() => nonFeaEnrichmentStore.acceptAllProposals(), onChanged);
    if (event.target.closest('[data-enrichment-clear]')) return attempt(() => nonFeaEnrichmentStore.clear(), onChanged);
    if (event.target.closest('[data-enrichment-export]')) return attempt(() => downloadSidecar(container.ownerDocument, derived.sidecar), onChanged, false);
    if (event.target.closest('[data-enrichment-rebind]')) return attempt(() => rebind(sourceModel), onChanged);
  });
  container.querySelector('[data-enrichment-import]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const body = await file.text();
      if (file.name.toLowerCase().endsWith('.csv')) stageMigration(sourceModel, { masterData: legacyCsvMaster(body, file.name) });
      else importJson(sourceModel, JSON.parse(body));
    } catch (error) {
      nonFeaEnrichmentStore.setError(messageOf(error));
    }
    event.target.value = '';
    onChanged?.();
  });
}

function importJson(sourceModel, value) {
  if (value?.schema === NON_FEA_ENRICHMENT_SCHEMAS.SIDECAR) return nonFeaEnrichmentStore.importAcceptedSidecar(value);
  if (value?.schema === 'first-cut-master-data/v1') return stageMigration(sourceModel, { masterData: value });
  if (Array.isArray(value)) return stageMigration(sourceModel, { bindings: value });
  return stageMigration(sourceModel, value || {});
}

function stageMigration(sourceModel, payload) {
  if (!sourceModel) throw new TypeError('Load an active source model before migrating legacy evidence.');
  const report = migrateFirstCutEnrichment({
    sourceSemanticHash: sourceModel.semanticHash,
    masterData: payload.masterData || null,
    bindings: payload.bindings || [],
  });
  nonFeaEnrichmentStore.stageMigratedRecords(report);
}

function rebind(sourceModel) {
  if (!sourceModel) throw new TypeError('An active source model is required.');
  const snapshot = nonFeaEnrichmentStore.getSnapshot();
  const sidecar = createNonFeaEnrichmentSidecar({ sourceSemanticHash: sourceModel.semanticHash, records: snapshot.acceptedRecords });
  const ledger = resolveNonFeaEnrichment({ sourceModel, sidecar });
  if (ledger.status !== 'READY') throw new TypeError(`Exact-match revalidation is blocked: ${ledger.blockers.map((row) => row.code).join(', ')}.`);
  nonFeaEnrichmentStore.rebindCurrentSource();
}

function legacyCsvMaster(body, fileName) {
  const rows = parseCsv(body);
  const expected = ['record_id', 'selector_kind', 'selector_key', 'field_id', 'value', 'unit', 'source_id', 'revision'];
  if (!rows.length || rows[0].join('|') !== expected.join('|')) throw new TypeError(`Legacy CSV header must be: ${expected.join(',')}`);
  return {
    schema: 'first-cut-master-data/v1', sourceId: fileName, revision: 'IMPORTED',
    records: rows.slice(1).filter((row) => row.some(Boolean)).map((row) => ({
      recordId: row[0], selectorKind: row[1], selectorKey: row[2], fieldId: row[3],
      value: numericOrString(row[4]), unit: row[5], sourceId: row[6], revision: row[7],
    })),
  };
}

function parseCsv(body) {
  const rows = [], row = [];
  let field = '', quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index], next = body[index + 1];
    if (character === '"' && quoted && next === '"') { field += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ',' && !quoted) { row.push(field); field = ''; continue; }
    if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field); rows.push([...row]); row.length = 0; field = ''; continue;
    }
    field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (quoted) throw new TypeError('Legacy CSV contains an unterminated quoted field.');
  return rows;
}

function downloadSidecar(documentRef, sidecar) {
  if (!sidecar) throw new TypeError('No accepted sidecar is available.');
  const url = URL.createObjectURL(new Blob([JSON.stringify(sidecar, null, 2)], { type: 'application/json' }));
  try {
    const anchor = documentRef.createElement('a');
    anchor.href = url; anchor.download = 'non-fea-enrichment-sidecar.json'; anchor.hidden = true;
    documentRef.body.append(anchor); anchor.click(); anchor.remove();
  } finally { URL.revokeObjectURL(url); }
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function blockerList(rows) { return rows?.length ? `<ul class="blockers">${rows.map((row) => `<li><strong>${escape(row.code)}</strong> · ${escape(row.path)} · ${escape(row.message)}</li>`).join('')}</ul>` : ''; }
function messages(snapshot, derived) { return [snapshot.error && `<p class="message error">${escape(snapshot.error)}</p>`, derived.error && `<p class="message error">${escape(derived.error)}</p>`, snapshot.message && `<p class="message">${escape(snapshot.message)}</p>`].filter(Boolean).join(''); }
function metric(label, value, state = '') { return `<article class="metric ${state}"><span>${escape(label)}</span><strong>${escape(value)}</strong></article>`; }
function option(value) { return `<option value="${escape(value)}">${escape(value)}</option>`; }
function statusClass(value) { const token = String(value || ''); return token.includes('READY') || token === 'CURRENT' ? 'ready' : token.includes('BLOCK') || token === 'STALE' ? 'blocked' : 'warning'; }
function text(data, key) { return String(data.get(key) || '').trim(); }
function numericOrString(value) { const number = Number(value); return value !== '' && Number.isFinite(number) ? number : value; }
function attempt(action, onChanged, rerender = true) { try { action(); } catch (error) { nonFeaEnrichmentStore.setError(messageOf(error)); } if (rerender) onChanged?.(); }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }

function styles() {
  return `<style>
    .nfe{height:100%;overflow:auto;padding:16px 16px 96px;scroll-padding-block:160px 96px;box-sizing:border-box;background:#07101e;color:#e2e8f0}.nfe__header,.nfe-panel>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.nfe h2,.nfe h3{margin:3px 0}.nfe p{color:#94a3b8}.nfe__title{display:flex;gap:8px;align-items:center}.nfe__badge,.chip{padding:3px 7px;border:1px solid #0ea5e9;border-radius:999px;font-size:10px}.nfe__actions{display:flex;gap:6px;flex-wrap:wrap}.nfe button,.nfe__actions label{border:1px solid #334155;border-radius:5px;background:#111c2f;color:#e2e8f0;padding:7px 9px;cursor:pointer}.nfe button:disabled{opacity:.45}.nfe__boundary{margin:12px 0;padding:10px;border:1px solid #155e75;border-radius:6px;background:#082f49;color:#bae6fd}.nfe__metrics{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:8px}.metric,.nfe-panel{padding:11px;border:1px solid #293548;border-radius:7px;background:#0b1424}.metric span{display:block;color:#94a3b8;font-size:10px}.metric strong{display:block;margin-top:4px}.metric.ready,.chip.ready{border-color:#166534}.metric.blocked,.chip.blocked{border-color:#7f1d1d}.nfe__layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(320px,1fr);gap:12px;margin-top:12px;align-items:start}.nfe__layout main,.nfe__layout aside{display:flex;flex-direction:column;gap:12px;min-width:0}.nfe-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.nfe-form button[type="submit"]{min-height:36px;scroll-margin-block:160px 96px}.nfe-form label{display:flex;flex-direction:column;gap:4px}.nfe-form .wide{grid-column:span 2}.nfe input,.nfe select{padding:7px;border:1px solid #334155;background:#07101e;color:#e2e8f0}.table-wrap{overflow:auto}.nfe table{width:100%;border-collapse:collapse}.nfe th,.nfe td{text-align:left;vertical-align:top;padding:7px;border-bottom:1px solid #223047;font-size:12px}.nfe th{color:#7dd3fc;font-size:10px}.nfe code,.nfe small{display:block;color:#64748b;overflow-wrap:anywhere}.nfe dl{display:grid;grid-template-columns:120px 1fr;gap:6px}.nfe dd{margin:0;overflow-wrap:anywhere}.blockers{color:#fca5a5;padding-left:18px}.message{padding:8px;border:1px solid #155e75;background:#082f49}.message.error{border-color:#7f1d1d;background:#3f1118;color:#fecaca}.panel-eyebrow{display:block;color:#38bdf8;font-size:10px;font-weight:800;letter-spacing:.1em}@media(max-width:1100px){.nfe__metrics{grid-template-columns:repeat(3,1fr)}.nfe__layout{grid-template-columns:1fr}}@media(max-width:700px){.nfe-form{grid-template-columns:1fr}.nfe-form .wide{grid-column:auto}.nfe__metrics{grid-template-columns:repeat(2,1fr)}}
  </style>`;
}
