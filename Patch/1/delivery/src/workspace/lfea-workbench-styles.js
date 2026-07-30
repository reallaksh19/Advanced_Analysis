/**
 * Return isolated CSS for the LFEA calculation workbench.
 *
 * @returns {string} CSS text.
 */
export function lfeaWorkbenchStyles() {
  return `
.lfea-workbench{display:grid;gap:14px;max-width:1700px;margin:0 auto;padding:18px;color:var(--workspace-text,#e5edf8);background:var(--workspace-canvas,#08111f)}
.lfea-workbench__header{display:flex;justify-content:space-between;gap:18px;align-items:start}.lfea-workbench__header h1{margin:4px 0}.lfea-workbench__header p{margin:0;color:var(--workspace-muted,#94a3b8)}
.lfea-workbench__status{padding:7px 10px;border:1px solid #334155;border-radius:999px;font-weight:800}.lfea-workbench__status[data-status="QUALIFIED"]{color:#86efac;border-color:#15803d}.lfea-workbench__status[data-status="FAILED"]{color:#fca5a5;border-color:#b91c1c}
.lfea-workbench__toolbar,.lfea-workbench__record-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.lfea-workbench button,.lfea-workbench select,.lfea-workbench input{border:1px solid #334155;border-radius:5px;padding:8px;background:#0b1628;color:inherit}.lfea-workbench button:disabled{opacity:.45}
.lfea-workbench__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.lfea-workbench__card{min-width:0;padding:14px;border:1px solid var(--workspace-border,#334155);border-radius:8px;background:var(--workspace-panel,#101b2e)}.lfea-workbench__card h2{margin:0 0 10px;font-size:15px}.lfea-workbench__card h3{font-size:13px}
.lfea-workbench textarea{box-sizing:border-box;width:100%;min-height:220px;padding:10px;border:1px solid #334155;border-radius:5px;background:#050b14;color:#dbeafe;font:12px/1.5 ui-monospace,monospace;resize:vertical}.lfea-workbench__editor,.lfea-workbench__records,.lfea-workbench__results{display:grid;gap:9px}
.lfea-workbench__svg{min-height:360px;border:1px solid #334155;background:#050a12}.lfea-workbench__svg svg{display:block;width:100%;height:auto}.lfea-workbench-svg__element{fill:rgba(59,130,246,.12);stroke:#93c5fd;stroke-width:2}.lfea-workbench-svg__node circle{fill:#f8fafc;stroke:#0f172a;stroke-width:2}.lfea-workbench-svg__node text,.lfea-workbench-svg__legend{fill:#e2e8f0;font-size:12px}.lfea-workbench-svg__geometry-state{fill:#fbbf24;font-size:12px;font-weight:800}.lfea-workbench-svg__tick{fill:#cbd5e1;font-size:10px;font-family:ui-monospace,monospace}.lfea-workbench-svg__load{stroke:#fb7185;stroke-width:5}.lfea-workbench-svg__constraint{fill:#60a5fa}
.lfea-workbench__table{max-height:250px;overflow:auto}.lfea-workbench table{width:100%;border-collapse:collapse;font-size:12px}.lfea-workbench th,.lfea-workbench td{padding:6px;border:1px solid #334155;text-align:left;vertical-align:top;max-width:260px;overflow-wrap:anywhere}.lfea-workbench tr[data-selected="true"]{outline:2px solid #fbbf24;outline-offset:-2px}
.lfea-workbench pre{max-height:390px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.lfea-workbench__authority{padding:8px;border-left:4px solid #f59e0b;background:#1e293b;font-weight:700}\n.lfea-workbench__preflight{padding:8px;border-left:4px solid #38bdf8;background:#12203a;font-size:12px}.lfea-workbench__preflight[data-status=\"EXPORT_LIKELY_TO_EXCEED_BYTE_CAPACITY\"]{border-left-color:#fb923c}.lfea-workbench__preflight[data-status=\"BLOCKED_BY_DECLARED_CAPACITY\"]{border-left-color:#f87171}\n.lfea-workbench__benchmark{grid-column:1/-1}
@media(max-width:1000px){.lfea-workbench__grid{grid-template-columns:1fr}}@media(max-width:640px){.lfea-workbench__header{display:grid}}
`;
}

export const LFEA_WORKBENCH_STYLES = lfeaWorkbenchStyles();
