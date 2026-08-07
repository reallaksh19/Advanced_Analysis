import {
  EMPIRICAL_METHOD_REGISTRY,
} from './empirical-method-registry.js';

export function renderEmpiricalScenarioOverview(container, state) {
  if (!container) return;
  const { snapshot, proposal } = normalizeState(state);
  container.innerHTML = `
    <section class="engineering-card" data-empirical-scenario-overview>
      <div class="engineering-card__header">
        <div>
          <p class="eyebrow">Method-bound scenario</p>
          <h3>Empirical calculation overview</h3>
        </div>
        ${badge(snapshot.state)}
      </div>
      ${proposal ? overviewConfigured(snapshot, proposal) : emptyState(
        'No empirical scenario is configured.',
        'Supply the normalized SJSON adapter request, locked runtime profile and exact source authorities before authorization.',
      )}
    </section>
  `;
}

export function renderEmpiricalScenarioRestraints(container, state) {
  if (!container) return;
  const { proposal, selectedEntityId } = normalizeState(state);
  const rows = proposal?.adaptedRequest?.restraintOccurrences || [];
  container.innerHTML = `
    <section class="engineering-card" data-empirical-scenario-restraints>
      <div class="engineering-card__header">
        <div><p class="eyebrow">Source and effective custody</p><h3>Restraints</h3></div>
        <span class="status-badge">${rows.length} occurrences</span>
      </div>
      ${rows.length ? `
        <div class="table-scroll">
          <table class="engineering-table">
            <thead><tr>
              <th>Support site</th><th>Restraint</th><th>Source</th><th>Effective</th>
              <th>Host</th><th>Gap</th><th>Stiffness</th><th>Override</th><th>Geometry</th>
            </tr></thead>
            <tbody>${rows.map((row) => restraintRow(row, selectedEntityId)).join('')}</tbody>
          </table>
        </div>
      ` : emptyState(
        'No restraint occurrences are available.',
        'Configure an empirical scenario to inspect stable source/effective restraint identity.',
      )}
    </section>
  `;
}

export function renderEmpiricalScenarioLoadCases(container, state) {
  if (!container) return;
  const { proposal } = normalizeState(state);
  const configurations = new Map((proposal?.caseConfigurations || []).map((row) => [
    row.loadCaseId,
    row,
  ]));
  const rows = proposal?.adaptedRequest?.loadCases || [];
  container.innerHTML = `
    <section class="engineering-card" data-empirical-scenario-load-cases>
      <div class="engineering-card__header">
        <div><p class="eyebrow">Explicit ownership</p><h3>Load cases</h3></div>
        <span class="status-badge">${rows.length} cases</span>
      </div>
      ${rows.length ? `
        <div class="table-scroll"><table class="engineering-table">
          <thead><tr><th>Case</th><th>Result class</th><th>Weight</th><th>Thermal</th>
          <th>Pressure compatibility</th><th>Pressure stress</th><th>Configuration</th></tr></thead>
          <tbody>${rows.map((row) => loadCaseRow(row, configurations.get(row.loadCaseId))).join('')}</tbody>
        </table></div>
        ${combinationNotice(proposal.adaptedRequest.combinationPolicy)}
      ` : emptyState(
        'No empirical load cases are configured.',
        'Load ownership must be explicit before authorization.',
      )}
    </section>
  `;
}

export function renderEmpiricalScenarioMethods(container, state) {
  if (!container) return;
  const { snapshot, proposal } = normalizeState(state);
  container.innerHTML = `
    <section class="engineering-card" data-empirical-scenario-methods>
      <div class="engineering-card__header">
        <div><p class="eyebrow">Runtime registry</p><h3>Methods and profile authority</h3></div>
        ${badge(snapshot.state)}
      </div>
      <div class="method-card-grid">
        ${EMPIRICAL_METHOD_REGISTRY.methods.map((row) => methodCard(row, snapshot.method)).join('')}
      </div>
      ${proposal ? profilePanel(snapshot, proposal.runtimeProfile) : emptyState(
        'No runtime profile is bound.',
        'Qualified profiles are locked. Editing begins by cloning to a new unqualified version.',
      )}
      <div class="engineering-actions" data-empirical-scenario-actions>
        <button type="button" class="button button--secondary" data-empirical-clone-profile
          ${proposal ? '' : 'disabled'}>Clone profile</button>
        <button type="button" class="button button--secondary" data-empirical-authorize
          ${snapshot.state === 'DRAFT_READY' ? '' : 'disabled'}>Authorize scenario</button>
        <button type="button" class="button button--primary" data-empirical-calculate
          ${snapshot.calculationEligible ? '' : 'disabled'}>Calculate empirical method</button>
      </div>
    </section>
  `;
}

export function renderEmpiricalScenarioResults(container, state) {
  if (!container) return;
  const { execution, snapshot, selectedEntityId } = normalizeState(state);
  const core = execution?.coreResult || null;
  const cases = core?.loadCases || [];
  container.innerHTML = `
    <section class="engineering-card" data-empirical-scenario-results>
      <div class="engineering-card__header">
        <div><p class="eyebrow">Separate result family</p><h3>Beam/contact results</h3></div>
        ${badge(core?.status || snapshot.state)}
      </div>
      ${cases.length ? cases.map((row) => resultCase(row, selectedEntityId)).join('') : emptyState(
        'No current empirical execution is available.',
        'Authorization and calculation are separate explicit actions. Stale results are not presented as current.',
      )}
    </section>
  `;
}

export function renderEmpiricalScenarioEvidence(container, state) {
  if (!container) return;
  const { snapshot, proposal, authorization, execution, overlaySnapshot } = normalizeState(state);
  const evidence = {
    snapshot,
    proposal: proposal ? {
      method: proposal.method,
      scenarioId: proposal.scenarioId,
      semanticHash: proposal.semanticHash,
      bindings: proposal.bindings,
      blockerCount: proposal.blockers.length,
      overrideJournal: proposal.overrideJournal,
    } : null,
    authorization,
    resultOverlay: overlaySnapshot,
    execution: execution ? {
      method: execution.method,
      executionId: execution.executionId,
      executedAt: execution.executedAt,
      semanticHash: execution.semanticHash,
      sourceLoadPrimitiveSetSemanticHash: execution.sourceLoadPrimitiveSetSemanticHash,
      adaptedLoadPrimitiveSetSemanticHash: execution.adaptedLoadPrimitiveSetSemanticHash,
      coreResultSemanticHash: execution.coreResult.semanticHash,
    } : null,
  };
  container.innerHTML = `
    <section class="engineering-card" data-empirical-scenario-evidence>
      <div class="engineering-card__header">
        <div><p class="eyebrow">Immutable trace</p><h3>Empirical evidence</h3></div>
        ${badge(snapshot.state)}
      </div>
      <pre class="json-trace"><code>${escapeHtml(JSON.stringify(evidence, null, 2))}</code></pre>
    </section>
  `;
}

export function renderEmpiricalScenarioModel3d(container, state) {
  if (!container) return;
  const { proposal } = normalizeState(state);
  const count = proposal?.adaptedRequest?.restraintOccurrences?.length || 0;
  container.innerHTML = `
    <section class="engineering-card" data-empirical-scenario-model-3d>
      <div class="engineering-card__header">
        <div><p class="eyebrow">Governed SJSON projection</p><h3>Model / 3D</h3></div>
        <span class="status-badge">${count} restraint overlays</span>
      </div>
      <p class="engineering-note">The existing SJSON viewport remains the geometry authority. This pane owns only disposable source-restraint, effective-override and result-overlay projections.</p>
      <button type="button" class="button button--secondary" data-empirical-open-sjson-viewport>Open governed SJSON viewport</button>
    </section>
  `;
}

function overviewConfigured(snapshot, proposal) {
  const request = proposal.adaptedRequest;
  return `
    <dl class="engineering-fact-grid">
      ${fact('Dataset', request.datasetId)}
      ${fact('Scenario', request.scenarioId)}
      ${fact('Method', request.method)}
      ${fact('Coordinate basis', request.coordinateFrame.sourceBasis)}
      ${fact('Vertical vector', vector(request.coordinateFrame.verticalUnitVector))}
      ${fact('Force convention', request.coordinateFrame.forceOutputConvention)}
      ${fact('Profile', `${proposal.runtimeProfile.profileId} v${proposal.runtimeProfile.profileVersion}`)}
      ${fact('Qualification', proposal.runtimeProfile.qualification)}
      ${fact('Locked', proposal.runtimeProfile.locked ? 'Yes' : 'No')}
      ${fact('Authorization state', snapshot.state)}
      ${fact('Overrides', proposal.overrideJournal.length)}
      ${fact('Blockers', proposal.blockers.length)}
    </dl>
    ${proposal.blockers.length ? blockerList(proposal.blockers) : '<p class="engineering-success">Scenario is ready for explicit authorization.</p>'}
  `;
}

function restraintRow(row, selectedEntityId) {
  const selected = rowMatchesEntity(row, selectedEntityId);
  return `<tr data-restraint-id="${escapeHtml(row.restraintId)}" data-support-site-id="${escapeHtml(row.supportSiteId)}" data-viewport-selected="${selected}"${selected ? ' class="engineering-table__row--selected"' : ''}>
    <td>${escapeHtml(row.supportSiteId)}</td>
    <td><button type="button" class="table-link" data-empirical-restraint-select="${escapeHtml(row.restraintId)}">${escapeHtml(row.restraintId)}</button></td>
    <td>${escapeHtml(row.sourceDirection || '—')}</td>
    <td>${escapeHtml(row.effectiveDirection || '—')}</td>
    <td>${escapeHtml(row.hostEntityId || '—')}</td>
    <td>${formatNullable(row.effectiveCapability?.gapMm, ' mm')}</td>
    <td>${formatNullable(row.effectiveCapability?.stiffnessNPerM, ' N/m')}</td>
    <td>${row.overrideId ? `${escapeHtml(row.overrideId)}<br><small>${escapeHtml(row.overrideReason || '')}</small>` : 'None'}</td>
    <td>${row.geometryChanged ? '<strong>Changed</strong>' : 'No'}</td>
  </tr>`;
}

function loadCaseRow(row, configuration) {
  return `<tr>
    <td><strong>${escapeHtml(row.loadCaseId)}</strong><br><small>${escapeHtml(row.label)}</small></td>
    <td>${escapeHtml(row.resultClass)}</td>
    <td>${yesNo(row.effects.weight)}</td>
    <td>${yesNo(row.effects.thermalStrain)}</td>
    <td>${yesNo(row.effects.pressureCompatibility)}</td>
    <td>${yesNo(row.effects.pressureStress)}</td>
    <td>${configuration ? escapeHtml(configurationText(configuration)) : 'Missing'}</td>
  </tr>`;
}

function methodCard(row, selectedMethod) {
  const selected = row.methodId === selectedMethod;
  return `<article class="method-card${selected ? ' method-card--selected' : ''}" data-method-id="${escapeHtml(row.methodId)}">
    <div class="method-card__header"><strong>${escapeHtml(row.methodId)}</strong>${selected ? '<span class="status-badge">Selected</span>' : ''}</div>
    <p>${escapeHtml(row.purpose)}</p>
    <dl>${fact('Runtime', row.runtimeStatus)}${fact('Qualification', row.qualificationStatus)}${fact('DOFs', row.qualifiedDofs.join(', '))}</dl>
  </article>`;
}

function profilePanel(snapshot, profile) {
  return `<div class="engineering-subcard" data-empirical-profile>
    <h4>Profile</h4>
    <dl class="engineering-fact-grid">
      ${fact('Identity', profile.profileId)}
      ${fact('Version', profile.profileVersion)}
      ${fact('Qualification', profile.qualification)}
      ${fact('Locked', profile.locked ? 'Yes' : 'No')}
      ${fact('Semantic hash', profile.semanticHash)}
      ${fact('Scenario state', snapshot.state)}
    </dl>
    <p class="engineering-note">A locked qualified profile is read-only. Cloning creates a new unlocked, unqualified version and does not change the authorized scenario.</p>
  </div>`;
}

function resultCase(row, selectedEntityId) {
  if (row.status === 'BLOCKED') {
    return `<article class="engineering-subcard"><h4>${escapeHtml(row.loadCaseId)} — blocked</h4>${blockerList(row.blockers || [])}</article>`;
  }
  return `<article class="engineering-subcard" data-result-load-case="${escapeHtml(row.loadCaseId)}">
    <div class="engineering-card__header"><h4>${escapeHtml(row.loadCaseId)}</h4><span class="status-badge">${escapeHtml(row.status)}</span></div>
    <div class="table-scroll"><table class="engineering-table">
      <thead><tr><th>Support</th><th>Restraint</th><th>State</th><th>FX</th><th>FY</th><th>FZ</th><th>MX</th><th>MY</th><th>MZ</th></tr></thead>
      <tbody>${(row.supportResults || []).map((result) => resultRow(result, selectedEntityId)).join('')}</tbody>
    </table></div>
  </article>`;
}

function resultRow(row, selectedEntityId) {
  const selected = rowMatchesEntity(row, selectedEntityId);
  const force = row.globalReaction?.forceN || {};
  const moment = row.globalReaction?.momentNm || {};
  return `<tr data-result-restraint-id="${escapeHtml(row.restraintId)}" data-viewport-selected="${selected}"${selected ? ' class="engineering-table__row--selected"' : ''}>
    <td>${escapeHtml(row.supportSiteId)}</td><td>${escapeHtml(row.restraintId)}</td>
    <td>${escapeHtml(row.contactState)}</td>
    <td>${number(force.x)}</td><td>${number(force.y)}</td><td>${number(force.z)}</td>
    <td>${number(moment.x)}</td><td>${number(moment.y)}</td><td>${number(moment.z)}</td>
  </tr>`;
}

function normalizeState(state) {
  return {
    snapshot: state?.snapshot || {
      state: 'NOT_CONFIGURED', calculationEligible: false, method: null,
    },
    proposal: state?.proposal || null,
    authorization: state?.authorization || null,
    execution: state?.execution || null,
    overlaySnapshot: state?.overlaySnapshot || null,
    selectedEntityId: state?.selectedEntityId || null,
  };
}

function rowMatchesEntity(row, selectedEntityId) {
  if (!selectedEntityId) return false;
  return row.hostEntityId === selectedEntityId
    || row.hostSourceEntityId === selectedEntityId
    || (row.sourceEntityIds || []).includes(selectedEntityId);
}

function combinationNotice(policy) {
  const separate = policy === 'SEPARATE_UNTIL_QUALIFIED';
  return `<p class="engineering-note${separate ? ' engineering-note--warning' : ''}">Combination policy: <strong>${escapeHtml(policy)}</strong>${separate ? ' — vertical and line-stop results must not be vector-combined.' : ''}</p>`;
}

function blockerList(rows) {
  return `<ul class="engineering-blocker-list">${rows.map((row) => `<li><strong>${escapeHtml(row.code)}</strong> — ${escapeHtml(row.message)} <small>${escapeHtml(row.scope || '')}</small></li>`).join('')}</ul>`;
}

function emptyState(title, message) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
}

function badge(value) {
  return `<span class="status-badge">${escapeHtml(value || 'UNKNOWN')}</span>`;
}

function fact(label, value) {
  return `<div><dt>${escapeHtml(String(label))}</dt><dd>${escapeHtml(String(value ?? '—'))}</dd></div>`;
}

function vector(values) {
  return Array.isArray(values) ? `[${values.map(number).join(', ')}]` : '—';
}

function configurationText(row) {
  const parts = [];
  if (row.weightPrimitiveCaseId) parts.push(`weight=${row.weightPrimitiveCaseId}`);
  if (row.referenceTemperatureC !== null) parts.push(`Tref=${row.referenceTemperatureC}°C`);
  if (row.analysisTemperatureC !== null) parts.push(`T=${row.analysisTemperatureC}°C`);
  return parts.join(', ') || 'No owned effects';
}

function yesNo(value) { return value ? 'Yes' : 'No'; }
function formatNullable(value, suffix) { return Number.isFinite(value) ? `${number(value)}${suffix}` : 'Rigid / none'; }
function number(value) { return Number.isFinite(value) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—'; }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}
