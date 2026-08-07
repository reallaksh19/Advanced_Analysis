import { NON_FEA_COMMON_METHOD_IDS } from '../core/non-fea-common-checker/index.js';
import { evaluateCurrentNonFeaAnalysisPlan } from './non-fea-analysis-plan-runtime.js';
import { nonFeaCommonInputStore } from './non-fea-common-input-store.js';
import {
  evaluateCurrentNonFeaCommonInput,
  getCurrentNonFeaLoadCaseAuthority,
  listCurrentQualificationProfiles,
} from './non-fea-common-input-runtime.js';

const METHOD_LABELS = Object.freeze({
  WEIGHT_AND_GRAVITY: 'Weight & gravity',
  SUSTAINED_REACTIONS: 'Sustained reactions',
  SUSTAINED_MEMBER_ACTIONS: 'Sustained member actions',
  SUSTAINED_STRESS: 'Sustained stress',
  THERMAL_FREE_DISPLACEMENT: 'Thermal free displacement',
  RESTRAINT_REACTIONS: 'Restraint reactions',
  VERTICAL_CONTACT: 'Vertical contact',
  COMBINED_OPERATING_REACTION: 'Combined operating reaction',
  ENRICHED_STAGED_JSON_EXPORT: 'Enriched staged JSON export',
});

export function renderNonFeaMethodBasisView(container, onChanged) {
  if (!container) throw new TypeError('Method Basis requires a container.');
  evaluateCurrentNonFeaCommonInput();
  const profiles = listCurrentQualificationProfiles();
  const loadCaseAuthority = getCurrentNonFeaLoadCaseAuthority();
  let planBundle = null;
  try {
    planBundle = evaluateCurrentNonFeaAnalysisPlan();
  } catch (error) {
    nonFeaCommonInputStore.setError(error);
  }
  container.innerHTML = `${styles()}${markup(
    nonFeaCommonInputStore.getSnapshot(),
    profiles,
    loadCaseAuthority,
    planBundle,
  )}`;
  bind(container, onChanged);
}

function markup(snapshot, profiles, loadCaseAuthority, planBundle) {
  const report = snapshot.report;
  const configuration = snapshot.configuration;
  const readiness = planBundle?.executionReadiness || null;
  const approvedLoadCases = loadCaseAuthority.state === 'READY'
    ? loadCaseAuthority.approvedLoadCases
    : [];
  return `<section class="method-basis" data-role="non-fea-method-basis" data-state="${escape(report?.packageState || 'NOT_EVALUATED')}">
    <header class="method-basis__header"><div><span class="panel-eyebrow">PHASE 4 · COMMON CHECKER + IMPLEMENTATION BINDING</span><h2>Method Basis</h2>
      <p>Select engineering methods, Project Data-approved load cases and qualification authority. Input readiness and executable implementation readiness are evaluated separately.</p></div>
      <button type="button" data-load-calc-tab="seal-export">Open Seal & Export</button></header>
    <section class="method-basis__rule"><strong>Rule:</strong> INPUT READY means the engineering evidence is sufficient for that method purpose. It is runnable only when a registered, qualified implementation is also bound. Project Data owns the active load-case set; sealing, authorization and calculation remain separate actions.</section>
    ${snapshot.error ? `<p class="message error">${escape(snapshot.error)}</p>` : ''}
    ${snapshot.message ? `<p class="message">${escape(snapshot.message)}</p>` : ''}
    <form data-method-basis-form class="method-basis__configuration">
      <fieldset><legend>Requested engineering methods</legend><div class="method-grid">${NON_FEA_COMMON_METHOD_IDS.map((methodId) => `<label><input type="checkbox" name="method" value="${methodId}" ${configuration.requestedMethods.includes(methodId) ? 'checked' : ''}><span>${escape(METHOD_LABELS[methodId])}</span><code>${methodId}</code></label>`).join('')}</div></fieldset>
      <fieldset data-role="method-basis-load-case-authority"><legend>Project Data-approved load cases</legend>${approvedLoadCases.length
        ? `<div class="case-grid">${approvedLoadCases.map((loadCaseId) => `<label><input type="checkbox" name="loadCase" value="${loadCaseId}" ${configuration.requestedLoadCases.includes(loadCaseId) ? 'checked' : ''}>${loadCaseId}</label>`).join('')}</div>`
        : `<p class="empty">Approve active Load Cases in Project Data before selecting calculation cases.</p>${blockerList(loadCaseAuthority.blockers)}`}</fieldset>
      <label class="profile-select">Qualification profile<select name="qualificationProfile"><option value="">No profile selected</option>${profiles.map((profile) => {
        const value = `${profile.profileId}@${profile.version}`;
        const selected = configuration.qualificationProfileId === profile.profileId && configuration.qualificationProfileVersion === profile.version;
        return `<option value="${escape(value)}" ${selected ? 'selected' : ''}>${escape(value)} · ${escape(profile.qualification)} · ${profile.locked ? 'LOCKED' : 'UNLOCKED'}</option>`;
      }).join('')}</select></label>
      <button type="submit">Apply and evaluate</button>
    </form>
    <section class="method-basis__metrics">
      ${metric('Package', report?.packageState || 'NOT_EVALUATED', statusClass(report?.packageState))}
      ${metric('Input ready', report?.readyMethodIds?.length || 0, report?.readyMethodIds?.length ? 'ready' : 'blocked')}
      ${metric('Ready to authorize', readiness?.readyToAuthorizeMethodIds?.length || 0, readiness?.readyToAuthorizeMethodIds?.length ? 'ready' : 'warning')}
      ${metric('Implementation blocked', readiness?.implementationBlockedMethodIds?.length || 0, readiness?.implementationBlockedMethodIds?.length ? 'warning' : 'ready')}
      ${metric('Load cases', loadCaseAuthority.state, loadCaseAuthority.state === 'READY' ? 'ready' : 'blocked')}
      ${metric('Candidate hash', compact(report?.candidateSemanticHash))}
      ${metric('Plan hash', compact(planBundle?.analysisPlan?.semanticHash))}
    </section>
    ${report ? methodTable(report.methodRows, readiness?.methodRows || []) : '<p class="empty">The common checker has not produced a report.</p>'}
    ${report?.blockers?.length ? `<section class="method-basis__blockers"><h3>Cross-method input blocker ledger</h3><ul>${report.blockers.map((row) => `<li><strong>${escape(row.methodId || 'GLOBAL')} · ${escape(row.code)}</strong><span>${escape(row.path)}</span><p>${escape(row.message)}</p></li>`).join('')}</ul></section>` : ''}
  </section>`;
}

function methodTable(rows, executionRows) {
  const executionByMethod = new Map(executionRows.map((row) => [row.commonMethodId, row]));
  return `<section class="method-basis__methods"><header><div><span class="panel-eyebrow">METHOD PURPOSE → IMPLEMENTATION</span><h3>Independent input and execution readiness</h3></div></header>
    <div class="table-wrap"><table><thead><tr><th>Method purpose</th><th>Input</th><th>Implementation</th><th>Execution</th><th>Requirement receipts</th></tr></thead><tbody>${rows.map((row) => {
      const execution = executionByMethod.get(row.methodId) || null;
      const implementation = execution?.binding?.implementationId
        || execution?.selectedImplementationId
        || execution?.candidateImplementationIds?.join(', ')
        || 'NOT_BOUND';
      return `<tr data-common-method-id="${row.methodId}">
      <td><strong>${escape(METHOD_LABELS[row.methodId])}</strong><code>${row.methodId}</code></td>
      <td><span class="chip ${statusClass(row.state)}">${row.state}</span></td>
      <td><strong>${escape(implementation)}</strong><code>${escape(execution?.implementationState || 'NOT_EVALUATED')}</code></td>
      <td><span class="chip ${executionStatusClass(execution?.executionState)}">${escape(execution?.executionState || 'NOT_EVALUATED')}</span>${execution?.implementationBlockerCode ? `<code>${escape(execution.implementationBlockerCode)}</code>` : ''}</td>
      <td><details ${row.state === 'READY' ? '' : 'open'}><summary>${row.requirements.filter((item) => item.state === 'READY').length}/${row.requirements.length} input requirements ready</summary><ul>${row.requirements.map((item) => `<li class="${statusClass(item.state)}"><strong>${escape(item.requirementId)}</strong><span>${escape(item.state)}</span><p>${escape(item.message)}</p></li>`).join('')}</ul></details></td>
    </tr>`;
    }).join('')}</tbody></table></div>
  </section>`;
}

function bind(container, onChanged) {
  container.querySelector('[data-method-basis-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const profileValue = String(data.get('qualificationProfile') || '');
      const [qualificationProfileId, versionText] = profileValue ? profileValue.split('@') : [null, null];
      nonFeaCommonInputStore.configure({
        requestedMethods: data.getAll('method'),
        requestedLoadCases: data.getAll('loadCase'),
        qualificationProfileId,
        qualificationProfileVersion: versionText ? Number(versionText) : null,
      });
      evaluateCurrentNonFeaCommonInput();
      evaluateCurrentNonFeaAnalysisPlan();
    } catch (error) {
      nonFeaCommonInputStore.setError(error);
    }
    onChanged?.();
  });
}

function blockerList(rows) {
  return rows?.length ? `<ul class="load-case-blockers">${rows.map((row) => `<li><strong>${escape(row.code)}</strong> · ${escape(row.message)}</li>`).join('')}</ul>` : '';
}
function metric(label, value, state = '') {
  return `<article class="metric ${state}"><span>${escape(label)}</span><strong title="${escape(value)}">${escape(value)}</strong></article>`;
}
function statusClass(value) {
  const token = String(value || '');
  if (token === 'READY') return 'ready';
  if (token === 'PARTIALLY_READY' || token === 'NOT_EVALUATED') return 'warning';
  return 'blocked';
}
function executionStatusClass(value) {
  if (value === 'READY_TO_AUTHORIZE') return 'ready';
  if (value === 'SELECTION_REQUIRED' || value === 'INPUT_READY_IMPLEMENTATION_NOT_READY' || value === 'NOT_EVALUATED') return 'warning';
  return 'blocked';
}
function compact(value) {
  if (!value) return 'NOT_AVAILABLE';
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}
function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}
function styles() {
  return `<style>
    .method-basis{height:100%;overflow:auto;padding:16px;box-sizing:border-box;background:#07101e;color:#e2e8f0}.method-basis__header,.method-basis__methods>header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.method-basis h2,.method-basis h3{margin:3px 0}.method-basis p{color:#94a3b8}.method-basis button{border:1px solid #334155;border-radius:5px;background:#111c2f;color:#e2e8f0;padding:8px 11px;cursor:pointer}.method-basis__rule{margin:12px 0;padding:10px;border:1px solid #155e75;border-radius:6px;background:#082f49;color:#bae6fd}.method-basis__configuration{display:grid;grid-template-columns:minmax(0,3fr) minmax(180px,1fr);gap:10px;padding:12px;border:1px solid #293548;border-radius:7px;background:#0b1424}.method-basis fieldset{border:1px solid #334155}.method-grid{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:6px}.method-grid label{display:grid;grid-template-columns:auto 1fr;gap:5px;padding:6px;border:1px solid #26354a;border-radius:5px}.method-grid code{grid-column:2;color:#64748b;font-size:10px}.case-grid{display:flex;gap:10px}.profile-select{display:flex;flex-direction:column;gap:5px}.method-basis select{padding:7px;background:#07101e;color:#e2e8f0;border:1px solid #334155}.method-basis__metrics{display:grid;grid-template-columns:repeat(7,minmax(110px,1fr));gap:8px;margin:12px 0}.metric{padding:10px;border:1px solid #293548;border-radius:6px;background:#0d1728;overflow:hidden}.metric span{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase}.metric strong{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis}.metric.ready{border-color:#166534}.metric.warning{border-color:#92400e}.metric.blocked{border-color:#7f1d1d}.method-basis__methods,.method-basis__blockers{padding:12px;border:1px solid #293548;border-radius:7px;background:#0b1424}.table-wrap{overflow:auto}.method-basis table{width:100%;border-collapse:collapse}.method-basis th,.method-basis td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid #223047}.method-basis th{font-size:10px;color:#7dd3fc}.method-basis td>code{display:block;color:#64748b;font-size:10px;margin-top:3px}.chip{display:inline-block;padding:3px 7px;border:1px solid #475569;border-radius:999px;font-size:10px}.chip.ready,.method-basis li.ready span{color:#4ade80}.chip.warning{color:#fbbf24}.chip.blocked,.method-basis li.blocked span{color:#f87171}.method-basis details ul,.method-basis__blockers ul,.load-case-blockers{padding-left:18px}.method-basis details li{margin:5px 0}.method-basis details li span{margin-left:8px}.method-basis details li p{margin:2px 0}.load-case-blockers{color:#fca5a5;font-size:11px}.message{padding:8px;border:1px solid #155e75;background:#082f49}.message.error{border-color:#7f1d1d;background:#3f1118;color:#fecaca}.panel-eyebrow{display:block;color:#38bdf8;font-size:10px;font-weight:800;letter-spacing:.1em}@media(max-width:1100px){.method-grid{grid-template-columns:repeat(2,1fr)}.method-basis__metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){.method-basis__configuration{grid-template-columns:1fr}.method-grid{grid-template-columns:1fr}.method-basis__metrics{grid-template-columns:repeat(2,1fr)}}
  </style>`;
}
