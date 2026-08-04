import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import {
  normalizeTopologyEditCanonicalId,
} from './topology-edit-canonical-id.js';
import {
  assertTopologyEditSpecificationCatalogue,
} from './topology-edit-spec-catalog.js';

export const TOPOLOGY_EDIT_COMPONENT_HUD_CONTEXT_SCHEMA =
  'TopologyEditComponentHudContext.v1';
export const TOPOLOGY_EDIT_COMPONENT_HUD_STATUSES = Object.freeze([
  'NO_SELECTION',
  'UNSUPPORTED',
  'RESOLVED',
  'AMBIGUOUS',
  'INCOMPATIBLE',
  'UNAVAILABLE',
]);

const SUPPORTED_TYPES = new Set(['FLANGE', 'VALVE', 'REDUCER']);
const COMMON_FIELDS = Object.freeze([
  ['nominalSizeMm', 'Nominal size', 'mm'],
  ['outsideDiameterMm', 'Outside diameter', 'mm'],
  ['pipingClass', 'Piping class', null],
  ['endConnectionFrom', 'FROM connection', null],
  ['endConnectionTo', 'TO connection', null],
]);
const TYPE_FIELDS = Object.freeze({
  FLANGE: Object.freeze([
    ['flangeClass', 'Flange class', null],
    ['flangeFacing', 'Facing', null],
  ]),
  VALVE: Object.freeze([
    ['valveType', 'Valve type', null],
    ['valveFaceToFaceMm', 'Face-to-face', 'mm'],
  ]),
  REDUCER: Object.freeze([
    ['secondaryNominalSizeMm', 'Secondary nominal size', 'mm'],
    ['secondaryOutsideDiameterMm', 'Secondary outside diameter', 'mm'],
    ['reducerType', 'Reducer type', null],
    ['reducerOrientation', 'Orientation', null],
  ]),
});

export function deriveTopologyEditComponentHudContext(input = {}) {
  const topology = requireTopology(input.topology);
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const edgeId = selectedEdgeId(input.selection);
  if (!edgeId) return context({
    status: 'NO_SELECTION',
    catalogue,
    topology,
  });

  const matches = topology.edges.filter((edge) => edge.id === edgeId);
  if (matches.length !== 1) {
    throw new RangeError(
      `TopologyEditComponentHudContext: selected edge ${edgeId} must resolve exactly once.`,
    );
  }
  const edge = matches[0];
  const componentType = normalizeComponentType(edge.entityType);
  const sourceEvidence = componentSourceEvidence(edge, componentType);
  if (!SUPPORTED_TYPES.has(componentType)) return context({
    status: 'UNSUPPORTED',
    catalogue,
    topology,
    edge,
    componentType,
    sourceEvidence,
  });

  const family = catalogue.records.filter((record) => (
    record.componentType === componentType
  ));
  const candidates = family.filter((record) => evidenceMatches(record, sourceEvidence));
  const status = candidates.length === 1
    ? 'RESOLVED'
    : candidates.length > 1
      ? 'AMBIGUOUS'
      : family.length
        ? 'INCOMPATIBLE'
        : 'UNAVAILABLE';
  const displayed = candidates.length ? candidates : family;
  return context({
    status,
    catalogue,
    topology,
    edge,
    componentType,
    sourceEvidence,
    candidates: displayed,
    exactCandidateCount: candidates.length,
  });
}

export function topologyEditComponentHudCandidateRecords(contextInput, catalogueInput) {
  const contextValue = assertTopologyEditComponentHudContext(contextInput);
  const catalogue = assertTopologyEditSpecificationCatalogue(catalogueInput);
  const ids = new Set(contextValue.candidateRecordIds);
  return deepFreeze(catalogue.records.filter((record) => ids.has(record.recordId)));
}

export function assertTopologyEditComponentHudContext(value) {
  if (!value || value.schema !== TOPOLOGY_EDIT_COMPONENT_HUD_CONTEXT_SCHEMA) {
    throw new TypeError(
      `TopologyEditComponentHudContext: context must use ${TOPOLOGY_EDIT_COMPONENT_HUD_CONTEXT_SCHEMA}.`,
    );
  }
  const supplied = { ...value };
  delete supplied.contextHash;
  if (value.contextHash !== semanticHash(supplied)) {
    throw new RangeError('TopologyEditComponentHudContext: context hash mismatch.');
  }
  if (!TOPOLOGY_EDIT_COMPONENT_HUD_STATUSES.includes(value.status)) {
    throw new RangeError(`TopologyEditComponentHudContext: unsupported status ${value.status}.`);
  }
  return value;
}

function context({
  status,
  catalogue,
  topology,
  edge = null,
  componentType = null,
  sourceEvidence = null,
  candidates = [],
  exactCandidateCount = 0,
}) {
  const candidateRecordIds = candidates.map((record) => record.recordId).sort();
  const recommendedRecordId = status === 'RESOLVED' ? candidateRecordIds[0] : null;
  const material = {
    schema: TOPOLOGY_EDIT_COMPONENT_HUD_CONTEXT_SCHEMA,
    status,
    topologyHash: topology.canonicalTopologyHash,
    catalogueHash: catalogue.catalogueHash,
    selectedCanonicalId: edge?.id ?? null,
    workspaceEntityId: stringValue(edge?.componentKey) || null,
    componentType,
    supported: SUPPORTED_TYPES.has(componentType),
    sourceEvidence,
    candidateRecordIds,
    exactCandidateCount,
    recommendedRecordId,
    fieldSchema: componentType && SUPPORTED_TYPES.has(componentType)
      ? fieldSchema(componentType, candidates, sourceEvidence)
      : [],
    diagnostics: diagnostics(status, componentType, candidateRecordIds),
  };
  return deepFreeze({ ...material, contextHash: semanticHash(material) });
}

function fieldSchema(componentType, candidates, sourceEvidence) {
  const fields = [...COMMON_FIELDS, ...(TYPE_FIELDS[componentType] ?? [])];
  return fields.map(([key, label, unit]) => ({
    key,
    label,
    unit,
    value: commonCandidateValue(candidates, key) ?? sourceEvidence?.[key] ?? null,
    source: commonCandidateValue(candidates, key) !== null
      ? 'CATALOGUE'
      : sourceEvidence?.[key] !== null && sourceEvidence?.[key] !== undefined
        ? 'CANONICAL'
        : 'UNRESOLVED',
  }));
}

function commonCandidateValue(candidates, key) {
  if (!candidates.length) return null;
  const values = [...new Set(candidates.map((record) => record[key]))];
  return values.length === 1 ? values[0] : null;
}

function componentSourceEvidence(edge, componentType) {
  return {
    componentType,
    nominalSizeMm: positive(edge.diameterMm),
    outsideDiameterMm: positive(edge.outsideDiameterMm),
    pipingClass: upper(edge.pipingClass),
    endConnectionFrom: upper(edge.endConnectionFrom),
    endConnectionTo: upper(edge.endConnectionTo),
  };
}

function evidenceMatches(record, evidence) {
  return [
    'componentType',
    'nominalSizeMm',
    'outsideDiameterMm',
    'pipingClass',
    'endConnectionFrom',
    'endConnectionTo',
  ].every((field) => (
    evidence[field] === null || Object.is(record[field], evidence[field])
  ));
}

function diagnostics(status, componentType, candidateRecordIds) {
  const messages = {
    NO_SELECTION: 'Select one canonical inline component to inspect governed catalogue context.',
    UNSUPPORTED: `${componentType || 'Selected object'} does not use the flange, valve, or reducer HUD schema.`,
    RESOLVED: 'Exactly one catalogue record matches all available canonical evidence.',
    AMBIGUOUS: 'Multiple catalogue records match all available canonical evidence; explicit record selection is required.',
    INCOMPATIBLE: 'Catalogue records exist for this component family, but available canonical size, class, or connection evidence does not match.',
    UNAVAILABLE: 'No catalogue records exist for this component family.',
  };
  return [{
    code: `COMPONENT_HUD_${status}`,
    severity: status === 'RESOLVED' || status === 'NO_SELECTION' || status === 'UNSUPPORTED'
      ? 'INFO'
      : 'WARNING',
    message: messages[status],
    candidateRecordIds,
  }];
}

function selectedEdgeId(selection) {
  const value = stringValue(selection?.edgeId);
  return value ? normalizeTopologyEditCanonicalId(value, 'selection.edgeId', 'edge') : null;
}

function requireTopology(value) {
  if (!value || !Array.isArray(value.edges) || !stringValue(value.canonicalTopologyHash)) {
    throw new TypeError('TopologyEditComponentHudContext: canonical topology is required.');
  }
  return value;
}

function normalizeComponentType(value) {
  const token = upper(value)?.replace(/[\s/-]+/gu, '_') ?? '';
  return ({ FLAN: 'FLANGE', VALV: 'VALVE', REDU: 'REDUCER' })[token] || token;
}

function upper(value) {
  const text = stringValue(value);
  return text ? text.toUpperCase() : null;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
