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
const MATCH_FIELDS = Object.freeze({
  FLANGE: Object.freeze([
    ...COMMON_FIELDS.map(([key]) => key),
    'flangeClass',
    'flangeFacing',
  ]),
  VALVE: Object.freeze([
    ...COMMON_FIELDS.map(([key]) => key),
    'valveType',
    'valveFaceToFaceMm',
  ]),
  REDUCER: Object.freeze([
    ...COMMON_FIELDS.map(([key]) => key),
    'secondaryNominalSizeMm',
    'secondaryOutsideDiameterMm',
    'reducerType',
    'reducerOrientation',
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
  const workspaceEntity = workspaceEntityForEdge(input.workspaceDataset, edge);
  const sourceEvidence = componentSourceEvidence(edge, componentType, workspaceEntity);
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
  const candidates = family.filter((record) => evidenceMatches(
    record,
    sourceEvidence,
    componentType,
  ));
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
  return fields.map(([key, label, unit]) => {
    const sourceValue = sourceEvidence?.[key] ?? null;
    const catalogueValue = commonCandidateValue(candidates, key);
    return {
      key,
      label,
      unit,
      value: sourceValue ?? catalogueValue,
      source: sourceValue !== null
        ? 'SOURCE_EVIDENCE'
        : catalogueValue !== null
          ? 'CATALOGUE'
          : 'UNRESOLVED',
    };
  });
}

function commonCandidateValue(candidates, key) {
  if (!candidates.length) return null;
  const values = [...new Set(candidates.map((record) => record[key]))];
  return values.length === 1 ? values[0] : null;
}

function componentSourceEvidence(edge, componentType, workspaceEntity) {
  const attributes = mergedAttributes(workspaceEntity);
  const common = {
    componentType,
    nominalSizeMm: positive(edge.diameterMm),
    outsideDiameterMm: positive(edge.outsideDiameterMm),
    pipingClass: upper(edge.pipingClass),
    endConnectionFrom: upper(edge.endConnectionFrom),
    endConnectionTo: upper(edge.endConnectionTo),
  };
  if (componentType === 'FLANGE') return {
    ...common,
    flangeClass: textNumber(
      attributes.FLANGE_CLASS,
      attributes.RATING_CLASS,
      attributes.CLASS,
    ),
    flangeFacing: upper(
      attributes.FLANGE_FACING
      ?? attributes.FACING
      ?? attributes.FACE,
    ),
  };
  if (componentType === 'VALVE') return {
    ...common,
    valveType: upper(attributes.VALVE_TYPE ?? attributes.TYPE_DESCRIPTION),
    valveFaceToFaceMm: firstPositive(
      attributes.VALVE_FACE_TO_FACE_MM,
      attributes.FACE_TO_FACE_MM,
      attributes.LENGTH_MM,
    ),
  };
  if (componentType === 'REDUCER') {
    const reducerType = upper(attributes.REDUCER_TYPE ?? attributes.FITTING_TYPE);
    return {
      ...common,
      nominalSizeMm: firstPositive(
        attributes.START_NOMINAL_BORE_MM,
        attributes.START_NOMINAL_SIZE_MM,
        common.nominalSizeMm,
      ),
      outsideDiameterMm: firstPositive(
        attributes.START_OUTSIDE_DIAMETER,
        attributes.START_OUTSIDE_DIAMETER_MM,
        common.outsideDiameterMm,
      ),
      secondaryNominalSizeMm: firstPositive(
        attributes.END_NOMINAL_BORE_MM,
        attributes.END_NOMINAL_SIZE_MM,
      ),
      secondaryOutsideDiameterMm: firstPositive(
        attributes.END_OUTSIDE_DIAMETER,
        attributes.END_OUTSIDE_DIAMETER_MM,
      ),
      reducerType,
      reducerOrientation: upper(attributes.REDUCER_ORIENTATION)
        ?? governedReducerOrientation(reducerType),
    };
  }
  return common;
}

function evidenceMatches(record, evidence, componentType) {
  return (MATCH_FIELDS[componentType] ?? []).every((field) => (
    evidence[field] === null || Object.is(record[field], evidence[field])
  ));
}

function workspaceEntityForEdge(dataset, edge) {
  if (!dataset) return null;
  if (!Array.isArray(dataset.entities)) {
    throw new TypeError('TopologyEditComponentHudContext: workspaceDataset.entities must be an array.');
  }
  const matches = dataset.entities.filter((entity) => entity.entityId === edge.componentKey);
  if (matches.length > 1) {
    throw new RangeError(
      `TopologyEditComponentHudContext: workspace entity ${edge.componentKey} is ambiguous.`,
    );
  }
  return matches[0] ?? null;
}

function mergedAttributes(entity) {
  const properties = entity?.properties ?? {};
  return {
    ...(properties.sourceAttributes ?? {}),
    ...(properties.attributes ?? {}),
    ...(properties.enrichedAttributes ?? {}),
    ...(properties.nativeParams ?? {}),
  };
}

function governedReducerOrientation(reducerType) {
  if (reducerType === 'CONCENTRIC' || reducerType === 'ECCENTRIC') return reducerType;
  return null;
}

function diagnostics(status, componentType, candidateRecordIds) {
  const messages = {
    NO_SELECTION: 'Select one canonical inline component to inspect governed catalogue context.',
    UNSUPPORTED: `${componentType || 'Selected object'} does not use the flange, valve, or reducer HUD schema.`,
    RESOLVED: 'Exactly one catalogue record matches all available source-backed component evidence.',
    AMBIGUOUS: 'Multiple catalogue records match all available source-backed component evidence; explicit record selection is required.',
    INCOMPATIBLE: 'Catalogue records exist for this component family, but available source-backed size, class, connection, or component evidence does not match.',
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

function textNumber(...values) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text.toUpperCase();
  }
  return null;
}

function firstPositive(...values) {
  for (const value of values) {
    const number = positive(value);
    if (number !== null) return number;
  }
  return null;
}

function positive(value) {
  if (typeof value === 'string') {
    const match = value.trim().match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*mm)?$/iu);
    if (!match) return null;
    value = match[1];
  }
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
