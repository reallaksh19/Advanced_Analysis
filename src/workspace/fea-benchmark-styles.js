/**
 * Isolated styling for the FEA benchmark panel.
 *
 * @returns {string} CSS text consumed by both workbench controllers.
 */
export function feaBenchmarkStyles() {
  return `
.fea-benchmark{display:grid;gap:12px;padding:14px;border:1px solid var(--workspace-border,#334155);border-radius:8px;background:var(--workspace-panel,#101b2e);color:var(--workspace-text,#e5edf8)}
.fea-benchmark__header{display:flex;justify-content:space-between;gap:16px;align-items:start}.fea-benchmark__header h2{margin:4px 0;font-size:16px}.fea-benchmark__header p{margin:0;max-width:64ch;color:var(--workspace-muted,#94a3b8);font-size:12px}
.fea-benchmark__status{padding:7px 12px;border:1px solid #334155;border-radius:999px;font-weight:800;white-space:nowrap}.fea-benchmark__status[data-status="PASSED"]{color:#86efac;border-color:#15803d}.fea-benchmark__status[data-status="FAILED"]{color:#fca5a5;border-color:#b91c1c}.fea-benchmark__status[data-status="RUNNING"]{color:#fcd34d;border-color:#b45309}
.fea-benchmark__controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.fea-benchmark button{border:1px solid #334155;border-radius:5px;padding:8px 12px;background:#0b1628;color:inherit;font-weight:600}.fea-benchmark button:disabled{opacity:.45}.fea-benchmark__hash{font:11px ui-monospace,monospace;color:#94a3b8}
.fea-benchmark__scroll{max-height:340px;overflow:auto}.fea-benchmark table{width:100%;border-collapse:collapse;font-size:12px}.fea-benchmark th,.fea-benchmark td{padding:5px 7px;border:1px solid #334155;text-align:left;vertical-align:top}.fea-benchmark__cell-number{text-align:right;font:12px ui-monospace,monospace;white-space:nowrap}.fea-benchmark__cell-status{font-weight:800}.fea-benchmark tr[data-status="PASS"] .fea-benchmark__cell-status{color:#86efac}.fea-benchmark tr[data-status="FAIL"] .fea-benchmark__cell-status{color:#fca5a5}
.fea-benchmark__case{padding:9px;border:1px solid #263449;border-radius:6px;background:#0b1628}.fea-benchmark__case+.fea-benchmark__case{margin-top:8px}.fea-benchmark__case summary{cursor:pointer;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.fea-benchmark__badge{padding:2px 7px;border-radius:4px;font-size:11px;font-weight:800}.fea-benchmark__badge[data-status="PASS"]{background:#14532d;color:#86efac}.fea-benchmark__badge[data-status="FAIL"]{background:#7f1d1d;color:#fecaca}.fea-benchmark__badge[data-status="ERROR"]{background:#78350f;color:#fed7aa}
.fea-benchmark__reference{margin:8px 0;padding:7px 9px;border-left:3px solid #f59e0b;background:#16223a;font-size:12px}.fea-benchmark__error{color:#fca5a5;font-weight:700}.fea-benchmark__summary td:first-child{font-weight:600}
@media(max-width:700px){.fea-benchmark__header{display:grid}}
`;
}

export const FEA_BENCHMARK_STYLES = feaBenchmarkStyles();
