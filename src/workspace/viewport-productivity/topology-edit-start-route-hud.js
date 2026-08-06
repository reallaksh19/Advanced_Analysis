const FIELD_KEYS = Object.freeze([
  'startX', 'startY', 'startZ', 'endX', 'endY', 'endZ',
  'axisLock', 'catalogueRecordId', 'minimumLengthMm', 'overlapToleranceMm',
]);

export function createStartRouteHudValues() {
  return {
    inputMode: 'TYPED',
    startX: '', startY: '', startZ: '',
    endX: '', endY: '', endZ: '',
    axisLock: 'FREE', catalogueRecordId: '',
    minimumLengthMm: '', overlapToleranceMm: '',
  };
}

export function readStartRouteHud(element, fallback = createStartRouteHudValues()) {
  if (!element) return { ...fallback };
  const value = (key) => element.querySelector(`[data-start-route-field="${key}"]`)?.value
    ?? fallback[key] ?? '';
  return {
    inputMode: value('inputMode').toUpperCase(),
    ...Object.fromEntries(FIELD_KEYS.map((key) => [key, value(key)])),
  };
}

export function writeStartRouteHudPoint(element, role, point) {
  for (const axis of ['X', 'Y', 'Z']) {
    const input = element?.querySelector(
      `[data-start-route-field="${role}${axis}"]`,
    );
    if (input) input.value = String(point[axis.toLowerCase()]);
  }
}

export function renderStartRouteHud(element, context = {}) {
  const hud = element?.querySelector('.topology-edit-authoring-hud');
  if (!hud) return;
  const values = context.values ?? createStartRouteHudValues();
  hud.dataset.authoringPhase = context.phase;
  appendStartRouteButton(hud, context);
  const status = hud.querySelector('.topology-edit-authoring-hud__status');
  if (status) status.innerHTML = `<span class="topology-edit-authoring-hud__phase">${escapeHtml(
    context.phase.replaceAll('_', ' '),
  )}</span><span>${escapeHtml(context.message)}</span>`;
  const target = hud.querySelector('.topology-edit-authoring-hud__target');
  if (target) target.innerHTML = '<strong>START ROUTE</strong><span>Exact typed XYZ or one current deterministic viewport snap per endpoint.</span>';
  hud.querySelector('[data-role="topology-edit-authoring-form"]')?.remove();
  const actions = hud.querySelector('.topology-edit-authoring-hud__actions');
  actions?.insertAdjacentHTML('beforebegin', formHtml(values, context));
  if (context.error) {
    const row = documentRow(hud, 'p', 'topology-edit-authoring-hud__error');
    row.setAttribute('role', 'alert');
    row.textContent = context.error;
    actions?.before(row);
  }
  if (actions) actions.innerHTML = actionHtml(context);
  const evidence = hud.querySelector('.topology-edit-authoring-hud__evidence');
  if (evidence) evidence.innerHTML = evidenceHtml(context);
}

function appendStartRouteButton(hud, context) {
  const tools = hud.querySelector('.topology-edit-authoring-hud__tools');
  if (!tools || tools.querySelector('[data-action="activate-authoring-start-route"]')) return;
  const button = documentRow(hud, 'button');
  button.type = 'button';
  button.dataset.action = 'activate-authoring-start-route';
  button.textContent = 'Start Route';
  button.disabled = Boolean(context.pending);
  button.setAttribute('aria-pressed', 'true');
  tools.prepend(button);
}

function formHtml(values, context) {
  const viewport = values.inputMode === 'VIEWPORT';
  const options = [
    '<option value="">Select exact PIPE record</option>',
    ...(context.pipeOptions ?? []).map((row) => `<option value="${escapeHtml(row.recordId)}" ${
      values.catalogueRecordId === row.recordId ? 'selected' : ''
    }>${escapeHtml(row.label)}</option>`),
  ].join('');
  return `<form class="topology-edit-authoring-hud__form" data-role="topology-edit-authoring-form">
    ${selectField('Input mode', 'inputMode', values.inputMode, ['TYPED', 'VIEWPORT'], context.pending)}
    <fieldset><legend>Start point (mm)</legend>${pointFields('start', values, context.pending || viewport)}</fieldset>
    <button type="button" data-action="capture-start-route-start" ${!viewport || context.pending ? 'disabled' : ''}>Use current exact snap as start</button>
    <fieldset><legend>End point (mm)</legend>${pointFields('end', values, context.pending || viewport)}</fieldset>
    <button type="button" data-action="capture-start-route-end" ${!viewport || context.pending ? 'disabled' : ''}>Use current exact snap as end</button>
    ${selectField('Axis lock', 'axisLock', values.axisLock, ['FREE', 'X', 'Y', 'Z'], context.pending)}
    <label><span>Pipe catalogue record</span><span class="topology-edit-authoring-hud__authority">CATALOGUE</span><select data-start-route-field="catalogueRecordId" ${context.pending ? 'disabled' : ''}>${options}</select></label>
    ${numberField('Minimum segment length', 'minimumLengthMm', values.minimumLengthMm, 'mm', context.pending)}
    ${numberField('Overlap tolerance', 'overlapToleranceMm', values.overlapToleranceMm, 'mm', context.pending)}
  </form>`;
}

function pointFields(role, values, disabled) {
  return ['X', 'Y', 'Z'].map((axis) => numberField(
    axis,
    `${role}${axis}`,
    values[`${role}${axis}`],
    'mm',
    disabled,
  )).join('');
}
function numberField(label, key, value, unit, disabled) {
  return `<label><span>${escapeHtml(label)} (${unit})</span><span class="topology-edit-authoring-hud__authority">USER INPUT</span><input type="number" step="any" data-start-route-field="${key}" value="${escapeHtml(value)}" ${disabled ? 'disabled' : ''}></label>`;
}
function selectField(label, key, value, options, disabled) {
  return `<label><span>${escapeHtml(label)}</span><span class="topology-edit-authoring-hud__authority">USER INPUT</span><select data-start-route-field="${key}" ${disabled ? 'disabled' : ''}>${options.map((option) => `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label>`;
}
function actionHtml(context) {
  return `
    <button type="button" data-action="preview-authoring-operation" ${context.pending ? 'disabled' : ''}>Preview</button>
    <button type="button" data-action="validate-authoring-operation" ${!context.candidate || context.pending ? 'disabled' : ''}>Validate</button>
    <button type="button" data-action="apply-authoring-operation" ${context.phase !== 'READY_TO_APPLY' || context.pending ? 'disabled' : ''}>Apply</button>
    <button type="button" data-action="cancel-authoring-operation">Cancel</button>
    <button type="button" data-action="undo-start-route-operation" ${!context.canUndo ? 'disabled' : ''}>Undo route</button>
    <button type="button" data-action="redo-start-route-operation" ${!context.canRedo ? 'disabled' : ''}>Redo route</button>`;
}
function evidenceHtml(context) {
  return `<span>${context.candidate ? '3 certified commands' : 'No candidate'}</span>
    <span>${context.validation ? `${context.validation.diagnosticCount} final issue(s)` : 'Not validated'}</span>
    <span>${escapeHtml(context.inputAuthority ?? 'TYPED')}</span>`;
}
function documentRow(hud, tag, className = '') {
  const row = hud.ownerDocument.createElement(tag);
  if (className) row.className = className;
  return row;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function renderStartRouteRuntime(runtime, pipeOptions) {
  const element = runtime.element;
  if (!element) return;
  const tools = element.querySelector('.topology-edit-authoring-hud__tools');
  if (tools && !tools.querySelector('[data-action="activate-authoring-start-route"]')) {
    const button = element.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.action = 'activate-authoring-start-route';
    button.textContent = 'Start Route';
    button.disabled = runtime.pending;
    button.setAttribute('aria-pressed', String(runtime.startRouteActive));
    tools.prepend(button);
  }
  if (!runtime.startRouteActive) return;
  renderStartRouteHud(element, {
    phase: runtime.startRouteRuntime.phase,
    message: runtime.message,
    error: runtime.error,
    pending: runtime.pending,
    values: runtime.startRouteValues,
    pipeOptions,
    candidate: runtime.candidate,
    validation: runtime.validation,
    canUndo: runtime.transaction?.resultingCanonicalHash
      === runtime.controller.session?.currentTopology()?.canonicalTopologyHash,
    canRedo: runtime.redoTransaction?.priorCanonicalHash
      === runtime.controller.session?.currentTopology()?.canonicalTopologyHash,
    inputAuthority: runtime.startRouteValues.inputMode,
  });
}

export function updateStartRouteRuntimeEvidence(runtime) {
  const host = runtime.controller.hostElement;
  if (!host) return;
  const keys = [
    'topologyEditStartRouteRuntimeHash',
    'topologyEditStartRouteEngineeringReferenceHash',
    'topologyEditStartRouteInputMode',
    'topologyEditStartRoutePreviewHash',
    'topologyEditStartRouteValidationHash',
  ];
  if (!runtime.startRouteActive) {
    keys.forEach((key) => { host.dataset[key] = ''; });
    return;
  }
  host.dataset.topologyEditAuthoringTool = 'START_ROUTE';
  host.dataset.topologyEditAuthoringPhase = runtime.startRouteRuntime.phase;
  host.dataset.topologyEditStartRouteRuntimeHash = runtime.startRouteRuntime.runtimeHash;
  host.dataset.topologyEditStartRouteEngineeringReferenceHash =
    runtime.startRouteRuntime.engineeringReferenceHash;
  host.dataset.topologyEditStartRouteInputMode = runtime.startRouteValues.inputMode;
  host.dataset.topologyEditStartRoutePreviewHash = runtime.preview?.previewHash ?? '';
  host.dataset.topologyEditStartRouteValidationHash = runtime.validation?.validationHash ?? '';
}
