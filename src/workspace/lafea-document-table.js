/**
 * Stage-specific LAFEA source editor.
 *
 * The primary surface renders only governed StageInputDescriptor/v2 fields.
 * Raw JSON remains an advanced whole-document replacement view. The editor does
 * not recurse arbitrary keys, mutate the frozen document or infer identity from
 * array position.
 */
import {
  lafeaStageInputDescriptors,
} from './lafea-stage-input-descriptors.js';
import {
  renderLafeaDescriptorForm,
} from './lafea-document-table-form.js';
import {
  createLafeaDocumentTableTabButton,
  normalizeLafeaDocumentTableHandlers,
  renderLafeaJsonEditor,
} from './lafea-document-table-support.js';

/** Render governed typed fields and the advanced whole-document JSON view. */
export function renderDocumentTableEditor(
  rootElement,
  stageId,
  documentValue,
  handlers,
) {
  const documentRef = rootElement.ownerDocument || document;
  const container = documentRef.createElement('div');
  container.className = 'lafea-doc-table-view';

  if (!documentValue || typeof documentValue !== 'object') {
    const empty = documentRef.createElement('p');
    empty.className = 'lafea-workbench-svg__empty';
    empty.textContent = 'No validated stage source document is loaded.';
    container.append(empty);
    return container;
  }

  const callbacks = normalizeLafeaDocumentTableHandlers(handlers);
  const descriptors = lafeaStageInputDescriptors(stageId);
  let mode = 'FORM';

  const notice = documentRef.createElement('p');
  notice.className = 'lafea-doc-table-notice';
  notice.textContent = descriptors.length
    ? 'Governed stage-specific inputs. Every edit uses an exact descriptor and engineering identity.'
    : 'No editable input descriptors are registered for this stage. Calculation and source editing remain blocked.';

  if (!descriptors.length) {
    const blocked = documentRef.createElement('p');
    blocked.className = 'lafea-workbench-svg__empty';
    blocked.dataset.role = 'lafea-source-edit-blocked';
    blocked.textContent = `${stageId} retained placeholder source is read-only. Raw JSON replacement is not authorized.`;
    container.append(notice, blocked);
    return container;
  }

  const toolbar = documentRef.createElement('div');
  toolbar.className = 'lafea-doc-table-toolbar';
  const tabs = documentRef.createElement('div');
  tabs.className = 'lafea-doc-table-tabs';
  tabs.setAttribute('role', 'tablist');

  const formButton = createLafeaDocumentTableTabButton(
    documentRef,
    'Stage inputs',
    true,
    () => {
      mode = 'FORM';
      updateTabs();
      refresh();
    },
  );
  const jsonButton = createLafeaDocumentTableTabButton(
    documentRef,
    'Advanced raw JSON',
    false,
    () => {
      mode = 'JSON';
      updateTabs();
      refresh();
    },
  );
  tabs.append(formButton, jsonButton);
  toolbar.append(tabs);

  const content = documentRef.createElement('div');
  content.className = 'lafea-doc-table-content';
  container.append(notice, toolbar, content);

  function updateTabs() {
    formButton.setAttribute('aria-selected', String(mode === 'FORM'));
    jsonButton.setAttribute('aria-selected', String(mode === 'JSON'));
  }

  function refresh() {
    content.replaceChildren();
    if (mode === 'JSON') {
      renderLafeaJsonEditor(
        documentRef,
        content,
        documentValue,
        callbacks.onApplyJson,
      );
      return;
    }
    renderLafeaDescriptorForm({
      documentRef,
      container: content,
      stageId,
      documentValue,
      descriptors,
      onSetScalar: callbacks.onSetScalar,
    });
  }

  refresh();
  return container;
}
