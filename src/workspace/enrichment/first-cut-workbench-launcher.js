/**
 * Toolbar composition controller for the existing first-cut workbench.
 *
 * This module never creates enrichment state or calculation authority. It only
 * focuses or moves the existing, bootstrap-owned workbench host.
 */

export const FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA =
  'first-cut-workbench-launcher/v1';

const SECTION_SELECTOR = '[data-section-id="first-cut"]';
const HOST_SELECTOR = '[data-role="first-cut-workbench-root"]';
const VIEWPORT_SELECTOR = '[data-panel="viewport"]';
const PROPERTIES_SELECTOR = '.properties-panel';
const PROPERTIES_TOGGLE = '[data-action="toggle-properties-collapse"]';
const PROPERTIES_COLLAPSED = 'workspace-panel--collapsed';
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
    this.sectionBody = null;
    this.sectionPopout = null;
    this.popup = null;
    this.focusCount = 0;
    this.popoutCount = 0;
    this.lastMode = null;
    this.destroyed = false;
    this.handleFocus = () => this.focusWorkbench();
    this.handlePopout = () => this.popoutWorkbench();
    this.handleSectionPopout = (event) => {
      event?.stopPropagation?.();
      this.popoutWorkbench();
    };
    this.handleDock = () => this.dockWorkbench();
  }

  init() {
    this.requireLive();
    if (this.group) return this.getState();
    const viewport = requireUnique(this.rootElement, VIEWPORT_SELECTOR);
    this.section = requireUnique(this.rootElement, SECTION_SELECTOR);
    this.host = requireUnique(this.rootElement, HOST_SELECTOR);
    this.sectionBody = requireUnique(this.section, '.accordion-section-body');
    this.sectionPopout = requireUnique(this.section, '.accordion-popout-btn');
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
      display: 'flex', alignItems: 'center', gap: '6px', minHeight: '34px',
      padding: '4px 8px', borderTop: '1px solid #1e293b',
      background: '#091322', flex: 'none',
    });

    this.group = documentRef.createElement('div');
    this.group.className = 'first-cut-workbench-launcher';
    this.group.dataset.role = 'first-cut-workbench-launcher';
    this.group.setAttribute('aria-label', 'First-cut enrichment launcher');

    const focusButton = actionButton(
      documentRef, 'Enrichment',
      'Focus the existing first-cut enrichment and preflight workbench',
    );
    focusButton.dataset.role = 'first-cut-workbench-focus';
    focusButton.addEventListener('click', this.handleFocus);

    const popoutButton = actionButton(
      documentRef, 'Pop Out',
      'Pop out the existing first-cut enrichment and preflight workbench',
    );
    popoutButton.dataset.role = 'first-cut-workbench-popout';
    popoutButton.addEventListener('click', this.handlePopout);

    this.sectionPopout.addEventListener('click', this.handleSectionPopout);
    this.group.append(focusButton, popoutButton);
    this.actionBar.append(this.group);
    viewport.append(this.actionBar);
    return this.getState();
  }

  focusWorkbench() {
    this.requireMounted();
    this.ensurePropertiesVisible();
    if (!this.popup) this.section.classList.remove('accordion-collapsed');
    this.focusHost();
    this.focusCount += 1;
    this.lastMode = 'FOCUS';
    return this.getState();
  }

  popoutWorkbench() {
    this.requireMounted();
    this.ensurePropertiesVisible();
    if (!this.popup) this.openPopup();
    this.focusHost();
    this.popoutCount += 1;
    this.lastMode = 'POPOUT';
    return this.getState();
  }

  dockWorkbench() {
    this.requireMounted();
    if (!this.popup) return this.getState();
    this.section.append(this.sectionBody);
    this.sectionBody.classList.remove('panel-popup-body');
    delete this.sectionBody.dataset.role;
    this.sectionBody.style.maxHeight = '';
    this.sectionBody.style.padding = '';
    this.section.classList.remove('is-popped-out');
    this.popup.remove();
    this.popup = null;
    this.focusHost();
    return this.getState();
  }

  openPopup() {
    const documentRef = this.rootElement.ownerDocument;
    const overlay = documentRef.createElement('div');
    overlay.dataset.role = 'panel-popup-overlay';
    Object.assign(overlay.style, {
      display: 'flex', position: 'fixed', inset: '0', zIndex: '9998',
      pointerEvents: 'none',
    });
    const popupWindow = documentRef.createElement('section');
    popupWindow.className = 'panel-popup-window';
    popupWindow.dataset.role = 'panel-popup-window';
    popupWindow.style.pointerEvents = 'auto';
    const header = documentRef.createElement('header');
    header.className = 'panel-popup-header';
    const title = documentRef.createElement('strong');
    title.className = 'panel-popup-title';
    title.textContent = 'First-Cut Load Enrichment';
    const controls = documentRef.createElement('div');
    controls.className = 'panel-popup-controls';
    const dock = actionButton(documentRef, 'Dock', 'Dock first-cut workbench');
    dock.className = 'panel-popup-btn';
    dock.dataset.action = 'popup-dock';
    dock.addEventListener('click', this.handleDock);
    controls.append(dock);
    header.append(title, controls);

    this.sectionBody.classList.add('panel-popup-body');
    this.sectionBody.dataset.role = 'panel-popup-body';
    this.sectionBody.style.maxHeight = 'none';
    this.sectionBody.style.padding = '18px';
    popupWindow.append(header, this.sectionBody);
    overlay.append(popupWindow);
    this.rootElement.append(overlay);
    this.section.classList.add('is-popped-out');
    this.popup = overlay;
  }

  getState() {
    return freeze({
      schema: FIRST_CUT_WORKBENCH_LAUNCHER_SCHEMA,
      status: this.destroyed ? 'DESTROYED' : this.group ? 'READY' : 'NEW',
      focusCount: this.focusCount,
      popoutCount: this.popoutCount,
      lastMode: this.lastMode,
      hostIdentityRetained: Boolean(this.host),
      poppedOut: Boolean(this.popup && this.section?.classList.contains('is-popped-out')),
    });
  }

  destroy() {
    if (this.destroyed) return;
    if (this.popup) this.dockWorkbench();
    this.group?.querySelector('[data-role="first-cut-workbench-focus"]')
      ?.removeEventListener('click', this.handleFocus);
    this.group?.querySelector('[data-role="first-cut-workbench-popout"]')
      ?.removeEventListener('click', this.handlePopout);
    this.sectionPopout?.removeEventListener('click', this.handleSectionPopout);
    this.actionBar?.remove();
    this.actionBar = null;
    this.group = null;
    this.host = null;
    this.section = null;
    this.sectionBody = null;
    this.sectionPopout = null;
    this.destroyed = true;
  }

  ensurePropertiesVisible() {
    const panel = requireUnique(this.rootElement, PROPERTIES_SELECTOR);
    if (!panel.classList.contains(PROPERTIES_COLLAPSED)) return;
    requireUnique(panel, PROPERTIES_TOGGLE).click();
    if (panel.classList.contains(PROPERTIES_COLLAPSED)) {
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
      selector, count: matches.length,
    });
  }
  return matches[0];
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
