const STYLE_ID = 'topology-edit-object-tree-styles';

export function ensureTopologyEditObjectTreeStyles(document) {
  if (!document?.head || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .topology-edit-object-tree {
      display: grid;
      gap: 0.65rem;
      padding: 0.75rem;
      border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      border-radius: 0.55rem;
      background: color-mix(in srgb, Canvas 96%, currentColor 4%);
      contain: layout style;
    }
    .topology-edit-object-tree__header {
      display: grid;
      gap: 0.45rem;
    }
    .topology-edit-object-tree__heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .topology-edit-object-tree__heading strong {
      font-size: 0.88rem;
    }
    .topology-edit-object-tree__heading output,
    .topology-edit-object-tree__status {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.7rem;
      overflow-wrap: anywhere;
    }
    .topology-edit-object-tree__filter {
      width: 100%;
      min-width: 0;
    }
    .topology-edit-object-tree__groups {
      display: grid;
      gap: 0.35rem;
      max-height: min(58vh, 34rem);
      overflow: auto;
      scrollbar-gutter: stable;
      contain: layout style paint;
    }
    .topology-edit-object-tree__group {
      border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
      border-radius: 0.4rem;
      overflow: clip;
      content-visibility: auto;
      contain-intrinsic-size: auto 320px;
    }
    .topology-edit-object-tree__group > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.4rem 0.5rem;
      cursor: pointer;
      font-size: 0.76rem;
      font-weight: 700;
      background: color-mix(in srgb, Canvas 90%, currentColor 10%);
    }
    .topology-edit-object-tree__list {
      display: grid;
      gap: 1px;
      margin: 0;
      padding: 0;
      list-style: none;
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .topology-edit-object-tree__item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.35rem;
      padding: 0.35rem;
      background: Canvas;
      contain: layout style paint;
    }
    .topology-edit-object-tree__select {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.1rem;
      min-width: 0;
      padding: 0.35rem 0.45rem;
      border: 0;
      border-radius: 0.3rem;
      text-align: left;
      color: inherit;
      background: transparent;
      cursor: pointer;
    }
    .topology-edit-object-tree__select:hover,
    .topology-edit-object-tree__select:focus-visible {
      background: color-mix(in srgb, #38bdf8 12%, Canvas 88%);
    }
    .topology-edit-object-tree__select[aria-pressed="true"] {
      outline: 1px solid color-mix(in srgb, #0ea5e9 72%, currentColor 28%);
      background: color-mix(in srgb, #0ea5e9 18%, Canvas 82%);
    }
    .topology-edit-object-tree__label,
    .topology-edit-object-tree__id,
    .topology-edit-object-tree__description {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .topology-edit-object-tree__label {
      font-size: 0.76rem;
      font-weight: 700;
    }
    .topology-edit-object-tree__id,
    .topology-edit-object-tree__description {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.64rem;
      opacity: 0.72;
    }
    .topology-edit-object-tree__actions {
      display: flex;
      flex-wrap: wrap;
      align-content: center;
      justify-content: end;
      gap: 0.25rem;
      max-width: 12rem;
    }
    .topology-edit-object-tree__actions button {
      padding: 0.25rem 0.4rem;
      font-size: 0.65rem;
    }
    .topology-edit-object-tree__actions button[data-object-tree-action="delete-edge"] {
      color: #b91c1c;
    }
    .topology-edit-object-tree__more {
      width: 100%;
      min-height: 2rem;
      border: 0;
      border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
      border-radius: 0;
      font-size: 0.7rem;
      font-weight: 700;
      color: #0ea5e9;
      background: color-mix(in srgb, Canvas 94%, #0ea5e9 6%);
      cursor: pointer;
    }
    .topology-edit-object-tree__more:hover,
    .topology-edit-object-tree__more:focus-visible {
      background: color-mix(in srgb, Canvas 86%, #0ea5e9 14%);
    }
    .topology-edit-object-tree__empty {
      margin: 0;
      padding: 0.65rem;
      font-size: 0.72rem;
      opacity: 0.72;
    }
    .topology-edit-object-tree[data-busy="true"] button {
      cursor: progress;
    }
  `;
  document.head.append(style);
}
