import { PACKAGE_MODES } from '../core/model-calculation-package/index.js';

export function renderModelCalculationSummary(documentRef, snapshot, status = {}) {
  const card = documentRef.createElement('section');
  card.className = 'analysis-card'; card.dataset.role = 'model-calculation-card';
  if (!snapshot.ledger) {
    card.innerHTML = '<h3>Model Calculation Package</h3><p class="panel-empty">Import a dataset to create model calculation packages.</p>';
    return card;
  }
  const active = snapshot.ledger.entries.find((row) => row.entryId === snapshot.ledger.activeEntryId) || null;
  card.innerHTML = `
    <h3>Model Calculation Package &amp; Archive</h3>
    <div class="analysis-card__meta" data-role="model-calculation-availability">${availabilityText(snapshot)}</div>
    <label>Package mode
      <select data-model-calculation-control="mode">${modeOptions(snapshot)}</select>
    </label>
    <div data-role="model-calculation-history">${historyText(snapshot, active)}</div>
    <label>Archived package
      <select data-model-calculation-control="entry" ${snapshot.ledger.entries.length ? '' : 'disabled'}>${entryOptions(snapshot, active)}</select>
    </label>
    <p data-role="model-calculation-status">${statusText(status)}</p>
    <div class="analysis-card__actions">
      <button type="button" data-model-calculation-action="create" ${snapshot.availability.packageable ? '' : 'disabled'}>Create Calculation Package</button>
      <button type="button" data-model-calculation-action="select" ${snapshot.ledger.entries.length ? '' : 'disabled'}>Select Archived Package</button>
      <button type="button" data-model-calculation-action="json" ${active ? '' : 'disabled'}>Export Package JSON</button>
      <button type="button" data-model-calculation-action="csv" ${active ? '' : 'disabled'}>Export Report CSV</button>
      <button type="button" data-model-calculation-action="markdown" ${active ? '' : 'disabled'}>Export Report Markdown</button>
      <button type="button" data-model-calculation-action="clear" ${snapshot.ledger.entries.length ? '' : 'disabled'}>Clear Calculation History</button>
    </div>`;
  return card;
}

function availabilityText(snapshot) {
  const active = snapshot.ledger.entries.find((row) => row.entryId === snapshot.ledger.activeEntryId)?.package;
  const levels = active?.methodEvidence.map((row) => row.engineeringLevel).join(', ') || '—';
  return `Screening ${yesNo(snapshot.availability.screeningAvailable)} · Beam ${yesNo(snapshot.availability.beamAvailable)} · Packageable ${yesNo(snapshot.availability.packageable)}<br>
    Active mode ${snapshot.packageMode || '—'} · Archived ${snapshot.ledger.entries.length}<br>
    Active package ${active?.packageId || '—'} · Levels ${levels}<br>
    Path/case ${active?.qualificationSummary.length || 0} · Blockers ${active?.qualificationSummary.reduce((sum, row) => sum + row.blockers.length, 0) || 0}`;
}
function historyText(snapshot, active) {
  return `<strong>History</strong> · ${snapshot.ledger.entries.length} package(s) · Active ${active?.packageId || 'none'}`;
}
function modeOptions(snapshot) {
  const rows = [
    [PACKAGE_MODES.SCREENING, 'Tributary screening only', snapshot.availability.screeningAvailable],
    [PACKAGE_MODES.BEAM, 'Vertical beam only', snapshot.availability.beamAvailable],
    [PACKAGE_MODES.COMBINED, 'Screening and vertical beam', snapshot.availability.screeningAvailable && snapshot.availability.beamAvailable],
  ];
  return rows.map(([value, label, enabled]) => `<option value="${value}" ${value === snapshot.packageMode ? 'selected' : ''} ${enabled ? '' : 'disabled'}>${label}</option>`).join('');
}
function entryOptions(snapshot, active) {
  if (!snapshot.ledger.entries.length) return '<option value="">No archived packages</option>';
  return [...snapshot.ledger.entries].reverse().map((row) => `<option value="${row.entryId}" ${row.entryId === active?.entryId ? 'selected' : ''}>#${row.sequence} · ${row.packageId}</option>`).join('');
}
function statusText(status) {
  if (status.state === 'failed') return status.message || 'Model calculation operation failed.';
  if (status.state === 'created') return `Archived ${status.packageId}`;
  if (status.state === 'selected') return `Selected ${status.packageId}`;
  if (status.state === 'exported') return `Exported ${status.filename}`;
  if (status.state === 'cleared') return 'Calculation history cleared.';
  return '';
}
function yesNo(value) { return value ? 'available' : 'unavailable'; }
