export function createConnectEndpointsHudValues() {
  return {
    catalogueRecordId: '',
    minimumLengthMm: '',
    overlapToleranceMm: '',
    allowDirect: false,
    allowOrthogonal: false,
    maxAlternatives: '',
    alternativeId: '',
  };
}

export function readConnectEndpointsHud(element, fallback = createConnectEndpointsHudValues()) {
  if (!element) return { ...fallback };
  const value = (key) => element.querySelector(`[data-connect-field="${key}"]`)?.value
    ?? fallback[key] ?? '';
  const checked = (key) => element.querySelector(`[data-connect-field="${key}"]`)?.checked
    ?? Boolean(fallback[key]);
  return {
    catalogueRecordId: value('catalogueRecordId'),
    minimumLengthMm: value('minimumLengthMm'),
    overlapToleranceMm: value('overlapToleranceMm'),
    allowDirect: checked('allowDirect'),
    allowOrthogonal: checked('allowOrthogonal'),
    maxAlternatives: value('maxAlternatives'),
    alternativeId: value('alternativeId'),
  };
}

export function readConnectElbowSelections(element) {
  return [...(element?.querySelectorAll('[data-connect-elbow-turn-hash]') ?? [])]
    .map((control) => ({
      turnHash: control.dataset.connectElbowTurnHash,
      location: control.dataset.connectElbowLocation,
      recordId: control.value,
    }))
    .filter((row) => row.recordId);
}

export function renderConnectEndpointsRuntime(runtime, pipeOptions) {
  const element = runtime.element;
  if (!element) return;
  const tools = element.querySelector('.topology-edit-authoring-hud__tools');
  if (tools && !tools.querySelector('[data-action="activate-authoring-connect-ends"]')) {
    const button = element.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.action = 'activate-authoring-connect-ends';
    button.textContent = 'Connect ends';
    button.disabled = runtime.pending;
    button.setAttribute('aria-pressed', String(runtime.connectEndpointsActive));
    tools.prepend(button);
  }
  if (!runtime.connectEndpointsActive) return;
  renderConnectHud(element, {
    phase: runtime.connectPhase(),
    message: runtime.message,
    error: runtime.error,
    pending: runtime.pending,
    values: runtime.connectValues,
    pipeOptions,
    startEndpoint: runtime.connectStartEndpoint,
    endEndpoint: runtime.connectEndEndpoint,
    plan: runtime.connectPlan,
    operation: runtime.connectOperation,
    candidate: runtime.candidate,
    validation: runtime.validation,
    elbowOptions: runtime.connectElbowOptions,
    canUndo: runtime.transaction?.schema === 'TopologyEditConnectEndpointsTransaction.v1'
      && runtime.transaction.resultingCanonicalHash
        === runtime.controller.session?.currentTopology()?.canonicalTopologyHash,
    canRedo: runtime.redoTransaction?.schema === 'TopologyEditConnectEndpointsTransaction.v1'
      && runtime.redoTransaction.priorCanonicalHash
        === runtime.controller.session?.currentTopology()?.canonicalTopologyHash,
  });
}

function renderConnectHud(element, context) {
  const hud = element.querySelector('.topology-edit-authoring-hud');
  if (!hud) return;
  hud.dataset.authoringPhase = context.phase;
  const status = hud.querySelector('.topology-edit-authoring-hud__status');
  if (status) status.innerHTML = `<span class="topology-edit-authoring-hud__phase">${escapeHtml(
    context.phase.replaceAll('_', ' '),
  )}</span><span>${escapeHtml(context.message)}</span>`;
  const target = hud.querySelector('.topology-edit-authoring-hud__target');
  if (target) target.innerHTML = '<strong>CONNECT EXISTING ENDS</strong><span>Capture two exact graph-open canonical pipe endpoints, then choose one ranked route.</span>';
  hud.querySelector('[data-role="topology-edit-authoring-form"]')?.remove();
  const actions = hud.querySelector('.topology-edit-authoring-hud__actions');
  actions?.insertAdjacentHTML('beforebegin', formHtml(context));
  hud.querySelector('.topology-edit-authoring-hud__error')?.remove();
  if (context.error) {
    const row = hud.ownerDocument.createElement('p');
    row.className = 'topology-edit-authoring-hud__error';
    row.setAttribute('role', 'alert');
    row.textContent = context.error;
    actions?.before(row);
  }
  if (actions) actions.innerHTML = actionHtml(context);
  const evidence = hud.querySelector('.topology-edit-authoring-hud__evidence');
  if (evidence) evidence.innerHTML = evidenceHtml(context);
}

function formHtml(context) {
  const values = context.values;
  const pipeOptions = [
    '<option value="">Select exact PIPE record</option>',
    ...context.pipeOptions.map((row) => `<option value="${escapeHtml(row.recordId)}" ${
      values.catalogueRecordId === row.recordId ? 'selected' : ''
    }>${escapeHtml(row.label)}</option>`),
  ].join('');
  return `<form class="topology-edit-authoring-hud__form" data-role="topology-edit-authoring-form">
    ${endpointHtml('Start endpoint', context.startEndpoint)}
    <button type="button" data-action="capture-connect-start" ${context.pending ? 'disabled' : ''}>Use selected node as start</button>
    ${endpointHtml('End endpoint', context.endEndpoint)}
    <button type="button" data-action="capture-connect-end" ${context.pending ? 'disabled' : ''}>Use selected node as end</button>
    <label><span>Pipe catalogue record</span><span class="topology-edit-authoring-hud__authority">CATALOGUE</span><select data-connect-field="catalogueRecordId" ${context.pending ? 'disabled' : ''}>${pipeOptions}</select></label>
    ${numberField('Minimum segment length', 'minimumLengthMm', values.minimumLengthMm, 'mm', context.pending)}
    ${numberField('Overlap tolerance', 'overlapToleranceMm', values.overlapToleranceMm, 'mm', context.pending)}
    ${checkField('Allow direct routes', 'allowDirect', values.allowDirect, context.pending)}
    ${checkField('Allow orthogonal routes', 'allowOrthogonal', values.allowOrthogonal, context.pending)}
    ${numberField('Maximum ranked alternatives', 'maxAlternatives', values.maxAlternatives, 'count', context.pending)}
    ${alternativesHtml(context)}
    ${fittingsHtml(context)}
  </form>`;
}

function endpointHtml(label, endpoint) {
  return `<p><strong>${escapeHtml(label)}</strong><br><span>${endpoint
    ? `${escapeHtml(endpoint.nodeId)} · rev ${escapeHtml(endpoint.nodeRevision)}`
    : 'Not captured'}</span></p>`;
}
function alternativesHtml(context) {
  if (!context.plan) return '<p>Ranked alternatives: not planned.</p>';
  const options = [
    '<option value="">Select one ranked alternative</option>',
    ...context.plan.alternatives.map((row) => `<option value="${escapeHtml(row.alternativeId)}" ${
      context.values.alternativeId === row.alternativeId ? 'selected' : ''
    }>#${row.rank} · ${escapeHtml(row.signature)} · ${row.fittingCount} fitting(s) · ${row.totalLengthMm.toFixed(3)} mm${
      row.blockerCodes.length ? ` · BLOCKED ${escapeHtml(row.blockerCodes.join(','))}` : ''
    }</option>`),
  ].join('');
  return `<label><span>Ranked route alternative</span><span class="topology-edit-authoring-hud__authority">PLANNER</span><select data-connect-field="alternativeId" ${context.pending ? 'disabled' : ''}>${options}</select></label>
    <p>Endpoint compatibility: <strong>${escapeHtml(context.plan.compatibilityStatus)}</strong></p>`;
}
function fittingsHtml(context) {
  if (!context.values.alternativeId || !context.plan) return '<p>Governed fittings: select a ranked alternative.</p>';
  if (!context.elbowOptions.length) return '<p>Governed fittings: no elbow required.</p>';
  return `<fieldset><legend>Governed fitting evidence</legend>${context.elbowOptions.map((row) => {
    if (!row.options.length) return `<p>${escapeHtml(row.location)} · ${row.angleDeg.toFixed(3)}° · NO COMPATIBLE ELBOW</p>`;
    if (row.options.length === 1) return `<p>${escapeHtml(row.location)} · ${row.angleDeg.toFixed(3)}° · ${escapeHtml(row.options[0].label)} · UNIQUE EXACT</p>`;
    const options = ['<option value="">Select exact ELBOW record</option>', ...row.options.map((option) => (
      `<option value="${escapeHtml(option.recordId)}">${escapeHtml(option.label)}</option>`
    ))].join('');
    return `<label><span>${escapeHtml(row.location)} · ${row.angleDeg.toFixed(3)}°</span><span class="topology-edit-authoring-hud__authority">CATALOGUE</span><select data-connect-elbow-turn-hash="${escapeHtml(row.turnHash)}" data-connect-elbow-location="${escapeHtml(row.location)}" ${context.pending ? 'disabled' : ''}>${options}</select></label>`;
  }).join('')}</fieldset>`;
}
function numberField(label, key, value, unit, disabled) {
  return `<label><span>${escapeHtml(label)} (${unit})</span><span class="topology-edit-authoring-hud__authority">USER INPUT</span><input type="number" step="any" data-connect-field="${key}" value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''}></label>`;
}
function checkField(label, key, checked, disabled) {
  return `<label><span>${escapeHtml(label)}</span><span class="topology-edit-authoring-hud__authority">USER INPUT</span><input type="checkbox" data-connect-field="${key}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}></label>`;
}
function actionHtml(context) {
  return `<button type="button" data-action="plan-connect-alternatives" ${context.pending ? 'disabled' : ''}>Plan alternatives</button>
    <button type="button" data-action="preview-authoring-operation" ${!context.plan || !context.values.alternativeId || context.pending ? 'disabled' : ''}>Preview</button>
    <button type="button" data-action="validate-authoring-operation" ${!context.candidate || context.pending ? 'disabled' : ''}>Validate</button>
    <button type="button" data-action="apply-authoring-operation" ${context.validation?.status !== 'READY_TO_APPLY' || context.pending ? 'disabled' : ''}>Apply</button>
    <button type="button" data-action="cancel-authoring-operation">Cancel</button>
    <button type="button" data-action="undo-connect-ends-operation" ${!context.canUndo ? 'disabled' : ''}>Undo connection</button>
    <button type="button" data-action="redo-connect-ends-operation" ${!context.canRedo ? 'disabled' : ''}>Redo connection</button>`;
}
function evidenceHtml(context) {
  return `<span>${context.plan ? `${context.plan.alternatives.length} ranked alternative(s)` : 'Not planned'}</span>
    <span>${context.operation ? `${context.operation.bendCount} governed elbow(s)` : 'No fitting binding'}</span>
    <span>${context.validation ? `${context.validation.diagnosticCount} new final issue(s)` : 'Not validated'}</span>`;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function updateConnectEndpointsEvidence(runtime) {
  const host = runtime.controller.hostElement;
  if (!host) return;
  const keys = [
    'topologyEditConnectStartEndpointHash', 'topologyEditConnectEndEndpointHash',
    'topologyEditConnectPlanHash', 'topologyEditConnectAlternativeId',
    'topologyEditConnectOperationHash', 'topologyEditConnectPreviewHash',
    'topologyEditConnectValidationHash', 'topologyEditConnectElbowBindingHashes',
  ];
  if (!runtime.connectEndpointsActive) {
    keys.forEach((key) => { host.dataset[key] = ''; });
    return;
  }
  host.dataset.topologyEditAuthoringTool = 'CONNECT_EXISTING_ENDS';
  host.dataset.topologyEditAuthoringPhase = runtime.connectPhase();
  host.dataset.topologyEditConnectStartEndpointHash = runtime.connectStartEndpoint?.endpointCaptureHash ?? '';
  host.dataset.topologyEditConnectEndEndpointHash = runtime.connectEndEndpoint?.endpointCaptureHash ?? '';
  host.dataset.topologyEditConnectPlanHash = runtime.connectPlan?.planHash ?? '';
  host.dataset.topologyEditConnectAlternativeId = runtime.connectValues.alternativeId ?? '';
  host.dataset.topologyEditConnectOperationHash = runtime.connectOperation?.operationHash ?? '';
  host.dataset.topologyEditConnectPreviewHash = runtime.preview?.previewHash ?? '';
  host.dataset.topologyEditConnectValidationHash = runtime.validation?.validationHash ?? '';
  host.dataset.topologyEditConnectElbowBindingHashes = (runtime.connectOperation?.elbowBindingHashes ?? []).join(',');
}
