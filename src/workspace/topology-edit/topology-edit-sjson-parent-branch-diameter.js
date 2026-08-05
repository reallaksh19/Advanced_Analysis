import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';
import {
  deriveSjsonCompleteVisualGeometry as derivePointComponentVisualGeometry,
} from './topology-edit-sjson-point-component-projection.js';
import {
  createTopologyVisualGeometryModel,
  createVisualComponent,
  createVisualDiagnostic,
  createVisualPrimitive,
} from './visual-geometry-contract.js';

export const TOPOLOGY_EDIT_SJSON_PARENT_BRANCH_DIAMETER =
  'TopologyEditSjsonParentBranchDiameter.v1';

const RUN_DIAMETER_KINDS = new Set([
  'PIPE_CYLINDER',
  'ELBOW_ARC',
  'FLANGE_DISC',
  'VALVE_BODY',
  'GASKET_DISC',
  'INSTRUMENT_MARKER',
]);

const POINT_EXTENT_POLICY = deepFreeze({
  OLET_BRANCH: { minimumMm: 40, multiplier: 1.5 },
  FLANGE_DISC: { minimumMm: 12, multiplier: 0.25 },
  INSTRUMENT_MARKER: { minimumMm: 25, multiplier: 0.6 },
  maximumDiameterMultiplier: 1.5,
});

/**
 * Builds the same parent-branch bore authority used by Topo validator's
 * Edit Draft geometry: a branch's declared bore is preferred, with the first
 * route child's ABORE/LBORE used as the deterministic fallback. Explicit
 * branch OD remains authoritative when supplied. The result is immutable and
 * visual-only; it never mutates canonical engineering dimensions.
 */
export function buildSjsonParentBranchDiameterIndex(dataset = {}) {
  const contexts = [];
  const sourcePackage = dataset?.sourceSnapshot?.sourcePackage;
  visitSourcePackage(sourcePackage, '$', contexts);
  appendDatasetFallbackContexts(dataset?.entities || [], contexts);

  const sorted = contexts
    .filter((row) => row.branchId && row.diameterMm > 0)
    .sort(compareContext);
  const byBranchIdRows = groupRows(sorted, (row) => row.branchId);
  const byEndpointEvidenceRows = groupRows(
    sorted.flatMap((row) => row.endpointEvidenceIds.map((id) => ({ id, row }))),
    (entry) => entry.id,
  );
  const byEndpointReferenceRows = groupRows(
    sorted.flatMap((row) => row.endpointReferences.map((reference) => ({ reference, row }))),
    (entry) => entry.reference,
  );

  const conflicts = [];
  const byBranchId = {};
  for (const [branchId, rows] of Object.entries(byBranchIdRows)) {
    const ranked = rows.sort(compareContext);
    byBranchId[branchId] = ranked[0];
    const diameters = [...new Set(ranked.map((row) => row.diameterMm.toFixed(6)))];
    if (diameters.length > 1) {
      conflicts.push({
        branchId,
        diametersMm: diameters.map(Number),
        sourceEvidenceIds: ranked.map((row) => row.sourceEvidenceId),
      });
    }
  }

  const byEndpointEvidenceId = Object.fromEntries(
    Object.entries(byEndpointEvidenceRows).map(([id, entries]) => [
      id,
      entries.map((entry) => entry.row).sort(compareContext)[0],
    ]),
  );
  const byEndpointReference = Object.fromEntries(
    Object.entries(byEndpointReferenceRows).map(([reference, entries]) => [
      reference,
      entries.map((entry) => entry.row).sort(compareContext),
    ]),
  );
  const payload = {
    schema: TOPOLOGY_EDIT_SJSON_PARENT_BRANCH_DIAMETER,
    contexts: sorted,
    byBranchId,
    byEndpointEvidenceId,
    byEndpointReference,
    conflicts: conflicts.sort((left, right) => left.branchId.localeCompare(right.branchId)),
  };
  return deepFreeze({ ...payload, indexHash: semanticHash(payload) });
}

export function parentBranchDiameterForEntity(index, entity) {
  const attributes = entityAttributes(entity);
  for (const branchId of [
    entity?.branchId,
    entity?.branchOwner,
    attributes.OWNER,
    attributes.BRANCH,
    attributes.BRANCH_ID,
  ].map(stringValue).filter(Boolean)) {
    const context = index?.byBranchId?.[branchId];
    if (context) return context;
  }
  return null;
}

export function referencedBranchDiameterForEntity(index, entity, primitive = null) {
  const attributes = entityAttributes(entity);
  const evidenceId = stringValue(primitive?.parameters?.branchReferenceId);
  if (evidenceId && index?.byEndpointEvidenceId?.[evidenceId]) {
    return index.byEndpointEvidenceId[evidenceId];
  }

  for (const branchId of [
    attributes.CREF,
    attributes.BRANCH_REF,
    attributes.BRANCH_REFERENCE,
    attributes.CONNECTED_BRANCH,
  ].map(stringValue).filter(Boolean)) {
    const context = index?.byBranchId?.[branchId];
    if (context) return context;
  }

  const parent = parentBranchDiameterForEntity(index, entity);
  const componentReference = stringValue(
    attributes.REF
    || attributes.NAME
    || entity?.sourceEntityId
    || entity?.componentReference
    || entity?.entityId,
  );
  const candidates = (index?.byEndpointReference?.[componentReference] || [])
    .filter((row) => row.branchId !== parent?.branchId)
    .sort(compareContext);
  return candidates[0] || null;
}

/**
 * Final immutable diameter adapter. It reuses all existing tee restoration,
 * point-component, support, picking, and command paths, and changes only the
 * visual primitive diameter parameters and their evidence/diagnostics.
 */
export function deriveSjsonCompleteVisualGeometry(input = {}) {
  const base = derivePointComponentVisualGeometry(input);
  const index = buildSjsonParentBranchDiameterIndex(input.dataset);
  const entities = new Map(
    (input.dataset?.entities || []).map((entity) => [stringValue(entity.entityId), entity]),
  );
  const evidence = Object.fromEntries(
    Object.entries(base.componentEvidence || {}).map(([key, row]) => [key, { ...row }]),
  );
  const adaptations = [];

  const components = (base.model?.components || []).map((component) => {
    const entity = component.workspaceEntityIds
      .map((id) => entities.get(stringValue(id)))
      .find(Boolean);
    if (!entity) return component;
    const parentBranch = parentBranchDiameterForEntity(index, entity);
    const adaptedPrimitives = [];
    let runApplied = false;
    let referenceApplied = false;
    let referencedBranch = null;

    for (const primitive of component.primitives || []) {
      const result = adaptPrimitiveDiameters({
        primitive,
        entity,
        parentBranch,
        index,
      });
      adaptedPrimitives.push(result.primitive);
      runApplied ||= result.runApplied;
      referenceApplied ||= result.referenceApplied;
      referencedBranch ||= result.referencedBranch;
      if (result.runApplied || result.referenceApplied) {
        adaptations.push({
          primitiveId: primitive.primitiveId,
          canonicalEntityId: primitive.canonicalEntityId,
          kind: primitive.kind,
          parentBranchId: parentBranch?.branchId || null,
          parentBranchDiameterMm: result.runApplied ? parentBranch?.diameterMm || null : null,
          referencedBranchId: result.referencedBranch?.branchId || null,
          referencedBranchDiameterMm: result.referenceApplied
            ? result.referencedBranch?.diameterMm || null
            : null,
        });
      }
    }

    if (!runApplied && !referenceApplied) return component;
    const diagnostics = (component.diagnostics || []).filter((row) => (
      row.code !== 'VISUAL_NOMINAL_BORE_PROXY_USED'
    ));
    if (runApplied && parentBranch) {
      diagnostics.push(parentBranchDiagnostic(component, parentBranch));
      if (parentBranch.visualProxy) {
        diagnostics.push(parentBranchProxyDiagnostic(component, parentBranch));
      }
    }
    if (referenceApplied && referencedBranch) {
      diagnostics.push(referencedBranchDiagnostic(component, referencedBranch));
    }

    for (const entityId of component.workspaceEntityIds || []) {
      const current = evidence[entityId] || {};
      evidence[entityId] = {
        ...current,
        parentBranchId: parentBranch?.branchId || null,
        parentBranchDiameterMm: parentBranch?.diameterMm || null,
        parentBranchDiameterBasis: parentBranch?.dimensionBasis || null,
        referencedBranchId: referencedBranch?.branchId || null,
        referencedBranchDiameterMm: referencedBranch?.diameterMm || null,
        referencedBranchDiameterBasis: referencedBranch?.dimensionBasis || null,
      };
    }

    return createVisualComponent({
      canonicalEntityId: component.canonicalEntityId,
      canonicalType: component.canonicalType,
      sourcePaths: component.sourcePaths,
      workspaceEntityIds: component.workspaceEntityIds,
      primitives: adaptedPrimitives,
      diagnostics,
    });
  });

  if (!adaptations.length) {
    return deepFreeze({
      ...base,
      componentEvidence: deepFreeze(evidence),
      parentBranchDiameterIndex: index,
    });
  }

  const adaptationHash = semanticHash({
    authority: TOPOLOGY_EDIT_SJSON_PARENT_BRANCH_DIAMETER,
    canonicalTopologyHash: input.canonicalTopology?.canonicalTopologyHash || '',
    indexHash: index.indexHash,
    adaptations: adaptations.sort(compareAdaptation),
  });
  const model = createTopologyVisualGeometryModel({
    canonicalTopologyHash: base.model.canonicalTopologyHash,
    geometryPolicyHash: semanticHash({
      baseGeometryPolicyHash: base.model.geometryPolicyHash,
      authority: TOPOLOGY_EDIT_SJSON_PARENT_BRANCH_DIAMETER,
      adaptationHash,
    }),
    modelRole: base.model.modelRole,
    components,
  });
  const primitives = model.components
    .flatMap((component) => component.primitives)
    .sort(comparePrimitiveIdentity);
  const primitiveById = new Map(primitives.map((primitive) => [primitive.primitiveId, primitive]));
  const projection = deepFreeze({
    ...base.projection,
    primitives,
    segments: (base.projection?.segments || []).map((segment) => (
      adaptProjectionSegment(segment, primitiveById.get(segment.id))
    )),
  });

  return deepFreeze({
    ...base,
    model,
    projection,
    componentEvidence: deepFreeze(evidence),
    parentBranchDiameterIndex: index,
    parentBranchDiameterHash: adaptationHash,
  });
}

function adaptPrimitiveDiameters({ primitive, entity, parentBranch, index }) {
  const parameters = { ...(primitive.parameters || {}) };
  let runApplied = false;
  let referenceApplied = false;
  let referencedBranch = null;

  if (RUN_DIAMETER_KINDS.has(primitive.kind) && parentBranch?.diameterMm > 0) {
    parameters.outsideDiameterMm = parentBranch.diameterMm;
    parameters.dimensionBasis = parentBranch.dimensionBasis;
    parameters.outsideDiameterAuthority = 'SOURCE_PARENT_BRANCH';
    updatePointExtent(primitive.kind, parameters, parentBranch.diameterMm);
    runApplied = true;
  } else if (primitive.kind === 'TEE_JUNCTION') {
    if (parentBranch?.diameterMm > 0) {
      parameters.runOutsideDiameterMm = parentBranch.diameterMm;
      parameters.runDiameterBasis = parentBranch.dimensionBasis;
      parameters.runOutsideDiameterAuthority = 'SOURCE_PARENT_BRANCH';
      runApplied = true;
    }
    referencedBranch = referencedBranchDiameterForEntity(index, entity, primitive);
    if (referencedBranch?.diameterMm > 0) {
      parameters.branchOutsideDiameterMm = referencedBranch.diameterMm;
      parameters.branchDiameterBasis = referencedBranch.dimensionBasis;
      parameters.branchOutsideDiameterAuthority = 'SOURCE_REFERENCED_PARENT_BRANCH';
      referenceApplied = true;
    }
  } else if (primitive.kind === 'OLET_BRANCH') {
    referencedBranch = referencedBranchDiameterForEntity(index, entity, primitive);
    if (referencedBranch?.diameterMm > 0) {
      parameters.branchOutsideDiameterMm = referencedBranch.diameterMm;
      parameters.dimensionBasis = referencedBranch.dimensionBasis;
      parameters.branchOutsideDiameterAuthority = 'SOURCE_REFERENCED_PARENT_BRANCH';
      updatePointExtent(primitive.kind, parameters, referencedBranch.diameterMm);
      referenceApplied = true;
    }
  }

  return {
    primitive: createVisualPrimitive({ ...primitive, parameters }),
    runApplied,
    referenceApplied,
    referencedBranch,
  };
}

function updatePointExtent(kind, parameters, diameterMm) {
  const policy = POINT_EXTENT_POLICY[kind];
  if (!policy || !(parameters.visualExtentMm > 0)) return;
  const extent = boundedExtent(diameterMm, policy.minimumMm, policy.multiplier);
  const center = finitePoint(parameters.center);
  const axis = finiteDirection(parameters.axis || parameters.branchDirection);
  if (!center || !axis) return;
  parameters.visualExtentMm = extent;
  if (kind === 'OLET_BRANCH') {
    parameters.branchEnd = addScaledPoint(center, axis, extent);
    return;
  }
  parameters.start = addScaledPoint(center, axis, -extent / 2);
  parameters.end = addScaledPoint(center, axis, extent / 2);
}

function adaptProjectionSegment(segment, primitive) {
  if (!primitive) return segment;
  const parameters = primitive.parameters || {};
  const outsideDiameterMm = firstPositive(
    parameters.outsideDiameterMm,
    parameters.startOutsideDiameterMm,
  );
  if (!outsideDiameterMm) return segment;
  return {
    ...segment,
    radiusMm: outsideDiameterMm / 2,
    endRadiusMm: firstPositive(parameters.endOutsideDiameterMm)
      ? parameters.endOutsideDiameterMm / 2
      : segment.endRadiusMm,
  };
}

function parentBranchDiagnostic(component, context) {
  return createVisualDiagnostic({
    code: 'VISUAL_PARENT_BRANCH_DIAMETER_USED',
    severity: context.visualProxy ? 'WARNING' : 'INFO',
    message: '3D run diameter is inherited from the component parent branch, matching Topo validator Edit Draft behavior.',
    canonicalEntityId: component.canonicalEntityId,
    sourceEvidenceIds: [...component.sourcePaths, context.sourceEvidenceId],
    details: {
      parentBranchId: context.branchId,
      diameterMm: context.diameterMm,
      dimensionBasis: context.dimensionBasis,
      authorityBoundary: context.visualProxy
        ? 'VISUAL_ONLY_DO_NOT_USE_FOR_ENGINEERING'
        : 'SOURCE_PARENT_BRANCH_DIMENSION',
    },
  });
}

function parentBranchProxyDiagnostic(component, context) {
  return createVisualDiagnostic({
    code: 'VISUAL_NOMINAL_BORE_PROXY_USED',
    severity: 'WARNING',
    message: '3D display uses the parent branch nominal bore as its visual outside-diameter proxy because certified branch OD is unavailable.',
    canonicalEntityId: component.canonicalEntityId,
    sourceEvidenceIds: [...component.sourcePaths, context.sourceEvidenceId],
    details: {
      proxyDimensions: { outsideDiameterMm: context.diameterMm },
      parentBranchId: context.branchId,
      dimensionBasis: context.dimensionBasis,
      authorityBoundary: 'VISUAL_ONLY_DO_NOT_USE_FOR_ENGINEERING',
    },
  });
}

function referencedBranchDiagnostic(component, context) {
  return createVisualDiagnostic({
    code: 'VISUAL_REFERENCED_BRANCH_DIAMETER_USED',
    severity: context.visualProxy ? 'WARNING' : 'INFO',
    message: '3D outlet diameter is inherited from the connected branch parent record.',
    canonicalEntityId: component.canonicalEntityId,
    sourceEvidenceIds: [...component.sourcePaths, context.sourceEvidenceId],
    details: {
      referencedBranchId: context.branchId,
      diameterMm: context.diameterMm,
      dimensionBasis: context.dimensionBasis,
      authorityBoundary: context.visualProxy
        ? 'VISUAL_ONLY_DO_NOT_USE_FOR_ENGINEERING'
        : 'SOURCE_REFERENCED_BRANCH_DIMENSION',
    },
  });
}

function visitSourcePackage(value, path, contexts) {
  if (Array.isArray(value)) {
    value.forEach((row, index) => visitSourcePackage(row, `${path}[${index}]`, contexts));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const attributes = value.attributes || {};
  if (canonicalType(value.type || attributes.TYPE) === 'BRANCH') {
    const context = branchContextFromSource(value, path);
    if (context) contexts.push(context);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'attributes') continue;
    if (child && typeof child === 'object') visitSourcePackage(child, `${path}.${key}`, contexts);
  }
}

function branchContextFromSource(branch, path) {
  const attributes = branch.attributes || {};
  const branchId = stringValue(branch.name || attributes.NAME || attributes.REF);
  if (!branchId) return null;
  const children = Array.isArray(branch.children) ? branch.children : [];
  const firstRouteChildDiameterMm = children
    .map((child) => childDiameter(child))
    .find((value) => value > 0) || null;
  const explicitOutsideDiameterMm = firstPositive(
    branch.outsideDiameterMm,
    branch.outerDiameterMm,
    attributes.OUTSIDE_DIAMETER_MM,
    attributes.OUTSIDE_DIAMETER,
    attributes.OD_MM,
    attributes.OD,
  );
  const declaredBoreMm = firstPositive(
    branch._boreValue,
    branch.bore,
    attributes.HBOR,
    attributes.TBOR,
    attributes.BORE,
    attributes.ABORE,
    attributes.LBORE,
  );
  const diameterMm = firstPositive(
    explicitOutsideDiameterMm,
    declaredBoreMm,
    firstRouteChildDiameterMm,
  );
  if (!diameterMm) return null;
  return deepFreeze({
    branchId,
    sourceEvidenceId: path,
    diameterMm,
    explicitOutsideDiameterMm,
    declaredBoreMm,
    firstRouteChildDiameterMm,
    headDiameterMm: firstPositive(attributes.HBOR, declaredBoreMm, firstRouteChildDiameterMm),
    tailDiameterMm: firstPositive(attributes.TBOR, declaredBoreMm, firstRouteChildDiameterMm),
    dimensionBasis: explicitOutsideDiameterMm
      ? 'SOURCE_PARENT_BRANCH_OUTSIDE_DIAMETER'
      : 'SOURCE_PARENT_BRANCH_NOMINAL_BORE_VISUAL_PROXY',
    visualProxy: !explicitOutsideDiameterMm,
    endpointReferences: [attributes.HREF, attributes.TREF]
      .map(stringValue)
      .filter(Boolean),
    endpointEvidenceIds: [
      stringValue(attributes.HREF) ? `${path}:HREF` : '',
      stringValue(attributes.TREF) ? `${path}:TREF` : '',
    ].filter(Boolean),
  });
}

function appendDatasetFallbackContexts(entities, contexts) {
  const existing = new Set(contexts.map((row) => row.branchId));
  const groups = groupRows(
    entities.filter((entity) => stringValue(entity.branchId)),
    (entity) => stringValue(entity.branchId),
  );
  for (const [branchId, rows] of Object.entries(groups)) {
    if (existing.has(branchId)) continue;
    const ordered = [...rows].sort((left, right) => (
      Number(left.sourceChildIndex ?? Number.MAX_SAFE_INTEGER)
        - Number(right.sourceChildIndex ?? Number.MAX_SAFE_INTEGER)
      || stringValue(left.sourcePath).localeCompare(stringValue(right.sourcePath))
    ));
    const branchEntity = ordered.find((entity) => canonicalType(entity.entityType) === 'BRANCH');
    const branchAttributes = entityAttributes(branchEntity);
    const explicitOutsideDiameterMm = firstPositive(
      branchEntity?.outsideDiameterMm,
      branchAttributes.OUTSIDE_DIAMETER_MM,
      branchAttributes.OUTSIDE_DIAMETER,
    );
    const firstRouteChildDiameterMm = ordered
      .filter((entity) => canonicalType(entity.entityType) !== 'BRANCH')
      .map((entity) => childDiameter({ attributes: entityAttributes(entity) }))
      .find((value) => value > 0) || null;
    const declaredBoreMm = firstPositive(
      branchEntity?.boreMm,
      branchEntity?.nominalDiameterMm,
      branchAttributes.HBOR,
      branchAttributes.TBOR,
      branchAttributes.BORE,
    );
    const diameterMm = firstPositive(
      explicitOutsideDiameterMm,
      declaredBoreMm,
      firstRouteChildDiameterMm,
    );
    if (!diameterMm) continue;
    contexts.push(deepFreeze({
      branchId,
      sourceEvidenceId: stringValue(branchEntity?.sourcePath) || `dataset:${branchId}`,
      diameterMm,
      explicitOutsideDiameterMm,
      declaredBoreMm,
      firstRouteChildDiameterMm,
      headDiameterMm: firstPositive(branchAttributes.HBOR, declaredBoreMm, firstRouteChildDiameterMm),
      tailDiameterMm: firstPositive(branchAttributes.TBOR, declaredBoreMm, firstRouteChildDiameterMm),
      dimensionBasis: explicitOutsideDiameterMm
        ? 'SOURCE_PARENT_BRANCH_OUTSIDE_DIAMETER'
        : 'SOURCE_PARENT_BRANCH_NOMINAL_BORE_VISUAL_PROXY',
      visualProxy: !explicitOutsideDiameterMm,
      endpointReferences: [branchAttributes.HREF, branchAttributes.TREF]
        .map(stringValue)
        .filter(Boolean),
      endpointEvidenceIds: [],
    }));
  }
}

function childDiameter(child) {
  const attributes = child?.attributes || {};
  const values = [
    firstPositive(attributes.ABORE),
    firstPositive(attributes.LBORE),
    firstPositive(child?.boreMm),
    firstPositive(child?.bore),
  ].filter((value) => value > 0);
  return values.length ? Math.max(...values) : null;
}

function entityAttributes(entity) {
  return {
    ...(entity?.properties?.sourceAttributes || {}),
    ...(entity?.properties?.attributes || {}),
    ...(entity?.properties?.enrichedAttributes || {}),
    ...(entity?.properties?.nativeParams || {}),
  };
}

function canonicalType(value) {
  const token = stringValue(value).toUpperCase().replace(/[\s/-]+/gu, '_');
  return ({
    FLAN: 'FLANGE',
    FBLI: 'FLANGE',
    VALV: 'VALVE',
    REDU: 'REDUCER',
    GASK: 'GASKET',
    INST: 'INSTRUMENT',
    ELBO: 'ELBOW',
  })[token] || token;
}

function groupRows(rows, keyFor) {
  return rows.reduce((groups, row) => {
    const key = stringValue(keyFor(row));
    if (!key) return groups;
    (groups[key] ||= []).push(row);
    return groups;
  }, {});
}

function boundedExtent(diameterMm, minimumMm, multiplier) {
  return Math.min(
    Math.max(minimumMm, diameterMm * multiplier),
    diameterMm * POINT_EXTENT_POLICY.maximumDiameterMultiplier,
  );
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? { x: Number(value.x), y: Number(value.y), z: Number(value.z) }
    : null;
}

function finiteDirection(value) {
  const point = finitePoint(value);
  if (!point) return null;
  const length = Math.hypot(point.x, point.y, point.z);
  return length > 1e-12
    ? { x: point.x / length, y: point.y / length, z: point.z / length }
    : null;
}

function addScaledPoint(point, direction, length) {
  return {
    x: point.x + direction.x * length,
    y: point.y + direction.y * length,
    z: point.z + direction.z * length,
  };
}

function firstPositive(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    const match = stringValue(value).replace(/,/gu, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/iu);
    const number = Number(match?.[0]);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function compareContext(left, right) {
  return left.branchId.localeCompare(right.branchId)
    || left.sourceEvidenceId.localeCompare(right.sourceEvidenceId)
    || left.diameterMm - right.diameterMm;
}

function compareAdaptation(left, right) {
  return left.canonicalEntityId.localeCompare(right.canonicalEntityId)
    || left.primitiveId.localeCompare(right.primitiveId);
}

function comparePrimitiveIdentity(left, right) {
  return stringValue(left?.primitiveId).localeCompare(stringValue(right?.primitiveId));
}
