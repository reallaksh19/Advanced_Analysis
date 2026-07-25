export function renderSupportLoadScreeningSummary(documentRef, snapshot, status = {}) {
  const card = documentRef.createElement('section');
  card.className = 'analysis-card';
  card.dataset.role = 'support-load-screening-card';
  if (!snapshot.pathModel) {
    card.innerHTML = '<h3>Support Load Screening</h3><p class="panel-empty">Import a dataset to prepare vertical load paths.</p>';
    return card;
  }
  card.innerHTML = `
    <h3>Topology-Local Tributary Screening</h3>
    <p data-role="support-load-screening-profile">${snapshot.profile.profileId}</p>
    <div class="analysis-card__meta">${pathSummary(snapshot.pathModel)}${screeningSummary(snapshot)}</div>
    <p data-role="support-load-screening-status">${statusText(status)}</p>
    <div class="analysis-card__actions">
      <button type="button" data-support-load-screening-action="rebuild">Rebuild Vertical Load Paths</button>
      <button type="button" data-support-load-screening-action="run">Run Tributary Screening</button>
      <button type="button" data-support-load-screening-action="export" ${snapshot.screening ? '' : 'disabled'}>Export Support Load Screening</button>
    </div>`;
  return card;
}

function pathSummary(model) {
  const summary = model.summary;
  return `<div data-role="vertical-load-path-health">
    Paths ${summary.pathCandidateCount} · Qualified ${summary.qualifiedPathCount} · Blocked ${summary.blockedPathCount}<br>
    Supports qualified ${summary.qualifiedSupportCount} · blocked ${summary.blockedSupportCount}
  </div>`;
}

function screeningSummary(snapshot) {
  if (!snapshot.screening || !snapshot.audit) return '<div data-role="support-load-screening-health">Screening not run.</div>';
  const rows = snapshot.audit.records.map((row) => `
    <div data-screening-path-id="${row.pathId}" data-screening-load-case-id="${row.loadCaseId}">
      <strong>${row.loadCaseId}</strong> · ${row.qualification}<br>
      Supports ${row.qualifiedSupportIds.length}/${row.blockedSupportIds.length} · Primitives ${row.eligiblePrimitiveIds.length}/${row.blockedPrimitiveIds.length}<br>
      Spans ${row.spanCount} · Force ${format(row.screenedSupportForceN)} N · Residual ${format(row.equilibriumResidualN)} N
    </div>`).join('');
  return `<div data-role="support-load-screening-health">${rows}</div>`;
}

function statusText(status) {
  if (status.state === 'failed') return status.message || 'Support-load screening failed.';
  if (status.state === 'paths') return 'Vertical load paths rebuilt.';
  if (status.state === 'screened') return 'Tributary screening completed.';
  if (status.state === 'exported') return `Exported ${status.filename}`;
  return '';
}
function format(value) { return Number(value || 0).toPrecision(8).replace(/\.0+$/, ''); }
