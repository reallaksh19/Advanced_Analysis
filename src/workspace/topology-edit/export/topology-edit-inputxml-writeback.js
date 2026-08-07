import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { parseInputXmlUnitSystem } from '../../../core/geometry/adapters/inputxml-unit-system.js';
import { assertCanonicalTopologyHash } from '../topology-edit-canonical-state.js';
import {
  assessTopologyEditInputXmlEngineeringDelta,
  assertTopologyEditInputXmlEngineeringCapability,
} from './topology-edit-inputxml-engineering-capability.js';
import {
  assessTopologyEditSourceRecordInsertion,
  assertTopologyEditSourceRecordInsertionCapability,
  SOURCE_RECORD_INSERTION_FAMILY,
} from './topology-edit-source-record-insertion-capability.js';

export const TOPOLOGY_EDIT_INPUTXML_WRITEBACK_SCHEMA =
  'TopologyEditInputXmlWriteback.v1';

const LENGTH_TO_METRES = Object.freeze({
  m: 1,
  mm: 1e-3,
  cm: 1e-2,
  in: 0.0254,
  ft: 0.3048,
});
const COLLECTIONS = Object.freeze([
  'edges', 'junctions', 'supports', 'boundaries', 'rigids', 'bends',
]);
const DELTA_ALIASES = Object.freeze({
  x: ['DELTA_X', 'DX'],
  y: ['DELTA_Y', 'DY'],
  z: ['DELTA_Z', 'DZ'],
});

export function prepareTopologyEditInputXmlWriteback(input = {}) {
  const inputXmlText = requiredText(input.inputXmlText, 'inputXmlText');
  const expectedSourceHash = requiredText(input.expectedSourceHash, 'expectedSourceHash');
  const originalSourceHash = semanticHash(inputXmlText);
  if (expectedSourceHash !== originalSourceHash) {
    throw new RangeError('InputXML writeback: source hash is stale.');
  }
  const base = assertCanonical(input.baseCanonicalTopology, 'baseCanonicalTopology');
  const edited = assertCanonical(input.canonicalTopology, 'canonicalTopology');
  assertNoSourceRecordInsertion(base, edited);
  const engineeringCapability = assessTopologyEditInputXmlEngineeringDelta({
    baseCanonicalTopology: base,
    canonicalTopology: edited,
  });
  assertTopologyEditInputXmlEngineeringCapability(engineeringCapability);
  if (engineeringCapability.status === 'BLOCKED') {
    const codes = engineeringCapability.blockers.map((row) => row.code).join(', ');
    throw new RangeError(`InputXML writeback: engineering capability blocked: ${codes}.`);
  }
  assertGeometryOnlyEdit(base, edited);
  const bindings = normalizeBindings(input.bindings, base);
  const canonicalLengthUnit = lengthUnit(input.canonicalLengthUnit, 'canonicalLengthUnit');
  const diagnostics = [];
  const units = parseInputXmlUnitSystem(
    inputXmlText,
    input.fallbackInputXmlLengthUnit ?? null,
    diagnostics,
  );
  const unitErrors = diagnostics.filter((row) => String(row.severity).toLowerCase() === 'error');
  if (unitErrors.length || !units.lengthUnit) {
    throw new RangeError(`InputXML writeback: source length unit is unresolved: ${unitErrors.map((row) => row.code).join(', ')}`);
  }
  const sourceLengthUnit = lengthUnit(units.lengthUnit, 'sourceLengthUnit');
  const tags = scanPipingElementTags(inputXmlText);
  const nodes = new Map(edited.nodes.map((node) => [node.id, node]));
  const patches = [];
  for (const edge of edited.edges) {
    const binding = bindings.edges[edge.id];
    if (!binding) throw new RangeError(`InputXML writeback: missing edge binding ${edge.id}.`);
    const tag = tags[binding.sourceIndex];
    if (!tag) throw new RangeError(`InputXML writeback: missing PIPINGELEMENT[${binding.sourceIndex}].`);
    assertEdgeBinding(edge, binding, bindings.nodes, tag);
    const from = nodes.get(edge.fromNodeId)?.position;
    const to = nodes.get(edge.toNodeId)?.position;
    if (!validPoint(from) || !validPoint(to)) {
      throw new RangeError(`InputXML writeback: edge ${edge.id} has unresolved node coordinates.`);
    }
    const delta = {
      x: convertLength(to.x - from.x, canonicalLengthUnit, sourceLengthUnit),
      y: convertLength(to.y - from.y, canonicalLengthUnit, sourceLengthUnit),
      z: convertLength(to.z - from.z, canonicalLengthUnit, sourceLengthUnit),
    };
    for (const axis of ['x', 'y', 'z']) {
      const attribute = findAttribute(tag, DELTA_ALIASES[axis]);
      if (!attribute) {
        throw new RangeError(
          `InputXML writeback: PIPINGELEMENT[${binding.sourceIndex}] has no ${DELTA_ALIASES[axis].join('/')} attribute.`,
        );
      }
      const replacement = formatNumber(delta[axis]);
      if (numericEqual(attribute.value, replacement)) continue;
      patches.push(deepFreeze({
        canonicalEdgeId: edge.id,
        sourceIndex: binding.sourceIndex,
        attribute: attribute.name,
        start: attribute.valueStart,
        end: attribute.valueEnd,
        preimageHash: semanticHash(attribute.value),
        resultHash: semanticHash(replacement),
        replacement,
      }));
    }
  }
  if (!patches.length) {
    throw new RangeError('InputXML writeback: no source-representable coordinate changes were found.');
  }
  assertDisjointPatches(patches);
  const resultingInputXml = applyTextPatches(inputXmlText, patches);
  const changedNodeIds = edited.nodes
    .filter((node) => semanticHash(node.position) !== semanticHash(base.nodes.find((row) => row.id === node.id)?.position))
    .map((node) => node.id)
    .sort();
  const material = {
    schema: TOPOLOGY_EDIT_INPUTXML_WRITEBACK_SCHEMA,
    baseCanonicalTopologyHash: base.canonicalTopologyHash,
    canonicalTopologyHash: edited.canonicalTopologyHash,
    canonicalLengthUnit,
    sourceLengthUnit,
    originalSourceHash,
    resultingSourceHash: semanticHash(resultingInputXml),
    bindingHash: bindings.bindingHash,
    changedNodeIds,
    patchCount: patches.length,
    patchHashes: patches.map((patch) => semanticHash(patch)),
  };
  return deepFreeze({
    ...material,
    writebackHash: semanticHash(material),
    patches,
    bindings,
    resultingInputXml,
  });
}

export function assertTopologyEditInputXmlWriteback(value) {
  if (value?.schema !== TOPOLOGY_EDIT_INPUTXML_WRITEBACK_SCHEMA) {
    throw new TypeError(`InputXML writeback must use ${TOPOLOGY_EDIT_INPUTXML_WRITEBACK_SCHEMA}.`);
  }
  const { writebackHash, patches: _patches, bindings: _bindings, resultingInputXml, ...material } = value;
  if (semanticHash(material) !== writebackHash
    || semanticHash(resultingInputXml) !== value.resultingSourceHash) {
    throw new Error('InputXML writeback: authority hash mismatch.');
  }
  return value;
}

function assertNoSourceRecordInsertion(base, edited) {
  const capability = assessTopologyEditSourceRecordInsertion({
    family: SOURCE_RECORD_INSERTION_FAMILY.INPUT_XML,
    baseCanonicalTopology: base,
    canonicalTopology: edited,
  });
  assertTopologyEditSourceRecordInsertionCapability(capability);
  if (capability.status === 'BLOCKED') {
    const rows = capability.blockers.map((row) => `${row.code}:${row.canonicalId}`).join(', ');
    throw new RangeError(`InputXML writeback: source record insertion blocked: ${rows}.`);
  }
}

function assertGeometryOnlyEdit(base, edited) {
  for (const collection of COLLECTIONS) {
    if (semanticHash(base[collection] ?? []) !== semanticHash(edited[collection] ?? [])) {
      throw new RangeError(`InputXML writeback: ${collection} changes are not supported by this source adapter.`);
    }
  }
  const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
  if (baseNodes.size !== edited.nodes.length) {
    throw new RangeError('InputXML writeback: node creation/deletion is not source-representable.');
  }
  for (const node of edited.nodes) {
    const prior = baseNodes.get(node.id);
    if (!prior) throw new RangeError(`InputXML writeback: new node ${node.id} is not source-representable.`);
    const { position: _priorPosition, ...priorRest } = prior;
    const { position: _nextPosition, ...nextRest } = node;
    if (semanticHash(priorRest) !== semanticHash(nextRest)) {
      throw new RangeError(`InputXML writeback: non-coordinate node edit ${node.id} is unsupported.`);
    }
  }
}

function normalizeBindings(value, topology) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('InputXML writeback: bindings are required.');
  }
  const nodes = Object.fromEntries(Object.entries(value.nodes ?? {}).map(([canonicalId, sourceId]) => [
    requiredText(canonicalId, 'canonical node id'), requiredText(sourceId, `binding for ${canonicalId}`),
  ]));
  const edges = {};
  for (const [canonicalId, raw] of Object.entries(value.edges ?? {})) {
    const sourceIndex = Number(raw?.sourceIndex);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      throw new RangeError(`InputXML writeback: edge ${canonicalId} sourceIndex must be a non-negative integer.`);
    }
    edges[canonicalId] = {
      sourceIndex,
      fromNodeId: requiredText(raw?.fromNodeId, `${canonicalId}.fromNodeId`),
      toNodeId: requiredText(raw?.toNodeId, `${canonicalId}.toNodeId`),
    };
  }
  for (const node of topology.nodes) if (!nodes[node.id]) throw new RangeError(`InputXML writeback: missing node binding ${node.id}.`);
  for (const edge of topology.edges) if (!edges[edge.id]) throw new RangeError(`InputXML writeback: missing edge binding ${edge.id}.`);
  const material = { nodes, edges };
  return deepFreeze({ ...material, bindingHash: semanticHash(material) });
}

function scanPipingElementTags(xmlText) {
  const pattern = /<\s*(?:[\w.-]+:)?PIPINGELEMENT\b[^>]*>/giu;
  return [...xmlText.matchAll(pattern)].map((match, sourceIndex) => ({
    sourceIndex,
    start: match.index,
    raw: match[0],
  }));
}

function findAttribute(tag, aliases) {
  const wanted = new Set(aliases.map((value) => value.toUpperCase()));
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/gu;
  for (const match of tag.raw.matchAll(pattern)) {
    const name = match[1];
    if (!wanted.has(name.toUpperCase())) continue;
    const quoted = match[2];
    const value = match[3] ?? match[4] ?? '';
    const relativeQuotedStart = match.index + match[0].indexOf(quoted);
    const valueStart = tag.start + relativeQuotedStart + 1;
    return { name, value, valueStart, valueEnd: valueStart + value.length };
  }
  return null;
}

function assertEdgeBinding(edge, binding, nodeBindings, tag) {
  const from = findAttribute(tag, ['FROM_NODE', 'FROMNODE', 'FROM']);
  const to = findAttribute(tag, ['TO_NODE', 'TONODE', 'TO']);
  if (!from || !to) throw new RangeError(`InputXML writeback: PIPINGELEMENT[${binding.sourceIndex}] lacks node identity.`);
  const expectedFrom = nodeBindings[edge.fromNodeId];
  const expectedTo = nodeBindings[edge.toNodeId];
  if (binding.fromNodeId !== expectedFrom || binding.toNodeId !== expectedTo
    || from.value !== expectedFrom || to.value !== expectedTo) {
    throw new RangeError(`InputXML writeback: PIPINGELEMENT[${binding.sourceIndex}] node binding is stale.`);
  }
}

function applyTextPatches(text, patches) {
  let result = text;
  for (const patch of [...patches].sort((left, right) => right.start - left.start)) {
    const current = result.slice(patch.start, patch.end);
    if (semanticHash(current) !== patch.preimageHash) {
      throw new RangeError(`InputXML writeback: stale attribute preimage at ${patch.sourceIndex}:${patch.attribute}.`);
    }
    result = `${result.slice(0, patch.start)}${patch.replacement}${result.slice(patch.end)}`;
  }
  return result;
}

function assertDisjointPatches(patches) {
  const sorted = [...patches].sort((left, right) => left.start - right.start);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].start < sorted[index - 1].end) {
      throw new RangeError('InputXML writeback: overlapping source attribute patches are forbidden.');
    }
  }
}

function convertLength(value, fromUnit, toUnit) {
  return value * LENGTH_TO_METRES[fromUnit] / LENGTH_TO_METRES[toUnit];
}
function formatNumber(value) {
  if (!Number.isFinite(value)) throw new RangeError('InputXML writeback: delta must be finite.');
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return Number(normalized.toPrecision(15)).toString();
}
function numericEqual(left, right) {
  const a = Number(left); const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));
}
function validPoint(value) {
  return value && ['x', 'y', 'z'].every((key) => Number.isFinite(value[key]));
}
function lengthUnit(value, label) {
  const unit = requiredText(value, label).toLowerCase();
  if (!LENGTH_TO_METRES[unit]) throw new RangeError(`InputXML writeback: unsupported ${label} ${unit}.`);
  return unit;
}
function assertCanonical(value, label) {
  try { return assertCanonicalTopologyHash(value); }
  catch (error) { throw new TypeError(`InputXML writeback: invalid ${label}: ${error.message}`); }
}
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`InputXML writeback: ${label} is required.`);
  return text;
}
