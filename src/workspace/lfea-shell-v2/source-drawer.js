import { workbenchButton, workbenchElement } from '../workbench-dom.js';

export function renderLfeaSourceDrawer(root, state, handlers, open = false) {
  const details = workbenchElement(root, 'details', 'lfea-shell-v2__source-drawer');
  details.open = open;
  details.dataset.role = 'lfea-source-drawer';
  details.append(workbenchElement(root, 'summary', null, 'Advanced source · validated mesh package'));

  const body = workbenchElement(root, 'div', 'lfea-shell-v2__source-body');
  const textarea = workbenchElement(root, 'textarea');
  textarea.dataset.role = 'lfea-package-json';
  textarea.spellcheck = false;
  textarea.value = state.packageValue ? JSON.stringify(state.packageValue, null, 2) : '';
  textarea.placeholder = 'Import a hash-valid lfea-mesh-package/v1.';

  const apply = workbenchButton(
    root,
    'Apply and reseal local edit',
    () => handlers.onApplyJson(textarea.value),
  );
  apply.disabled = !state.packageValue;
  body.append(
    workbenchElement(
      root,
      'p',
      'lfea-shell-v2__muted',
      'External imports are hash-validated. This editor reseals only explicit local edits.',
    ),
    textarea,
    apply,
  );
  details.append(body);
  return details;
}
