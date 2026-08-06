import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { evaluateQ8Quality } from './q8-quality.js';
import {
  createCanonicalFlangeHubGeometry,
  FLANGE_HUB_MATERIAL_PROFILE,
  hubRadiusAt,
} from './flange-hub-geometry.js';
import {
  createFlangeHubMesh as createFlangeHubBaseMesh,
  FLANGE_HUB_MESH_LEVELS as FLANGE_HUB_BASE_MESH_LEVELS,
} from './flange-hub-mesh.js';

export const FLANGE_HUB_MESH_V2_SCHEMA =
  'flange-hub-mesh-transition/v2';
export const FLANGE_HUB_MESH_FAMILY_ID =
  'BKT-B-FLANGE-Q8-B03-B04-CONFORMING-TRANSITION-V2';
export const FLANGE_HUB_MESH_LEVELS =
  FLANGE_HUB_BASE_MESH_LEVELS;

const Q = 1e-12;
const TRANSITION_START_Z = 30;
const TRANSITION_END_Z = 35;

export const FLANGE_HUB_MESH_V2_POLICY = deepFreeze({
  meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
  authority: 'GOVERNED_PRODUCTION_MESH_PENDING_EXACT_HEAD',
  frozenGeometryModified: false,
  frozenLoadsModified: false,
  frozenRestraintsModified: false,
  frozenSolverPolicyModified: false,
  frozenRecoveryModified: false,
  frozenConvergencePolicyModified: false,
  connectivityModified: true,
  selectionRequiresExactHeadQualification: true,
  grantsMergeAuthority: false,
  grantsBb12Authority: false,
  transition: {
    blockId: 'FH-B04',
    startZ: TRANSITION_START_Z,
    endZ: TRANSITION_END_Z,
    interfaceCoordinatesModified: false,
    radialRemapBefore: 'LINEAR',
    radialRemapAfter: 'CUBIC_SMOOTHSTEP_TO_B05_CANONICAL_INTERFACE',
    interfaceSlopeRule: 'ZERO_PARAMETRIC_REMAP_SLOPE_AT_U0_AND_U1',
    interfaceMergeRule: 'PAIR_BY_TRANSVERSE_PARAMETER_AND_SHARE_B04_NODE_ID',
    hangingNodesPermitted: false,
  },
});

export function createFlangeHubMesh(
  levelId,
  geometry = createCanonicalFlangeHubGeometry(),
) {
  if (geometry?.schema !== 'flange-hub-canonical-geometry/v1') {
    throw new TypeError('FH_CANONICAL_GEOMETRY_REQUIRED');
  }
  const baseMesh = createFlangeHubBaseMesh(levelId, geometry);
  const upperInterface = interfaceRows(
    baseMesh.nodes,
    'FH-B05',
    0,
  );
  const map = transitionMap(geometry, upperInterface);
  const remappedNodes = baseMesh.nodes.map((node) => {
    const owner = findOwner(node, 'FH-B04');
    if (!owner) return node;
    const remapped = map(owner.u, owner.v);
    return deepFreeze({
      ...node,
      r: remapped.r,
      z: remapped.z,
    });
  });
  const merge = mergeConformingInterface(remappedNodes, {
    leftBlockId: 'FH-B04',
    leftU: 1,
    rightBlockId: 'FH-B05',
    rightU: 0,
  });
  const nodes = merge.nodes;
  const elements = baseMesh.elements.map((element) => deepFreeze({
    ...element,
    nodeIds: element.nodeIds.map((nodeId) => (
      merge.aliasByNodeId.get(nodeId) ?? nodeId
    )),
  }));
  const boundaryEdges = baseMesh.boundaryEdges.map((edge) => deepFreeze({
    ...edge,
    nodeIds: edge.nodeIds.map((nodeId) => (
      merge.aliasByNodeId.get(nodeId) ?? nodeId
    )),
  }));
  const nodesById = new Map(nodes.map((node) => [node.nodeId, node]));
  assertUniqueCoordinates(nodes);
  assertConnectivity(elements, nodesById);
  const interfaceEvidence = assertInterfaces(
    nodes,
    baseMesh.refinement,
    merge.aliasByNodeId.size,
  );
  const probeEvidence = assertFrozenProbe(nodes);
  const productionQuality = new Map(
    baseMesh.quality.elementQuality.map((row) => [row.elementId, row]),
  );
  const qualityRows = elements.map((element) => {
    if (element.blockId !== 'FH-B04') {
      return productionQuality.get(element.elementId);
    }
    const elementNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
    const parameters = elementNodes.slice(0, 4).map((node) => {
      const owner = findOwner(node, 'FH-B04');
      if (!owner) {
        throw new RangeError(
          `FH_TRANSITION_B04_OWNER_MISSING:${element.elementId}`,
        );
      }
      return owner;
    });
    const [p0, p1, p2, p3] = parameters;
    const u0 = requireNear(p0.u, p1.u, element.elementId);
    const u1 = requireNear(p2.u, p3.u, element.elementId);
    const v0 = requireNear(p0.v, p3.v, element.elementId);
    const v1 = requireNear(p1.v, p2.v, element.elementId);
    const quality = evaluateQ8Quality({
      elementId: element.elementId,
      nodes: elementNodes.map((node) => ({ x: node.r, y: node.z })),
      hotspot: element.hotspot,
      boundaryMidsideTargets: {
        0: () => xy(map(u0, (v0 + v1) / 2)),
        1: () => xy(map((u0 + u1) / 2, v1)),
        2: () => xy(map(u1, (v0 + v1) / 2)),
        3: () => xy(map((u0 + u1) / 2, v0)),
      },
    });
    if (!quality.accepted) {
      throw new RangeError(
        `FH_MESH_V2_QUALITY_REJECTED:`
        + `${element.elementId}:${quality.failures.join(',')}`,
      );
    }
    return quality;
  });
  const quality = aggregateQuality(qualityRows);
  const meshV2Metadata = deepFreeze({
    schema: FLANGE_HUB_MESH_V2_SCHEMA,
    policy: FLANGE_HUB_MESH_V2_POLICY,
    baseMeshFamilyId: baseMesh.meshFamilyId,
    baseMeshHash: baseMesh.meshHash,
    baseCanonicalModelHash: baseMesh.canonicalModelHash,
    baseNodeCount: baseMesh.nodeCount,
    mergedInterfaceNodeCount: merge.aliasByNodeId.size,
    interfaceEvidence,
    probeEvidence,
  });
  const meshPayload = {
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    levelId,
    nodes,
    elements,
    boundaryEdges,
    blocks: baseMesh.blocks,
    meshV2Metadata,
  };
  const meshHash = semanticHash(meshPayload);
  const canonicalModelHash = semanticHash({
    moduleId: 'C2D-FLANGE-HUB',
    formulationProfile: 'AXISYMMETRIC',
    elementProfile: 'AXI_Q8_FULL_3X3',
    geometryHash: geometry.semanticHash,
    meshHash,
    materialProfile: FLANGE_HUB_MATERIAL_PROFILE,
    meshPolicy: FLANGE_HUB_MESH_V2_POLICY,
  });
  const payload = {
    schema: baseMesh.schema,
    moduleId: baseMesh.moduleId,
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    levelId,
    refinement: baseMesh.refinement,
    geometryHash: baseMesh.geometryHash,
    nodeCount: nodes.length,
    elementCount: elements.length,
    globalH: maximumCornerEdgeLength(elements, nodesById),
    nodes,
    elements,
    boundaryEdges,
    blocks: baseMesh.blocks,
    quality,
    duplicateInterfaceNodes: [],
    meshV2Metadata,
    meshHash,
    canonicalModelHash,
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

export function createFlangeHubMeshFamily(
  geometry = createCanonicalFlangeHubGeometry(),
) {
  const levels = FLANGE_HUB_MESH_LEVELS.map(
    ({ levelId }) => createFlangeHubMesh(
      levelId,
      geometry,
    ),
  );
  const payload = {
    schema: 'flange-hub-mesh-family/v2',
    meshFamilyId: FLANGE_HUB_MESH_FAMILY_ID,
    geometryHash: geometry.semanticHash,
    levels,
    meshHashesByLevel: levels.map((row) => row.meshHash),
    canonicalModelHashesByLevel: levels.map(
      (row) => row.canonicalModelHash,
    ),
    selectionRequiresExactHeadQualification: true,
    grantsMergeAuthority: false,
    grantsBb12Authority: false,
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function transitionMap(geometry, upperInterface) {
  const upperOutsideRadius = hubRadiusAt(
    geometry.input,
    TRANSITION_END_Z,
  );
  return (u, v) => {
    const z = TRANSITION_START_Z
      + (TRANSITION_END_Z - TRANSITION_START_Z) * u;
    const outsideRadius = hubRadiusAt(geometry.input, z);
    const upperPoint = interfacePointAt(upperInterface, v);
    const upperFraction = (upperPoint.r - 50)
      / (upperOutsideRadius - 50);
    const blend = smoothstep(u);
    const radialFraction =
      (1 - blend) * v + blend * upperFraction;
    return point(
      50 + radialFraction * (outsideRadius - 50),
      z,
    );
  };
}

function mergeConformingInterface(nodes, definition) {
  const left = interfaceRows(
    nodes,
    definition.leftBlockId,
    definition.leftU,
  );
  const right = interfaceRows(
    nodes,
    definition.rightBlockId,
    definition.rightU,
  );
  if (left.length !== right.length || left.length === 0) {
    throw new RangeError(
      `FH_TRANSITION_INTERFACE_PAIR_COUNT:${left.length}:${right.length}`,
    );
  }
  const aliasByNodeId = new Map();
  const replacements = new Map();
  left.forEach((leftRow, index) => {
    const rightRow = right[index];
    if (Math.abs(leftRow.v - rightRow.v) > 1e-12) {
      throw new RangeError(
        `FH_TRANSITION_INTERFACE_PARAMETER_MISMATCH:`
        + `${leftRow.v}:${rightRow.v}`,
      );
    }
    const merged = deepFreeze({
      nodeId: leftRow.node.nodeId,
      r: rightRow.node.r,
      z: rightRow.node.z,
      ownership: [...new Set([
        ...leftRow.node.ownership,
        ...rightRow.node.ownership,
      ])].sort(),
    });
    replacements.set(leftRow.node.nodeId, merged);
    if (rightRow.node.nodeId !== leftRow.node.nodeId) {
      aliasByNodeId.set(
        rightRow.node.nodeId,
        leftRow.node.nodeId,
      );
    }
  });
  const mergedNodes = nodes
    .filter((node) => !aliasByNodeId.has(node.nodeId))
    .map((node) => replacements.get(node.nodeId) ?? node);
  return {
    nodes: mergedNodes,
    aliasByNodeId,
  };
}

function assertInterfaces(nodes, refinement, mergedInterfaceNodeCount) {
  const expectedNodeCount = 2 * 8 * refinement + 1;
  const definitions = [
    ['FH-B03/FH-B04', 'FH-B03', 1, 'FH-B04', 0],
    ['FH-B04/FH-B05', 'FH-B04', 1, 'FH-B05', 0],
  ];
  const interfaces = definitions.map(([
    interfaceId,
    leftBlockId,
    leftU,
    rightBlockId,
    rightU,
  ]) => {
    const left = interfaceNodeIds(nodes, leftBlockId, leftU);
    const right = interfaceNodeIds(nodes, rightBlockId, rightU);
    if (left.length !== expectedNodeCount
      || right.length !== expectedNodeCount
      || left.join('|') !== right.join('|')) {
      throw new RangeError(
        `FH_TRANSITION_INTERFACE_NONCONFORMING:${interfaceId}:`
        + `${left.length}:${right.length}:${expectedNodeCount}`,
      );
    }
    return deepFreeze({
      interfaceId,
      expectedNodeCount,
      leftNodeCount: left.length,
      rightNodeCount: right.length,
      sharedNodeIdSetsIdentical: true,
      coordinateSetsIdentical: true,
      hangingNodeCount: 0,
      conforming: true,
    });
  });
  return deepFreeze({
    interfaces,
    allConforming: true,
    hangingNodeCount: 0,
    mergedInterfaceNodeCount,
  });
}

function assertFrozenProbe(nodes) {
  const matches = nodes.filter((node) => (
    Math.hypot(node.r - 62.75, node.z - 30) <= 1e-12
  ));
  if (matches.length !== 1) {
    throw new RangeError(
      `FH_TRANSITION_PROBE_NODE_COUNT:${matches.length}`,
    );
  }
  const node = matches[0];
  const b04 = findOwner(node, 'FH-B04');
  if (!b04 || Math.abs(b04.u) > 1e-12) {
    throw new RangeError('FH_TRANSITION_PROBE_B04_OWNERSHIP_MISSING');
  }
  return deepFreeze({
    probeId: 'P-HUB-MID',
    point: { r: 62.75, z: 30 },
    nodeId: node.nodeId,
    positiveZBlockId: 'FH-B04',
    positiveZOwnershipVerified: true,
  });
}

function interfaceRows(nodes, blockId, u) {
  return nodes
    .flatMap((node) => findOwners(node, blockId)
      .filter((owner) => Math.abs(owner.u - u) <= 1e-12)
      .map((owner) => ({ node, v: owner.v })))
    .sort((left, right) => left.v - right.v
      || left.node.nodeId.localeCompare(right.node.nodeId));
}

function interfaceNodeIds(nodes, blockId, u) {
  return [...new Set(interfaceRows(nodes, blockId, u)
    .map((row) => row.node.nodeId))].sort();
}

function interfacePointAt(rows, v) {
  const value = Math.max(0, Math.min(1, Number(v)));
  for (let index = 0; index < rows.length; index += 1) {
    if (Math.abs(rows[index].v - value) <= 1e-12) {
      return rows[index].node;
    }
    if (rows[index].v > value && index > 0) {
      const left = rows[index - 1];
      const right = rows[index];
      const local = (value - left.v) / (right.v - left.v);
      return point(
        left.node.r + local * (right.node.r - left.node.r),
        left.node.z + local * (right.node.z - left.node.z),
      );
    }
  }
  return rows.at(-1).node;
}

function findOwner(node, blockId) {
  return findOwners(node, blockId)[0] ?? null;
}

function findOwners(node, blockId) {
  return node.ownership
    .filter((owner) => String(owner).startsWith(`${blockId}:`))
    .map((owner) => {
      const [, uText, vText] = String(owner).split(':');
      return {
        blockId,
        u: Number(uText),
        v: Number(vText),
      };
    });
}

function requireNear(left, right, elementId) {
  if (Math.abs(left - right) > 1e-12) {
    throw new RangeError(
      `FH_TRANSITION_PARAMETER_MISMATCH:${elementId}:${left}:${right}`,
    );
  }
  return (left + right) / 2;
}

function aggregateQuality(rows) {
  return deepFreeze({
    qualityProfileId: rows[0]?.qualityProfileId ?? null,
    minimumDetJAtGaussPoints: Math.min(
      ...rows.map((row) => row.minimumDetJAtGaussPoints),
    ),
    minimumDetJAtControlPoints: Math.min(
      ...rows.map((row) => row.minimumDetJAtControlPoints),
    ),
    qJDeterminantRatio: Math.min(
      ...rows.map((row) => row.qJDeterminantRatio),
    ),
    minimumScaledJacobian: Math.min(
      ...rows.map((row) => row.minimumScaledJacobian),
    ),
    maximumAspectRatio: Math.max(
      ...rows.map((row) => row.aspectRatio),
    ),
    maximumHotspotAspectRatio: Math.max(
      0,
      ...rows
        .filter((row) => row.limits.maximumAspectRatio === 5)
        .map((row) => row.aspectRatio),
    ),
    midsidePlacementResidual: Math.max(
      ...rows.map((row) => row.midsidePlacementResidual),
    ),
    accepted: rows.every((row) => row.accepted),
    elementQuality: rows,
  });
}

function maximumCornerEdgeLength(elements, nodesById) {
  let maximum = 0;
  elements.forEach((element) => {
    const corners = element.nodeIds
      .slice(0, 4)
      .map((nodeId) => nodesById.get(nodeId));
    for (let index = 0; index < 4; index += 1) {
      maximum = Math.max(
        maximum,
        Math.hypot(
          corners[index].r - corners[(index + 1) % 4].r,
          corners[index].z - corners[(index + 1) % 4].z,
        ),
      );
    }
  });
  return maximum;
}

function assertUniqueCoordinates(nodes) {
  const seen = new Set();
  nodes.forEach((node) => {
    const key = coordinateKey(node);
    if (seen.has(key)) {
      throw new RangeError('FH_TRANSITION_DUPLICATE_NODE_COORDINATE');
    }
    seen.add(key);
  });
}

function assertConnectivity(elements, nodesById) {
  elements.forEach((element) => {
    if (new Set(element.nodeIds).size !== 8) {
      throw new RangeError(`FH_TRANSITION_DEGENERATE_ELEMENT:${element.elementId}`);
    }
    element.nodeIds.forEach((nodeId) => {
      if (!nodesById.has(nodeId)) {
        throw new RangeError(`FH_TRANSITION_ORPHAN_NODE:${nodeId}`);
      }
    });
  });
}

function smoothstep(value) {
  const u = Math.max(0, Math.min(1, Number(value)));
  return u * u * (3 - 2 * u);
}

function point(r, z) {
  return {
    r: Math.round(r / Q) * Q,
    z: Math.round(z / Q) * Q,
  };
}

function coordinateKey(value) {
  return `${Math.round(value.r / Q)}:${Math.round(value.z / Q)}`;
}

function xy(value) {
  return { x: value.r, y: value.z };
}
