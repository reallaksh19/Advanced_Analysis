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
    .topology-edit-component-hud {
      display: grid;
      gap: 0.55rem;
      padding: 0.7rem;
      border: 1px solid color-mix(in srgb, #38bdf8 45%, currentColor 18%);
      border-radius: 0.5rem;
      background: color-mix(in srgb, #0ea5e9 8%, Canvas 92%);
    }
    .topology-edit-component-hud > header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .topology-edit-component-hud > header div {
      display: grid;
      gap: 0.15rem;
      min-width: 0;
    }
    .topology-edit-component-hud > header span,
    .topology-edit-component-hud > header output,
    .topology-edit-component-hud > small {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.72rem;
      overflow-wrap: anywhere;
    }
    .topology-edit-component-hud > header output {
      padding: 0.15rem 0.4rem;
      border: 1px solid currentColor;
      border-radius: 999px;
      font-weight: 700;
    }
    .topology-edit-component-hud > p {
      margin: 0;
      font-size: 0.78rem;
      opacity: 0.8;
    }
    .topology-edit-component-hud > dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
      gap: 0.4rem;
      margin: 0;
    }
    .topology-edit-component-hud > dl div {
      display: grid;
      gap: 0.15rem;
      padding: 0.4rem;
      border-radius: 0.35rem;
      background: color-mix(in srgb, Canvas 88%, currentColor 12%);
    }
    .topology-edit-component-hud dt {
      font-size: 0.7rem;
      font-weight: 650;
      opacity: 0.75;
    }
    .topology-edit-component-hud dd {
      display: grid;
      gap: 0.1rem;
      margin: 0;
      font-weight: 650;
    }
    .topology-edit-component-hud dd small {
      font-size: 0.62rem;
      font-weight: 500;
      opacity: 0.65;
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
      .topology-edit-professional-operation__header,
      .topology-edit-component-hud > header {
        display: grid;
      }
    }
  `;
  document.head.append(style);
}
