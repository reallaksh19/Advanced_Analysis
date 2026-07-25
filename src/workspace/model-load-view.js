export function renderModelLoadSummary(documentRef, foundation, status = {}) {
  const card = documentRef.createElement('section');
  card.className = 'analysis-card';
  card.dataset.role = 'model-load-card';
  if (!foundation) {
    card.innerHTML = '<h3>Model Loads</h3><p class="panel-empty">Import a dataset to prepare load cases.</p>';
    return card;
  }
  card.innerHTML = `
    <h3>Model Load Cases &amp; Primitives</h3>
    <p data-role="model-load-profiles">${profileText(foundation)}</p>
    <div class="analysis-card__meta">${caseRows(foundation.readinessAudit.cases)}</div>
    <p data-role="model-load-status">${statusText(status)}</p>
    <div class="analysis-card__actions">
      <button type="button" data-model-load-action="rebuild">Rebuild Model Loads</button>
      <button type="button" data-model-load-action="export">Export Load Case/Primitive Model</button>
    </div>`;
  return card;
}

function caseRows(cases) {
  return cases.map((row) => `
    <div data-load-case-id="${row.loadCaseId}">
      <strong>${row.loadCaseId}</strong> · ${row.qualification}<br>
      Ready ${row.readyComponentIds.length} · Blocked ${row.blockedComponentIds.length}<br>
      Distributed ${row.distributedPrimitiveCount} · Point ${row.pointPrimitiveCount}<br>
      Mass ${format(row.totalMassKg)} kg · Force ${format(row.totalForceN)} N
    </div>`).join('');
}

function profileText(foundation) {
  return `${foundation.gravityProfile.profileId} · ${foundation.gravityProfile.accelerationMPerS2} m/s² · ${foundation.compositionProfile.profileId}`;
}

function statusText(status) {
  if (status.state === 'failed') return status.message || 'Model-load rebuild failed.';
  if (status.state === 'exported') return `Exported ${status.filename}`;
  if (status.state === 'rebuilt') return 'Model loads rebuilt.';
  return '';
}

function format(value) {
  return Number(value).toPrecision(8).replace(/\.0+$/, '');
}
