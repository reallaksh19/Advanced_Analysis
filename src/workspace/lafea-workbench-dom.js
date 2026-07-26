/**
 * Reusable DOM primitives for the LAFEA view.
 *
 * Table rows provide equivalent pointer and keyboard selection. Focus capture
 * preserves editor caret and scroll state across incremental slot updates.
 */
export function collectionTable(root, rows, selectedIndex, onSelect) {
  const wrapper = element(root, 'div', 'lafea-workbench__table');
  let page = selectedIndex >= 0 ? Math.floor(selectedIndex / 100) : 0;
  const render = () => {
    const start = page * 100;
    const values = rows.slice(start, start + 100);
    const table = element(root, 'table');
    const header = element(root, 'tr');
    ['#', 'Identity', 'Record'].forEach((label) => header.append(element(root, 'th', null, label)));
    table.append(header);
    values.forEach((row, localIndex) => {
      const index = start + localIndex;
      const record = element(root, 'tr');
      record.tabIndex = 0;
      record.setAttribute('role', 'button');
      record.setAttribute('aria-selected', String(index === selectedIndex));
      record.dataset.selected = String(index === selectedIndex);
      record.addEventListener('click', () => onSelect(index));
      record.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect(index);
      });
      record.append(
        element(root, 'td', null, String(index + 1)),
        element(root, 'td', null, recordIdentity(row)),
        element(root, 'td', null, compactJson(row)),
      );
      table.append(record);
    });
    const controls = element(root, 'div', 'lafea-workbench__pagination');
    const previous = actionButton(root, 'Previous', () => { page -= 1; render(); });
    previous.disabled = start === 0;
    const next = actionButton(root, 'Next', () => { page += 1; render(); });
    next.disabled = start + values.length >= rows.length;
    controls.append(
      element(root, 'output', null, `Showing ${rows.length ? start + 1 : 0}-${start + values.length} of ${rows.length}`),
      previous,
      next,
    );
    wrapper.replaceChildren(controls, table);
  };
  render();
  return wrapper;
}

export function card(root, titleText) {
  const section = element(root, 'section', 'lafea-workbench__card');
  const title = element(root, 'h2', null, titleText);
  const body = element(root, 'div');
  section.append(title, body);
  return { section, body };
}

export function actionButton(root, text, handler) {
  const button = element(root, 'button', null, text);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

export function element(root, tag, className, text) {
  const value = root.ownerDocument.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

export function valueAt(value, path) {
  const rows = path.split('.').reduce((current, key) => current?.[key], value);
  return Array.isArray(rows) ? rows : [];
}

export function captureFocusedControl(root) {
  const active = root.ownerDocument.activeElement;
  if (!active || !root.contains(active) || !active.dataset?.role) return null;
  return {
    role: active.dataset.role,
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    scrollTop: active.scrollTop,
  };
}

export function restoreFocusedControl(root, focused) {
  if (!focused) return;
  const control = root.querySelector(`[data-role="${focused.role}"]`);
  if (!control) return;
  control.focus();
  if (focused.start !== null) control.setSelectionRange(focused.start, focused.end);
  control.scrollTop = focused.scrollTop;
}

function recordIdentity(row) {
  const key = Object.keys(row ?? {}).find((name) => /(?:Id|ID|identity)$/u.test(name));
  return key ? String(row[key]) : 'record';
}

function compactJson(row) {
  const text = JSON.stringify(row);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
