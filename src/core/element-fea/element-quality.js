import { deepFreeze } from '../shared-piping-model/immutable.js';
import { ELEMENT_TYPES, Q4_INTEGRATION_RULE, Q4_NODE_ORDER } from './constants.js';
import { Q4_GAUSS_POINTS, Q4_NATURAL_CORNERS } from './integration-points.js';
import { createQ4PointGeometry } from './q4-geometry.js';
export function qualifyQ4Geometry(nodes, tolerance) {
  if (nodes.length !== 4) throw new TypeError('Q4 geometry requires four nodes.');
  const turns = nodes.map((node, index) => turn(node, nodes[(index + 1) % 4], nodes[(index + 2) % 4]));
  if (turns.some((value) => !(value > tolerance))) throw new TypeError('Q4 connectivity must be strictly convex, counterclockwise, and non-crossed.');
  const gauss = Q4_GAUSS_POINTS.map((point) => determinantEvidence(nodes, point, tolerance));
  const corners = Q4_NATURAL_CORNERS.map((point) => determinantEvidence(nodes, point, tolerance));
  const edgeLengths = nodes.map((node, index) => Math.hypot(nodes[(index + 1) % 4].x - node.x, nodes[(index + 1) % 4].y - node.y));
  if (edgeLengths.some((value) => !(value > 0) || !Number.isFinite(value))) throw new TypeError('Q4 contains a collapsed or non-finite edge.');
  const determinants = [...gauss, ...corners].map((row) => row.determinant); const min = Math.min(...determinants); const max = Math.max(...determinants);
  return deepFreeze({ nodeOrder: Q4_NODE_ORDER, integrationRule: Q4_INTEGRATION_RULE, turns, gaussPointJacobians: gauss, cornerJacobians: corners, minimumJacobianDeterminant: min, maximumJacobianDeterminant: max, jacobianDeterminantRatio: min / max, edgeLengths, edgeLengthRatio: Math.min(...edgeLengths) / Math.max(...edgeLengths), maximumCornerCosine: maximumCornerCosine(nodes) });
}
export function elementEdges(element) {
  const ids = element.nodeIds; return element.type === ELEMENT_TYPES.Q4 ? [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[3]], [ids[3], ids[0]]] : [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]];
}
export function assertNoCoincidentNodes(nodes) {
  for (let left = 0; left < nodes.length; left += 1) for (let right = left + 1; right < nodes.length; right += 1) {
    if (nodes[left].x === nodes[right].x && nodes[left].y === nodes[right].y) throw new TypeError('Duplicate coincident nodes are prohibited.');
  }
}
export function assertNoImproperEdgeIntersections(nodes, elements, tolerance) {
  const nodeMap = new Map(nodes.map((row) => [row.nodeId, row]));
  const edges = elements.flatMap((element) => elementEdges(element).map((edge) => ({ elementId: element.elementId, edge })));
  for (let left = 0; left < edges.length; left += 1) for (let right = left + 1; right < edges.length; right += 1) {
    const a = edges[left], b = edges[right]; if (a.elementId === b.elementId) continue;
    const shared = a.edge.filter((id) => b.edge.includes(id)); if (shared.length === 2 || shared.length === 1) continue;
    if (segmentsIntersect(a.edge.map((id) => nodeMap.get(id)), b.edge.map((id) => nodeMap.get(id)), tolerance)) throw new TypeError('Nonconforming element-edge intersections are prohibited.');
  }
}
export function assertNoHangingNodes(nodes, elements, tolerance) {
  const nodeMap = new Map(nodes.map((row) => [row.nodeId, row]));
  const edges = elements.flatMap((element) => elementEdges(element).map((edge) => ({ elementId: element.elementId, edge })));
  for (const { edge } of edges) for (const node of nodes) {
    if (!edge.includes(node.nodeId) && pointOnSegmentInterior(node, nodeMap.get(edge[0]), nodeMap.get(edge[1]), tolerance)) throw new TypeError('Hanging nodes and partially shared edges are prohibited.');
  }
}
function determinantEvidence(nodes, point, tolerance) {
  const geometry = createQ4PointGeometry(nodes, point);
  if (!(geometry.determinant > tolerance) || !Number.isFinite(geometry.determinant)) throw new TypeError(`Q4 Jacobian determinant is invalid at ${point.integrationPointId || point.pointId}.`);
  return { pointId: point.integrationPointId || point.pointId, xi: point.xi, eta: point.eta, determinant: geometry.determinant };
}
function turn(a, b, c) { return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x); }
function maximumCornerCosine(nodes) {
  return Math.max(...nodes.map((node, index) => { const previous = nodes[(index + 3) % 4]; const next = nodes[(index + 1) % 4]; const left = [previous.x - node.x, previous.y - node.y]; const right = [next.x - node.x, next.y - node.y]; return Math.abs((left[0] * right[0] + left[1] * right[1]) / (Math.hypot(...left) * Math.hypot(...right))); }));
}
function pointOnSegmentInterior(point, start, end, tolerance) {
  const dx = end.x - start.x; const dy = end.y - start.y; const px = point.x - start.x; const py = point.y - start.y;
  const cross = dx * py - dy * px; const dot = px * dx + py * dy; const lengthSquared = dx * dx + dy * dy;
  return Math.abs(cross) <= tolerance && dot > 0 && dot < lengthSquared;
}
function segmentsIntersect(first, second, tolerance) {
  const [a,b]=first,[c,d]=second; const o1=orientation(a,b,c),o2=orientation(a,b,d),o3=orientation(c,d,a),o4=orientation(c,d,b);
  if (((o1 > tolerance && o2 < -tolerance) || (o1 < -tolerance && o2 > tolerance)) && ((o3 > tolerance && o4 < -tolerance) || (o3 < -tolerance && o4 > tolerance))) return true;
  return (Math.abs(o1)<=tolerance && onSegment(c,a,b)) || (Math.abs(o2)<=tolerance && onSegment(d,a,b)) || (Math.abs(o3)<=tolerance && onSegment(a,c,d)) || (Math.abs(o4)<=tolerance && onSegment(b,c,d));
}
function orientation(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function onSegment(p,a,b){return p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);}
