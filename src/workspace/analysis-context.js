import { connectedPipeComponent } from './analysis-connectivity.js';
import { hasOverride, overrideValue } from './analysis-input-evidence.js';
import { freezeDeep, stringValue } from './dataset-utils.js';

const PIPE_REFERENCE_KEYS = [
  'PIPE_ID',
  'PARENT_PIPE_ID',
  'SOURCE_PIPE_ID',
  'OWNER_PIPE_ID',
];

const LINE_KEYS = ['LINE_NO', 'LINENO', 'LINE_NUMBER', 'LINE_ID', 'LINE'];

const SCREENING_ALIASES = Object.freeze({
  alpha: ['ALPHA', 'ALPHA_PER_C', 'THERMAL_EXPANSION_COEFFICIENT', 'THERMAL_EXPANSION_COEFF'],
  E: ['E_MPA', 'ELASTIC_MODULUS_MPA', 'YOUNGS_MODULUS_MPA', 'ELASTIC_MODULUS'],
  od: ['PIPE_OD', 'PIPEOD', 'OD_MM', 'OUTSIDE_DIAMETER_MM', 'OUTSIDE_DIAMETER', 'OD'],
  Sa: ['SA_MPA', 'ALLOWABLE_STRESS_MPA', 'ALLOWABLE_STRESS', 'SA'],
});

export function createAnalysisContext(workspaceState, targetId) {
  const snapshot = workspaceState.getSnapshot();
  const entity = workspaceState.getEntity(targetId);
  if (snapshot.status !== 'ready' || !snapshot.dataset || !entity) {
    throw new Error(`Analysis target is not available in the active dataset: ${targetId}.`);
  }
  return freezeDeep({
    targetId: entity.entityId,
    entity,
    dataset: snapshot.dataset,
    selectedEntityId: snapshot.selectedEntityId,
    version: snapshot.version,
  });
}

export function resolvePipeEntity(context) {
  if (context.entity.category === 'pipe') return context.entity;
  if (context.entity.category !== 'support') return null;

  const explicitId = firstString(context.entity, PIPE_REFERENCE_KEYS);
  if (explicitId) {
    const explicit = context.dataset.entities.find((entity) => (
      entity.category === 'pipe' && entity.entityId === explicitId
    ));
    if (explicit) return explicit;
  }

  const lineKey = resolveLineKey(context.entity);
  if (!lineKey) return null;
  const candidates = context.dataset.entities.filter((entity) => (
    entity.category === 'pipe' && resolveLineKey(entity) === lineKey
  ));
  return candidates.length === 1 ? candidates[0] : null;
}

export function toSupportLoadSource(pipeEntity) {
  const properties = pipeEntity.properties || {};
  const geometry = properties.geometry || {};
  const nativeParams = properties.nativeParams || {};
  return freezeDeep({
    id: pipeEntity.entityId,
    name: pipeEntity.name,
    type: pipeEntity.entityType,
    sourcePath: pipeEntity.sourcePath,
    sourceAttributes: properties.sourceAttributes || {},
    attributes: properties.attributes || {},
    enrichedAttributes: properties.enrichedAttributes || {},
    nativeParams,
    apos: geometry.start || nativeParams.startPoint || null,
    lpos: geometry.end || nativeParams.endPoint || null,
    center: geometry.center || nativeParams.center || null,
  });
}

export function buildPipeScreeningInput(context) {
  if (context.entity.category !== 'pipe') {
    return disabledScreening('Pipe flexibility screening requires a selected pipe.');
  }

  const lineKey = resolveLineKey(context.entity);
  if (!lineKey) {
    return disabledScreening('Pipe flexibility screening requires an explicit line identity.', ['lineIdentity']);
  }
  const candidates = context.dataset.entities.filter((entity) => (
    entity.category === 'pipe'
    && resolveLineKey(entity) === lineKey
    && entity.properties?.geometry?.start
    && entity.properties?.geometry?.end
  ));
  const lineEntities = connectedPipeComponent(context.entity, candidates);
  const parameterEvidence = screeningParameterEvidence(context);
  const params = Object.fromEntries(
    Object.entries(parameterEvidence).map(([key, evidence]) => [key, evidence.value]),
  );
  const missingParameters = Object.entries(params)
    .filter(([, value]) => !Number.isFinite(value) || value <= 0)
    .map(([field]) => field);

  if (lineEntities.length < 2) {
    return disabledScreening(
      'At least two connected pipe legs on the selected line are required.',
      ['connectedLineSegments', ...missingParameters],
      { lineKey, lineEntities, params, parameterEvidence },
    );
  }
  if (missingParameters.length) {
    return disabledScreening(
      `Explicit engineering inputs are missing: ${missingParameters.join(', ')}.`,
      missingParameters,
      { lineKey, lineEntities, params, parameterEvidence },
    );
  }

  const projected = projectLineEntities(lineEntities);
  return freezeDeep({
    enabled: true,
    reason: '',
    missing: [],
    lineKey,
    input: {
      nodes: projected.nodes,
      segments: projected.segments,
      warnings: [],
      diagnostics: [],
    },
    params,
    parameterEvidence,
    sourceEntityIds: lineEntities.map((entity) => entity.entityId),
    projectionAxes: projected.axes,
    connectedSegmentCount: lineEntities.length,
  });
}

export function resolveLineKey(entity) {
  const explicit = firstString(entity, LINE_KEYS);
  if (explicit) return `LINE:${explicit.toUpperCase()}`;
  const path = stringValue(entity.sourcePath);
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return `PATH:${path}`;
  return `PATH:/${parts.slice(0, -1).join('/')}`;
}

export function firstNumber(entity, aliases) {
  const evidence = firstValueEvidence(entity, aliases);
  if (!evidence.found || evidence.value === '') return null;
  const number = Number(evidence.value);
  return Number.isFinite(number) ? number : null;
}

function firstString(entity, aliases) {
  const evidence = firstValueEvidence(entity, aliases);
  return stringValue(evidence.found ? evidence.value : '');
}

function screeningParameterEvidence(context) {
  return freezeDeep({
    deltaT: deltaTEvidence(context),
    alpha: numberEvidence(context, 'alpha', SCREENING_ALIASES.alpha),
    E: numberEvidence(context, 'E', SCREENING_ALIASES.E),
    od: numberEvidence(context, 'od', SCREENING_ALIASES.od),
    Sa: numberEvidence(context, 'Sa', SCREENING_ALIASES.Sa),
  });
}

function numberEvidence(context, key, aliases) {
  if (hasOverride(context, key)) {
    return evidence(Number(overrideValue(context, key)), 'override', `analysisSession.overrides.${key}`);
  }
  const found = firstValueEvidence(context.entity, aliases);
  const value = found.found ? Number(found.value) : null;
  return evidence(Number.isFinite(value) ? value : null, found.found ? 'source' : 'missing', found.path);
}

function deltaTEvidence(context) {
  if (hasOverride(context, 'deltaT')) {
    return evidence(Number(overrideValue(context, 'deltaT')), 'override', 'analysisSession.overrides.deltaT');
  }
  const direct = firstValueEvidence(context.entity, ['DELTA_T', 'DELTAT', 'TEMPERATURE_DIFFERENCE_C']);
  if (direct.found && Number.isFinite(Number(direct.value))) {
    return evidence(Number(direct.value), 'source', direct.path);
  }
  const operating = firstValueEvidence(context.entity, ['TEMP_EXP_C1', 'TEMP_C1', 'T1', 'OPERATING_TEMPERATURE_C']);
  const reference = firstValueEvidence(context.entity, ['REFERENCE_TEMP_C', 'TREF', 'AMBIENT_TEMP_C']);
  if (!operating.found || !reference.found) return evidence(null, 'missing', '');
  const value = Math.abs(Number(operating.value) - Number(reference.value));
  return evidence(Number.isFinite(value) ? value : null, 'derived', `${operating.path} - ${reference.path}`);
}

function firstValueEvidence(entity, aliases) {
  const wanted = new Set(aliases.map(normalizeKey));
  const roots = [
    ['properties.sourceAttributes', entity.properties?.sourceAttributes],
    ['properties.attributes', entity.properties?.attributes],
    ['properties.enrichedAttributes', entity.properties?.enrichedAttributes],
    ['properties.nativeParams', entity.properties?.nativeParams],
  ];
  for (const [rootPath, root] of roots) {
    const match = findValue(root, wanted, 0, rootPath);
    if (match.found) return match;
  }
  return { found: false, value: null, path: '' };
}

function findValue(value, wanted, depth, path) {
  if (!value || typeof value !== 'object' || depth > 5) return { found: false };
  for (const [key, child] of Object.entries(value)) {
    if (wanted.has(normalizeKey(key))) return { found: true, value: child, path: `${path}.${key}` };
  }
  for (const [key, child] of Object.entries(value)) {
    const nested = findValue(child, wanted, depth + 1, `${path}.${key}`);
    if (nested.found) return nested;
  }
  return { found: false };
}

function projectLineEntities(entities) {
  const allPoints = entities.flatMap((entity) => [
    entity.properties.geometry.start,
    entity.properties.geometry.end,
  ]);
  const spans = ['x', 'y', 'z'].map((axis) => ({
    axis,
    span: Math.max(...allPoints.map((point) => point[axis]))
      - Math.min(...allPoints.map((point) => point[axis])),
  })).sort((a, b) => b.span - a.span);
  const axes = spans.slice(0, 2).map((entry) => entry.axis);
  const nodes = {};
  const segments = entities.map((entity) => {
    const startId = `${entity.entityId}:start`;
    const endId = `${entity.entityId}:end`;
    const start = entity.properties.geometry.start;
    const end = entity.properties.geometry.end;
    nodes[startId] = { pos: [start[axes[0]], start[axes[1]], 0] };
    nodes[endId] = { pos: [end[axes[0]], end[axes[1]], 0] };
    return {
      id: entity.entityId,
      start: startId,
      end: endId,
      trueLength: Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z),
    };
  });
  return freezeDeep({ axes, nodes, segments });
}

function disabledScreening(reason, missing = [], details = {}) {
  return freezeDeep({
    enabled: false,
    reason,
    missing,
    input: null,
    params: details.params || null,
    parameterEvidence: details.parameterEvidence || {},
    lineKey: details.lineKey || '',
    sourceEntityIds: (details.lineEntities || []).map((entity) => entity.entityId),
    connectedSegmentCount: (details.lineEntities || []).length,
    projectionAxes: [],
  });
}

function evidence(value, source, path) {
  return freezeDeep({ value, source: value == null ? 'missing' : source, sourcePath: path || '' });
}

function normalizeKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}
