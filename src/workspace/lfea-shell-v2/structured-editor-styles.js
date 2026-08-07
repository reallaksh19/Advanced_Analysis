export const LFEA_STRUCTURED_EDITOR_STYLES = `
.lfea-shell-v2__structured-editor{display:grid;gap:9px;padding:9px;border:1px solid var(--lfea-border);border-radius:6px;background:var(--lfea-panel)}
.lfea-shell-v2__editor-heading{display:flex;justify-content:space-between;gap:8px;align-items:center}.lfea-shell-v2__editor-heading strong{color:var(--lfea-accent);font-size:11px}.lfea-shell-v2__editor-heading span{color:var(--lfea-muted);font-size:10px}
.lfea-shell-v2__editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lfea-shell-v2__editor-field{display:grid;gap:4px;min-width:0;color:var(--lfea-muted);font-size:10px}.lfea-shell-v2__editor-field>input,.lfea-shell-v2__editor-field>select{box-sizing:border-box;width:100%;min-width:0;padding:6px}
.lfea-shell-v2__editor-field:has([data-field="sourceSemanticHash"]),.lfea-shell-v2__editor-field:has([data-field="sourceEntityId"]){grid-column:1/-1}
.lfea-shell-v2__node-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.lfea-shell-v2__node-slots label{display:grid;grid-template-columns:auto 1fr;gap:5px;align-items:center}.lfea-shell-v2__node-slots select{min-width:0;padding:5px}
.lfea-shell-v2__edge-list{display:grid;gap:5px}.lfea-shell-v2__edge-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:5px}.lfea-shell-v2__edge-row select{min-width:0;padding:5px}.lfea-shell-v2__inline-action{justify-self:start}
.lfea-shell-v2__constraint-component{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:5px}.lfea-shell-v2__constraint-component select,.lfea-shell-v2__constraint-component input{min-width:0;padding:5px}.lfea-shell-v2__editor-field select[multiple]{min-height:74px;padding:3px}
.lfea-shell-v2__structured-editor .lfea-workbench__record-actions{display:flex;gap:6px;flex-wrap:wrap;padding-top:2px}
@media(max-width:720px){.lfea-shell-v2__editor-grid{grid-template-columns:1fr}.lfea-shell-v2__editor-field:has([data-field="sourceSemanticHash"]),.lfea-shell-v2__editor-field:has([data-field="sourceEntityId"]){grid-column:auto}}
`;
