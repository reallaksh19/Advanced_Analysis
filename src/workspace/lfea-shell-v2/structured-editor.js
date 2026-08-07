import { valueAtPath, workbenchButton, workbenchElement } from '../workbench-dom.js';
import {
  isLfeaEditorGuardCurrent,
  lfeaEditorGuard,
  lfeaStructuredEditorContract,
} from '../lfea-structured-editor-contract.js';
import { renderLfeaEditorFields } from './editor-fields.js';

export function renderLfeaStructuredEditor(
  root,
  state,
  path,
  selectedIndex,
  handlers,
) {
  const contract = lfeaStructuredEditorContract(path);
  const panel = workbenchElement(root, 'section', 'lfea-shell-v2__structured-editor');
  panel.dataset.role = 'lfea-structured-record-editor';
  if (!contract) {
    panel.append(workbenchElement(root, 'p', 'lfea-shell-v2__muted', 'No structured editor contract is registered for this collection.'));
    return panel;
  }

  const rows = valueAtPath(state.packageValue, path);
  const selected = selectedIndex >= 0 ? rows[selectedIndex] ?? null : null;
  const guard = lfeaEditorGuard(state, path, selectedIndex);
  const heading = workbenchElement(
    root,
    'div',
    'lfea-shell-v2__editor-heading',
  );
  heading.append(
    workbenchElement(root, 'strong', null, contract.label),
    workbenchElement(
      root,
      'span',
      null,
      selected ? `Editing record ${selectedIndex + 1}` : 'New record',
    ),
  );

  const rendered = renderLfeaEditorFields(root, state, contract, selected);
  const actions = workbenchElement(root, 'div', 'lfea-workbench__record-actions');

  if (selected) {
    actions.append(
      workbenchButton(root, 'Apply changes', () => commitUpdate()),
      workbenchButton(root, 'Delete record', () => commitDelete()),
      workbenchButton(root, 'New record', () => handlers.onRecordSelect(-1)),
    );
  } else {
    actions.append(workbenchButton(root, 'Add record', () => commitAdd()));
  }

  panel.append(heading, rendered.element, actions);
  return panel;

  function current() {
    return isLfeaEditorGuardCurrent(
      guard,
      handlers.getCurrentState(),
      path,
      selectedIndex,
    );
  }

  function stale() {
    handlers.onDraftStale();
  }

  function commitAdd() {
    if (!current()) return stale();
    handlers.onAddRecord(path, JSON.stringify(rendered.readRecord()));
  }

  function commitUpdate() {
    if (!current()) return stale();
    handlers.onUpdateRecord(
      path,
      selectedIndex,
      JSON.stringify(rendered.readRecord()),
    );
  }

  function commitDelete() {
    if (!current()) return stale();
    handlers.onDeleteRecord(path, selectedIndex);
    handlers.onRecordSelect(-1);
  }
}
