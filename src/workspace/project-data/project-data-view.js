import { PROJECT_DATA_GROUPS } from './project-data-fields.js';
import { projectDataStore } from './project-data-store.js';

/**
 * Renders import/export, validation, provenance, and explicit field editing for
 * Project Data. JSON/object fields are edited as JSON and invalid input blocks.
 */
export function renderProjectDataView(container, onChanged) {
  if (!container) throw new TypeError('Project Data view requires a container.');
  container.replaceChildren(buildView(container.ownerDocument, onChanged));
}

function buildView(documentRef, onChanged) {
  const root = documentRef.createElement('section');
  root.className = 'project-data-profile';
  root.style.cssText = 'height:100%;overflow:auto;padding:16px;background:#0b1120;color:#e2e8f0;box-sizing:border-box;';
  const profile = projectDataStore.getProfile();
  const origin = projectDataStore.getOrigin();
  const audits = ['normalization', 'topology', 'editing', 'loads', 'webgl', 'benchmark']
    .map((workflow) => projectDataStore.validate(workflow, null));
  root.innerHTML = headerMarkup(profile, origin, audits) + PROJECT_DATA_GROUPS.map((group) => groupMarkup(profile, group)).join('');
  bindActions(root, onChanged);
  return root;
}

function headerMarkup(profile, origin, audits) {
  const ready = audits.filter((audit) => audit.valid).length;
  return `<header style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:14px">
    <div><h2 style="margin:0;color:#38bdf8">Project Data</h2>
    <p style="margin:4px 0;color:#94a3b8">${escape(profile.schema)} · revision ${escape(profile.revision)}</p>
    <p data-project-data-origin style="margin:4px 0;color:#7dd3fc">Active authority: ${escape(origin.kind)} · ${escape(origin.source)} · ${escape(origin.profileSemanticHash)}</p>
    <p style="margin:4px 0;color:${ready === audits.length ? '#4ade80' : '#fbbf24'}">${ready}/${audits.length} workflows complete. Missing values block their workflow.</p></div>
    <div style="display:flex;gap:8px"><label class="project-data-button">Import JSON<input type="file" accept="application/json,.json" data-project-data-import hidden></label>
    <button type="button" data-project-data-export>Export JSON</button><button type="button" data-project-data-restore>Restore approved 1885S profile</button><button type="button" data-project-data-clear>Clear</button></div>
  </header>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${audits.map((audit) => `<span title="${escape(audit.errors.map((row) => `${row.path}: ${row.message}`).join('\n'))}" style="padding:4px 8px;border:1px solid ${audit.valid ? '#166534' : '#92400e'};border-radius:4px;color:${audit.valid ? '#4ade80' : '#fbbf24'}">${escape(audit.workflow)}: ${audit.valid ? 'READY' : `BLOCKED (${audit.errors.length})`}</span>`).join('')}</div>`;
}

function groupMarkup(profile, group) {
  return `<details open style="margin:8px 0;border:1px solid #334155;border-radius:6px"><summary style="padding:9px 12px;color:#7dd3fc;font-weight:700">${escape(group.label)}</summary>
    <div style="display:grid;grid-template-columns:minmax(190px,1fr) minmax(240px,2fr) minmax(240px,2fr) 80px;gap:6px;padding:8px 12px;align-items:start">
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
  return `<label title="${escape(field.usage)}">${escape(field.label)}<small style="display:block;color:#64748b">${escape(path)}</small></label>
    ${input}<textarea rows="4" data-project-evidence="${escape(path)}" placeholder='{"source":"...","locator":"...","sourceHash":"..."}'>${escape(evidence)}</textarea>
    <input type="checkbox" data-project-approved="${escape(path)}" ${entry.approved ? 'checked' : ''}>`;
}

function bindActions(root, onChanged) {
  root.addEventListener('change', async (event) => {
    if (event.target.matches('[data-project-data-import]')) return importProfile(event.target, root, onChanged);
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

async function importProfile(input, root, onChanged) {
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
  anchor.href = url; anchor.download = 'project-data-profile.json'; anchor.click();
  URL.revokeObjectURL(url);
}

function parseValue(input) {
  if (input.type === 'number') return input.value === '' ? null : Number(input.value);
  if (input.dataset.valueType === 'json' || input.dataset.valueType === 'source') return parseJson(input.value);
  return input.value === '' ? null : input.value;
}

function parseJson(value) { return value.trim() === '' ? null : JSON.parse(value); }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(value) : value.replace(/[.]/g, '\\.'); }
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }
