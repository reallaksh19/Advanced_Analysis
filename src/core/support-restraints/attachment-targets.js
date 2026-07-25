import {
  deepFreeze,
  finiteNumber,
  semanticHash,
  stringValue,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';
import {
  canonicalLengthFactor,
  validatePipingPortTopologyGraph,
} from '../piping-topology/index.js';

export function buildAttachmentTargets(sharedModel, topologyGraph) {
  assertInputs(sharedModel, topologyGraph);
  const factor = canonicalLengthFactor(sharedModel.units?.length);
  const portsByComponent = groupPorts(topologyGraph.ports);
  const targets = [];
  const diagnostics = [];
  [...sharedModel.components].sort(byKey('componentKey')).forEach((component) => {
    addComponentTargets(component, portsByComponent[component.componentKey] || [], factor, targets, diagnostics);
  });
  const base = {
    datasetId: sharedModel.project.datasetId,
    sharedModelSemanticHash: sharedModel.semanticHash,
    topologySemanticHash: topologyGraph.semanticHash,
    targets: targets.sort(byKey('targetId')),
    diagnostics: diagnostics.sort(diagnosticOrder),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function addComponentTargets(component, ports, factor, targets, diagnostics) {
  const validPorts = ports.filter((port) => port.positionCanonical);
  const center = canonicalPoint(component.geometry?.center, factor);
  targets.push(componentReferenceTarget(component, validPorts, center));
  validPorts.forEach((port) => targets.push(pointTarget(component, port)));
  if (center) targets.push(centerTarget(component, center));
  if (validPorts.length === 2) targets.push(segmentTarget(component, validPorts[0], validPorts[1], 'TWO_PORT_CENTERLINE'));
  if (validPorts.length > 2 && center) {
    validPorts.forEach((port) => targets.push(legTarget(component, center, port)));
  }
  if (!validPorts.length && !center) diagnostics.push(diagnostic(
    'ATTACHMENT_COMPONENT_GEOMETRY_INVALID',
    component.componentKey,
    'Component has no approved point or segment attachment geometry.',
  ));
}

function componentReferenceTarget(component, ports, center) {
  const segment = ports.length === 2 ? [ports[0].positionCanonical, ports[1].positionCanonical] : null;
  const point = center || (ports.length === 1 ? ports[0].positionCanonical : null);
  return deepFreeze({
    targetId: `target:component:${component.componentKey}`,
    targetType: 'COMPONENT_REFERENCE',
    componentKey: component.componentKey,
    portKey: null,
    pointCanonical: point,
    startCanonical: segment?.[0] || null,
    endCanonical: segment?.[1] || null,
    identity: normalizeIdentity(component.identity),
    sourceEvidence: cloneEvidence(component.sourceReferences),
  });
}

function pointTarget(component, port) {
  return deepFreeze({
    targetId: `target:port:${port.portKey}`,
    targetType: 'COMPONENT_PORT_POINT',
    componentKey: component.componentKey,
    portKey: port.portKey,
    pointCanonical: port.positionCanonical,
    startCanonical: null,
    endCanonical: null,
    identity: normalizeIdentity(component.identity),
    sourceEvidence: cloneEvidence(port.sourceReference),
  });
}

function centerTarget(component, center) {
  return deepFreeze({
    targetId: `target:center:${component.componentKey}`,
    targetType: 'EXPLICIT_COMPONENT_CENTER',
    componentKey: component.componentKey,
    portKey: null,
    pointCanonical: center,
    startCanonical: null,
    endCanonical: null,
    identity: normalizeIdentity(component.identity),
    sourceEvidence: cloneEvidence(component.sourceReferences),
  });
}

function segmentTarget(component, startPort, endPort, targetType) {
  const keys = [startPort.portKey, endPort.portKey].sort();
  return deepFreeze({
    targetId: `target:segment:${component.componentKey}:${keys.join(':')}`,
    targetType,
    componentKey: component.componentKey,
    portKey: null,
    pointCanonical: null,
    startCanonical: startPort.positionCanonical,
    endCanonical: endPort.positionCanonical,
    endpointPortKeys: keys,
    identity: normalizeIdentity(component.identity),
    sourceEvidence: cloneEvidence(component.sourceReferences),
  });
}

function legTarget(component, center, port) {
  return deepFreeze({
    targetId: `target:leg:${component.componentKey}:${port.portKey}`,
    targetType: 'EXPLICIT_CENTER_TO_PORT_LEG',
    componentKey: component.componentKey,
    portKey: port.portKey,
    pointCanonical: null,
    startCanonical: center,
    endCanonical: port.positionCanonical,
    endpointPortKeys: [port.portKey],
    identity: normalizeIdentity(component.identity),
    sourceEvidence: cloneEvidence(component.sourceReferences),
  });
}

function groupPorts(ports) {
  const grouped = {};
  ports.forEach((port) => {
    (grouped[port.componentKey] ||= []).push(port);
  });
  Object.values(grouped).forEach((rows) => rows.sort(byKey('portKey')));
  return grouped;
}

function canonicalPoint(value, factor) {
  if (!value || factor === null) return null;
  const x = finiteNumber(value.x), y = finiteNumber(value.y), z = finiteNumber(value.z);
  return x === null || y === null || z === null
    ? null
    : deepFreeze({ x: x * factor, y: y * factor, z: z * factor });
}

function normalizeIdentity(identity) {
  return deepFreeze({
    lineId: stringValue(identity?.lineId),
    branchId: stringValue(identity?.branchId),
    systemId: stringValue(identity?.systemId),
    zoneId: stringValue(identity?.zoneId),
  });
}

function cloneEvidence(value) {
  return value && typeof value === 'object' ? deepFreeze(structuredClone(value)) : deepFreeze({});
}

function diagnostic(code, scope, message) {
  return deepFreeze({ code, severity: 'WARNING', scope, message });
}

function diagnosticOrder(left, right) {
  return `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`);
}

function byKey(field) {
  return (left, right) => stringValue(left?.[field]).localeCompare(stringValue(right?.[field]));
}

function assertInputs(sharedModel, graph) {
  const modelValidation = validateSharedPipingModel(sharedModel);
  if (!modelValidation.ok) throw new TypeError(`Attachment targets require shared-piping-model/v1: ${modelValidation.errors.join(' ')}`);
  const graphValidation = validatePipingPortTopologyGraph(graph);
  if (!graphValidation.ok) throw new TypeError(`Attachment targets require piping-port-topology-graph/v1: ${graphValidation.errors.join(' ')}`);
  if (graph.sharedModelSemanticHash !== sharedModel.semanticHash) {
    throw new TypeError('Topology graph does not belong to the supplied shared model.');
  }
}
