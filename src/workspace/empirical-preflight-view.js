import { engineeringModelStore } from './engineering-model-store.js';
import { masterDataController } from './master-data-controller.js';
import { projectDataStore } from './project-data/project-data-store.js';
import { WorkspaceState } from './workspace-state.js';

/**
 * Renders a read-only qualification grid from the active dataset, imported
 * masters, Project Data audits, support sites, and exact route partitions.
 * Missing evidence is reported as BLOCKED and is never replaced.
 */
export function renderEmpiricalPreflightView(container, consumerContext) {
  if (!container) throw new TypeError('Empirical pre-flight requires a container.');
  const dataset = WorkspaceState.getSnapshot()?.dataset ?? null;
  const masters = masterDataController.getMasterData();
  const supportSites = engineeringModelStore.getSupportSiteModel();
  const routes = engineeringModelStore.getRoutePartitionModel();
  const profile = projectDataStore.getProfile();
  const origin = projectDataStore.getOrigin();
  const hashes = activeHashes(dataset, masters);
  const audits = ['normalization', 'topology', 'editing', 'loads', 'webgl', 'benchmark']
    .map((workflow) => projectDataStore.validate(workflow, hashes));
  const blockers = collectBlockers(audits, supportSites, routes);

  container.innerHTML = `<style>.empirical-preflight{display:flex;flex-direction:column;gap:14px}.empirical-preflight>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.empirical-preflight h2,.empirical-preflight h3{margin:0;color:#7dd3fc}.preflight-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.preflight-status-grid article{display:flex;justify-content:space-between;gap:8px;padding:8px;border:1px solid #334155;border-radius:5px}.empirical-preflight [data-status="READY"]{color:#4ade80}.empirical-preflight [data-status="BLOCKED"]{color:#fbbf24}.empirical-preflight code{overflow-wrap:anywhere}</style><section class="empirical-preflight">
    <header><div><span class="panel-eyebrow">SOURCE-QUALIFIED INTAKE</span><h2>Empirical pre-flight</h2></div>
      <p>Authority: ${escapeHtml(origin.source)} · ${escapeHtml(origin.profileSemanticHash)}</p></header>
    <div class="preflight-status-grid">${audits.map(auditCard).join('')}</div>
    <section><h3>Active source and master evidence</h3>${sourceTable(dataset, masters, supportSites, routes, consumerContext)}</section>
    <section><h3>Exact route partitions</h3>${routeTable(routes)}</section>
    <section><h3>Blocking evidence (${blockers.length})</h3>${blockerList(blockers)}</section>
  </section>`;
}

function activeHashes(dataset, masters) {
  return {
    dataset: dataset?.sourceSha256 ?? '',
    lineList: masters.lineList?.sourceHash ?? '',
    pipingClass: masters.pipingClass?.sourceHash ?? '',
    componentWeight: masters.weight?.sourceHash ?? '',
  };
}

function collectBlockers(audits, supportSites, routes) {
  return [
    ...audits.flatMap((audit) => audit.errors.map((row) => ({ scope: `Project Data/${audit.workflow}`, ...row }))),
    ...(supportSites?.blockers ?? []).map((row) => ({ scope: 'Support sites', ...row })),
    ...(routes?.blockers ?? []).map((row) => ({ scope: 'Route partitions', ...row })),
    ...(routes?.routes ?? []).flatMap((route) => route.blockers.map((row) => ({ scope: route.routeId, ...row }))),
  ];
}

function auditCard(audit) {
  return `<article data-preflight-workflow="${escapeHtml(audit.workflow)}" data-status="${audit.valid ? 'READY' : 'BLOCKED'}">
    <strong>${escapeHtml(audit.workflow)}</strong><span>${audit.valid ? 'READY' : `BLOCKED (${audit.errors.length})`}</span>
  </article>`;
}

function sourceTable(dataset, masters, supportSites, routes, consumerContext) {
  const rows = [
    sourceRow('SJSON dataset', dataset ? 'READY' : 'BLOCKED', dataset?.sourceName, dataset?.sourceSha256, dataset ? `${integer(dataset.summary?.nodeCount)} nodes` : 'No active dataset'),
    masterRow('Line list', masters.lineList),
    masterRow('Piping classes', masters.pipingClass),
    masterRow('Component weights', masters.weight),
    masterRow('Material map', masters.materialMap),
    sourceRow('Support sites', supportSites?.status ?? 'BLOCKED', supportSites?.schema, '', supportSites ? `${integer(supportSites.summary?.supportAssemblyCount)} assemblies / ${integer(supportSites.summary?.physicalLocationCount)} sites` : 'Not built'),
    sourceRow('Route partitions', routes?.status ?? 'BLOCKED', routes?.schema, '', routes ? `${integer(routes.summary?.routeCount)} routes / ${integer(routes.summary?.edgeCount)} edges` : 'Not built'),
    sourceRow('Workspace contracts', consumerContext ? 'READY' : 'BLOCKED', consumerContext?.schema, consumerContext?.semanticHash, consumerContext ? `${integer(consumerContext.availabilitySummary?.availableContractKeys?.length)} available contracts` : 'Context unavailable'),
  ];
  return `<table><thead><tr><th>Evidence</th><th>Status</th><th>Source</th><th>SHA / semantic hash</th><th>Observed content</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function masterRow(label, master) {
  const rows = master?.normalizedRows ?? [];
  const hasSource = typeof master?.sourceHash === 'string' && master.sourceHash.length === 64;
  return sourceRow(label, rows.length > 0 && hasSource ? 'READY' : 'BLOCKED', master?.fileName, master?.sourceHash, `${rows.length} normalized rows`);
}

function sourceRow(label, status, source, hash, observed) {
  return `<tr><td>${escapeHtml(label)}</td><td data-status="${escapeHtml(status)}">${escapeHtml(status)}</td><td>${escapeHtml(source || 'NOT_LOADED')}</td><td><code>${escapeHtml(hash || 'NOT_AVAILABLE')}</code></td><td>${escapeHtml(observed)}</td></tr>`;
}

function routeTable(model) {
  if (!model?.routes?.length) return '<p class="panel-empty">Route partitions are not available.</p>';
  return `<table><thead><tr><th>Route</th><th>Line</th><th>Status</th><th>Edges</th><th>Physical edges</th><th>Length (mm)</th></tr></thead><tbody>${model.routes.map((route) => `<tr>
    <td>${escapeHtml(route.routeId)}</td><td>${escapeHtml(route.lineKey)}</td><td data-status="${escapeHtml(route.status)}">${escapeHtml(route.status)}</td>
    <td>${route.edgeIds.length}</td><td>${route.physicalEdgeIds.length}</td><td>${Number.isFinite(route.totalLengthMm) ? route.totalLengthMm.toFixed(3) : 'BLOCKED'}</td>
  </tr>`).join('')}</tbody></table>`;
}

function blockerList(blockers) {
  if (!blockers.length) return '<p data-status="READY">No blockers.</p>';
  return `<ul class="load-blockers">${blockers.map((row) => `<li><strong>${escapeHtml(row.scope)}</strong> · ${escapeHtml(row.code)} · ${escapeHtml(row.path || row.projectDataPath || '')} ${escapeHtml(row.message || '')}</li>`).join('')}</ul>`;
}

function integer(value) { return Number.isInteger(value) ? String(value) : 'NOT_AVAILABLE'; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
