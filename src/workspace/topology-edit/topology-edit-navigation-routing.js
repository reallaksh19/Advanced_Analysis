import { deepFreeze } from '../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_NAVIGATION_ROUTE_ERROR = 'TOPOLOGY_EDIT_NAVIGATION_ROUTE_INVALID';

const ACTIONS = deepFreeze({
  select: { kind: 'MODE', value: 'select' },
  'mode-select': { kind: 'MODE', value: 'select' },
  orbit: { kind: 'MODE', value: 'orbit' },
  'mode-orbit': { kind: 'MODE', value: 'orbit' },
  pan: { kind: 'MODE', value: 'pan' },
  'mode-pan': { kind: 'MODE', value: 'pan' },
  fit: { kind: 'COMMAND', value: 'fit' },
  'fit-selection': { kind: 'COMMAND', value: 'fit-selection' },
  home: { kind: 'COMMAND', value: 'home' },
  reset: { kind: 'COMMAND', value: 'home' },
  previous: { kind: 'COMMAND', value: 'previous' },
  'previous-view': { kind: 'COMMAND', value: 'previous' },
  'pivot-selection': { kind: 'COMMAND', value: 'pivot-selection' },
  projection: { kind: 'COMMAND', value: 'projection' },
  'toggle-projection': { kind: 'COMMAND', value: 'projection' },
  iso: { kind: 'STANDARD_VIEW', value: 'iso' },
  'view-iso': { kind: 'STANDARD_VIEW', value: 'iso' },
  top: { kind: 'STANDARD_VIEW', value: 'top' },
  'view-top': { kind: 'STANDARD_VIEW', value: 'top' },
  bottom: { kind: 'STANDARD_VIEW', value: 'bottom' },
  'view-bottom': { kind: 'STANDARD_VIEW', value: 'bottom' },
  front: { kind: 'STANDARD_VIEW', value: 'front' },
  'view-front': { kind: 'STANDARD_VIEW', value: 'front' },
  back: { kind: 'STANDARD_VIEW', value: 'back' },
  'view-back': { kind: 'STANDARD_VIEW', value: 'back' },
  left: { kind: 'STANDARD_VIEW', value: 'left' },
  'view-left': { kind: 'STANDARD_VIEW', value: 'left' },
  right: { kind: 'STANDARD_VIEW', value: 'right' },
  'view-right': { kind: 'STANDARD_VIEW', value: 'right' },
});

const SHORTCUT_ROWS = deepFreeze([
  { code: 'KeyQ', shift: false, action: 'select', label: 'Q' },
  { code: 'KeyO', shift: false, action: 'orbit', label: 'O' },
  { code: 'KeyP', shift: false, action: 'pan', label: 'P' },
  { code: 'KeyF', shift: false, action: 'fit', label: 'F' },
  { code: 'KeyF', shift: true, action: 'fit-selection', label: 'Shift+F' },
  { code: 'KeyH', shift: false, action: 'home', label: 'H' },
  { code: 'KeyC', shift: false, action: 'pivot-selection', label: 'C' },
  { code: 'Digit5', shift: false, action: 'projection', label: '5' },
  { code: 'Digit0', shift: false, action: 'iso', label: '0' },
  { code: 'Digit1', shift: false, action: 'front', label: '1' },
  { code: 'Digit3', shift: false, action: 'right', label: '3' },
  { code: 'Digit7', shift: false, action: 'top', label: '7' },
]);

const SHORTCUTS = buildShortcutMap(SHORTCUT_ROWS);

export function resolveTopologyEditNavigationAction(actionInput) {
  const action = String(actionInput || '').trim().toLowerCase();
  const intent = ACTIONS[action];
  if (!intent) {
    throw routeError(`Unsupported topology edit navigation action: ${action || '<empty>'}.`, 'ACTION_UNSUPPORTED');
  }
  return intent;
}

export function resolveTopologyEditNavigationShortcut(event) {
  if (!event || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (isEditableTarget(event.target)) return null;
  const key = shortcutKey(event.code, event.shiftKey === true);
  const row = SHORTCUTS.get(key);
  return row ? resolveTopologyEditNavigationAction(row.action) : null;
}

export function topologyEditNavigationShortcutManifest() {
  return SHORTCUT_ROWS;
}

export function topologyEditNavigationShortcutLabel(actionInput) {
  const intent = resolveTopologyEditNavigationAction(actionInput);
  const row = SHORTCUT_ROWS.find((candidate) => {
    const candidateIntent = resolveTopologyEditNavigationAction(candidate.action);
    return candidateIntent.kind === intent.kind && candidateIntent.value === intent.value;
  });
  return row?.label || '';
}

function buildShortcutMap(rows) {
  const result = new Map();
  for (const row of rows) {
    if (!/^Key[A-Z]$|^Digit[0-9]$/.test(row.code)) {
      throw routeError(`Invalid shortcut code ${row.code}.`, 'SHORTCUT_CODE_INVALID');
    }
    resolveTopologyEditNavigationAction(row.action);
    const key = shortcutKey(row.code, row.shift);
    if (result.has(key)) throw routeError(`Duplicate shortcut ${key}.`, 'SHORTCUT_DUPLICATE');
    result.set(key, row);
  }
  return result;
}

function shortcutKey(code, shift) {
  return `${String(code)}:${shift === true ? 'SHIFT' : 'PLAIN'}`;
}

function isEditableTarget(target) {
  const tagName = String(target?.tagName || '').toUpperCase();
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tagName)
    || target?.isContentEditable === true;
}

function routeError(message, detailCode) {
  const error = new Error(`${TOPOLOGY_EDIT_NAVIGATION_ROUTE_ERROR}: ${message}`);
  error.code = TOPOLOGY_EDIT_NAVIGATION_ROUTE_ERROR;
  error.detailCode = detailCode;
  return error;
}
