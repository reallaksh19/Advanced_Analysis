import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { validateNonFeaThermalFreeMovementBasis } from '../non-fea-engineering-foundation/thermal-free-movement.js';
import { validateNonFeaImplementationTopologyEligibility } from './topology-eligibility.js';

export const NON_FEA_OPERATING_REACTION_DEPENDENCY_DAG_SCHEMA =
  'non-fea-operating-reaction-dependency-dag/v1';

const VERTICAL_IMPLEMENTATION_ID = 'EMPIRICAL_BEAM_CONTACT_V1';
const SUPERPOSITION_IMPLEMENTATION_ID = 'EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1';

const NODE_IDS = Object.freeze([
  'COMMON_INPUT',
  'TOPOLOGY_SELECTION',
  'VERTICAL_IMPLEMENTATION',
  'THERMAL_FREE_MOVEMENT',
  'LINE_STOP_IMPLEMENTATION',
  'SUPERPOSITION_POLICY_BINDING',
  'COORDINATE_FRAME_BINDING',
  'SUPERPOSITION_IMPLEMENTATION',
  'VERTICAL_RESULT',
  'LINE_STOP_RESULT',
  'SOURCE_BINDING_COMPATIBILITY',
  'SUPPORT_SITE_CUSTODY_COMPATIBILITY',
  'FORCE_COMPONENT_OWNERSHIP',
  'MOMENT_OWNERSHIP',
  'COMBINED_OPERATING_REACTION',
]);

const EDGES = Object.freeze([
  edge('COMMON_INPUT', 'VERTICAL_IMPLEMENTATION'),
  edge('COMMON_INPUT', 'THERMAL_FREE_MOVEMENT'),
  edge('COMMON_INPUT', 'SUPERPOSITION_POLICY_BINDING'),
  edge('COMMON_INPUT', 'COORDINATE_FRAME_BINDING'),
  edge('TOPOLOGY_SELECTION', 'LINE_STOP_IMPLEMENTATION'),
  edge('VERTICAL_IMPLEMENTATION', 'VERTICAL_RESULT'),
  edge('THERMAL_FREE_MOVEMENT', 'LINE_STOP_RESULT'),
  edge('LINE_STOP_IMPLEMENTATION', 'LINE_STOP_RESULT'),
  edge('SUPERPOSITION_POLICY_BINDING', 'SUPERPOSITION_IMPLEMENTATION'),
  edge('VERTICAL_RESULT', 'SOURCE_BINDING_COMPATIBILITY'),
  edge('LINE_STOP_RESULT', 'SOURCE_BINDING_COMPATIBILITY'),
  edge('VERTICAL_RESULT', 'SUPPORT_SITE_CUSTODY_COMPATIBILITY'),
  edge('LINE_STOP_RESULT', 'SUPPORT_SITE_CUSTODY_COMPATIBILITY'),
  edge('VERTICAL_RESULT', 'FORCE_COMPONENT_OWNERSHIP'),
  edge('LINE_STOP_RESULT', 'FORCE_COMPONENT_OWNERSHIP'),
  edge('COORDINATE_FRAME_BINDING', 'FORCE_COMPONENT_OWNERSHIP'),
  edge('VERTICAL_RESULT', 'MOMENT_OWNERSHIP'),
  edge('LINE_STOP_RESULT', 'MOMENT_OWNERSHIP'),
  edge('SOURCE_BINDING_COMPATIBILITY', 'COMBINED_OPERATING_REACTION'),
  edge('SUPPORT_SITE_CUSTODY_COMPATIBILITY', 'COMBINED_OPERATING_REACTION'),
  edge('FORCE_COMPONENT_OWNERSHIP', 'COMBINED_OPERATING_REACTION'),
  edge('MOMENT_OWNERSHIP', 'COMBINED_OPERATING_REACTION'),
  edge('SUPERPOSITION_IMPLEMENTATION', 'COMBINED_OPERATING_REACTION'),
  edge('SUPERPOSITION_POLICY_BINDING', 'COMBINED_OPERATING_REACTION'),
  edge('COORDINATE_FRAME_BINDING', 'COMBINED_OPERATING_REACTION'),
].sort(edgeOrder));

/**
 * Builds a non-executing dependency graph for combined operating reactions.
 * The graph prepares and exposes prerequisites only. It never reads empirical
 * result payloads, combines vectors, authorizes execution, or mutates geometry.
 */
export function createNonFeaOperatingReactionDependencyDag(input = {}) {
  const topologyEligibility = requireTopologyEligibility(input.topologyEligibility);
  const combinedOperatingInputState = enumValue(
    input.combinedOperatingInputState,
    ['READY', 'BLOCKED'],
    'combinedOperatingInputState',
  );
  const commonInputSemanticHash = requiredHash(
    input.commonInputSemanticHash,
    'commonInputSemanticHash',
  );
  const authorityRevisionVectorSemanticHash = requiredHash(
    input.authorityRevisionVectorSemanticHash,
    'authorityRevisionVectorSemanticHash',
  );
  const coordinateFrameSemanticHash = nullableHash(
    input.coordinateFrameSemanticHash,
    'coordinateFrameSemanticHash',
  );
  const superpositionPolicySemanticHash = nullableHash(
    input.superpositionPolicySemanticHash,
    'superpositionPolicySemanticHash',
  );
  const verticalLoadCaseId = requiredText(input.verticalLoadCaseId, 'verticalLoadCaseId');
  const lineStopLoadCaseId = requiredText(input.lineStopLoadCaseId, 'lineStopLoadCaseId');
  const outputLoadCaseId = requiredText(input.outputLoadCaseId, 'outputLoadCaseId');
  const thermalFreeMovementBasis = input.thermalFreeMovementBasis === null
    || input.thermalFreeMovementBasis === undefined
    ? null
    : requireThermalBasis(input.thermalFreeMovementBasis);

  const requiredLineStopImplementationId =
    topologyEligibility.restraintNetworkRecommendation?.requiredImplementationId || null;
  const commonInputNode = combinedOperatingInputState === 'READY'
    ? satisfied('COMMON_INPUT', 'Combined-operating common input is ready.')
    : blocked('COMMON_INPUT', 'COMBINED_OPERATING_INPUT_BLOCKED', 'Combined-operating common input is blocked.');
  const topologyNode = topologySelectionNode(topologyEligibility, requiredLineStopImplementationId);
  const verticalNode = implementationNode(
    'VERTICAL_IMPLEMENTATION',
    topologyEligibility,
    VERTICAL_IMPLEMENTATION_ID,
  );
  const thermalNode = thermalMovementNode(thermalFreeMovementBasis, lineStopLoadCaseId);
  const lineStopNode = requiredLineStopImplementationId
    ? implementationNode(
      'LINE_STOP_IMPLEMENTATION',
      topologyEligibility,
      requiredLineStopImplementationId,
      true,
    )
    : blocked(
      'LINE_STOP_IMPLEMENTATION',
      'LINE_STOP_IMPLEMENTATION_UNRESOLVED',
      'Topology did not identify a restraint-network implementation.',
    );
  const superpositionPolicyNode = superpositionPolicySemanticHash
    ? satisfied(
      'SUPERPOSITION_POLICY_BINDING',
      `Superposition policy is bound at ${superpositionPolicySemanticHash}.`,
    )
    : blocked(
      'SUPERPOSITION_POLICY_BINDING',
      'OPERATING_SUPERPOSITION_POLICY_REQUIRED',
      'An explicit governed superposition-policy binding is required.',
    );
  const coordinateFrameNode = coordinateFrameSemanticHash
    ? satisfied(
      'COORDINATE_FRAME_BINDING',
      `Coordinate frame is bound at ${coordinateFrameSemanticHash}.`,
    )
    : blocked(
      'COORDINATE_FRAME_BINDING',
      'OPERATING_COORDINATE_FRAME_REQUIRED',
      'An explicit coordinate-frame binding is required.',
    );
  const superpositionImplementationNode = implementationNode(
    'SUPERPOSITION_IMPLEMENTATION',
    topologyEligibility,
    SUPERPOSITION_IMPLEMENTATION_ID,
  );

  const preparationNodes = [
    commonInputNode,
    topologyNode,
    verticalNode,
    thermalNode,
    lineStopNode,
    superpositionPolicyNode,
    coordinateFrameNode,
    superpositionImplementationNode,
  ];
  const preparationReady = preparationNodes.every((row) => row.state === 'SATISFIED');
  const verticalResultNode = dependentResultNode(
    'VERTICAL_RESULT',
    [commonInputNode, verticalNode],
    'A current calculated vertical empirical result is required.',
  );
  const lineStopResultNode = dependentResultNode(
    'LINE_STOP_RESULT',
    [commonInputNode, topologyNode, thermalNode, lineStopNode],
    'A current calculated line-stop empirical result is required.',
  );
  const resultGateNodes = [
    waitingGate(
      'SOURCE_BINDING_COMPATIBILITY',
      verticalResultNode,
      lineStopResultNode,
      'Result source bindings must be identical before composition.',
    ),
    waitingGate(
      'SUPPORT_SITE_CUSTODY_COMPATIBILITY',
      verticalResultNode,
      lineStopResultNode,
      'Overlapping support-site custody must agree before composition.',
    ),
    waitingGate(
      'FORCE_COMPONENT_OWNERSHIP',
      verticalResultNode,
      lineStopResultNode,
      'Vertical and line-stop force ownership must satisfy the qualified orthogonal rule.',
    ),
    waitingGate(
      'MOMENT_OWNERSHIP',
      verticalResultNode,
      lineStopResultNode,
      'Vertical moments remain vertical-result custody and line-stop moments must remain unowned.',
    ),
  ];
  const combinedNode = preparationReady
    ? waiting(
      'COMBINED_OPERATING_REACTION',
      'Preparation is ready; combined operating reaction awaits current result receipts and result-time compatibility checks.',
    )
    : blocked(
      'COMBINED_OPERATING_REACTION',
      'COMBINED_OPERATING_PREPARATION_BLOCKED',
      'Combined operating reaction cannot proceed until all preparation dependencies are satisfied.',
    );

  const nodes = [
    ...preparationNodes,
    verticalResultNode,
    lineStopResultNode,
    ...resultGateNodes,
    combinedNode,
  ];
  const base = {
    schema: NON_FEA_OPERATING_REACTION_DEPENDENCY_DAG_SCHEMA,
    state: preparationReady ? 'PREPARATION_READY' : 'BLOCKED',
    resultExecutionState: 'NOT_EXECUTED',
    commonInputSemanticHash,
    authorityRevisionVectorSemanticHash,
    topologyEligibilitySemanticHash: topologyEligibility.semanticHash,
    thermalFreeMovementSemanticHash: thermalFreeMovementBasis?.semanticHash || null,
    coordinateFrameSemanticHash,
    superpositionPolicySemanticHash,
    loadCases: {
      verticalLoadCaseId,
      lineStopLoadCaseId,
      outputLoadCaseId,
    },
    implementationSelection: {
      verticalImplementationId: VERTICAL_IMPLEMENTATION_ID,
      lineStopImplementationId: requiredLineStopImplementationId,
      combinedOperatingImplementationId: SUPERPOSITION_IMPLEMENTATION_ID,
      topologyRequirement:
        topologyEligibility.restraintNetworkRecommendation?.topologyRequirement || null,
    },
    nodes,
    edges: EDGES,
    blockers: nodes.flatMap((row) => row.blockers.map((item) => ({
      nodeId: row.nodeId,
      ...item,
    }))).sort(issueOrder),
    policy: {
      preparationOnly: true,
      resultCalculationAuthority: false,
      authorizationAuthority: false,
      executionAuthority: false,
      blindVectorAdditionPermitted: false,
      identicalSourceBindingsRequired: true,
      supportSiteCustodyCompatibilityRequired: true,
      orthogonalForceOwnershipRequired: true,
      lineStopMomentOwnershipPermitted: false,
      pressureCompatibilityIncluded: false,
      pressureStressIncluded: false,
      geometryMutationPermitted: false,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaOperatingReactionDependencyDag(value) {
  const errors = [];
  if (!isRecord(value)) {
    return deepFreeze({ ok: false, errors: ['Operating-reaction dependency DAG must be an object.'] });
  }
  if (value.schema !== NON_FEA_OPERATING_REACTION_DEPENDENCY_DAG_SCHEMA) {
    errors.push(`Expected ${NON_FEA_OPERATING_REACTION_DEPENDENCY_DAG_SCHEMA}.`);
  }
  if (!['PREPARATION_READY', 'BLOCKED'].includes(value.state)) {
    errors.push('Operating-reaction DAG state is invalid.');
  }
  if (value.resultExecutionState !== 'NOT_EXECUTED') {
    errors.push('Operating-reaction DAG cannot claim result execution.');
  }
  validateNodes(value.nodes, errors);
  validateEdges(value.edges, errors);
  if (!Array.isArray(value.blockers)) errors.push('Operating-reaction DAG blockers must be an array.');
  const preparation = (value.nodes || []).slice(0, 8);
  const expectedState = preparation.length === 8
    && preparation.every((row) => row?.state === 'SATISFIED')
    ? 'PREPARATION_READY'
    : 'BLOCKED';
  if (value.state !== expectedState) {
    errors.push('Operating-reaction DAG preparation state is inconsistent with its nodes.');
  }
  const policy = value.policy || {};
  if (policy.preparationOnly !== true
      || policy.resultCalculationAuthority !== false
      || policy.authorizationAuthority !== false
      || policy.executionAuthority !== false
      || policy.blindVectorAdditionPermitted !== false
      || policy.geometryMutationPermitted !== false) {
    errors.push('Operating-reaction DAG policy exceeds preparation authority.');
  }
  if (value.semanticHash !== semanticHash(withoutHash(value))) {
    errors.push('Operating-reaction DAG semantic hash is invalid.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function topologySelectionNode(receipt, requiredImplementationId) {
  const recommendation = receipt.restraintNetworkRecommendation || {};
  if (!requiredImplementationId) {
    return blocked(
      'TOPOLOGY_SELECTION',
      'RESTRAINT_NETWORK_TOPOLOGY_SELECTION_BLOCKED',
      'Topology did not resolve a required restraint-network implementation.',
      recommendation.blockers || [],
    );
  }
  const row = receipt.rows.find((item) => item.implementationId === requiredImplementationId);
  if (!row || row.topologyState !== 'TOPOLOGY_ELIGIBLE') {
    return blocked(
      'TOPOLOGY_SELECTION',
      'RESTRAINT_NETWORK_TOPOLOGY_OUTSIDE_DOMAIN',
      `${requiredImplementationId} is not topology-eligible for the current analysis region.`,
      row?.blockers || recommendation.blockers || [],
    );
  }
  return satisfied(
    'TOPOLOGY_SELECTION',
    `Topology requires ${requiredImplementationId}: ${recommendation.topologyRequirement}.`,
  );
}

function implementationNode(nodeId, receipt, implementationId, topologySelected = false) {
  const row = receipt.rows.find((item) => item.implementationId === implementationId) || null;
  if (!row) {
    return blocked(
      nodeId,
      'OPERATING_IMPLEMENTATION_NOT_REGISTERED',
      `${implementationId} is absent from the implementation registry.`,
      { implementationId },
    );
  }
  if (topologySelected && row.topologyState !== 'TOPOLOGY_ELIGIBLE') {
    return blocked(
      nodeId,
      'OPERATING_IMPLEMENTATION_TOPOLOGY_BLOCKED',
      `${implementationId} is outside the current topology domain.`,
      { implementationId, topologyState: row.topologyState },
    );
  }
  if (!['REGISTERED', 'INTRINSIC'].includes(row.runtimeState)) {
    return blocked(
      nodeId,
      'OPERATING_IMPLEMENTATION_NOT_REGISTERED',
      `${implementationId} is not registered for execution.`,
      { implementationId, runtimeState: row.runtimeState },
    );
  }
  if (!['QUALIFIED', 'QUALIFIED_RESTRICTED_DOMAIN'].includes(row.qualificationState)) {
    return blocked(
      nodeId,
      'OPERATING_IMPLEMENTATION_NOT_QUALIFIED',
      `${implementationId} is not qualified for execution.`,
      { implementationId, qualificationState: row.qualificationState },
    );
  }
  return satisfied(
    nodeId,
    `${implementationId} is registered and qualified for its declared domain.`,
  );
}

function thermalMovementNode(basis, loadCaseId) {
  if (!basis) {
    return blocked(
      'THERMAL_FREE_MOVEMENT',
      'OPERATING_THERMAL_FREE_MOVEMENT_REQUIRED',
      `Thermal free-movement basis is required for ${loadCaseId}.`,
    );
  }
  const row = basis.loadCases.find((item) => item.loadCaseId === loadCaseId) || null;
  if (!row) {
    return blocked(
      'THERMAL_FREE_MOVEMENT',
      'OPERATING_THERMAL_LOAD_CASE_MISSING',
      `Thermal free-movement basis does not contain ${loadCaseId}.`,
    );
  }
  if (row.state !== 'READY') {
    return blocked(
      'THERMAL_FREE_MOVEMENT',
      'OPERATING_THERMAL_LOAD_CASE_BLOCKED',
      `Thermal free movement for ${loadCaseId} is blocked.`,
      row.blockers || [],
    );
  }
  return satisfied(
    'THERMAL_FREE_MOVEMENT',
    `Thermal free movement for ${loadCaseId} is ready at ${basis.semanticHash}.`,
  );
}

function dependentResultNode(nodeId, dependencies, message) {
  return dependencies.every((row) => row.state === 'SATISFIED')
    ? waiting(nodeId, message)
    : blocked(nodeId, 'OPERATING_RESULT_DEPENDENCY_BLOCKED', message);
}

function waitingGate(nodeId, verticalResultNode, lineStopResultNode, message) {
  return [verticalResultNode, lineStopResultNode]
    .every((row) => row.state === 'WAITING_FOR_RESULT')
    ? waiting(nodeId, message)
    : blocked(nodeId, 'OPERATING_RESULT_GATE_DEPENDENCY_BLOCKED', message);
}

function satisfied(nodeId, message) {
  return node(nodeId, 'SATISFIED', message, []);
}
function waiting(nodeId, message) {
  return node(nodeId, 'WAITING_FOR_RESULT', message, []);
}
function blocked(nodeId, code, message, details = null) {
  return node(nodeId, 'BLOCKED', message, [issue(code, message, details)]);
}
function node(nodeId, state, message, blockers) {
  return deepFreeze({ nodeId, state, message, blockers });
}
function issue(code, message, details = null) {
  return deepFreeze({ code, message, details });
}
function edge(from, to) {
  return deepFreeze({ from, to, relation: 'REQUIRES' });
}

function validateNodes(nodes, errors) {
  if (!Array.isArray(nodes)) return errors.push('Operating-reaction DAG nodes must be an array.');
  const ids = nodes.map((row) => row?.nodeId);
  if (JSON.stringify(ids) !== JSON.stringify(NODE_IDS)) {
    errors.push('Operating-reaction DAG node registry is incomplete or out of order.');
  }
  nodes.forEach((row) => {
    if (!['SATISFIED', 'BLOCKED', 'WAITING_FOR_RESULT'].includes(row?.state)) {
      errors.push(`Operating-reaction DAG node ${row?.nodeId || 'UNKNOWN'} has invalid state.`);
    }
    if (!Array.isArray(row?.blockers)) {
      errors.push(`Operating-reaction DAG node ${row?.nodeId || 'UNKNOWN'} blockers must be an array.`);
    }
  });
}

function validateEdges(edges, errors) {
  if (!Array.isArray(edges)) return errors.push('Operating-reaction DAG edges must be an array.');
  const known = new Set(NODE_IDS);
  const identities = edges.map((row) => `${row?.from}|${row?.to}|${row?.relation}`);
  if (new Set(identities).size !== identities.length) {
    errors.push('Operating-reaction DAG edges must be unique.');
  }
  if (JSON.stringify(edges) !== JSON.stringify(EDGES)) {
    errors.push('Operating-reaction DAG edge registry is incomplete or out of order.');
  }
  edges.forEach((row) => {
    if (!known.has(row?.from) || !known.has(row?.to)) {
      errors.push('Operating-reaction DAG edge references an unknown node.');
    }
    if (row?.relation !== 'REQUIRES') {
      errors.push('Operating-reaction DAG edge relation must be REQUIRES.');
    }
  });
}

function requireTopologyEligibility(value) {
  const validation = validateNonFeaImplementationTopologyEligibility(value);
  if (!validation.ok) {
    throw new TypeError(`Invalid topology eligibility receipt: ${validation.errors.join(' ')}`);
  }
  return value;
}
function requireThermalBasis(value) {
  const validation = validateNonFeaThermalFreeMovementBasis(value);
  if (!validation.ok) {
    throw new TypeError(`Invalid thermal free-movement basis: ${validation.errors.join(' ')}`);
  }
  return value;
}
function requiredHash(value, field) {
  if (typeof value !== 'string' || !value.includes(':')) {
    throw new TypeError(`${field} must be a namespaced semantic hash.`);
  }
  return value;
}
function nullableHash(value, field) {
  if (value === null || value === undefined || value === '') return null;
  return requiredHash(value, field);
}
function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}
function enumValue(value, values, field) {
  if (!values.includes(value)) {
    throw new TypeError(`${field} must be one of ${values.join(', ')}.`);
  }
  return value;
}
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function withoutHash(value) {
  const copy = structuredClone(value);
  delete copy.semanticHash;
  return copy;
}
function issueOrder(left, right) {
  return `${left.nodeId}|${left.code}`.localeCompare(`${right.nodeId}|${right.code}`);
}
function edgeOrder(left, right) {
  return `${left.from}|${left.to}`.localeCompare(`${right.from}|${right.to}`);
}
