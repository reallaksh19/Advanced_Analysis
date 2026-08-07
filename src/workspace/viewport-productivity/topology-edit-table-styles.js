let installed = false;

export function ensureTopologyEditTableStyles(documentRef) {
  if (!documentRef || installed || documentRef.getElementById('topology-edit-table-styles')) return;
  const style = documentRef.createElement('style');
  style.id = 'topology-edit-table-styles';
  style.textContent = `
    .topology-edit-clean-shell:has([data-panel-kind="table"][open]) .topology-edit-clean-shell__workspace { --topology-edit-sidecar-width:min(500px,46vw); }
    [data-panel-kind="table"] > .topology-edit-clean-shell__panel-body { padding:6px; }
    .topology-edit-table { display:grid; gap:.65rem; min-width:0; font-size:.78rem; color:#cbd5e1; }
    .topology-edit-table__header { display:flex; align-items:end; justify-content:space-between; gap:.75rem; }
    .topology-edit-table__header > div { display:flex; flex-direction:column; gap:.15rem; }
    .topology-edit-table__header label { display:grid; gap:.2rem; min-width:12rem; }
    .topology-edit-table input, .topology-edit-table select, .topology-edit-table button { font:inherit; }
    .topology-edit-table input, .topology-edit-table select { min-height:1.8rem; border:1px solid #315070; border-radius:.3rem; background:#07101c; color:#e2e8f0; padding:.25rem .4rem; }
    .topology-edit-table button { min-height:1.75rem; border:1px solid #315070; border-radius:.3rem; background:#0a1322; color:#cbd5e1; padding:.2rem .45rem; cursor:pointer; }
    .topology-edit-table button:hover:not(:disabled), .topology-edit-table button:focus-visible { border-color:#60a5fa; background:#142239; color:#f8fafc; outline:none; }
    .topology-edit-table button:disabled { opacity:.45; cursor:not-allowed; }
    .topology-edit-table__scroll { overflow:auto; max-height:25rem; border:1px solid #1e344c; border-radius:.4rem; background:#050c16; }
    .topology-edit-table table { width:max-content; min-width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
    .topology-edit-table th, .topology-edit-table td { padding:.3rem .45rem; border-bottom:1px solid #14273c; white-space:nowrap; text-align:left; }
    .topology-edit-table tbody tr:hover { background:#0b1a2d; }
    .topology-edit-table thead { position:sticky; top:0; z-index:1; background:#0c192b; }
    .topology-edit-table th button { border:0; background:transparent; padding:0; font-weight:700; }
    .topology-edit-table tr[data-staged="true"] { outline:1px solid #38bdf8; outline-offset:-1px; }
    .topology-edit-table [data-table-select] { border:0; background:transparent; padding:0 .25rem; color:#7dd3fc; }
    .topology-edit-table__editor, .topology-edit-table__staged { display:grid; gap:.5rem; padding:.6rem; border:1px solid #1e344c; border-radius:.4rem; background:#081321; }
    .topology-edit-table__identity { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
    .topology-edit-table__identity code { color:#7dd3fc; opacity:.9; }
    .topology-edit-table__editor-grid { display:grid; grid-template-columns:minmax(8rem,1fr) minmax(7rem,.7fr) minmax(9rem,1fr) auto; gap:.5rem; align-items:end; }
    .topology-edit-table__editor-grid label { display:grid; gap:.2rem; }
    .topology-edit-table__custody { display:flex; gap:.7rem; flex-wrap:wrap; color:#94a3b8; }
    .topology-edit-table__staged ul, .topology-edit-table__conflict ul { margin:.2rem 0 0; padding-left:1.2rem; }
    .topology-edit-table__conflict { padding:.45rem; border:1px solid #f59e0b; border-radius:.35rem; color:#fde68a; }
    .topology-edit-table__workflow { display:flex; gap:.4rem; flex-wrap:wrap; }
    .topology-edit-table__workflow [data-table-action="apply"] { border-color:#047857; background:#064e3b; color:#d1fae5; }
    .topology-edit-table__status, .topology-edit-table__notice, .topology-edit-table__empty { color:#94a3b8; }
    @media (max-width: 1100px) { .topology-edit-clean-shell:has([data-panel-kind="table"][open]) .topology-edit-clean-shell__workspace { --topology-edit-sidecar-width:min(380px,48vw); } .topology-edit-table__editor-grid { grid-template-columns:1fr 1fr; } }
    @media (max-width: 760px) { .topology-edit-clean-shell__sidecar { border-top:1px solid #1e344c; } .topology-edit-table__header { align-items:stretch; flex-direction:column; } }
  `;
  documentRef.head?.append(style);
  installed = true;
}
