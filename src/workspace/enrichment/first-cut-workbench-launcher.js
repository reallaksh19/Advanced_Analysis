/**
 * Toolbar composition controller for the existing first-cut workbench.
 *
 * This module never creates enrichment state or calculation authority. It only
 * focuses or pops out the existing, bootstrap-owned workbench host.
 */

export const FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA =
  'first-cut-workbench-launcher/v1';

const FIRST_CUT_SECTION_SELECTOR = '[data-section-id="first-cut"]';
const FIRST_CUT_HOST_SELECTOR = '[data-role="first-cut-workbench-root"]';
const VIEWPORT_PANEL_SELECTOR = '[data-panel="viewport"]';
const ACTION_BAR_ROLE = 'first-cut-workbench-action-bar';

export class FirstCutWorkbenchLauncherController {
  constructor(rootElement) {
    if (!rootElement?.ownerDocument) {
      throw launcherError('FIRST_CUT_LAUNCHER_ROOT_REQUIRED');
    }
    this.rootElement = rootElement;
    this.actionBar = null;
    this.group = null;
    this.host = null;
    this.section = null;
    this.focusCount = 0;
    this.popoutCount = 0;
    this.lastMode = null;
    this.destroyed = false;
    this.handleFocus = () => this.focusWorkbench();
    this.handlePopout = () => this.popoutWorkbench();
  }

  init() {
    this.requireLive();
    if (this.group) return this.getState();
    const viewportPanel = requireUnique(this.rootElement, VIEWPORT_PANEL_SELECTOR);
    this.section = requireUnique(this.rootElement, FIRST_CUT_SECTION_SELECTOR);
    this.host = requireUnique(this.rootElement, FIRST_CUT_HOST_SELECTOR);
    if (!this.section.contains(this.host)) {
      throw launcherError('FIRST_CUT_LAUNCHER_HOST_SECTION_MISMATCH');
    }
    if (this.rootElement.querySelectorAll(`[data-role="${ACTION_BAR_ROLE}"]`).length) {
      throw launcherError('FIRST_CUT_LAUNCHER_ACTION_BAR_ALREADY_PRESENT');
    }

    const documentRef = this.rootElement.ownerDocument;
    this.actionBar = documentRef.createElement('div');
    this.actionBar.className = 'first-cut-workbench-action-bar';
    this.actionBar.dataset.role = ACTION_BAR_ROLE;
    this.actionBar.setAttribute('aria-label', 'Workspace enrichment actions');
    Object.assign(this.actionBar.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      minHeight: '34px',
      padding: '4px 8px',
      borderTop: '1px solid #1e293b',
      background: '#091322',
      flex: 'none',
    });

    this.group = documentRef.createElement('div');
    this.group.className = 'first-cut-workbench-launcher';
    this.group.dataset.role = 'first-cut-workbench-launcher';
    this.group.setAttribute('aria-label', 'First-cut enrichment launcher');

    const focusButton = actionButton(
      documentRef,
      'Enrichment',
      'Focus the existing first-cut enrichment and preflight workbench',
    );
    focusButton.dataset.role = 'first-cut-workbench-focus';
    focusButton.addEventListener('click', this.handleFocus);

    const popoutButton = actionButton(
      documentRef,
      'Pop Out',
      'Pop out the existing first-cut enrichment and preflight workbench',
    );
    popoutButton.dataset.role = 'first-cut-workbench-popout';
    popoutButton.addEventListener('click', this.handlePopout);

    this.group.append(focusButton, popoutButton);
    this.actionBar.append(this.group);
    viewportPanel.append(this.actionBar);
    return this.getState();
  }

  focusWorkbench() {
    this.requireMounted();
    this.ensurePropertiesVisible();
    if (this.section.classList.contains('accordion-collapsed')) {
      activate(this.section.querySelector('.accordion-section-header'));
    }
    this.focusHost();
    this.focusCount += 1;
    this.lastMode = 'FOCUS';
    return this.getState();
  }

  popoutWorkbench() {
    this.requireMounted();
    if (!this.section.classList.contains('is-popped-out')) {
      activate(this.section.querySelector('.accordion-popout-btn'));
    }
    if (!this.section.classList.contains('is-popped-out')) {
      throw launcherError('FIRST_CUT_LAUNCHER_POPOUT_NOT_ACTIVATED');
    }
    this.focusHost();
    this.popoutCount += 1;
    this.lastMode = 'POPOUT';
    return this.getState();
  }

  getState() {
    return freeze({
      schema: FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
      status: this.destroyed ? 'DESTROYED' : this.group ? 'READY' : 'NEW',
      focusCount: this.focusCount,
      popoutCount: this.popoutCount,
      lastMode: this.lastMode,
      hostIdentityRetained: Boolean(this.host),
      poppedOut: Boolean(this.section?.classList.contains('is-popped-out')),
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.group?.querySelector('[data-role="first-cut-workbench-focus"]')
      ?.removeEventListener('click', this.handleFocus);
    this.group?.querySelector('[data-role="first-cut-workbench-popout"]')
      ?.removeEventListener('click', this.handlePopout);
    this.actionBar?.remove();
    this.actionBar = null;
    this.group = null;
    this.host = null;
    this.section = null;
    this.destroyed = true;
  }

  ensurePropertiesVisible() {
    const shell = this.rootElement.querySelector('.workspace-shell');
    if (!shell) throw launcherError('FIRST_CUT_LAUNCHER_SHELL_REQUIRED');
    if (!shell.classList.contains('properties-collapsed')) return;
    activate(shell.querySelector('[data-action="toggle-properties-collapse"]'));
    if (shell.classList.contains('properties-collapsed')) {
      throw launcherError('FIRST_CUT_LAUNCHER_PROPERTIES_NOT_EXPANDED');
    }
  }

  focusHost() {
    if (!this.host?.isConnected) {
      throw launcherError('FIRST_CUT_LAUNCHER_HOST_DISCONNECTED');
    }
    if (!this.host.hasAttribute('tabindex')) this.host.setAttribute('tabindex', '-1');
    this.host.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.host.focus?.({ preventScroll: true });
  }

  requireLive() {
    if (this.destroyed) throw launcherError('FIRST_CUT_LAUNCHER_DESTROYED');
  }

  requireMounted() {
    this.requireLive();
    if (!this.actionBar || !this.group || !this.host || !this.section) {
      throw launcherError('FIRST_CUT_LAUNCHER_NOT_INITIALIZED');
    }
  }
}

function actionButton(documentRef, label, title) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.title = title;
  button.className = 'first-cut-workbench-launcher__button';
  return button;
}

function requireUnique(root, selector) {
  const matches = root.querySelectorAll(selector);
  if (matches.length !== 1) {
    throw launcherError('FIRST_CUT_LAUNCHER_UNIQUE_TARGET_REQUIRED', {
      selector,
      count: matches.length,
    });
  }
  return matches[0];
}

function activate(element) {
  if (!element) throw launcherError('FIRST_CUT_LAUNCHER_CONTROL_REQUIRED');
  if (typeof element.click === 'function') element.click();
  else element.dispatchEvent?.(new Event('click', { bubbles: true }));
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function launcherError(code, evidence = {}) {
  const error = new TypeError(code);
  error.code = code;
  error.evidence = evidence;
  return error;
}
