/**
 * Controller for convergence-study import and retained-kernel interpretation.
 */
import { createLfeaConvergenceStore } from './lfea-convergence-store.js';
import { LfeaConvergenceView } from './lfea-convergence-view.js';

export class LfeaConvergenceController {
  constructor(rootElement, options) {
    this.store = createLfeaConvergenceStore();
    this.view = new LfeaConvergenceView(rootElement);
    this.onQualified = options?.onQualified ?? null;
    this.unsubscribe = null;
  }

  init() {
    if (this.unsubscribe) return this;
    this.view.init({
      onImport: (value) => this.store.importStudy(value),
      onRun: () => this.run(),
    });
    this.unsubscribe = this.store.subscribe((state) => this.view.render(state));
    this.view.render(this.store.getState());
    return this;
  }

  importStudy(value) {
    return this.store.importStudy(value);
  }

  run() {
    const state = this.store.run();
    if (state.status === 'QUALIFIED') {
      this.onQualified?.(state.evidence);
    }
    return state;
  }

  getState() {
    return this.store.getState();
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.store.destroy();
    this.view.destroy();
  }
}
