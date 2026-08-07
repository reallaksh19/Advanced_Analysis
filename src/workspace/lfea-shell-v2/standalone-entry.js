import { LfeaWorkbenchController } from '../lfea-workbench-controller.js';

const root = document.getElementById('root');
if (!root) throw new Error('Standalone LFEA root #root was not found.');

const controller = new LfeaWorkbenchController(root, undefined).init();

globalThis.LfeaStandalone = Object.freeze({
  getState: () => controller.getState(),
  importDocument: (value) => controller.importDocument(value),
  exportDocument: () => controller.exportDocument(),
  exportEvidence: () => controller.exportEvidence(),
  run: () => controller.run(),
  undo: () => controller.undo(),
  redo: () => controller.redo(),
  destroy: () => controller.destroy(),
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => controller.destroy());
}
