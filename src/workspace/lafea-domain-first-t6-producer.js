import {
  LAFEA_ANALYSIS_MESH_AUTHORITY_V2_ROLE,
  LAFEA_ANALYSIS_MESH_AUTHORITY_V2_SCHEMA,
  LAFEA_ANALYSIS_MESH_INTAKE_V2_SCHEMA,
  createLafeaAnalysisMeshEvidenceV2,
} from './lafea-analysis-mesh-evidence-v2.js';
import { lafeaAnalysisMeshContentHash } from './lafea-analysis-mesh-contract.js';
import { requireLafeaDomainFirstMeshProfileHash } from './lafea-domain-first-mesh-profile.js';
import {
  LAFEA_DOMAIN_FIRST_MESH_PLAN_SCHEMA,
  createLafeaDomainFirstMeshPlanV2,
} from './lafea-domain-first-mesh-plan-v2.js';
import {
  LAFEA_DOMAIN_FIRST_MESH_PRODUCER_OUTPUT_SCHEMA,
  createLafeaDomainFirstMeshProducerOutputV2,
  validateLafeaDomainFirstMeshProducerOutputV2,
} from './lafea-domain-first-producer-output-v2.js';
import { triangulateLafeaDomainFirstT6 } from './lafea-domain-first-t6-geometry-adapter.js';
import { bindLafeaDomainFirstT6Producer } from './lafea-domain-first-t6-producer-policy.js';

const LIMITATIONS = Object.freeze([
  'BOUNDARY_TARGET_SIZE_WITHOUT_INTERIOR_STEINER_REFINEMENT',
  'NO_HOLE_BRIDGING',
  'NO_LOCAL_REFINEMENT',
  'T6_ONLY',
]);

export function planLafeaDomainFirstT6Mesh(input) {
  return buildPreview(input).plan;
}

function buildPreview(input) {
  const context = prepare(input);
  const kernel = triangulateLafeaDomainFirstT6(context);
  const mesh = assembleMesh(kernel.elements, context.intent);
  const plannedMeshHash = lafeaAnalysisMeshContentHash(mesh);
  const stats = meshStats(kernel.elements, mesh);
  const binding = context.binding;
  const blockingReasons = [];
  if (stats.nodes > context.intent.maximumNodes
    || stats.nodes > binding.qualification.maximumNodes) blockingReasons.push('NODE_LIMIT_EXCEEDED');
  if (stats.elements > context.intent.maximumElements
    || stats.elements > binding.qualification.maximumElements) blockingReasons.push('ELEMENT_LIMIT_EXCEEDED');
  if (stats.dofs > context.intent.maximumEstimatedDofs
    || stats.dofs > binding.qualification.maximumEstimatedDofs) blockingReasons.push('DOF_LIMIT_EXCEEDED');
  if (stats.adjacentRatioMax > context.intent.growthLimit) blockingReasons.push('GROWTH_LIMIT_EXCEEDED');
  const resourceDisposition = blockingReasons.some((row) => /LIMIT_EXCEEDED/u.test(row))
    ? 'BLOCK' : nearResourceCeiling(stats, context.intent) ? 'WARNING' : 'WITHIN_LIMITS';
  const plan = createLafeaDomainFirstMeshPlanV2({
    schema: LAFEA_DOMAIN_FIRST_MESH_PLAN_SCHEMA,
    stageId: context.intent.stageId,
    intentHash: context.intent.semanticHash,
    capabilityHash: binding.capabilityHash,
    qualificationHash: binding.qualificationHash,
    producerId: binding.producerId,
    producerRevision: binding.producerRevision,
    sourceHash: context.intent.sourceHash,
    analysisDomainHash: context.intent.analysisDomainHash,
    analysisGeometryHash: context.intent.analysisGeometryHash,
    meshProfileHash: context.intent.meshProfileHash,
    elementFamily: context.intent.elementFamily,
    plannedMeshHash,
    estimatedNodes: stats.nodes,
    estimatedElements: stats.elements,
    estimatedDofs: stats.dofs,
    boundaryCornerCount: stats.boundaryCornerCount,
    characteristicLengthMin: stats.lengths[0],
    characteristicLengthMedian: median(stats.lengths),
    characteristicLengthMax: stats.lengths.at(-1),
    observedAdjacentSizeRatioMax: stats.adjacentRatioMax,
    refinementFeatureIds: context.intent.refinementFeatureIds,
    resourceDisposition,
    policyDisposition: blockingReasons.length ? 'BLOCK' : 'PASS',
    blockingReasons,
    scopeLimitations: LIMITATIONS,
  });
  return freeze({ plan });
}

export function executeLafeaDomainFirstT6Mesh(input) {
  const context = prepare(input);
  const preview = buildPreview(input);
  if (preview.plan.policyDisposition === 'BLOCK'
    || preview.plan.resourceDisposition === 'BLOCK') fail('LAFEA_MP3_PLAN_BLOCKED');
  const kernel = triangulateLafeaDomainFirstT6(context);
  const mesh = assembleMesh(kernel.elements, context.intent);
  const meshHash = lafeaAnalysisMeshContentHash(mesh);
  if (meshHash !== preview.plan.plannedMeshHash) fail('LAFEA_MP3_REPEATABILITY_FAILED');
  const binding = context.binding;
  const rawOutput = createLafeaDomainFirstMeshProducerOutputV2({
    schema: LAFEA_DOMAIN_FIRST_MESH_PRODUCER_OUTPUT_SCHEMA,
    stageId: context.intent.stageId,
    intentHash: context.intent.semanticHash,
    planHash: preview.plan.planHash,
    capabilityHash: binding.capabilityHash,
    qualificationHash: binding.qualificationHash,
    producerId: binding.producerId,
    producerRevision: binding.producerRevision,
    sourceHash: context.intent.sourceHash,
    analysisDomainHash: context.intent.analysisDomainHash,
    analysisGeometryHash: context.intent.analysisGeometryHash,
    meshProfileHash: context.intent.meshProfileHash,
    elementFamily: 'T6',
    mesh,
  });
  const output = validateLafeaDomainFirstMeshProducerOutputV2(rawOutput, {
    intent: context.intent,
    plan: preview.plan,
  });
  const evidence = createLafeaAnalysisMeshEvidenceV2({
    schema: LAFEA_ANALYSIS_MESH_INTAKE_V2_SCHEMA,
    stageId: 'LAFEA.3',
    sourceHash: context.intent.sourceHash,
    analysisDomainHash: context.intent.analysisDomainHash,
    analysisGeometryHash: context.intent.analysisGeometryHash,
    meshProfile: context.meshProfile,
    mesh,
    authority: {
      schema: LAFEA_ANALYSIS_MESH_AUTHORITY_V2_SCHEMA,
      stageId: 'LAFEA.3',
      authorityRole: LAFEA_ANALYSIS_MESH_AUTHORITY_V2_ROLE,
      status: 'ACCEPTED_BY_STAGE_CONTRACT',
      producerRef: binding.producerRef,
      sourceHash: context.intent.sourceHash,
      analysisDomainHash: context.intent.analysisDomainHash,
      analysisGeometryHash: context.intent.analysisGeometryHash,
      meshProfileHash: context.meshProfileHash,
      meshHash,
      capabilityHash: binding.capabilityHash,
      qualificationHash: binding.qualificationHash,
      planHash: preview.plan.planHash,
    },
  });
  return freeze({
    schema: 'lafea-domain-first-t6-producer-execution/v1',
    status: evidence.qualification === 'PASS' ? 'QUALIFIED' : 'BLOCKED',
    custodyEligible: evidence.qualification === 'PASS',
    intent: context.intent,
    plan: preview.plan,
    output,
    evidence,
  });
}

function prepare(input) {
  const { meshProfile, meshProfileHash } = requireLafeaDomainFirstMeshProfileHash(
    input.meshProfile, input.intent.meshProfileHash,
  );
  const binding = bindLafeaDomainFirstT6Producer(input.intent);
  if (meshProfile.fields.continuumElement !== 'T6'
    || meshProfile.fields.globalTargetSize !== input.intent.targetElementLength
    || meshProfile.fields.adjacentSizeRatioMax !== input.intent.growthLimit) {
    fail('LAFEA_MP3_MESH_PROFILE_INTENT_MISMATCH');
  }
  return freeze({
    intent: input.intent,
    analysisDomain: input.analysisDomain,
    analysisGeometryEvidence: input.analysisGeometryEvidence,
    meshProfile, meshProfileHash, binding,
  });
}

function assembleMesh(elements, intent) {
  const corners = new Map();
  const edges = new Map();
  for (const element of elements) {
    element.nodes.slice(0, 3).forEach((node) => {
      const current = corners.get(node.sourceCornerIndex);
      const point = { x: clean(node.x), y: clean(node.y) };
      if (current && !samePoint(current, point)) fail('LAFEA_MP3_CORNER_COORDINATE_MISMATCH');
      corners.set(node.sourceCornerIndex, point);
    });
    for (let edge = 0; edge < 3; edge += 1) {
      const a = element.nodes[edge].sourceCornerIndex;
      const b = element.nodes[(edge + 1) % 3].sourceCornerIndex;
      const mid = element.nodes[3 + edge];
      const key = edgeKey(a, b);
      const row = { x: clean(mid.x), y: clean(mid.y) };
      if (edges.has(key) && !samePoint(edges.get(key), row)) fail('LAFEA_MP3_MIDSIDE_COORDINATE_MISMATCH');
      edges.set(key, row);
    }
  }
  const cornerIds = new Map([...corners.keys()].sort((a, b) => a - b)
    .map((index, ordinal) => [index, `MP3-C-${pad(ordinal + 1)}`]));
  const edgeIds = new Map([...edges.keys()].sort(compareEdgeKeys)
    .map((key, ordinal) => [key, `MP3-M-${pad(ordinal + 1)}`]));
  const nodes = [
    ...[...cornerIds].map(([index, nodeId]) => ({ nodeId, ...corners.get(index), z: 0 })),
    ...[...edgeIds].map(([key, nodeId]) => ({ nodeId, ...edges.get(key), z: 0 })),
  ];
  const meshElements = [...elements].sort((a, b) => a.elementIndex - b.elementIndex)
    .map((element, ordinal) => {
      const indices = element.nodes.slice(0, 3).map((node) => node.sourceCornerIndex);
      const mids = [0, 1, 2].map((edge) =>
        edgeIds.get(edgeKey(indices[edge], indices[(edge + 1) % 3])));
      return {
        elementId: `MP3-E-${pad(ordinal + 1)}`,
        elementType: 'T6',
        nodeIds: [...indices.map((index) => cornerIds.get(index)), ...mids],
      };
    });
  return freeze({
    schema: 'lafea-analysis-mesh/v1',
    meshIdentity: `LAFEA.3/T6/MP3/${intent.semanticHash.slice(7, 23)}`,
    nodes,
    elements: meshElements,
  });
}

function meshStats(rawElements, mesh) {
  const edgeLengths = new Map();
  const charLength = new Map();
  const edgeOwners = new Map();
  for (const element of rawElements) {
    const corners = element.nodes.slice(0, 3);
    const lengths = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = corners[edge]; const b = corners[(edge + 1) % 3];
      const key = edgeKey(a.sourceCornerIndex, b.sourceCornerIndex);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      edgeLengths.set(key, length);
      if (!edgeOwners.has(key)) edgeOwners.set(key, []);
      edgeOwners.get(key).push(element.elementIndex);
      lengths.push(length);
    }
    charLength.set(element.elementIndex, Math.max(...lengths));
  }
  let adjacentRatioMax = 1;
  for (const owners of edgeOwners.values()) {
    if (owners.length !== 2) continue;
    const pair = owners.map((id) => charLength.get(id));
    adjacentRatioMax = Math.max(adjacentRatioMax, Math.max(...pair) / Math.min(...pair));
  }
  const lengths = [...edgeLengths.values()].sort((a, b) => a - b);
  const boundaryCornerCount = new Set(rawElements.flatMap((element) =>
    element.nodes.slice(0, 3).map((node) => node.sourceCornerIndex))).size;
  return {
    nodes: mesh.nodes.length,
    elements: mesh.elements.length,
    dofs: mesh.nodes.length * 2,
    boundaryCornerCount,
    lengths,
    adjacentRatioMax,
  };
}
function nearResourceCeiling(stats, intent) {
  return stats.nodes >= intent.maximumNodes * 0.9
    || stats.elements >= intent.maximumElements * 0.9
    || stats.dofs >= intent.maximumEstimatedDofs * 0.9;
}
function median(values) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }
function compareEdgeKeys(left, right) {
  const a = left.split(':').map(Number); const b = right.split(':').map(Number);
  return a[0] - b[0] || a[1] - b[1];
}
function samePoint(a, b) {
  const scale = Math.max(1, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y));
  return Math.hypot(a.x - b.x, a.y - b.y) <= 1e-12 * scale;
}
function clean(value) { return Object.is(value, -0) ? 0 : value; }
function pad(value) { return String(value).padStart(6, '0'); }
function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
