import {
  BASE_LIMITATIONS,
  CANONICAL_UNITS,
  FORMULATION,
  MODEL_SCHEMA,
  RESULT_REQUEST,
} from '../src/core/local-shell/index.js';

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function qualificationProfile() {
  const tight = { absolute: 1e-10, relative: 1e-10 };
  const equilibrium = { absolute: 1e-7, relative: 1e-9 };
  return {
    minimumFacetArea: { absolute: 1e-12, relative: 1e-12 },
    nodeBasisUnit: { ...tight },
    nodeBasisOrthogonality: { ...tight },
    nodeBasisHandedness: { ...tight },
    elementNormalDirectorAlignment: { minimum: 0.8 },
    rotationMappingRank: { absolute: 1e-12, relative: 1e-12 },
    membraneConstitutiveSymmetry: { absolute: 1e-10, relative: 1e-12 },
    bendingConstitutiveSymmetry: { absolute: 1e-10, relative: 1e-12 },
    elementStiffnessSymmetry: { absolute: 1e-7, relative: 1e-11 },
    globalStiffnessSymmetry: { absolute: 1e-7, relative: 1e-11 },
    rigidTranslation: { absolute: 1e-7, relative: 1e-10 },
    rigidRotation: { absolute: 1e-9, relative: 1e-9 },
    choleskyPivot: { absolute: 1e-12, relative: 1e-13 },
    freeDofResidual: { ...equilibrium },
    forceEquilibrium: { ...equilibrium },
    momentEquilibrium: { absolute: 1e-6, relative: 1e-9 },
    strainEnergyReconstruction: { absolute: 1e-7, relative: 1e-9 },
    membranePatchResponse: { absolute: 1e-10, relative: 1e-10 },
    bendingPatchResponse: { absolute: 1e-9, relative: 1e-9 },
  };
}

export function baseSource(overrides = {}) {
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: 'SHELL-FIXTURE',
    modelVersion: '1',
    sourceAncestry: ['fixture/local-shell/v1'],
    units: { ...CANONICAL_UNITS },
    formulation: FORMULATION,
    materials: [{ materialId: 'MAT', elasticModulus: 200000, poissonRatio: 0.3, sourceReference: 'MAT-SRC' }],
    nodes: [],
    elements: [],
    constraints: [],
    loadCases: [{ loadCaseId: 'LC', nodalLoads: [], pressureLoads: [], sourceReference: 'LC-SRC' }],
    resultRequests: {
      stressSurfaces: [...RESULT_REQUEST.stressSurfaces],
      dktIntegrationRule: RESULT_REQUEST.dktIntegrationRule,
      retainElementMatrices: true,
    },
    qualificationProfile: qualificationProfile(),
    limitations: [...BASE_LIMITATIONS],
    ...overrides,
  };
}

export function flatNode(nodeId, x, y) {
  return {
    nodeId,
    position: [x, y, 0],
    director: [0, 0, 1],
    rotationBasis1: [1, 0, 0],
    rotationBasis2: [0, 1, 0],
    sourceReference: `${nodeId}-SRC`,
  };
}

export function triangleSource(mutator = () => {}) {
  const source = baseSource({
    nodes: [flatNode('A', 0, 0), flatNode('B', 100, 0), flatNode('C', 0, 50)],
    elements: [{ elementId: 'E1', nodeIds: ['A', 'B', 'C'], materialId: 'MAT', thickness: 2, sourceReference: 'E1-SRC' }],
    constraints: stableTriangleConstraints(),
    loadCases: [{
      loadCaseId: 'LC',
      nodalLoads: [{ loadId: 'F1', nodeId: 'C', fx: 1000, fy: 200, fz: -50, m1: 5, m2: -7, sourceReference: 'F1-SRC' }],
      pressureLoads: [],
      sourceReference: 'LC-SRC',
    }],
  });
  mutator(source);
  return source;
}

export function patchSource(mutator = () => {}) {
  const source = baseSource({
    nodes: [flatNode('A', 0, 0), flatNode('B', 100, 0), flatNode('C', 100, 50), flatNode('D', 0, 50)],
    elements: [
      { elementId: 'E1', nodeIds: ['A', 'B', 'C'], materialId: 'MAT', thickness: 2, sourceReference: 'E1-SRC' },
      { elementId: 'E2', nodeIds: ['A', 'C', 'D'], materialId: 'MAT', thickness: 2, sourceReference: 'E2-SRC' },
    ],
    constraints: stablePatchConstraints(),
    loadCases: [{
      loadCaseId: 'LC',
      nodalLoads: [
        { loadId: 'F-B', nodeId: 'B', fx: 500, fy: 0, fz: 0, m1: 0, m2: 0, sourceReference: 'F-B-SRC' },
        { loadId: 'F-C', nodeId: 'C', fx: 500, fy: 0, fz: 0, m1: 0, m2: 0, sourceReference: 'F-C-SRC' },
      ],
      pressureLoads: [],
      sourceReference: 'LC-SRC',
    }],
  });
  mutator(source);
  return source;
}

export function prescribedPatchSource(options = {}) {
  const source = patchSource();
  source.constraints = prescribedConstraints(source.nodes, options);
  source.loadCases = [{ loadCaseId: 'LC', nodalLoads: [], pressureLoads: [], sourceReference: 'LC-SRC' }];
  return source;
}

export function pressurePatchSource(sense = 'ALONG_ELEMENT_NORMAL') {
  const source = patchSource();
  source.constraints = fullyFixed(source.nodes);
  source.loadCases = [{
    loadCaseId: 'PRESSURE',
    nodalLoads: [],
    pressureLoads: source.elements.map((element, index) => ({
      pressureLoadId: `P-${index + 1}`,
      elementId: element.elementId,
      pressure: 2.5,
      sense,
      sourceReference: `P-${index + 1}-SRC`,
    })),
    sourceReference: 'PRESSURE-SRC',
  }];
  return source;
}

export function cylindricalSource(segments = 4, options = {}) {
  const radius = options.radius ?? 100;
  const length = options.length ?? 50;
  const span = options.span ?? Math.PI / 3;
  const nodes = [];
  for (let axial = 0; axial < 2; axial += 1) {
    for (let index = 0; index <= segments; index += 1) {
      const angle = -span / 2 + span * index / segments;
      nodes.push(cylinderNode(`N${axial}-${index}`, axial * length, radius, angle));
    }
  }
  const elements = [];
  for (let index = 0; index < segments; index += 1) {
    const a = `N0-${index}`, b = `N1-${index}`, c = `N1-${index + 1}`, d = `N0-${index + 1}`;
    elements.push({ elementId: `E${index}-A`, nodeIds: [a, b, c], materialId: 'MAT', thickness: 1.5, sourceReference: `E${index}-A-SRC` });
    elements.push({ elementId: `E${index}-B`, nodeIds: [a, c, d], materialId: 'MAT', thickness: 1.5, sourceReference: `E${index}-B-SRC` });
  }
  return baseSource({ nodes, elements, constraints: fullyFixed(nodes), ...options.override });
}

export function rigidCylindricalSource(segments = 4) {
  const source = cylindricalSource(segments);
  const omega = [0.002, -0.001, 0.0015];
  const translation = [1, -2, 0.5];
  source.constraints = prescribedGlobalRigidMotion(source.nodes, translation, omega);
  return source;
}

function cylinderNode(nodeId, x, radius, angle) {
  const director = [0, Math.sin(angle), Math.cos(angle)];
  const basis1 = [1, 0, 0];
  const basis2 = [0, Math.cos(angle), -Math.sin(angle)];
  return {
    nodeId,
    position: [x, radius * Math.sin(angle), radius * Math.cos(angle)],
    director,
    rotationBasis1: basis1,
    rotationBasis2: basis2,
    sourceReference: `${nodeId}-SRC`,
  };
}

function stableTriangleConstraints() {
  return [
    constraint('A', 'UX', 0), constraint('A', 'UY', 0), constraint('A', 'UZ', 0),
    constraint('A', 'R1', 0), constraint('A', 'R2', 0), constraint('B', 'UY', 0),
  ];
}

function stablePatchConstraints() {
  return [
    ...['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof) => constraint('A', dof, 0)),
    constraint('D', 'UX', 0), constraint('D', 'UZ', 0), constraint('D', 'R1', 0), constraint('D', 'R2', 0),
    constraint('B', 'UY', 0),
  ];
}

function prescribedConstraints(nodes, options) {
  const mode = options.mode ?? 'MEMBRANE';
  const epsilonX = options.epsilonX ?? 0.001;
  const epsilonY = options.epsilonY ?? 0;
  const gammaXY = options.gammaXY ?? 0;
  const curvature = options.curvature ?? [0, 0, 0];
  return nodes.flatMap((node) => {
    const [x, y] = node.position;
    let values;
    if (mode === 'RIGID_TRANSLATION') values = [0, 0, options.w ?? 3, 0, 0];
    else if (mode === 'RIGID_ROTATION') values = rigidFlatValues(node.position, options.omega ?? [0.002, -0.001, 0.003]);
    else values = fieldValues(x, y, epsilonX, epsilonY, gammaXY, curvature);
    return ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof, index) => constraint(node.nodeId, dof, values[index]));
  });
}

function fieldValues(x, y, epsilonX, epsilonY, gammaXY, curvature) {
  const [kx, ky, kxy] = curvature;
  return [
    epsilonX * x + 0.5 * gammaXY * y,
    epsilonY * y + 0.5 * gammaXY * x,
    -0.5 * kx * x ** 2 - 0.5 * ky * y ** 2 - 0.5 * kxy * x * y,
    -ky * y - 0.5 * kxy * x,
    kx * x + 0.5 * kxy * y,
  ];
}

function rigidFlatValues(position, omega) {
  const [x, y, z] = position;
  const [ox, oy, oz] = omega;
  return [oy * z - oz * y, oz * x - ox * z, ox * y - oy * x, ox, oy];
}

function prescribedGlobalRigidMotion(nodes, translation, omega) {
  return nodes.flatMap((node) => {
    const rotation = cross3(omega, node.position);
    const displacement = rotation.map((value, index) => value + translation[index]);
    const values = [
      ...displacement,
      dot3(omega, node.rotationBasis1),
      dot3(omega, node.rotationBasis2),
    ];
    return ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof, index) => constraint(node.nodeId, dof, values[index]));
  });
}

function fullyFixed(nodes) {
  return nodes.flatMap((node) => ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof) => constraint(node.nodeId, dof, 0)));
}

function constraint(nodeId, dof, value) {
  return { constraintId: `C-${nodeId}-${dof}`, nodeId, dof, value, sourceReference: `C-${nodeId}-${dof}-SRC` };
}

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot3(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}
