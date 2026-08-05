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
  return { nodes, elements, lx, ly };
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
    '*NODE PRINT,NSET=NALL','U','*NODE PRINT,NSET=FIX','RF','*EL PRINT,ELSET=EALL','S,E','*NODE FILE','U,RF','*EL FILE','S,E','*END STEP'];
  return `${lines.join('\n')}\n`;
}
function meshText(mesh, type = 'S8R') {
  return ['*NODE,NSET=NALL', ...mesh.nodes.map((n) => `${n.id},${fmt(n.x)},${fmt(n.y)},${fmt(n.z)}`),
    `*ELEMENT,TYPE=${type},ELSET=EALL`, ...mesh.elements.map((e) => `${e.id},${e.nodes.join(',')}`)];
}
function fmt(n) { if (!Number.isFinite(n)) throw new TypeError('Non-finite deck value.'); return Number(n).toExponential(10); }
