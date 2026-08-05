export function q8Mesh({ nx, ny, lx, ly }) {
  const nodes = [], lookup = new Map();
  let id = 1;
  for (let ix = 0; ix <= 2*nx; ix += 1) for (let iy = 0; iy <= 2*ny; iy += 1) {
    if (ix % 2 === 1 && iy % 2 === 1) continue;
    const node = { id, x: lx*ix/(2*nx), y: ly*iy/(2*ny), z: 0 };
    nodes.push(node); lookup.set(`${ix},${iy}`, id); id += 1;
  }
  const elements = [];
  let eid = 1;
  for (let ex = 0; ex < nx; ex += 1) for (let ey = 0; ey < ny; ey += 1) {
    const i = 2*ex, j = 2*ey, n = (a,b) => lookup.get(`${a},${b}`);
    elements.push({ id: eid++, nodes: [n(i,j),n(i+2,j),n(i+2,j+2),n(i,j+2),n(i+1,j),n(i+2,j+1),n(i+1,j+2),n(i,j+1)] });
  }
  return { nodes, elements, lx, ly, nx, ny };
}
export function warpMesh(mesh, amplitude) {
  return {
    ...mesh,
    nodes: mesh.nodes.map((node) => ({
      ...node,
      z: amplitude * (2*node.x/mesh.lx - 1) * (2*node.y/mesh.ly - 1),
    })),
  };
}
export function reverseNormals(mesh) {
  return { ...mesh, nodes: mesh.nodes.map((n) => ({...n})), elements: mesh.elements.map((e) => ({
    id: e.id, nodes: [e.nodes[0],e.nodes[3],e.nodes[2],e.nodes[1],e.nodes[7],e.nodes[6],e.nodes[5],e.nodes[4]],
  })) };
}
export function nodeAt(mesh, x, y) {
  const node = mesh.nodes.find((n) => Math.abs(n.x-x) < 1e-12 && Math.abs(n.y-y) < 1e-12);
  if (!node) throw new Error(`No node at ${x},${y}.`);
  return node.id;
}
export function prescribedDeck({ title, mesh, thickness, poisson, displacement, nlgeom = false, orientation = false }) {
  const lines = ['*HEADING', title, ...meshText(mesh)];
  if (orientation) lines.push('*ORIENTATION,NAME=GLOBAL', '1,0,0,0,1,0');
  lines.push('*MATERIAL,NAME=MAT', '*ELASTIC', `210000,${poisson}`,
    `*SHELL SECTION,ELSET=EALL,MATERIAL=MAT${orientation ? ',ORIENTATION=GLOBAL' : ''}`, fmt(thickness), '*BOUNDARY');
  for (const node of mesh.nodes) {
    const u = displacement(node);
    for (const [dof, key] of [[1,'u1'],[2,'u2'],[3,'u3'],[4,'r1'],[5,'r2'],[6,'r3']]) lines.push(`${node.id},${dof},${dof},${fmt(u[key])}`);
  }
  lines.push(`*STEP${nlgeom ? ',NLGEOM' : ''}`, '*STATIC', '0.1,1.0',
    '*NODE PRINT,NSET=NALL', 'U,RF', '*EL PRINT,ELSET=EALL', 'S,E', '*NODE FILE', 'U,RF', '*EL FILE', 'S,E', '*END STEP');
  return `${lines.join('\n')}\n`;
}
export function cantileverDeck({ title, mesh, thickness, E, load, elementType = 'S8R' }) {
  const fixed = mesh.nodes.filter((n) => Math.abs(n.x) < 1e-12).map((n) => n.id);
  const tip = mesh.nodes.filter((n) => Math.abs(n.x-mesh.lx) < 1e-12).sort((a,b) => a.y-b.y);
  if (tip.length !== 3) throw new Error('Cantilever requires one Q8 element across width.');
  const lines = ['*HEADING',title,...meshText(mesh, elementType),'*MATERIAL,NAME=MAT','*ELASTIC',`${E},0`,
    '*SHELL SECTION,ELSET=EALL,MATERIAL=MAT',fmt(thickness),'*NSET,NSET=FIX',fixed.join(','),'*BOUNDARY','FIX,1,6,0',
    '*STEP','*STATIC','*CLOAD',`${tip[0].id},3,${fmt(load/6)}`,`${tip[1].id},3,${fmt(2*load/3)}`,`${tip[2].id},3,${fmt(load/6)}`,
    '*NODE PRINT,NSET=NALL','U,RF','*EL PRINT,ELSET=EALL','S,E','*NODE FILE','U,RF','*EL FILE','S,E','*END STEP'];
  return `${lines.join('\n')}\n`;
}
export function followerPressureDeck({ title, mesh, thickness, E, pressure, loadedElementIds }) {
  const fixed = mesh.nodes.filter((node) => Math.abs(node.x) < 1e-12).map((node) => node.id);
  const lines = ['*HEADING', title, ...meshText(mesh), '*NSET,NSET=FIX', fixed.join(','),
    '*MATERIAL,NAME=MAT', '*ELASTIC', `${E},0.3`, '*SHELL SECTION,ELSET=EALL,MATERIAL=MAT', fmt(thickness),
    '*BOUNDARY', 'FIX,1,6,0', '*STEP,NLGEOM', '*STATIC', '0.5,1.0', '*DLOAD'];
  for (const id of loadedElementIds) lines.push(`${id},P,${fmt(pressure)}`);
  lines.push('*NODE PRINT,NSET=NALL', 'U', '*NODE PRINT,NSET=FIX', 'RF', '*EL PRINT,ELSET=EALL', 'S,E,ENER',
    '*NODE FILE', 'U,RF', '*EL FILE', 'S,E', '*END STEP');
  return `${lines.join('\n')}\n`;
}
export function frozenPressureDeck({ title, mesh, thickness, E, pressure, loadedElementIds }) {
  const fixed = mesh.nodes.filter((node) => Math.abs(node.x) < 1e-12).map((node) => node.id);
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  const loads = new Map(mesh.nodes.map((node) => [node.id, [0,0,0]]));
  const weights = [-1/12,-1/12,-1/12,-1/12,1/3,1/3,1/3,1/3];
  for (const element of mesh.elements) {
    if (!loadedElementIds.includes(element.id)) continue;
    const corners = element.nodes.slice(0,4).map((id) => nodeById.get(id));
    const area = quadrilateralAreaVector(corners);
    for (let index = 0; index < 8; index += 1) {
      const row = loads.get(element.nodes[index]);
      for (let axis = 0; axis < 3; axis += 1) row[axis] += pressure * area[axis] * weights[index];
    }
  }
  const lines = ['*HEADING', title, ...meshText(mesh), '*NSET,NSET=FIX', fixed.join(','),
    '*MATERIAL,NAME=MAT', '*ELASTIC', `${E},0.3`, '*SHELL SECTION,ELSET=EALL,MATERIAL=MAT', fmt(thickness),
    '*BOUNDARY', 'FIX,1,6,0', '*STEP,NLGEOM', '*STATIC', '0.5,1.0', '*CLOAD'];
  for (const [node, vector] of loads) for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(vector[axis]) > 0) lines.push(`${node},${axis+1},${fmt(vector[axis])}`);
  }
  lines.push('*NODE PRINT,NSET=NALL', 'U', '*NODE PRINT,NSET=FIX', 'RF', '*EL PRINT,ELSET=EALL', 'S,E,ENER',
    '*NODE FILE', 'U,RF', '*EL FILE', 'S,E', '*END STEP');
  return `${lines.join('\n')}\n`;
}
function meshText(mesh, type = 'S8R') {
  return ['*NODE,NSET=NALL', ...mesh.nodes.map((n) => `${n.id},${fmt(n.x)},${fmt(n.y)},${fmt(n.z)}`),
    `*ELEMENT,TYPE=${type},ELSET=EALL`, ...mesh.elements.map((e) => `${e.id},${e.nodes.join(',')}`)];
}
function quadrilateralAreaVector(corners) {
  const a = subtract(corners[1], corners[0]), b = subtract(corners[3], corners[0]);
  const c = subtract(corners[2], corners[1]), d = subtract(corners[3], corners[1]);
  const first = cross(a,b), second = cross(c,d);
  return first.map((value,index) => 0.5*(value+second[index]));
}
function subtract(a,b) { return [a.x-b.x,a.y-b.y,a.z-b.z]; }
function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function fmt(n) { if (!Number.isFinite(n)) throw new TypeError('Non-finite deck value.'); return Number(n).toExponential(10); }
