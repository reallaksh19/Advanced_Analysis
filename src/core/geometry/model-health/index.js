export {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  inputXmlModelHealthGeometryProjection,
  requireInputXmlModelHealthSource,
} from './inputxml-model-health-source-contract.js';

export { buildTopologyGraph } from './graph-components.js';

export {
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  TOPOLOGY_GRAPH_DIAGNOSTICS_SCHEMA,
  requireTopologyGraphDiagnostics,
  sealTopologyGraphDiagnostics,
} from './topology-graph-diagnostics-contract.js';

export { diagnoseInputXmlTopologyGraph } from './topology-graph-diagnostics.js';

export {
  aabbDistanceSquared,
  buildSegmentGeometry,
  classifySegmentPair,
} from './segment-proximity-3d.js';

export {
  TOPOLOGY_PROXIMITY_DIAGNOSTICS_SCHEMA,
  requireTopologyProximityDiagnostics,
  sealTopologyProximityDiagnostics,
} from './topology-proximity-diagnostics-contract.js';

export { diagnoseInputXmlTopologyProximity } from './topology-proximity-diagnostics.js';
