const STYLE_ID = 'topology-edit-authoring-styles';

export function ensureTopologyEditAuthoringStyles(documentRef = globalThis.document) {
  if (!documentRef?.head || documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .topology-edit-authoring-hud {
      display: grid;
      gap: 0.75rem;
      min-width: 0;
      font-size: 0.78rem;
    }
    .topology-edit-authoring-hud__tools,
    .topology-edit-authoring-hud__actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.4rem;
    }
    .topology-edit-authoring-hud button {
      min-height: 2rem;
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 0.45rem;
      background: rgba(15, 23, 42, 0.86);
      color: inherit;
      cursor: pointer;
    }
    .topology-edit-authoring-hud button[aria-pressed="true"],
    .topology-edit-authoring-hud__actions button:not(:disabled):first-child {
      border-color: rgba(56, 189, 248, 0.8);
      background: rgba(14, 116, 144, 0.35);
    }
    .topology-edit-authoring-hud button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
    .topology-edit-authoring-hud__status,
    .topology-edit-authoring-hud__target,
    .topology-edit-authoring-hud__evidence {
      display: grid;
      gap: 0.3rem;
      padding: 0.55rem 0.65rem;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 0.45rem;
      background: rgba(15, 23, 42, 0.45);
      overflow-wrap: anywhere;
    }
    .topology-edit-authoring-hud__phase {
      width: max-content;
      padding: 0.15rem 0.45rem;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.16);
      color: #7dd3fc;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .topology-edit-authoring-hud__target code {
      white-space: normal;
      color: #bae6fd;
    }
    .topology-edit-authoring-hud__form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.55rem;
    }
    .topology-edit-authoring-hud__form label {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.28rem 0.4rem;
      align-items: center;
      min-width: 0;
    }
    .topology-edit-authoring-hud__form input,
    .topology-edit-authoring-hud__form select {
      grid-column: 1 / -1;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      min-height: 2rem;
      padding: 0.35rem 0.45rem;
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 0.35rem;
      background: rgba(2, 6, 23, 0.72);
      color: inherit;
    }
    .topology-edit-authoring-hud__authority {
      justify-self: end;
      padding: 0.1rem 0.3rem;
      border-radius: 999px;
      background: rgba(100, 116, 139, 0.2);
      color: #cbd5e1;
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .topology-edit-authoring-hud__actions {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .topology-edit-authoring-hud__error {
      margin: 0;
      padding: 0.55rem 0.65rem;
      border: 1px solid rgba(248, 113, 113, 0.55);
      border-radius: 0.45rem;
      background: rgba(127, 29, 29, 0.28);
      color: #fecaca;
    }
    .topology-edit-authoring-hud ul {
      margin: 0;
      padding-left: 1.15rem;
      color: #fecaca;
    }
    .topology-edit-authoring-hud__evidence {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      color: #94a3b8;
      font-size: 0.68rem;
    }
    @media (max-width: 900px) {
      .topology-edit-authoring-hud__form,
      .topology-edit-authoring-hud__tools,
      .topology-edit-authoring-hud__actions,
      .topology-edit-authoring-hud__evidence {
        grid-template-columns: 1fr;
      }
    }
  `;
  documentRef.head.append(style);
}
