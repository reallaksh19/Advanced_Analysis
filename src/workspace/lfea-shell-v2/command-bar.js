import { LFEA_RESULT_MODES } from '../lfea-workbench-model.js';
import { workbenchButton, workbenchElement } from '../workbench-dom.js';

export function renderLfeaCommandBar(root, state, model, handlers) {
  const bar = workbenchElement(root, 'header', 'lfea-shell-v2__command-bar');
  const identity = workbenchElement(root, 'div', 'lfea-shell-v2__identity');
  identity.append(
    workbenchElement(root, 'strong', null, 'LFEA'),
    statusBadge(root, state.status),
    identityText(root, model.identity),
  );
  if (state.progress) identity.append(progressText(root, state.progress));

  const actions = workbenchElement(root, 'div', 'lfea-shell-v2__command-actions');
  actions.append(
    importControl(root, handlers),
    action(root, 'Run', 'lfea-run', handlers.onRun, !model.commands.canRun),
    action(root, 'Cancel', 'lfea-cancel-run', handlers.onCancelRun, !model.commands.canCancel),
    action(root, 'Benchmark', 'lfea-benchmark', handlers.onBenchmark, false),
    action(root, 'Undo', 'lfea-undo', handlers.onUndo, !model.commands.canUndo),
    action(root, 'Redo', 'lfea-redo', handlers.onRedo, !model.commands.canRedo),
    resultMode(root, state, handlers),
  );
  if (hasQualifiedDisplacements(state.execution)) {
    actions.append(deformationScale(root, state, handlers));
  }

  const exports = workbenchElement(root, 'div', 'lfea-shell-v2__command-actions');
  exports.append(
    action(
      root,
      'Export package',
      'lfea-export-package',
      handlers.onExportDocument,
      !model.commands.canExportPackage,
    ),
    action(
      root,
      'Export evidence',
      'lfea-export-evidence',
      handlers.onExportEvidence,
      !model.commands.canExportEvidence,
    ),
  );
  bar.append(identity, actions, exports);
  return bar;
}

function statusBadge(root, status) {
  const value = workbenchElement(root, 'output', 'lfea-workbench__status', status);
  value.dataset.status = status;
  value.setAttribute('aria-live', 'polite');
  return value;
}

function progressText(root, progress) {
  const value = workbenchElement(
    root,
    'output',
    'lfea-workbench__progress',
    `${progress.stage} ${progress.index}/${progress.total}`,
  );
  value.setAttribute('role', 'status');
  value.setAttribute('aria-live', 'polite');
  return value;
}

function identityText(root, identity) {
  const text = identity.semanticHash
    ? `Model v${identity.modelVersion} · ${identity.semanticHash.slice(0, 12)}…`
    : 'No model loaded';
  const value = workbenchElement(root, 'span', 'lfea-shell-v2__identity-text', text);
  value.dataset.lfeaValueKey = 'packageSemanticHash';
  return value;
}

function importControl(root, handlers) {
  const label = workbenchElement(root, 'label', 'lfea-shell-v2__file-button', 'Import mesh');
  const input = workbenchElement(root, 'input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.dataset.role = 'lfea-import';
  input.addEventListener('change', () => handlers.onFile(input.files?.[0] ?? null));
  label.append(input);
  return label;
}

function action(root, text, role, handler, disabled) {
  const button = workbenchButton(root, text, handler);
  button.dataset.role = role;
  button.disabled = disabled;
  if (role === 'lfea-cancel-run') button.hidden = disabled;
  return button;
}

function resultMode(root, state, handlers) {
  const label = workbenchElement(root, 'label', 'lfea-shell-v2__control-label', 'View ');
  const select = workbenchElement(root, 'select');
  select.dataset.role = 'lfea-result-mode';
  for (const value of LFEA_RESULT_MODES) {
    const option = workbenchElement(root, 'option', null, value.replaceAll('_', ' '));
    option.value = value;
    option.selected = value === state.display.resultMode;
    option.disabled = value === 'DEFORMED'
      ? !hasQualifiedDisplacements(state.execution)
      : value === 'PROJECTED_STRESS' && !state.execution?.stressProjection;
    select.append(option);
  }
  select.addEventListener('change', () => handlers.onResultMode(select.value));
  label.append(select);
  return label;
}

function deformationScale(root, state, handlers) {
  const label = workbenchElement(
    root,
    'label',
    'lfea-shell-v2__control-label',
    'Scale ',
  );
  const input = workbenchElement(root, 'input');
  input.type = 'number';
  input.min = '0';
  input.step = 'any';
  input.value = String(state.display.deformationScale);
  input.dataset.role = 'lfea-deformation-scale';
  input.addEventListener('change', () => handlers.onDeformationScale(input.value));
  label.append(input);
  return label;
}

function hasQualifiedDisplacements(execution) {
  return execution?.result?.status === 'QUALIFIED'
    && Array.isArray(execution.result.nodalDisplacements)
    && execution.result.nodalDisplacements.length > 0;
}
