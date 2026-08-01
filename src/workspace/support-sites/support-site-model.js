import { freezeDeep, stringValue } from '../dataset-utils.js';
import { projectDataValue } from '../project-data/project-data-contract.js';

export const SUPPORT_SITE_MODEL_SCHEMA = 'support-site-model/v1';

/**
 * Converts source support members into tag-preserving assemblies and physical
 * sites. Exact coordinate equality is authoritative; a nonzero approximate
 * grouping tolerance is used only when approved in Project Data.
 */
export function buildSupportSiteModel(dataset, profile) {
  assertDataset(dataset);
  const tolerance = projectDataValue(profile, 'topology.supportSiteGroupingToleranceMm');
  const members = dataset.entities.filter((entity) => entity.category === 'support').map(toMember);
  const assemblyGroups = groupMembers(members, tolerance);
  const assemblies = [...assemblyGroups.values()].map(toAssembly);
  const siteGroups = groupAssembliesByLocation(assemblies, tolerance);
  const sites = [...siteGroups.values()].map(toSite);
  return freezeDeep({
    schema: SUPPORT_SITE_MODEL_SCHEMA,
    datasetId: dataset.datasetId,
    sourceAxisBasis: 'Z_UP',
    groupingToleranceMm: Number.isFinite(tolerance) ? tolerance : null,
    status: Number.isFinite(tolerance) ? 'READY' : 'BLOCKED',
    blockers: Number.isFinite(tolerance) ? [] : [{ code: 'MISSING_SUPPORT_SITE_GROUPING_TOLERANCE', projectDataPath: 'topology.supportSiteGroupingToleranceMm' }],
    members,
    assemblies,
    sites,
    summary: {
      sourceSupportRecordCount: members.length,
      supportAssemblyCount: assemblies.length,
      physicalLocationCount: sites.length,
    },
  });
}

export function findSupportSiteByEntityId(model, entityId) {
  const id = stringValue(entityId);
  return model?.sites?.find((site) => site.memberEntityIds.includes(id)) || null;
}

function toMember(entity) {
  const attributes = entity.properties?.attributes || {};
  const point = entity.properties?.geometry?.center || entity.properties?.geometry?.start;
  if (!point) throw new Error(`Support ${entity.entityId} has no source coordinate.`);
  return freezeDeep({
    entityId: entity.entityId,
    sourceEntityId: entity.sourceEntityId,
    componentReference: entity.componentReference,
    jsonPointer: entity.jsonPointer,
    branchId: entity.branchId,
    lineKey: entity.lineKey,
    tag: canonicalTag(attributes, entity),
    sourceTag: stringValue(attributes.SUPPORT_TAG || attributes.CMPSUPREFN || attributes.NAME),
    sourceType: stringValue(attributes.SUPPORT_TYPE || attributes.SUPPORT_KIND || attributes.CMPSUPTYPE),
    positionMm: point,
    dtxr: stringValue(attributes.DTXR),
  });
}

function canonicalTag(attributes, entity) {
  const raw = stringValue(attributes.SUPPORT_TAG || attributes.CMPSUPREFN || attributes.NAME || entity.name)
    .replace(/^\//, '').replace(/\(REF\)$/i, '')
    .replace(/\/(?:DATUM|SREF)$/i, '').replace(/\.\d+$/i, '');
  return raw || stringValue(entity.componentReference || entity.entityId);
}

function groupMembers(members, tolerance) {
  const groups = new Map();
  members.forEach((member) => {
    const location = locateExistingGroup(groups, member.positionMm, tolerance, member.tag);
    const key = location || `${member.branchId}|${member.tag}|${pointKey(member.positionMm)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(member);
  });
  return groups;
}

function groupAssembliesByLocation(assemblies, tolerance) {
  const groups = new Map();
  assemblies.forEach((assembly) => {
    const location = locateExistingGroup(groups, assembly.positionMm, tolerance, null);
    const key = location || pointKey(assembly.positionMm);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(assembly);
  });
  return groups;
}

function locateExistingGroup(groups, point, tolerance, tag) {
  for (const [key, rows] of groups) {
    const sample = rows[0]?.positionMm || rows[0]?.[0]?.positionMm;
    const sampleTag = rows[0]?.tag;
    if (tag !== null && sampleTag !== tag) continue;
    if (samePoint(sample, point, tolerance)) return key;
  }
  return null;
}

function toAssembly(members) {
  const first = members[0];
  return freezeDeep({
    assemblyId: `support-assembly:${first.branchId}:${first.tag}:${pointKey(first.positionMm)}`,
    tag: first.tag,
    branchId: first.branchId,
    lineKey: first.lineKey,
    positionMm: first.positionMm,
    memberEntityIds: members.map((member) => member.entityId),
    members,
  });
}

function toSite(assemblies) {
  const first = assemblies[0];
  const memberEntityIds = assemblies.flatMap((assembly) => assembly.memberEntityIds);
  return freezeDeep({
    siteId: `support-site:${pointKey(first.positionMm)}`,
    positionMm: first.positionMm,
    tags: assemblies.map((assembly) => assembly.tag),
    assemblyIds: assemblies.map((assembly) => assembly.assemblyId),
    memberEntityIds,
    primaryEntityId: memberEntityIds[0],
    branchIds: [...new Set(assemblies.map((assembly) => assembly.branchId))],
    assemblies,
  });
}

function samePoint(left, right, tolerance) {
  if (!left || !right) return false;
  if (!Number.isFinite(tolerance)) return pointKey(left) === pointKey(right);
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z) <= tolerance;
}

function pointKey(point) { return `${point.x}|${point.y}|${point.z}`; }
function assertDataset(dataset) { if (!dataset?.datasetId || !Array.isArray(dataset.entities)) throw new TypeError('Support-site model requires a workspace dataset.'); }
