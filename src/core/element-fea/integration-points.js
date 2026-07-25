import { deepFreeze } from '../shared-piping-model/immutable.js';
import { Q4_INTEGRATION_RULE } from './constants.js';
const G = 1 / Math.sqrt(3);
export const Q4_GAUSS_POINTS = deepFreeze([
  { integrationPointId: 'GP1', xi: -G, eta: -G, weight: 1 },
  { integrationPointId: 'GP2', xi: G, eta: -G, weight: 1 },
  { integrationPointId: 'GP3', xi: G, eta: G, weight: 1 },
  { integrationPointId: 'GP4', xi: -G, eta: G, weight: 1 },
]);
export const Q4_NATURAL_CORNERS = deepFreeze([
  { pointId: 'C1', xi: -1, eta: -1 }, { pointId: 'C2', xi: 1, eta: -1 },
  { pointId: 'C3', xi: 1, eta: 1 }, { pointId: 'C4', xi: -1, eta: 1 },
]);
export const EDGE_GAUSS_POINTS = deepFreeze([
  { integrationPointId: 'EGP1', s: -G, weight: 1 },
  { integrationPointId: 'EGP2', s: G, weight: 1 },
]);
export const Q4_EDGE_DESCRIPTORS = deepFreeze([
  { edgeId: 'E12', nodeIndices: [0, 1], natural: (s) => ({ xi: s, eta: -1 }), naturalTangent: [1, 0] },
  { edgeId: 'E23', nodeIndices: [1, 2], natural: (s) => ({ xi: 1, eta: s }), naturalTangent: [0, 1] },
  { edgeId: 'E34', nodeIndices: [2, 3], natural: (s) => ({ xi: -s, eta: 1 }), naturalTangent: [-1, 0] },
  { edgeId: 'E41', nodeIndices: [3, 0], natural: (s) => ({ xi: -1, eta: -s }), naturalTangent: [0, -1] },
]);
export function q4IntegrationRuleEvidence() {
  return deepFreeze({ ruleIdentity: Q4_INTEGRATION_RULE, order: Q4_GAUSS_POINTS.map((row) => row.integrationPointId), points: Q4_GAUSS_POINTS });
}
