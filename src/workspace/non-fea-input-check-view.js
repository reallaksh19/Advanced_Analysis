import { engineeringModelStore } from './engineering-model-store.js';
import { masterDataController } from './master-data-controller.js';
import { createCurrentNonFeaWorkspaceStatusProjection } from './non-fea-analysis-plan-runtime.js';
import { nonFeaCommonInputStore } from './non-fea-common-input-store.js';
import { nonFeaEnrichmentStore } from './enrichment/non-fea-enrichment-store.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { WorkspaceState } from './workspace-state.js';

const METHOD_ROWS = Object.freeze([
  ['WEIGHT_AND_GRAVITY', 'Weight & gravity'],
  ['SUSTAINED_REACTIONS', 'Sustained reactions'],
  ['SUSTAINED_MEMBER_ACTIONS', 'Sustained member actions'],
  ['SUSTAINED_STRESS', 'Sustained stress'],
  ['THERMAL_FREE_DISPLACEMENT', 'Thermal free displacement'],
  ['RESTRAINT_REACTIONS', 'Restraint reactions'],
  ['VERTICAL_CONTACT', 'Vertical contact'],
  ['COMBINED_OPERATING_REACTION', 'Combined operating reaction'],
  ['ENRICHED_STAGED_JSON_EXPORT', 'Enriched staged JSON export'],
]);

const GATE_LABELS = Object.freeze({
  A_SOURCE_MODEL: 'Source model and normalization',
  B_TOPOLOGY_POS: 'Topology and exact attachments',
  C_PROJECT_BASIS: 'Project basis',
  D_MASTER_AUTHORITY: 'Master authority',
  E_ENRICHMENT: 'Enrichment and overrides',
  F_METHOD_READINESS: 'Method readiness',
  G_QUALIFICATION: 'Qualification',
  H_SEAL_EXPORT: 'Seal and export',
});

/**
 * Renders one read-only view of current Non-FEA Load Calc status.
 *
 * Engineering values, field resolution, checker evaluation, sealing,
 * authorization and execution remain owned by their existing contracts/stores.
 * This view only presents the canonical workspace-status projection plus
 * observational source evidence.
 */
export function renderNonFeaInputCheckView(container, consumerContext, prepared = {}) {
  if (!container) throw new TypeError('Non-FEA Input Check requires a container.');
  const state = createViewState(consumerContext, prepared);
  container.innerHTML = `${styles()}${viewMarkup(state)}`;
  container.dataset.state = state.overallState;
  container.dataset.workspaceStatusSemanticHash = state.status.semanticHash;
  return state;
}

export function createNonFeaInputCheckViewState(consumerContext, prepared = {}) {
  return createViewState(consumerContext, prepared);
}

function createViewState(consumerContext, prepared) {
  const workspace = WorkspaceState.getSnapshot() || {};
  const dataset = workspace.status === 'ready' ? workspace.dataset ?? null : null;
  const masters = masterDataController.getMasterData();
  const projectProfile = projectDataStore.getProfile();
  const projectOrigin = projectDataStore.getOrigin();
  const supportSites = engineeringModelStore.getSupportSiteModel();
  const routes = engineeringModelStore.getRoutePartitionModel();
  const hashes = activeHashes(dataset, masters);
  const audits = Object.freeze({
    normalization: projectDataStore.validate('normalization', hashes),
    topology: projectDataStore.validate('topology', hashes),
    loads: projectDataStore.validate('loads', hashes),
  });
  const status = prepared.status || createCurrentNonFeaWorkspaceStatusProjection();
  const commonSnapshot = prepared.commonSnapshot || nonFeaCommonInputStore.getSnapshot();
  const enrichmentState = prepared.enrichmentState || fallbackEnrichmentState(nonFeaEnrichmentStore.getSnapshot());
  const masterRows = masterSummary(masters);

  return Object.freeze({
    overallState: status.overallState,
    lifecycleState: status.lifecycleState,
    status,
    dataset,
    gates: Object.freeze(status.gates.map((row) => Object.freeze({
      ...row,
      label: GATE_LABELS[row.gateId] || row.gateId,
    }))),
    blockers: status.blockers,
    methodRows: Object.freeze(buildMethodRows(status.commonInput.methodRows)),
    masterRows: Object.freeze(masterRows),
    sourceRows: Object.freeze(sourceEvidenceRows({ dataset, masters, supportSites, routes, consumerContext })),
    routeRows: Object.freeze(routeEvidenceRows(routes)),
    audits,
    projectSummary: summarizeProjectProfile(projectProfile),
    projectOrigin,
    enrichmentState,
    commonSnapshot,
    supportSites,
    routes,
    consumerContext,
  });
}

function viewMarkup(state) {
  return `<section class="non-fea-input-check" data-role="non-fea-input-check" data-state="${escapeHtml(state.overallState)}" data-lifecycle-state="${escapeHtml(state.lifecycleState)}" data-workspace-status-semantic-hash="${escapeHtml(state.status.semanticHash)}">
    <header class="non-fea-input-check__header">
      <div>
        <div class="non-fea-input-check__title-row">
          <span class="panel-eyebrow">GOVERNED COMMON INPUT</span>
          <span class="non-fea-input-check__scope">NON-FEA ONLY</span>
          <span class="non-fea-input-check__phase">PHASE 1 · PREFLIGHT CONSOLIDATION</span>
          <span class="non-fea-input-check__phase">STATUS PROJECTION V1</span>
        </div>
        <h2>Input Check</h2>
        <p>One read-only status projection of current source custody, Project Data, Masters, enrichment, method readiness, qualification, seal and execution evidence.</p>
      </div>
      <div class="non-fea-input-check__actions">
        <button type="button" data-load-calc-tab="project-data">Edit Project Data</button>
        <button type="button" data-load-calc-tab="masters">Review Masters</button>
        <button type="button" data-load-calc-tab="enrichment">Review Enrichment</button>
        <button type="button" data-load-calc-tab="method-basis">Review Method Basis</button>
        <button type="button" data-load-calc-tab="seal-export">Seal & Export</button>
        <button type="button" data-load-calc-tab="json-trace">Open JSON Trace</button>
      </div>
    </header>

    <section class="non-fea-input-check__scope-note">
      <strong>Boundary:</strong> this view does not edit engineering values, accept enrichment, evaluate methods, issue a seal, authorize an implementation, execute a calculation or process FEA results. It only renders current governed status and evidence.
    </section>

    <section class="non-fea-input-check__summary">
      ${metric('Common package', state.overallState, statusClass(state.overallState))}
      ${metric('Lifecycle', state.lifecycleState, statusClass(state.overallState))}
      ${metric('Dataset', state.status.source.datasetId || 'NOT_LOADED')}
      ${metric('Ready gates', `${state.status.summary.readyGateCount}/8`, state.status.summary.blockedGateCount ? 'warning' : 'ready')}
      ${metric('Checker-ready methods', state.status.summary.checkerReadyMethodCount, state.status.summary.checkerReadyMethodCount ? 'ready' : 'warning')}
      ${metric('Blockers', state.blockers.length, state.blockers.length ? 'blocked' : 'ready')}
    </section>

    <div class="non-fea-input-check__layout">
      <main>
        ${workflowMarkup(state.gates)}
        ${auditMarkup(state.audits)}
        ${sourceEvidenceMarkup(state.sourceRows)}
        ${routeEvidenceMarkup(state.routeRows)}
        ${methodMarkup(state.methodRows)}
        ${blockerMarkup(state.blockers)}
      </main>
      <aside>
        ${projectBasisMarkup(state)}
        ${masterMarkup(state.masterRows)}
        ${enrichmentAuthorityMarkup(state)}
        ${commonInputAuthorityMarkup(state)}
        ${historicalAuthorityMarkup(state)}
      </aside>
    </div>
  </section>`;
}

function workflowMarkup(gates) {
  return `<section class="non-fea-panel">
    <header><div><span class="panel-eyebrow">EIGHT-GATE WORKFLOW</span><h3>Current governed lifecycle</h3></div><p>Gate state comes only from <code>non-fea-workspace-status-projection/v1</code>.</p></header>
    <div class="non-fea-gates">${gates.map((row, index) => `<article class="non-fea-gate non-fea-gate--${statusClass(row.state)}" data-common-input-state="${escapeHtml(row.state)}"${row.gateId === 'E_ENRICHMENT' ? ` data-enrichment-gate-state="${escapeHtml(row.state)}"` : ''}>
      <div class="non-fea-gate__index">${index + 1}</div>
      <div><div class="non-fea-gate__heading"><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.state)}</span></div>
      <code>${escapeHtml(row.gateId)}</code><p>${escapeHtml(row.message)}</p></div>
    </article>`).join('')}</div>
  </section>`;
}

function auditMarkup(audits) {
  const rows = [['normalization', 'Normalization'], ['topology', 'Topology'], ['loads', 'Load calculation']];
  return `<section class="non-fea-panel" data-role="non-fea-project-audits">
    <header><div><span class="panel-eyebrow">PROJECT DATA WORKFLOWS</span><h3>Non-FEA prerequisite audits</h3></div><p>These are observational details behind Gate C; Project Data remains the editor and policy authority.</p></header>
    <div class="non-fea-audits">${rows.map(([key, label]) => {
    const audit = audits[key];
    return `<article data-preflight-workflow="${escapeHtml(key)}" data-status="${audit?.valid ? 'READY' : 'BLOCKED'}">
      <strong>${escapeHtml(label)}</strong><span>${audit?.valid ? 'READY' : `BLOCKED (${audit?.errors?.length || 0})`}</span>
      <p>${audit?.valid ? 'Approved evidence is current.' : escapeHtml(firstAuditMessage(audit))}</p></article>`;
  }).join('')}</div>
  </section>`;
}

function sourceEvidenceMarkup(rows) {
  return `<section class="non-fea-panel" data-role="non-fea-source-evidence">
    <header><div><span class="panel-eyebrow">SOURCE CUSTODY</span><h3>Active source and contract evidence</h3></div><p>Hashes and observed content are displayed without creating missing evidence.</p></header>
    <div class="non-fea-table-wrap"><table><thead><tr><th>Evidence</th><th>Status</th><th>Source / schema</th><th>SHA / semantic hash</th><th>Observed content</th></tr></thead>
    <tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.label)}</strong></td><td><span class="non-fea-chip non-fea-chip--${statusClass(row.status)}">${escapeHtml(row.status)}</span></td><td>${escapeHtml(row.source)}</td><td><code title="${escapeHtml(row.hash)}">${escapeHtml(compactHash(row.hash))}</code></td><td>${escapeHtml(row.observed)}</td></tr>`).join('')}</tbody></table></div>
  </section>`;
}

function routeEvidenceMarkup(rows) {
  return `<section class="non-fea-panel" data-role="non-fea-route-evidence">
    <header><div><span class="panel-eyebrow">EXACT ROUTE EVIDENCE</span><h3>Route partitions</h3></div><p>No proximity repair or inferred joining is performed by this view.</p></header>
    ${rows.length ? `<div class="non-fea-table-wrap"><table><thead><tr><th>Route</th><th>Line</th><th>Status</th><th>Edges</th><th>Physical edges</th><th>Length (mm)</th><th>Blockers</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.routeId)}</strong></td><td>${escapeHtml(row.lineKey)}</td><td><span class="non-fea-chip non-fea-chip--${statusClass(row.status)}">${escapeHtml(row.status)}</span></td><td>${row.edgeCount}</td><td>${row.physicalEdgeCount}</td><td>${escapeHtml(row.totalLengthMm)}</td><td>${escapeHtml(row.blockers)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="panel-empty">Route partitions are not available.</p>'}
  </section>`;
}

function methodMarkup(rows) {
  return `<section class="non-fea-panel">
    <header><div><span class="panel-eyebrow">METHOD READINESS</span><h3>Independent Non-FEA input readiness</h3></div><p>Input readiness comes only from the common checker. Implementation qualification, selection, authorization and execution remain separate.</p></header>
    <div class="non-fea-table-wrap"><table><thead><tr><th>Method</th><th>Input state</th><th>Current basis</th></tr></thead><tbody>${rows.map((row) => `<tr data-method-id="${escapeHtml(row.methodId)}"><td><strong>${escapeHtml(row.label)}</strong><code>${escapeHtml(row.methodId)}</code></td><td><span class="non-fea-chip non-fea-chip--${statusClass(row.state)}">${escapeHtml(row.state)}</span></td><td>${escapeHtml(row.basis)}</td></tr>`).join('')}</tbody></table></div>
  </section>`;
}

function blockerMarkup(rows) {
  return `<section class="non-fea-panel">
    <header><div><span class="panel-eyebrow">STATUS BLOCKERS</span><h3>Current unresolved lifecycle evidence</h3></div><strong>${rows.length}</strong></header>
    ${rows.length ? `<ul class="non-fea-blockers">${rows.slice(0, 200).map((row) => `<li><span class="non-fea-chip non-fea-chip--blocked">${escapeHtml(row.scope)}</span><div><strong>${escapeHtml(row.code)}</strong><p>${escapeHtml(row.message)}</p></div></li>`).join('')}</ul>` : '<p class="panel-empty non-fea-ready-copy">The current status projection has no blocking or stale lifecycle evidence.</p>'}
  </section>`;
}

function projectBasisMarkup(state) {
  const summary = state.projectSummary;
  return `<section class="non-fea-panel non-fea-side-panel">
    <header><div><span class="panel-eyebrow">PROJECT BASIS OWNER</span><h3>Project Data</h3></div><button type="button" data-load-calc-tab="project-data">Edit</button></header>
    <dl class="non-fea-facts"><dt>Authority</dt><dd>${escapeHtml(state.projectOrigin?.kind || 'NOT_AVAILABLE')}</dd><dt>Source</dt><dd>${escapeHtml(state.projectOrigin?.source || 'NOT_AVAILABLE')}</dd><dt>Revision</dt><dd>${escapeHtml(summary.revision)}</dd><dt>Normalization</dt><dd>${state.audits.normalization.valid ? 'READY' : 'BLOCKED'}</dd><dt>Load fields</dt><dd>${summary.loadApproved}/${summary.loadTotal} approved</dd><dt>Topology fields</dt><dd>${summary.topologyApproved}/${summary.topologyTotal} approved</dd><dt>Missing values</dt><dd>${summary.missing}</dd></dl>
    <p class="non-fea-muted">Project Data remains the owning editor for approved calculation policy. Input Check does not duplicate its write authority.</p>
  </section>`;
}

function masterMarkup(rows) {
  return `<section class="non-fea-panel non-fea-side-panel">
    <header><div><span class="panel-eyebrow">MASTER DATA OWNER</span><h3>Exact-match sources</h3></div><button type="button" data-load-calc-tab="masters">Review</button></header>
    <ul class="non-fea-master-list">${rows.map((row) => `<li><div><strong>${escapeHtml(row.label)}</strong><small>${row.rowCount} normalized rows · ${escapeHtml(compactHash(row.sourceHash))}</small></div><span class="non-fea-chip non-fea-chip--${statusClass(row.status)}">${escapeHtml(row.status)}</span></li>`).join('')}</ul>
    <p class="non-fea-muted">Approved Masters may create exact review candidates; they do not directly write accepted enrichment or calculation authority.</p>
  </section>`;
}

function enrichmentAuthorityMarkup(state) {
  const row = state.enrichmentState;
  return `<section class="non-fea-panel non-fea-side-panel" data-role="non-fea-enrichment-authority" data-status="${escapeHtml(row.status)}">
    <header><div><span class="panel-eyebrow">COMMON ENRICHMENT AUTHORITY</span><h3>${escapeHtml(row.status)}</h3></div><button type="button" data-load-calc-tab="enrichment">Review</button></header>
    <dl class="non-fea-facts"><dt>Proposals</dt><dd>${row.proposalCount}</dd><dt>Accepted records</dt><dd>${row.acceptedCount}</dd><dt>Resolutions</dt><dd>${row.resolutionCount}</dd><dt>Affected entities</dt><dd>${row.affectedEntityCount}</dd><dt>Source binding</dt><dd><code>${escapeHtml(compactHash(row.boundSourceSemanticHash))}</code></dd><dt>Sidecar</dt><dd><code>${escapeHtml(compactHash(row.sidecarSemanticHash))}</code></dd><dt>Resolution ledger</dt><dd><code>${escapeHtml(compactHash(row.resolutionLedgerSemanticHash))}</code></dd></dl>
    <p class="non-fea-muted">${escapeHtml(row.message)}</p>
    ${row.blockers.length ? `<ul class="non-fea-blockers">${row.blockers.slice(0, 20).map((blocker) => `<li><div><strong>${escapeHtml(blocker.code || 'BLOCKED')}</strong><p>${escapeHtml(blocker.message || blocker.path || 'Enrichment authority is blocked.')}</p></div></li>`).join('')}</ul>` : ''}
  </section>`;
}

function commonInputAuthorityMarkup(state) {
  const status = state.status;
  const common = status.commonInput;
  const sealState = common.commonInputSemanticHash ? (common.commonInputStale ? 'STALE' : 'CURRENT') : 'NOT_SEALED';
  return `<section class="non-fea-panel non-fea-side-panel non-fea-seal" data-role="non-fea-common-input-authority" data-report-state="${escapeHtml(common.reportPackageState || 'NOT_EVALUATED')}" data-seal-state="${escapeHtml(sealState)}" data-workspace-status-semantic-hash="${escapeHtml(status.semanticHash)}">
    <header><div><span class="panel-eyebrow">COMMON CHECKER & SEAL</span><h3>${escapeHtml(status.lifecycleState)}</h3></div><button type="button" data-load-calc-tab="method-basis">Review</button></header>
    <dl class="non-fea-facts"><dt>Overall</dt><dd>${escapeHtml(status.overallState)}</dd><dt>Ready gates</dt><dd>${status.summary.readyGateCount}/8</dd><dt>Ready methods</dt><dd>${status.summary.checkerReadyMethodCount}</dd><dt>Blocked methods</dt><dd>${status.summary.checkerBlockedMethodCount}</dd><dt>Candidate</dt><dd><code>${escapeHtml(compactHash(common.candidateSemanticHash))}</code></dd><dt>Seal</dt><dd>${escapeHtml(sealState)}</dd><dt>Common input</dt><dd><code>${escapeHtml(compactHash(common.commonInputSemanticHash))}</code></dd><dt>Implementations</dt><dd>${status.summary.qualifiedImplementationCount}/${status.summary.implementationCount} qualified</dd><dt>Authorizations</dt><dd>${status.summary.authorizationReceiptCount}</dd><dt>Executions</dt><dd>${status.summary.executionReceiptCount}</dd><dt>Export</dt><dd>${common.exportSemanticHash ? 'CREATED' : 'NOT_CREATED'}</dd><dt>Status projection</dt><dd><code>${escapeHtml(compactHash(status.semanticHash))}</code></dd></dl>
    ${state.commonSnapshot.error ? `<p class="non-fea-muted">${escapeHtml(state.commonSnapshot.error)}</p>` : ''}
    <button type="button" data-load-calc-tab="seal-export">Open Seal & Export</button>
    <p class="non-fea-muted">Checker evaluation, explicit sealing, method authorization and calculation remain separate lifecycle actions.</p>
  </section>`;
}

function historicalAuthorityMarkup(state) {
  const execution = state.status.execution;
  return `<section class="non-fea-panel non-fea-side-panel">
    <header><div><span class="panel-eyebrow">MIGRATION EVIDENCE</span><h3>Historical legacy authority</h3></div></header>
    <dl class="non-fea-facts"><dt>Scenario</dt><dd>${escapeHtml(execution.empiricalScenarioState || 'NOT_CONFIGURED')}</dd><dt>Authorization</dt><dd>${escapeHtml(execution.empiricalAuthorizationState || 'NOT_CONFIGURED')}</dd><dt>Reason</dt><dd>${escapeHtml(execution.empiricalAuthorizationReasonCode || 'NOT_AVAILABLE')}</dd></dl>
    <p class="non-fea-muted">Retained historical authorizations are evidence only. They cannot establish current common-checker readiness or execution authority.</p>
  </section>`;
}

function buildMethodRows(statusRows) {
  const byId = new Map((statusRows || []).map((row) => [row.methodId, row]));
  return METHOD_ROWS.map(([methodId, label]) => {
    const row = byId.get(methodId);
    const state = row?.state || 'NOT_EVALUATED';
    return {
      methodId,
      label,
      state,
      basis: state === 'READY'
        ? 'All exact common-checker input requirements are current.'
        : row?.blockerCodes?.length
          ? row.blockerCodes.join(', ')
          : 'The common checker has not produced a current method receipt.',
    };
  });
}

function fallbackEnrichmentState(snapshot) {
  const status = snapshot.stale
    ? 'STALE'
    : snapshot.acceptedRecords?.length
      ? 'NOT_EVALUATED'
      : snapshot.proposals?.length
        ? 'REVIEW_REQUIRED'
        : 'NOT_EVALUATED';
  return Object.freeze({
    status,
    message: snapshot.acceptedRecords?.length
      ? 'Accepted common-enrichment evidence exists; current field resolution has not been projected for this view.'
      : snapshot.proposals?.length
        ? `${snapshot.proposals.length} exact enrichment proposals await review.`
        : 'No accepted common-enrichment sidecar has been reviewed for the active source.',
    proposalCount: snapshot.proposals?.length || 0,
    acceptedCount: snapshot.acceptedRecords?.length || 0,
    sourceSemanticHash: snapshot.currentSourceSemanticHash || null,
    boundSourceSemanticHash: snapshot.boundSourceSemanticHash || null,
    sidecarSemanticHash: null,
    resolutionLedgerSemanticHash: null,
    impactSemanticHash: null,
    resolutionCount: 0,
    affectedEntityCount: 0,
    blockers: Object.freeze([]),
  });
}

function sourceEvidenceRows({ dataset, masters, supportSites, routes, consumerContext }) {
  const availableContracts = consumerContext?.availabilitySummary?.availableContractKeys;
  return [
    evidenceRow('SJSON dataset', dataset && isSha256(dataset.sourceSha256) ? 'READY' : 'BLOCKED', dataset?.sourceName || dataset?.datasetId || 'NOT_LOADED', dataset?.sourceSha256, dataset ? `${integer(dataset.summary?.nodeCount)} nodes · ${integer(dataset.summary?.entityCount ?? dataset.summary?.objectCount)} entities` : 'No active dataset'),
    evidenceRow('Shared piping model', isSemanticHash(dataset?.sharedModel?.semanticHash) ? 'READY' : 'BLOCKED', dataset?.sharedModel?.schema || 'NOT_AVAILABLE', dataset?.sharedModel?.semanticHash, dataset?.sharedModel ? `${integer(dataset.sharedModel.components?.length)} components · ${integer(dataset.sharedModel.supports?.length)} supports` : 'Not materialized'),
    masterEvidenceRow('Line list', masters?.lineList, true),
    masterEvidenceRow('Piping classes', masters?.pipingClass, true),
    masterEvidenceRow('Component weights', masters?.weight, true),
    masterEvidenceRow('Material map', masters?.materialMap, false),
    evidenceRow('Support sites', supportSites?.status || 'BLOCKED', supportSites?.schema || 'NOT_BUILT', supportSites?.semanticHash, supportSites ? `${integer(supportSites.summary?.supportAssemblyCount)} assemblies · ${integer(supportSites.summary?.physicalLocationCount)} sites` : 'Not built'),
    evidenceRow('Route partitions', routes?.status || 'BLOCKED', routes?.schema || 'NOT_BUILT', routes?.semanticHash, routes ? `${integer(routes.summary?.routeCount)} routes · ${integer(routes.summary?.edgeCount)} edges` : 'Not built'),
    evidenceRow('Workspace contracts', consumerContext ? 'READY' : 'BLOCKED', consumerContext?.schema || 'NOT_AVAILABLE', consumerContext?.semanticHash, consumerContext ? `${integer(availableContracts?.length)} available contracts` : 'Context unavailable'),
  ];
}

function masterEvidenceRow(label, master, required) {
  const rows = Array.isArray(master?.normalizedRows) ? master.normalizedRows : [];
  const ready = rows.length > 0 && Boolean(master?.sourceHash);
  return evidenceRow(label, ready ? 'READY' : required ? 'BLOCKED' : 'OPTIONAL', master?.fileName || master?.sheetName || 'NOT_LOADED', master?.sourceHash, `${rows.length} normalized rows`);
}
function evidenceRow(label, status, source, hash, observed) {
  return Object.freeze({ label, status, source: source || 'NOT_AVAILABLE', hash: hash || 'NOT_AVAILABLE', observed });
}
function routeEvidenceRows(routes) {
  return (routes?.routes || []).map((route) => Object.freeze({
    routeId: route.routeId || 'NOT_AVAILABLE', lineKey: route.lineKey || 'NOT_AVAILABLE', status: route.status || 'BLOCKED', edgeCount: Array.isArray(route.edgeIds) ? route.edgeIds.length : 0, physicalEdgeCount: Array.isArray(route.physicalEdgeIds) ? route.physicalEdgeIds.length : 0, totalLengthMm: Number.isFinite(route.totalLengthMm) ? route.totalLengthMm.toFixed(3) : 'BLOCKED', blockers: (route.blockers || []).map((row) => row.code || row.message || String(row)).join(', ') || '—',
  }));
}
function masterSummary(masters) {
  return [masterRow('lineList', 'Line list', masters?.lineList, true), masterRow('pipingClass', 'Piping classes', masters?.pipingClass, true), masterRow('weight', 'Component weights', masters?.weight, true), masterRow('materialMap', 'Material map', masters?.materialMap, false)];
}
function masterRow(key, label, value, required) {
  const rowCount = Array.isArray(value?.normalizedRows) ? value.normalizedRows.length : 0;
  const status = rowCount > 0 && value?.sourceHash ? 'READY' : required ? 'BLOCKED' : 'OPTIONAL';
  return Object.freeze({ key, label, required, rowCount, status, sourceHash: value?.sourceHash || null });
}
function summarizeProjectProfile(profile) {
  const load = summarizeGroup(profile?.loadCalculation);
  const topology = summarizeGroup(profile?.topology);
  return Object.freeze({ revision: profile?.revision ?? 'NOT_AVAILABLE', loadApproved: load.approved, loadTotal: load.total, topologyApproved: topology.approved, topologyTotal: topology.total, missing: load.missing + topology.missing });
}
function summarizeGroup(group) {
  const entries = Object.values(group || {}).filter((row) => row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'value'));
  return { total: entries.length, approved: entries.filter((row) => row.approved === true && row.value !== null).length, missing: entries.filter((row) => row.value === null).length };
}
function activeHashes(dataset, masters) {
  return { dataset: dataset?.sourceSha256 ?? '', lineList: masters?.lineList?.sourceHash ?? '', pipingClass: masters?.pipingClass?.sourceHash ?? '', componentWeight: masters?.weight?.sourceHash ?? '', materialMap: masters?.materialMap?.sourceHash ?? '' };
}
function firstAuditMessage(audit) {
  const row = audit?.errors?.[0];
  return row?.message || row?.path || row?.projectDataPath || 'Required Project Data evidence is unavailable.';
}
function metric(label, value, state = '') {
  return `<article class="non-fea-metric ${state ? `non-fea-metric--${state}` : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}
function statusClass(value) {
  const token = String(value || '').toUpperCase();
  if (token === 'READY' || token.includes('CURRENT')) return 'ready';
  if (['PARTIAL', 'PARTIALLY_READY', 'REVIEW_REQUIRED', 'NOT_EVALUATED', 'OPTIONAL', 'NOT_SEALED'].includes(token)) return 'warning';
  if (token === 'STALE') return 'stale';
  return 'blocked';
}
function compactHash(value) {
  if (!value || value === 'NOT_AVAILABLE') return 'NOT_AVAILABLE';
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}
function integer(value) { return Number.isInteger(value) ? String(value) : 'NOT_AVAILABLE'; }
function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value); }
function isSemanticHash(value) { return typeof value === 'string' && /^fnv1a64:[a-f0-9]{16}$/iu.test(value); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function styles() {
  return `<style>
    .non-fea-input-check{display:flex;flex-direction:column;gap:14px;height:100%;overflow:auto;padding:16px;background:#07101e;color:#e2e8f0;box-sizing:border-box}
    .non-fea-input-check__header,.non-fea-panel>header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.non-fea-input-check__header h2,.non-fea-panel h3{margin:2px 0;color:#e2e8f0}.non-fea-input-check__header h2{font-size:26px}.non-fea-input-check__header p,.non-fea-panel header p,.non-fea-muted{margin:5px 0;color:#94a3b8;line-height:1.45}
    .non-fea-input-check__title-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.non-fea-input-check__scope,.non-fea-input-check__phase{padding:3px 8px;border:1px solid #0ea5e9;border-radius:999px;color:#7dd3fc;font-size:10px;font-weight:800;letter-spacing:.08em}.non-fea-input-check__phase{border-color:#6d28d9;color:#c4b5fd}.non-fea-input-check__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.non-fea-input-check button{border:1px solid #334155;border-radius:5px;background:#111c2f;color:#e2e8f0;padding:7px 10px;cursor:pointer}.non-fea-input-check button:hover{border-color:#38bdf8;color:#7dd3fc}
    .non-fea-input-check__scope-note{padding:10px 12px;border:1px solid #164e63;border-radius:6px;background:#082f49;color:#bae6fd}.non-fea-input-check__summary{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:8px}.non-fea-metric{padding:10px;border:1px solid #293548;border-radius:6px;background:#0d1728}.non-fea-metric span{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.non-fea-metric strong{display:block;margin-top:5px;font-size:16px;overflow-wrap:anywhere}.non-fea-metric--ready{border-color:#166534}.non-fea-metric--blocked{border-color:#991b1b}.non-fea-metric--warning{border-color:#92400e}
    .non-fea-input-check__layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:12px;align-items:start}.non-fea-input-check__layout main,.non-fea-input-check__layout aside{display:flex;flex-direction:column;gap:12px}.non-fea-panel{padding:13px;border:1px solid #293548;border-radius:7px;background:#0b1424;box-shadow:0 8px 24px rgba(0,0,0,.12)}.panel-eyebrow{display:block;color:#38bdf8;font-size:10px;font-weight:800;letter-spacing:.1em}.non-fea-panel code{display:block;color:#64748b;font-size:10px;margin-top:2px;overflow-wrap:anywhere}
    .non-fea-gates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.non-fea-gate{display:grid;grid-template-columns:30px 1fr;gap:9px;padding:10px;border:1px solid #334155;border-radius:6px;background:#0c1728}.non-fea-gate__index{display:flex;width:26px;height:26px;align-items:center;justify-content:center;border-radius:50%;background:#172033;color:#94a3b8;font-weight:800}.non-fea-gate__heading{display:flex;justify-content:space-between;gap:8px}.non-fea-gate p{margin:6px 0 0;color:#94a3b8;line-height:1.35;font-size:12px}.non-fea-gate--ready{border-color:#166534}.non-fea-gate--ready .non-fea-gate__heading span{color:#4ade80}.non-fea-gate--warning{border-color:#92400e}.non-fea-gate--warning .non-fea-gate__heading span{color:#fbbf24}.non-fea-gate--blocked,.non-fea-gate--stale{border-color:#7f1d1d}.non-fea-gate--blocked .non-fea-gate__heading span,.non-fea-gate--stale .non-fea-gate__heading span{color:#f87171}
    .non-fea-audits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.non-fea-audits article{padding:10px;border:1px solid #334155;border-radius:6px;background:#0c1728}.non-fea-audits article>span{display:block;margin-top:4px;font-weight:800}.non-fea-audits article p{margin:6px 0 0;color:#94a3b8;font-size:11px}.non-fea-audits [data-status="READY"]{border-color:#166534}.non-fea-audits [data-status="READY"]>span{color:#4ade80}.non-fea-audits [data-status="BLOCKED"]{border-color:#7f1d1d}.non-fea-audits [data-status="BLOCKED"]>span{color:#f87171}
    .non-fea-table-wrap{overflow:auto;margin-top:10px}.non-fea-input-check table{width:100%;border-collapse:collapse}.non-fea-input-check th,.non-fea-input-check td{text-align:left;padding:8px;border-bottom:1px solid #223047;vertical-align:top}.non-fea-input-check th{color:#7dd3fc;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.non-fea-input-check td{font-size:12px}.non-fea-chip{display:inline-flex;padding:3px 7px;border-radius:999px;border:1px solid #475569;font-size:10px;font-weight:800}.non-fea-chip--ready{border-color:#166534;color:#4ade80}.non-fea-chip--warning{border-color:#92400e;color:#fbbf24}.non-fea-chip--blocked,.non-fea-chip--stale{border-color:#7f1d1d;color:#f87171}
    .non-fea-blockers{list-style:none;padding:0;margin:10px 0 0;display:flex;flex-direction:column;gap:7px}.non-fea-blockers li{display:grid;grid-template-columns:max-content 1fr;gap:9px;padding:8px;border:1px solid #3f2730;border-radius:5px}.non-fea-blockers p{margin:3px 0 0;color:#94a3b8}.non-fea-ready-copy{color:#4ade80}.non-fea-side-panel header button{padding:5px 8px}.non-fea-facts{display:grid;grid-template-columns:110px 1fr;gap:7px;margin:12px 0}.non-fea-facts dt{color:#94a3b8}.non-fea-facts dd{margin:0;overflow-wrap:anywhere}.non-fea-master-list{list-style:none;padding:0;margin:10px 0;display:flex;flex-direction:column;gap:7px}.non-fea-master-list li{display:flex;justify-content:space-between;gap:10px;padding:8px;border:1px solid #26354a;border-radius:5px}.non-fea-master-list small{display:block;color:#64748b;margin-top:3px}.non-fea-seal{border-color:#164e63}.panel-empty{color:#94a3b8}
    @media(max-width:1100px){.non-fea-input-check__summary{grid-template-columns:repeat(3,1fr)}.non-fea-input-check__layout{grid-template-columns:1fr}.non-fea-gates{grid-template-columns:1fr}}@media(max-width:780px){.non-fea-audits{grid-template-columns:1fr}}@media(max-width:680px){.non-fea-input-check__header{flex-direction:column}.non-fea-input-check__actions{justify-content:flex-start}.non-fea-input-check__summary{grid-template-columns:repeat(2,1fr)}}
  </style>`;
}
