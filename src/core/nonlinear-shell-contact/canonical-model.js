import {
  SCHEMAS, assertArray, assertBoolean, assertEnum, assertExactKeys,
  assertFiniteNumber, assertHash, assertId, assertPlainData, assertString,
  assertUniqueIds, assertUnitVector, clonePlain, codeUnitCompare,
  sealWithHash, verifySealedHash,
} from './contracts.js';

export const ENGINEERING_LEVEL = 'GEOMETRICALLY_NONLINEAR_3D_SHELL_CONTACT';
export const SHELL_ELEMENT_PROFILE = 'SHELL_Q4_EXTERNAL_KERNEL_V1';
export const MATERIAL_PROFILE = 'ISOTROPIC_LINEAR_ELASTIC_V1';
export const CANONICAL_UNITS = Object.freeze({
  length: 'mm', force: 'N', stress: 'MPa', pressure: 'MPa', modulus: 'MPa',
  energy: 'N*mm', rotation: 'rad', strain: 'dimensionless', temperature: 'K',
});
export const RIGID_SURFACE_TYPES = Object.freeze([
  'RIGID_PLANE', 'RIGID_SPHERE', 'RIGID_CYLINDER', 'RIGID_SADDLE',
]);
export const STEP_TYPES = Object.freeze([
  'STATIC_GENERAL', 'PRESSURE_RAMP', 'PRESCRIBED_INDENTATION', 'UNLOADING',
]);
export const OUTPUT_TYPES = Object.freeze([
  'NODAL_DISPLACEMENT', 'NODAL_REACTION', 'SHELL_STRESS', 'SHELL_STRAIN',
  'SHELL_SECTION_FORCE', 'CONTACT_PRESSURE', 'CONTACT_OPENING',
  'CONTACT_NORMAL_FORCE', 'CONTACT_AREA', 'TOTAL_STRAIN_ENERGY', 'EXTERNAL_WORK',
]);
export const REQUIRED_LIMITATIONS = Object.freeze([
  'NO_SHELL_FORMULATION_QUALIFICATION', 'NO_CONTACT_PROCEDURE_QUALIFICATION',
  'NO_PIPE_DENTING_QUALIFICATION', 'NO_PLASTICITY', 'NO_SELF_CONTACT',
  'NO_FRICTION', 'NO_DAMAGE', 'NO_BUCKLING', 'NO_FATIGUE', 'NO_FRACTURE',
  'NO_CODE_ASSESSMENT', 'NO_PRODUCTION_EXECUTION_AUTHORITY', 'NO_UI_INTEGRATION',
]);
const KEYS = [
  'schema', 'modelId', 'engineeringLevel', 'unitSystem', 'nodes',
  'shellElements', 'materials', 'shellSections', 'surfaceDefinitions',
  'rigidSurfaces', 'contactPairs', 'constraints', 'loadSteps',
  'requestedOutputs', 'sourceAuthority', 'limitations',
];

export function createCanonicalNonlinearShellContactModel(input) {
  assertPlainData(input, 'modelInput');
  assertExactKeys(input, KEYS, 'modelInput', ['canonicalModelSemanticHash']);
  if (Object.hasOwn(input, 'canonicalModelSemanticHash')) {
    throw new TypeError('canonicalModelSemanticHash is computed internally and cannot be supplied.');
  }
  if (input.schema !== SCHEMAS.MODEL) throw new TypeError('Unknown nonlinear shell-contact model schema.');
  if (input.engineeringLevel !== ENGINEERING_LEVEL) throw new TypeError('Unknown engineering level.');
  assertId(input.modelId, 'modelInput.modelId');
  exactUnits(input.unitSystem);

  const nodes = rows(input.nodes, 'nodeId', node, 'modelInput.nodes');
  const nodeById = new Map(nodes.map((v) => [v.nodeId, v]));
  const materials = rows(input.materials, 'materialId', material, 'modelInput.materials');
  const materialIds = new Set(materials.map((v) => v.materialId));
  const shellSections = rows(
    input.shellSections, 'sectionId',
    (v, i) => section(v, i, materialIds), 'modelInput.shellSections',
  );
  const sectionIds = new Set(shellSections.map((v) => v.sectionId));
  const shellElements = rows(
    input.shellElements, 'elementId',
    (v, i) => element(v, i, nodeById, sectionIds, materialIds),
    'modelInput.shellElements',
  );
  duplicateConnectivity(shellElements);
  unusedNodes(nodes, shellElements, input.constraints);

  const elementIds = new Set(shellElements.map((v) => v.elementId));
  const surfaceDefinitions = rows(
    input.surfaceDefinitions, 'surfaceId',
    (v, i) => surface(v, i, elementIds), 'modelInput.surfaceDefinitions', 0,
  );
  const surfaceIds = new Set(surfaceDefinitions.map((v) => v.surfaceId));
  const rigidSurfaces = rows(
    input.rigidSurfaces, 'rigidSurfaceId', rigidSurface,
    'modelInput.rigidSurfaces', 0,
  );
  const rigidIds = new Set(rigidSurfaces.map((v) => v.rigidSurfaceId));
  const contactPairs = rows(
    input.contactPairs, 'contactPairId',
    (v, i) => contact(v, i, surfaceIds, rigidIds),
    'modelInput.contactPairs', 0,
  );
  const constraints = rows(
    input.constraints, 'constraintId',
    (v, i) => constraint(v, i, nodeById), 'modelInput.constraints', 0,
  );
  const loadSteps = steps(input.loadSteps, nodeById, surfaceIds, rigidIds);
  const requestedOutputs = outputs(input.requestedOutputs);
  const sourceAuthority = source(input.sourceAuthority, 'modelInput.sourceAuthority');
  const limitations = [...new Set(input.limitations)].sort(codeUnitCompare);
  assertArray(input.limitations, 'modelInput.limitations', { min: REQUIRED_LIMITATIONS.length });
  input.limitations.forEach((v, i) => assertString(v, `modelInput.limitations[${i}]`));
  REQUIRED_LIMITATIONS.forEach((v) => {
    if (!limitations.includes(v)) throw new TypeError(`Missing mandatory limitation ${v}.`);
  });

  return sealWithHash({
    schema: SCHEMAS.MODEL, modelId: input.modelId, engineeringLevel: ENGINEERING_LEVEL,
    unitSystem: clonePlain(CANONICAL_UNITS), nodes, shellElements, materials,
    shellSections, surfaceDefinitions, rigidSurfaces, contactPairs, constraints,
    loadSteps, requestedOutputs, sourceAuthority, limitations,
  }, 'canonicalModelSemanticHash');
}

export function validateCanonicalNonlinearShellContactModel(model) {
  assertExactKeys(model, [...KEYS, 'canonicalModelSemanticHash'], 'canonicalModel');
  const copy = clonePlain(model);
  delete copy.canonicalModelSemanticHash;
  const rebuilt = createCanonicalNonlinearShellContactModel(copy);
  if (rebuilt.canonicalModelSemanticHash !== model.canonicalModelSemanticHash) {
    throw new TypeError('Canonical model semantic hash mismatch.');
  }
  verifySealedHash(model, 'canonicalModelSemanticHash', 'canonicalModel');
  return true;
}

function exactUnits(v) {
  assertExactKeys(v, Object.keys(CANONICAL_UNITS), 'modelInput.unitSystem');
  Object.entries(CANONICAL_UNITS).forEach(([k, unit]) => {
    if (v[k] !== unit) throw new TypeError(`Unknown or implicit unit conversion for ${k}.`);
  });
}
function rows(values, id, normalizer, path, min = 1) {
  assertArray(values, path, { min });
  const result = values.map(normalizer);
  assertUniqueIds(result, id, path);
  return result.sort((a, b) => codeUnitCompare(a[id], b[id]));
}
function node(v, i) {
  const p = `modelInput.nodes[${i}]`;
  assertExactKeys(v, ['nodeId', 'x', 'y', 'z', 'sourceRef'], p);
  assertId(v.nodeId, `${p}.nodeId`);
  ['x', 'y', 'z'].forEach((k) => assertFiniteNumber(v[k], `${p}.${k}`));
  return {
    nodeId: v.nodeId, x: nz(v.x), y: nz(v.y), z: nz(v.z),
    sourceRef: sourceRef(v.sourceRef, `${p}.sourceRef`),
  };
}
function material(v, i) {
  const p = `modelInput.materials[${i}]`;
  assertExactKeys(v, [
    'materialId', 'materialProfile', 'youngsModulus', 'poissonRatio',
    'density', 'sourceAuthority',
  ], p);
  assertId(v.materialId, `${p}.materialId`);
  if (v.materialProfile !== MATERIAL_PROFILE) throw new TypeError('Plasticity or unsupported material profile.');
  assertFiniteNumber(v.youngsModulus, `${p}.youngsModulus`, (x) => x > 0, 'positive');
  assertFiniteNumber(v.poissonRatio, `${p}.poissonRatio`, (x) => x > -1 && x < 0.5, 'Poisson-ratio');
  assertFiniteNumber(v.density, `${p}.density`, (x) => x >= 0, 'nonnegative');
  return { ...clonePlain(v), sourceAuthority: source(v.sourceAuthority, `${p}.sourceAuthority`) };
}
function section(v, i, materialIds) {
  const p = `modelInput.shellSections[${i}]`;
  assertExactKeys(v, [
    'sectionId', 'materialId', 'thickness', 'referenceSurface', 'offset',
    'throughThicknessIntegrationProfile', 'sourceAuthority',
  ], p);
  assertId(v.sectionId, `${p}.sectionId`);
  if (!materialIds.has(v.materialId)) throw new TypeError(`${p}.materialId is unresolved.`);
  assertFiniteNumber(v.thickness, `${p}.thickness`, (x) => x > 0, 'positive');
  if (v.referenceSurface !== 'MIDSURFACE') throw new TypeError('NC-00 supports midsurface sections only.');
  if (v.offset !== 0) throw new TypeError('Nonzero shell offset is outside NC-00.');
  if (v.throughThicknessIntegrationProfile !== 'EXTERNAL_KERNEL_DEFAULT_UNQUALIFIED_V1') {
    throw new TypeError('Unsupported through-thickness integration profile.');
  }
  return { ...clonePlain(v), sourceAuthority: source(v.sourceAuthority, `${p}.sourceAuthority`) };
}
function element(v, i, nodeById, sectionIds, materialIds) {
  const p = `modelInput.shellElements[${i}]`;
  assertExactKeys(v, [
    'elementId', 'elementProfile', 'nodeIds', 'sectionId', 'materialId',
    'orientationAuthority', 'referenceSurface', 'surfaceNormalAuthority', 'sourceRef',
  ], p);
  assertId(v.elementId, `${p}.elementId`);
  if (v.elementProfile !== SHELL_ELEMENT_PROFILE) throw new TypeError('Unsupported shell profile.');
  assertArray(v.nodeIds, `${p}.nodeIds`, { min: 4 });
  if (v.nodeIds.length !== 4 || new Set(v.nodeIds).size !== 4) {
    throw new TypeError(`${p}.nodeIds must contain four distinct node IDs.`);
  }
  v.nodeIds.forEach((id) => {
    if (!nodeById.has(id)) throw new TypeError(`${p} references missing node ${id}.`);
  });
  if (!sectionIds.has(v.sectionId)) throw new TypeError(`${p}.sectionId is unresolved.`);
  if (!materialIds.has(v.materialId)) throw new TypeError(`${p}.materialId is unresolved.`);
  if (v.referenceSurface !== 'MIDSURFACE') throw new TypeError('Element reference surface must be MIDSURFACE.');
  if (v.orientationAuthority !== 'CONNECTIVITY_RIGHT_HAND_RULE'
      || v.surfaceNormalAuthority !== 'CONNECTIVITY_RIGHT_HAND_RULE') {
    throw new TypeError('Unknown normal orientation authority.');
  }
  const q = v.nodeIds.map((id) => nodeById.get(id));
  if (!(tri(q[0], q[1], q[2]) + tri(q[0], q[2], q[3]) > 1e-14)) {
    throw new TypeError(`${p} has zero or unresolved area.`);
  }
  return { ...clonePlain(v), sourceRef: sourceRef(v.sourceRef, `${p}.sourceRef`) };
}
function surface(v, i, elementIds) {
  const p = `modelInput.surfaceDefinitions[${i}]`;
  assertExactKeys(v, [
    'schema', 'surfaceId', 'elementFaces', 'sideAuthority', 'normalAuthority',
    'thicknessInContactPolicy',
  ], p);
  if (v.schema !== SCHEMAS.SURFACE) throw new TypeError('Unknown shell surface schema.');
  assertId(v.surfaceId, `${p}.surfaceId`);
  assertArray(v.elementFaces, `${p}.elementFaces`, { min: 1 });
  const elementFaces = v.elementFaces.map((f, j) => {
    const fp = `${p}.elementFaces[${j}]`;
    assertExactKeys(f, ['elementId', 'face'], fp);
    if (!elementIds.has(f.elementId)) throw new TypeError(`${fp}.elementId is unresolved.`);
    assertEnum(f.face, ['SPOS', 'SNEG'], `${fp}.face`);
    return clonePlain(f);
  }).sort((a, b) => codeUnitCompare(`${a.elementId}:${a.face}`, `${b.elementId}:${b.face}`));
  if (new Set(elementFaces.map((f) => `${f.elementId}:${f.face}`)).size !== elementFaces.length) {
    throw new TypeError(`${p} contains duplicate faces.`);
  }
  if (v.sideAuthority !== 'EXPLICIT_ELEMENT_FACE'
      || v.normalAuthority !== 'ELEMENT_CONNECTIVITY'
      || v.thicknessInContactPolicy !== 'INCLUDE_PHYSICAL_HALF_THICKNESS') {
    throw new TypeError('Ambiguous surface normal or thickness authority.');
  }
  return { ...clonePlain(v), elementFaces };
}
function rigidSurface(v, i) {
  const p = `modelInput.rigidSurfaces[${i}]`;
  assertExactKeys(v, [
    'rigidSurfaceId', 'surfaceType', 'referencePoint', 'orientation',
    'dimensions', 'motionAuthority', 'sourceAuthority',
  ], p);
  assertId(v.rigidSurfaceId, `${p}.rigidSurfaceId`);
  assertEnum(v.surfaceType, RIGID_SURFACE_TYPES, `${p}.surfaceType`);
  const referencePoint = vec(v.referencePoint, `${p}.referencePoint`);
  assertExactKeys(v.orientation, ['normal', 'axis'], `${p}.orientation`);
  const orientation = {
    normal: assertUnitVector(v.orientation.normal, `${p}.orientation.normal`),
    axis: assertUnitVector(v.orientation.axis, `${p}.orientation.axis`),
  };
  assertExactKeys(v.dimensions, ['radius', 'length', 'width', 'angle'], `${p}.dimensions`);
  Object.entries(v.dimensions).forEach(([k, x]) => {
    if (x !== null) assertFiniteNumber(x, `${p}.dimensions.${k}`, (n) => n > 0, 'positive');
  });
  if (v.surfaceType !== 'RIGID_PLANE' && !(v.dimensions.radius > 0)) {
    throw new TypeError(`${p}.dimensions.radius must be positive.`);
  }
  assertEnum(v.motionAuthority, ['FIXED', 'PRESCRIBED'], `${p}.motionAuthority`);
  return {
    ...clonePlain(v), referencePoint, orientation,
    sourceAuthority: source(v.sourceAuthority, `${p}.sourceAuthority`),
  };
}
function contact(v, i, surfaceIds, rigidIds) {
  const p = `modelInput.contactPairs[${i}]`;
  assertExactKeys(v, [
    'schema', 'contactPairId', 'deformableSurfaceId', 'rigidSurfaceId',
    'normalBehaviourProfile', 'slidingProfile', 'thicknessPolicy',
    'enforcementProfile', 'initialClearancePolicy', 'selfContact',
    'frictionProfile', 'sourceAuthority',
  ], p);
  if (v.schema !== SCHEMAS.CONTACT_PAIR) throw new TypeError('Unknown contact-pair schema.');
  assertId(v.contactPairId, `${p}.contactPairId`);
  if (!surfaceIds.has(v.deformableSurfaceId)) throw new TypeError('Missing deformable surface.');
  if (!rigidIds.has(v.rigidSurfaceId)) throw new TypeError('Missing rigid surface.');
  if (v.normalBehaviourProfile !== 'HARD_FRICTIONLESS') throw new TypeError('Unsupported contact profile.');
  if (v.slidingProfile !== 'FINITE_SLIDING'
      || v.thicknessPolicy !== 'INCLUDE_SHELL_THICKNESS'
      || v.enforcementProfile !== 'EXTERNAL_KERNEL_PENALTY_UNQUALIFIED_V1') {
    throw new TypeError('Unsupported contact profile.');
  }
  if (v.initialClearancePolicy !== 'AS_MODELED_NO_ADJUSTMENT') {
    throw new TypeError('Automatic initial contact adjustment is prohibited.');
  }
  assertBoolean(v.selfContact, `${p}.selfContact`);
  if (v.selfContact) throw new TypeError('Self-contact is outside NC-00.');
  if (v.frictionProfile !== 'NONE') throw new TypeError('Friction is outside NC-00.');
  return { ...clonePlain(v), sourceAuthority: source(v.sourceAuthority, `${p}.sourceAuthority`) };
}
function constraint(v, i, nodeById) {
  const p = `modelInput.constraints[${i}]`;
  assertExactKeys(v, ['constraintId', 'nodeId', 'dofs', 'values', 'sourceAuthority'], p);
  assertId(v.constraintId, `${p}.constraintId`);
  if (!nodeById.has(v.nodeId)) throw new TypeError(`${p}.nodeId is unresolved.`);
  assertArray(v.dofs, `${p}.dofs`, { min: 1 });
  if (new Set(v.dofs).size !== v.dofs.length) throw new TypeError(`${p}.dofs contains duplicates.`);
  v.dofs.forEach((d) => assertEnum(d, ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'], `${p}.dofs`));
  assertArray(v.values, `${p}.values`, { min: v.dofs.length });
  if (v.values.length !== v.dofs.length) throw new TypeError(`${p}.values length mismatch.`);
  v.values.forEach((x, j) => assertFiniteNumber(x, `${p}.values[${j}]`));
  return {
    ...clonePlain(v), values: v.values.map(nz),
    sourceAuthority: source(v.sourceAuthority, `${p}.sourceAuthority`),
  };
}
function steps(values, nodeById, surfaceIds, rigidIds) {
  assertArray(values, 'modelInput.loadSteps', { min: 1 });
  assertUniqueIds(values, 'stepId', 'modelInput.loadSteps');
  return values.map((v, i) => {
    const p = `modelInput.loadSteps[${i}]`;
    assertExactKeys(v, [
      'schema', 'stepId', 'stepType', 'targetTime', 'initialIncrement',
      'minimumIncrement', 'maximumIncrement', 'maximumIterations', 'loads',
      'prescribedMotions', 'outputRequests', 'convergenceProfileId',
    ], p);
    if (v.schema !== SCHEMAS.LOAD_STEP) throw new TypeError('Unknown load-step schema.');
    assertId(v.stepId, `${p}.stepId`);
    assertEnum(v.stepType, STEP_TYPES, `${p}.stepType`);
    ['targetTime', 'initialIncrement', 'minimumIncrement', 'maximumIncrement']
      .forEach((k) => assertFiniteNumber(v[k], `${p}.${k}`, (x) => x > 0, 'positive'));
    if (!(v.minimumIncrement <= v.initialIncrement
      && v.initialIncrement <= v.maximumIncrement
      && v.maximumIncrement <= v.targetTime)) {
      throw new TypeError(`${p} increment limits are inconsistent.`);
    }
    assertFiniteNumber(v.maximumIterations, `${p}.maximumIterations`,
      (x) => Number.isInteger(x) && x > 0, 'positive integer');
    assertArray(v.loads, `${p}.loads`);
    assertArray(v.prescribedMotions, `${p}.prescribedMotions`);
    const loads = v.loads.map((x, j) => load(x, `${p}.loads[${j}]`, nodeById, surfaceIds))
      .sort((a, b) => codeUnitCompare(a.loadId, b.loadId));
    const prescribedMotions = v.prescribedMotions.map(
      (x, j) => motion(x, `${p}.prescribedMotions[${j}]`, nodeById, rigidIds),
    ).sort((a, b) => codeUnitCompare(a.motionId, b.motionId));
    assertId(v.convergenceProfileId, `${p}.convergenceProfileId`);
    return { ...clonePlain(v), loads, prescribedMotions, outputRequests: outputs(v.outputRequests, `${p}.outputRequests`) };
  });
}
function load(v, p, nodeById, surfaceIds) {
  assertExactKeys(v, ['loadId', 'loadType', 'targetId', 'magnitude', 'components', 'sourceAuthority'], p);
  assertId(v.loadId, `${p}.loadId`);
  assertEnum(v.loadType, ['NODAL_FORCE', 'PRESSURE'], `${p}.loadType`);
  const ids = v.loadType === 'NODAL_FORCE' ? nodeById : surfaceIds;
  if (!ids.has(v.targetId)) throw new TypeError(`${p}.targetId is unresolved.`);
  assertFiniteNumber(v.magnitude, `${p}.magnitude`);
  return { ...clonePlain(v), components: vec(v.components, `${p}.components`), sourceAuthority: source(v.sourceAuthority, `${p}.sourceAuthority`) };
}
function motion(v, p, nodeById, rigidIds) {
  assertExactKeys(v, ['motionId', 'targetType', 'targetId', 'dof', 'value', 'sourceAuthority'], p);
  assertId(v.motionId, `${p}.motionId`);
  assertEnum(v.targetType, ['NODE', 'RIGID_SURFACE'], `${p}.targetType`);
  const ids = v.targetType === 'NODE' ? nodeById : rigidIds;
  if (!ids.has(v.targetId)) throw new TypeError(`${p}.targetId is unresolved.`);
  assertEnum(v.dof, ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'], `${p}.dof`);
  assertFiniteNumber(v.value, `${p}.value`);
  return { ...clonePlain(v), value: nz(v.value), sourceAuthority: source(v.sourceAuthority, `${p}.sourceAuthority`) };
}
function outputs(values, p = 'modelInput.requestedOutputs') {
  assertArray(values, p);
  values.forEach((v, i) => assertEnum(v, OUTPUT_TYPES, `${p}[${i}]`));
  return [...new Set(values)].sort(codeUnitCompare);
}
function source(v, p) {
  assertExactKeys(v, ['sourceId', 'sourceHash'], p);
  assertId(v.sourceId, `${p}.sourceId`);
  assertHash(v.sourceHash, `${p}.sourceHash`);
  return clonePlain(v);
}
function sourceRef(v, p) {
  assertExactKeys(v, ['sourceId', 'entityId'], p);
  assertId(v.sourceId, `${p}.sourceId`);
  assertId(v.entityId, `${p}.entityId`);
  return clonePlain(v);
}
function vec(v, p) {
  assertArray(v, p, { min: 3 });
  if (v.length !== 3) throw new TypeError(`${p} must contain exactly three components.`);
  return v.map((x, i) => { assertFiniteNumber(x, `${p}[${i}]`); return nz(x); });
}
function duplicateConnectivity(values) {
  const seen = new Set();
  values.forEach((v) => {
    const key = [...v.nodeIds].sort(codeUnitCompare).join('|');
    if (seen.has(key)) throw new TypeError('Duplicate shell element connectivity.');
    seen.add(key);
  });
}
function unusedNodes(nodes, elements, constraints) {
  const used = new Set(elements.flatMap((v) => v.nodeIds));
  constraints.forEach((v) => used.add(v.nodeId));
  const ids = nodes.filter((v) => !used.has(v.nodeId)).map((v) => v.nodeId);
  if (ids.length) throw new TypeError(`Unused nodes are prohibited: ${ids.join(', ')}.`);
}
function tri(a, b, c) {
  const ab = [b.x - a.x, b.y - a.y, b.z - a.z];
  const ac = [c.x - a.x, c.y - a.y, c.z - a.z];
  return 0.5 * Math.hypot(
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  );
}
function nz(v) { return Object.is(v, -0) ? 0 : v; }
