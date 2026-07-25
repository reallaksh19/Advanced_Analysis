import { resolveSourceEndpointConnections } from './endpoint-stage.js';
import { resolveExactCoordinateConnections } from './exact-stage.js';
import { resolveExplicitConnections } from './explicit-stage.js';
import { createResolutionState, finalizeResolution } from './resolution-state.js';
import { resolveToleranceConnections } from './tolerance-stage.js';

export function resolveTopologyConnections(projection, profile) {
  const state = createResolutionState(projection);
  resolveExplicitConnections(state);
  resolveSourceEndpointConnections(state);
  if (profile.allowExactCoordinateMatch) resolveExactCoordinateConnections(state);
  resolveToleranceConnections(state, profile);
  return finalizeResolution(state);
}
