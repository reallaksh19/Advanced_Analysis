// src/workspace/lafea-canvas/hybrid-viewport.js

import {
  SCHEMAS,
  SCENE_KEYS,
  VIEWPORT_KEYS,
  assertExactKeys,
  requireSchema,
} from './contracts.js';
import { resolveLafeaRenderer } from './render-policy.js';

export function createHybridViewport(root, adapters) {
  if (!root?.ownerDocument) {
    throw new TypeError('LAFEA_HYBRID_VIEWPORT_ROOT_REQUIRED');
  }
  const requiredAdapterFunctions = [
    adapters?.svg?.render,
    adapters?.webgl?.render,
    adapters?.webgl?.isAvailable,
    adapters?.webgl?.setVisible,
    adapters?.webgl?.clearCurrentScene,
    adapters?.webgl?.dispose,
    adapters?.inspector?.render,
  ];
  if (requiredAdapterFunctions.some((value) => typeof value !== 'function')) {
    throw new TypeError('LAFEA_HYBRID_VIEWPORT_ADAPTER_REQUIRED');
  }
  root.replaceChildren();
  const documentRef = root.ownerDocument;

  const canvas = documentRef.createElement('canvas');
  canvas.dataset.layer = 'webgl';

  const svg = documentRef.createElementNS(
    'http://www.w3.org/2000/svg',
    'svg',
  );
  svg.dataset.layer = 'engineering-overlay';

  const inspector = documentRef.createElement('div');
  inspector.dataset.layer = 'accessible-inspector';

  root.classList.add('lafea-viewport');
  root.style.position = 'relative';
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.zIndex = '1';
  canvas.style.pointerEvents = 'none';
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.zIndex = '2';
  svg.style.pointerEvents = 'auto';
  inspector.style.position = 'absolute';
  inspector.style.inset = '0';
  inspector.style.zIndex = '3';
  inspector.style.pointerEvents = 'none';
  root.append(canvas, svg, inspector);

  return Object.freeze({
    render(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('LAFEA_HYBRID_VIEWPORT_INPUT_REQUIRED');
      }
      requireSchema(input.scene, SCHEMAS.scene);
      requireSchema(input.viewport, SCHEMAS.viewport);
      assertExactKeys(
        input.scene,
        SCENE_KEYS,
        'LAFEA_SCENE_KEYS_INVALID',
      );
      assertExactKeys(
        input.viewport,
        VIEWPORT_KEYS,
        'LAFEA_VIEWPORT_KEYS_INVALID',
      );

      const renderer = resolveLafeaRenderer({
        mode: input.mode,
        displayedPrimitiveCount: input.displayedPrimitiveCount,
        webglAvailable: adapters.webgl.isAvailable(),
        canvas2dAvailable: adapters.canvas2d?.isAvailable() === true,
        policy: input.policy,
      });

      // SVG always owns source geometry, authoring and overlays.
      adapters.svg.render({
        target: svg,
        scene: input.scene,
        viewport: input.viewport,
        selection: input.selection,
        authoringEnabled: input.mode === 'SOURCE_AUTHORING',
      });

      const webglSelected = ['THREE_WEBGL', 'RASTER_WEBGL_CAPTURE'].includes(renderer);
      const canvas2dSelected = renderer === 'CANVAS2D_FALLBACK';
      adapters.webgl.setVisible(renderer === 'THREE_WEBGL');

      if (webglSelected) {
        adapters.webgl.render({
          target: canvas,
          scene: input.scene,
          viewport: input.viewport,
          renderPacket: input.renderPacket,
          selection: input.selection,
        });
        if (renderer === 'RASTER_WEBGL_CAPTURE') {
          if (typeof adapters.webgl.capture !== 'function') {
            throw new TypeError('LAFEA_WEBGL_CAPTURE_ADAPTER_REQUIRED');
          }
          adapters.webgl.capture();
        }
      } else {
        adapters.webgl.clearCurrentScene();
      }
      if (canvas2dSelected) {
        if (typeof adapters.canvas2d?.render !== 'function') {
          throw new TypeError('LAFEA_CANVAS2D_RENDER_ADAPTER_REQUIRED');
        }
        adapters.canvas2d.render({
          target: canvas,
          scene: input.scene,
          viewport: input.viewport,
          renderPacket: input.renderPacket,
          selection: input.selection,
        });
      } else {
        adapters.canvas2d?.clearCurrentScene?.();
      }

      adapters.inspector.render({
        target: inspector,
        scene: input.scene,
        selection: input.selection,
        renderer,
      });
      root.dataset.renderer = renderer;

      return renderer;
    },

    destroy() {
      adapters.webgl.dispose();
      adapters.svg.dispose?.();
      adapters.canvas2d?.dispose?.();
      root.replaceChildren();
    },
  });
}
