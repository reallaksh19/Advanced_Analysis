import { requireMaterialResolutionResult } from '../linear-fea-material/index.js';
import { requirePipeSectionResolution } from '../linear-fea-section/index.js';
import {
  FRAME_LOCAL_AXIS_RESULT_SCHEMA,
  requireFrameLocalAxisProfile,
} from '../centerline-beam-fea/local-axis-contract.js';
import { CONSTRAINT_DOFS } from '../linear-fea-contract/model-schema.js';
import {
  CONSTRAINT_DECLARATION_KINDS,
  ELEMENT_BINDING_KEYS,
  ELEMENT_ENDS,
  NODAL_RESTRAINT_BEHAVIORS,
  NODE_BINDING_KEYS,
  fail,
  requireArray,
  requireExactKeys,
  requireFinite,
  requireHash,
  requireIdentity,
  requireRecord,
  requireSourceIdentity,
} from './model-compiler-contract.js';

const CONDITIONED_TOPOLOGY_SCHEMA = 'canonical-geometry-v1';
const CANONICAL_LENGTH_UNIT = 'm';

const TOPOLOGY_CODE = 'MODEL_COMPILER_TOPOLOGY_INVALID';
const BINDING_CODE = 'MODEL_COMPILER_BINDING_INVALID';
const DECLARATION_CODE = 'MODEL_COMPILER_CONSTRAINT_DECLARATION_INVALID';

/**
 * Accept the B-1 conditioning result exactly as `conditionGeometry` returns it.
 *
 * The compiler does not convert units. `fea-linear-units/v1` is metre-based, so
 * conditioned geometry carrying any other unit is rejected rather than scaled:
 * unit conversion is a separate authority and a silent scale factor is the
 * archetypal hidden numerical policy.
 *
 * @param {{geometry:object, semanticHash:string, report?:object}} conditioned B-1 result.
 * @returns {{nodes:Map<string,object>, spans:object[], conditionedTopologyHash:string}}
 */
export function requireConditionedTopology(conditioned) {
  requireRecord(conditioned, 'conditionedTopology', TOPOLOGY_CODE);
  const hash = requireHash(
    conditioned.semanticHash,
    'conditionedTopology.semanticHash',
    TOPOLOGY_CODE,
  );
  const geometry = requireRecord(conditioned.geometry, 'conditionedTopology.geometry', TOPOLOGY_CODE);
  if (geometry.schemaVersion !== CONDITIONED_TOPOLOGY_SCHEMA) {
    fail(
      `conditionedTopology.geometry.schemaVersion must be ${CONDITIONED_TOPOLOGY_SCHEMA}.`,
      TOPOLOGY_CODE,
    );
  }
  if (geometry.unit !== CANONICAL_LENGTH_UNIT) {
    fail(
      'conditionedTopology.geometry.unit must already be metres; this compiler does not convert units.',
      'MODEL_COMPILER_UNIT_NOT_CANONICAL',
    );
  }
  requireArray(geometry.nodes, 'conditionedTopology.geometry.nodes', TOPOLOGY_CODE);
  requireArray(geometry.segments, 'conditionedTopology.geometry.segments', TOPOLOGY_CODE);

  const nodes = new Map();
  geometry.nodes.forEach((node, index) => {
    const field = `conditionedTopology.geometry.nodes[${index}]`;
    requireRecord(node, field, TOPOLOGY_CODE);
    const id = requireSourceIdentity(node.id, `${field}.id`, TOPOLOGY_CODE);
    if (nodes.has(id)) fail(`${field}.id duplicates ${id}.`, 'MODEL_COMPILER_TOPOLOGY_DUPLICATE_NODE');
    nodes.set(id, {
      id,
      x: requireFinite(node.x, `${field}.x`, TOPOLOGY_CODE),
      y: requireFinite(node.y, `${field}.y`, TOPOLOGY_CODE),
      z: requireFinite(node.z, `${field}.z`, TOPOLOGY_CODE),
      sourceComponentUid: typeof node.sourceComponentUid === 'string' && node.sourceComponentUid.length > 0
        ? node.sourceComponentUid
        : null,
      creationBasis: creationBasisOf(node),
    });
  });

  const spans = geometry.segments.map((segment, index) => {
    const field = `conditionedTopology.geometry.segments[${index}]`;
    requireRecord(segment, field, TOPOLOGY_CODE);
    const id = requireSourceIdentity(segment.id, `${field}.id`, TOPOLOGY_CODE);
    const startNodeId = requireSourceIdentity(segment.startNodeId, `${field}.startNodeId`, TOPOLOGY_CODE);
    const endNodeId = requireSourceIdentity(segment.endNodeId, `${field}.endNodeId`, TOPOLOGY_CODE);
    if (!nodes.has(startNodeId) || !nodes.has(endNodeId)) {
      fail(`${field} references a node that is absent from the conditioned topology.`, TOPOLOGY_CODE);
    }
    if (startNodeId === endNodeId) {
      fail(
        `${field} is a zero-length analytical link; only an explicit rigid-link or constraint entity may be zero length.`,
        'MODEL_COMPILER_ZERO_LENGTH_LINK_PROHIBITED',
      );
    }
    return { id, startNodeId, endNodeId, sourceComponentUid: segment.sourceComponentUid ?? null };
  });

  const spanIds = new Set();
  for (const span of spans) {
    if (spanIds.has(span.id)) {
      fail(`conditionedTopology.geometry.segments duplicates ${span.id}.`, 'MODEL_COMPILER_TOPOLOGY_DUPLICATE_SPAN');
    }
    spanIds.add(span.id);
  }

  return { nodes, spans, conditionedTopologyHash: hash };
}

/**
 * Classify why a conditioned node exists, using only the evidence B-1 already
 * attached to it. Nothing is guessed: an unrecognised tag combination is a
 * source endpoint by construction of canonical geometry, and the raw tags stay
 * available as ancestry.
 */
function creationBasisOf(node) {
  const meta = node.meta && typeof node.meta === 'object' ? node.meta : {};
  if (typeof meta.attachmentPointId === 'string' && meta.attachmentPointId.length > 0) {
    return 'SEEDED_ATTACHMENT_POINT';
  }
  if (meta.spanSeeded === true) return 'SEEDED_SPAN_SUBDIVISION';
  if (typeof meta.bendChordOf === 'string' && meta.bendChordOf.length > 0) {
    return 'SEEDED_BEND_CHORD';
  }
  return 'SOURCE_ENDPOINT';
}

function requireUniqueKeyed(entries, field, keyOf, duplicateCode) {
  const index = new Map();
  entries.forEach((entry, position) => {
    const key = keyOf(entry, position);
    if (index.has(key)) {
      fail(`${field} declares ${key} more than once.`, duplicateCode);
    }
    index.set(key, entry);
  });
  return index;
}

export function requireNodeBindings(bindings, topology) {
  requireArray(bindings, 'nodeBindings', BINDING_CODE);
  const accepted = bindings.map((binding, index) => {
    const field = `nodeBindings[${index}]`;
    requireExactKeys(binding, NODE_BINDING_KEYS, field, BINDING_CODE);
    const topologyNodeId = requireSourceIdentity(binding.topologyNodeId, `${field}.topologyNodeId`, BINDING_CODE);
    if (!topology.nodes.has(topologyNodeId)) {
      fail(`${field}.topologyNodeId is absent from the conditioned topology.`, 'MODEL_COMPILER_NODE_BINDING_UNKNOWN');
    }
    return {
      nodeId: requireIdentity(binding.nodeId, `${field}.nodeId`, BINDING_CODE),
      conditionedNodeId: requireIdentity(binding.conditionedNodeId, `${field}.conditionedNodeId`, BINDING_CODE),
      topologyNodeId,
    };
  });
  requireUniqueKeyed(accepted, 'nodeBindings', (entry) => entry.nodeId, 'MODEL_COMPILER_NODE_BINDING_AMBIGUOUS');
  const byTopologyId = requireUniqueKeyed(
    accepted,
    'nodeBindings',
    (entry) => entry.topologyNodeId,
    'MODEL_COMPILER_NODE_BINDING_AMBIGUOUS',
  );
  for (const topologyNodeId of topology.nodes.keys()) {
    if (!byTopologyId.has(topologyNodeId)) {
      fail(
        `Conditioned node ${topologyNodeId} has no kernel node binding.`,
        'MODEL_COMPILER_NODE_BINDING_MISSING',
      );
    }
  }
  return byTopologyId;
}

export function requireElementBindings(bindings, topology) {
  requireArray(bindings, 'elementBindings', BINDING_CODE);
  const accepted = bindings.map((binding, index) => {
    const field = `elementBindings[${index}]`;
    requireExactKeys(binding, ELEMENT_BINDING_KEYS, field, BINDING_CODE);
    const topologySegmentId = requireSourceIdentity(
      binding.topologySegmentId,
      `${field}.topologySegmentId`,
      BINDING_CODE,
    );
    return {
      elementId: requireIdentity(binding.elementId, `${field}.elementId`, BINDING_CODE),
      conditionedSegmentId: requireIdentity(
        binding.conditionedSegmentId,
        `${field}.conditionedSegmentId`,
        BINDING_CODE,
      ),
      topologySegmentId,
      materialStateId: requireIdentity(binding.materialStateId, `${field}.materialStateId`, BINDING_CODE),
      sectionStateId: requireIdentity(binding.sectionStateId, `${field}.sectionStateId`, BINDING_CODE),
      formulationId: requireIdentity(binding.formulationId, `${field}.formulationId`, BINDING_CODE),
      localAxisEvidenceIdentity: requireIdentity(
        binding.localAxisEvidenceIdentity,
        `${field}.localAxisEvidenceIdentity`,
        BINDING_CODE,
      ),
      sourceComponentId: requireSourceIdentity(
        binding.sourceComponentId,
        `${field}.sourceComponentId`,
        BINDING_CODE,
      ),
    };
  });
  requireUniqueKeyed(accepted, 'elementBindings', (entry) => entry.elementId, 'MODEL_COMPILER_ELEMENT_BINDING_AMBIGUOUS');
  const bySpanId = requireUniqueKeyed(
    accepted,
    'elementBindings',
    (entry) => entry.topologySegmentId,
    'MODEL_COMPILER_SPAN_BINDING_AMBIGUOUS',
  );
  const spanIds = new Set(topology.spans.map((span) => span.id));
  for (const binding of accepted) {
    if (!spanIds.has(binding.topologySegmentId)) {
      fail(
        `elementBindings references span ${binding.topologySegmentId}, which is absent from the conditioned topology.`,
        'MODEL_COMPILER_SPAN_BINDING_UNKNOWN',
      );
    }
  }
  for (const span of topology.spans) {
    if (!bySpanId.has(span.id)) {
      fail(
        `Element span ${span.id} has no mechanical binding.`,
        'MODEL_COMPILER_SPAN_BINDING_MISSING',
      );
    }
  }
  return bySpanId;
}

export function requireMaterialStateMap(results) {
  requireArray(results, 'materialResolutions', 'MODEL_COMPILER_MATERIAL_RESOLUTION_INVALID');
  const map = new Map();
  results.forEach((result) => {
    const accepted = requireMaterialResolutionResult(result);
    const id = accepted.materialState.materialStateId;
    if (map.has(id)) {
      fail(
        `materialResolutions declares material state ${id} more than once.`,
        'MODEL_COMPILER_MATERIAL_BINDING_AMBIGUOUS',
      );
    }
    map.set(id, accepted);
  });
  return map;
}

export function requireSectionStateMap(results) {
  requireArray(results, 'sectionResolutions', 'MODEL_COMPILER_SECTION_RESOLUTION_INVALID');
  const map = new Map();
  results.forEach((result) => {
    const accepted = requirePipeSectionResolution(result);
    const id = accepted.sectionState.sectionStateId;
    if (map.has(id)) {
      fail(
        `sectionResolutions declares section state ${id} more than once.`,
        'MODEL_COMPILER_SECTION_BINDING_AMBIGUOUS',
      );
    }
    map.set(id, accepted);
  });
  return map;
}

export function requireLocalAxisMap(entries, axisProfile) {
  const profile = requireFrameLocalAxisProfile(axisProfile);
  requireArray(entries, 'localAxisResults', 'MODEL_COMPILER_AXIS_RESULT_INVALID');
  const map = new Map();
  entries.forEach((entry, index) => {
    const field = `localAxisResults[${index}]`;
    requireExactKeys(entry, ['evidenceIdentity', 'result'], field, 'MODEL_COMPILER_AXIS_RESULT_INVALID');
    const evidenceIdentity = requireIdentity(
      entry.evidenceIdentity,
      `${field}.evidenceIdentity`,
      'MODEL_COMPILER_AXIS_RESULT_INVALID',
    );
    const result = requireRecord(entry.result, `${field}.result`, 'MODEL_COMPILER_AXIS_RESULT_INVALID');
    if (result.schema !== FRAME_LOCAL_AXIS_RESULT_SCHEMA) {
      fail(`${field}.result.schema is unsupported.`, 'MODEL_COMPILER_AXIS_RESULT_INVALID');
    }
    if (result.profileSemanticHash !== profile.semanticHash) {
      fail(
        `${field}.result was produced under a different local-axis profile.`,
        'MODEL_COMPILER_AXIS_PROFILE_MISMATCH',
      );
    }
    requireHash(result.semanticHash, `${field}.result.semanticHash`, 'MODEL_COMPILER_AXIS_RESULT_INVALID');
    if (map.has(evidenceIdentity)) {
      fail(
        `localAxisResults declares ${evidenceIdentity} more than once.`,
        'MODEL_COMPILER_AXIS_BINDING_AMBIGUOUS',
      );
    }
    map.set(evidenceIdentity, result);
  });
  return { profile, map };
}

/**
 * Accept release, partial-release-spring, restraint and rigid declarations
 * without deciding anything about them yet. Section 5.3 requires conflicting
 * definitions to block compilation, so every declaration is carried through to
 * the conflict pass exactly as written, including the kinds this contract
 * version cannot represent.
 */
export function requireConstraintDeclarations(declarations) {
  requireArray(declarations, 'constraintDeclarations', DECLARATION_CODE);
  const accepted = declarations.map((declaration, index) => {
    const field = `constraintDeclarations[${index}]`;
    requireRecord(declaration, field, DECLARATION_CODE);
    if (!CONSTRAINT_DECLARATION_KINDS.includes(declaration.kind)) {
      fail(`${field}.kind is unsupported.`, DECLARATION_CODE);
    }
    const declarationId = requireIdentity(declaration.declarationId, `${field}.declarationId`, DECLARATION_CODE);
    const dof = declaration.dof;
    if (!CONSTRAINT_DOFS.includes(dof)) fail(`${field}.dof is unsupported.`, DECLARATION_CODE);

    if (declaration.kind === 'NODAL_RESTRAINT') {
      requireExactKeys(declaration, ['declarationId', 'kind', 'nodeId', 'dof', 'behavior'], field, DECLARATION_CODE);
      if (!NODAL_RESTRAINT_BEHAVIORS.includes(declaration.behavior)) {
        fail(`${field}.behavior is unsupported.`, DECLARATION_CODE);
      }
      return {
        declarationId,
        kind: declaration.kind,
        nodeId: requireIdentity(declaration.nodeId, `${field}.nodeId`, DECLARATION_CODE),
        dof,
        behavior: declaration.behavior,
        stiffness: null,
      };
    }

    if (declaration.kind === 'PARTIAL_RELEASE_SPRING') {
      requireExactKeys(declaration, ['declarationId', 'kind', 'nodeId', 'dof', 'stiffness'], field, DECLARATION_CODE);
      const stiffness = requireFinite(declaration.stiffness, `${field}.stiffness`, DECLARATION_CODE);
      if (!(stiffness > 0)) {
        fail(`${field}.stiffness must be a positive finite spring rate.`, 'MODEL_COMPILER_PARTIAL_RELEASE_INVALID');
      }
      return {
        declarationId,
        kind: declaration.kind,
        nodeId: requireIdentity(declaration.nodeId, `${field}.nodeId`, DECLARATION_CODE),
        dof,
        behavior: 'LINEAR_SPRING',
        stiffness,
      };
    }

    if (declaration.kind === 'END_RELEASE') {
      requireExactKeys(declaration, ['declarationId', 'kind', 'elementId', 'end', 'dof'], field, DECLARATION_CODE);
      if (!ELEMENT_ENDS.includes(declaration.end)) fail(`${field}.end is unsupported.`, DECLARATION_CODE);
      return {
        declarationId,
        kind: declaration.kind,
        elementId: requireIdentity(declaration.elementId, `${field}.elementId`, DECLARATION_CODE),
        end: declaration.end,
        dof,
      };
    }

    requireExactKeys(
      declaration,
      ['declarationId', 'kind', 'nodeId', 'dof', 'attachedElementId'],
      field,
      DECLARATION_CODE,
    );
    return {
      declarationId,
      kind: declaration.kind,
      nodeId: requireIdentity(declaration.nodeId, `${field}.nodeId`, DECLARATION_CODE),
      dof,
      attachedElementId: requireIdentity(
        declaration.attachedElementId,
        `${field}.attachedElementId`,
        DECLARATION_CODE,
      ),
    };
  });
  requireUniqueKeyed(
    accepted,
    'constraintDeclarations',
    (entry) => entry.declarationId,
    'MODEL_COMPILER_CONSTRAINT_DECLARATION_AMBIGUOUS',
  );
  return accepted;
}
