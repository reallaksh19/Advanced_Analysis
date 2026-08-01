/**
 * Topology Edit Draft — 3D WebGL Canvas Floating Callout Card Engine
 *
 * Projects 3D world coordinates onto the 2D HTML stage to render interactive
 * floating callouts directly over 3D issue spheres with 1-click actions.
 */

export class TopologyEditCanvasCallout {
  constructor(stageContainer) {
    this.container = stageContainer;
    this.activeCallout = null;
  }

  showCallout(issue, screenX, screenY, onApplyFix, onFlyTo) {
    this.hideCallout();
    if (!this.container || !issue) return;

    const card = document.createElement('div');
    card.className = 'topology-edit-3d-callout';
    card.style.cssText = `
      position: absolute;
      left: ${Math.max(10, screenX - 120)}px;
      top: ${Math.max(10, screenY - 110)}px;
      z-index: 1000;
      background: #020617;
      border: 1px solid #38bdf8;
      box-shadow: 0 0 16px rgba(56,189,248,0.3);
      border-radius: 6px;
      padding: 10px 12px;
      width: 240px;
      color: #f8fafc;
      font-family: system-ui, sans-serif;
      font-size: 11px;
    `;

    const isExact = (issue.distance || 0) < 6.0;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-weight:800; color:${isExact ? '#38bdf8' : '#facc15'}; text-transform:uppercase; font-size:10px;">
          ${isExact ? '🔴 Exact Merge (<6mm)' : '🟧 Near-Match (6-25mm)'}
        </span>
        <button type="button" data-action="close-callout" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:12px;">✕</button>
      </div>
      <div style="font-size:11px; font-weight:600; color:#e2e8f0; margin-bottom:4px;">
        Nodes: ${issue.node1 || 'N1'} ➔ ${issue.node2 || 'N2'}
      </div>
      <div style="font-size:10px; color:#94a3b8; margin-bottom:8px;">
        Distance: <strong>${(issue.distance || 0).toFixed(2)} mm</strong>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" data-action="apply-callout-fix" style="flex:1; padding:4px 8px; background:#0284c7; color:#fff; border:none; border-radius:4px; font-weight:700; font-size:10px; cursor:pointer;">⚡ Apply Fix</button>
        <button type="button" data-action="flyto-callout" style="padding:4px 8px; background:#0f172a; color:#38bdf8; border:1px solid #334155; border-radius:4px; font-weight:700; font-size:10px; cursor:pointer;">🔍 Fly To</button>
      </div>
    `;

    card.querySelector('[data-action="close-callout"]').addEventListener('click', () => this.hideCallout());
    card.querySelector('[data-action="apply-callout-fix"]').addEventListener('click', () => {
      if (onApplyFix) onApplyFix(issue);
      this.hideCallout();
    });
    card.querySelector('[data-action="flyto-callout"]').addEventListener('click', () => {
      if (onFlyTo) onFlyTo(issue);
    });

    this.container.appendChild(card);
    this.activeCallout = card;
  }

  hideCallout() {
    if (this.activeCallout && this.activeCallout.parentElement) {
      this.activeCallout.parentElement.removeChild(this.activeCallout);
    }
    this.activeCallout = null;
  }
}
