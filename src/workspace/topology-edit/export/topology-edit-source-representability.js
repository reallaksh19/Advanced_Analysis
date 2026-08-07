import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_SOURCE_REPRESENTABILITY_SCHEMA =
  'TopologyEditSourceRepresentability.v1';

export const SOURCE_REPRESENTABILITY = Object.freeze({
  EXACT: 'EXACT',
  INTERNAL_METADATA: 'INTERNAL_METADATA',
  PRESERVED_OPAQUE: 'PRESERVED_OPAQUE',
  LOSSY_USER_APPROVED: 'LOSSY_USER_APPROVED',
  BLOCKING: 'BLOCKING',
});

export const SOURCE_CAPABILITY = Object.freeze({
  TOPOLOGY_IDENTITY: 'TOPOLOGY_IDENTITY',
  CONNECTIVITY: 'CONNECTIVITY',
  COORDINATES_MM: 'COORDINATES_MM',
  ELEMENT_TYPE: 'ELEMENT_TYPE',
  PRIMARY_SIZE_MM: 'PRIMARY_SIZE_MM',
  SECONDARY_SIZE_MM: 'SECONDARY_SIZE_MM',
  REDUCER_ORIENTATION: 'REDUCER_ORIENTATION',
  COMPONENT_LENGTH_MM: 'COMPONENT_LENGTH_MM',
  CATALOGUE_BINDING: 'CATALOGUE_BINDING',
  VALVE_SUBTYPE: 'VALVE_SUBTYPE',
  JUNCTION_BRANCH_RELATION: 'JUNCTION_BRANCH_RELATION',
  SUPPORT_ATTACHMENT: 'SUPPORT_ATTACHMENT',
  SUPPORT_GAP_MM: 'SUPPORT_GAP_MM',
  SUPPORT_TRAVEL_MM: 'SUPPORT_TRAVEL_MM',
  NATIVE_IDENTITY: 'NATIVE_IDENTITY',
  SOURCE_RECORD_INSERTION: 'SOURCE_RECORD_INSERTION',
  OPAQUE_SOURCE_FIELDS: 'OPAQUE_SOURCE_FIELDS',
});

const CLASSIFICATIONS = new Set(Object.values(SOURCE_REPRESENTABILITY));

export function createTopologyEditSourceCapabilityProfile(input = {}) {
  const family = requiredText(input.family, 'family').toUpperCase();
  const capabilities = {};
  for (const [key, value] of Object.entries(input.capabilities ?? {})) {
    if (!Object.values(SOURCE_CAPABILITY).includes(key)) {
      throw new RangeError(`TopologyEditSourceRepresentability: unsupported capability ${key}.`);
    }
    const classification = String(value ?? '').trim().toUpperCase();
    if (!CLASSIFICATIONS.has(classification)) {
      throw new RangeError(`TopologyEditSourceRepresentability: unsupported classification ${classification}.`);
    }
    capabilities[key] = classification;
  }
  const material = {
    family,
    version: requiredText(input.version ?? '1', 'version'),
    capabilities,
  };
  return deepFreeze({ ...material, profileHash: semanticHash(material) });
}

export function buildTopologyEditSourceRepresentability(input = {}) {
  const topology = assertCanonical(input.canonicalTopology);
  const profile = assertProfile(input.profile);
  const facts = engineeringFacts(topology, input.dataset);
  const rows = facts.map((fact) => classifyFact(fact, profile)).sort(compareRows);
  const blockers = rows.filter((row) => row.classification === SOURCE_REPRESENTABILITY.BLOCKING);
  const material = {
    schema: TOPOLOGY_EDIT_SOURCE_REPRESENTABILITY_SCHEMA,
    canonicalTopologyHash: topology.canonicalTopologyHash,
    sourceHash: topology.sourceHash ?? null,
    profileHash: profile.profileHash,
    family: profile.family,
    factCount: rows.length,
    blockingCount: blockers.length,
    rows,
  };
  return deepFreeze({
    ...material,
    reportHash: semanticHash(material),
    status: blockers.length ? 'BLOCKED' : 'REPRESENTABLE',
    blockers,
  });
}

export function assertTopologyEditSourceRepresentability(value) {
  if (value?.schema !== TOPOLOGY_EDIT_SOURCE_REPRESENTABILITY_SCHEMA) {
    throw new TypeError(`Representability report must use ${TOPOLOGY_EDIT_SOURCE_REPRESENTABILITY_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.reportHash;
  delete material.status;
  delete material.blockers;
  if (semanticHash(material) !== value.reportHash) {
    throw new Error('TopologyEditSourceRepresentability: report hash mismatch.');
  }
  const blockers = value.rows.filter((row) => row.classification === SOURCE_REPRESENTABILITY.BLOCKING);
  if (blockers.length !== value.blockingCount
    || value.status !== (blockers.length ? 'BLOCKED' : 'REPRESENTABLE')
    || semanticHash(blockers) !== semanticHash(value.blockers)) {
    throw new Error('TopologyEditSourceRepresentability: blocker authority mismatch.');
  }
  return value;
}

function engineeringFacts(topology, dataset) {
  const facts = [];
  for (const node of topology.nodes ?? []) {
    add(facts, node.id, 'identity', SOURCE_CAPABILITY.TOPOLOGY_IDENTITY, node.id);
    add(facts, node.id, 'positionMm', SOURCE_CAPABILITY.COORDINATES_MM, node.position);
  }
  for (const edge of topology.edges ?? []) {
    add(facts, edge.id, 'identity', SOURCE_CAPABILITY.TOPOLOGY_IDENTITY, edge.id);
    add(facts, edge.id, 'connectivity', SOURCE_CAPABILITY.CONNECTIVITY, [edge.fromNodeId, edge.toNodeId]);
    add(facts, edge.id, 'elementType', SOURCE_CAPABILITY.ELEMENT_TYPE, edge.entityType);
    addIf(facts, edge.id, 'primarySizeMm', SOURCE_CAPABILITY.PRIMARY_SIZE_MM,
      edge.diameterMm ?? edge.nominalDiameterMm ?? edge.outsideDiameterMm);
    addIf(facts, edge.id, 'secondarySizeMm', SOURCE_CAPABILITY.SECONDARY_SIZE_MM,
      edge.secondaryNominalSizeMm ?? edge.secondaryDiameterMm);
    addIf(facts, edge.id, 'reducerOrientation', SOURCE_CAPABILITY.REDUCER_ORIENTATION,
      edge.reducerOrientation);
    addIf(facts, edge.id, 'componentLengthMm', SOURCE_CAPABILITY.COMPONENT_LENGTH_MM,
      edge.componentLengthMm);
    addIf(facts, edge.id, 'valveSubtype', SOURCE_CAPABILITY.VALVE_SUBTYPE,
      String(edge.entityType ?? '').toUpperCase() === 'VALVE' ? edge.valveType : null);
    addCatalogue(facts, edge.id, edge);
    if (String(edge.identityKind ?? '').toUpperCase() === 'NATIVE_COMMAND') {
      add(facts, edge.id, 'nativeIdentity', SOURCE_CAPABILITY.NATIVE_IDENTITY, nativeIdentity(edge));
      if (String(edge.topologyOperation ?? '').toUpperCase() === 'INSERT_PIPE_SEGMENT') {
        add(facts, edge.id, 'sourceRecordInsertion', SOURCE_CAPABILITY.SOURCE_RECORD_INSERTION, {
          componentKey: edge.componentKey ?? null,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
        });
      }
    }
  }
  for (const junction of topology.junctions ?? []) {
    add(facts, junction.id, 'identity', SOURCE_CAPABILITY.TOPOLOGY_IDENTITY, junction.id);
    add(facts, junction.id, 'connectivity', SOURCE_CAPABILITY.CONNECTIVITY, junction.nodeIds ?? []);
    add(facts, junction.id, 'elementType', SOURCE_CAPABILITY.ELEMENT_TYPE, junction.entityType ?? 'JUNCTION');
    addIf(facts, junction.id, 'branchRelation', SOURCE_CAPABILITY.JUNCTION_BRANCH_RELATION,
      junction.branchRelation);
    addCatalogue(facts, junction.id, junction);
  }
  for (const support of topology.supports ?? []) {
    add(facts, support.id, 'identity', SOURCE_CAPABILITY.TOPOLOGY_IDENTITY, support.id);
    add(facts, support.id, 'attachment', SOURCE_CAPABILITY.SUPPORT_ATTACHMENT,
      { nodeId: support.nodeId, hostEntityId: support.hostEntityId, resolved: support.resolved });
    addIf(facts, support.id, 'gapMm', SOURCE_CAPABILITY.SUPPORT_GAP_MM,
      support.restraint?.gapMm ?? support.gapMm);
    addIf(facts, support.id, 'travelMm', SOURCE_CAPABILITY.SUPPORT_TRAVEL_MM,
      support.restraint?.travelMm ?? support.travelMm);
  }
  const opaque = opaqueSourceEvidence(dataset);
  if (opaque) add(facts, 'source', 'opaqueSourceFields', SOURCE_CAPABILITY.OPAQUE_SOURCE_FIELDS, opaque);
  return facts;
}

function classifyFact(fact, profile) {
  const classification = fact.blockingReason
    ? SOURCE_REPRESENTABILITY.BLOCKING
    : profile.capabilities[fact.capability] ?? SOURCE_REPRESENTABILITY.BLOCKING;
  const material = {
    canonicalId: fact.canonicalId,
    property: fact.property,
    capability: fact.capability,
    classification,
    valueHash: semanticHash(fact.value),
    blockingReason: fact.blockingReason ?? null,
  };
  return deepFreeze({ ...material, rowHash: semanticHash(material) });
}
function addCatalogue(rows, canonicalId, record) {
  const binding = record?.catalogueBinding;
  if (!binding || typeof binding !== 'object' || !Object.keys(binding).length) return;
  const exact = binding.catalogueHash && binding.sourceHash && binding.recordId
    && binding.recordHash && binding.sourceReference;
  add(rows, canonicalId, 'catalogueBinding', SOURCE_CAPABILITY.CATALOGUE_BINDING, binding,
    exact ? null : 'CATALOGUE_CUSTODY_INCOMPLETE');
}
function nativeIdentity(record) {
  return {
    id: record.id,
    componentKey: record.componentKey ?? null,
    fromNodeId: record.fromNodeId ?? null,
    toNodeId: record.toNodeId ?? null,
  };
}
function opaqueSourceEvidence(dataset) {
  const rows = (dataset?.entities ?? []).map((entity) => ({
    entityId: entity.entityId,
    sourceEntityId: entity.sourceEntityId ?? null,
    sourcePath: entity.sourcePath ?? null,
    sourceAttributes: entity.properties?.sourceAttributes ?? {},
    enrichedAttributes: entity.properties?.enrichedAttributes ?? {},
    nativeParams: entity.properties?.nativeParams ?? {},
  })).filter((row) => Object.keys(row.sourceAttributes).length
    || Object.keys(row.enrichedAttributes).length || Object.keys(row.nativeParams).length);
  return rows.length ? rows : null;
}
function add(rows, canonicalId, property, capability, value, blockingReason = null) {
  rows.push({ canonicalId, property, capability, value, blockingReason });
}
function addIf(rows, canonicalId, property, capability, value) {
  if (value !== undefined && value !== null && value !== '') add(rows, canonicalId, property, capability, value);
}
function compareRows(left, right) {
  return left.canonicalId.localeCompare(right.canonicalId)
    || left.property.localeCompare(right.property)
    || left.capability.localeCompare(right.capability);
}
function assertCanonical(value) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    throw new TypeError('TopologyEditSourceRepresentability: canonical topology authority is required.');
  }
  return value;
}
function assertProfile(value) {
  if (!value?.profileHash || semanticHash({ family: value.family, version: value.version, capabilities: value.capabilities }) !== value.profileHash) {
    throw new TypeError('TopologyEditSourceRepresentability: valid capability profile is required.');
  }
  return value;
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`TopologyEditSourceRepresentability: ${label} is required.`);
  return text;
}
