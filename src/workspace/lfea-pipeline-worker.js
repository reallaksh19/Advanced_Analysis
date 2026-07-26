/**
 * Module Worker entry for staged LFEA execution.
 *
 * The worker receives one immutable request, emits explicit progress events,
 * and returns the retained pipeline execution object without recomputation.
 */
import { runLfeaPipelineStages } from './lfea-pipeline-stages.js';

globalThis.addEventListener('message', (event) => {
  const { requestId, input } = event.data ?? {};
  if (typeof requestId !== 'string') return;
  const execution = runLfeaPipelineStages({
    ...input,
    onProgress: (progress) => {
      globalThis.postMessage({ type: 'PROGRESS', requestId, progress });
    },
  });
  globalThis.postMessage({ type: 'COMPLETE', requestId, execution });
});
