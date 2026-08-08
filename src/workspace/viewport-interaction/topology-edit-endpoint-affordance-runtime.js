export class TopologyEditEndpointAffordanceRuntime {
  constructor({ onActivate = null } = {}) {
    if (onActivate !== null && typeof onActivate !== 'function') {
      throw new TypeError('TopologyEditEndpointAffordanceRuntime: onActivate must be a function or null.');
    }
    this.onActivate = onActivate;
    this.element = null;
    this.affordances = Object.freeze([]);
    this.clickHandler = (event) => this.handleClick(event);
  }

  mount(host) {
    if (!host?.ownerDocument) {
      throw new TypeError('TopologyEditEndpointAffordanceRuntime: host element is required.');
    }
    this.destroy();
    const element = host.ownerDocument.createElement('div');
    element.dataset.role = 'topology-edit-visible-endpoints';
    element.className = 'topology-edit-visible-endpoints';
    element.setAttribute('aria-label', 'Visible endpoint and port selection');
    element.style.cssText = [
      'position:absolute',
      'right:8px',
      'bottom:8px',
      'z-index:4',
      'max-width:min(320px,45%)',
      'max-height:32%',
      'overflow:auto',
      'padding:6px',
      'border-radius:6px',
      'background:rgba(2,6,23,.82)',
      'display:flex',
      'gap:4px',
      'flex-wrap:wrap',
    ].join(';');
    element.addEventListener('click', this.clickHandler);
    host.style.position ||= 'relative';
    host.append(element);
    this.element = element;
    this.render(this.affordances);
  }

  render(affordances = []) {
    this.affordances = Object.freeze([...affordances]);
    if (!this.element) return;
    const rows = this.affordances.filter((row) => row?.editable && !row?.stale);
    this.element.hidden = rows.length === 0;
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
    this.element.parentElement?.querySelector('canvas')?.focus({ preventScroll: true });
  }

  destroy() {
    this.element?.removeEventListener('click', this.clickHandler);
    this.element?.remove();
    this.element = null;
  }
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
