export function renderVerticalBeamSummary(documentRef, snapshot, status = {}) {
  const card = documentRef.createElement('section');
  card.className = 'analysis-card'; card.dataset.role = 'vertical-beam-card';
  if (!snapshot.beamModel) {
    card.innerHTML = '<h3>Vertical Beam Solver</h3><p class="panel-empty">Import a dataset with explicit flexural evidence to prepare beam readiness.</p>';
    return card;
  }
  card.innerHTML = `
    <h3>Explicit-EI Vertical Beam Solver</h3>
    <p data-role="vertical-beam-profile">${snapshot.profile.profileId}</p>
    <div class="analysis-card__meta">${modelSummary(snapshot)}${solutionSummary(snapshot)}</div>
    <p data-role="vertical-beam-status">${statusText(status)}</p>
    <div class="analysis-card__actions">
      <button type="button" data-vertical-beam-action="rebuild">Rebuild Vertical Beam Model</button>
      <button type="button" data-vertical-beam-action="solve">Solve Vertical Stiffness</button>
      <button type="button" data-vertical-beam-action="export" ${snapshot.solution ? '' : 'disabled'}>Export Vertical Beam Solution</button>
    </div>`;
  return card;
}

function modelSummary(snapshot) {
  const model = snapshot.beamModel.summary, flexural = snapshot.flexuralProjection.summary;
  const rows = snapshot.beamModel.pathCases.map((row) => `
    <div data-beam-model-path-id="${row.pathId}" data-beam-model-case-id="${row.loadCaseId}">
      <strong>${row.loadCaseId}</strong> · ${row.qualification} · Nodes ${row.nodes.length} · Elements ${row.elements.length}<br>
      DOFs free ${row.dofMap.length - row.constraints.length} · constrained ${row.constraints.length} · Supports ${row.qualifiedSupportKeys.length}
    </div>`).join('');
  return `<div data-role="vertical-beam-readiness">
    Cases ${model.pathCaseCount} · Ready ${model.readyPathCaseCount} · Blocked ${model.blockedPathCaseCount}<br>
    Flexural intervals ready ${flexural.readyIntervalCount} · blocked ${flexural.blockedIntervalCount}
    ${rows}
  </div>`;
}

function solutionSummary(snapshot) {
  if (!snapshot.solution || !snapshot.audit) return '<div data-role="vertical-beam-solution-health">Solution not run.</div>';
  const rows = snapshot.solution.pathCases.map((row) => `
    <div data-beam-solution-path-id="${row.pathId}" data-beam-solution-case-id="${row.loadCaseId}">
      <strong>${row.loadCaseId}</strong> · ${row.qualification}<br>
      Applied ${format(row.appliedForceTotalN)} N · Support ${format(row.supportForceTotalN)} N<br>
      Max v ${format(row.maximumAbsoluteDisplacementM)} m · Max θ ${format(row.maximumAbsoluteRotationRad)} rad<br>
      Force residual ${format(row.forceEquilibrium?.residual)} N · Moment residual ${format(row.momentEquilibrium?.residual)} N·m · Matrix residual ${format(row.matrixResidual?.residual)}
      ${row.blockers.length ? `<br>Blockers ${row.blockers.join(', ')}` : ''}
    </div>`).join('');
  return `<div data-role="vertical-beam-solution-health">${rows}</div>`;
}
function statusText(status) {
  if (status.state === 'failed') return status.message || 'Vertical-beam operation failed.';
  if (status.state === 'rebuilt') return 'Vertical beam model rebuilt.';
  if (status.state === 'solved') return 'Vertical stiffness solution completed.';
  if (status.state === 'exported') return `Exported ${status.filename}`;
  return '';
}
function format(value) { return value === null || value === undefined ? '—' : Number(value).toPrecision(8).replace(/\.0+$/, ''); }
