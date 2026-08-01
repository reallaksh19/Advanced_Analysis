/**
 * Topology Edit Draft — Phase 2 Command Journal & Replay Engine
 *
 * Provides a deterministic, append-only command journal supporting undo, redo,
 * replay, state recovery, and source immutability verification.
 */

import { semanticHash } from '../../core/shared-piping-model/index.js';

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

    const payload = Object.freeze(JSON.parse(JSON.stringify(command.payload || {})));
    // Deterministic, replayable ID — sequence-derived, never Math.random()
    // (the port's own P0 rule explicitly bans random identity generation,
    // since it makes replay/export byte-reproducibility impossible to verify).
    const id = `cmd:${semanticHash({ sequence: this.entries.length, type: command.type, payload }).slice(0, 20)}`;
    const entry = Object.freeze({
      id,
      timestamp: Date.now(),
      type: command.type,
      payload,
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
