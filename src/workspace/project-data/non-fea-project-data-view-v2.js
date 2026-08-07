import { PROJECT_DATA_GROUPS } from './project-data-fields.js';
import {
  createConfiguredDefaultUsageLedger,
  createNonFeaFieldOwnershipMatrix,
} from './non-fea-field-registry.js';
import { projectDataStore } from './project-data-store.js';

const NON_FEA_GROUP_KEYS = Object.freeze([
  'sourcesAndUnits',
  'topology',
  'loadCalculation',
  'thermoMechanicalBasis',
  'restraintPolicy',
  'qualificationPolicy',
]);
const NON_FEA_GROUP_LABELS = Object.freeze({
  sourcesAndUnits: 'Sources and canonical units',
  topology: 'Topology, support and attachment policy',
  loadCalculation: 'Load cases, mass, sections and fluids',
  thermoMechanicalBasis: 'Pressure, temperature and material policy',
  restraintPolicy: 'Restraint, gap, preload and contact policy',
  qualificationPolicy: 'Qualification and configured defaults',
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

/** Renders the Phase 2 authoritative Project Data surface for Non-FEA Load Calc. */
export function renderNonFeaProjectDataViewV2(container, onChanged) {
  if (!container) throw new TypeError('Non-FEA Project Data requires a container.');
  container.replaceChildren(buildView(container.ownerDocument, onChanged));
}

function buildView(documentRef, onChanged) {
  const root = documentRef.createElement('section');
  root.className = 'project-data-profile non-fea-project-data-v2';
  root.dataset.role = 'non-fea-project-data';
  root.dataset.phase = '2';
  const profile = projectDataStore.getProfile();
  const origin = projectDataStore.getOrigin();
  const audits = ['topology', 'loads', 'nonFeaPolicy']
    .map((workflow) => projectDataStore.validate(workflow, null));
  const groups = NON_FEA_GROUP_KEYS.map((key) => scopedGroup(key));
  const summary = summarize(groups, profile);
  const ownership = createNonFeaFieldOwnershipMatrix(profile);
  const defaultLedger = createConfiguredDefaultUsageLedger(profile, []);

  root.innerHTML = `${styles()}${headerMarkup(profile, origin, audits, summary, ownership)}
    <section class="phase2-scope"><strong>Phase 2 authority boundary:</strong> this editor writes the existing Project Data profile. It declares project-policy ownership and configured-default permission; it does not resolve source/master/override fields or issue method readiness.</section>
    <div class="phase2-layout">
      <aside class="phase2-rail">
        <span class="eyebrow">NON-FEA PROJECT DATA</span>
        ${groups.map((group) => railMarkup(group, profile)).join('')}
        <a href="#non-fea-field-ownership"><strong>Field ownership matrix</strong><span>${ownership.rows.length} declared fields</span></a>
        <a href="#non-fea-default-ledger"><strong>Configured defaults</strong><span>${defaultCount(profile)} definitions · ${defaultLedger.rows.length} uses</span></a>
        <p>Missing policy remains missing. Approval does not turn a value into source or master evidence.</p>
      </aside>
      <main class="phase2-main">
        ${groups.map((group, index) => groupMarkup(profile, group, index === 0)).join('')}
        ${ownershipMarkup(ownership)}
        ${defaultLedgerMarkup(profile, defaultLedger)}
        ${policyMarkup()}
      </main>
    </div>`;
  bindActions(root, onChanged);
  return root;
}

function headerMarkup(profile, origin, audits, summary, ownership) {
  const ready = audits.filter((audit) => audit.valid).length;
  const projectOwned = ownership.rows.filter((row) => row.projectDataPath).length;
  const approvedOwned = ownership.rows.filter((row) => row.projectDataState === 'APPROVED').length;
  return `<header class="phase2-header">
    <div><div class="phase2-title"><span class="eyebrow">AUTHORITATIVE EDITOR</span><span class="phase2-badge">NON-FEA · PHASE 2</span></div>
      <h2>Project Data</h2>
      <p>${escape(profile.schema)} · revision ${escape(profile.revision)} · semantic hash ${escape(projectDataStore.getSemanticHash())}</p>
      <p>Source: ${escape(origin.source)} · ${escape(origin.kind)}</p>
    </div>
    <div class="phase2-actions">
      <label>Import JSON<input type="file" accept="application/json,.json" data-project-data-import hidden></label>
      <button type="button" data-project-data-export>Export JSON</button>
      <button type="button" data-project-data-restore>Restore approved 1885S</button>
      <button type="button" data-project-data-clear>Clear</button>
    </div>
  </header>
  <section class="phase2-summary">
    ${metric('Workflow readiness', `${ready}/${audits.length}`, ready === audits.length ? 'ready' : 'blocked')}
    ${metric('Approved editor fields', `${summary.approved}/${summary.total}`, summary.approved === summary.total ? 'ready' : 'warning')}
    ${metric('Declared common fields', ownership.rows.length, 'ready')}
    ${metric('Approved project-owned', `${approvedOwned}/${projectOwned}`, approvedOwned === projectOwned ? 'ready' : 'warning')}
    ${metric('Missing values', summary.missing, summary.missing ? 'blocked' : 'ready')}
  </section>
  <div class="phase2-audits">${audits.map((audit) => `<span data-status="${audit.valid ? 'READY' : 'BLOCKED'}" title="${escape(audit.errors.map((row) => `${row.path}: ${row.message}`).join('\n'))}">${escape(audit.workflow)}: ${audit.valid ? 'READY' : `BLOCKED (${audit.errors.length})`}</span>`).join('')}</div>`;
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
  return `<a href="#phase2-${escape(group.key)}"><strong>${escape(group.label)}</strong><span>${summary.approved}/${summary.total} approved · ${state}</span></a>`;
}

function groupMarkup(profile, group, open) {
  return `<details id="phase2-${escape(group.key)}" ${open ? 'open' : ''} class="phase2-group"><summary><div><span class="eyebrow">${escape(group.key)}</span><strong>${escape(group.label)}</strong></div><span>${group.fields.length} fields</span></summary>
    <div class="phase2-fields">
      <strong>Field</strong><strong>Value</strong><strong>Evidence</strong><strong>Approved</strong>
      ${group.fields.map((field) => fieldMarkup(group.key, field, profile[group.key][field.key])).join('')}
    </div></details>`;
}

function fieldMarkup(groupKey, field, entry) {
  const path = `${groupKey}.${field.key}`;
  const value = entry.value === null ? '' : ['json', 'source'].includes(field.inputType)
    ? JSON.stringify(entry.value, null, 2) : String(entry.value);
  const evidence = entry.evidence === null ? '' : JSON.stringify(entry.evidence, null, 2);
  const min = field.numericPolicy === 'SIGNED' ? '' : ' min="0"';
  const input = field.inputType === 'number'
    ? `<input type="number"${min} step="any" data-project-value="${escape(path)}" value="${escape(value)}">`
    : `<textarea rows="${field.inputType === 'text' ? 2 : 5}" data-project-value="${escape(path)}" data-value-type="${escape(field.inputType)}">${escape(value)}</textarea>`;
  const state = entry.value === null ? 'MISSING' : entry.approved ? 'APPROVED' : 'REVIEW';
  return `<label title="${escape(field.usage)}"><strong>${escape(field.label)}</strong><small>${escape(path)} · ${escape(field.usage)} · ${escape(field.numericPolicy)}</small></label>
    ${input}<textarea rows="4" data-project-evidence="${escape(path)}" placeholder='{"source":"...","locator":"...","sourceHash":"..."}'>${escape(evidence)}</textarea>
    <label class="phase2-approval" data-state="${state}"><input type="checkbox" data-project-approved="${escape(path)}" ${entry.approved ? 'checked' : ''}><span>${state}</span></label>`;
}

function ownershipMarkup(matrix) {
  return `<details id="non-fea-field-ownership" open class="phase2-group" data-role="non-fea-field-ownership-matrix"><summary><div><span class="eyebrow">FORMAL FIELD REGISTRY</span><strong>Field ownership matrix</strong></div><span>${matrix.rows.length} fields · ${escape(matrix.semanticHash)}</span></summary>
    <div class="phase2-table-wrap"><table><thead><tr><th>Field</th><th>Unit</th><th>Authority path</th><th>Project Data</th><th>Default</th></tr></thead><tbody>
      ${matrix.rows.map((row) => `<tr><td><strong>${escape(row.label)}</strong><code>${escape(row.fieldId)}</code></td><td>${escape(row.canonicalUnit)}</td><td>${row.authorityPath.map((item) => `<span>${escape(item)}</span>`).join(' → ')}</td><td>${escape(row.projectDataPath || 'NOT_PROJECT_OWNED')}<small>${escape(row.projectDataState)}</small></td><td>${row.defaultEligible ? 'FIELD-SPECIFIC ONLY' : 'PROHIBITED'}</td></tr>`).join('')}
    </tbody></table></div></details>`;
}

function defaultLedgerMarkup(profile, ledger) {
  const policy = profile.qualificationPolicy.configuredDefaults;
  const count = defaultCount(profile);
  return `<section id="non-fea-default-ledger" class="phase2-panel" data-role="non-fea-configured-default-ledger"><header><div><span class="eyebrow">CONFIGURED DEFAULT AUTHORITY</span><h3>Definition and usage ledger</h3></div><strong>${count} definitions · ${ledger.rows.length} uses</strong></header>
    <p>Defaults are permitted only for registry fields marked default-eligible, only for declared methods, and only after the complete Project Data entry is approved. Phase 2 records zero uses because no common checker has consumed a default.</p>
    <dl><dt>Policy state</dt><dd>${escape(policy.value === null ? 'MISSING' : policy.approved ? 'APPROVED' : 'REVIEW')}</dd><dt>Ledger schema</dt><dd>${escape(ledger.schema)}</dd><dt>Ledger hash</dt><dd>${escape(ledger.semanticHash)}</dd></dl>
  </section>`;
}

function policyMarkup() {
  return `<section class="phase2-policy">
    <article><span class="eyebrow">NO UNDOCUMENTED FALLBACK</span><h3>Missing remains missing</h3><p>Schedule, steel, water, pressure, temperature, stiffness, gap and friction are never synthesized from convenience assumptions. Explicit zero remains valid evidence.</p></article>
    <article><span class="eyebrow">DETERMINISTIC STALENESS</span><h3>Revision and semantic hash change together</h3><p>Every accepted edit increments the Project Data revision and publishes the exact current semantic hash for downstream invalidation.</p></article>
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

function defaultCount(profile) {
  return Array.isArray(profile?.qualificationPolicy?.configuredDefaults?.value?.defaults)
    ? profile.qualificationPolicy.configuredDefaults.value.defaults.length : 0;
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
  anchor.href = url;
  anchor.download = 'non-fea-project-data-profile.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseValue(input) {
  if (input.type === 'number') return input.value === '' ? null : Number(input.value);
  if (['json', 'source'].includes(input.dataset.valueType)) return parseJson(input.value);
  return input.value === '' ? null : input.value;
}

function parseJson(value) { return value.trim() === '' ? null : JSON.parse(value); }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : value.replace(/[.]/g, '\\.'); }
function metric(label, value, state) { return `<article data-state="${state}"><span>${escape(label)}</span><strong>${escape(value)}</strong></article>`; }
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }

function styles() {
  return `<style>
    .non-fea-project-data-v2{height:100%;overflow:auto;padding:16px;background:#07101e;color:#e2e8f0;box-sizing:border-box}.phase2-header{display:flex;gap:16px;justify-content:space-between;align-items:flex-start}.phase2-header h2{margin:3px 0;font-size:25px}.phase2-header p{margin:4px 0;color:#94a3b8;overflow-wrap:anywhere}.phase2-title{display:flex;gap:9px;align-items:center}.eyebrow{display:block;color:#38bdf8;font-size:10px;font-weight:800;letter-spacing:.1em}.phase2-badge{padding:3px 8px;border:1px solid #0ea5e9;border-radius:999px;color:#7dd3fc;font-size:10px;font-weight:800}.phase2-actions{display:flex;gap:7px;flex-wrap:wrap}.phase2-actions button,.phase2-actions label{border:1px solid #334155;border-radius:5px;background:#111c2f;color:#e2e8f0;padding:7px 10px;cursor:pointer}.phase2-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:13px}.phase2-summary article{padding:10px;border:1px solid #293548;border-radius:6px;background:#0d1728}.phase2-summary span{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase}.phase2-summary strong{display:block;margin-top:4px;font-size:15px;overflow-wrap:anywhere}.phase2-summary [data-state="ready"]{border-color:#166534}.phase2-summary [data-state="warning"]{border-color:#92400e}.phase2-summary [data-state="blocked"]{border-color:#7f1d1d}.phase2-audits{display:flex;gap:8px;margin:9px 0;flex-wrap:wrap}.phase2-audits span{padding:4px 8px;border-radius:999px;border:1px solid #334155}.phase2-audits [data-status="READY"]{color:#4ade80;border-color:#166534}.phase2-audits [data-status="BLOCKED"]{color:#fbbf24;border-color:#92400e}.phase2-scope{padding:10px 12px;border:1px solid #155e75;border-radius:6px;background:#082f49;color:#bae6fd;margin:10px 0}.phase2-layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px;align-items:start}.phase2-rail{position:sticky;top:0;padding:10px;border:1px solid #293548;border-radius:7px;background:#0b1424}.phase2-rail a{display:block;padding:9px 10px;border-radius:5px;color:#cbd5e1;text-decoration:none}.phase2-rail a:hover{background:#10243a;color:#7dd3fc}.phase2-rail a span,.phase2-rail p{display:block;color:#64748b;font-size:10px;margin-top:2px}.phase2-main{display:flex;flex-direction:column;gap:9px}.phase2-group,.phase2-panel{border:1px solid #334155;border-radius:7px;background:#0b1424;overflow:hidden}.phase2-group summary{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;cursor:pointer;background:#101b2d}.phase2-group summary strong{display:block;color:#7dd3fc}.phase2-group summary>span{color:#94a3b8;overflow-wrap:anywhere}.phase2-fields{display:grid;grid-template-columns:minmax(190px,1fr) minmax(220px,1.2fr) minmax(240px,1.4fr) 100px;gap:6px;padding:9px 12px;align-items:start}.phase2-fields>strong{color:#94a3b8;font-size:10px;text-transform:uppercase}.phase2-fields label{padding-top:6px}.phase2-fields label strong,.phase2-fields label small{display:block}.phase2-fields label small{color:#64748b}.phase2-fields input[type="number"],.phase2-fields textarea{width:100%;box-sizing:border-box;border:1px solid #334155;border-radius:4px;background:#07101e;color:#e2e8f0;padding:7px}.phase2-approval{display:flex;gap:5px;align-items:center}.phase2-approval[data-state="APPROVED"]{color:#4ade80}.phase2-approval[data-state="MISSING"]{color:#f87171}.phase2-table-wrap{overflow:auto}.phase2-table-wrap table{width:100%;border-collapse:collapse}.phase2-table-wrap th,.phase2-table-wrap td{padding:8px;border-bottom:1px solid #26354a;text-align:left;vertical-align:top}.phase2-table-wrap th{color:#7dd3fc;font-size:10px;text-transform:uppercase}.phase2-table-wrap code,.phase2-table-wrap small{display:block;color:#64748b}.phase2-table-wrap td span{font-size:10px}.phase2-panel{padding:13px}.phase2-panel header{display:flex;justify-content:space-between;gap:10px}.phase2-panel h3{margin:3px 0}.phase2-panel p,.phase2-panel dt{color:#94a3b8}.phase2-panel dl{display:grid;grid-template-columns:120px 1fr;gap:6px}.phase2-panel dd{margin:0;overflow-wrap:anywhere}.phase2-policy{display:grid;grid-template-columns:1fr 1fr;gap:9px}.phase2-policy article{border:1px solid #293548;border-radius:7px;background:#0b1424;padding:13px}.phase2-policy h3{margin:3px 0}.phase2-policy p{color:#94a3b8}.phase2-actions button:focus,.phase2-actions label:focus-within,.phase2-rail a:focus{outline:2px solid #38bdf8;outline-offset:2px}@media(max-width:1100px){.phase2-summary{grid-template-columns:repeat(2,1fr)}.phase2-layout{grid-template-columns:1fr}.phase2-rail{position:static}.phase2-fields{grid-template-columns:1fr}.phase2-policy{grid-template-columns:1fr}}
  </style>`;
}
