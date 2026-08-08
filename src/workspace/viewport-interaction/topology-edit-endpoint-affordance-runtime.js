export class TopologyEditEndpointAffordanceRuntime {
  constructor({ onActivate = null } = {}) {
    if (onActivate !== null && typeof onActivate !== 'function') {
      throw new TypeError('TopologyEditEndpointAffordanceRuntime: onActivate must be a function or null.');
    }
    this.onActivate = onActivate;
    this.element = null;
    this.panelElement = null;
    this.focusTarget = null;
    this.affordances = Object.freeze([]);
    this.clickHandler = (event) => this.handleClick(event);
  }

  mount(host) {
    if (!host?.ownerDocument) {
      throw new TypeError('TopologyEditEndpointAffordanceRuntime: host element is required.');
    }
    this.destroy();
    this.focusTarget = host.querySelector('canvas');
    const renderHost = host.closest('[data-role="topology-edit-render-host"]') || host;
    const sidecar = renderHost.querySelector('[data-role="topology-edit-sidecar"]');
    const element = host.ownerDocument.createElement('div');
    element.dataset.role = 'topology-edit-visible-endpoints';
    element.className = 'topology-edit-visible-endpoints';
    element.setAttribute('aria-label', 'Visible endpoint and port selection');
    element.style.cssText = [
      'max-height:180px',
      'overflow:auto',
      'display:flex',
      'gap:4px',
      'flex-wrap:wrap',
      'align-content:flex-start',
    ].join(';');
    element.addEventListener('click', this.clickHandler);
    if (sidecar) {
      const panel = endpointPanel(host.ownerDocument, element);
      sidecar.append(panel);
      this.panelElement = panel;
    } else {
      renderHost.append(element);
    }
    this.element = element;
    this.render(this.affordances);
  }

  render(affordances = []) {
    this.affordances = Object.freeze([...affordances]);
    if (!this.element) return;
    const rows = this.affordances.filter((row) => row?.editable && !row?.stale);
    if (this.panelElement) this.panelElement.hidden = rows.length === 0;
    else this.element.hidden = rows.length === 0;
    this.element.replaceChildren(...rows.map((row) => endpointButton(
      this.element.ownerDocument,
      row,
      this.affordances.indexOf(row),
    )));
  }

  handleClick(event) {
    const button = event.target?.closest?.('[data-endpoint-affordance-index]');
    if (!button || !this.element?.contains(button)) return;
    const index = Number(button.dataset.endpointAffordanceIndex);
    const affordance = this.affordances[index];
    if (!affordance || affordance.stale) return;
    this.onActivate?.(affordance, event);
    this.focusTarget?.focus({ preventScroll: true });
  }

  destroy() {
    this.element?.removeEventListener('click', this.clickHandler);
    this.panelElement?.remove();
    if (!this.panelElement) this.element?.remove();
    this.element = null;
    this.panelElement = null;
    this.focusTarget = null;
  }
}

function endpointPanel(documentRef, content) {
  const panel = documentRef.createElement('details');
  panel.dataset.panelKind = 'topology-edit-visible-endpoints';
  panel.className = 'topology-edit-clean-shell__panel';
  const summary = documentRef.createElement('summary');
  summary.textContent = 'Endpoints';
  const body = documentRef.createElement('div');
  body.className = 'topology-edit-clean-shell__panel-body';
  body.append(content);
  panel.append(summary, body);
  return panel;
}

function endpointButton(documentRef, affordance, index) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.endpointAffordanceIndex = String(index);
  button.dataset.endpointRole = affordance.portRoles.join(',');
  button.dataset.workspaceEntityIds = affordance.workspaceEntityIds.join(',');
  button.setAttribute('aria-label', affordance.accessibleLabel);
  button.title = affordance.accessibleLabel;
  button.textContent = `${affordance.workspaceEntityIds[0] || 'Endpoint'} ${affordance.portRoles[0] || 'PORT'}`;
  return button;
}
