import { TopologyEditNavigationHudViewportBackend } from './topology-edit-navigation-hud-viewport-backend.js';
import {
  TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES,
} from './topology-edit-support-viewport-backend.js';
import {
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
  TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
} from './topology-edit-sjson-governed-projection-v2.js';
import { renderGovernedSjsonRoute } from './topology-edit-sjson-governed-route-renderer-v2.js';
import { renderGovernedSjsonSupports } from './topology-edit-sjson-governed-support-renderer-v2.js';

/** One render transaction for SJSON route, nodes, and support overlays. */
export class TopologyEditSjsonGovernedNavigationHudViewportBackendV2
  extends TopologyEditNavigationHudViewportBackend {
  constructor(options = {}) {
    super(options);
    this.governedSupportProjection = null;
  }

  setGovernedSupportProjection(projection) {
    if (projection !== null && typeof projection !== 'object') {
      throw new TypeError('Governed SJSON support projection must be an object or null.');
    }
    this.governedSupportProjection = projection;
  }

  renderSession(model) {
    const packet = this.governedSupportProjection
      ? { ...model, supports: this.governedSupportProjection }
      : model;
    super.renderSession(packet);
    if (this.hostElement) {
      this.hostElement.dataset.topologyEditSjsonSingleRenderPacket = 'true';
      this.hostElement.dataset.topologyEditSjsonProjectionSchema = model?.draft?.schema || '';
    }
  }

  renderProjection(group, projection, colorHex, opacity, markerSize) {
    if (
      (group === this.groups.sourceGroup || group === this.groups.draftGroup)
      && projection?.renderStyle === TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE
      && projection?.schema === TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA
    ) {
      return renderGovernedSjsonRoute({
        backend: this,
        group,
        projection,
        fallbackColor: colorHex,
        opacity,
      });
    }
    if (
      group === this.groups.supportGroup
      && projection?.renderStyle === TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES.TOPO_VALIDATOR_COMPACT
    ) {
      return renderGovernedSjsonSupports({ backend: this, group, projection });
    }
    return super.renderProjection(group, projection, colorHex, opacity, markerSize);
  }

  destroy() {
    this.governedSupportProjection = null;
    super.destroy();
  }
}

export const TopologyEditSjsonGovernedViewportBackendV2 =
  TopologyEditSjsonGovernedNavigationHudViewportBackendV2;

export const TopologyEditSjsonGovernedViewportBackend =
  TopologyEditSjsonGovernedNavigationHudViewportBackendV2;
