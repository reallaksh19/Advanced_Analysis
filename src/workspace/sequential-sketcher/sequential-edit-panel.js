/** Renders the governed inline-replacement draft controls and history actions. */
export class SequentialEditPanel {
  constructor(rootElement, gateway) {
    this.rootElement = rootElement;
    this.gateway = gateway;
    this.selectedEntityId = null;
    this.onActionRequested = null;
    this.status = '';
  }

  render(selectedEntityId) {
    this.selectedEntityId = selectedEntityId || null;
    if (!this.rootElement) return;
    const documentRef = this.rootElement.ownerDocument;
    const toolbar = documentRef.createElement('div');
    toolbar.className = 'sequential-edit-toolbar';
    toolbar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#091322;padding:6px 10px;border:1px solid #1e293b;border-radius:6px;';
    const label = documentRef.createElement('strong');
    label.style.cssText = 'color:#38bdf8;font-size:12px;';
    label.textContent = 'Inline replacement:';
    toolbar.append(label);
    toolbar.append(
      this.button('Preview', 'preview-replacement', !this.selectedEntityId),
      this.button('Commit', 'commit-replacement', !this.gateway.getDraft()),
      this.button('Cancel preview', 'cancel-replacement', !this.gateway.getDraft()),
      this.button('Undo', 'undo', this.gateway.history.length === 0),
      this.button('Redo', 'redo', this.gateway.future.length === 0),
    );
    const status = documentRef.createElement('output');
    status.style.cssText = 'color:#fbbf24;font-size:11px;overflow-wrap:anywhere;';
    status.textContent = this.status;
    toolbar.append(status);
    this.rootElement.replaceChildren(toolbar);
  }

  setStatus(status) { this.status = String(status || ''); this.render(this.selectedEntityId); }

  button(label, action, disabled) {
    const button = this.rootElement.ownerDocument.createElement('button');
    button.type = 'button'; button.textContent = label; button.disabled = disabled;
    button.dataset.editSessionAction = action;
    button.addEventListener('click', () => this.onActionRequested?.({ action, selectedEntityId: this.selectedEntityId }));
    return button;
  }
}
