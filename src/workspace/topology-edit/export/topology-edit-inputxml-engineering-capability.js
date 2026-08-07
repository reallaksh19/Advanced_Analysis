import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import {
  createTopologyEditSourceCapabilityProfile,
  SOURCE_CAPABILITY,
  SOURCE_REPRESENTABILITY,
} from './topology-edit-source-representability.js';

export const TOPOLOGY_EDIT_INPUTXML_ENGINEERING_CAPABILITY_SCHEMA =
  'TopologyEditInputXmlEngineeringCapability.v1';

export const INPUTXML_ENGINEERING_BLOCKER = Object.freeze({
  VALVE_SUBTYPE: 'INPUTXML_GENERIC_RIGID_VALVE_HAS_NO_SUBTYPE',
  CATALOGUE_BINDING: 'INPUTXML_CATALOGUE_BINDING_NOT_ROUNDTRIPPABLE',
  JUNCTION_BRANCH_RELATION: 'INPUTXML_TWO_NODE_ELEMENT_HAS_NO_BRANCH_RELATION',
});

export function createTopologyEditQualifiedInputXmlProfile() {
  return createTopologyEditSourceCapabilityProfile({
    family: 'INPUT_XML',
    version: 'TopologyEditInputXmlWriteback.v1',
    capabilities: {
      [SOURCE_CAPABILITY.TOPOLOGY_IDENTITY]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.CONNECTIVITY]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.COORDINATES_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.ELEMENT_TYPE]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.PRIMARY_SIZE_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.SECONDARY_SIZE_MM]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.REDUCER_ORIENTATION]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.COMPONENT_LENGTH_MM]: SOURCE_REPRESENTABILITY.EXACT,
      [SOURCE_CAPABILITY.CATALOGUE_BINDING]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.VALVE_SUBTYPE]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.JUNCTION_BRANCH_RELATION]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.SUPPORT_ATTACHMENT]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.SUPPORT_GAP_MM]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.SUPPORT_TRAVEL_MM]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.NATIVE_IDENTITY]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.SOURCE_RECORD_INSERTION]: SOURCE_REPRESENTABILITY.BLOCKING,
      [SOURCE_CAPABILITY.OPAQUE_SOURCE_FIELDS]: SOURCE_REPRESENTABILITY.PRESERVED_OPAQUE,
    },
  });
}

export function assessTopologyEditInputXmlEngineeringDelta({
  baseCanonicalTopology: base,
  canonicalTopology: edited,
} = {}) {
  assertCanonical(base, 'baseCanonicalTopology');
  assertCanonical(edited, 'canonicalTopology');
  const blockers = [];
  const baseEdges = new Map(base.edges.map((row) => [row.id, row]));
  for (const edge of edited.edges) {
    const prior = baseEdges.get(edge.id);
    if (!prior || semanticHash(prior) === semanticHash(edge)) continue;
    if (token(prior.entityType) !== 'VALVE' || token(edge.entityType) !== 'VALVE') continue;
    if (changed(prior.valveType, edge.valveType)) {
      blockers.push(blocker(
        edge.id,
        'valveSubtype',
        SOURCE_CAPABILITY.VALVE_SUBTYPE,
        INPUTXML_ENGINEERING_BLOCKER.VALVE_SUBTYPE,
      ));
    }
    if (changed(prior.catalogueBinding, edge.catalogueBinding)) {
      blockers.push(blocker(
        edge.id,
        'catalogueBinding',
        SOURCE_CAPABILITY.CATALOGUE_BINDING,
        INPUTXML_ENGINEERING_BLOCKER.CATALOGUE_BINDING,
      ));
    }
  }
  const baseJunctions = new Map((base.junctions ?? []).map((row) => [row.id, row]));
  for (const junction of edited.junctions ?? []) {
    const prior = baseJunctions.get(junction.id);
    if (!prior || !changed(prior.branchRelation, junction.branchRelation)) continue;
    blockers.push(blocker(
      junction.id,
      'branchRelation',
      SOURCE_CAPABILITY.JUNCTION_BRANCH_RELATION,
      INPUTXML_ENGINEERING_BLOCKER.JUNCTION_BRANCH_RELATION,
    ));
  }
  blockers.sort((left, right) => left.canonicalId.localeCompare(right.canonicalId)
    || left.property.localeCompare(right.property));
  const material = {
    schema: TOPOLOGY_EDIT_INPUTXML_ENGINEERING_CAPABILITY_SCHEMA,
    baseCanonicalTopologyHash: base.canonicalTopologyHash,
    canonicalTopologyHash: edited.canonicalTopologyHash,
    blockerCount: blockers.length,
    blockers,
  };
  return deepFreeze({
    ...material,
    status: blockers.length ? 'BLOCKED' : 'REPRESENTABLE',
    capabilityHash: semanticHash(material),
  });
}

export function assertTopologyEditInputXmlEngineeringCapability(value) {
  if (value?.schema !== TOPOLOGY_EDIT_INPUTXML_ENGINEERING_CAPABILITY_SCHEMA) {
    throw new TypeError(`InputXML engineering capability must use ${TOPOLOGY_EDIT_INPUTXML_ENGINEERING_CAPABILITY_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.status;
  delete material.capabilityHash;
  if (semanticHash(material) !== value.capabilityHash
    || value.blockerCount !== value.blockers.length
    || value.status !== (value.blockerCount ? 'BLOCKED' : 'REPRESENTABLE')) {
    throw new Error('InputXML engineering capability: authority mismatch.');
  }
  return value;
}

function blocker(canonicalId, property, capability, code) {
  const material = {
    canonicalId,
    property,
    capability,
    classification: SOURCE_REPRESENTABILITY.BLOCKING,
    code,
  };
  return deepFreeze({ ...material, blockerHash: semanticHash(material) });
}
function changed(left, right) { return semanticHash(left ?? null) !== semanticHash(right ?? null); }
function token(value) { return String(value ?? '').trim().toUpperCase(); }
function assertCanonical(value, label) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new TypeError(`InputXML engineering capability requires ${label}.`);
  }
}
