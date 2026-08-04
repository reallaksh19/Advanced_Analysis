import { isThreeScenePooledResource } from './three-scene-resource-pool.js';

export function disposeThreeEngineeringObject(object) {
  if (!object) return;
  object.traverse?.((child) => {
    if (child.geometry && !isThreeScenePooledResource(child.geometry)) {
      child.geometry.dispose();
    }
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (isThreeScenePooledResource(material)) return;
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}
