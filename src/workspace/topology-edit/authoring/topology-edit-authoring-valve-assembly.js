import {
  deepFreeze,
  semanticHash,
} from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditAuthoringSession,
} from './topology-edit-authoring-session.js';
import {
  topologyEditOperationReference,
} from './topology-edit-operation-graph.js';
import {
  normalizeTopologyEditInlineComponentPayload,
} from '../topology-edit-inline-component-command.js';
import {
  topologyEditInlineCatalogueBinding,
  topologyEditInlineInsertionLength,
} from '../professional/topology-edit-inline-component-operation.js';
import {
  assertTopologyEditSpecificationCatalogue,
} from '../professional/topology-edit-spec-catalog.js';
import {
  deriveTopologyEditChangedScope,
} from '../professional/topology-edit-change-scope.js';
import {
  createTopologyEditOperationPlan,
} from '../professional/topology-edit-operation-plan.js';

const STRAIGHT_TYPES = new Set(['PIPE', 'STRAIGHT', 'STRAIGHT_ELEMENT']);
const TOLERANCE = 1e-9;
const CATALOGUE_FIELDS = Object.freeze([
  'valveType',
  'pressureClass',
  'facing',
  'valveMaterialSpecification',
  'upstreamFlangeMaterialSpecification',
  'downstreamFlangeMaterialSpecification',
  'faceToFaceMm',
  'upstreamFlangeLengthMm',
  'downstreamFlangeLengthMm',
  'upstreamFlangeMassKg',
  'valveMassKg',
  'downstreamFlangeMassKg',
]);
const DERIVED_FIELDS = Object.freeze(['assemblyLengthMm', 'assemblyMassKg']);

export function deriveTopologyEditValveAssemblyTarget(input = {}) {
  const topology = assertTopology(input.topology);
  const edge = exactEdge(topology, input.edgeId);
  if (!STRAIGHT_TYPES.has(normalizedType(edge.entityType))) {
    fail('Valve assembly requires one straight pipe edge.', RangeError);
  }
  assertNoDependants(topology, edge.id);
  const from = exactNode(topology, edge.fromNodeId);
  const to = exactNode(topology, edge.toNodeId);
  const lengthMm = distance(from.position, to.position);
  if (!(lengthMm > TOLERANCE)) fail(`edge ${edge.id} has zero length.`, RangeError);
  const direction = unit(subtract(to.position, from.position));
  const stationMm = lengthMm / 2;
  const position = add(from.position, scale(direction, stationMm));
  const material = {
    basisHash: topology.canonicalTopologyHash,
    tool: 'VALVE_ASSEMBLY',
    edgeId: edge.id,
    fromNodeId: from.id,
    toNodeId: to.id,
    stationMm,
    position,
    direction,
  };
  return deepFreeze({
    kind: 'straight-edge',
    canonicalIds: [edge.id],
    stationMm,
    position,
    direction,
    targetHash: semanticHash(material),
  });
}

export function topologyEditValveAssemblyCatalogueOptions(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertAssemblySession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const edge = exactEdge(topology, exactTargetEdgeId(session));
  const edgeLengthMm = edgeLength(topology, edge);
  const valves = catalogue.records.filter((record) => (
    record.componentType === 'VALVE'
    && hostMatches(edge, record)
    && positiveOrNull(record.valveFaceToFaceMm) !== null
    && positiveOrNull(record.componentMassKg) !== null
  ));
  const compatible = [];
  for (const valve of valves) {
    const flanges = catalogue.records.filter((record) => (
      record.componentType === 'FLANGE'
      && hostMatches(edge, record)
      && flangeMatchesValve(record, valve)
      && positiveOrNull(record.componentLengthMm) !== null
      && positiveOrNull(record.componentMassKg) !== null
    ));
    for (const upstream of flanges) {
      for (const downstream of flanges) {
        const assemblyLengthMm = upstream.componentLengthMm
          + valve.valveFaceToFaceMm
          + downstream.componentLengthMm;
        if (!(assemblyLengthMm < edgeLengthMm - TOLERANCE)) continue;
        const assemblyMassKg = upstream.componentMassKg
          + valve.componentMassKg
          + downstream.componentMassKg;
        compatible.push(deepFreeze({
          valveRecordId: valve.recordId,
          valveRecordHash: valve.recordHash,
          upstreamFlangeRecordId: upstream.recordId,
          upstreamFlangeRecordHash: upstream.recordHash,
          downstreamFlangeRecordId: downstream.recordId,
          downstreamFlangeRecordHash: downstream.recordHash,
          assemblyLengthMm,
          assemblyMassKg,
          optionHash: semanticHash({
            catalogueHash: catalogue.catalogueHash,
            edgeId: edge.id,
            valveRecordHash: valve.recordHash,
            upstreamFlangeRecordHash: upstream.recordHash,
            downstreamFlangeRecordHash: downstream.recordHash,
            assemblyLengthMm,
            assemblyMassKg,
          }),
        }));
      }
    }
  }
  const selectedValveId = String(
    input.valveRecordId ?? session.properties.valveRecordId ?? '',
  ).trim();
  const selectedUpstreamId = String(
    input.upstreamFlangeRecordId ?? session.properties.upstreamFlangeRecordId ?? '',
  ).trim();
  const selectedDownstreamId = String(
    input.downstreamFlangeRecordId ?? session.properties.downstreamFlangeRecordId ?? '',
  ).trim();
  const valveOptions = uniqueOptions(compatible.map((row) => ({
    recordId: row.valveRecordId,
    recordHash: row.valveRecordHash,
    label: valveLabel(exactRecord(catalogue, row.valveRecordId, row.valveRecordHash)),
  })));
  const activeValveId = valveOptions.some((row) => row.recordId === selectedValveId)
    ? selectedValveId
    : valveOptions[0]?.recordId ?? null;
  const upstreamOptions = uniqueOptions(compatible.filter((row) => (
    row.valveRecordId === activeValveId
  )).map((row) => ({
    recordId: row.upstreamFlangeRecordId,
    recordHash: row.upstreamFlangeRecordHash,
    label: flangeLabel(exactRecord(
      catalogue,
      row.upstreamFlangeRecordId,
      row.upstreamFlangeRecordHash,
    )),
  })));
  const activeUpstreamId = upstreamOptions.some((row) => row.recordId === selectedUpstreamId)
    ? selectedUpstreamId
    : upstreamOptions[0]?.recordId ?? null;
  const downstreamOptions = uniqueOptions(compatible.filter((row) => (
    row.valveRecordId === activeValveId
    && row.upstreamFlangeRecordId === activeUpstreamId
  )).map((row) => ({
    recordId: row.downstreamFlangeRecordId,
    recordHash: row.downstreamFlangeRecordHash,
    label: flangeLabel(exactRecord(
      catalogue,
      row.downstreamFlangeRecordId,
      row.downstreamFlangeRecordHash,
    )),
  })));
  const preferredDistinct = downstreamOptions.find((row) => row.recordId !== activeUpstreamId);
  const activeDownstreamId = downstreamOptions.some((row) => row.recordId === selectedDownstreamId)
    ? selectedDownstreamId
    : preferredDistinct?.recordId ?? downstreamOptions[0]?.recordId ?? null;
  return deepFreeze({
    valveOptions,
    upstreamFlangeOptions: upstreamOptions,
    downstreamFlangeOptions: downstreamOptions,
    selectedValveRecordId: activeValveId,
    selectedUpstreamFlangeRecordId: activeUpstreamId,
    selectedDownstreamFlangeRecordId: activeDownstreamId,
    compatibleAssemblyCount: compatible.length,
    optionsHash: semanticHash(compatible),
  });
}

export function topologyEditValveAssemblyDefaultProperties(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertAssemblySession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const options = topologyEditValveAssemblyCatalogueOptions({
    topology,
    authoringSession: session,
    catalogue,
    valveRecordId: input.valveRecordId,
    upstreamFlangeRecordId: input.upstreamFlangeRecordId,
    downstreamFlangeRecordId: input.downstreamFlangeRecordId,
  });
  if (!options.selectedValveRecordId
    || !options.selectedUpstreamFlangeRecordId
    || !options.selectedDownstreamFlangeRecordId) {
    fail('no exact flange–valve–flange catalogue assembly fits the selected edge.', RangeError);
  }
  const valve = exactRecord(catalogue, options.selectedValveRecordId);
  const upstream = exactRecord(catalogue, options.selectedUpstreamFlangeRecordId);
  const downstream = exactRecord(catalogue, options.selectedDownstreamFlangeRecordId);
  const edge = exactEdge(topology, exactTargetEdgeId(session));
  const lengthMm = edgeLength(topology, edge);
  const minimumStation = upstream.componentLengthMm + valve.valveFaceToFaceMm / 2;
  const maximumStation = lengthMm
    - downstream.componentLengthMm
    - valve.valveFaceToFaceMm / 2;
  if (!(minimumStation < maximumStation - TOLERANCE)) {
    fail('selected assembly does not leave positive straight pipe on both sides.', RangeError);
  }
  const requestedStation = positiveOrNull(input.stationMm ?? session.properties.stationMm);
  const stationMm = requestedStation !== null
    && requestedStation > minimumStation + TOLERANCE
    && requestedStation < maximumStation - TOLERANCE
    ? requestedStation
    : lengthMm / 2;
  const assemblyLengthMm = upstream.componentLengthMm
    + valve.valveFaceToFaceMm
    + downstream.componentLengthMm;
  const assemblyMassKg = upstream.componentMassKg
    + valve.componentMassKg
    + downstream.componentMassKg;
  return deepFreeze({
    stationMm,
    valveRecordId: valve.recordId,
    upstreamFlangeRecordId: upstream.recordId,
    downstreamFlangeRecordId: downstream.recordId,
    valveType: valve.valveType,
    pressureClass: valve.pressureClass,
    facing: upstream.flangeFacing,
    valveMaterialSpecification: valve.materialSpecification,
    upstreamFlangeMaterialSpecification: upstream.materialSpecification,
    downstreamFlangeMaterialSpecification: downstream.materialSpecification,
    faceToFaceMm: valve.valveFaceToFaceMm,
    upstreamFlangeLengthMm: upstream.componentLengthMm,
    downstreamFlangeLengthMm: downstream.componentLengthMm,
    upstreamFlangeMassKg: upstream.componentMassKg,
    valveMassKg: valve.componentMassKg,
    downstreamFlangeMassKg: downstream.componentMassKg,
    assemblyLengthMm,
    assemblyMassKg,
  });
}

export function planTopologyEditValveAssemblyAuthoringOperation(input = {}) {
  const topology = assertTopology(input.topology);
  const session = assertAssemblySession(input.authoringSession);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const defaults = topologyEditValveAssemblyDefaultProperties({
    topology,
    authoringSession: session,
    catalogue,
    valveRecordId: session.properties.valveRecordId,
    upstreamFlangeRecordId: session.properties.upstreamFlangeRecordId,
    downstreamFlangeRecordId: session.properties.downstreamFlangeRecordId,
    stationMm: session.properties.stationMm,
  });
  assertExactProperties(session, defaults);
  const edgeId = exactTargetEdgeId(session);
  const edge = exactEdge(topology, edgeId);
  const hostLengthMm = edgeLength(topology, edge);
  const upstream = exactRecord(catalogue, defaults.upstreamFlangeRecordId);
  const valve = exactRecord(catalogue, defaults.valveRecordId);
  const downstream = exactRecord(catalogue, defaults.downstreamFlangeRecordId);
  const stationMm = defaults.stationMm;
  const valveLength = topologyEditInlineInsertionLength(valve).value;
  const upstreamLength = topologyEditInlineInsertionLength(upstream).value;
  const downstreamLength = topologyEditInlineInsertionLength(downstream).value;
  const leftHostLength = stationMm - valveLength / 2;
  const rightHostLength = hostLengthMm - stationMm - valveLength / 2;
  if (!(upstreamLength < leftHostLength - TOLERANCE)
    || !(downstreamLength < rightHostLength - TOLERANCE)) {
    fail('assembly station does not leave positive straight pipe on both sides.', RangeError);
  }
  const recordIds = [upstream.recordId, valve.recordId, downstream.recordId];
  const assemblyAuthority = {
    schema: 'TopologyEditValveAssemblyBinding.v1',
    catalogueHash: catalogue.catalogueHash,
    sourceHash: catalogue.authority.sourceHash,
    hostEdgeId: edgeId,
    stationMm,
    recordIds,
    recordHashes: [upstream.recordHash, valve.recordHash, downstream.recordHash],
    assemblyLengthMm: defaults.assemblyLengthMm,
    assemblyMassKg: defaults.assemblyMassKg,
  };
  const assemblyHash = semanticHash(assemblyAuthority);
  const assemblyId = `valve-assembly:${assemblyHash.split(':').at(-1)}`;
  const assemblyBinding = (role) => ({
    assemblyId,
    assemblyHash,
    role,
    recordIds,
    assemblyLengthMm: defaults.assemblyLengthMm,
    assemblyMassKg: defaults.assemblyMassKg,
  });
  const valvePayload = componentPayload({
    edgeId,
    centerFraction: stationMm / hostLengthMm,
    record: valve,
    catalogue,
    direction: 'FROM_TO',
    placement: 'INTERIOR',
    assemblyBinding: assemblyBinding('VALVE'),
  });
  const upstreamPayload = componentPayload({
    edgeId: topologyEditOperationReference('step-1', 'inline-left-edge'),
    normalizationEdgeId: 'symbolic:inline-left-edge',
    centerFraction: 1 - upstreamLength / (2 * leftHostLength),
    record: upstream,
    catalogue,
    direction: 'FROM_TO',
    placement: 'TO_BOUNDARY',
    assemblyBinding: assemblyBinding('UPSTREAM_FLANGE'),
  });
  const downstreamPayload = componentPayload({
    edgeId: topologyEditOperationReference('step-1', 'inline-right-edge'),
    normalizationEdgeId: 'symbolic:inline-right-edge',
    centerFraction: downstreamLength / (2 * rightHostLength),
    record: downstream,
    catalogue,
    direction: 'TO_FROM',
    placement: 'FROM_BOUNDARY',
    assemblyBinding: assemblyBinding('DOWNSTREAM_FLANGE'),
  });
  const changedScope = deriveTopologyEditChangedScope(topology, {
    edgeIds: [edgeId],
  });
  return createTopologyEditOperationPlan({
    operationType: 'INSERT_INLINE_COMPONENT',
    basisHash: topology.canonicalTopologyHash,
    targetIds: [edgeId],
    parameters: {
      authoringTool: 'VALVE_ASSEMBLY',
      compositeCertification: {
        mode: 'FINAL_STATE',
        intermediatePolicy: 'STRUCTURAL_AND_PROVENANCE_ONLY',
        finalPolicy: 'FULL_TOPOLOGY_CHECKER',
      },
      assemblyId,
      assemblyHash,
      assemblyAuthority,
      stationMm,
      assemblyLengthMm: defaults.assemblyLengthMm,
      assemblyMassKg: defaults.assemblyMassKg,
      recordIds,
      generatedRecordRoles: [
        'edge:upstream-flange',
        'edge:valve',
        'edge:downstream-flange',
      ],
    },
    commandIntents: [
      { commandType: 'INSERT_INLINE_COMPONENT', payload: valvePayload },
      { commandType: 'INSERT_INLINE_COMPONENT', payload: upstreamPayload },
      { commandType: 'INSERT_INLINE_COMPONENT', payload: downstreamPayload },
    ],
    changedScope,
    unresolvedEvidence: [],
  });
}

function componentPayload(input) {
  const length = topologyEditInlineInsertionLength(input.record);
  const normalized = normalizeTopologyEditInlineComponentPayload({
    edgeId: input.normalizationEdgeId ?? input.edgeId,
    centerFraction: input.centerFraction,
    insertionLengthMm: length.value,
    lengthAuthority: length.authority,
    direction: input.direction,
    placement: input.placement,
    catalogueBinding: topologyEditInlineCatalogueBinding(input.catalogue, input.record),
    assemblyBinding: input.assemblyBinding,
  });
  return deepFreeze({ ...normalized, edgeId: input.edgeId });
}

function assertExactProperties(session, expected) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!Object.is(session.properties[key], expectedValue)) {
      fail(`${key} must equal exact assembly catalogue evidence.`, RangeError);
    }
    const authority = session.propertyAuthorities[key];
    if (CATALOGUE_FIELDS.includes(key) && authority !== 'CATALOGUE') {
      fail(`${key} must retain CATALOGUE authority.`, RangeError);
    }
    if (DERIVED_FIELDS.includes(key) && authority !== 'DERIVED') {
      fail(`${key} must retain DERIVED authority.`, RangeError);
    }
  }
}

function flangeMatchesValve(flange, valve) {
  return sameText(flange.pressureClass ?? flange.flangeClass, valve.pressureClass)
    && sameText(flange.pipingClass, valve.pipingClass)
    && sameText(flange.endConnectionTo, valve.endConnectionFrom)
    && sameText(flange.endConnectionTo, valve.endConnectionTo)
    && connectionFacing(flange.endConnectionTo) === String(flange.flangeFacing ?? '').toUpperCase();
}

function connectionFacing(value) {
  return String(value ?? '').trim().toUpperCase().split('_').at(-1);
}

function hostMatches(edge, record) {
  const hostNominal = positiveOrNull(edge.diameterMm);
  const hostOutside = positiveOrNull(edge.outsideDiameterMm);
  return (hostNominal === null || nearlyEqual(hostNominal, record.nominalSizeMm))
    && (hostOutside === null || nearlyEqual(hostOutside, record.outsideDiameterMm));
}

function uniqueOptions(rows) {
  const byKey = new Map();
  for (const row of rows) byKey.set(`${row.recordId}\u0000${row.recordHash}`, deepFreeze(row));
  return deepFreeze([...byKey.values()].sort((left, right) => (
    left.recordId.localeCompare(right.recordId)
    || left.recordHash.localeCompare(right.recordHash)
  )));
}

function valveLabel(record) {
  return `${record.recordId} · DN${record.nominalSizeMm} · Class ${record.pressureClass} · ${record.valveType}`;
}

function flangeLabel(record) {
  return `${record.recordId} · DN${record.nominalSizeMm} · Class ${
    record.pressureClass ?? record.flangeClass
  } · ${record.flangeFacing}`;
}

function assertAssemblySession(value) {
  const session = assertTopologyEditAuthoringSession(value);
  if (session.tool !== 'VALVE_ASSEMBLY') fail('authoring session must use VALVE_ASSEMBLY.', RangeError);
  if (!session.target) fail('VALVE_ASSEMBLY requires an exact target.', RangeError);
  return session;
}

function exactRecord(catalogue, recordId, recordHash = null) {
  const id = requiredText(recordId, 'catalogue record ID');
  const matches = catalogue.records.filter((record) => (
    record.recordId === id && (!recordHash || record.recordHash === recordHash)
  ));
  if (matches.length !== 1) fail(`catalogue record ${id} resolved ${matches.length} records.`, RangeError);
  return matches[0];
}

function exactTargetEdgeId(session) {
  const ids = session.target?.canonicalIds?.filter((id) => id.startsWith('edge:')) ?? [];
  if (ids.length !== 1) fail('target requires exactly one edge identity.', RangeError);
  return ids[0];
}

function assertNoDependants(topology, edgeId) {
  for (const collection of ['junctions', 'supports', 'boundaries', 'rigids', 'bends']) {
    const dependent = (topology[collection] ?? []).find((record) => (
      record?.edgeId === edgeId || record?.edgeIds?.includes?.(edgeId)
    ));
    if (dependent) {
      fail(`edge ${edgeId} has dependent ${collection} record ${dependent.id}.`, RangeError);
    }
  }
}

function assertTopology(value) {
  if (!value?.canonicalTopologyHash || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    fail('canonical topology authority is required.');
  }
  return value;
}

function exactNode(topology, id) {
  const matches = topology.nodes.filter((row) => row.id === id);
  if (matches.length !== 1) fail(`node ${id} resolved ${matches.length} records.`, RangeError);
  return matches[0];
}

function exactEdge(topology, idInput) {
  const id = requiredText(idInput, 'edgeId');
  const matches = topology.edges.filter((row) => row.id === id);
  if (matches.length !== 1) fail(`edge ${id} resolved ${matches.length} records.`, RangeError);
  return matches[0];
}

function edgeLength(topology, edge) {
  return distance(
    exactNode(topology, edge.fromNodeId).position,
    exactNode(topology, edge.toNodeId).position,
  );
}

function normalizedType(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[\s/-]+/gu, '_');
}
function sameText(left, right) {
  return String(left ?? '').trim().toUpperCase() === String(right ?? '').trim().toUpperCase();
}
function nearlyEqual(left, right) { return Math.abs(Number(left) - Number(right)) <= TOLERANCE; }
function positiveOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function add(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(value, scalar) { return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar }; }
function distance(left, right) { return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z); }
function unit(value) {
  const length = Math.hypot(value.x, value.y, value.z);
  return length > TOLERANCE ? scale(value, 1 / length) : null;
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditAuthoringValveAssembly: ${message}`);
}
