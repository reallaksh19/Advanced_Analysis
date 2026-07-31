// src/workspace/lafea-canvas/render-worker-client.js

import { contractError, requireAsciiIdentity } from './contracts.js';
import { sealRenderPacket } from './render-packet-contract.js';

export function createRenderWorkerClient(worker) {
  if (!worker || typeof worker.postMessage !== 'function') {
    throw contractError('LAFEA_RENDER_WORKER_REQUIRED');
  }
  let active = null;

  return Object.freeze({
    request(input) {
      if (active) {
        throw contractError('LAFEA_RENDER_WORKER_REQUEST_ACTIVE', {
          requestId: active.requestId,
        });
      }
      requireRequestIdentity(input);
      const request = {
        requestId: input.requestId,
        sceneRevision: input.sceneRevision,
        sceneHash: input.sceneHash,
        meshHash: input.meshHash,
        recoveryHash: input.recoveryHash,
      };

      worker.postMessage({
        type: 'BUILD_RENDER_PACKET',
        ...request,
        qualifiedMesh: input.qualifiedMesh,
        qualifiedRecovery: input.qualifiedRecovery,
      });
      active = request;
    },

    accept(message) {
      if (!active) {
        throw contractError('LAFEA_RENDER_WORKER_REPLY_WITHOUT_REQUEST');
      }

      for (const field of [
        'requestId',
        'sceneRevision',
        'sceneHash',
        'meshHash',
        'recoveryHash',
      ]) {
        if (message[field] !== active[field]) {
          throw contractError('LAFEA_RENDER_WORKER_STALE_REPLY', {
            field,
            expected: active[field],
            actual: message[field],
          });
        }
      }

      const packet = sealRenderPacket(message.renderPacket);
      active = null;
      return packet;
    },

    cancel() {
      active = null;
      worker.postMessage({ type: 'CANCEL' });
    },
  });
}

function requireRequestIdentity(input) {
  requireAsciiIdentity(input?.requestId, 'requestId');
  requireAsciiIdentity(input?.sceneHash, 'sceneHash');
  requireAsciiIdentity(input?.meshHash, 'meshHash');
  requireAsciiIdentity(input?.recoveryHash, 'recoveryHash');
  if (!Number.isInteger(input?.sceneRevision) || input.sceneRevision < 0) {
    throw contractError('LAFEA_RENDER_WORKER_REVISION_INVALID');
  }
  if (!input.qualifiedMesh || !input.qualifiedRecovery) {
    throw contractError('LAFEA_RENDER_WORKER_QUALIFIED_INPUT_REQUIRED');
  }
}
