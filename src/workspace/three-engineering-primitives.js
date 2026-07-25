import * as THREE from 'three';

export function createThreeEngineeringObject(item, markerRadius) {
  const primitive = item.primitive;
  const color = categoryColor(item.category);
  let object;

  if (primitive.kind === 'tube') {
    object = createCylinderBetween(
      primitive.start,
      primitive.end,
      primitive.visualDiameterMm,
      primitive.visualDiameterMm,
      color,
    );
  } else if (primitive.kind === 'swept-path') {
    object = createSweptPath(primitive.path, primitive.visualDiameterMm, color);
  } else if (primitive.kind === 'junction') {
    object = createJunction(primitive, color);
  } else if (primitive.kind === 'frustum') {
    object = createCylinderBetween(
      primitive.start,
      primitive.end,
      primitive.visualStartDiameterMm,
      primitive.visualEndDiameterMm,
      color,
    );
  } else if (primitive.kind === 'disc') {
    object = createDisc(primitive, color);
  } else if (primitive.kind === 'valve-body') {
    object = createValveBody(primitive, color);
  } else if (primitive.kind === 'support-marker') {
    object = createSupportMarker(primitive, color);
  } else {
    object = createMarker(primitive.center, primitive.visualDiameterMm / 2 || markerRadius, color);
  }

  object.userData.componentKind = item.componentKind;
  object.userData.resolutionStatus = item.resolutionStatus;
  registerMaterialState(object);
  return object;
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

export function disposeThreeEngineeringObject(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
  });
}

function createCylinderBetween(start, end, startDiameter, endDiameter, color) {
  const a = vector(start);
  const b = vector(end);
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(direction.length(), 1e-6);
  const startRadius = Math.max(Number(startDiameter) / 2 || 0.5, 0.1);
  const endRadius = Math.max(Number(endDiameter) / 2 || startRadius, 0.1);
  const geometry = new THREE.CylinderGeometry(endRadius, startRadius, length, 20, 1, false);
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function createSweptPath(path, diameter, color) {
  const points = path.map(vector);
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const radius = Math.max(Number(diameter) / 2 || 0.5, 0.1);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(points.length * 2, 12), radius, 10, false),
    material(color),
  );
}

function createJunction(primitive, color) {
  const group = new THREE.Group();
  primitive.legs.forEach((leg) => {
    group.add(createCylinderBetween(
      leg.start,
      leg.end,
      leg.visualDiameterMm,
      leg.visualDiameterMm,
      color,
    ));
  });
  const radius = Math.max(Number(primitive.visualDiameterMm) / 2 || 0.5, 0.1);
  group.add(createMarker(primitive.center, radius, color));
  return group;
}

function createDisc(primitive, color) {
  const radius = Math.max(Number(primitive.visualOutsideDiameterMm) / 2 || 0.5, 0.1);
  const thickness = Math.max(Number(primitive.visualThicknessMm) || radius * 0.2, 0.1);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, thickness, 24, 1, false),
    material(color),
  );
  mesh.position.copy(vector(primitive.center));
  orientAlong(mesh, primitive.axisStart, primitive.axisEnd);
  return mesh;
}

function createValveBody(primitive, color) {
  const group = new THREE.Group();
  const bodyDiameter = Math.max(Number(primitive.visualBodyDiameterMm) || 1, 0.2);
  group.add(createCylinderBetween(
    primitive.start,
    primitive.end,
    bodyDiameter * 0.45,
    bodyDiameter * 0.45,
    color,
  ));
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(bodyDiameter / 2, 20, 14),
    material(color),
  );
  body.position.copy(vector(primitive.center));
  group.add(body);
  return group;
}

function createSupportMarker(primitive, color) {
  const size = Math.max(Number(primitive.visualSizeMm) || 1, 0.2);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    material(color),
  );
  mesh.position.copy(vector(primitive.center));
  return mesh;
}

function createMarker(center, radius, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius, 0.1), 18, 12),
    material(color),
  );
  mesh.position.copy(vector(center));
  return mesh;
}

function orientAlong(object, start, end) {
  const direction = new THREE.Vector3().subVectors(vector(end), vector(start));
  if (direction.lengthSq() <= 1e-12) return;
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

function registerMaterialState(object) {
  object.traverse((child) => {
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((entry) => {
      entry.userData.baseColor = entry.color?.getHex?.();
    });
  });
}

function material(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
}

function vector(point) {
  return new THREE.Vector3(point?.x || 0, point?.y || 0, point?.z || 0);
}

function categoryColor(category) {
  if (category === 'support') return 0xf97316;
  if (category === 'pipe') return 0x60a5fa;
  return 0xa78bfa;
}
