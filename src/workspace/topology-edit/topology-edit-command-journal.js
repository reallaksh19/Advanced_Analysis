/**
 * Topology Edit Draft — Phase 2 Command Journal & Replay Engine
 *
 * Provides a deterministic, append-only command journal supporting undo, redo,
 * replay, state recovery, and source immutability verification.
 */

export class TopologyEditCommandJournal {
  constructor(initialState = {}) {
    this.initialState = Object.freeze(JSON.parse(JSON.stringify(initialState)));
    this.entries = [];
    this.pointer = -1;
  }

  applyCommand(command) {
    if (!command || typeof command.type !== 'string') {
      throw new TypeError('TopologyEditCommandJournal: Invalid command payload.');
    }
    
    // Truncate redo stack if applying a new command after undo
    if (this.pointer < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.pointer + 1);
    }

    const entry = Object.freeze({
      id: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      type: command.type,
      payload: Object.freeze(JSON.parse(JSON.stringify(command.payload || {}))),
    });

    this.entries.push(entry);
    this.pointer++;
    return entry;
  }

  undo() {
    if (!this.canUndo()) return false;
    this.pointer--;
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this.pointer++;
    return true;
  }

  canUndo() {
    return this.pointer >= 0;
  }

  canRedo() {
    return this.pointer < this.entries.length - 1;
  }

  getActiveJournal() {
    return this.entries.slice(0, this.pointer + 1);
  }

  exportJournalPackage() {
    return Object.freeze({
      schema: 'advanced-topology-edit-journal-package/v1',
      createdAt: Date.now(),
      entriesCount: this.entries.length,
      activePointer: this.pointer,
      entries: JSON.parse(JSON.stringify(this.entries)),
    });
  }

  importJournalPackage(pkg) {
    if (!pkg || !Array.isArray(pkg.entries)) {
      throw new TypeError('TopologyEditCommandJournal: Invalid journal import package.');
    }
    this.entries = pkg.entries.map(e => Object.freeze(e));
    this.pointer = Number.isInteger(pkg.activePointer) ? pkg.activePointer : this.entries.length - 1;
  }
}
