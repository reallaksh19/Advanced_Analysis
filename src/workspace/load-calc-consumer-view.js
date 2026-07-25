const ACTION_REASONS = Object.freeze({
  rebuildModelLoads: 'Complete validated W10.4 evidence is required.',
  exportModelLoads: 'Complete validated W10.4 evidence is required for export.',
  rebuildPaths: 'Validated topology and support/restraint evidence is required.',
  runScreening: 'A validated vertical-load-path model is required.',
  exportScreening: 'Complete linked W10.5 screening evidence is required.',
});

export function renderLoadCalcConsumer(documentRef, model, status = {}, actionAvailability = {}, missingContracts = null) {
  const section = documentRef.createElement('section');
  section.className = 'load-calc-consumer';
  section.dataset.role = 'load-calc-consumer';
  section.innerHTML = model ? availableMarkup(model, status, actionAvailability) : unavailableMarkup(status, missingContracts);
  return section;
}

function availableMarkup(model, status, availability) {
  return `
    <header class="load-calc-consumer__header">
      <div><span class="panel-eyebrow">Exact W10.4 evidence review</span><h1>Load Calc</h1></div>
      <p class="load-calc-consumer__claim">Model-load evidence and optional topology-local tributary screening only.</p>
    </header>
    <section class="load-calc-consumer__controls" aria-label="Load Calc actions">
      ${mockAction()}
      ${action('rebuild-model-loads','Rebuild Model Loads',availability.rebuildModelLoads,ACTION_REASONS.rebuildModelLoads)}
      ${action('export-model-loads','Export Model Loads',availability.exportModelLoads,ACTION_REASONS.exportModelLoads)}
      ${action('rebuild-paths','Rebuild Vertical Load Paths',availability.rebuildPaths,ACTION_REASONS.rebuildPaths)}
      ${action('run-screening','Run Tributary Screening',availability.runScreening,ACTION_REASONS.runScreening)}
      ${action('export-screening','Export Tributary Screening',availability.exportScreening,ACTION_REASONS.exportScreening)}
      <output data-role="load-calc-status" aria-live="polite">${escapeHtml(status.message || '')}</output>
    </section>
    ${identitySection(model)}
    ${sourceSection(model.sourceReferences)}
    ${profileSection(model.assumptions)}
    ${loadCaseSection(model.loadCases)}
    ${outcomeSection(model.componentOutcomes)}
    ${primitiveSection(model.primitives)}
    ${screeningSection(model.screeningSummary)}
    ${listSection('Engineering limitations', model.limitations, 'load-calc-limitations')}
    ${diagnosticSection(model.diagnostics)}
  `;
}

function identitySection(model) {
  return card('Review identity', 'load-calc-identity', definitionList([
    ['Dataset ID',model.datasetId],
    ['Review model ID',model.reviewModelId],
    ['Context semantic hash',model.contextSemanticHash],
    ['Load cases',model.summary.loadCaseCount],
    ['Ready cases',model.summary.readyLoadCaseCount],
    ['Blocked cases',model.summary.blockedLoadCaseCount],
    ['Primitive count',model.summary.primitiveCount],
    ['Optional screening',model.summary.screeningIncluded ? 'Included' : 'Not included'],
  ]));
}

function sourceSection(references) {
  return card('Exact source semantic hashes','load-calc-source-references',definitionList(Object.entries(references)));
}

function profileSection(rows) {
  const body = rows.map((row)=>`<tr><td>${escapeHtml(row.evidenceType)}</td><td>${escapeHtml(row.schema)}</td><td>${escapeHtml(row.profileId)}</td><td>${escapeHtml(row.profileVersion)}</td><td>${escapeHtml(row.semanticHash)}</td></tr>`).join('');
  return tableCard('Embedded W10.4 profile evidence','load-calc-profiles',['Evidence','Schema','Profile','Version','Semantic hash'],body);
}

function loadCaseSection(rows) {
  const body = rows.map((row)=>`<tr>
    <td>${escapeHtml(row.loadCaseId)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.caseType)}</td><td>${escapeHtml(row.qualification)}</td>
    <td>${number(row.readyComponentCount)}</td><td>${number(row.blockedComponentCount)}</td><td>${number(row.distributedPrimitiveCount)}</td><td>${number(row.pointPrimitiveCount)}</td><td>${number(row.explicitMomentCount)}</td>
    <td>${number(row.totalMassKg)}</td><td>${number(row.totalForceN)}</td><td>${stringList(row.includedMassSources)}</td><td>${stringList(row.excludedMassSources)}</td><td>${stringList(row.blockers)}</td><td>${diagnostics(row.diagnostics)}</td>
  </tr>`).join('');
  return tableCard('Load cases — EMPTY / OPE / HYD','load-calc-load-cases',['Case','Name','Type','Qualification','Ready components','Blocked components','Distributed','Point','Explicit moments','Total mass kg','Total force N','Included mass sources','Excluded mass sources','Blockers','Diagnostics'],body);
}

function outcomeSection(rows) {
  const body = rows.map((row)=>`<tr><td>${escapeHtml(row.loadCaseId)}</td><td>${escapeHtml(row.componentKey)}</td><td>${row.ready?'READY':'BLOCKED'}</td><td>${escapeHtml(row.mode ?? '—')}</td><td>${stringList(row.blockers)}</td><td>${diagnostics(row.diagnostics)}</td></tr>`).join('');
  return tableCard('Component outcomes','load-calc-component-outcomes',['Case','Component','Outcome','Mode','Blockers','Diagnostics'],body);
}

function primitiveSection(rows) {
  const body = rows.map((row)=>`<tr>
    <td>${escapeHtml(row.primitiveId)}</td><td>${escapeHtml(row.loadCaseId)}</td><td>${escapeHtml(row.componentKey)}</td><td>${escapeHtml(row.primitiveType)}</td>
    <td>${escapeHtml(geometry(row))}</td><td>${escapeHtml(mass(row))}</td><td>${escapeHtml(force(row))}</td><td>${escapeHtml(moment(row))}</td><td>${escapeHtml(vector(row.globalVector))}</td><td>${trace(row.formulaTrace)}</td><td>${evidence(row.sourceEvidence)}</td><td>${diagnostics(row.diagnostics)}</td>
  </tr>`).join('');
  return tableCard('Primitive evidence','load-calc-primitives',['Primitive','Case','Component','Type','Geometry/application','Mass evidence','Force evidence','Moment evidence','globalVector','Formula trace','Source evidence','Diagnostics'],body);
}

function screeningSection(rows) {
  if (!rows.length) return card('Topology-local tributary screening','load-calc-screening','<p class="panel-empty">No complete linked W10.5 screening evidence is included.</p>');
  const body = rows.map((row)=>`<tr><td>${escapeHtml(row.pathId)}</td><td>${escapeHtml(row.loadCaseId)}</td><td>${escapeHtml(row.qualification)}</td><td>${number(row.screenedAppliedForceN)}</td><td>${number(row.screenedSupportForceN)}</td><td>${number(row.forceResidualN)}</td><td>${number(row.relativeResidual)}</td><td>${number(row.supportCount)}</td><td>${number(row.spanCount)}</td><td>${stringList(row.blockers)}</td><td>${diagnostics(row.diagnostics)}</td></tr>`).join('');
  return tableCard('Topology-local tributary screening','load-calc-screening',['Path','Case','Qualification','Applied force N','screenedVerticalForceN total','Force residual N','Relative residual','Supports','Spans','Blockers','Diagnostics'],body);
}

function diagnosticSection(rows) {
  const body = rows.map((row)=>`<tr><td>${escapeHtml(row.code)}</td><td>${escapeHtml(row.severity)}</td><td>${escapeHtml(row.scope)}</td><td>${escapeHtml(row.message)}</td></tr>`).join('');
  return tableCard('Review diagnostics','load-calc-diagnostics',['Code','Severity','Scope','Message'],body);
}

function listSection(title, rows, role) {
  const content = rows.length ? `<ul>${rows.map((row)=>`<li>${escapeHtml(row)}</li>`).join('')}</ul>` : '<p class="panel-empty">None recorded.</p>';
  return card(title,role,content);
}
function card(title, role, content) { return `<section class="load-calc-card" data-role="${role}"><h2>${escapeHtml(title)}</h2>${content}</section>`; }
function tableCard(title, role, headings, body) {
  const rows = body || `<tr><td colspan="${headings.length}">No evidence recorded.</td></tr>`;
  return card(title,role,`<div class="load-calc-table-wrap"><table><thead><tr>${headings.map((item)=>`<th scope="col">${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`);
}
function definitionList(rows) { return `<dl>${rows.map(([key,value])=>`<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value ?? '—')}</dd></div>`).join('')}</dl>`; }
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
  
  return `<header class="load-calc-consumer__header"><div><span class="panel-eyebrow">Exact W10.4 evidence review</span><h1>Load Calc</h1></div></header>
  <section class="unavailable-view" data-role="load-calc-unavailable">
    <h1>Load Calc unavailable</h1>
    <p>${escapeHtml(status.message || 'Import a dataset with complete validated W10.4 model-load evidence.')}</p>
    ${mockAction()}
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
function trace(rows) { return Array.isArray(rows) && rows.length ? rows.map((row)=>`<code>${escapeHtml(JSON.stringify(row))}</code>`).join('<br>') : '—'; }
function evidence(value) { return value === null || value === undefined ? '—' : `<code>${escapeHtml(JSON.stringify(value))}</code>`; }
function diagnostics(rows) { return Array.isArray(rows) && rows.length ? rows.map((row)=>escapeHtml(`${row.code || ''}: ${row.message || ''}`)).join('<br>') : '—'; }
function stringList(rows) { return Array.isArray(rows) && rows.length ? rows.map(escapeHtml).join('<br>') : '—'; }
function number(value) { return Number.isFinite(value) ? String(value) : '—'; }
function value(input) { return Number.isFinite(input) ? input : '—'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g,(char)=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char])); }
