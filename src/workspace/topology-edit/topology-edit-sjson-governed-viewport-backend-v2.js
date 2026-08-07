import * as THREE from 'three';
import { TopologyEditNavigationHudViewportBackend } from './topology-edit-navigation-hud-viewport-backend.js';
import {
  TOPOLOGY_EDIT_SUPPORT_RENDER_STYLES,
} from './topology-edit-support-viewport-backend.js';
import {
  TOPOLOGY_EDIT_SJSON_EDIT_DRAFT_RENDER_STYLE,
  TOPOLOGY_EDIT_SJSON_GOVERNED_PROJECTION_SCHEMA,
} from './topology-edit-sjson-governed-projection-v2.js';
import {
  applyGovernedCameraClipping,
  createGovernedCameraClippingPolicy,
} from './topology-edit-sjson-camera-clipping-v3.js';
import { renderGovernedSjsonIssues } from './topology-edit-sjson-governed-issue-renderer-v2.js';
import { renderGovernedSjsonRoute } from './topology-edit-sjson-governed-route-renderer-v2.js';
import { renderGovernedSjsonSupports } from './topology-edit-sjson-governed-support-renderer-v2.js';
import {
  clearGovernedEmpiricalResultEvidence,
  renderGovernedEmpiricalResults,
} from './topology-edit-empirical-result-renderer-v1.js';

const DEFAULT_NODE_MARKER_RADIUS_MM = 4.2;

/** One render transaction for SJSON route, nodes, supports, results, and transient checker HUD. */
export class TopologyEditSjsonGovernedNavigationHudViewportBackendV2
  extends TopologyEditNavigationHudViewportBackend {
  constructor(options = {}) {
    super(options);
    this.groups.resultGroup = new THREE.Group();
    this.groups.resultGroup.name = 'topology-edit-empirical-result-group';
    this.groups.resultGroup.userData = {
      overlay: true,
      sourceRestraintProjection: false,
      empiricalResultProjection: true,
    };
    this.engineeringRoot.add(this.groups.resultGroup);
    this.governedSupportProjection = null;
    this.governedResultProjection = null;
    this.governedResultClearReason = 'EMPIRICAL_EXECUTION_REQUIRED';
    this.governedNodeMarkerRadiusMm = DEFAULT_NODE_MARKER_RADIUS_MM;
    this.governedCameraClippingPolicy = createGovernedCameraClippingPolicy(
      this.navigationConfiguration,
      options.cameraClippingPolicy,
    );
    this.governedCameraClippingEvidence = null;
    this.lastGovernedRenderModel = null;
  }

  mount(host) {
    super.mount(host);
    if (this.gpuPicker) {
      this.gpuPicker.pixelRadius = Math.max(
        8,
        Math.min(24, Math.ceil(this.navigationConfiguration.clickTravelTolerancePx * 2)),
      );
    }
    clearGovernedEmpiricalResultEvidence(
      this.hostElement,
      this.governedResultClearReason,
    );
    this.updateGovernedCameraClipping();
  }

  createNavigation(target) {
    super.createNavigation(target);
    if (!this.controls) return;
    if (this.controlsChangeHandler) {
      this.controls.removeEventListener('change', this.controlsChangeHandler);
    }
    this.controlsChangeHandler = () => {
      this.updateGovernedCameraClipping();
      this.invalidate('controls-change');
    };
    this.controls.addEventListener('change', this.controlsChangeHandler);
  }

  setGovernedSupportProjection(projection) {
    if (projection !== null && typeof projection !== 'object') {
      throw new TypeError('Governed SJSON support projection must be an object or null.');
    }
    this.governedSupportProjection = projection;
  }

  setGovernedResultProjection(projection, reasonCode = '') {
    if (projection !== null && typeof projection !== 'object') {
      throw new TypeError('Governed empirical result projection must be an object or null.');
    }
    this.governedResultProjection = projection;
    this.governedResultClearReason = projection
      ? ''
      : String(reasonCode || 'EMPIRICAL_EXECUTION_REQUIRED');
    this.clearGroup(this.groups.resultGroup);
    if (!projection) {
      clearGovernedEmpiricalResultEvidence(
        this.hostElement,
        this.governedResultClearReason,
      );
    }
    if (this.lastGovernedRenderModel) {
      this.renderSession(this.lastGovernedRenderModel);
    } else {
      this.invalidate(projection ? 'empirical-result-pending-render' : 'empirical-result-clear');
    }
    return this.governedResultProjection;
  }

  setGovernedNodeMarkerRadiusMm(value) {
    const radiusMm = Number(value);
    if (!Number.isFinite(radiusMm) || radiusMm < 1 || radiusMm > 20) {
      throw new RangeError('Governed node marker radius must be from 1 mm to 20 mm.');
    }
    if (radiusMm === this.governedNodeMarkerRadiusMm) return radiusMm;
    this.governedNodeMarkerRadiusMm = radiusMm;
    if (this.lastGovernedRenderModel) this.renderSession(this.lastGovernedRenderModel);
    return radiusMm;
  }

  setGovernedCameraClippingPolicy(policy) {
    this.governedCameraClippingPolicy = createGovernedCameraClippingPolicy(
      this.navigationConfiguration,
      policy,
    );
    this.updateGovernedCameraClipping();
    this.invalidate('camera-clipping-policy');
    return this.governedCameraClippingSnapshot();
  }

  updateGovernedCameraClipping() {
    if (!this.activeCamera) return null;
    return applyGovernedCameraClipping(this);
  }

  governedCameraClippingSnapshot() {
    return this.governedCameraClippingEvidence
      ? Object.freeze({ ...this.governedCameraClippingEvidence })
      : null;
  }

  renderSession(model) {
    this.lastGovernedRenderModel = model;
    const packet = this.governedSupportProjection
      ? { ...model, supports: this.governedSupportProjection }
      : model;
    super.renderSession(packet);
    this.clearGroup(this.groups.resultGroup);
    if (this.governedResultProjection) {
      renderGovernedEmpiricalResults({
        backend: this,
        group: this.groups.resultGroup,
        projection: this.governedResultProjection,
      });
      this.engineeringRoot.updateMatrixWorld(true);
    } else {
      clearGovernedEmpiricalResultEvidence(
        this.hostElement,
        this.governedResultClearReason,
      );
    }
    this.updateGovernedCameraClipping();
    if (this.hostElement) {
      this.hostElement.dataset.topologyEditSjsonSingleRenderPacket = 'true';
      this.hostElement.dataset.topologyEditSjsonProjectionSchema = model?.draft?.schema || '';
      this.hostElement.dataset.topologyEditGpuPickRadiusCssPx = String(
        this.gpuPicker?.pixelRadius || 0,
      );
    }
    this.invalidate('governed-sjson-result-packet');
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

  renderIssues(overlay) {
    if (!this.governedSupportProjection) return super.renderIssues(overlay);
    const count = renderGovernedSjsonIssues({ backend: this, overlay });
    this.invalidate('issue-overlay');
    return count;
  }

  destroy() {
    this.governedSupportProjection = null;
    this.governedResultProjection = null;
    this.governedResultClearReason = 'EMPIRICAL_VIEWPORT_DESTROYED';
    this.governedCameraClippingEvidence = null;
    this.lastGovernedRenderModel = null;
    if (this.groups?.resultGroup) this.clearGroup(this.groups.resultGroup);
    clearGovernedEmpiricalResultEvidence(
      this.hostElement,
      this.governedResultClearReason,
    );
    super.destroy();
  }
}

export const TopologyEditSjsonGovernedViewportBackendV2 =
  TopologyEditSjsonGovernedNavigationHudViewportBackendV2;

export const TopologyEditSjsonGovernedViewportBackend =
  TopologyEditSjsonGovernedNavigationHudViewportBackendV2;
