/** Accessible screen-space review card for governed topology issues. */
export class TopologyEditCanvasCallout {
  constructor(stageContainer) {
    if (!stageContainer?.ownerDocument) {
      throw new TypeError('TopologyEditCanvasCallout requires a DOM container.');
    }
    this.container = stageContainer;
    this.activeCallout = null;
    this.escapeHandler = (event) => {
      if (event.key === 'Escape') this.hideCallout();
    };
  }

  showIssue({
    entry,
    screenX,
    screenY,
    onPreviewFix,
    onFlyTo,
    onClose,
  } = {}) {
    if (!entry?.issueId || !entry.kind) {
      throw new TypeError('A governed issue-overlay entry is required.');
    }
    this.hideCallout();
    const documentRef = this.container.ownerDocument;
    const card = documentRef.createElement('section');
    card.className = 'topology-edit-3d-callout';
    card.dataset.issueId = entry.issueId;
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-label', `${entry.kind} issue review`);
    card.tabIndex = -1;
    positionCard(card, this.container, screenX, screenY);
    applyCardStyle(card, entry.severity);

    const header = element(documentRef, 'header', 'topology-edit-3d-callout__header');
    const heading = element(documentRef, 'strong');
    heading.textContent = `${entry.severity} · ${entry.kind}`;
    const closeButton = actionButton(documentRef, 'Close', 'close-callout');
    closeButton.setAttribute('aria-label', 'Close issue review');
    header.append(heading, closeButton);

    const message = element(documentRef, 'p', 'topology-edit-3d-callout__message');
    message.textContent = entry.message || 'No issue message was supplied.';

    const evidence = element(documentRef, 'dl', 'topology-edit-3d-callout__evidence');
    appendEvidence(documentRef, evidence, 'Issue ID', entry.issueId);
    appendEvidence(documentRef, evidence, 'Anchor', entry.anchorSource);
    if (entry.distanceMm !== null) {
      appendEvidence(documentRef, evidence, 'Distance', `${entry.distanceMm.toFixed(2)} mm`);
    }
    if (entry.angleDeg !== null) {
      appendEvidence(documentRef, evidence, 'Angle', `${entry.angleDeg.toFixed(2)}°`);
    }
    appendEvidence(
      documentRef,
      evidence,
      'Canonical targets',
      entry.canonicalIds.length ? entry.canonicalIds.join(', ') : 'None',
    );

    const actions = element(documentRef, 'div', 'topology-edit-3d-callout__actions');
    const flyButton = actionButton(documentRef, 'Fly to', 'flyto-callout');
    flyButton.disabled = entry.canonicalIds.length === 0;
    actions.append(flyButton);
    if (entry.suggestionHash) {
      const previewButton = actionButton(
        documentRef,
        `Preview ${entry.commandType || 'certified fix'}`,
        'preview-callout-fix',
      );
      previewButton.dataset.suggestionHash = entry.suggestionHash;
      actions.prepend(previewButton);
      previewButton.addEventListener('click', () => {
        onPreviewFix?.(entry);
        this.hideCallout();
      });
    }

    closeButton.addEventListener('click', () => this.hideCallout());
    flyButton.addEventListener('click', () => onFlyTo?.(entry));
    card.append(header, message, evidence, actions);
    this.container.append(card);
    this.container.ownerDocument.addEventListener('keydown', this.escapeHandler);
    this.activeCallout = card;
    this.onClose = onClose;
    card.focus();
    return card;
  }

  hideCallout() {
    if (!this.activeCallout) return;
    this.activeCallout.remove();
    this.container.ownerDocument.removeEventListener('keydown', this.escapeHandler);
    this.activeCallout = null;
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.();
  }

  destroy() {
    this.hideCallout();
    this.container = null;
  }
}

function positionCard(card, container, screenX, screenY) {
  const rect = container.getBoundingClientRect?.() ?? {
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  };
  const localX = Number.isFinite(screenX) ? screenX - rect.left : rect.width / 2;
  const localY = Number.isFinite(screenY) ? screenY - rect.top : rect.height / 2;
  const left = clamp(localX + 12, 8, Math.max(8, rect.width - 300));
  const top = clamp(localY - 48, 8, Math.max(8, rect.height - 240));
  card.style.position = 'absolute';
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.zIndex = '1000';
  card.style.width = 'min(290px, calc(100% - 16px))';
}

function applyCardStyle(card, severity) {
  const border = severity === 'HIGH'
    ? '#ef4444'
    : severity === 'MEDIUM'
      ? '#f59e0b'
      : '#38bdf8';
  card.style.background = '#020617';
  card.style.border = `1px solid ${border}`;
  card.style.boxShadow = `0 0 18px ${border}55`;
  card.style.borderRadius = '8px';
  card.style.padding = '12px';
  card.style.color = '#f8fafc';
  card.style.fontFamily = 'system-ui, sans-serif';
  card.style.fontSize = '12px';
}

function appendEvidence(documentRef, list, label, value) {
  const term = element(documentRef, 'dt');
  term.textContent = label;
  term.style.color = '#94a3b8';
  const description = element(documentRef, 'dd');
  description.textContent = String(value ?? '');
  description.style.margin = '0 0 6px';
  description.style.overflowWrap = 'anywhere';
  list.append(term, description);
}

function actionButton(documentRef, label, action) {
  const button = element(documentRef, 'button');
  button.type = 'button';
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function element(documentRef, tagName, className = '') {
  const value = documentRef.createElement(tagName);
  if (className) value.className = className;
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
