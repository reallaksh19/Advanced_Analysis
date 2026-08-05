import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';
import {
  deriveSjsonFidelityVisualGeometry as deriveSjsonTeeVisualGeometry,
} from './topology-edit-sjson-tee-projection.js';
import {
  createTopologyVisualGeometryModel,
  createVisualComponent,
  createVisualDiagnostic,
  createVisualPrimitive,
  visualPrimitiveId,
} from './visual-geometry-contract.js';

export const TOPOLOGY_EDIT_SJSON_POINT_COMPONENT_PROJECTION =
  'TopologyEditSjsonPointComponentProjection.v1';

const VISUAL_EXTENT_POLICY = deepFreeze({
  oletMinimumLengthMm: 40,
  oletDiameterMultiplier: 1.5,
  flangeMinimumLengthMm: 12,
  flangeDiameterMultiplier: 0.25,
  instrumentMinimumLengthMm: 25,
  instrumentDiameterMultiplier: 0.6,
  maximumDiameterMultiplier: 1.5,
});

/**
 * Completes display-only geometry for source records whose canonical edge is
 * intentionally point-like. The generated extents are bounded, deterministic,
 * diagnosed as visual-only, and never written into canonical topology or
 * command payloads.
 */
export function deriveSjsonCompleteVisualGeometry(input = {}) {
  const base = deriveSjsonTeeVisualGeometry(input);
  const dataset = input.dataset;
  const canonicalTopology = input.canonicalTopology;
  const entities = new Map(
    (dataset?.entities || []).map((entity) => [stringValue(entity.entityId), entity]),
  );
  const edgeById = new Map(
    (canonicalTopology?.edges || []).map((edge) => [stringValue(edge.id), edge]),
  );
  const replacements = new Map();
  const projectionReplacementIds = new Set();
  const policyHash = semanticHash(VISUAL_EXTENT_POLICY);

  for (const component of base.model.components || []) {
    const entityId = component.workspaceEntityIds?.[0];
    const entity = entities.get(stringValue(entityId));
    const attributes = entityAttributes(entity);
    const type = canonicalType(component.canonicalType || entity?.type || attributes.TYPE);
    const edge = edgeById.get(stringValue(component.canonicalEntityId));
    const primitive = component.primitives?.[0];
    const center = firstPoint(
      attributes.POS,
      entity?.properties?.geometry?.center,
      primitive?.parameters?.center,
      primitive?.parameters?.start,
    );
    const axis = orientationAxis(attributes.ORI, 'Y');

    if (type === 'OLET' && center && axis) {
      const branchOutsideDiameterMm = firstPositive(
        base.componentEvidence?.[entityId]?.branchOutsideDiameterMm,
        base.componentEvidence?.[entityId]?.visualBranchOutsideDiameterMm,
        base.componentEvidence?.[entityId]?.branchBoreMm,
        branchNominalSize(attributes.SPRE),
        attributes.CBORE,
        attributes.BRANCH_BORE,
        attributes.ABORE,
        attributes.LBORE,
      );
      if (branchOutsideDiameterMm) {
        const branchLengthMm = boundedExtent(
          branchOutsideDiameterMm,
          VISUAL_EXTENT_POLICY.oletMinimumLengthMm,
          VISUAL_EXTENT_POLICY.oletDiameterMultiplier,
        );
        const branchEnd = addScaledPoint(center, axis, branchLengthMm);
        const sourcePaths = component.sourcePaths || [entity?.sourcePath].filter(Boolean);
        const workspaceEntityIds = component.workspaceEntityIds || [entityId].filter(Boolean);
        const primitiveRecord = createVisualPrimitive({
          primitiveId: visualPrimitiveId(component.canonicalEntityId, 'body', policyHash),
          canonicalEntityId: component.canonicalEntityId,
          canonicalType: 'OLET',
          modelRole: base.model.modelRole,
          partRole: 'body',
          kind: 'OLET_BRANCH',
          sourcePaths,
          workspaceEntityIds,
          parameters: {
            center,
            branchEnd,
            branchDirection: axis,
            branchOutsideDiameterMm,
            hostEntityId: stringValue(
              base.componentEvidence?.[entityId]?.hostEntityId
              || edge?.componentKey
              || entityId,
            ),
            dimensionBasis: 'SOURCE_BRANCH_NOMINAL_BORE_VISUAL_PROXY',
            placementAuthority: 'SOURCE_POS_AND_ORI_LOCAL_Y',
            visualExtentMm: branchLengthMm,
          },
        });
        replacements.set(component.canonicalEntityId, createVisualComponent({
          canonicalEntityId: component.canonicalEntityId,
          canonicalType: 'OLET',
          sourcePaths,
          workspaceEntityIds,
          primitives: [primitiveRecord],
          diagnostics: [
            ...(component.diagnostics || [])
              .filter((row) => row.code !== 'VISUAL_COMPONENT_TYPE_UNSUPPORTED'),
            createVisualDiagnostic({
              code: 'VISUAL_POINT_OLET_EXTENT_USED',
              severity: 'WARNING',
              message: 'Point-like source OLET was given a bounded WebGL-only branch extent from source POS, ORI, and branch nominal size.',
              canonicalEntityId: component.canonicalEntityId,
              sourceEvidenceIds: sourcePaths,
              details: {
                visualExtentMm: branchLengthMm,
                policyHash,
                authorityBoundary: 'VISUAL_ONLY_DO_NOT_USE_FOR_ENGINEERING',
              },
            }),
          ],
        }));
        projectionReplacementIds.add(component.canonicalEntityId);
      }
      continue;
    }

    if (!['FLANGE', 'INSTRUMENT'].includes(type) || !primitive || !center || !axis) continue;
    if (!coincidentPrimitive(primitive)) continue;
    const outsideDiameterMm = firstPositive(
      primitive.parameters?.outsideDiameterMm,
      base.componentEvidence?.[entityId]?.outsideDiameterMm,
      base.componentEvidence?.[entityId]?.visualOutsideDiameterMm,
      base.componentEvidence?.[entityId]?.boreMm,
      attributes.ABORE,
      attributes.LBORE,
    );
    if (!outsideDiameterMm) continue;
    const minimumLengthMm = type === 'FLANGE'
      ? VISUAL_EXTENT_POLICY.flangeMinimumLengthMm
      : VISUAL_EXTENT_POLICY.instrumentMinimumLengthMm;
    const multiplier = type === 'FLANGE'
      ? VISUAL_EXTENT_POLICY.flangeDiameterMultiplier
      : VISUAL_EXTENT_POLICY.instrumentDiameterMultiplier;
    const visualExtentMm = boundedExtent(outsideDiameterMm, minimumLengthMm, multiplier);
    const halfExtent = visualExtentMm / 2;
    const start = addScaledPoint(center, axis, -halfExtent);
    const end = addScaledPoint(center, axis, halfExtent);
    const sourcePaths = component.sourcePaths || [entity?.sourcePath].filter(Boolean);
    const workspaceEntityIds = component.workspaceEntityIds || [entityId].filter(Boolean);
    const kind = type === 'FLANGE' ? 'FLANGE_DISC' : 'INSTRUMENT_MARKER';
    const primitiveRecord = createVisualPrimitive({
      primitiveId: visualPrimitiveId(component.canonicalEntityId, 'body', policyHash),
      canonicalEntityId: component.canonicalEntityId,
      canonicalType: type,
      modelRole: base.model.modelRole,
      partRole: 'body',
      kind,
      sourcePaths,
      workspaceEntityIds,
      parameters: {
        ...primitive.parameters,
        start,
        end,
        center,
        axis,
        outsideDiameterMm,
        visualExtentMm,
        placementAuthority: 'SOURCE_POS_AND_ORI_LOCAL_Y',
        dimensionBasis: primitive.parameters?.dimensionBasis || 'NOMINAL_BORE_VISUAL_PROXY',
      },
    });
    replacements.set(component.canonicalEntityId, createVisualComponent({
      canonicalEntityId: component.canonicalEntityId,
      canonicalType: type,
      sourcePaths,
      workspaceEntityIds,
      primitives: [primitiveRecord],
      diagnostics: [
        ...(component.diagnostics || []),
        createVisualDiagnostic({
          code: 'VISUAL_POINT_COMPONENT_EXTENT_USED',
          severity: 'WARNING',
          message: `Point-like source ${type} was given a bounded WebGL-only axial extent from source POS, ORI, and size evidence.`,
          canonicalEntityId: component.canonicalEntityId,
          sourceEvidenceIds: sourcePaths,
          details: {
            visualExtentMm,
            policyHash,
            authorityBoundary: 'VISUAL_ONLY_DO_NOT_USE_FOR_ENGINEERING',
          },
        }),
      ],
    }));
    projectionReplacementIds.add(component.canonicalEntityId);
  }

  if (!replacements.size) return base;
  const components = base.model.components.map((component) => (
    replacements.get(component.canonicalEntityId) || component
  ));
  const model = createTopologyVisualGeometryModel({
    canonicalTopologyHash: canonicalTopology.canonicalTopologyHash,
    geometryPolicyHash: semanticHash({
      baseGeometryPolicyHash: base.model.geometryPolicyHash,
      authority: TOPOLOGY_EDIT_SJSON_POINT_COMPONENT_PROJECTION,
      policyHash,
      replacementIds: [...replacements.keys()].sort(),
    }),
    modelRole: base.model.modelRole,
    components,
  });
  const replacementPrimitives = [...replacements.values()]
    .flatMap((component) => component.primitives);
  const replacementElements = replacementPrimitives.map((row) => ({
    id: row.primitiveId,
    entityId: row.canonicalEntityId,
    type: row.kind,
    x: row.parameters.center.x,
    y: row.parameters.center.y,
    z: row.parameters.center.z,
    pickTarget: {
      objectKind: 'component',
      objectId: row.canonicalEntityId,
      sourcePaths: row.sourcePaths,
      workspaceEntityIds: row.workspaceEntityIds,
      partRole: row.partRole,
    },
  }));
  const projection = deepFreeze({
    ...base.projection,
    elements: [
      ...(base.projection.elements || []).filter((row) => (
        row.type === 'node' || !projectionReplacementIds.has(row.entityId)
      )),
      ...replacementElements,
    ],
    segments: (base.projection.segments || []).filter(
      (row) => !projectionReplacementIds.has(row.entityId),
    ),
    primitives: [
      ...(base.projection.primitives || []).filter(
        (row) => !projectionReplacementIds.has(row.canonicalEntityId),
      ),
      ...replacementPrimitives,
    ].sort(comparePrimitiveIdentity),
  });
  return deepFreeze({ ...base, model, projection });
}

function coincidentPrimitive(primitive) {
  const start = finitePoint(primitive?.parameters?.start);
  const end = finitePoint(primitive?.parameters?.end);
  return start && end && distance(start, end) <= 1e-9;
}

function boundedExtent(diameterMm, minimumMm, multiplier) {
  return Math.min(
    Math.max(minimumMm, diameterMm * multiplier),
    diameterMm * VISUAL_EXTENT_POLICY.maximumDiameterMultiplier,
  );
}

function orientationAxis(value, localAxis) {
  const text = stringValue(value).toUpperCase();
  const match = text.match(new RegExp(`\\b${localAxis}\\s+IS\\s+([ENSWUD])\\b`, 'u'));
  return directionForCardinal(match?.[1]);
}

function directionForCardinal(value) {
  return ({
    E: { x: 1, y: 0, z: 0 },
    W: { x: -1, y: 0, z: 0 },
    N: { x: 0, y: 1, z: 0 },
    S: { x: 0, y: -1, z: 0 },
    U: { x: 0, y: 0, z: 1 },
    D: { x: 0, y: 0, z: -1 },
  })[value] || null;
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
    INST: 'INSTRUMENT',
    WELDOLET: 'OLET',
    SOCKOLET: 'OLET',
  })[token] || token;
}

function branchNominalSize(value) {
  const text = stringValue(value);
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/gu)];
  return matches.length ? firstPositive(matches.at(-1)?.[2]) : null;
}

function firstPoint(...values) {
  for (const value of values) {
    const point = parsePoint(value);
    if (point) return point;
  }
  return null;
}

function parsePoint(value) {
  if (!value) return null;
  if (Array.isArray(value)) return finitePoint({ x: value[0], y: value[1], z: value[2] });
  if (typeof value === 'object') {
    return finitePoint({
      x: value.x ?? value.X,
      y: value.y ?? value.Y,
      z: value.z ?? value.Z,
    });
  }
  const numbers = stringValue(value).match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/giu) || [];
  return numbers.length >= 3
    ? finitePoint({ x: numbers[0], y: numbers[1], z: numbers[2] })
    : null;
}

function finitePoint(value) {
  return value && [value.x, value.y, value.z].every((row) => Number.isFinite(Number(row)))
    ? deepFreeze({ x: Number(value.x), y: Number(value.y), z: Number(value.z) })
    : null;
}

function firstPositive(...values) {
  for (const value of values) {
    const match = stringValue(value).replace(/,/gu, '').match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/iu);
    const number = typeof value === 'number' ? value : Number(match?.[0]);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function addScaledPoint(point, direction, length) {
  return deepFreeze({
    x: point.x + direction.x * length,
    y: point.y + direction.y * length,
    z: point.z + direction.z * length,
  });
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function comparePrimitiveIdentity(left, right) {
  return stringValue(left?.primitiveId).localeCompare(stringValue(right?.primitiveId));
}
