import { freezeDeep } from './dataset-utils.js';
import { calculatePrimitiveBounds } from './engineering-geometry-math.js';
import { MODEL_ZONE_PROJECTION_SCHEMA } from './model-zone-selector.js';
import { summarizeGeometry } from './resolved-engineering-outcomes.js';
import { RESOLVED_ENGINEERING_GEOMETRY_SCHEMA } from './resolved-engineering-geometry.js';
import { SUPPORT_SITE_MODEL_SCHEMA } from './support-sites/support-site-model.js';

export function projectSupportSiteModelForModelZone(model, projection) {
  assertProjection(projection);
  if (!model) return null;
  assertSupportModel(model, projection.datasetId);
  if (!projection.zoneId) return model;
  const allowed = new Set(projection.entityIds);
  const sites = model.sites.filter((site) =>
    site.memberEntityIds.some((entityId) => allowed.has(entityId)));
  const assemblyIds = new Set(sites.flatMap((site) => site.assemblyIds));
  const assemblies = model.assemblies.filter((assembly) =>
    assemblyIds.has(assembly.assemblyId));
  const memberIds = new Set(assemblies.flatMap((assembly) =>
    assembly.memberEntityIds));
  const members = model.members.filter((member) =>
    memberIds.has(member.entityId));
  return Object.freeze({
    ...model,
    members: Object.freeze([...members]),
    assemblies: Object.freeze([...assemblies]),
    sites: Object.freeze([...sites]),
    summary: freezeDeep({
      sourceSupportRecordCount: members.length,
      supportAssemblyCount: assemblies.length,
      physicalLocationCount: sites.length,
    }),
  });
}

export function filterResolvedGeometryForModelZone(
  model,
  projection,
  projectedSupportModel = null,
) {
  assertResolvedModel(model, projection);
  if (!projection.zoneId) return model;
  if (projectedSupportModel) {
    assertSupportModel(projectedSupportModel, projection.datasetId);
  }
  const allowed = new Set(projection.entityIds);
  const supportEntityIds = new Set(
    (projectedSupportModel?.sites ?? []).map((site) => site.primaryEntityId),
  );
  const includes = (item) =>
    allowed.has(item.entityId) || supportEntityIds.has(item.entityId);
  const items = model.items.filter(includes);
  const skipped = model.skipped.filter(includes);
  return Object.freeze({
    ...model,
    items: Object.freeze([...items]),
    skipped: Object.freeze([...skipped]),
    skippedEntityIds: Object.freeze(skipped.map((item) => item.entityId)),
    bounds: calculatePrimitiveBounds(items),
    summary: summarizeGeometry(items, skipped),
  });
}

function assertProjection(projection) {
  if (projection?.schema !== MODEL_ZONE_PROJECTION_SCHEMA
    || !Array.isArray(projection.entityIds)) {
    throw new TypeError(`Zone viewport projection requires ${MODEL_ZONE_PROJECTION_SCHEMA}.`);
  }
}

function assertResolvedModel(model, projection) {
  assertProjection(projection);
  if (model?.schema !== RESOLVED_ENGINEERING_GEOMETRY_SCHEMA
    || model.datasetId !== projection.datasetId) {
    throw new TypeError(`Zone filtering requires a matching ${RESOLVED_ENGINEERING_GEOMETRY_SCHEMA}.`);
  }
}

function assertSupportModel(model, datasetId) {
  if (model?.schema !== SUPPORT_SITE_MODEL_SCHEMA
    || model.datasetId !== datasetId
    || !Array.isArray(model.sites)
    || !Array.isArray(model.assemblies)
    || !Array.isArray(model.members)) {
    throw new TypeError(`Zone support projection requires a matching ${SUPPORT_SITE_MODEL_SCHEMA}.`);
  }
}
