import { PROJECT_DATA_GROUPS } from './project-data-fields.js';
import { projectDataStore } from './project-data-store.js';
import { resolveProjectDataConfiguredDefaultsAuthority } from './project-data-configured-resolution.js';

const CONFIGURED_DEFAULTS_PATH = 'engineeringCalculationDefaults.configuredDefaults';
const RESOLUTION_POLICY_PATH = 'engineeringCalculationDefaults.resolutionPolicy';
const DIMENSION_TOLERANCES_PATH =
  'engineeringCalculationDefaults.dimensionVerificationTolerancesMm';

/**
 * Renders import/export, validation, provenance, and explicit field editing for
 * Project Data. Engineering defaults use a typed authoring panel; the stored
 * authority remains evidence-wrapped JSON.
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
  const workflows = [
    'normalization',
    'topology',
    'editing',
    'loads',
    'nonFeaPipingDefaults',
    'webgl',
    'benchmark',
  ];
  const audits = workflows.map((workflow) => projectDataStore.validate(workflow, null));
  root.innerHTML = headerMarkup(profile, origin, audits)
    + PROJECT_DATA_GROUPS.map((group) => groupMarkup(profile, group)).join('');
  bindActions(root, onChanged);
  return root;
}

function headerMarkup(profile, origin, audits) {
  const ready = audits.filter((audit) => audit.valid).length;
  return `<header style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:14px">
    <div><h2 style="margin:0;color:#38bdf8">Project Data</h2>
    <p style="margin:4px 0;color:#94a3b8">${escape(profile.schema)} · revision ${escape(profile.revision)}</p>
    <p data-project-data-origin style="margin:4px 0;color:#7dd3fc">Active authority: ${escape(origin.kind)} · ${escape(origin.source)} · ${escape(origin.profileSemanticHash)}</p>
    <p style="margin:4px 0;color:${ready === audits.length ? '#4ade80' : '#fbbf24'}">${ready}/${audits.length} workflows complete. Missing or unapproved values block their workflow.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="project-data-button">Import JSON<input type="file" accept="application/json,.json" data-project-data-import hidden></label>
    <button type="button" data-project-data-export>Export JSON</button><button type="button" data-project-data-restore>Restore approved 1885S profile</button><button type="button" data-project-data-clear>Clear</button></div>
  </header>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${audits.map((audit) => `<span title="${escape(audit.errors.map((row) => `${row.path}: ${row.message}`).join('\n'))}" style="padding:4px 8px;border:1px solid ${audit.valid ? '#166534' : '#92400e'};border-radius:4px;color:${audit.valid ? '#4ade80' : '#fbbf24'}">${escape(workflowLabel(audit.workflow))}: ${audit.valid ? 'READY' : `BLOCKED (${audit.errors.length})`}</span>`).join('')}</div>`;
}

function workflowLabel(value) {
  if (value === 'nonFeaPipingDefaults') return 'non-FEA defaults';
  return value;
}

function groupMarkup(profile, group) {
  if (group.key === 'engineeringCalculationDefaults') {
    return engineeringDefaultsMarkup(profile, group);
  }
  return `<details open style="margin:8px 0;border:1px solid #334155;border-radius:6px"><summary style="padding:9px 12px;color:#7dd3fc;font-weight:700">${escape(group.label)}</summary>
    <div style="display:grid;grid-template-columns:minmax(190px,1fr) minmax(240px,2fr) minmax(240px,2fr) 80px;gap:6px;padding:8px 12px;align-items:start">
      <strong>Field</strong><strong>Value</strong><strong>Evidence</strong><strong>Approved</strong>
      ${group.fields.map((field) => fieldMarkup(group.key, field, profile[group.key]?.[field.key])).join('')}
    </div></details>`;
}

function engineeringDefaultsMarkup(profile, group) {
  const authority = resolveProjectDataConfiguredDefaultsAuthority(profile);
  const defaultsEntry = profile.engineeringCalculationDefaults?.configuredDefaults
    ?? emptyEntry();
  const defaults = Array.isArray(defaultsEntry.value) ? defaultsEntry.value : [];
  const enabled = defaults.filter((record) => record?.enabled === true).length;
  const blocked = defaults.filter((record) => defaultStatus(record) === 'BLOCKED').length;
  const policyEntry = profile.engineeringCalculationDefaults?.resolutionPolicy ?? emptyEntry();
  const toleranceEntry = profile.engineeringCalculationDefaults?.dimensionVerificationTolerancesMm
    ?? emptyEntry();
  const optionalFields = group.fields.filter((field) => ![
    'resolutionPolicy',
    'dimensionVerificationTolerancesMm',
    'configuredDefaults',
  ].includes(field.key));

  return `<details open style="margin:8px 0;border:1px solid #0e7490;border-radius:8px;background:#07101e"><summary style="padding:11px 12px;color:#67e8f9;font-weight:800">${escape(group.label)}</summary>
    <div style="padding:10px 12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        ${statusBadge(authority.status === 'READY' ? 'READY' : 'BLOCKED', authority.status === 'READY')}
        <span style="padding:4px 8px;border:1px solid #334155;border-radius:4px">Definitions: ${defaults.length}</span>
        <span style="padding:4px 8px;border:1px solid #334155;border-radius:4px">Enabled: ${enabled}</span>
        <span style="padding:4px 8px;border:1px solid ${blocked ? '#92400e' : '#166534'};border-radius:4px;color:${blocked ? '#fbbf24' : '#4ade80'}">Invalid definitions: ${blocked}</span>
        <span style="padding:4px 8px;border:1px solid #166534;border-radius:4px;color:#4ade80">Hidden fallback: prohibited</span>
      </div>
      ${authority.status === 'READY' ? '' : `<div style="margin-bottom:10px;padding:8px;border:1px solid #92400e;background:#451a031f;color:#fbbf24">${escape(authority.blockers.map((row) => `${row.path}: ${row.message}`).join(' | '))}</div>`}
      ${resolutionPolicyMarkup(policyEntry)}
      ${dimensionToleranceMarkup(toleranceEntry)}
      ${configuredDefaultsMarkup(defaultsEntry, defaults, profile.projectId)}
      <details style="margin-top:10px;border:1px solid #334155;border-radius:6px"><summary style="padding:8px 10px;color:#94a3b8;font-weight:700">Additional calculation settings</summary>
        <div style="display:grid;grid-template-columns:minmax(190px,1fr) minmax(240px,2fr) minmax(240px,2fr) 80px;gap:6px;padding:8px 12px;align-items:start">
          <strong>Field</strong><strong>Value</strong><strong>Evidence</strong><strong>Approved</strong>
          ${optionalFields.map((field) => fieldMarkup(group.key, field, profile[group.key]?.[field.key])).join('')}
        </div>
      </details>
    </div></details>`;
}

function statusBadge(label, valid) {
  return `<span style="padding:4px 8px;border:1px solid ${valid ? '#166534' : '#92400e'};border-radius:4px;color:${valid ? '#4ade80' : '#fbbf24'}">Authority: ${escape(label)}</span>`;
}

function resolutionPolicyMarkup(entry) {
  const policy = Array.isArray(entry.value) ? entry.value : [];
  return `<section style="margin:8px 0;padding:10px;border:1px solid #334155;border-radius:6px">
    <h3 style="margin:0 0 8px;color:#7dd3fc;font-size:14px">Resolution policy <small style="color:#64748b">${escape(RESOLUTION_POLICY_PATH)}</small></h3>
    <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:8px">${policy.length
      ? policy.map((item, index) => `${index ? '<span style="color:#64748b">→</span>' : ''}<code style="padding:4px 6px;background:#111827;border-radius:4px">${escape(item)}</code>`).join('')
      : '<span style="color:#fbbf24">No approved resolution policy.</span>'}</div>
    ${authorityControls(RESOLUTION_POLICY_PATH, entry)}
  </section>`;
}

function dimensionToleranceMarkup(entry) {
  const value = entry.value && typeof entry.value === 'object' ? entry.value : {};
  return `<section style="margin:8px 0;padding:10px;border:1px solid #334155;border-radius:6px">
    <h3 style="margin:0 0 8px;color:#7dd3fc;font-size:14px">Dimension verification tolerances <small style="color:#64748b">${escape(DIMENSION_TOLERANCES_PATH)}</small></h3>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px">
      <label>Outside diameter ± <input type="number" min="0" step="any" data-dimension-tolerance-key="outsideDiameterMm" value="${escape(value.outsideDiameterMm ?? '')}"> mm</label>
      <label>Wall thickness ± <input type="number" min="0" step="any" data-dimension-tolerance-key="wallThicknessMm" value="${escape(value.wallThicknessMm ?? '')}"> mm</label>
    </div>
    ${authorityControls(DIMENSION_TOLERANCES_PATH, entry)}
  </section>`;
}

function configuredDefaultsMarkup(entry, defaults, projectId) {
  return `<section style="margin:8px 0;padding:10px;border:1px solid #334155;border-radius:6px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px"><h3 style="margin:0;color:#7dd3fc;font-size:14px">Default definitions <small style="color:#64748b">${escape(CONFIGURED_DEFAULTS_PATH)}</small></h3><button type="button" data-configured-default-add>+ Add configured default</button></div>
    <div style="display:grid;grid-template-columns:64px minmax(170px,1fr) minmax(180px,1fr) 90px 110px;gap:6px;padding:5px 7px;color:#94a3b8;font-weight:700"><span>Use</span><span>ID</span><span>Field</span><span>Scope</span><span>Status</span></div>
    ${defaults.length ? defaults.map((record, index) => configuredDefaultRow(record, index)).join('') : '<div style="padding:10px;color:#fbbf24">No configured defaults. Missing source values will block.</div>'}
    <div style="margin-top:9px;padding-top:9px;border-top:1px solid #334155">${authorityControls(CONFIGURED_DEFAULTS_PATH, entry)}</div>
    <p style="margin:8px 0 0;color:#64748b">New rows are disabled and unqualified. A default cannot be used until the enclosing Project Data field is approved and the exact entity scope matches. Project: ${escape(projectId || 'UNSET')}.</p>
  </section>`;
}

function configuredDefaultRow(record, index) {
  const status = defaultStatus(record);
  const scopeCount = record?.scope && typeof record.scope === 'object'
    ? Object.keys(record.scope).length : 0;
  const color = status === 'READY' ? '#4ade80' : status === 'OFF' ? '#94a3b8' : '#fbbf24';
  return `<details data-configured-default-index="${index}" style="margin:5px 0;border:1px solid #1e293b;border-radius:5px;background:#0b1120">
    <summary style="display:grid;grid-template-columns:64px minmax(170px,1fr) minmax(180px,1fr) 90px 110px;gap:6px;padding:7px;align-items:center;cursor:pointer">
      <span><input type="checkbox" data-default-property="enabled" ${record?.enabled === true ? 'checked' : ''}></span>
      <code>${escape(record?.id ?? '')}</code><span>${escape(record?.field ?? '')}</span><span>${scopeCount} key${scopeCount === 1 ? '' : 's'}</span><strong style="color:${color}">${status}</strong>
    </summary>
    <div style="display:grid;grid-template-columns:minmax(150px,1fr) minmax(260px,2fr);gap:7px;padding:9px;border-top:1px solid #1e293b">
      ${defaultInput('ID', 'id', record?.id ?? '')}
      ${defaultInput('Field', 'field', record?.field ?? '')}
      ${defaultInput('Unit', 'unit', record?.unit ?? '')}
      ${defaultInput('Qualification', 'qualification', record?.qualification ?? '')}
      ${defaultJsonInput('Value', 'value', record?.value)}
      ${defaultJsonInput('Scope', 'scope', record?.scope ?? {})}
      ${defaultTextarea('Reason', 'reason', record?.reason ?? '')}
      <div></div><div style="display:flex;gap:7px;justify-content:flex-end"><button type="button" data-configured-default-clone>Clone</button><button type="button" data-configured-default-delete>Delete</button></div>
    </div>
  </details>`;
}

function defaultInput(label, property, value) {
  return `<label>${escape(label)}</label><input type="text" data-default-property="${escape(property)}" value="${escape(value)}">`;
}

function defaultTextarea(label, property, value) {
  return `<label>${escape(label)}</label><textarea rows="3" data-default-property="${escape(property)}">${escape(value)}</textarea>`;
}

function defaultJsonInput(label, property, value) {
  return `<label>${escape(label)} <small style="color:#64748b">JSON</small></label><textarea rows="4" data-default-json-property="${escape(property)}">${escape(JSON.stringify(value, null, 2))}</textarea>`;
}

function authorityControls(path, entry) {
  const evidence = entry?.evidence === null || entry?.evidence === undefined
    ? '' : JSON.stringify(entry.evidence, null, 2);
  return `<div style="display:grid;grid-template-columns:minmax(220px,1fr) 90px;gap:7px;align-items:start"><textarea rows="3" data-project-evidence="${escape(path)}" placeholder='{"source":"...","locator":"...","revision":1}'>${escape(evidence)}</textarea><label style="display:flex;gap:5px;align-items:center"><input type="checkbox" data-project-approved="${escape(path)}" ${entry?.approved ? 'checked' : ''}>Approved</label></div>`;
}

function fieldMarkup(groupKey, field, entryValue) {
  const entry = entryValue ?? emptyEntry();
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
    if (event.target.matches('[data-project-data-import]')) {
      return importProfile(event.target, root, onChanged);
    }
    const defaultRow = event.target.closest('[data-configured-default-index]');
    if (defaultRow && (event.target.dataset.defaultProperty || event.target.dataset.defaultJsonProperty)) {
      return updateConfiguredDefaultRow(defaultRow, event.target, onChanged);
    }
    if (event.target.dataset.dimensionToleranceKey) {
      return updateDimensionTolerance(event.target, onChanged);
    }
    const path = event.target.dataset.projectValue
      || event.target.dataset.projectEvidence
      || event.target.dataset.projectApproved;
    if (!path) return undefined;
    try {
      const valueInput = root.querySelector(`[data-project-value="${cssEscape(path)}"]`);
      const evidenceInput = root.querySelector(`[data-project-evidence="${cssEscape(path)}"]`);
      const approvedInput = root.querySelector(`[data-project-approved="${cssEscape(path)}"]`);
      const currentEntryValue = projectDataStore.getProfile()[path.split('.')[0]]?.[path.split('.')[1]]
        ?? emptyEntry();
      const value = valueInput ? parseValue(valueInput) : currentEntryValue.value;
      projectDataStore.update(
        path,
        value,
        evidenceInput ? parseJson(evidenceInput.value) : currentEntryValue.evidence,
        approvedInput ? approvedInput.checked : currentEntryValue.approved,
      );
      event.target.setCustomValidity?.('');
      onChanged?.();
    } catch (error) {
      event.target.setCustomValidity?.(error instanceof Error ? error.message : String(error));
      event.target.reportValidity?.();
    }
    return undefined;
  });
  root.addEventListener('click', (event) => {
    if (event.target.matches('[data-configured-default-add]')) {
      event.preventDefault();
      addConfiguredDefault(onChanged);
      return;
    }
    const row = event.target.closest('[data-configured-default-index]');
    if (!row) return;
    if (event.target.matches('[data-configured-default-clone]')) {
      event.preventDefault();
      cloneConfiguredDefault(Number(row.dataset.configuredDefaultIndex), onChanged);
    }
    if (event.target.matches('[data-configured-default-delete]')) {
      event.preventDefault();
      deleteConfiguredDefault(Number(row.dataset.configuredDefaultIndex), onChanged);
    }
  });
  root.querySelector('[data-project-data-export]').addEventListener('click', () => downloadProfile(root.ownerDocument));
  root.querySelector('[data-project-data-restore]').addEventListener('click', () => {
    projectDataStore.restoreApprovedProfile();
    onChanged?.();
  });
  root.querySelector('[data-project-data-clear]').addEventListener('click', () => {
    projectDataStore.clear();
    onChanged?.();
  });
}

function updateDimensionTolerance(input, onChanged) {
  try {
    const entry = currentEntry(DIMENSION_TOLERANCES_PATH);
    const value = entry.value && typeof entry.value === 'object' ? clone(entry.value) : {};
    value[input.dataset.dimensionToleranceKey] = input.value === '' ? null : Number(input.value);
    projectDataStore.update(DIMENSION_TOLERANCES_PATH, value, entry.evidence, entry.approved);
    input.setCustomValidity('');
    onChanged?.();
  } catch (error) {
    input.setCustomValidity(error instanceof Error ? error.message : String(error));
    input.reportValidity();
  }
}

function updateConfiguredDefaultRow(row, input, onChanged) {
  try {
    const index = Number(row.dataset.configuredDefaultIndex);
    const entry = currentEntry(CONFIGURED_DEFAULTS_PATH);
    const defaults = Array.isArray(entry.value) ? clone(entry.value) : [];
    if (!defaults[index]) throw new RangeError(`Configured default index ${index} does not exist.`);
    const property = input.dataset.defaultProperty || input.dataset.defaultJsonProperty;
    let value;
    if (input.type === 'checkbox') value = input.checked;
    else if (input.dataset.defaultJsonProperty) value = parseJson(input.value);
    else value = input.value === '' && property === 'unit' ? null : input.value;
    defaults[index][property] = value;
    projectDataStore.update(CONFIGURED_DEFAULTS_PATH, defaults, entry.evidence, entry.approved);
    input.setCustomValidity?.('');
    onChanged?.();
  } catch (error) {
    input.setCustomValidity?.(error instanceof Error ? error.message : String(error));
    input.reportValidity?.();
  }
}

function addConfiguredDefault(onChanged) {
  const entry = currentEntry(CONFIGURED_DEFAULTS_PATH);
  const defaults = Array.isArray(entry.value) ? clone(entry.value) : [];
  defaults.push({
    id: nextDefaultId(defaults),
    enabled: false,
    field: 'UNASSIGNED',
    value: null,
    unit: null,
    scope: { projectId: projectDataStore.getProfile().projectId || 'UNSET' },
    reason: 'Engineering basis and exact scope must be defined before enabling.',
    qualification: 'UNQUALIFIED_DRAFT',
  });
  projectDataStore.update(CONFIGURED_DEFAULTS_PATH, defaults, entry.evidence, entry.approved);
  onChanged?.();
}

function cloneConfiguredDefault(index, onChanged) {
  const entry = currentEntry(CONFIGURED_DEFAULTS_PATH);
  const defaults = Array.isArray(entry.value) ? clone(entry.value) : [];
  if (!defaults[index]) throw new RangeError(`Configured default index ${index} does not exist.`);
  const cloned = clone(defaults[index]);
  cloned.id = nextCopyId(defaults, cloned.id || 'DEFAULT');
  cloned.enabled = false;
  cloned.qualification = 'UNQUALIFIED_DRAFT';
  cloned.reason = `Cloned from ${defaults[index].id}; review basis and scope before enabling.`;
  defaults.splice(index + 1, 0, cloned);
  projectDataStore.update(CONFIGURED_DEFAULTS_PATH, defaults, entry.evidence, entry.approved);
  onChanged?.();
}

function deleteConfiguredDefault(index, onChanged) {
  const entry = currentEntry(CONFIGURED_DEFAULTS_PATH);
  const defaults = Array.isArray(entry.value) ? clone(entry.value) : [];
  defaults.splice(index, 1);
  projectDataStore.update(CONFIGURED_DEFAULTS_PATH, defaults, entry.evidence, entry.approved);
  onChanged?.();
}

function currentEntry(path) {
  const [group, field] = path.split('.');
  return projectDataStore.getProfile()[group]?.[field] ?? emptyEntry();
}

function nextDefaultId(defaults) {
  let index = 1;
  const ids = new Set(defaults.map((record) => record?.id));
  while (ids.has(`DEFAULT-NEW-${String(index).padStart(3, '0')}`)) index += 1;
  return `DEFAULT-NEW-${String(index).padStart(3, '0')}`;
}

function nextCopyId(defaults, base) {
  let index = 1;
  const ids = new Set(defaults.map((record) => record?.id));
  while (ids.has(`${base}-COPY-${index}`)) index += 1;
  return `${base}-COPY-${index}`;
}

function defaultStatus(record) {
  if (!record || typeof record !== 'object') return 'BLOCKED';
  if (record.enabled !== true) return 'OFF';
  if (!record.id || !record.field || !Object.hasOwn(record, 'value')
      || !record.scope || typeof record.scope !== 'object'
      || !record.reason || !record.qualification) return 'BLOCKED';
  if (record.field === 'section.schedule'
      && ['lineId', 'branchPath', 'nominalBoreMm'].some((key) => !Object.hasOwn(record.scope, key))) {
    return 'BLOCKED';
  }
  return 'READY';
}

async function importProfile(input, root, onChanged) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    projectDataStore.importProfile(JSON.parse(await file.text()), file.name);
    onChanged?.();
  } catch (error) {
    input.setCustomValidity(error instanceof Error ? error.message : String(error));
    input.reportValidity();
  } finally {
    input.value = '';
  }
}

function downloadProfile(documentRef) {
  const text = JSON.stringify(projectDataStore.getProfile(), null, 2);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = 'project-data-profile.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseValue(input) {
  if (input.type === 'number') return input.value === '' ? null : Number(input.value);
  if (input.dataset.valueType === 'json' || input.dataset.valueType === 'source') {
    return parseJson(input.value);
  }
  return input.value === '' ? null : input.value;
}

function parseJson(value) {
  return value.trim() === '' ? null : JSON.parse(value);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : value.replace(/[.]/gu, '\\.');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyEntry() {
  return { value: null, evidence: null, approved: false };
}

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}
