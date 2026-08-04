import { freezeDeep } from './dataset-utils.js';

export const SUPPORT_LOAD_VIEWPORT_CALLOUT_SCHEMA =
  'support-load-viewport-callout/v1';

/**
 * Projects already-qualified presenter output onto exact canonical support-site
 * identities. This module performs no load calculation, redistribution, sign
 * change, defaulting, or coordinate-based matching.
 */
export function projectSupportLoadViewportCallouts({
  dataset,
  supportSiteModel,
  presenter,
}) {
  assertInputs(dataset, supportSiteModel, presenter);
  const entities = exactEntityIndex(dataset.entities);
  const seenSites = new Set();
  const seenObjects = new Set();
  const rows = [];

  for (const site of [...supportSiteModel.sites].sort(compareSites)) {
    const siteId = identity(site?.siteId, 'site.siteId');
    const objectId = identity(site?.primaryEntityId, 'site.primaryEntityId');
    if (seenSites.has(siteId)) {
      fail('Duplicate canonical support-site identity.',
        'NON_FEA_PRESENTATION_DUPLICATE_SITE_ID', { siteId });
    }
    if (seenObjects.has(objectId)) {
      fail('Multiple support sites resolve to the same primary entity.',
        'NON_FEA_PRESENTATION_DUPLICATE_PRIMARY_ENTITY', { objectId });
    }
    seenSites.add(siteId);
    seenObjects.add(objectId);

    const entity = entities.get(objectId);
    if (!entity) {
      fail('Support load result does not map to an exact dataset entity.',
        'SUPPORT_LOAD_SITE_IDENTITY_MISMATCH', { siteId, primaryEntityId: objectId });
    }

    const qualified = presenter.getResultCallouts(entity)
      .filter((row) => row?.resultKind === 'EMPIRICAL_SUPPORT_REACTION');
    if (qualified.length > 1) {
      fail('A support site produced multiple empirical presentation results.',
        'NON_FEA_PRESENTATION_AMBIGUOUS_EMPIRICAL_RESULT', {
          siteId,
          primaryEntityId: objectId,
          resultCount: qualified.length,
        });
    }
    if (qualified.length === 0) continue;

    const result = qualified[0];
    if (!Number.isFinite(result.forceN)
      || !Number.isFinite(result.forcekN)
      || typeof result.label !== 'string'
      || result.label.length === 0
      || result.direction !== 'V') {
      fail('Presenter returned an invalid empirical callout.',
        'NON_FEA_PRESENTATION_EMPIRICAL_CALLOUT_INVALID', {
          siteId,
          primaryEntityId: objectId,
        });
    }
    rows.push({
      schema: SUPPORT_LOAD_VIEWPORT_CALLOUT_SCHEMA,
      siteId,
      objectId,
      label: result.label,
      forceN: result.forceN,
      forcekN: result.forcekN,
      direction: result.direction,
      resultKind: result.resultKind,
    });
  }

  return freezeDeep(rows);
}

function exactEntityIndex(entities) {
  if (!Array.isArray(entities)) {
    fail('Viewport callout projection requires dataset entities.',
      'NON_FEA_PRESENTATION_DATASET_INVALID');
  }
  const index = new Map();
  for (const entity of entities) {
    const entityId = identity(entity?.entityId, 'entity.entityId');
    if (index.has(entityId)) {
      fail('Dataset contains a duplicate entity identity.',
        'NON_FEA_PRESENTATION_DUPLICATE_ENTITY_ID', { entityId });
    }
    index.set(entityId, entity);
  }
  return index;
}

function assertInputs(dataset, supportSiteModel, presenter) {
  if (!dataset || typeof dataset !== 'object') {
    fail('Viewport callout projection requires an active dataset.',
      'NON_FEA_PRESENTATION_DATASET_INVALID');
  }
  if (!supportSiteModel || !Array.isArray(supportSiteModel.sites)) {
    fail('Viewport callout projection requires a canonical support-site model.',
      'NON_FEA_PRESENTATION_SUPPORT_SITE_MODEL_INVALID');
  }
  if (typeof presenter?.getResultCallouts !== 'function') {
    fail('Viewport callout projection requires SupportLoadPresenter.',
      'NON_FEA_PRESENTATION_PRESENTER_INVALID');
  }
}

function identity(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    fail(`${label} must be a non-empty trimmed string.`,
      'NON_FEA_PRESENTATION_IDENTITY_INVALID', { label });
  }
  return value;
}

function compareSites(left, right) {
  return compareCodeUnits(left?.siteId, right?.siteId)
    || compareCodeUnits(left?.primaryEntityId, right?.primaryEntityId);
}

function compareCodeUnits(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(message, code, details = null) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.details = details === null ? null : freezeDeep(details);
  throw error;
}
