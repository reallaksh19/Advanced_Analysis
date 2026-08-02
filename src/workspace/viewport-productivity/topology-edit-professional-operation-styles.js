const STYLE_ID = 'topology-edit-professional-operation-styles';

export function ensureTopologyEditProfessionalOperationStyles(document) {
  if (!document?.head || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .topology-edit-professional-operation {
      display: grid;
      gap: 0.75rem;
      padding: 0.85rem;
      border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      border-radius: 0.55rem;
      background: color-mix(in srgb, Canvas 96%, currentColor 4%);
    }
    .topology-edit-professional-operation__header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 1rem;
    }
    .topology-edit-professional-operation__header p {
      margin: 0.25rem 0 0;
      max-width: 68ch;
      opacity: 0.75;
    }
    .topology-edit-professional-operation__header output {
      max-width: 38ch;
      overflow-wrap: anywhere;
      font-size: 0.82rem;
    }
    .topology-edit-professional-operation__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11.5rem, 1fr));
      gap: 0.55rem;
    }
    .topology-edit-professional-operation__grid label {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
      font-size: 0.78rem;
    }
    .topology-edit-professional-operation__grid input,
    .topology-edit-professional-operation__grid select {
      width: 100%;
      min-width: 0;
    }
    .topology-edit-professional-operation__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .topology-edit-professional-operation__evidence {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
      gap: 0.4rem 0.8rem;
      margin: 0;
      font-size: 0.75rem;
    }
    .topology-edit-professional-operation__evidence div {
      display: grid;
      grid-template-columns: minmax(7rem, auto) 1fr;
      gap: 0.45rem;
      min-width: 0;
    }
    .topology-edit-professional-operation__evidence dt {
      font-weight: 650;
    }
    .topology-edit-professional-operation__evidence dd {
      margin: 0;
      overflow-wrap: anywhere;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    @media (max-width: 720px) {
      .topology-edit-professional-operation__header {
        display: grid;
      }
    }
  `;
  document.head.append(style);
}
