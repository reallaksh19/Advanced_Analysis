import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';

export const AXISYMMETRIC_INDEPENDENT_ORACLE_ID = 'BB10_AXI_Q8_INDEPENDENT_ORACLE_V1';
export const AXISYMMETRIC_INDEPENDENT_ORACLE_DESCRIPTOR = (() => {
  const payload = {
    oracleId: AXISYMMETRIC_INDEPENDENT_ORACLE_ID,
    shapeImplementation: 'INDEPENDENT_SERENDIPITY_Q8_POLYNOMIALS',
    bMatrixImplementation: 'INDEPENDENT_AXISYMMETRIC_4X16',
    constitutiveImplementation: 'INDEPENDENT_LAME_PARAMETER_4X4',
    stiffnessImplementation: 'INDEPENDENT_FULL_3X3_GAUSS_WITH_2PI_R',
    edgeImplementation: 'INDEPENDENT_QUADRATIC_EDGE_3_POINT_AND_GL8',
    lameImplementation: 'CLOSED_FORM_LONG_CYLINDER_PLANE_STRAIN',
    productionRoutineImports: false,
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
})();

const ROOT35 = Math.sqrt(3 / 5);
const G3 = Object.freeze([
  [-ROOT35, 5 / 9], [0, 8 / 9], [ROOT35, 5 / 9],
]);
const G8 = Object.freeze([
  [-0.9602898564975363, 0.1012285362903763],
  [-0.7966664774136267, 0.2223810344533745],
  [-0.5255324099163290, 0.3137066458778873],
  [-0.1834346424956498, 0.3626837833783620],
  [0.1834346424956498, 0.3626837833783620],
  [0.5255324099163290, 0.3137066458778873],
  [0.7966664774136267, 0.2223810344533745],
  [0.9602898564975363, 0.1012285362903763],
]);

export function oracleAxisymmetricQ8Element({ nodes, material, radiusTolerance = 1e-9 } = {}) {
  const checkedNodes = requireNodes(nodes);
  const D = oracleConstitutive(material);
  const stiffness = matrix(16, 16);
  const gaussPoints = [];
  let ordinal = 0;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      ordinal += 1;
      const xi = G3[i][0]; const eta = G3[j][0];
      const mapped = oracleB(checkedNodes, xi, eta, radiusTolerance);
      const weight = G3[i][1] * G3[j][1];
      const factor = weight * 2 * Math.PI * mapped.radius * mapped.determinant;
      for (let a = 0; a < 16; a += 1) {
        for (let b = 0; b < 16; b += 1) {
          let value = 0;
          for (let p = 0; p < 4; p += 1) {
            for (let q = 0; q < 4; q += 1) {
              value += mapped.B[p][a] * D[p][q] * mapped.B[q][b];
            }
          }
          stiffness[a][b] += value * factor;
        }
      }
      gaussPoints.push(deepFreeze({
        pointId: `GP${ordinal}`,
        xi, eta, weight,
        radius: mapped.radius,
        mappedCoordinates: { r: mapped.r, z: mapped.z },
        determinant: mapped.determinant,
        circumferenceFactor: 2 * Math.PI * mapped.radius,
        B: mapped.B,
      }));
    }
  }
  return deepFreeze({ oracleId: AXISYMMETRIC_INDEPENDENT_ORACLE_ID, D, stiffness, gaussPoints });
}

export function oracleEvaluateState({ nodes, material, displacementVector, radiusTolerance = 1e-9 } = {}) {
  if (!Array.isArray(displacementVector) || displacementVector.length !== 16
    || displacementVector.some((value) => !Number.isFinite(value))) {
    throw new TypeError('ORACLE_AXI_Q8_INVALID_DOF_VECTOR');
  }
  const D = oracleConstitutive(material);
  const rows = [];
  let ordinal = 0;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      ordinal += 1;
      const mapped = oracleB(requireNodes(nodes), G3[i][0], G3[j][0], radiusTolerance);
      const strain = multiply(mapped.B, displacementVector);
      const stress = multiply(D, strain);
      rows.push(deepFreeze({
        pointId: `GP${ordinal}`,
        radius: mapped.radius,
        mappedCoordinates: { r: mapped.r, z: mapped.z },
        determinant: mapped.determinant,
        quadratureWeight: G3[i][1] * G3[j][1],
        circumferenceFactor: 2 * Math.PI * mapped.radius,
        B: mapped.B,
        strainVector: strain,
        stressVector: stress,
      }));
    }
  }
  return deepFreeze(rows);
}

export function oracleAxisymmetricEdgeLoad({ nodes, tractionAt, pressureAt, outwardNormalAt, order = 3 } = {}) {
  const edge = requireEdgeNodes(nodes);
  const quadrature = order === 3 ? G3 : order === 8 ? G8 : null;
  if (!quadrature) throw new TypeError('ORACLE_AXI_EDGE_UNSUPPORTED_ORDER');
  const hasTraction = typeof tractionAt === 'function';
  const hasPressure = typeof pressureAt === 'function' || Number.isFinite(pressureAt);
  if (hasTraction === hasPressure) throw new TypeError('ORACLE_AXI_EDGE_LOAD_MODE_INVALID');
  const nodal = edge.map((node) => ({ nodeId: node.nodeId, radial: 0, axial: 0 }));
  let radial = 0; let axial = 0;
  const stations = [];
  quadrature.forEach(([s, weight], stationIndex) => {
    const shape = edgeShape(s);
    const mapped = edgeMap(edge, shape);
    if (!(mapped.r > 1e-9) || !(mapped.jacobian > 0)) throw new RangeError('ORACLE_AXI_EDGE_GEOMETRY_INVALID');
    let traction;
    if (hasTraction) {
      traction = vector(tractionAt(s, mapped.r, mapped.z));
    } else {
      const normal = unit(vector(outwardNormalAt(s, mapped.r, mapped.z)));
      const pressure = typeof pressureAt === 'function'
        ? Number(pressureAt(s, mapped.r, mapped.z)) : Number(pressureAt);
      if (!Number.isFinite(pressure) || pressure < 0) throw new RangeError('ORACLE_AXI_EDGE_PRESSURE_INVALID');
      traction = [-pressure * normal[0], -pressure * normal[1]];
    }
    const integrationFactor = weight * 2 * Math.PI * mapped.r * mapped.jacobian;
    shape.N.forEach((N, index) => {
      nodal[index].radial += N * traction[0] * integrationFactor;
      nodal[index].axial += N * traction[1] * integrationFactor;
    });
    radial += traction[0] * integrationFactor;
    axial += traction[1] * integrationFactor;
    stations.push({ stationId: `O${stationIndex + 1}`, s, weight, radius: mapped.r, jacobian: mapped.jacobian, traction, integrationFactor });
  });
  return deepFreeze({
    oracleId: AXISYMMETRIC_INDEPENDENT_ORACLE_ID,
    quadratureOrder: order,
    consistentNodalForces: nodal,
    generalizedResultant: { radial, axial },
    stations,
  });
}

export function lamePlaneStrainReference({
  innerRadius,
  outerRadius,
  internalPressure,
  externalPressure,
  youngsModulus,
  poissonRatio,
  radius,
} = {}) {
  const a = positive(innerRadius, 'innerRadius');
  const b = positive(outerRadius, 'outerRadius');
  if (!(b > a)) throw new RangeError('ORACLE_LAME_RADIUS_ORDER_INVALID');
  const pi = nonnegative(internalPressure, 'internalPressure');
  const po = nonnegative(externalPressure, 'externalPressure');
  const E = positive(youngsModulus, 'youngsModulus');
  const nu = Number(poissonRatio);
  if (!Number.isFinite(nu) || nu <= -1 || nu >= 0.5) throw new RangeError('ORACLE_LAME_POISSON_INVALID');
  const r = positive(radius, 'radius');
  if (r < a || r > b) throw new RangeError('ORACLE_LAME_PROBE_OUTSIDE_DOMAIN');
  const A = (pi * a * a - po * b * b) / (b * b - a * a);
  const B = a * a * b * b * (pi - po) / (b * b - a * a);
  const sigmaR = A - B / (r * r);
  const sigmaTheta = A + B / (r * r);
  const sigmaZ = 2 * nu * A;
  const radialDisplacement = (1 + nu) / E * ((1 - 2 * nu) * A * r + B / r);
  return deepFreeze({ A, B, radius: r, radialDisplacement, sigmaR, sigmaZ, sigmaTheta, tauRZ: 0 });
}

export function lamePlaneStrainEnergy({
  innerRadius,
  outerRadius,
  length,
  internalPressure,
  externalPressure,
  youngsModulus,
  poissonRatio,
} = {}) {
  const a = positive(innerRadius, 'innerRadius');
  const b = positive(outerRadius, 'outerRadius');
  const L = positive(length, 'length');
  const pi = nonnegative(internalPressure, 'internalPressure');
  const po = nonnegative(externalPressure, 'externalPressure');
  const E = positive(youngsModulus, 'youngsModulus');
  const nu = Number(poissonRatio);
  if (!(b > a) || !Number.isFinite(nu) || nu <= -1 || nu >= 0.5) throw new RangeError('ORACLE_LAME_ENERGY_INPUT_INVALID');
  const A = (pi * a * a - po * b * b) / (b * b - a * a);
  const B = a * a * b * b * (pi - po) / (b * b - a * a);
  const C = (1 + nu) / E;
  const constantTerm = (1 - 2 * nu) * A * A * (b * b - a * a) / 2;
  const inverseTerm = B * B * (1 / (a * a) - 1 / (b * b)) / 2;
  return 2 * Math.PI * L * C * (constantTerm + inverseTerm);
}

export function lameAxialReactionMagnitude({
  innerRadius,
  outerRadius,
  internalPressure,
  externalPressure,
  poissonRatio,
} = {}) {
  const a = positive(innerRadius, 'innerRadius');
  const b = positive(outerRadius, 'outerRadius');
  const pi = nonnegative(internalPressure, 'internalPressure');
  const po = nonnegative(externalPressure, 'externalPressure');
  const nu = Number(poissonRatio);
  if (!(b > a) || !Number.isFinite(nu)) throw new RangeError('ORACLE_LAME_REACTION_INPUT_INVALID');
  const A = (pi * a * a - po * b * b) / (b * b - a * a);
  return 2 * nu * A * Math.PI * (b * b - a * a);
}

export function analyticalVariableAxialTractionResultant({ innerRadius, outerRadius, q0, q1 } = {}) {
  const a = positive(innerRadius, 'innerRadius');
  const b = positive(outerRadius, 'outerRadius');
  if (!(b > a) || !Number.isFinite(q0) || !Number.isFinite(q1)) throw new RangeError('ORACLE_VARIABLE_TRACTION_INPUT_INVALID');
  const delta = b - a;
  const base = q0 * (b * b - a * a) / 2;
  const variablePrimitive = (b ** 3 - a ** 3) / 3 - a * (b * b - a * a) / 2;
  return 2 * Math.PI * (base + q1 * variablePrimitive / delta);
}

function oracleConstitutive(material) {
  const E = positive(material?.youngsModulus, 'youngsModulus');
  const nu = Number(material?.poissonRatio);
  if (!Number.isFinite(nu) || nu <= -1 || nu >= 0.5) throw new RangeError('ORACLE_AXI_Q8_POISSON_INVALID');
  const shear = E / (2 * (1 + nu));
  const lambda = E * nu / ((1 + nu) * (1 - 2 * nu));
  const normal = lambda + 2 * shear;
  return [[normal, lambda, lambda, 0], [lambda, normal, lambda, 0], [lambda, lambda, normal, 0], [0, 0, 0, shear]];
}
function oracleB(nodes, xi, eta, radiusTolerance) {
  const shape = shape8(xi, eta);
  let r=0,z=0,rr=0,zr=0,rs=0,zs=0;
  for(let k=0;k<8;k+=1){r+=shape.N[k]*nodes[k].r;z+=shape.N[k]*nodes[k].z;rr+=shape.x[k]*nodes[k].r;zr+=shape.x[k]*nodes[k].z;rs+=shape.e[k]*nodes[k].r;zs+=shape.e[k]*nodes[k].z;}
  const det=rr*zs-rs*zr;
  if(!(det>0)||!(r>radiusTolerance)) throw new RangeError('ORACLE_AXI_Q8_MAPPING_INVALID');
  const B=matrix(4,16); const inv=1/det;
  for(let k=0;k<8;k+=1){const dr=(zs*shape.x[k]-zr*shape.e[k])*inv;const dz=(-rs*shape.x[k]+rr*shape.e[k])*inv;B[0][2*k]=dr;B[1][2*k+1]=dz;B[2][2*k]=shape.N[k]/r;B[3][2*k]=dz;B[3][2*k+1]=dr;}
  return {B,radius:r,r,z,determinant:det};
}
function shape8(x,e){return {N:[-(1-x)*(1-e)*(1+x+e)/4,-(1+x)*(1-e)*(1-x+e)/4,-(1+x)*(1+e)*(1-x-e)/4,-(1-x)*(1+e)*(1+x-e)/4,(1-x*x)*(1-e)/2,(1+x)*(1-e*e)/2,(1-x*x)*(1+e)/2,(1-x)*(1-e*e)/2],x:[(1-e)*(2*x+e)/4,(1-e)*(2*x-e)/4,(1+e)*(2*x+e)/4,(1+e)*(2*x-e)/4,-x*(1-e),(1-e*e)/2,-x*(1+e),-(1-e*e)/2],e:[(1-x)*(x+2*e)/4,-(1+x)*(x-2*e)/4,(1+x)*(x+2*e)/4,-(1-x)*(x-2*e)/4,-(1-x*x)/2,-e*(1+x),(1-x*x)/2,-e*(1-x)]};}
function edgeShape(s){return {N:[s*(s-1)/2,1-s*s,s*(s+1)/2],d:[s-0.5,-2*s,s+0.5]};}
function edgeMap(nodes,shape){let r=0,z=0,dr=0,dz=0;for(let i=0;i<3;i+=1){r+=shape.N[i]*nodes[i].r;z+=shape.N[i]*nodes[i].z;dr+=shape.d[i]*nodes[i].r;dz+=shape.d[i]*nodes[i].z;}return {r,z,jacobian:Math.hypot(dr,dz)};}
function requireNodes(nodes){if(!Array.isArray(nodes)||nodes.length!==8)throw new TypeError('ORACLE_AXI_Q8_REQUIRES_EIGHT_NODES');return nodes.map((n,i)=>{if(!Number.isFinite(n?.r)||!Number.isFinite(n?.z))throw new TypeError(`ORACLE_AXI_Q8_NODE_${i+1}_INVALID`);return {nodeId:n.nodeId??`N${i+1}`,r:n.r,z:n.z};});}
function requireEdgeNodes(nodes){if(!Array.isArray(nodes)||nodes.length!==3)throw new TypeError('ORACLE_AXI_EDGE_REQUIRES_THREE_NODES');return nodes.map((n,i)=>{if(!Number.isFinite(n?.r)||!Number.isFinite(n?.z))throw new TypeError(`ORACLE_AXI_EDGE_NODE_${i+1}_INVALID`);return {nodeId:n.nodeId??`E${i+1}`,r:n.r,z:n.z};});}
function matrix(r,c){return Array.from({length:r},()=>new Array(c).fill(0));}
function multiply(m,v){return m.map(row=>row.reduce((s,x,i)=>s+x*v[i],0));}
function vector(v){if(!Array.isArray(v)||v.length!==2||v.some(x=>!Number.isFinite(Number(x))))throw new TypeError('ORACLE_VECTOR_INVALID');return [Number(v[0]),Number(v[1])];}
function unit(v){const n=Math.hypot(...v);if(!(n>0)||Math.abs(n-1)>1e-10)throw new RangeError('ORACLE_UNIT_VECTOR_INVALID');return [v[0]/n,v[1]/n];}
function positive(v,label){const n=Number(v);if(!Number.isFinite(n)||!(n>0))throw new RangeError(`ORACLE_${label.toUpperCase()}_INVALID`);return n;}
function nonnegative(v,label){const n=Number(v);if(!Number.isFinite(n)||n<0)throw new RangeError(`ORACLE_${label.toUpperCase()}_INVALID`);return n;}
