import { createDiagnostic, DIAGNOSTIC_SEVERITY, normalizeDiagnosticRows, sortDiagnostics } from '../diagnostics.js';
import { evidenceValue } from '../evidence.js';
import { deepFreeze, stringValue } from '../immutable.js';
import { validateSharedPipingModel } from '../shared-piping-model.js';

export const CALCULATION_WORKSPACE_SCHEMA = 'calculation-workspace/v1';
const CONTAINER_TYPES = new Set(['BRANCH', 'GROUP', 'MODEL', 'ROOT', 'FOLDER', 'SYSTEM', 'ZONE']);

export function projectSharedPipingModelToCalculationWorkspace(model) {
  assertSharedModel(model);
  const diagnostics = normalizeDiagnosticRows(model.diagnostics, 'sharedModel');
  const containers = compatibilityContainers(model, diagnostics);
  const objects = [...containers, ...model.components.map(componentObject)];
  const supports = model.supports.map(supportObject);
  const workspace = {
    schema: CALCULATION_WORKSPACE_SCHEMA,
    sourcePackageSchema: model.sourceSnapshotRef.sourceSchema,
    importSource: model.project.sourceName,
    importedAt: '',
    packageMeta: {
      source: { sharedModelSemanticHash: model.semanticHash },
      axisTransform: {},
      packageHash: model.sourceSnapshotRef.sourceSemanticHash,
    },
    dataset: { objects, supports, branches: [], axisTransform: {} },
    enrichment: { diagnostics: sortDiagnostics(diagnostics) },
  };
  return deepFreeze({ ...workspace, summary: workspaceSummary(objects, supports, diagnostics) });
}

function componentObject(component) {
  const properties = component.engineeringProperties || {};
  const compatibility = component.compatibilityEvidence || {};
  const geometry = component.geometry || {};
  const enrichedAttributes = flatEnrichedAttributes(properties);
  return deepFreeze({
    id: component.componentKey,
    name: component.name,
    type: component.type,
    sourcePath: component.sourceReferences?.sourcePath || geometry.sourcePath || '',
    sourceAttributes: sourceAttributes(component.identity, compatibility),
    attributes: { enrichment: nestedEnrichment(component.identity, properties, compatibility) },
    enrichedAttributes,
    nativeParams: nativeGeometry(geometry),
    ...(geometry.start ? { apos: geometry.start } : {}),
    ...(geometry.end ? { lpos: geometry.end } : {}),
    ...(geometry.center ? { center: geometry.center } : {}),
    diagnostics: component.diagnostics || [],
  });
}

function supportObject(support) {
  const compatibility = support.compatibilityEvidence || {};
  return deepFreeze({
    id: support.supportKey,
    name: support.name,
    type: support.type,
    sourcePath: support.sourceReferences?.sourcePath || '',
    sourceAttributes: {
      ...identityAttributes(support.identity),
      ...pointField('POS', support.position),
      ...compatibilityAttributes(compatibility),
    },
    attributes: {},
    enrichedAttributes: flatEnrichedAttributes(support.engineeringProperties || {}),
    nativeParams: support.position ? { center: pointArray(support.position) } : {},
    ...(support.position ? { center: support.position } : {}),
    diagnostics: support.diagnostics || [],
  });
}

function compatibilityContainers(model, diagnostics) {
  const refs = (model.sourceReferences?.nodes || []).filter((row) => CONTAINER_TYPES.has(normalizedType(row.type)));
  const counts = sourceIdCounts(refs);
  return refs.map((row) => {
    const sourceId = stringValue(row.sourceEntityId);
    const id = sourceId && counts[sourceId] === 1 ? sourceId : row.sourceNodeKey;
    diagnostics.push(createDiagnostic('CALCULATION_CONTAINER_COMPATIBILITY_RECORD', 'Source container is retained only for calculation-workspace compatibility.', {
      severity: DIAGNOSTIC_SEVERITY.INFO, scope: row.sourceNodeKey, type: row.type,
    }));
    return deepFreeze({ id, name: row.name || id, type: row.type, sourcePath: row.sourcePath || '', sourceAttributes: {}, attributes: {}, enrichedAttributes: {}, nativeParams: {}, diagnostics: [] });
  });
}

function flatEnrichedAttributes(properties) {
  return compact({
    pipeOdMm: evidenceValue(properties.outerDiameterMm),
    wallThicknessMm: evidenceValue(properties.wallThicknessMm),
    nominalBoreMm: evidenceValue(properties.nominalBoreMm),
    material: evidenceValue(properties.materialName),
    materialDensityKgM3: evidenceValue(properties.materialDensityKgM3),
    pipeWeightKgPerM: evidenceValue(properties.unitPipeWeightKgPerM),
    componentWeightKg: evidenceValue(properties.componentWeightKg),
    insulationThicknessMm: evidenceValue(properties.insulationThicknessMm),
    insulationDensityKgM3: evidenceValue(properties.insulationDensityKgM3),
    insulationWeightKgPerM: evidenceValue(properties.insulationWeightKgPerM),
    fluidDensityOpeKgM3: evidenceValue(properties.fluidDensityOpeKgM3),
    fluidDensityHydKgM3: evidenceValue(properties.fluidDensityHydKgM3),
    fluidWeightOpeKgPerM: evidenceValue(properties.fluidWeightOpeKgPerM),
    fluidWeightHydKgPerM: evidenceValue(properties.fluidWeightHydKgPerM),
  });
}

function nestedEnrichment(identity, properties, compatibility) {
  const flat = flatEnrichedAttributes(properties);
  return compact({
    schema: 'shared-piping-model-calculation-projection/v1',
    lineList: compact({
      lineNo: identity?.lineId || undefined,
      lineKey: identity?.lineId || undefined,
      fluidDensityOpeKgM3: flat.fluidDensityOpeKgM3,
      fluidDensityHydKgM3: flat.fluidDensityHydKgM3,
      fluidWeightOpeKgPerM: flat.fluidWeightOpeKgPerM,
      fluidWeightHydKgPerM: flat.fluidWeightHydKgPerM,
      insulationThicknessMm: flat.insulationThicknessMm,
      insulationDensityKgM3: flat.insulationDensityKgM3,
      pipeOdMm: flat.pipeOdMm,
    }),
    pipingClass: compact({ wallThicknessMm: flat.wallThicknessMm, pipeOdMm: flat.pipeOdMm, materialName: flat.material }),
    material: compact({ materialName: flat.material, materialDensityKgM3: flat.materialDensityKgM3 }),
    weight: compact({ unitPipeWeightKgPerM: flat.pipeWeightKgPerM, componentWeightKg: flat.componentWeightKg, bestWeightKg: flat.componentWeightKg, insulationWeightKgPerM: flat.insulationWeightKgPerM }),
    audit: { status: 'shared-model-projection', needsReview: false, missing: [], conflicts: [], sources: evidenceSources(properties, compatibility), trace: {}, diagnostics: [] },
  });
}

function sourceAttributes(identity, compatibility) {
  return { ...identityAttributes(identity), ...compatibilityAttributes(compatibility) };
}

function identityAttributes(identity = {}) {
  return compact({ LINE_ID: identity.lineId, BRANCH_ID: identity.branchId, SYSTEM_ID: identity.systemId, ZONE_ID: identity.zoneId });
}

function compatibilityAttributes(evidence) {
  return compact({
    LENGTH_MM: evidenceValue(evidence.sourceLengthMm),
    CHAINAGE_START_MM: evidenceValue(evidence.sourceChainageStartMm),
    CHAINAGE_END_MM: evidenceValue(evidence.sourceChainageEndMm),
    CHAINAGE_CENTER_MM: evidenceValue(evidence.sourceChainageCenterMm),
    VERTICAL_CAPABILITY: evidenceValue(evidence.supportVerticalCapability),
    SUPPORT_TYPE: evidenceValue(evidence.supportType),
  });
}

function nativeGeometry(geometry) {
  return compact({
    startPoint: geometry.start ? pointArray(geometry.start) : undefined,
    endPoint: geometry.end ? pointArray(geometry.end) : undefined,
    center: geometry.center ? pointArray(geometry.center) : undefined,
    branchPoints: geometry.branchPoints?.length ? geometry.branchPoints.map(pointArray) : undefined,
  });
}

function evidenceSources(properties, compatibility) {
  return Object.fromEntries(Object.entries({ ...properties, ...compatibility }).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, value?.sourcePath || '']));
}

function workspaceSummary(objects, supports, diagnostics) {
  return {
    objects: objects.length,
    pipes: objects.filter((row) => normalizedType(row.type).includes('PIPE')).length,
    supports: supports.length,
    branches: 0,
    resolved: 0,
    conflicts: 0,
    missing: diagnostics.filter((row) => row.severity === 'ERROR').length,
    approximate: 0,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

function pointField(field, point) {
  return point ? { [field]: { x: point.x, y: point.y, z: point.z } } : {};
}

function pointArray(point) {
  return [point.x, point.y, point.z];
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined && child !== null && child !== ''));
}

function sourceIdCounts(rows) {
  return rows.reduce((counts, row) => { const id = stringValue(row.sourceEntityId); if (id) counts[id] = (counts[id] || 0) + 1; return counts; }, {});
}

function normalizedType(value) {
  return stringValue(value).toUpperCase();
}

function assertSharedModel(model) {
  const validation = validateSharedPipingModel(model);
  if (!validation.ok) throw new TypeError(`Calculation projection requires a valid shared model: ${validation.errors.join(' ')}`);
}
