import { readFileSync } from 'node:fs';
import { validateCanonicalGeometry } from '../src/core/geometry/validateCanonicalGeometry.js';
import {
  BM2_CII_OUTPUT_PATH,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';
import { buildBm2SolveAuthorities } from './lfea-b3.26-bm2-solve-fixtures.mjs';

const COLLINEAR_TOLERANCE = 1e-6;
const LENGTH_TOLERANCE = 1e-9;

export const BM2_JUNCTION_SURFACE_NODE_PROFILE = Object.freeze({
  schema: 'lfea-bm2-junction-surface-node-profile/v1',
  topologyRule: 'B31J_RUN_SURFACE_NODE_AND_FICTITIOUS_BRANCH_RIGID_V1',
  surfaceOffsetRule: 'RUN_OUTSIDE_DIAMETER_OVER_TWO_V1',
  outputIdentityRule: 'CENTER_NODE_PLUS_ONE_CONFIRMED_BY_CAESAR_PAIR_V1',
  stiffnessRule: 'DEFER_TO_STRUCTURAL_CONSUMER_B31J_FICTITIOUS_RIGID',
  massRule: 'ZERO_MASS_INTERNAL_AUTHORITY',
  thermalRule: 'DEFER_TO_STRUCTURAL_CONSUMER',
});

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function add(left, right) {
  return left.map((value, index) => value + right[index]);
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function norm(vector) {
  return Math.hypot(...vector);
}

function unit(vector, label) {
  const length = norm(vector);
  if (!(length > LENGTH_TOLERANCE)) throw new Error(`${label} has zero length.`);
  return scale(vector, 1 / length);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function point(node) {
  return [node.x, node.y, node.z];
}

function distance(left, right) {
  return norm(subtract(left, right));
}

function incidentRecords(geometry) {
  const nodes = new Map(geometry.nodes.map((node) => [node.id, node]));
  const byNode = new Map();
  for (const segment of geometry.segments) {
    for (const [nodeId, otherNodeId, end] of [
      [segment.startNodeId, segment.endNodeId, 'I'],
      [segment.endNodeId, segment.startNodeId, 'J'],
    ]) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId).push(Object.freeze({
        segment,
        otherNodeId,
        end,
        directionAway: Object.freeze(unit(
          subtract(point(nodes.get(otherNodeId)), point(nodes.get(nodeId))),
          `BM2 junction ${nodeId} incident ${segment.id}`,
        )),
      }));
    }
  }
  return Object.freeze({ nodes, byNode });
}

function classifyJunctions(geometry, outputPairs) {
  const { nodes, byNode } = incidentRecords(geometry);
  const junctions = [];
  for (const [nodeId, incident] of byNode) {
    if (incident.length !== 3) continue;
    const candidatePairs = [];
    for (let left = 0; left < incident.length; left += 1) {
      for (let right = left + 1; right < incident.length; right += 1) {
        candidatePairs.push(Object.freeze({
          left,
          right,
          alignment: dot(incident[left].directionAway, incident[right].directionAway),
        }));
      }
    }
    candidatePairs.sort((left, right) => left.alignment - right.alignment);
    const runPair = candidatePairs[0];
    if (Math.abs(runPair.alignment + 1) > COLLINEAR_TOLERANCE) {
      throw new Error(`BM2 junction ${nodeId} has no collinear run pair: ${runPair.alignment}.`);
    }
    const branchIndex = [0, 1, 2].find(
      (index) => index !== runPair.left && index !== runPair.right,
    );
    const run = [incident[runPair.left], incident[runPair.right]];
    const branch = incident[branchIndex];
    const surfaceNodeId = String(Number(nodeId) + 1);
    if (nodes.has(surfaceNodeId)) {
      throw new Error(`BM2 surface node ${surfaceNodeId} collides with a source node.`);
    }
    const centerSurfacePair = branch.end === 'I'
      ? `${nodeId}-${surfaceNodeId}`
      : `${surfaceNodeId}-${nodeId}`;
    if (!outputPairs.has(centerSurfacePair)) {
      throw new Error(
        `BM2 CAESAR output does not confirm surface pair ${centerSurfacePair} for junction ${nodeId}.`,
      );
    }
    const runOuterDiameter = Math.max(...run.map((row) => row.segment.diameter));
    if (!(runOuterDiameter > 0)) {
      throw new Error(`BM2 junction ${nodeId} has no positive run outside diameter.`);
    }
    const offset = runOuterDiameter / 2;
    if (!(branch.segment.length > offset + LENGTH_TOLERANCE)) {
      throw new Error(
        `BM2 junction ${nodeId} branch ${branch.segment.id} length ${branch.segment.length} `
        + `does not exceed surface offset ${offset}.`,
      );
    }
    const center = point(nodes.get(nodeId));
    const surface = add(center, scale(branch.directionAway, offset));
    const sourceSifs = branch.segment.meta.analysis.sifs ?? [];
    const junctionSif = sourceSifs.find((row) => row.nodeId === nodeId);
    if (!junctionSif || ![3, 5].includes(junctionSif.typeCode)) {
      throw new Error(`BM2 junction ${nodeId} lacks governed tee/weldolet SIF evidence.`);
    }
    junctions.push(Object.freeze({
      centerNodeId: nodeId,
      surfaceNodeId,
      centerSurfacePair,
      runSegmentIds: Object.freeze(run.map((row) => row.segment.id).sort()),
      branchSegmentId: branch.segment.id,
      branchOtherNodeId: branch.otherNodeId,
      branchEndAtCenter: branch.end,
      branchDirectionAway: branch.directionAway,
      runOuterDiameter,
      surfaceOffset: offset,
      centerPoint: Object.freeze(center),
      surfacePoint: Object.freeze(surface),
      sourceBranchLength: branch.segment.length,
      remainingBranchLength: branch.segment.length - offset,
      sifTypeCode: junctionSif.typeCode,
      sourceSifEvidence: Object.freeze(sourceSifs.map((row) => Object.freeze({ ...row }))),
    }));
  }
  junctions.sort((left, right) => Number(left.centerNodeId) - Number(right.centerNodeId));
  return Object.freeze(junctions);
}

function transformedGeometry(authorities, junctions) {
  const original = authorities.normalized.geometry;
  const nodes = new Map(original.nodes.map((node) => [node.id, structuredClone(node)]));
  const segmentById = new Map(original.segments.map((segment) => [segment.id, structuredClone(segment)]));
  const fictitiousRigids = [];
  const pairGroups = new Map();

  for (const junction of junctions) {
    const centerTemplate = nodes.get(junction.centerNodeId);
    nodes.set(junction.surfaceNodeId, {
      ...structuredClone(centerTemplate),
      id: junction.surfaceNodeId,
      x: junction.surfacePoint[0],
      y: junction.surfacePoint[1],
      z: junction.surfacePoint[2],
      restraint: 'FREE',
      meta: {
        caesarNodeNumber: junction.surfaceNodeId,
        generatedBy: 'M027_B31J_SURFACE_NODE',
        junctionCenterNodeId: junction.centerNodeId,
        surfaceOffset: junction.surfaceOffset,
        sourceAuthority: BM2_JUNCTION_SURFACE_NODE_PROFILE.topologyRule,
      },
    });

    const branch = segmentById.get(junction.branchSegmentId);
    const originalBranch = structuredClone(branch);
    if (junction.branchEndAtCenter === 'I') branch.startNodeId = junction.surfaceNodeId;
    else branch.endNodeId = junction.surfaceNodeId;
    branch.length = junction.remainingBranchLength;
    branch.meta = {
      ...branch.meta,
      junctionCenterNodeId: junction.centerNodeId,
      junctionSurfaceNodeId: junction.surfaceNodeId,
      sourceBranchStartNodeId: originalBranch.startNodeId,
      sourceBranchEndNodeId: originalBranch.endNodeId,
      sourceBranchLength: junction.sourceBranchLength,
      surfaceOffsetRemoved: junction.surfaceOffset,
      b31jBranchRemainder: true,
    };

    const rigidId = `BM2.JUNCTION.${junction.centerNodeId}.SURFACE.RIGID`;
    const rigidStartNodeId = junction.branchEndAtCenter === 'I'
      ? junction.centerNodeId
      : junction.surfaceNodeId;
    const rigidEndNodeId = junction.branchEndAtCenter === 'I'
      ? junction.surfaceNodeId
      : junction.centerNodeId;
    const rigid = {
      ...structuredClone(originalBranch),
      id: rigidId,
      startNodeId: rigidStartNodeId,
      endNodeId: rigidEndNodeId,
      type: 'PIPE',
      sourceComponentUid: `${originalBranch.sourceComponentUid}:B31J_SURFACE_RIGID`,
      length: junction.surfaceOffset,
      meta: {
        ...structuredClone(originalBranch.meta),
        sourceType: 'B31J_FICTITIOUS_RIGID',
        junctionCenterNodeId: junction.centerNodeId,
        junctionSurfaceNodeId: junction.surfaceNodeId,
        b31jFictitiousRigid: true,
        participatesInGlobalStiffness: true,
        participatesInThermalExpansion: false,
        participatesInGravity: false,
        recoverForcesAndMoments: true,
        calculatePipingCodeStress: false,
        massAuthority: BM2_JUNCTION_SURFACE_NODE_PROFILE.massRule,
        stiffnessAuthority: BM2_JUNCTION_SURFACE_NODE_PROFILE.stiffnessRule,
        thermalAuthority: BM2_JUNCTION_SURFACE_NODE_PROFILE.thermalRule,
      },
    };
    segmentById.set(rigid.id, rigid);
    fictitiousRigids.push(rigid);

    const branchPair = `${branch.startNodeId}-${branch.endNodeId}`;
    pairGroups.set(junction.centerSurfacePair, Object.freeze({
      pairKey: junction.centerSurfacePair,
      elementIds: Object.freeze([rigid.id]),
      role: 'B31J_FICTITIOUS_RIGID',
      junctionCenterNodeId: junction.centerNodeId,
    }));
    pairGroups.set(branchPair, Object.freeze({
      pairKey: branchPair,
      elementIds: Object.freeze([branch.id]),
      role: 'B31J_BRANCH_REMAINDER',
      junctionCenterNodeId: junction.centerNodeId,
    }));
  }

  const geometry = {
    ...structuredClone(original),
    nodes: [...nodes.values()].sort((left, right) => String(left.id).localeCompare(String(right.id))),
    segments: [...segmentById.values()].sort((left, right) => String(left.id).localeCompare(String(right.id))),
    diagnostics: [...original.diagnostics],
    summary: {
      ...original.summary,
      nodeCount: nodes.size,
      segmentCount: segmentById.size,
      b31jJunctionCount: junctions.length,
      b31jSurfaceNodeCount: junctions.length,
      b31jFictitiousRigidCount: fictitiousRigids.length,
      b31jSurfaceNodeProfile: BM2_JUNCTION_SURFACE_NODE_PROFILE.schema,
    },
  };
  const validation = validateCanonicalGeometry(geometry, {
    tolerance: 1e-9,
    requireKnownUnit: false,
  });
  geometry.valid = validation.ok;
  geometry.diagnostics = [...geometry.diagnostics, ...validation.diagnostics];
  geometry.summary = { ...geometry.summary, ...validation.summary };
  if (!validation.ok) {
    const fatal = validation.diagnostics.filter((row) => row.severity === 'error');
    throw new Error(`BM2 B31J surface-node geometry failed validation: ${JSON.stringify(fatal)}`);
  }
  return Object.freeze({
    geometry: Object.freeze(geometry),
    fictitiousRigids: Object.freeze(fictitiousRigids),
    pairGroups,
  });
}

export function buildBm2JunctionSurfaceNodeAuthorities() {
  const authorities = buildBm2SolveAuthorities();
  const output = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
  const outputPairs = new Set(output.globalForce.get('OPE').byPair.keys());
  const junctions = classifyJunctions(authorities.normalized.geometry, outputPairs);
  if (junctions.length !== 5) {
    throw new Error(`BM2 must resolve five B31J junctions; found ${junctions.length}.`);
  }
  const transformed = transformedGeometry(authorities, junctions);
  return Object.freeze({
    ...authorities,
    profile: BM2_JUNCTION_SURFACE_NODE_PROFILE,
    junctions,
    ...transformed,
  });
}
