/**
 * Sequential Sketcher Interactive Editing Action Panel
 */
export class SequentialEditPanel {
  constructor(rootElement, gateway) {
    this.rootElement = rootElement;
    this.gateway = gateway;
    this.selectedEntityId = null;
    this.onCommandExecuted = null;
  }

  render(selectedEntityId = null) {
    this.selectedEntityId = selectedEntityId;
    if (!this.rootElement) return;

    this.rootElement.replaceChildren();
    const toolbar = this.rootElement.ownerDocument.createElement('div');
    toolbar.className = 'sequential-edit-toolbar';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '6px';
    toolbar.style.flexWrap = 'wrap';
    toolbar.style.alignItems = 'center';
    toolbar.style.background = '#091322';
    toolbar.style.padding = '6px 10px';
    toolbar.style.borderRadius = '6px';
    toolbar.style.border = '1px solid #1e293b';

    const label = this.rootElement.ownerDocument.createElement('span');
    label.style.fontWeight = 'bold';
    label.style.color = '#38bdf8';
    label.style.fontSize = '12px';
    label.textContent = 'Edit Actions:';
    toolbar.append(label);

    const hasDataset = Boolean(this.gateway?.workspaceState?.getSnapshot()?.dataset);
    const targetId = this.selectedEntityId;

    // 1. Add Pipe
    const addPipeBtn = this.createBtn('➕ Add Pipe', () => {
      const res = this.gateway.execute({ op: 'ADD_STRAIGHT', lengthMm: 1000, direction: 'X', targetEntityId: targetId });
      if (this.onCommandExecuted) this.onCommandExecuted(res);
    }, !hasDataset);

    // 2. Split Pipe
    const splitPipeBtn = this.createBtn('✂️ Split Pipe', () => {
      const res = this.gateway.execute({ op: 'SPLIT_PIPE', targetEntityId: targetId });
      if (this.onCommandExecuted) this.onCommandExecuted(res);
    }, !hasDataset);

    // 2b. Add Flange Set
    const addFlangeBtn = this.createBtn('⚙️ Add Flange', () => {
      const res = this.gateway.execute({ op: 'ADD_FLANGE_SET', targetEntityId: targetId });
      if (this.onCommandExecuted) this.onCommandExecuted(res);
    }, !hasDataset);

    // 2c. Add Valve
    const addValveBtn = this.createBtn('🚰 Add Valve', () => {
      const res = this.gateway.execute({ op: 'ADD_VALVE', targetEntityId: targetId });
      if (this.onCommandExecuted) this.onCommandExecuted(res);
    }, !hasDataset);

    // 3. Delete Component
    const deleteBtn = this.createBtn('🗑️ Delete', () => {
      const res = this.gateway.execute({ op: 'RETIRE_COMPONENT', targetEntityId: targetId });
      if (this.onCommandExecuted) this.onCommandExecuted(res);
    }, !hasDataset);

    // 4. Undo / Redo
    const undoBtn = this.createBtn('⏪ Undo', () => {
      const ok = this.gateway.undo();
      if (ok && this.onCommandExecuted) this.onCommandExecuted({ op: 'UNDO' });
    }, !hasDataset);

    const redoBtn = this.createBtn('⏩ Redo', () => {
      const ok = this.gateway.redo();
      if (ok && this.onCommandExecuted) this.onCommandExecuted({ op: 'REDO' });
    }, !hasDataset);

    toolbar.append(addPipeBtn, splitPipeBtn, addFlangeBtn, addValveBtn, deleteBtn, undoBtn, redoBtn);
    this.rootElement.append(toolbar);
  }

  createBtn(label, onClick, disabled = false) {
    const btn = this.rootElement.ownerDocument.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.disabled = disabled;
    btn.style.padding = '4px 8px';
    btn.style.borderRadius = '4px';
    btn.style.border = '1px solid #334155';
    btn.style.background = disabled ? '#0f172a' : '#1e293b';
    btn.style.color = disabled ? '#475569' : '#e2e8f0';
    btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    btn.style.fontSize = '12px';
    btn.style.fontWeight = '500';
    btn.addEventListener('click', onClick);
    return btn;
  }
}
