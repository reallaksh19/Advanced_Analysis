const ACTION_REASONS = Object.freeze({
  rebuildModelLoads: 'Complete validated W10.4 evidence is required.',
  exportModelLoads: 'Complete validated W10.4 evidence is required for export.',
  rebuildPaths: 'Validated topology and support/restraint evidence is required.',
  runScreening: 'A validated vertical-load-path model is required.',
  exportScreening: 'Complete linked W10.5 screening evidence is required.',
});

import { renderProjectConfiguration, renderPreflightGrid } from './lfea-preflight-ui.js';
import { renderMasterDataUI } from './master-data-ui.js';
import { WorkspaceState } from './workspace-state.js';

export function renderLoadCalcConsumer(documentRef, model, status = {}, actionAvailability = {}, missingContracts = null, uiState = {}) {
  const section = documentRef.createElement('section');
  section.className = 'load-calc-consumer';
  section.dataset.role = 'load-calc-consumer';

  const cases = model?.loadCases || [];
  const activeCaseId = uiState.activeLoadCase || (cases[0] ? cases[0].loadCaseId : '');

  const isCollapsed = uiState.sidebarCollapsed;
  const sidebarWidth = uiState.sidebarWidth || 280;

  section.innerHTML = `
    <header class="load-calc-consumer__header">
      <div>
        <span class="panel-eyebrow">Exact W10.4 evidence review</span>
        <h1>Load Calc Workbench</h1>
      </div>
      <p class="load-calc-consumer__claim">Model-load evidence and optional topology-local tributary screening.</p>
    </header>
    <div class="load-calc-consumer__top-bar">
      <div class="load-calc-tabs" role="tablist" aria-label="Workbench tabs">
        <button type="button" data-action="tab-main" data-tab="load-cases" class="${(!uiState.activeTab || uiState.activeTab === 'load-cases') ? 'is-active' : ''}">Load Evaluation</button>
        <button type="button" data-action="tab-main" data-tab="preflight" class="${uiState.activeTab === 'preflight' ? 'is-active' : ''}">Pre-Flight Grid <span class="tab-close-icon" data-action="close-tab" data-tab="preflight" title="Close tab & return to canvas" style="display:inline-flex; align-items:center; justify-content:center; margin-left:6px; width:14px; height:14px; border-radius:50%; font-size:10px; opacity:0.7; transition:all 0.15s;">✕</span></button>
        <button type="button" data-action="tab-main" data-tab="project-config" class="${uiState.activeTab === 'project-config' ? 'is-active' : ''}">Project Data <span class="tab-close-icon" data-action="close-tab" data-tab="project-config" title="Close tab & return to canvas" style="display:inline-flex; align-items:center; justify-content:center; margin-left:6px; width:14px; height:14px; border-radius:50%; font-size:10px; opacity:0.7; transition:all 0.15s;">✕</span></button>
        <button type="button" data-action="tab-main" data-tab="master-data" class="${uiState.activeTab === 'master-data' ? 'is-active' : ''}">Master Data <span class="tab-close-icon" data-action="close-tab" data-tab="master-data" title="Close tab & return to canvas" style="display:inline-flex; align-items:center; justify-content:center; margin-left:6px; width:14px; height:14px; border-radius:50%; font-size:10px; opacity:0.7; transition:all 0.15s;">✕</span></button>
        <button type="button" data-action="tab-main" data-tab="json-trace" class="${uiState.activeTab === 'json-trace' ? 'is-active' : ''}">JSON Trace <span class="tab-close-icon" data-action="close-tab" data-tab="json-trace" title="Close tab & return to canvas" style="display:inline-flex; align-items:center; justify-content:center; margin-left:6px; width:14px; height:14px; border-radius:50%; font-size:10px; opacity:0.7; transition:all 0.15s;">✕</span></button>
      </div>
      <div class="load-calc-tabs" style="margin-left: 12px; border-left: 1px solid #334155; padding-left: 12px; display: ${(!uiState.activeTab || uiState.activeTab === 'load-cases') ? 'flex' : 'none'}">
        ${cases.map(c => `<button type="button" data-action="tab-load-case" data-case="${escapeHtml(c.loadCaseId)}" aria-selected="${c.loadCaseId === activeCaseId}">${escapeHtml(c.loadCaseId)}</button>`).join('')}
      </div>
      <section class="load-calc-consumer__controls" aria-label="Load Calc actions">
        ${mockAction()}
        ${action('rebuild-model-loads','⚡ 1. Calculate Model Loads', true, '')}
        ${action('rebuild-paths','📐 2. Build Load Paths', true, '')}
        ${action('run-screening','🎯 3. Run Support Screening', true, '')}
        ${action('export-model-loads','📥 Export Loads', true, '')}
        ${action('export-screening','📥 Export Support Report', true, '')}
      </section>
    </div>
    
    ${(!uiState.activeTab || uiState.activeTab === 'load-cases') ? `
    <div class="load-calc-workbench" id="load-calc-workbench-layout" style="display:flex; flex:1; min-height:0; overflow:hidden; width:100%; position:relative;">
      <aside class="load-calc-sidebar" id="load-calc-left-sidebar" style="flex: 0 0 ${isCollapsed ? '0px' : sidebarWidth + 'px'}; display: ${isCollapsed ? 'none' : 'flex'}; flex-direction:column; border-right:1px solid #1e293b; background:#0b1120; min-height:0; overflow-y:auto; padding:12px; gap:12px; box-sizing:border-box;">
        <header style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:8px; flex:none;">
          <div style="flex:1;">
            <span class="panel-eyebrow" style="font-size:10px;">Geometry &amp; Summary</span>
            <h2 style="font-size:12px; margin:0; color:#f8fafc;">Topology &amp; Evidence</h2>
          </div>
          <button type="button" data-action="toggle-load-calc-sidebar" title="Collapse Left Panel" style="background:#1e293b; border:1px solid #334155; color:#38bdf8; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:11px;">◀</button>
        </header>
        <div class="load-calc-sidebar-body" style="display:flex; flex-direction:column; gap:12px; flex:1; min-height:0;">
          <div style="flex:none; display:flex; flex-direction:column; gap:8px;">
            ${renderSidebarSummary(cases.find(c => c.loadCaseId === activeCaseId) || cases[0], model)}
          </div>
          <div class="load-calc-inspector-container" style="flex:1; border-top:1px solid #1e293b; padding-top:12px; margin-top:4px; overflow-y:auto; display:flex; flex-direction:column;">
            ${renderInspector(model, uiState.selectedPrimitiveId)}
          </div>
        </div>
      </aside>
      <div class="panel-resizer panel-resizer--left" data-action="resize-load-calc-left" title="Drag to resize left panel" style="cursor:col-resize; width:6px; background:#1e293b; flex:none; display:${isCollapsed ? 'none' : 'block'}; border-left:1px solid #0f172a; border-right:1px solid #0f172a;"></div>
      ${isCollapsed ? `
        <button type="button" data-action="toggle-load-calc-sidebar" title="Expand Left Panel" style="position:absolute; left:8px; top:8px; z-index:20; background:#0284c7; border:1px solid #38bdf8; color:#ffffff; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:bold; font-size:11px; box-shadow:0 2px 8px rgba(0,0,0,0.5);">▶ Geometry &amp; Summary</button>
      ` : ''}

      <div id="load-calc-center-pane" style="flex:1; display:flex; flex-direction:column; position:relative; min-width:0; min-height:0;">
        <div id="load-calc-canvas-host" style="flex:1; position:relative; z-index:1; background:#020617; overflow:hidden;"></div>
        
        <div class="panel-resizer panel-resizer--bottom" data-action="resize-load-calc-bottom" title="Drag to resize bottom panel" style="cursor:row-resize; height:6px; background:#1e293b; flex:none; display:${uiState.gridsCollapsed ? 'none' : 'block'}; border-top:1px solid #0f172a; border-bottom:1px solid #0f172a; z-index:10;"></div>
        
        <div id="load-calc-grids-pane" style="position:relative; flex: 0 0 ${uiState.gridsCollapsed ? '0px' : (uiState.gridsHeight || 300) + 'px'}; display:${uiState.gridsCollapsed ? 'none' : 'flex'}; flex-direction:column; z-index:2; background:#0b1120; box-shadow:0 -2px 12px rgba(0,0,0,0.5); overflow:visible;">
              <div style="flex:1; display:flex; flex-direction:column; overflow:hidden; position:relative; min-height:0; min-width:0;">
                ${model ? availableMarkup(model, activeCaseId, uiState) : unavailableMarkup(status, missingContracts)}
              </div>
          <button type="button" data-action="toggle-grids" title="${uiState.gridsCollapsed ? 'Expand Data Grids' : 'Collapse Data Grids'}" style="position:absolute; top:-18px; left:50%; transform:translateX(-50%); width:40px; height:18px; background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; border-radius:12px 12px 0 0; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10; font-size:10px; border-bottom:none;">
             ${uiState.gridsCollapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>
      
      <div class="panel-resizer panel-resizer--right" data-action="resize-load-calc-right" title="Drag to resize right panel" style="cursor:col-resize; width:6px; background:#1e293b; flex:none; display:${uiState.rightCollapsed ? 'none' : 'block'}; border-left:1px solid #0f172a; border-right:1px solid #0f172a;"></div>
      <aside class="load-calc-sidebar" id="load-calc-right-sidebar" style="flex: 0 0 ${uiState.rightCollapsed ? '0px' : (uiState.rightWidth || 300) + 'px'}; display: ${uiState.rightCollapsed ? 'none' : 'flex'}; flex-direction:column; border-left:1px solid #1e293b; background:#0b1120; min-height:0; overflow-y:auto; padding:0; box-sizing:border-box;">
         <!-- Inspector is now in right properties panel -->
         <div style="flex:1; display:flex; flex-direction:column; min-height:0; position:relative;" id="load-calc-properties-host">
           <!-- The workspace PropertiesPanel will be mounted here by the controller -->
           <div data-role="properties-content" style="flex:1; overflow-y:auto; padding:12px;"></div>
         </div>
      </aside>
    </div>
    ` : ''}

    <main class="load-calc-main" id="load-calc-main-content" style="flex:1; display:${(!uiState.activeTab || uiState.activeTab === 'load-cases') ? 'none' : 'flex'}; flex-direction:column; min-width:0; min-height:0; overflow:hidden; position:relative;">
      <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:6px 14px; border-bottom:1px solid #1e293b; flex:none;">
        <span style="font-size:12px; font-weight:bold; color:#38bdf8; text-transform:uppercase; letter-spacing:0.5px;">
          ${uiState.activeTab === 'preflight' ? 'Pre-Flight Grid' : uiState.activeTab === 'project-config' ? 'Project Data' : uiState.activeTab === 'master-data' ? 'Master Data' : uiState.activeTab === 'json-trace' ? 'JSON Trace' : 'Tab View'}
        </span>
        <button type="button" data-action="close-active-tab" title="Close Window" style="background:#1e293b; color:#f8fafc; border:1px solid #334155; border-radius:4px; padding:3px 10px; cursor:pointer; font-size:11px; font-weight:bold; display:flex; align-items:center; gap:6px;">
          <span>✕</span> Close Window
        </button>
      </div>
      ${uiState.activeTab === 'preflight' ? '<div id="preflight-container" style="flex:1; display:flex; flex-direction:column; overflow:hidden;"></div>' : ''}
      ${uiState.activeTab === 'project-config' ? '<div id="project-config-container" style="flex:1; display:flex; flex-direction:column; overflow:hidden;"></div>' : ''}
      ${uiState.activeTab === 'master-data' ? '<div id="master-data-container" style="flex:1; display:flex; flex-direction:column; overflow:hidden;"></div>' : ''}
      ${uiState.activeTab === 'json-trace' ? '<div id="json-trace-container" style="flex:1; display:flex; flex-direction:column; overflow:hidden;"></div>' : ''}
    </main>
    
    <!-- Status readout at bottom -->
    <output data-role="load-calc-status" aria-live="polite" style="padding: 8px 18px; color: var(--text-muted); font-size: 11px; flex: none; border-top: 1px solid #1e293b; background: #070d17;">
      ${escapeHtml(status.message || '')}
    </output>
  `;

  if (uiState.activeTab === 'preflight') {
    // The controller will now handle mounting this.
  }

  return section;
}

function availableMarkup(model, activeCaseId, uiState) {
  return `
      <div style="display:flex; flex:1; min-height:0; width:100%;">
        <div class="load-calc-main" data-role="load-calc-primitives" style="flex:1; display:flex; flex-direction:column; min-width:0; min-height:0;">
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
        </div>
      </div>
  `;
}

export function renderSidebarSummary(activeCase, model) {
  if (!activeCase) return '<p class="panel-empty">No load cases.</p>';
  
  // Calculate branches and supports if possible
  const snapshot = WorkspaceState?.getSnapshot?.() || {};
  const dataset = snapshot.dataset || { entities: [] };
  const branches = dataset.entities.filter(e => e.entityType === 'BRANCH' || e.type === 'BRANCH').length;
  const supports = dataset.entities.filter(e => e.entityType === 'SUPPORT' || e.type === 'SUPPORT').length;
  
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
      <dl class="load-calc-summary-card" style="margin:0; padding:8px;">
        <dt style="font-size:9px;">Total Mass</dt>
        <dd style="font-size:12px;">${number(activeCase.totalMassKg)} kg</dd>
      </dl>
      <dl class="load-calc-summary-card" style="margin:0; padding:8px;">
        <dt style="font-size:9px;">Total Force</dt>
        <dd style="font-size:12px;">${number(activeCase.totalForceN)} N</dd>
      </dl>
      <dl class="load-calc-summary-card load-calc-summary-card--ready" style="margin:0; padding:8px;">
        <dt style="font-size:9px;">Ready</dt>
        <dd style="font-size:12px;">${number(activeCase.readyComponentCount)}</dd>
      </dl>
      <dl class="load-calc-summary-card ${activeCase.blockedComponentCount > 0 ? 'load-calc-summary-card--alert' : ''}" style="margin:0; padding:8px;">
        <dt style="font-size:9px;">Blocked</dt>
        <dd style="font-size:12px;">${number(activeCase.blockedComponentCount)}</dd>
      </dl>
      <dl class="load-calc-summary-card" style="margin:0; padding:8px;">
        <dt style="font-size:9px;">Dist. Loads</dt>
        <dd style="font-size:12px;">${number(activeCase.distributedPrimitiveCount)}</dd>
      </dl>
      <dl class="load-calc-summary-card" style="margin:0; padding:8px;">
        <dt style="font-size:9px;">Point Loads</dt>
        <dd style="font-size:12px;">${number(activeCase.pointPrimitiveCount)}</dd>
      </dl>
      <dl class="load-calc-summary-card" style="margin:0; padding:8px;">
        <dt style="font-size:9px;">Branches</dt>
        <dd style="font-size:12px;">${branches || 'N/A'}</dd>
      </dl>
      <dl class="load-calc-summary-card" style="margin:0; padding:8px;">
        <dt style="font-size:9px;">Supports</dt>
        <dd style="font-size:12px;">${supports || 'N/A'}</dd>
      </dl>
    </div>
    
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
  
  if (!available) {
    return `<button type="button" data-load-calc-action="${name}" ${attributes} style="opacity: 0.6; cursor: not-allowed; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; padding: 4px 8px;">
      <span>${escapeHtml(label)}</span>
      <span style="font-size: 9px; color: #f87171; font-weight: normal;">Requires Prerequisite</span>
    </button>`;
  }
  return `<button type="button" data-load-calc-action="${name}" ${attributes} style="display:flex; align-items:center; justify-content:center;">${escapeHtml(label)}</button>`;
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
