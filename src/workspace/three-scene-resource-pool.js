const POOLED_RESOURCE_FLAG = 'workspaceSceneResourcePoolOwned';

export class ThreeSceneResourcePool {
  constructor() {
    this.geometries = new Map();
    this.materials = new Map();
    this.disposed = false;
    this.geometryReuseCount = 0;
    this.materialReuseCount = 0;
  }

  geometry(key, factory) {
    return this.acquire(this.geometries, key, factory, 'geometry');
  }

  material(key, factory) {
    return this.acquire(this.materials, key, factory, 'material');
  }

  evidence() {
    return Object.freeze({
      schema: 'workspace-three-resource-pool-evidence/v1',
      geometryCount: this.geometries.size,
      materialCount: this.materials.size,
      geometryReuseCount: this.geometryReuseCount,
      materialReuseCount: this.materialReuseCount,
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const resources = new Set([...this.geometries.values(), ...this.materials.values()]);
    resources.forEach((resource) => resource?.dispose?.());
    this.geometries.clear();
    this.materials.clear();
  }

  acquire(map, keyInput, factory, kind) {
    if (this.disposed) throw new Error('Disposed Three scene resource pool cannot acquire resources.');
    const key = String(keyInput || '').trim();
    if (!key) throw new TypeError(`Three scene ${kind} resource key is required.`);
    if (typeof factory !== 'function') throw new TypeError(`Three scene ${kind} resource factory is required.`);
    const existing = map.get(key);
    if (existing) {
      if (kind === 'geometry') this.geometryReuseCount += 1;
      else this.materialReuseCount += 1;
      return existing;
    }
    const resource = factory();
    if (!resource?.dispose) throw new TypeError(`Three scene ${kind} factory returned an invalid resource.`);
    resource.userData = { ...(resource.userData || {}), [POOLED_RESOURCE_FLAG]: true };
    map.set(key, resource);
    return resource;
  }
}

export function isThreeScenePooledResource(resource) {
  return Boolean(resource?.userData?.[POOLED_RESOURCE_FLAG]);
}
