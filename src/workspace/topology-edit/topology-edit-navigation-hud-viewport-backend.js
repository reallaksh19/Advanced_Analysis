/** M004 axis HUD layered on the M003 support-glyph viewport. */
import { ViewportAxisHUD } from '../viewport-axis-hud.js';
import { TopologyEditSupportViewportBackend } from './topology-edit-support-viewport-backend.js';

export class TopologyEditNavigationHudViewportBackend extends TopologyEditSupportViewportBackend {
  constructor(options = {}) {
    super(options);
    this.axisHud = null;
  }

  mount(host) {
    super.mount(host);
    this.axisHud = new ViewportAxisHUD();
    this.renderer.domElement.tabIndex = 0;
    this.invalidate('axis-hud-mount');
  }

  renderFrame() {
    const shouldRender = Boolean(
      this.renderDirty && this.isMounted && this.renderer && !this.contextLost,
    );
    super.renderFrame();
    if (!shouldRender || !this.axisHud || !this.hostElement || !this.activeCamera) return;
    const width = Math.max(this.hostElement.clientWidth, 1);
    const height = Math.max(this.hostElement.clientHeight, 1);
    this.axisHud.updateOrientation(this.activeCamera);
    this.axisHud.render(this.renderer, width, height);
  }

  destroy() {
    this.axisHud?.dispose();
    this.axisHud = null;
    super.destroy();
  }
}
