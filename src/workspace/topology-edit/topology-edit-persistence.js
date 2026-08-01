/**
 * Topology Edit Draft — Phase 6 Draft Persistence & Crash Recovery
 *
 * Auto-saves active draft sessions and command journals to localStorage
 * to ensure seamless crash recovery without data loss.
 */

export const STORAGE_KEY_EDIT_DRAFT = 'advanced_topology_edit_draft_v1';

export class TopologyEditPersistence {
  static saveDraft(journalPackage, viewState = {}) {
    if (!journalPackage) return false;
    try {
      const payload = JSON.stringify({
        savedAt: Date.now(),
        journalPackage,
        viewState,
      });
      localStorage.setItem(STORAGE_KEY_EDIT_DRAFT, payload);
      return true;
    } catch {
      return false;
    }
  }

  static loadDraft() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_EDIT_DRAFT);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  static clearDraft() {
    try {
      localStorage.removeItem(STORAGE_KEY_EDIT_DRAFT);
      return true;
    } catch {
      return false;
    }
  }
}
