/**
 * Return isolated CSS for the LAFEA workbench mount.
 *
 * @returns {string} CSS text.
 */
export function lafeaWorkbenchStyles() {
  return `
.lafea-workbench{display:grid;gap:14px;max-width:1700px;margin:0 auto;padding:18px;color:var(--workspace-text,#e5edf8);background:var(--workspace-canvas,#08111f)}
.lafea-workbench__header{display:flex;justify-content:space-between;gap:18px;align-items:start}.lafea-workbench__header h1{margin:4px 0}.lafea-workbench__header p{margin:0;color:var(--workspace-muted,#94a3b8)}
.lafea-workbench__status{padding:7px 10px;border:1px solid #334155;border-radius:999px;font-weight:800}.lafea-workbench__status[data-status="QUALIFIED"]{color:#86efac;border-color:#15803d}.lafea-workbench__status[data-status="FAILED"]{color:#fca5a5;border-color:#b91c1c}
.lafea-workbench__stages,.lafea-workbench__toolbar,.lafea-workbench__record-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.lafea-workbench button,.lafea-workbench select,.lafea-workbench input{border:1px solid #334155;border-radius:5px;padding:8px;background:#0b1628;color:inherit}.lafea-workbench button[aria-current="step"]{border-color:#f59e0b;color:#fde68a}.lafea-workbench button:disabled{opacity:.45}
.lafea-workbench__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.lafea-workbench__card{min-width:0;padding:14px;border:1px solid var(--workspace-border,#334155);border-radius:8px;background:var(--workspace-panel,#101b2e)}.lafea-workbench__card h2{margin:0 0 10px;font-size:15px}
.lafea-workbench textarea{box-sizing:border-box;width:100%;min-height:220px;padding:10px;border:1px solid #334155;border-radius:5px;background:#050b14;color:#dbeafe;font:12px/1.5 ui-monospace,monospace;resize:vertical}.lafea-workbench__editor,.lafea-workbench__collections{display:grid;gap:9px}
.lafea-workbench__svg{min-height:360px;border:1px solid #334155;background:#050a12}.lafea-workbench__svg svg{display:block;width:100%;height:auto}.lafea-workbench-svg__element{fill:rgba(59,130,246,.12);stroke:#60a5fa;stroke-width:2}.lafea-workbench-svg__node circle{fill:#f8fafc;stroke:#0f172a;stroke-width:2}.lafea-workbench-svg__node text,.lafea-workbench-svg__empty{fill:#cbd5e1;font-size:12px}
.lafea-workbench__table{max-height:230px;overflow:auto}.lafea-workbench table{width:100%;border-collapse:collapse;font-size:12px}.lafea-workbench th,.lafea-workbench td{padding:6px;border:1px solid #334155;text-align:left;vertical-align:top}.lafea-workbench tr[data-selected="true"]{outline:2px solid #fbbf24;outline-offset:-2px}
.lafea-workbench pre{max-height:430px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.lafea-workbench__authority{padding:8px;border-left:4px solid #f59e0b;background:#1e293b;font-weight:700}
@media(max-width:1000px){.lafea-workbench__grid{grid-template-columns:1fr}}@media(max-width:640px){.lafea-workbench__header{display:grid}}
`;
}

export const LAFEA_WORKBENCH_STYLES = lafeaWorkbenchStyles();
