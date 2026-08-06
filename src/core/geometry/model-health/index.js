export { buildTopologyGraph } from './graph-components.js';
export {
  aabbDistanceSquared,
  buildSegmentGeometry,
  classifySegmentPair,
} from './segment-proximity-3d.js';
export { diagnoseCanonicalTopology } from './topology-diagnostics.js';
export { diagnoseInputXmlTopology } from './inputxml-topology-diagnostics.js';
export {
  MODEL_TOPOLOGY_DIAGNOSTICS_SCHEMA,
  STRICT_LINEAR_STATIC_PROFILE,
  requireModelTopologyDiagnostics,
  sealModelTopologyDiagnostics,
} from './topology-diagnostics-contract.js';
