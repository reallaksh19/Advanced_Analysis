import { PROJECT_DATA_GROUPS } from './project-data-fields.js';
import { projectDataStore } from './project-data-store.js';

const NON_FEA_GROUP_KEYS = Object.freeze(['sourcesAndUnits', 'topology', 'loadCalculation']);
const NON_FEA_GROUP_LABELS = Object.freeze({
  sourcesAndUnits: 'Sources and canonical units',
  topology: 'Topology, support and attachment policy',
  loadCalculation: 'Load cases, materials, sections and fluids',
});
const SOURCE_FIELDS = new Set([
  'lengthUnit',
  'sourceUpAxis',
  'datasetSource',
  'lineListSource',
  'pipingClassSource',
  'componentWeightSource',
]);
const TOPOLOGY_FIELDS = new Set([
  'portMatchToleranceMm',
  'supportSiteGroupingToleranceMm',
  'autoCarrierCoincidenceToleranceMm',
  'routeJoiningRules',
  'supportTypeCapabilities',
  'pipingClassMappings',
]);

/** Renders the authoritative Project Data fields consumed by Non-FEA Load Calc. */
export function renderNonFeaProjectDataView(container, onChanged) {
  if (!container) throw new TypeError('Non-FEA Project Data requires a container.');
  container.replaceChildren(buildView(container.ownerDocument, onChanged));
}

function buildView(documentRef, onChanged) {
  const root = documentRef.createElement('section');
  root.className = 'project-data-profile non-fea-project-data-profile';
  root.dataset.role = 'non-fea-project-data';
  const profile = projectDataStore.getProfile();
  const origin = projectDataStore.getOrigin();
  const audits = ['topology', 'loads'].map((workflow) => projectDataStore.validate(workflow, null));
  const groups = NON_FEA_GROUP_KEYS.map((key) => scopedGroup(key));
  const summary = summarize(groups, profile);

  root.innerHTML = `${styles()}${headerMarkup(profile, origin, audits, summary)}
    <section class="non-fea-project-data__scope"><strong>Authority boundary:</strong> this editor changes the existing Project Data profile. Input Check reads the same profile and never copies it into a second state model.</section>
    <div class="non-fea-project-data__layout">
      <aside class="non-fea-project-data__rail">
        <span class="panel-eyebrow">NON-FEA GROUPS</span>
        ${groups.map((group) => railMarkup(group, profile)).join('')}
        <p>Fields outside these groups remain available to other workspace consumers but are not part of the Non-FEA readiness claim.</p>
      </aside>
      <main class="non-fea-project-data__main">
        ${groups.map((group, index) => groupMarkup(profile, group, index === 0)).join('')}
        ${policyMarkup()}
      </main>
    </div>`;
  bindActions(root, onChanged);
  return root;
}

function headerMarkup(profile, origin, audits, summary) {
  const ready = audits.filter((audit) => audit.valid).length;
  return `<header class="non-fea-project-data__header">
    <div><div class="non-fea-project-data__title"><span class="panel-eyebrow">AUTHORITATIVE EDITOR</span><span class="non-fea-project-data__badge">NON-FEA PROJECT DATA</span></div>
      <h2>Project Data</h2>
      <p>${escape(profile.schema)} · revision ${escape(profile.revision)} · ${escape(origin.kind)}</p>
      <p data-project-data-origin>Source: ${escape(origin.source)} · ${escape(origin.profileSemanticHash)}</p>
    </div>
    <div class="non-fea-project-data__actions">
      <label>Import JSON<input type="file" accept="application/json,.json" data-project-data-import hidden></label>
      <button type="button" data-project-data-export>Export JSON</button>
      <button type="button" data-project-data-restore>Restore approved 1885S</button>
      <button type="button" data-project-data-clear>Clear</button>
    </div>
  </header>
  <section class="non-fea-project-data__summary">
    ${metric('Workflow readiness', `${ready}/${audits.length}`, ready === audits.length ? 'ready' : 'blocked')}
    ${metric('Approved fields', `${summary.approved}/${summary.total}`, summary.approved === summary.total ? 'ready' : 'warning')}
    ${metric('Missing values', summary.missing, summary.missing ? 'blocked' : 'ready')}
    ${metric('Unapproved values', summary.unapproved, summary.unapproved ? 'warning' : 'ready')}
  </section>
  <div class="non-fea-project-data__audits">${audits.map((audit) => `<span data-status="${audit.valid ? 'READY' : 'BLOCKED'}" title="${escape(audit.errors.map((row) => `${row.path}: ${row.message}`).join('\n'))}">${escape(audit.workflow)}: ${audit.valid ? 'READY' : `BLOCKED (${audit.errors.length})`}</span>`).join('')}</div>`;
}

function scopedGroup(key) {
  const source = PROJECT_DATA_GROUPS.find((group) => group.key === key);
  if (!source) throw new TypeError(`Missing Project Data group: ${key}.`);
  const fields = key === 'sourcesAndUnits'
    ? source.fields.filter((field) => SOURCE_FIELDS.has(field.key))
    : key === 'topology'
      ? source.fields.filter((field) => TOPOLOGY_FIELDS.has(field.key))
      : source.fields;
  return Object.freeze({ ...source, label: NON_FEA_GROUP_LABELS[key], fields: Object.freeze(fields) });
}

function railMarkup(group, profile) {
  const summary = summarize([group], profile);
  const state = summary.missing === 0 && summary.unapproved === 0 ? 'READY' : 'REVIEW';
  return `<a href="#non-fea-project-${escape(group.key)}"><strong>${escape(group.label)}</strong><span>${summary.approved}/${summary.total} approved · ${state}</span></a>`;
}

function groupMarkup(profile, group, open) {
  return `<details id="non-fea-project-${escape(group.key)}" ${open ? 'open' : ''} class="non-fea-project-data__group"><summary><div><span class="panel-eyebrow">${escape(group.key)}</span><strong>${escape(group.label)}</strong></div><span>${group.fields.length} fields</span></summary>
    <div class="non-fea-project-data__fields">
      <strong>Field</strong><strong>Value</strong><strong>Evidence</strong><strong>Approved</strong>
      ${group.fields.map((field) => fieldMarkup(group.key, field, profile[group.key][field.key])).join('')}
    </div></details>`;
}

function fieldMarkup(groupKey, field, entry) {
  const path = `${groupKey}.${field.key}`;
  const value = entry.value === null ? '' : field.inputType === 'json' || field.inputType === 'source'
    ? JSON.stringify(entry.value, null, 2) : String(entry.value);
  const evidence = entry.evidence === null ? '' : JSON.stringify(entry.evidence, null, 2);
  const input = field.inputType === 'number'
    ? `<input type="number" min="0" step="any" data-project-value="${escape(path)}" value="${escape(value)}">`
    : `<textarea rows="${field.inputType === 'text' ? 2 : 4}" data-project-value="${escape(path)}" data-value-type="${escape(field.inputType)}">${escape(value)}</textarea>`;
  const state = entry.value === null ? 'MISSING' : entry.approved ? 'APPROVED' : 'REVIEW';
  return `<label title="${escape(field.usage)}"><strong>${escape(field.label)}</strong><small>${escape(path)} · ${escape(field.usage)}</small></label>
    ${input}<textarea rows="4" data-project-evidence="${escape(path)}" placeholder='{"source":"...","locator":"...","sourceHash":"..."}'>${escape(evidence)}</textarea>
    <label class="non-fea-project-data__approval" data-state="${state}"><input type="checkbox" data-project-approved="${escape(path)}" ${entry.approved ? 'checked' : ''}><span>${state}</span></label>`;
}

function policyMarkup() {
  return `<section class="non-fea-project-data__policy">
    <article><span class="panel-eyebrow">PROHIBITED IMPLICIT DEFAULTS</span><h3>Missing remains missing</h3><p>Schedule, generic steel, water, pressure, temperature, stiffness, gap and friction cannot be supplied by undocumented fallback. Explicit numerical zero remains valid evidence.</p></article>
    <article><span class="panel-eyebrow">CHANGE EFFECT</span><h3>Staleness is visible</h3><p>A used Project Data change invalidates the common-input seal and every dependent calculation receipt. An unused authority change still requires resealing review.</p></article>
  </section>`;
}

function summarize(groups, profile) {
  const entries = groups.flatMap((group) => group.fields.map((field) => profile[group.key][field.key]));
  return {
    total: entries.length,
    approved: entries.filter((entry) => entry.approved === true && entry.value !== null).length,
    missing: entries.filter((entry) => entry.value === null).length,
    unapproved: entries.filter((entry) => entry.value !== null && entry.approved !== true).length,
  };
}

function bindActions(root, onChanged) {
  root.addEventListener('change', async (event) => {
    if (event.target.matches('[data-project-data-import]')) return importProfile(event.target, onChanged);
    const path = event.target.dataset.projectValue || event.target.dataset.projectEvidence || event.target.dataset.projectApproved;
    if (!path) return;
    try {
      const valueInput = root.querySelector(`[data-project-value="${cssEscape(path)}"]`);
      const evidenceInput = root.querySelector(`[data-project-evidence="${cssEscape(path)}"]`);
      const approvedInput = root.querySelector(`[data-project-approved="${cssEscape(path)}"]`);
      projectDataStore.update(path, parseValue(valueInput), parseJson(evidenceInput.value), approvedInput.checked);
      onChanged?.();
    } catch (error) {
      event.target.setCustomValidity(error instanceof Error ? error.message : String(error));
      event.target.reportValidity();
    }
  });
  root.querySelector('[data-project-data-export]').addEventListener('click', () => downloadProfile(root.ownerDocument));
  root.querySelector('[data-project-data-restore]').addEventListener('click', () => { projectDataStore.restoreApprovedProfile(); onChanged?.(); });
  root.querySelector('[data-project-data-clear]').addEventListener('click', () => { projectDataStore.clear(); onChanged?.(); });
}

async function importProfile(input, onChanged) {
  const file = input.files?.[0];
  if (!file) return;
  try { projectDataStore.importProfile(JSON.parse(await file.text()), file.name); onChanged?.(); }
  catch (error) { input.setCustomValidity(error instanceof Error ? error.message : String(error)); input.reportValidity(); }
  finally { input.value = ''; }
}

function downloadProfile(documentRef) {
  const text = JSON.stringify(projectDataStore.getProfile(), null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = documentRef.createElement('a');
  anchor.href = url; anchor.download = 'non-fea-project-data-profile.json'; anchor.click();
  URL.revokeObjectURL(url);
}

function parseValue(input) {
  if (input.type === 'number') return input.value === '' ? null : Number(input.value);
  if (input.dataset.valueType === 'json' || input.dataset.valueType === 'source') return parseJson(input.value);
  return input.value === '' ? null : input.value;
}

function parseJson(value) { return value.trim() === '' ? null : JSON.parse(value); }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : value.replace(/[.]/g, '\\.'); }
function metric(label, value, state) { return `<article data-state="${state}"><span>${escape(label)}</span><strong>${escape(value)}</strong></article>`; }
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }

function styles() {
  return `<style>
    .non-fea-project-data-profile{height:100%;overflow:auto;padding:16px;background:#07101e;color:#e2e8f0;box-sizing:border-box}.non-fea-project-data__header{display:flex;gap:14px;justify-content:space-between;align-items:flex-start}.non-fea-project-data__header h2{margin:3px 0;font-size:25px}.non-fea-project-data__header p{margin:4px 0;color:#94a3b8;overflow-wrap:anywhere}.non-fea-project-data__title{display:flex;gap:9px;align-items:center}.non-fea-project-data__badge{padding:3px 8px;border:1px solid #0ea5e9;border-radius:999px;color:#7dd3fc;font-size:10px;font-weight:800;letter-spacing:.08em}.non-fea-project-data__actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.non-fea-project-data__actions button,.non-fea-project-data__actions label{border:1px solid #334155;border-radius:5px;background:#111c2f;color:#e2e8f0;padding:7px 10px;cursor:pointer}.non-fea-project-data__summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:13px}.non-fea-project-data__summary article{padding:10px;border:1px solid #293548;border-radius:6px;background:#0d1728}.non-fea-project-data__summary span{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase}.non-fea-project-data__summary strong{display:block;margin-top:4px;font-size:16px}.non-fea-project-data__summary [data-state="ready"]{border-color:#166534}.non-fea-project-data__summary [data-state="warning"]{border-color:#92400e}.non-fea-project-data__summary [data-state="blocked"]{border-color:#7f1d1d}.non-fea-project-data__audits{display:flex;gap:8px;margin:9px 0;flex-wrap:wrap}.non-fea-project-data__audits span{padding:4px 8px;border-radius:999px;border:1px solid #334155}.non-fea-project-data__audits [data-status="READY"]{color:#4ade80;border-color:#166534}.non-fea-project-data__audits [data-status="BLOCKED"]{color:#fbbf24;border-color:#92400e}.non-fea-project-data__scope{padding:10px 12px;border:1px solid #155e75;border-radius:6px;background:#082f49;color:#bae6fd;margin:10px 0}.non-fea-project-data__layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:12px;align-items:start}.non-fea-project-data__rail{position:sticky;top:0;padding:10px;border:1px solid #293548;border-radius:7px;background:#0b1424}.non-fea-project-data__rail a{display:block;padding:9px 10px;border-radius:5px;color:#cbd5e1;text-decoration:none}.non-fea-project-data__rail a:hover{background:#10243a;color:#7dd3fc}.non-fea-project-data__rail a span{display:block;color:#64748b;font-size:10px;margin-top:2px}.non-fea-project-data__rail p{color:#94a3b8;font-size:11px;line-height:1.45}.non-fea-project-data__main{display:flex;flex-direction:column;gap:9px}.non-fea-project-data__group{border:1px solid #334155;border-radius:7px;background:#0b1424;overflow:hidden}.non-fea-project-data__group summary{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;cursor:pointer;background:#101b2d}.non-fea-project-data__group summary strong{display:block;color:#7dd3fc}.non-fea-project-data__group summary>span{color:#94a3b8}.non-fea-project-data__fields{display:grid;grid-template-columns:minmax(190px,1fr) minmax(220px,1.2fr) minmax(240px,1.4fr) 100px;gap:6px;padding:9px 12px;align-items:start}.non-fea-project-data__fields>strong{color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.non-fea-project-data__fields label>strong{display:block}.non-fea-project-data__fields small{display:block;color:#64748b;margin-top:3px}.non-fea-project-data__fields input[type="number"],.non-fea-project-data__fields textarea{width:100%;box-sizing:border-box;border:1px solid #334155;border-radius:4px;background:#08111f;color:#e2e8f0;padding:7px}.non-fea-project-data__approval{display:flex;gap:6px;align-items:center;padding:7px;border:1px solid #334155;border-radius:5px}.non-fea-project-data__approval[data-state="APPROVED"]{color:#4ade80;border-color:#166534}.non-fea-project-data__approval[data-state="MISSING"]{color:#f87171;border-color:#7f1d1d}.non-fea-project-data__approval[data-state="REVIEW"]{color:#fbbf24;border-color:#92400e}.non-fea-project-data__policy{display:grid;grid-template-columns:1fr 1fr;gap:9px}.non-fea-project-data__policy article{padding:12px;border:1px solid #293548;border-radius:7px;background:#0b1424}.non-fea-project-data__policy h3{margin:3px 0}.non-fea-project-data__policy p{margin:4px 0;color:#94a3b8}.panel-eyebrow{display:block;color:#38bdf8;font-size:10px;font-weight:800;letter-spacing:.1em}@media(max-width:1050px){.non-fea-project-data__layout{grid-template-columns:1fr}.non-fea-project-data__rail{position:static}.non-fea-project-data__summary{grid-template-columns:repeat(2,1fr)}.non-fea-project-data__fields{grid-template-columns:1fr}.non-fea-project-data__policy{grid-template-columns:1fr}}
  </style>`;
}
