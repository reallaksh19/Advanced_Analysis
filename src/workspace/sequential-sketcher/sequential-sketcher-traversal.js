import { asciiCompare } from './sequential-sketcher-contract.js';

function otherNode(segment, nodeId) {
  return segment.fromNodeId === nodeId ? segment.toNodeId : segment.fromNodeId;
}

function segmentPreference(left, right) {
  const roleRank = (role) => (role === 'RUN_A' || role === 'RUN_B' || role === 'INLINE' ? 0 : 1);
  return roleRank(left.role) - roleRank(right.role) || left.sourceIndex - right.sourceIndex || asciiCompare(left.id, right.id);
}

function nodeIndex(topology) { return new Map(topology.nodes.map((node) => [node.id, node])); }
function segmentIndex(topology) { return new Map(topology.segments.map((segment) => [segment.id, segment])); }

function isDecisionNode(node) {
  return node.segmentIds.length !== 2 || node.boundaryIds.length > 0;
}

function walkSection(topology, startNodeId, firstSegmentId, unvisited, sectionNumber) {
  const nodes = nodeIndex(topology);
  const segments = segmentIndex(topology);
  const orderedSegmentIds = [];
  let currentNodeId = startNodeId;
  let segmentId = firstSegmentId;
  while (segmentId && unvisited.has(segmentId)) {
    unvisited.delete(segmentId);
    orderedSegmentIds.push(segmentId);
    const segment = segments.get(segmentId);
    const nextNodeId = otherNode(segment, currentNodeId);
    const nextNode = nodes.get(nextNodeId);
    if (!nextNode || isDecisionNode(nextNode)) {
      return Object.freeze({ id: `RS-${String(sectionNumber).padStart(3, '0')}`, startNodeId, endNodeId: nextNodeId, segmentIds: Object.freeze(orderedSegmentIds) });
    }
    const candidates = nextNode.segmentIds.filter((id) => unvisited.has(id)).map((id) => segments.get(id)).filter(Boolean).sort(segmentPreference);
    currentNodeId = nextNodeId;
    segmentId = candidates[0]?.id || null;
  }
  return Object.freeze({ id: `RS-${String(sectionNumber).padStart(3, '0')}`, startNodeId, endNodeId: currentNodeId, segmentIds: Object.freeze(orderedSegmentIds) });
}

export function decomposeRouteSections(topology) {
  const segments = segmentIndex(topology);
  const unvisited = new Set(topology.segments.map((segment) => segment.id));
  const sections = [];
  const decisions = topology.nodes.filter(isDecisionNode).sort((a, b) => asciiCompare(a.id, b.id));
  for (const node of decisions) {
    const candidates = node.segmentIds.map((id) => segments.get(id)).filter((segment) => segment && unvisited.has(segment.id)).sort(segmentPreference);
    for (const segment of candidates) sections.push(walkSection(topology, node.id, segment.id, unvisited, sections.length + 1));
  }
  while (unvisited.size) {
    const sortedSegmentKeys = [...unvisited].sort(asciiCompare);
    const segment = segments.get(sortedSegmentKeys[0]);
    sections.push(walkSection(topology, segment.fromNodeId, segment.id, unvisited, sections.length + 1));
  }
  return Object.freeze(sections);
}

function sectionsAtNode(sections, nodeId, unvisited) {
  return sections
    .filter((section) => unvisited.has(section.id) && (section.startNodeId === nodeId || section.endNodeId === nodeId))
    .sort((left, right) => asciiCompare(left.segmentIds[0], right.segmentIds[0]));
}

function chooseStartNode(topology, sections, unvisited) {
  const head = topology.boundaries.find((boundary) => boundary.role === 'HEAD' && boundary.nodeId && sectionsAtNode(sections, boundary.nodeId, unvisited).length);
  if (head) return { nodeId: head.nodeId, basis: 'HEAD_BOUNDARY' };
  const terminal = topology.nodes
    .filter((node) => sectionsAtNode(sections, node.id, unvisited).length === 1)
    .sort((a, b) => asciiCompare(a.id, b.id))[0];
  if (terminal) return { nodeId: terminal.id, basis: 'DEGREE_ONE_TERMINAL' };
  const any = topology.nodes.find((node) => sectionsAtNode(sections, node.id, unvisited).length);
  return any ? { nodeId: any.id, basis: 'PRESENTATION_SEED' } : null;
}

function markEvents(topology, nodeId, markedComponents, commands) {
  const node = topology.nodes.find((candidate) => candidate.id === nodeId);
  for (const componentId of node?.eventComponentIds || []) {
    if (markedComponents.has(componentId)) continue;
    markedComponents.add(componentId);
    commands.push(Object.freeze({ op: 'MARK_COMPONENT', nodeId, componentId }));
  }
}

function orientedSegments(section, fromNodeId, segments) {
  const ids = section.startNodeId === fromNodeId ? [...section.segmentIds] : [...section.segmentIds].reverse();
  let current = fromNodeId;
  return ids.map((id) => {
    const segment = segments.get(id);
    const next = otherNode(segment, current);
    const oriented = { segment, fromNodeId: current, toNodeId: next };
    current = next;
    return oriented;
  });
}

export function planSequentialTraversal(topology) {
  const sections = decomposeRouteSections(topology);
  const segments = segmentIndex(topology);
  const unvisited = new Set(sections.map((section) => section.id));
  const markedComponents = new Set();
  const commands = [];
  const issues = [...topology.issues];
  let disconnectedCount = 0;

  while (unvisited.size) {
    const start = chooseStartNode(topology, sections, unvisited);
    if (!start) break;
    if (commands.length) {
      disconnectedCount += 1;
      issues.push({ code: 'DISCONNECTED_FRAGMENT', severity: 'WARNING', nodeId: start.nodeId });
    }
    commands.push(Object.freeze({ op: 'MOVE_TO', nodeId: start.nodeId, reason: commands.length ? 'DISCONNECTED_FRAGMENT' : 'START' }));
    let currentNodeId = start.nodeId;
    const pending = [];
    markEvents(topology, currentNodeId, markedComponents, commands);
    while (true) {
      const options = sectionsAtNode(sections, currentNodeId, unvisited);
      if (!options.length) {
        if (!pending.length) break;
        const resume = pending.pop();
        currentNodeId = resume.nodeId;
        commands.push(Object.freeze({ op: 'PEN_UP' }));
        commands.push(Object.freeze({ op: 'MOVE_TO', nodeId: currentNodeId, reason: 'RETURN_TO_JUNCTION' }));
        commands.push(Object.freeze({ op: 'PEN_DOWN' }));
        continue;
      }
      if (options.length > 1) {
        commands.push(Object.freeze({ op: 'REGISTER_JUNCTION', nodeId: currentNodeId, pendingSectionIds: Object.freeze(options.slice(1).map((section) => section.id)) }));
        pending.push({ nodeId: currentNodeId });
      }
      const section = options[0];
      unvisited.delete(section.id);
      commands.push(Object.freeze({ op: 'BEGIN_ROUTE_SECTION', sectionId: section.id, nodeId: currentNodeId }));
      for (const oriented of orientedSegments(section, currentNodeId, segments)) {
        commands.push(Object.freeze({ op: 'DRAW_SEGMENT', sectionId: section.id, segmentId: oriented.segment.id, componentId: oriented.segment.componentId, fromNodeId: oriented.fromNodeId, toNodeId: oriented.toNodeId }));
        currentNodeId = oriented.toNodeId;
        markEvents(topology, currentNodeId, markedComponents, commands);
      }
      commands.push(Object.freeze({ op: 'END_ROUTE_SECTION', sectionId: section.id, nodeId: currentNodeId }));
    }
  }

  const undrawnComponents = topology.components.filter((component) => !component.segmentIds.length && !markedComponents.has(component.id));
  for (const component of undrawnComponents) issues.push({ code: 'UNACCOUNTED_COMPONENT', severity: 'ERROR', componentId: component.componentId });
  const hasBranchDecision = topology.nodes.some((node) => sections.filter((section) => section.startNodeId === node.id || section.endNodeId === node.id).length + node.boundaryIds.length > 2);
  return Object.freeze({
    commands: Object.freeze(commands),
    routeSections: sections,
    issues: Object.freeze(issues.map(Object.freeze)),
    graphClass: disconnectedCount ? 'DISCONNECTED_FOREST' : hasBranchDecision ? 'BRANCHED_GRAPH' : topology.nodes.every((node) => node.segmentIds.length === 2 && !node.boundaryIds.length) ? 'LOOP' : 'SIMPLE_PATH',
  });
}
