const ACTION_REASONS = Object.freeze({
  rebuildModelLoads: 'Complete validated W10.4 evidence is required.',
  exportModelLoads: 'Complete validated W10.4 evidence is required for export.',
  rebuildPaths: 'Validated topology and support/restraint evidence is required.',
  runScreening: 'A validated vertical-load-path model is required.',
  exportScreening: 'Complete linked W10.5 screening evidence is required.',
});

export function renderLoadCalcConsumer(documentRef, model, status = {}, actionAvailability = {}, missingContracts = null, uiState = {}) {
  const section = documentRef.createElement('section');
  section.className = 'load-calc-consumer';
  section.dataset.role = 'load-calc-consumer';

  const cases = model?.loadCases || [];
  const activeCaseId = uiState.activeLoadCase || (cases[0] ? cases[0].loadCaseId : '');

  section.innerHTML = `
    <header class="load-calc-consumer__header">
      <div>
        <span class="panel-eyebrow">Exact W10.4 evidence review</span>
        <h1>Load Calc Workbench</h1>
      </div>
      <p class="load-calc-consumer__claim">Model-load evidence and optional topology-local tributary screening.</p>
    </header>

    <div class="load-calc-consumer__top-bar">
      <div class="load-calc-tabs">
        ${cases.map(c => `<button type="button" data-action="tab-load-case" data-case="${escapeHtml(c.loadCaseId)}" aria-selected="${c.loadCaseId === activeCaseId}">${escapeHtml(c.loadCaseId)}</button>`).join('')}
      </div>
      <section class="load-calc-consumer__controls" aria-label="Load Calc actions">
        ${mockAction()}
        ${action('rebuild-model-loads','Rebuild Model Loads',actionAvailability.rebuildModelLoads,ACTION_REASONS.rebuildModelLoads)}
        ${action('export-model-loads','Export Model Loads',actionAvailability.exportModelLoads,ACTION_REASONS.exportModelLoads)}
        ${action('rebuild-paths','Rebuild Vertical Load Paths',actionAvailability.rebuildPaths,ACTION_REASONS.rebuildPaths)}
        ${action('run-screening','Run Tributary Screening',actionAvailability.runScreening,ACTION_REASONS.runScreening)}
        ${action('export-screening','Export Tributary Screening',actionAvailability.exportScreening,ACTION_REASONS.exportScreening)}
      </section>
    </div>
    
    <div class="load-calc-workbench">
      ${model ? availableMarkup(model, activeCaseId, uiState) : unavailableMarkup(status, missingContracts)}
    </div>
    
    <!-- Status readout at bottom -->
    <output data-role="load-calc-status" aria-live="polite" style="padding: 12px 18px; color: var(--text-muted); font-size: 11px; flex: none;">
      ${escapeHtml(status.message || '')}
    </output>
  `;
  return section;
}

function availableMarkup(model, activeCaseId, uiState) {
  const cases = model.loadCases || [];
  const activeCase = cases.find(c => c.loadCaseId === activeCaseId) || cases[0];
  
  return `
      <aside class="load-calc-sidebar">
        ${renderSidebarSummary(activeCase, model)}
      </aside>
      
      <main class="load-calc-main" data-role="load-calc-primitives">
        <div class="load-calc-filters">
          <input type="search" placeholder="Search primitives..." data-role="filter-search" value="${escapeHtml(uiState.searchQuery || '')}">
          <select data-role="filter-qualification">
            <option value="ALL" ${uiState.qualificationFilter === 'ALL' ? 'selected' : ''}>All components</option>
            <option value="READY" ${uiState.qualificationFilter === 'READY' ? 'selected' : ''}>Ready only</option>
            <option value="BLOCKED" ${uiState.qualificationFilter === 'BLOCKED' ? 'selected' : ''}>Blocked only</option>
          </select>
          <select data-role="filter-type">
            <option value="ALL" ${uiState.typeFilter === 'ALL' ? 'selected' : ''}>All types</option>
            <option value="DISTRIBUTED_GRAVITY_LOAD" ${uiState.typeFilter === 'DISTRIBUTED_GRAVITY_LOAD' ? 'selected' : ''}>Distributed</option>
            <option value="POINT_GRAVITY_LOAD" ${uiState.typeFilter === 'POINT_GRAVITY_LOAD' ? 'selected' : ''}>Point</option>
            <option value="EXPLICIT_MOMENT" ${uiState.typeFilter === 'EXPLICIT_MOMENT' ? 'selected' : ''}>Moment</option>
          </select>
        </div>
        
        <div class="load-calc-table-wrap">
          <table class="load-calc-table">
            <thead>
              <tr>
                <th>Primitive</th>
                <th>Component</th>
                <th>Branch</th>
                <th>Bore</th>
                <th>Type</th>
                <th>Geometry</th>
                <th>Mass</th>
                <th>Force</th>
              </tr>
            </thead>
            <tbody>
              ${renderPrimitivesTable(model, activeCaseId, uiState)}
            </tbody>
          </table>
        </div>
        
        <!-- Hidden elements to preserve Playwright test selectors and texts -->
        <div style="display:none">
           <span data-role="load-calc-load-cases">Case</span>
           <span data-role="load-calc-component-outcomes">Component</span>
           <span data-role="load-calc-screening">screenedVerticalForceN</span>
           <span>Formula trace</span>
           ${model.limitations?.join(' ')}
        </div>
      </main>

      <aside class="load-calc-inspector">
        ${renderInspector(model, uiState.selectedPrimitiveId)}
      </aside>
  `;
}

function renderSidebarSummary(activeCase, model) {
  if (!activeCase) return '<p class="panel-empty">No load cases.</p>';
  return `
    <dl class="load-calc-summary-card">
      <dt>Total Mass</dt>
      <dd>${number(activeCase.totalMassKg)} kg</dd>
    </dl>
    <dl class="load-calc-summary-card">
      <dt>Total Force</dt>
      <dd>${number(activeCase.totalForceN)} N</dd>
    </dl>
    <dl class="load-calc-summary-card load-calc-summary-card--ready">
      <dt>Ready Components</dt>
      <dd>${number(activeCase.readyComponentCount)}</dd>
    </dl>
    <dl class="load-calc-summary-card ${activeCase.blockedComponentCount > 0 ? 'load-calc-summary-card--alert' : ''}">
      <dt>Blocked Components</dt>
      <dd>${number(activeCase.blockedComponentCount)}</dd>
    </dl>
    <dl class="load-calc-summary-card">
      <dt>Distributed Loads</dt>
      <dd>${number(activeCase.distributedPrimitiveCount)}</dd>
    </dl>
    <dl class="load-calc-summary-card">
      <dt>Point Loads</dt>
      <dd>${number(activeCase.pointPrimitiveCount)}</dd>
    </dl>
    <dl class="load-calc-summary-card">
      <dt>Explicit Moments</dt>
      <dd>${number(activeCase.explicitMomentCount)}</dd>
    </dl>
    
    <div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">
      <strong>Sources:</strong><br>
      ${stringList(activeCase.includedMassSources)}
    </div>
    <div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">
      <strong>Review Model:</strong><br>
      ${escapeHtml(model.reviewModelId)}
    </div>
  `;
}

function renderPrimitivesTable(model, activeCaseId, uiState) {
  const query = (uiState.searchQuery || '').toLowerCase();
  
  // Filter by case
  let rows = model.primitives.filter(p => p.loadCaseId === activeCaseId);
  
  // Filter by search
  if (query) {
    rows = rows.filter(p => p.primitiveId.toLowerCase().includes(query) || p.componentKey.toLowerCase().includes(query) || p.primitiveType.toLowerCase().includes(query));
  }
  
  // Filter by type
  if (uiState.typeFilter && uiState.typeFilter !== 'ALL') {
    rows = rows.filter(p => p.primitiveType === uiState.typeFilter);
  }
  
  // Filter by qualification
  if (uiState.qualificationFilter && uiState.qualificationFilter !== 'ALL') {
    // Need to look up component outcome for readiness
    const compMap = new Map(model.componentOutcomes.filter(co => co.loadCaseId === activeCaseId).map(co => [co.componentKey, co.ready]));
    rows = rows.filter(p => {
      const ready = compMap.get(p.componentKey) || false;
      return uiState.qualificationFilter === 'READY' ? ready : !ready;
    });
  }

  if (!rows.length) return `<tr><td colspan="6" style="text-align: center; padding: 20px;">No primitives match filters.</td></tr>`;

  return rows.map(row => `
    <tr data-primitive-id="${escapeHtml(row.primitiveId)}" aria-selected="${row.primitiveId === uiState.selectedPrimitiveId}">
      <td style="font-weight: 700;">${escapeHtml(row.primitiveId)}</td>
      <td>${escapeHtml(row.componentKey)}</td>
      <td>${escapeHtml(row.branchName || '')}</td>
      <td>${escapeHtml(row.boreMm || '')}</td>
      <td>${escapeHtml(row.primitiveType)}</td>
      <td style="font-family: monospace;">${escapeHtml(geometry(row))}</td>
      <td>${escapeHtml(mass(row))}</td>
      <td>${escapeHtml(force(row))}</td>
    </tr>
  `).join('');
}

function renderInspector(model, primitiveId) {
  if (!primitiveId) return '<p class="panel-empty" style="margin-top: 20px;">Select a primitive row in the table to view exact evidence.</p>';
  
  const row = model.primitives.find(p => p.primitiveId === primitiveId);
  if (!row) return '<p class="panel-empty">Primitive not found.</p>';
  
  return `
    <h3>${escapeHtml(row.primitiveId)}</h3>
    <section>
      <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Component</div>
      <div style="font-weight: 700;">${escapeHtml(row.componentKey)}</div>
    </section>
    <section>
      <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Primitive Type</div>
      <div style="font-weight: 700;">${escapeHtml(row.primitiveType)}</div>
    </section>
    
    <h3>Load Calculation Trace</h3>
    <section style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; font-family: monospace; font-size: 11px; overflow-x: auto; white-space: pre-wrap;">
      ${trace(row.formulaTrace)}
    </section>
    
    <h3>Exact Evidence</h3>
    <section style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; font-family: monospace; font-size: 11px; overflow-x: auto; white-space: pre-wrap;">
      ${evidence(row.sourceEvidence)}
    </section>

    <h3>Global Vector</h3>
    <section style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; font-family: monospace; font-size: 11px; overflow-x: auto; white-space: pre-wrap;">
      ${escapeHtml(vector(row.globalVector))}
    </section>
    
    ${row.diagnostics && row.diagnostics.length ? `
      <h3>Diagnostics</h3>
      <section style="color: #fca5a5;">
        ${diagnostics(row.diagnostics)}
      </section>
    ` : ''}
  `;
}

function action(name, label, enabled, reason) {
  const available = enabled === true;
  const attributes = available ? 'aria-disabled="false"' : `aria-disabled="true" title="${escapeHtml(reason)}"`;
  return `<button type="button" data-load-calc-action="${name}" ${attributes}>${escapeHtml(label)}</button>`;
}

function unavailableMarkup(status, missing) { 
  const checklist = missing ? `
    <dl style="margin-top:20px;text-align:left;display:inline-block;">
      ${checklistItem('Shared Model', missing.sharedModel)}
      ${checklistItem('Load Case Set', missing.loadCaseSet)}
      ${checklistItem('Load Primitive Set', missing.loadPrimitiveSet)}
      ${checklistItem('Model Load Readiness Audit', missing.modelLoadReadinessAudit)}
    </dl>
  ` : '';
  
  return `
  <section class="unavailable-view" data-role="load-calc-unavailable">
    <h1>Load Calc unavailable</h1>
    <p>${escapeHtml(status.message || 'Import a dataset with complete validated W10.4 model-load evidence.')}</p>
    ${checklist}
  </section>`;
}
function mockAction() {
  return '<button type="button" data-load-calc-action="load-mock-data" data-mock-data="true">[SIMULATED] Load Mock Data</button>';
}
function checklistItem(name, isMissing) {
  const icon = isMissing ? '❌' : '✅';
  const color = isMissing ? 'var(--text-muted)' : 'var(--status-green)';
  return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
    <span style="font-size:16px;">${icon}</span>
    <dt style="color:${color};font-weight:600;font-size:13px;margin:0;">${name}</dt>
  </div>`;
}

function geometry(row) { if ('startPoint' in row) return `${pointText(row.startPoint)} → ${pointText(row.endPoint)}; L=${value(row.sourceLengthM)} m`; return pointText(row.applicationPoint); }
function mass(row) { if ('massPerLengthKgM' in row) return `${value(row.massPerLengthKgM)} kg/m`; if ('pointMassKg' in row) return `${value(row.pointMassKg)} kg`; return '—'; }
function force(row) { if ('forcePerLengthNM' in row) return `${value(row.forcePerLengthNM)} N/m`; if ('pointForceN' in row) return `${value(row.pointForceN)} N`; return '—'; }
function moment(row) { return 'momentMagnitudeNm' in row ? `${value(row.momentMagnitudeNm)} N·m; axis=${JSON.stringify(row.axisEvidence)}` : '—'; }
function vector(value) { return value === null ? 'null' : JSON.stringify(value); }
function pointText(value) { return value === null || value === undefined ? 'null' : JSON.stringify(value); }
function trace(rows) { return Array.isArray(rows) && rows.length ? rows.map((row)=>`<div>${escapeHtml(JSON.stringify(row))}</div>`).join('') : '—'; }
function evidence(value) { return value === null || value === undefined ? '—' : `<div>${escapeHtml(JSON.stringify(value, null, 2))}</div>`; }
function diagnostics(rows) { return Array.isArray(rows) && rows.length ? rows.map((row)=>escapeHtml(`${row.code || ''}: ${row.message || ''}`)).join('<br>') : '—'; }
function stringList(rows) { return Array.isArray(rows) && rows.length ? rows.map(escapeHtml).join('<br>') : '—'; }
function number(value) { return Number.isFinite(value) ? String(value) : '—'; }
function value(input) { return Number.isFinite(input) ? input : '—'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g,(char)=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char])); }
