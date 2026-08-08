let installed = false;

export function ensureTopologyEditTableStyles(documentRef) {
  if (!documentRef || installed || documentRef.getElementById('topology-edit-table-styles')) return;
  const style = documentRef.createElement('style');
  style.id = 'topology-edit-table-styles';
  style.textContent = `
    .topology-edit-table-window { position:absolute; top:58px; right:14px; z-index:90; width:min(1120px,calc(100% - 28px)); height:min(720px,calc(100% - 82px)); min-width:420px; min-height:42px; max-width:calc(100% - 8px); max-height:calc(100% - 54px); overflow:hidden; resize:both; border:1px solid #315070; border-radius:8px; background:#06101c; box-shadow:0 18px 52px rgba(0,0,0,.58); color:#cbd5e1; box-sizing:border-box; }
    .topology-edit-table-window[open] { display:grid; grid-template-rows:40px minmax(0,1fr); }
    .topology-edit-table-window:not([open]) { top:auto; bottom:14px; width:min(440px,calc(100% - 28px)); height:40px; min-height:40px; resize:none; }
    .topology-edit-table-window__titlebar { display:flex; align-items:center; gap:.65rem; min-width:0; height:40px; padding:0 10px; border-bottom:1px solid #1e344c; background:linear-gradient(180deg,#10233a,#0a1626); cursor:move; user-select:none; list-style:none; box-sizing:border-box; }
    .topology-edit-table-window__titlebar::-webkit-details-marker { display:none; }
    .topology-edit-table-window__titlebar::after { content:'▾'; margin-left:auto; color:#7dd3fc; font-size:12px; }
    .topology-edit-table-window:not([open]) .topology-edit-table-window__titlebar::after { content:'▸'; }
    .topology-edit-table-window__titlebar strong { flex:0 0 auto; color:#f8fafc; font-size:12px; letter-spacing:.01em; }
    .topology-edit-table-window__titlebar span { min-width:0; overflow:hidden; color:#94a3b8; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
    .topology-edit-table-window[data-table-window-dragging="true"] .topology-edit-table-window__titlebar { cursor:grabbing; }
    .topology-edit-table-window__body { min-width:0; min-height:0; overflow:auto; padding:7px; background:#07101c; box-sizing:border-box; }
    .topology-edit-table { display:grid; gap:.65rem; min-width:0; font-size:.78rem; color:#cbd5e1; }
    .topology-edit-table__header { display:flex; align-items:end; justify-content:space-between; gap:.75rem; }
    .topology-edit-table__header > div { display:flex; flex-direction:column; gap:.15rem; min-width:0; }
    .topology-edit-table__header > div span { overflow:hidden; color:#94a3b8; text-overflow:ellipsis; white-space:nowrap; }
    .topology-edit-table__header label { display:grid; gap:.2rem; min-width:14rem; }
    .topology-edit-table input, .topology-edit-table select, .topology-edit-table textarea, .topology-edit-table button { font:inherit; }
    .topology-edit-table input, .topology-edit-table select, .topology-edit-table textarea { min-height:1.8rem; min-width:0; width:100%; box-sizing:border-box; border:1px solid #315070; border-radius:.3rem; background:#07101c; color:#e2e8f0; padding:.25rem .4rem; }
    .topology-edit-table textarea { resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; line-height:1.35; }
    .topology-edit-table button { min-height:2rem; border:1px solid #315070; border-radius:.3rem; background:#0a1322; color:#cbd5e1; padding:.3rem .55rem; cursor:pointer; }
    .topology-edit-table button:hover:not(:disabled), .topology-edit-table button:focus-visible { border-color:#60a5fa; background:#142239; color:#f8fafc; outline:none; }
    .topology-edit-table button:disabled { opacity:.45; cursor:not-allowed; }
    .topology-edit-table__scroll { overflow:auto; max-height:min(48vh,470px); border:1px solid #1e344c; border-radius:.4rem; background:#050c16; }
    .topology-edit-table table { width:max-content; min-width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
    .topology-edit-table th, .topology-edit-table td { padding:.3rem .45rem; border-bottom:1px solid #14273c; white-space:nowrap; text-align:left; }
    .topology-edit-table tbody tr:hover { background:#0b1a2d; }
    .topology-edit-table tbody tr[data-selected="true"] { background:#0b2941; box-shadow:inset 3px 0 #38bdf8; }
    .topology-edit-table thead { position:sticky; top:0; z-index:1; background:#0c192b; }
    .topology-edit-table th button { border:0; background:transparent; padding:0; font-weight:700; }
    .topology-edit-table tr[data-staged="true"] { outline:1px solid #38bdf8; outline-offset:-1px; }
    .topology-edit-table [data-table-select] { border:0; background:transparent; padding:0 .25rem; color:#7dd3fc; }
    .topology-edit-table__editor, .topology-edit-table__staged, .topology-edit-table__all-properties { display:grid; gap:.5rem; padding:.6rem; border:1px solid #1e344c; border-radius:.4rem; background:#081321; }
    .topology-edit-table__identity { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; min-width:0; }
    .topology-edit-table__identity code { max-width:100%; overflow:hidden; color:#7dd3fc; opacity:.9; text-overflow:ellipsis; }
    .topology-edit-table__editor-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.5rem; align-items:end; }
    .topology-edit-table__editor-grid label { display:grid; gap:.2rem; min-width:0; }
    .topology-edit-table__editor-grid .topology-edit-table__wide { grid-column:1 / -1; }
    .topology-edit-table__editor-grid > button { grid-column:1 / -1; width:100%; }
    .topology-edit-table__first-pipe { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.65rem; }
    .topology-edit-table__first-pipe fieldset { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.4rem; min-width:0; margin:0; padding:.55rem; border:1px solid #1e344c; border-radius:.4rem; }
    .topology-edit-table__first-pipe legend { padding:0 .25rem; color:#bae6fd; font-weight:700; }
    .topology-edit-table__first-pipe label { display:grid; gap:.2rem; min-width:0; }
    .topology-edit-table__first-pipe > .topology-edit-table__wide { grid-column:1 / -1; }
    .topology-edit-table__custody { display:flex; gap:.7rem; flex-wrap:wrap; color:#94a3b8; }
    .topology-edit-table__staged ul, .topology-edit-table__conflict ul { margin:.2rem 0 0; padding-left:1.2rem; }
    .topology-edit-table__conflict { padding:.45rem; border:1px solid #f59e0b; border-radius:.35rem; color:#fde68a; }
    .topology-edit-table__workflow { display:flex; gap:.4rem; flex-wrap:wrap; position:sticky; bottom:-7px; z-index:3; padding:.45rem 0; background:linear-gradient(180deg,rgba(7,16,28,.78),#07101c 35%); }
    .topology-edit-table__workflow [data-table-action="apply"] { border-color:#047857; background:#064e3b; color:#d1fae5; }
    .topology-edit-table__status, .topology-edit-table__notice, .topology-edit-table__empty { color:#94a3b8; }
    .topology-edit-table__all-properties > header { display:flex; align-items:center; justify-content:space-between; gap:.6rem; }
    .topology-edit-table__all-properties > header span { color:#94a3b8; font-size:.72rem; }
    .topology-edit-table__property-group { border:1px solid #1a3047; border-radius:.35rem; background:#060f1a; overflow:hidden; }
    .topology-edit-table__property-group > summary { padding:.4rem .5rem; cursor:pointer; color:#bae6fd; font-weight:700; background:#0a1727; }
    .topology-edit-table__property-scroll { max-height:16rem; overflow:auto; }
    .topology-edit-table__property-group table { width:100%; min-width:560px; table-layout:auto; }
    .topology-edit-table__property-group tbody th { color:#bae6fd; font-weight:600; }
    .topology-edit-table__property-group td:nth-child(2) { max-width:44rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .topology-edit-table__property-group td:nth-child(3) { color:#94a3b8; }
    @media (max-width: 900px) { .topology-edit-table-window { left:6px !important; right:6px !important; width:auto; max-width:none; } }
    @media (max-width: 760px) { .topology-edit-table__header { align-items:stretch; flex-direction:column; } .topology-edit-table__header label { min-width:0; } .topology-edit-table__editor-grid, .topology-edit-table__first-pipe { grid-template-columns:1fr; } .topology-edit-table__editor-grid .topology-edit-table__wide, .topology-edit-table__editor-grid > button, .topology-edit-table__first-pipe > .topology-edit-table__wide { grid-column:1; } }
  `;
  documentRef.head?.append(style);
  installed = true;
}
