/**
 * Defines the standard capabilities required by the workspace viewport.
 * Backends should report which operations they natively support.
 */
export const DEFAULT_VIEWPORT_CAPABILITIES = {
  select: true,
  orbit: true,
  pan: true,
  fitAll: true,
  fitSelection: true,
  home: true,
  standardViews: true,
  orthographic: true
};

export const CANVAS2D_VIEWPORT_CAPABILITIES = {
  select: true,
  orbit: false,
  pan: false,
  fitAll: true,
  fitSelection: false,
  home: true,
  standardViews: false,
  orthographic: false
};
