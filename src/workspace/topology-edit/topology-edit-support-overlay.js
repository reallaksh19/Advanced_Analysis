/**
 * Topology Edit Draft — Phase 3A Directional Support & Restraint Overlays
 *
 * Renders 3D visual geometry for piping restraints:
 * - Rigid Anchor (Box + Cross Boundary)
 * - Spring Hanger (Coil Spring Mesh)
 * - Guide Restraint (Directional Ring)
 * - Line Stop (Axial Thrust Block)
 */

import * as THREE from 'three';

export class TopologyEditSupportOverlay {
  static createSupportMesh(supportType = 'ANCHOR', scale = 1.0) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: supportType === 'ANCHOR' ? 0xef4444 : supportType === 'HANGER' ? 0xfacc15 : 0x4ade80,
      metalness: 0.5,
      roughness: 0.2,
    });

    switch (supportType.toUpperCase()) {
      case 'HANGER':
      case 'SPRING': {
        const springGeo = new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 1.2 * scale, 16);
        const springMesh = new THREE.Mesh(springGeo, material);
        group.add(springMesh);
        break;
      }
      case 'GUIDE':
      case 'REST': {
        const ringGeo = new THREE.TorusGeometry(0.6 * scale, 0.1 * scale, 8, 24);
        const ringMesh = new THREE.Mesh(ringGeo, material);
        group.add(ringMesh);
        break;
      }
      case 'ANCHOR':
      default: {
        const boxGeo = new THREE.BoxGeometry(0.8 * scale, 0.8 * scale, 0.8 * scale);
        const boxMesh = new THREE.Mesh(boxGeo, material);
        group.add(boxMesh);
        break;
      }
    }
    return group;
  }
}
