/**
 * Identity-preserving Worker entry for staged LFEA execution.
 */
import { runLfeaPipelineStages } from './lfea-pipeline-stages.js';

globalThis.addEventListener('message', (event) => {
  const request = event.data ?? {};
  if (request.type !== 'RUN' || typeof request.requestId !== 'string') return;
  const identity = {
    runId: request.runId,
    inputSemanticHash: request.inputSemanticHash,
    inputModelVersion: request.inputModelVersion,
  };
  try {
    const execution = runLfeaPipelineStages({
      ...request.input,
      onProgress: (progress) => {
        globalThis.postMessage({
          type: 'PROGRESS',
          requestId: request.requestId,
          ...identity,
          progress,
        });
      },
    });
    globalThis.postMessage({
      type: 'COMPLETE',
      requestId: request.requestId,
      ...identity,
      execution,
    });
  } catch (error) {
    globalThis.postMessage({
      type: 'FAILURE',
      requestId: request.requestId,
      ...identity,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error
          ? error.message
          : 'Unknown LFEA worker failure.',
        code: typeof error?.code === 'string' ? error.code : null,
      },
    });
  }
});
