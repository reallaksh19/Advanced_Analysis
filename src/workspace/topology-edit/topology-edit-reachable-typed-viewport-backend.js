import * as THREE from 'three';
import { createTopologyEditPick } from './topology-edit-picking-contract.js';
import { TopologyEditTypedViewportBackend } from './topology-edit-typed-viewport-backend.js';
import {
  deriveTopologyEditEndpointAffordances,
} from '../viewport-interaction/topology-edit-endpoint-affordance-model.js';
import {
  TopologyEditEndpointAffordanceRuntime,
} from '../viewport-interaction/topology-edit-endpoint-affordance-runtime.js';

export class TopologyEditReachableTypedViewportBackend extends TopologyEditTypedViewportBackend {
  constructor(options = {}) {
    super(options);
    this.endpointAffordances = Object.freeze([]);
    this.hasDraftEndpointProjection = false;
    this.endpointRuntime = new TopologyEditEndpointAffordanceRuntime({
      onActivate: (affordance, event) => this.activateEndpointAffordance(affordance, event),
    });
  }

  mount(host) {
    super.mount(host);
    this.endpointRuntime.mount(host);
  }

  renderSession(model) {
    const projection = model?.draft ?? model?.source ?? { elements: [] };
    this.hasDraftEndpointProjection = Boolean(model?.draft);
    this.endpointAffordances = deriveTopologyEditEndpointAffordances(
      projection,
      { modelRole: model?.draft ? 'draft' : 'source' },
    );
    super.renderSession(model);
    this.endpointRuntime.render(this.endpointAffordances);
    publishEndpointReachabilityEvidence(
      this.hostElement,
      projection,
      this.endpointAffordances,
    );
  }

  buildNodePickProxyGroup(group, elements, markerSize) {
    const modelRole = group === this.groups.sourceGroup ? 'source' : 'draft';
    if (modelRole === 'source' && this.hasDraftEndpointProjection) return;
    const affordances = deriveTopologyEditEndpointAffordances(
      { elements },
      { modelRole },
    );
    if (!affordances.length) return;
    const radius = Math.max(Number(markerSize) * 0.7, 4);
    const geometry = new THREE.SphereGeometry(
      radius,
      Math.max(10, this.navigationConfiguration.meshRadialSegments),
      Math.max(8, Math.floor(this.navigationConfiguration.meshRadialSegments * 0.75)),
    );
    const material = new THREE.MeshBasicMaterial({
      color: modelRole === 'draft' ? 0xf8fafc : 0x94a3b8,
      transparent: true,
      opacity: modelRole === 'draft' ? 0.9 : 0.35,
      depthWrite: false,
      depthTest: false,
      wireframe: true,
    });
    for (const affordance of affordances) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `topology-edit-endpoint-affordance:${affordance.canonicalId}`;
      mesh.position.set(
        affordance.position.x,
        affordance.position.y,
        affordance.position.z,
      );
      mesh.renderOrder = 100;
      mesh.userData = {
        canonicalId: affordance.canonicalId,
        type: 'node',
        pickTarget: affordance.pickTarget,
        pickProxy: true,
        endpointAffordance: true,
        pickPriority: affordance.pickPriority,
        accessibleLabel: affordance.accessibleLabel,
        renderAuthority: 'CANONICAL_NODE_VISIBLE_AFFORDANCE',
      };
      group.add(mesh);
    }
  }

  pickVisibleEndpoint(pointer) {
    if (!this.pickRaycaster || !this.activeCamera || !this.endpointAffordances?.length) {
      return null;
    }
    this.pickRaycaster.params.Line.threshold = this.navigationConfiguration.pickingRadius;
    this.pickRaycaster.setFromCamera(pointer, this.activeCamera);
    const hit = this.pickRaycaster.intersectObjects(this.pickableGroups(), true).find((candidate) => (
      candidate.object?.userData?.endpointAffordance === true
      && candidate.object.userData.pickTarget?.objectId
      && this.isSectionHitAllowed(candidate.object, candidate.point)
    ));
    return hit ? this.pickReceipt(hit.object.userData.pickTarget, hit.point) : null;
  }

  activateEndpointAffordance(affordance, event) {
    const pick = createTopologyEditPick({
      ...affordance.pickTarget,
      point: affordance.position,
    });
    this.lastSelectionPick = pick;
    this.selectionRequestHandler?.(pick, event);
    this.invalidate('accessible-endpoint-selection');
  }

  destroy() {
    this.endpointRuntime.destroy();
    this.endpointAffordances = Object.freeze([]);
    this.hasDraftEndpointProjection = false;
    super.destroy();
  }
}

function publishEndpointReachabilityEvidence(host, projection, affordances) {
  const typedEvidence = projection?.typedEvidenceProjection ?? null;
  for (const evidenceHost of endpointEvidenceHosts(host)) {
    evidenceHost.dataset.topologyEditVisibleEndpointCount = String(affordances.length);
    evidenceHost.dataset.topologyEditEndpointProjectionElementCount = String(
      projection?.elements?.length ?? 0,
    );
    evidenceHost.dataset.topologyEditEndpointCompactElementCount = String(
      projection?.compactElements?.length ?? 0,
    );
    evidenceHost.dataset.topologyEditEndpointTypedEvidenceElementCount = String(
      typedEvidence?.elements?.length ?? 0,
    );
  }
}

function endpointEvidenceHosts(host) {
  const shell = host?.closest?.('[data-role="topology-edit-render-host"]');
  return [...new Set([host, shell].filter(Boolean))];
}
