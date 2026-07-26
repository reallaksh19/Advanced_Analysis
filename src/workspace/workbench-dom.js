/**
 * Evidence-neutral DOM helpers shared by the two FEA workbenches.
 *
 * Helpers only create controls and serialize already-produced evidence. They
 * never calculate an engineering quantity or alter a source document.
 */
export function workbenchElement(root, tag, className, text) {
  const value = root.ownerDocument.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

export function workbenchButton(root, text, handler) {
  const value = workbenchElement(root, 'button', null, text);
  value.type = 'button';
  value.addEventListener('click', handler);
  return value;
}

export function workbenchCard(root, titleText) {
  const section = workbenchElement(root, 'section', 'lfea-workbench__card');
  const body = workbenchElement(root, 'div');
  section.append(workbenchElement(root, 'h2', null, titleText), body);
  return { section, body };
}

export function workbenchJsonDisclosure(root, value, role, summaryText) {
  const details = workbenchElement(root, 'details');
  const summary = workbenchElement(root, 'summary', null, summaryText);
  const pre = workbenchElement(root, 'pre');
  pre.dataset.role = role;
  pre.textContent = JSON.stringify(value, null, 2);
  details.append(summary, pre);
  return details;
}

export function workbenchJsonBlock(root, value, role) {
  const pre = workbenchElement(root, 'pre');
  pre.dataset.role = role;
  pre.textContent = JSON.stringify(value, null, 2);
  return pre;
}

export function valueAtPath(value, path) {
  const rows = path.split('.').reduce((current, key) => current?.[key], value);
  return Array.isArray(rows) ? rows : [];
}

export function captureWorkbenchFocus(root) {
  const active = root.ownerDocument.activeElement;
  if (!active || !root.contains(active) || !active.dataset?.role) return null;
  return {
    role: active.dataset.role,
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    scrollTop: active.scrollTop,
  };
}

export function restoreWorkbenchFocus(root, focused) {
  if (!focused) return;
  const control = root.querySelector(`[data-role="${focused.role}"]`);
  if (!control) return;
  control.focus();
  if (focused.start !== null) control.setSelectionRange(focused.start, focused.end);
  control.scrollTop = focused.scrollTop;
}

export function recordIdentity(row) {
  const key = Object.keys(row ?? {})
    .find((name) => /(?:Id|ID|identity)$/u.test(name));
  return key ? String(row[key]) : 'record';
}

export function compactJson(row) {
  const text = JSON.stringify(row);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function scalarText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return compactJson(value);
  return String(value);
}

export function activateOnKeyboard(element, handler) {
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handler();
  });
}
