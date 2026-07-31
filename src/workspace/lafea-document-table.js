/**
 * Transitional generic editor for LAFEA stage documents.
 *
 * The editor works on a detached structured clone and commits only through the
 * supplied command callback. It does not calculate, silently coerce invalid
 * numeric input to zero, or create a new record by cloning an existing identity.
 * Stage-specific typed descriptors remain a later authorized work package.
 */

/**
 * Render the transitional source table and advanced raw JSON editor.
 *
 * @param {Element|DocumentFragment} rootElement Host DOM context.
 * @param {Record<string, unknown>|null} documentValue Editable stage document.
 * @param {(jsonText: string) => void} onApplyJson Command callback.
 * @returns {HTMLElement}
 */
export function renderDocumentTableEditor(rootElement, documentValue, onApplyJson) {
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

  const currentDoc = structuredClone(documentValue);
  let mode = 'TABLE';

  const notice = documentRef.createElement('p');
  notice.className = 'lafea-doc-table-notice';
  notice.textContent = 'Transitional generic editor. Values remain subject to the exact stage source validator; '
    + 'stage-specific typed input descriptors are not implemented in this phase.';

  const toolbar = documentRef.createElement('div');
  toolbar.className = 'lafea-doc-table-toolbar';
  const tabs = documentRef.createElement('div');
  tabs.className = 'lafea-doc-table-tabs';

  const tableButton = tabButton(documentRef, 'Source table', true, () => {
    mode = 'TABLE';
    updateTabs();
    refresh();
  });
  const jsonButton = tabButton(documentRef, 'Advanced raw JSON', false, () => {
    mode = 'JSON';
    updateTabs();
    refresh();
  });
  tabs.append(tableButton, jsonButton);

  const applyButton = documentRef.createElement('button');
  applyButton.type = 'button';
  applyButton.className = 'lafea-doc-apply-btn';
  applyButton.textContent = 'Apply source edits';
  applyButton.addEventListener('click', () => onApplyJson(JSON.stringify(currentDoc, null, 2)));
  toolbar.append(tabs, applyButton);

  const content = documentRef.createElement('div');
  content.className = 'lafea-doc-table-content';
  container.append(notice, toolbar, content);

  function updateTabs() {
    tableButton.setAttribute('aria-current', mode === 'TABLE' ? 'step' : 'false');
    jsonButton.setAttribute('aria-current', mode === 'JSON' ? 'step' : 'false');
  }

  function refresh() {
    content.replaceChildren();
    if (mode === 'JSON') {
      renderJsonEditor(documentRef, content, currentDoc, onApplyJson);
      return;
    }
    renderScalarSection(documentRef, content, currentDoc);
    renderCollectionSections(documentRef, content, currentDoc, refresh);
  }

  refresh();
  return container;
}

function tabButton(documentRef, label, active, handler) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-current', active ? 'step' : 'false');
  button.addEventListener('click', handler);
  return button;
}

function renderJsonEditor(documentRef, container, currentDoc, onApplyJson) {
  const explanation = documentRef.createElement('p');
  explanation.textContent = 'Advanced import/evidence view. Invalid JSON is rejected and does not modify the stage source.';
  const textarea = documentRef.createElement('textarea');
  textarea.dataset.role = 'lafea-document-json';
  textarea.spellcheck = false;
  textarea.value = JSON.stringify(currentDoc, null, 2);

  const message = documentRef.createElement('output');
  message.setAttribute('aria-live', 'polite');

  const apply = documentRef.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply validated JSON';
  apply.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(textarea.value);
      if (!isRecord(parsed)) throw new TypeError('LAFEA document must be a JSON object.');
      message.textContent = '';
      onApplyJson(JSON.stringify(parsed, null, 2));
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Invalid JSON.';
    }
  });
  container.append(explanation, textarea, apply, message);
}

function renderScalarSection(documentRef, container, currentDoc) {
  const scalars = [];
  collectScalars(currentDoc, '', scalars);
  if (!scalars.length) return;

  const section = documentRef.createElement('section');
  section.className = 'lafea-doc-table-section';
  const title = documentRef.createElement('h4');
  title.textContent = 'Scalar source fields';
  const table = documentRef.createElement('table');
  table.className = 'lafea-doc-grid';
  const header = documentRef.createElement('tr');
  ['Field', 'Editable value', 'Type'].forEach((label) => {
    const cell = documentRef.createElement('th');
    cell.textContent = label;
    cell.scope = 'col';
    header.append(cell);
  });
  table.append(header);

  for (const scalar of scalars) {
    const row = documentRef.createElement('tr');
    const keyCell = documentRef.createElement('th');
    keyCell.scope = 'row';
    keyCell.append(labelWithPath(documentRef, scalar.path));
    const valueCell = documentRef.createElement('td');
    const typeCell = documentRef.createElement('td');
    typeCell.textContent = scalar.type;
    valueCell.append(valueEditor(documentRef, scalar.value, scalar.set));
    row.append(keyCell, valueCell, typeCell);
    table.append(row);
  }

  section.append(title, table);
  container.append(section);
}

function collectScalars(value, prefix, output) {
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(child) && Object.hasOwn(child, 'value') && !isRecord(child.value)) {
      output.push({
        path,
        value: child.value,
        type: typeOf(child.value),
        set: (next) => { child.value = next; },
      });
    } else if (isRecord(child)) {
      collectScalars(child, path, output);
    } else if (!Array.isArray(child)) {
      output.push({
        path,
        value: child,
        type: typeOf(child),
        set: (next) => { value[key] = next; },
      });
    }
  }
}

function renderCollectionSections(documentRef, container, currentDoc, refresh) {
  for (const collection of findCollections(currentDoc)) {
    const section = documentRef.createElement('section');
    section.className = 'lafea-doc-table-section';
    const title = documentRef.createElement('h4');
    title.textContent = `${friendlyName(collection.path)} — ${collection.rows.length} records`;
    const note = documentRef.createElement('p');
    note.textContent = 'Record creation is disabled in the transitional generic editor to prevent duplicate or fabricated identities. '
      + 'Use a validated stage source import until stage-specific creation commands are implemented.';
    section.append(title, note);

    if (!collection.rows.length) {
      container.append(section);
      continue;
    }

    const columns = stableColumns(collection.rows);
    const table = documentRef.createElement('table');
    table.className = 'lafea-doc-grid';
    const header = documentRef.createElement('tr');
    const indexHeader = documentRef.createElement('th');
    indexHeader.textContent = '#';
    header.append(indexHeader);
    columns.forEach((column) => {
      const cell = documentRef.createElement('th');
      cell.textContent = friendlyName(column);
      cell.scope = 'col';
      header.append(cell);
    });
    const actionHeader = documentRef.createElement('th');
    actionHeader.textContent = 'Action';
    header.append(actionHeader);
    table.append(header);

    collection.rows.forEach((record, index) => {
      const row = documentRef.createElement('tr');
      row.className = 'lafea-table-row';
      const identity = recordIdentity(record);
      if (identity) row.dataset.rowId = identity;

      const indexCell = documentRef.createElement('td');
      indexCell.textContent = String(index + 1);
      row.append(indexCell);

      for (const column of columns) {
        const cell = documentRef.createElement('td');
        const original = record[column];
        if (isValueWrapper(original)) {
          cell.append(valueEditor(documentRef, original.value, (next) => { original.value = next; }));
        } else {
          cell.append(valueEditor(documentRef, original, (next) => { record[column] = next; }));
        }
        row.append(cell);
      }

      const actionCell = documentRef.createElement('td');
      const remove = documentRef.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.addEventListener('click', () => {
        collection.rows.splice(index, 1);
        refresh();
      });
      actionCell.append(remove);
      row.append(actionCell);
      table.append(row);
    });

    section.append(table);
    container.append(section);
  }
}

function valueEditor(documentRef, original, setter) {
  const input = documentRef.createElement('input');
  input.type = typeof original === 'number' ? 'number' : 'text';
  input.value = displayValue(original);
  input.addEventListener('change', () => {
    try {
      const next = parseEditedValue(input.value, original);
      setter(next);
      input.setCustomValidity('');
    } catch (error) {
      input.setCustomValidity(error instanceof Error ? error.message : 'Invalid value.');
      input.reportValidity();
      input.value = displayValue(original);
    }
  });
  return input;
}

function parseEditedValue(text, original) {
  if (typeof original === 'number') {
    if (!text.trim()) throw new TypeError('Numeric input cannot be blank.');
    const value = Number(text);
    if (!Number.isFinite(value)) throw new TypeError('Numeric input must be finite.');
    return value;
  }
  if (typeof original === 'boolean') {
    if (text === 'true') return true;
    if (text === 'false') return false;
    throw new TypeError('Boolean input must be true or false.');
  }
  if (Array.isArray(original) || isRecord(original)) {
    const value = JSON.parse(text);
    if (Array.isArray(original) && !Array.isArray(value)) {
      throw new TypeError('Edited value must remain an array.');
    }
    if (isRecord(original) && !isRecord(value)) {
      throw new TypeError('Edited value must remain an object.');
    }
    assertFiniteNumbers(value);
    return value;
  }
  if (original === null) {
    return text === 'null' ? null : text;
  }
  return text;
}

function assertFiniteNumbers(value, path = 'value') {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`${path} must be finite.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteNumbers(entry, `${path}[${index}]`));
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([key, entry]) => assertFiniteNumbers(entry, `${path}.${key}`));
  }
}

function findCollections(currentDoc) {
  const result = [];
  walk(currentDoc, '', result);
  return result;
}

function walk(value, prefix, output) {
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child) && child.every((entry) => isRecord(entry))) {
      output.push({ path, rows: child });
    } else if (isRecord(child) && !isValueWrapper(child)) {
      walk(child, path, output);
    }
  }
}

function stableColumns(rows) {
  const columns = [];
  const seen = new Set();
  for (const row of rows) {
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    });
  }
  return columns;
}

function labelWithPath(documentRef, path) {
  const wrapper = documentRef.createElement('span');
  const label = documentRef.createElement('strong');
  label.textContent = friendlyName(path);
  const code = documentRef.createElement('code');
  code.textContent = path;
  code.style.display = 'block';
  wrapper.append(label, code);
  return wrapper;
}

function friendlyName(path) {
  return String(path)
    .split('.')
    .at(-1)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function recordIdentity(record) {
  const key = Object.keys(record).find((name) => /(?:Id|ID|identity)$/u.test(name));
  const value = key ? record[key] : null;
  return typeof value === 'string' ? value : null;
}

function isValueWrapper(value) {
  return isRecord(value) && Object.hasOwn(value, 'value');
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function displayValue(value) {
  if (Array.isArray(value) || isRecord(value)) return JSON.stringify(value);
  return String(value ?? '');
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
