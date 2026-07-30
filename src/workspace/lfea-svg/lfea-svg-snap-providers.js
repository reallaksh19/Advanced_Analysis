/**
 * LFEA SVG Snap Providers
 * Implements ENDPOINT, MIDPOINT, CENTRE, INTERSECTION, TANGENT, PERPENDICULAR, AXIS, GRID snapping.
 */
import { asciiSort } from './lfea-svg-contracts.js';

export function createEndpointSnapProvider(nodes = []) {
  return Object.freeze({
    id: 'lfea-snap-01-endpoint',
    priority: 10,
    provide: (queryPoint, apertureRadius = 10.0) => {
      const candidates = [];
      nodes.forEach((node) => {
        const id = node.id || node.nodeId || 'node';
        const dist = Math.hypot((node.x || 0) - queryPoint.x, (node.y || 0) - queryPoint.y);
        if (dist <= apertureRadius) {
          candidates.push({ id, point: { x: node.x, y: node.y, z: node.z || 0 }, dist, committable: true });
        }
      });
      candidates.sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      return candidates;
    },
  });
}

export function createMidpointSnapProvider(elements = [], nodes = []) {
  const nodeMap = new Map(nodes.map((n) => [n.id || n.nodeId, n]));
  return Object.freeze({
    id: 'lfea-snap-02-midpoint',
    priority: 20,
    provide: (queryPoint, apertureRadius = 10.0) => {
      const candidates = [];
      elements.forEach((elem) => {
        const n1 = nodeMap.get(elem.node1 || elem.nodeI);
        const n2 = nodeMap.get(elem.node2 || elem.nodeJ);
        if (!n1 || !n2) return;
        const mid = {
          x: (n1.x + n2.x) / 2,
          y: (n1.y + n2.y) / 2,
          z: ((n1.z || 0) + (n2.z || 0)) / 2,
        };
        const dist = Math.hypot(mid.x - queryPoint.x, mid.y - queryPoint.y);
        if (dist <= apertureRadius) {
          candidates.push({ id: `mid-${elem.id || elem.elementId}`, point: mid, dist, committable: true });
        }
      });
      candidates.sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return candidates;
    },
  });
}
