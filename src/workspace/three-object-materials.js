import * as THREE from 'three';

export const COMPONENT_COLORS = Object.freeze({
  PIPE: 0x64748b,
  VALVE: 0xcc2222,
  FLANGE: 0xb7b7b7,
  GASKET: 0xe5e7eb,
  INST: 0xf59e0b,
  ELBOW: 0x8b5cf6,
  TEE: 0x14b8a6,
  OLET: 0x0ea5e9,
  REDUCER: 0xa855f7,
  SUPPORT: 0xf97316,
  DEFAULT: 0xa78bfa,
});

export function getComponentColor(componentKind) {
  return COMPONENT_COLORS[componentKind] ?? COMPONENT_COLORS.DEFAULT;
}

export function createStandardMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
}

export function createSupportMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });
}

export function createLineMaterial(color) {
  return new THREE.LineBasicMaterial({
    color,
    linewidth: 2,
  });
}

export function registerMaterialState(object) {
  object.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((entry) => {
      entry.userData.baseColor = entry.color?.getHex?.();
    });
  });
}

export function setThreeEngineeringSelection(object, selected, selectedColor) {
  object?.traverse?.((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if (!material.color) return;
      const baseColor = material.userData?.baseColor;
      material.color.setHex(selected ? selectedColor : baseColor ?? material.color.getHex());
    });
  });
}
