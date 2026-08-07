let installed = false;

export function ensureTopologyEditTableStyles(documentRef) {
  if (!documentRef || installed || documentRef.getElementById('topology-edit-table-styles')) return;
  const style = documentRef.createElement('style');
  style.id = 'topology-edit-table-styles';
  style.textContent = `
    .topology-edit-table { display:grid; gap:.65rem; min-width:0; font-size:.78rem; }
    .topology-edit-table__header { display:flex; align-items:end; justify-content:space-between; gap:.75rem; }
    .topology-edit-table__header > div { display:flex; flex-direction:column; gap:.15rem; }
    .topology-edit-table__header label { display:grid; gap:.2rem; min-width:12rem; }
    .topology-edit-table input, .topology-edit-table select, .topology-edit-table button { font:inherit; }
    .topology-edit-table input, .topology-edit-table select { min-height:1.8rem; border:1px solid color-mix(in srgb, currentColor 24%, transparent); border-radius:.3rem; background:var(--panel-bg, #fff); color:inherit; padding:.25rem .4rem; }
    .topology-edit-table button { min-height:1.75rem; border:1px solid color-mix(in srgb, currentColor 22%, transparent); border-radius:.3rem; background:color-mix(in srgb, currentColor 6%, transparent); color:inherit; padding:.2rem .45rem; cursor:pointer; }
    .topology-edit-table button:disabled { opacity:.45; cursor:not-allowed; }
    .topology-edit-table__scroll { overflow:auto; max-height:25rem; border:1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius:.4rem; }
    .topology-edit-table table { width:max-content; min-width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
    .topology-edit-table th, .topology-edit-table td { padding:.3rem .45rem; border-bottom:1px solid color-mix(in srgb, currentColor 12%, transparent); white-space:nowrap; text-align:left; }
    .topology-edit-table thead { position:sticky; top:0; z-index:1; background:var(--panel-bg, #fff); }
    .topology-edit-table th button { border:0; background:transparent; padding:0; font-weight:700; }
    .topology-edit-table tr[data-staged="true"] { outline:1px solid currentColor; outline-offset:-1px; }
    .topology-edit-table [data-table-select] { border:0; background:transparent; padding:0 .25rem; }
    .topology-edit-table__editor, .topology-edit-table__staged { display:grid; gap:.5rem; padding:.6rem; border:1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius:.4rem; }
    .topology-edit-table__identity { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
    .topology-edit-table__identity code { opacity:.72; }
    .topology-edit-table__editor-grid { display:grid; grid-template-columns:minmax(8rem,1fr) minmax(7rem,.7fr) minmax(9rem,1fr) auto; gap:.5rem; align-items:end; }
    .topology-edit-table__editor-grid label { display:grid; gap:.2rem; }
    .topology-edit-table__custody { display:flex; gap:.7rem; flex-wrap:wrap; opacity:.76; }
    .topology-edit-table__staged ul, .topology-edit-table__conflict ul { margin:.2rem 0 0; padding-left:1.2rem; }
    .topology-edit-table__conflict { padding:.45rem; border:1px solid currentColor; border-radius:.35rem; }
    .topology-edit-table__workflow { display:flex; gap:.4rem; flex-wrap:wrap; }
    .topology-edit-table__status, .topology-edit-table__notice, .topology-edit-table__empty { opacity:.8; }
    @media (max-width: 900px) { .topology-edit-table__editor-grid { grid-template-columns:1fr 1fr; } .topology-edit-table__header { align-items:stretch; flex-direction:column; } }
  `;
  documentRef.head?.append(style);
  installed = true;
}
