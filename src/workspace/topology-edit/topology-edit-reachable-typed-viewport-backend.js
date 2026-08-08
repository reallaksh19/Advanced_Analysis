import * as THREE from 'three';
import { TopologyEditTypedViewportBackend } from './topology-edit-typed-viewport-backend.js';
import {
  deriveTopologyEditEndpointAffordances,
} from '../viewport-interaction/topology-edit-endpoint-affordance-model.js';

export class TopologyEditReachableTypedViewportBackend extends TopologyEditTypedViewportBackend {
  buildNodePickProxyGroup(group, elements, markerSize) {
    const modelRole = group === this.groups.sourceGroup ? 'source' : 'draft';
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
}
