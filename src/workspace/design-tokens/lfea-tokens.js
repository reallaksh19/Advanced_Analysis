/** Minimal visual tokens shared by embedded and standalone LFEA shells. */
export const LFEA_TOKENS = Object.freeze({
  canvas: '#08111f',
  panel: '#0f172a',
  panelStrong: '#0b1120',
  card: '#131d33',
  border: '#1e293b',
  borderStrong: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  accent: '#38bdf8',
  accentWarm: '#fbbf24',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
});

export function lfeaTokenStyles() {
  return `:root{
    --lfea-canvas:${LFEA_TOKENS.canvas};
    --lfea-panel:${LFEA_TOKENS.panel};
    --lfea-panel-strong:${LFEA_TOKENS.panelStrong};
    --lfea-card:${LFEA_TOKENS.card};
    --lfea-border:${LFEA_TOKENS.border};
    --lfea-border-strong:${LFEA_TOKENS.borderStrong};
    --lfea-text:${LFEA_TOKENS.text};
    --lfea-muted:${LFEA_TOKENS.muted};
    --lfea-accent:${LFEA_TOKENS.accent};
    --lfea-accent-warm:${LFEA_TOKENS.accentWarm};
    --lfea-success:${LFEA_TOKENS.success};
    --lfea-warning:${LFEA_TOKENS.warning};
    --lfea-error:${LFEA_TOKENS.error};
  }`;
}
