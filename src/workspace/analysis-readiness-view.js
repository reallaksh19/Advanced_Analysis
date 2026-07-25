export function renderAnalysisCapabilities(documentRef, capabilities, activeSession) {
  const section = documentRef.createElement('section');
  section.className = 'analysis-capabilities';
  section.dataset.role = 'analysis-capabilities';
  const heading = documentRef.createElement('h3');
  heading.textContent = 'Contextual analysis readiness';
  section.append(heading);

  if (!capabilities.length) {
    const empty = documentRef.createElement('p');
    empty.className = 'panel-empty';
    empty.textContent = 'No registered analysis capability is available for this selection.';
    section.append(empty);
    return section;
  }

  capabilities.forEach((capability) => section.append(renderCapability(documentRef, capability, activeSession)));
  return section;
}

function renderCapability(documentRef, capability, activeSession) {
  const readiness = capability.readiness || fallbackReadiness(capability);
  const card = documentRef.createElement('article');
  card.className = `analysis-capability analysis-capability--${statusClass(readiness)}`;
  card.dataset.readinessAnalysisType = capability.analysisType;
  card.dataset.solverId = readiness.solverId || capability.solverId || '';
  card.dataset.methodId = readiness.methodId || capability.methodId || '';
  card.dataset.qualificationStatus = readiness.qualificationStatus || '';
  card.dataset.readyToReview = String(readiness.readyToReview === true);
  card.dataset.readyToRun = String(readiness.readyToRun === true);

  const titleRow = documentRef.createElement('div');
  titleRow.className = 'analysis-capability__title-row';
  const title = documentRef.createElement('strong');
  title.textContent = capability.label;
  const badge = documentRef.createElement('span');
  badge.className = 'analysis-readiness-badge';
  badge.dataset.role = 'analysis-readiness-status';
  badge.textContent = readiness.qualificationStatus || 'UNKNOWN';
  titleRow.append(title, badge);

  const description = documentRef.createElement('p');
  description.textContent = capability.description || capability.engineeringLevel;
  const metadata = metadataGrid(documentRef, readiness);
  const summary = documentRef.createElement('p');
  summary.className = 'analysis-readiness-summary';
  summary.dataset.role = 'analysis-readiness-summary';
  summary.textContent = summaryText(readiness);

  const action = documentRef.createElement('button');
  action.type = 'button';
  action.className = 'analysis-action';
  action.dataset.analysisType = capability.analysisType;
  action.dataset.analysisAction = 'open-session';
  action.disabled = readiness.readyToReview !== true;
  action.textContent = activeSession?.analysisType === capability.analysisType
    ? `Reviewing inputs · ${capability.label}`
    : `Review inputs · ${capability.label}`;

  card.append(titleRow, description, metadata, summary);
  if (readiness.assumptions?.length) card.append(evidenceDetails(documentRef, 'Assumptions', readiness.assumptions));
  if (readiness.limitations?.length) card.append(evidenceDetails(documentRef, 'Limitations', readiness.limitations));
  if (readiness.diagnostics?.length) {
    card.append(evidenceDetails(
      documentRef,
      'Readiness diagnostics',
      readiness.diagnostics.map((item) => `${item.code}: ${item.message}`),
    ));
  }
  card.append(action);
  return card;
}

function metadataGrid(documentRef, readiness) {
  const grid = documentRef.createElement('dl');
  grid.className = 'analysis-readiness-metadata';
  const rows = [
    ['Solver', joinVersion(readiness.solverId, readiness.solverVersion)],
    ['Method', joinVersion(readiness.methodId, readiness.methodVersion)],
    ['Engineering level', readiness.engineeringLevel],
    ['Applicable', readiness.applicable ? 'Yes' : 'No'],
    ['Code / method basis', (readiness.codeBasis || []).join('; ')],
  ];
  rows.forEach(([label, value]) => {
    const term = documentRef.createElement('dt');
    term.textContent = label;
    const description = documentRef.createElement('dd');
    description.textContent = value || '—';
    grid.append(term, description);
  });
  return grid;
}

function evidenceDetails(documentRef, label, values) {
  const details = documentRef.createElement('details');
  details.className = 'analysis-readiness-details';
  const summary = documentRef.createElement('summary');
  summary.textContent = `${label} (${values.length})`;
  const list = documentRef.createElement('ul');
  values.forEach((value) => {
    const item = documentRef.createElement('li');
    item.textContent = value;
    list.append(item);
  });
  details.append(summary, list);
  return details;
}

function summaryText(readiness) {
  if (!readiness.applicable) return readiness.applicabilityReason || 'Not applicable to this selection.';
  if (readiness.readyToRun) return `Ready to run · ${readiness.resolvedInputs?.length || 0} resolved inputs.`;
  return `Review required · ${readiness.missingInputs?.length || 0} missing · ${readiness.invalidInputs?.length || 0} invalid.`;
}

function statusClass(readiness) {
  if (!readiness.applicable) return 'not-applicable';
  return readiness.readyToRun ? 'ready' : 'input-required';
}

function joinVersion(id, version) {
  if (!id) return '';
  return version ? `${id} · v${version}` : id;
}

function fallbackReadiness(capability) {
  return {
    solverId: capability.solverId || '',
    solverVersion: capability.solverVersion || '',
    methodId: capability.methodId || '',
    methodVersion: capability.methodVersion || '',
    engineeringLevel: capability.engineeringLevel || '',
    codeBasis: [],
    applicable: true,
    applicabilityReason: '',
    qualificationStatus: capability.enabled ? 'READY_FOR_REVIEWED_EXECUTION' : 'INPUT_REQUIRED',
    resolvedInputs: [],
    missingInputs: (capability.missing || []).map((key) => ({ key })),
    invalidInputs: [],
    assumptions: [],
    limitations: [],
    diagnostics: capability.reason ? [{ code: 'LEGACY_READINESS', message: capability.reason }] : [],
    readyToReview: true,
    readyToRun: capability.enabled === true,
  };
}
