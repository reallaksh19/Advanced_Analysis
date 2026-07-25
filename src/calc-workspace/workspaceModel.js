/**
 * Functionality: normalizes 3D_Viewer enriched workspace packages into an
 * isolated calculation workspace dataset, discovers dynamic object properties,
 * and derives render rows without mutating package input. Parameters: raw RVM
 * package JSON and UI selection data. Outputs: cloned workspace data, summary,
 * hierarchy rows, dynamic property rows, and renderable geometry primitives.
 * Fallback: unsupported package schemas throw explicit errors before import.
 */

export const CALCULATION_WORKSPACE_SCHEMA = 'calculation-workspace/v1';
export const RVM_SELECTED_GEOMETRY_WORKSPACE_PACKAGE_SCHEMA = 'rvm-selected-geometry-workspace-package/v1';
export const RVM_SELECTED_GEOMETRY_POST_MESSAGE_TYPE = 'rvm-selected-geometry-workspace-package';
export const PENDING_WORKSPACE_PACKAGE_STORAGE_KEY = 'rvmSelectedGeometryWorkspacePackage.pending';

const PIPE_TYPES = new Set(['PIPE', 'BEND', 'ELBOW', 'ELBO', 'TEE', 'FLAN', 'FLANGE', 'VALV', 'VALVE', 'REDU', 'REDUCER', 'GASK', 'GASKET', 'INST', 'INSTRUMENT', 'OLET']);
const SUPPORT_TYPES = new Set(['ATTA', 'SUPPORT', 'REST', 'GUIDE', 'LINESTOP', 'LINE_STOP', 'LIMIT', 'LIM', 'ANCHOR', 'SPRING']);
const MAX_PROPERTY_ROWS = 800;

export function normalizeCalculationWorkspacePackage(rawPackageJson, importSource, importedAt) {
  let packageJson = rawPackageJson;
  if (Array.isArray(packageJson)) {
    packageJson = { schema: 'inputxml-managed-stage/v1', objects: packageJson };
  }
  
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new TypeError('Calculation Workspace import must be a JSON object.');
  }
  
  let geometry;
  let sourceSchema = packageJson.schema;

  if (packageJson.schema === RVM_SELECTED_GEOMETRY_WORKSPACE_PACKAGE_SCHEMA) {
    geometry = objectValue(packageJson.geometry, 'geometry');
  } else if (packageJson.schema === 'inputxml-managed-stage/v1' || Array.isArray(packageJson.selected)) {
    sourceSchema = packageJson.schema || 'json-viewer-selection/v1';
    
    // Adapt selected primitives format
    const rawItems = Array.isArray(packageJson.selected) 
      ? packageJson.selected.map(s => s?.item).filter(Boolean)
      : Array.isArray(packageJson.objects) 
        ? packageJson.objects 
        : [];
        
    const items = [];
    function flatten(nodes) {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        items.push(node);
        if (Array.isArray(node.children)) flatten(node.children);
      }
    }
    flatten(rawItems);
        
    const objects = [];
    const supports = [];
    
    items.forEach(item => {
      const type = adaptedItemType(item);
      const adaptedItem = {
        ...item,
        id: stringValue(item?.sourceId || item?.id),
        type,
        diagnostics: inheritedDiagnostics(item),
      };

      // Stage JSON viewer enrichment ("Populate attributes") arrives as a flat
      // enrichedAttributes record; translate it into the attributes.enrichment
      // shape the support-load engine consumes.
      const enrichment = enrichmentFromEnrichedAttributes(item);
      if (enrichment) {
        adaptedItem.attributes = { ...(item.attributes || {}), enrichment };
      }
      
      // Plumb nativeParams start/end to apos/lpos if available
      if (item?.nativeParams?.startPoint) {
        adaptedItem.apos = item.nativeParams.startPoint;
      }
      if (item?.nativeParams?.endPoint) {
        adaptedItem.lpos = item.nativeParams.endPoint;
      }
      if (item?.nativeParams?.center) {
        adaptedItem.center = item.nativeParams.center;
      }

      if (isSupportLikeType(type)) {
        supports.push(adaptedItem);
      } else {
        objects.push(adaptedItem);
      }
    });
    
    geometry = {
      objects,
      supports,
      branches: []
    };
  } else {
    throw unsupportedPackageError(packageJson);
  }

  const objects = arrayValue(geometry.objects, 'geometry.objects').map(clonePlain);
  const supports = arrayValue(geometry.supports, 'geometry.supports').map(clonePlain);
  const branches = arrayValue(geometry.branches, 'geometry.branches').map(clonePlain);
  const workspace = {
    schema: CALCULATION_WORKSPACE_SCHEMA,
    sourcePackageSchema: sourceSchema,
    importSource: stringValue(importSource),
    importedAt: stringValue(importedAt),
    packageMeta: {
      source: clonePlain(packageJson.source || {}),
      axisTransform: clonePlain(packageJson.axisTransform || {}),
      packageHash: stringValue(packageJson.packageHash),
    },
    dataset: {
      objects,
      supports,
      branches,
      axisTransform: clonePlain(packageJson.axisTransform || {}),
    },
    enrichment: clonePlain(packageJson.enrichment || {}),
  };
  return freezeDeep({ ...workspace, summary: summarizeWorkspace(workspace) });
}

// Stage viewer schematic primitives carry their component identity in
// native.kind ('att-derived-<role>') / nativeParams.role rather than a type.
const NATIVE_ROLE_TYPES = Object.freeze({
  segment: 'PIPE',
  supportshoe: 'SUPPORT',
  valvebody: 'VALVE',
  leftseat: 'VALVE',
  rightseat: 'VALVE',
  leftendflange: 'VALVE',
  rightendflange: 'VALVE',
  actuator: 'VALVE',
  weldneckhub: 'FLANGE',
  raisedfacedisk: 'FLANGE',
  blindflangedisk: 'FLANGE',
  reducercone: 'REDUCER',
  gasketdisk: 'GASKET',
});

function adaptedItemType(item) {
  const direct = stringValue(item?.type || item?.kind || item?.attributes?.TYPE || item?.sourceAttributes?.TYPE);
  if (direct) return direct;
  const role = stringValue(item?.nativeParams?.role || stringValue(item?.native?.kind).replace(/^att-derived-/, '')).toLowerCase();
  return NATIVE_ROLE_TYPES[role] || 'OBJECT';
}

function enrichmentFromEnrichedAttributes(item) {
  const e = item?.enrichedAttributes;
  if (!e || typeof e !== 'object') return null;
  if (item?.attributes?.enrichment && typeof item.attributes.enrichment === 'object') return null;
  return {
    schema: 'stage-json-enriched-attributes-adapter/v1',
    lineList: {
      lineNo: stringValue(e.lineNo),
      lineKey: stringValue(e.lineKey || e.lineNo),
      p1: e.designPressure ?? e.designPressureMpa ?? '',
      t1: e.designTemperatureC ?? '',
      t2: e.operatingTemperatureC ?? '',
      t3: e.minimumTemperatureC ?? '',
      density: e.fluidDensityOpeKgM3 ?? e.fluidDensityKgM3 ?? '',
      fluidDensityKgM3: e.fluidDensityOpeKgM3 ?? e.fluidDensityKgM3 ?? null,
      fluidDensityOpeKgM3: e.fluidDensityOpeKgM3 ?? e.fluidDensityKgM3 ?? null,
      fluidDensityHydKgM3: e.fluidDensityHydKgM3 ?? null,
      fluidWeightOpeKgPerM: e.fluidWeightOpeKgPerM ?? null,
      fluidWeightHydKgPerM: e.fluidWeightHydKgPerM ?? null,
      insulationThicknessMm: e.insulationThicknessMm ?? null,
      insulationDensityKgM3: e.insulationDensityKgM3 ?? null,
      phase: stringValue(e.fluidPhase),
      nps: e.nominalBoreMm ?? null,
      pipeOdMm: e.pipeOdMm ?? null,
    },
    pipingClass: {
      className: stringValue(e.pipingClass),
      rating: stringValue(e.pressureRating),
      schedule: stringValue(e.schedule),
      wallThicknessMm: e.wallThicknessMm ?? null,
      corrosionAllowanceMm: e.corrosionAllowanceMm ?? null,
      materialName: stringValue(e.material),
      pipeOdMm: e.pipeOdMm ?? null,
    },
    material: {
      materialName: stringValue(e.material),
      materialCode: stringValue(e.materialCode),
      materialDensityKgM3: e.materialDensityKgM3 ?? null,
    },
    weight: {
      componentWeightKg: e.componentWeightKg ?? null,
      bestWeightKg: e.componentWeightKg ?? null,
      unitPipeWeightKgPerM: e.pipeWeightKgPerM ?? null,
      insulationWeightKgPerM: e.insulationWeightKgPerM ?? null,
    },
    audit: {
      status: stringValue(e.status),
      needsReview: e.needsReview === true,
      missing: Array.isArray(e.missing) ? [...e.missing] : [],
      conflicts: Array.isArray(e.conflicts) ? [...e.conflicts] : [],
      sources: clonePlain(e.sources || {}),
      trace: clonePlain(e.trace || {}),
      diagnostics: clonePlain(e.diagnostics || []),
    },
  };
}

function inheritedDiagnostics(item) {
  const rows = [
    ...(Array.isArray(item?.diagnostics) ? item.diagnostics : []),
    ...(Array.isArray(item?.enrichedAttributes?.diagnostics) ? item.enrichedAttributes.diagnostics : []),
  ];
  return [...new Map(rows.map((row) => [row?.id || JSON.stringify(row), clonePlain(row)])).values()];
}

function unsupportedPackageError(packageJson) {
  if (Array.isArray(packageJson?.children) || (packageJson?.type && packageJson?.attributes)) {
    return new Error('Raw RVM/staged JSON detected. Load it in 3D Viewer, run Enrich > E Workflow, then Send to Simplified or export the DB-enriched workspace package.');
  }
  return new Error(`Unsupported workspace package schema: ${stringValue(packageJson?.schema || 'missing')}.`);
}

export function summarizeWorkspace(workspace) {
  const objects = workspaceObjects(workspace);
  const supports = workspaceSupports(workspace);
  const branches = workspaceBranches(workspace);
  const stats = workspace?.enrichment?.stats || {};
  const pipes = objects.filter((object) => isPipeLikeType(object?.type)).length;
  const supportCount = supports.length || objects.filter((object) => isSupportLikeType(object?.type)).length;
  return freezeDeep({
    objects: objects.length,
    pipes,
    supports: supportCount,
    branches: branches.length,
    resolved: numberValue(stats.resolved),
    conflicts: numberValue(stats.conflicts),
    missing: numberValue(stats.missing),
    approximate: numberValue(stats.approximate),
    diagnostics: Array.isArray(workspace?.enrichment?.diagnostics) ? workspace.enrichment.diagnostics.map(clonePlain) : [],
  });
}

export function workspaceObjects(workspace) {
  return Array.isArray(workspace?.dataset?.objects) ? workspace.dataset.objects : [];
}

export function workspaceSupports(workspace) {
  return Array.isArray(workspace?.dataset?.supports) ? workspace.dataset.supports : [];
}

export function workspaceBranches(workspace) {
  return Array.isArray(workspace?.dataset?.branches) ? workspace.dataset.branches : [];
}

export function workspaceObjectById(workspace, objectId) {
  const wanted = stringValue(objectId);
  if (!wanted) return null;
  return workspaceObjects(workspace).find((object) => stringValue(object?.id) === wanted) || null;
}

export function selectedWorkspaceObject(workspace, selectedObjectId) {
  return workspaceObjectById(workspace, selectedObjectId) || workspaceObjects(workspace)[0] || null;
}

export function buildWorkspaceHierarchy(workspace) {
  const objects = workspaceObjects(workspace);
  const byId = new Map(objects.map((object) => [stringValue(object?.id), object]));
  
  const root = { id: 'root', label: 'Dataset', children: new Map(), objectIds: [], directObjectIds: [], pipeCount: 0, supportCount: 0 };
  const unassigned = [];

  objects.forEach((object) => {
    const row = {
      id: stringValue(object?.id),
      name: stringValue(object?.name || object?.sourceAttributes?.NAME),
      sourcePath: stringValue(object?.sourcePath)
    };
    
    // Fallback if no sourcePath
    if (!row.sourcePath) {
      unassigned.push(object);
      return;
    }

    const path = row.sourcePath;
    const parts = path.split('/').filter(Boolean);
    
    let current = root;
    let currentPath = '';
    
    // Create folders for everything except the last part (the leaf)
    if (parts.length > 1) {
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += '/' + parts[i];
        if (!current.children.has(currentPath)) {
          current.children.set(currentPath, {
            id: currentPath,
            label: parts[i],
            children: new Map(),
            objectIds: [],
            directObjectIds: [],
            pipeCount: 0,
            supportCount: 0
          });
        }
        current = current.children.get(currentPath);
        current.objectIds.push(row.id);
        if (isPipeLikeType(object?.type)) current.pipeCount++;
        if (isSupportLikeType(object?.type)) current.supportCount++;
      }
    }
    
    current.objectIds.push(row.id);
    current.directObjectIds.push(row.id);
    if (isPipeLikeType(object?.type)) current.pipeCount++;
    if (isSupportLikeType(object?.type)) current.supportCount++;
  });

  if (unassigned.length > 0) {
    const unassignedId = 'branch:unassigned';
    root.children.set(unassignedId, {
      id: unassignedId,
      label: 'Unassigned',
      children: new Map(),
      objectIds: unassigned.map((obj) => stringValue(obj?.id)).filter(Boolean),
      directObjectIds: unassigned.map((obj) => stringValue(obj?.id)).filter(Boolean),
      pipeCount: unassigned.filter((obj) => isPipeLikeType(obj?.type)).length,
      supportCount: unassigned.filter((obj) => isSupportLikeType(obj?.type)).length,
    });
  }

  function mapToArray(node) {
    return freezeDeep({
      id: node.id,
      label: node.label,
      objectIds: node.objectIds,
      directObjectIds: node.directObjectIds,
      objectCount: node.objectIds.length,
      pipeCount: node.pipeCount,
      supportCount: node.supportCount,
      children: Array.from(node.children.values()).map(mapToArray).sort((a, b) => a.label.localeCompare(b.label))
    });
  }

  return mapToArray(root).children;
}

export function workspaceObjectRows(workspace, limit) {
  const maxRows = numberValue(limit) || 500;
  return workspaceObjects(workspace).slice(0, maxRows).map((object) => {
    const enrichment = object?.attributes?.enrichment || {};
    return freezeDeep({
      id: stringValue(object?.id),
      name: stringValue(object?.name || object?.sourceAttributes?.NAME),
      type: stringValue(object?.type || object?.sourceAttributes?.TYPE || 'OBJECT'),
      sourcePath: stringValue(object?.sourcePath),
      lineNo: stringValue(enrichment.lineList?.lineNo || object?.sourceAttributes?.LINE_NO || object?.sourceAttributes?.LINENO),
      pipingClass: stringValue(enrichment.pipingClass?.className || object?.sourceAttributes?.PIPING_CLASS),
      status: workspaceObjectStatus(object),
      lengthMm: readObjectLengthMm(object),
    });
  });
}

export function workspaceObjectStatus(object) {
  const audit = object?.attributes?.enrichment?.audit || {};
  const conflicts = Array.isArray(audit.conflicts) ? audit.conflicts.length : 0;
  const missing = Array.isArray(audit.missing) ? audit.missing.length : 0;
  const confidence = numberMaybe(audit.confidence);
  if (conflicts) return 'conflict';
  if (missing || audit.needsReview) return 'review';
  if (confidence !== null && confidence > 0) return 'resolved';
  if (object?.attributes?.enrichment) return 'partial';
  return 'source';
}

export function flattenDynamicProperties(value) {
  const rows = [];
  visitProperty(value, '', rows);
  return freezeDeep(rows.slice(0, MAX_PROPERTY_ROWS));
}

export function renderableWorkspaceObjects(workspace) {
  const objects = workspaceObjects(workspace);
  const primitives = objects.map((object) => {
    const endpoints = readObjectEndpoints(object);
    return freezeDeep({
      id: stringValue(object?.id),
      name: stringValue(object?.name || object?.id),
      type: stringValue(object?.type || 'OBJECT'),
      status: workspaceObjectStatus(object),
      start: endpoints.start,
      end: endpoints.end,
      center: endpoints.center,
      lengthMm: endpoints.lengthMm,
      isPipe: isPipeLikeType(object?.type),
      isSupport: isSupportLikeType(object?.type),
    });
  }).filter((object) => object.center);
  return freezeDeep({ objects: primitives, bounds: calculateBounds(primitives) });
}

export function readObjectEndpoints(object) {
  const attrs = { ...(object?.attributes || {}), ...(object?.sourceAttributes || {}) };
  const start = readPoint(object?.apos) || readPoint(attrs.APOS) || readPointFromFields(attrs, 'APOS');
  let end = readPoint(object?.lpos) || readPoint(attrs.LPOS) || readPointFromFields(attrs, 'LPOS');
  const delta = readDelta(object?.delta) || readDeltaFromFields(attrs);
  if (start && !end && delta) end = freezeDeep({ x: start.x + delta.x, y: start.y + delta.y, z: start.z + delta.z });
  const center = start && end
    ? freezeDeep({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 })
    : start || end || readPoint(object?.center) || readPoint(attrs.CENTER) || readPointFromFields(attrs, 'CENTER');
  const lengthMm = start && end ? round3(distance(start, end)) : 0;
  return freezeDeep({ start, end, center, lengthMm });
}

export function readObjectLengthMm(object) {
  return readObjectEndpoints(object).lengthMm;
}

export function isPipeLikeType(type) {
  const normalized = normalizeKey(type);
  return PIPE_TYPES.has(normalized) || normalized.includes('PIPE') || normalized.includes('BEND') || normalized.includes('VALV');
}

export function isSupportLikeType(type) {
  const normalized = normalizeKey(type);
  return SUPPORT_TYPES.has(normalized) || normalized.includes('SUPPORT') || normalized.includes('ATTA') || normalized.includes('GUIDE');
}

export function numberMaybe(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const match = stringValue(value).replace(/,/g, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function stringValue(value) {
  return String(value ?? '').trim();
}

export function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

function visitProperty(value, path, rows) {
  if (rows.length >= MAX_PROPERTY_ROWS) return;
  if (!value || typeof value !== 'object') {
    if (path) rows.push({ path, value: displayValue(value), type: value === null ? 'null' : typeof value });
    return;
  }
  if (Array.isArray(value)) {
    if (!value.length) rows.push({ path, value: '[]', type: 'array' });
    value.forEach((entry, index) => visitProperty(entry, `${path}[${index}]`, rows));
    return;
  }
  const entries = Object.entries(value);
  if (!entries.length && path) rows.push({ path, value: '{}', type: 'object' });
  for (const [key, entry] of entries) {
    const nextPath = path ? `${path}.${key}` : key;
    visitProperty(entry, nextPath, rows);
  }
}

function displayValue(value) {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function readPoint(value) {
  if (!value) return null;
  if (Array.isArray(value)) return pointFromNumbers(value[0], value[1], value[2]);
  if (typeof value === 'object') return pointFromNumbers(value.x ?? value.X, value.y ?? value.Y, value.z ?? value.Z);
  const parts = stringValue(value).match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  if (parts.length < 3) return null;
  return pointFromNumbers(parts[0], parts[1], parts[2]);
}

function readPointFromFields(attrs, prefix) {
  return pointFromNumbers(
    attrs?.[`${prefix}_X`] ?? attrs?.[`${prefix}X`] ?? attrs?.[`${prefix}.X`],
    attrs?.[`${prefix}_Y`] ?? attrs?.[`${prefix}Y`] ?? attrs?.[`${prefix}.Y`],
    attrs?.[`${prefix}_Z`] ?? attrs?.[`${prefix}Z`] ?? attrs?.[`${prefix}.Z`],
  );
}

function readDelta(value) {
  if (!value || typeof value !== 'object') return null;
  return pointFromNumbers(value.x ?? value.X, value.y ?? value.Y, value.z ?? value.Z);
}

function readDeltaFromFields(attrs) {
  return pointFromNumbers(attrs?.DELTA_X ?? attrs?.DX, attrs?.DELTA_Y ?? attrs?.DY, attrs?.DELTA_Z ?? attrs?.DZ);
}

function pointFromNumbers(xValue, yValue, zValue) {
  const x = numberMaybe(xValue);
  const y = numberMaybe(yValue);
  const z = numberMaybe(zValue);
  if (x === null || y === null || z === null) return null;
  return freezeDeep({ x, y, z });
}

function calculateBounds(objects) {
  const points = objects.flatMap((object) => [object.start, object.end, object.center]).filter(Boolean);
  if (!points.length) return freezeDeep({ center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 }, radius: 1 });
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  points.forEach((point) => {
    min.x = Math.min(min.x, point.x); min.y = Math.min(min.y, point.y); min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x); max.y = Math.max(max.y, point.y); max.z = Math.max(max.z, point.z);
  });
  const size = { x: Math.max(max.x - min.x, 1), y: Math.max(max.y - min.y, 1), z: Math.max(max.z - min.z, 1) };
  const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  return freezeDeep({ center, size, radius: Math.max(size.x, size.y, size.z) / 2 });
}

function objectValue(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Workspace package field "${fieldName}" must be an object.`);
  }
  return value;
}

function arrayValue(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new TypeError(`Workspace package field "${fieldName}" must be an array.`);
  }
  return value;
}

function numberValue(value) {
  return numberMaybe(value) ?? 0;
}

function normalizeKey(value) {
  return stringValue(value).toUpperCase().replace(/[^A-Z0-9.]+/g, '');
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}
