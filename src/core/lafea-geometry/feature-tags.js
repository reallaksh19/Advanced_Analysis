import { LafeaGeometryError } from './errors.js';
import { exactKeys, member, nonEmptyString } from '../shared-analysis-contract/validation.js';

/**
 * Immutable feature tags over an accepted topology (spec §10.1: "Feature
 * tagging: load edges, supports, weld lines, SCL anchors, material
 * boundaries and refinement zones are immutable tags."). A tag references an
 * existing curve, vertex or region — it never invents new geometry.
 */
export const FEATURE_TAG_KINDS = Object.freeze([
  'LOAD_EDGE',
  'SUPPORT_EDGE',
  'WELD_LINE',
  'SCL_ANCHOR',
  'MATERIAL_BOUNDARY',
  'REFINEMENT_ZONE',
]);

export const FEATURE_ENTITY_KINDS = Object.freeze(['VERTEX', 'CURVE', 'REGION']);

const TAG_FIELDS = Object.freeze(['tagId', 'kind', 'entityKind', 'entityId', 'label']);

function canonicalFeatureTag(source, topology) {
  exactKeys(source, TAG_FIELDS, 'featureTag');
  const tagId = nonEmptyString(source.tagId, 'featureTag.tagId');
  const kind = member(source.kind, FEATURE_TAG_KINDS, `featureTag.${tagId}.kind`);
  const entityKind = member(source.entityKind, FEATURE_ENTITY_KINDS, `featureTag.${tagId}.entityKind`);
  const entityId = nonEmptyString(source.entityId, `featureTag.${tagId}.entityId`);
  requireEntityExists(entityKind, entityId, topology, tagId);
  return Object.freeze({ tagId, kind, entityKind, entityId, label: nonEmptyString(source.label, `featureTag.${tagId}.label`) });
}

function requireEntityExists(entityKind, entityId, topology, tagId) {
  const collection = { VERTEX: topology.vertices, CURVE: topology.curves, REGION: topology.regions }[entityKind];
  const idField = { VERTEX: 'vertexId', CURVE: 'curveId', REGION: 'regionId' }[entityKind];
  if (!collection.some((entity) => entity[idField] === entityId)) {
    throw new LafeaGeometryError(`featureTag.${tagId} references an unresolved ${entityKind}: ${entityId}`, 'UNRESOLVED_TAG_ENTITY');
  }
}

/**
 * Canonicalize a full tag set against an accepted topology. Duplicate tag
 * IDs are rejected; every reference must resolve.
 *
 * @param {object[]} source Candidate tags.
 * @param {Readonly<object>} topology Accepted `canonicalTopology` output.
 * @returns {readonly object[]} Frozen, canonical tags in declared order.
 */
export function canonicalFeatureTagSet(source, topology) {
  if (!Array.isArray(source)) throw new LafeaGeometryError('featureTags must be an array', 'NOT_AN_ARRAY');
  const seen = new Set();
  const tags = source.map((tag) => {
    const canonical = canonicalFeatureTag(tag, topology);
    if (seen.has(canonical.tagId)) throw new LafeaGeometryError(`Duplicate feature tag: ${canonical.tagId}`, 'DUPLICATE_TAG');
    seen.add(canonical.tagId);
    return canonical;
  });
  return Object.freeze(tags);
}

export function tagsOfKind(tags, kind) {
  member(kind, FEATURE_TAG_KINDS, 'kind');
  return Object.freeze(tags.filter((tag) => tag.kind === kind));
}
