import {
  FRAME_LOCAL_AXIS_PROFILE,
  resolveFrameLocalAxes,
} from '../centerline-beam-fea/index.js';
import {
  compileFrameElement,
  frameTransformationMatrix,
  transformLoadToGlobal,
  transformStiffnessToGlobal,
} from '../linear-fea-frame-element/index.js';
import {
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
  requireElementContribution,
} from '../linear-fea-solver/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';

export const INPUTXML_FEATURE_STIFFNESS_AUTHORITIES_SCHEMA =
  'fea-inputxml-feature-stiffness-authorities/v1';

/**
 * Compile one stiffness contribution per feature-aware analysis span. Bends
 * contribute their existing B-3.2 effective matrices, tee flexibility modifies
 * the existing adjacent B-3.1 spans, reducers contribute their condensed 12-DOF
 * matrices, and all remaining spans use ordinary B-3.1 frame elements.
 */
export function compileInputXmlFeatureStiffnessAuthorities({
  sourcePreparation,
  featurePreparation,
  frameElementProfile,
  localAxisProfile = FRAME_LOCAL_AXIS_PROFILE,
}) {
  const source = requireInputXmlLinearSolvePreparation(sourcePreparation);
  requireFeaturePreparation(featurePreparation, source);
  const geometry = featurePreparation.analysisGeometry;
  const nodeById = new Map(geometry.nodes.map((row) => [String(row.id), row]));
  const sourceBindingById = new Map(source.segmentBindings.map((row) => [String(row.segmentId), row]));
  const materialByHash = new Map(source.materialResolutions.map((row) => [row.semanticHash, row]));
  const sectionByHash = new Map(source.sectionResolutions.map((row) => [row.semanticHash, row]));
  const bendComponentById = new Map(featurePreparation.bendComponents.map((row) => [row.componentId, row]));
  const reducerBySource = new Map(featurePreparation.reducerAuthorities.map((row) => [String(row.sourceSegmentId), row]));
  const teeModifierBySource = mergeTeeModifiers(featurePreparation.teeJunctions);
  const frameElements = [];
  const contributions = [];
  const ledger = [];

  for (const segment of geometry.segments) {
    const sourceSegmentId = String(segment.meta?.sourceSegmentId ?? segment.id);
    const binding = sourceBindingById.get(sourceSegmentId);
    if (!binding) fail('INPUTXML_FEATURE_STIFFNESS_SOURCE_BINDING_MISSING', `Analysis segment ${segment.id} has no source binding ${sourceSegmentId}.`);
    if (segment.meta?.analysisRole === 'BEND_ARC') {
      const component = bendComponentById.get(segment.meta.componentId);
      const componentIndex = segment.meta.componentElementIndex;
      const entry = component?.elements?.[componentIndex];
      if (!entry || entry.elementId !== segment.id) {
        fail('INPUTXML_FEATURE_STIFFNESS_BEND_BINDING_STALE', `Bend analysis segment ${segment.id} cannot resolve its B-3.2 element.`);
      }
      const contribution = elementContributionsFromPipingComponent(component)[componentIndex];
      contributions.push(contribution);
      ledger.push(ledgerRow(segment, sourceSegmentId, 'BEND_B3_2', contribution, entry.frameElement.semanticHash));
      continue;
    }
    if (reducerBySource.has(sourceSegmentId)) {
      if (String(segment.id) !== sourceSegmentId) {
        fail('INPUTXML_FEATURE_STIFFNESS_REDUCER_TOPOLOGY_INVALID', `Reducer ${sourceSegmentId} must remain one public boundary span after feature preparation.`);
      }
      if (teeModifierBySource.has(sourceSegmentId)) {
        fail('INPUTXML_FEATURE_STIFFNESS_FEATURE_OVERLAP_UNSUPPORTED', `Reducer ${sourceSegmentId} cannot also carry tee end flexibility in this formulation.`);
      }
      const reducer = reducerBySource.get(sourceSegmentId);
      const axes = resolveAxes(segment, nodeById, [0, 0, 1], localAxisProfile);
      const contribution = reducerContribution({
        elementId: String(segment.id),
        authority: reducer.authority,
        axes,
        includeGravity: false,
        includeThermal: false,
      });
      contributions.push(contribution);
      ledger.push(ledgerRow(segment, sourceSegmentId, 'REDUCER_CONDENSED', contribution, reducer.authority.semanticHash));
      continue;
    }

    const material = materialByHash.get(binding.materialResolutionSemanticHash);
    const sectionHash = segment.meta?.analysisRole === 'BEND_INCOMING_STRAIGHT'
      ? binding.physicalSectionSemanticHash
      : binding.analysisSectionSemanticHash;
    const section = sectionByHash.get(sectionHash);
    if (!material || !section) {
      fail('INPUTXML_FEATURE_STIFFNESS_AUTHORITY_STALE', `Analysis segment ${segment.id} cannot resolve material/section authority.`);
    }
    const tee = teeModifierBySource.get(sourceSegmentId) ?? null;
    const referenceVector = tee?.referenceVector ?? [0, 0, 1];
    const axes = resolveAxes(segment, nodeById, referenceVector, localAxisProfile);
    const frameElement = compileFrameElement({
      elementId: String(segment.id),
      material,
      section,
      localAxes: { result: axes, profile: localAxisProfile },
      profile: frameElementProfile,
      distributedLoads: [],
      temperature: null,
      releases: [],
      endSprings: tee?.endSprings ?? [],
      rigidOffsets: tee?.rigidOffsets ?? null,
    });
    const contribution = elementContributionFromFrameElement(frameElement);
    frameElements.push(frameElement);
    contributions.push(contribution);
    ledger.push(ledgerRow(segment, sourceSegmentId, tee ? 'TEE_MODIFIED_FRAME' : 'FRAME_B3_1', contribution, frameElement.semanticHash));
  }

  requireOneContributionPerSegment(geometry, contributions);
  const draft = {
    schema: INPUTXML_FEATURE_STIFFNESS_AUTHORITIES_SCHEMA,
    sourcePreparationSemanticHash: source.semanticHash,
    featurePreparationSemanticHash: featurePreparation.semanticHash,
    frameElements: Object.freeze(frameElements),
    bendComponents: featurePreparation.bendComponents,
    reducerAuthorities: featurePreparation.reducerAuthorities,
    elementContributions: Object.freeze(contributions.sort((a, b) => compareAscii(a.elementId, b.elementId))),
    elementLedger: Object.freeze(ledger.sort((a, b) => compareAscii(a.elementId, b.elementId))),
    summary: Object.freeze({
      analysisElementCount: geometry.segments.length,
      frameElementCount: frameElements.length,
      bendElementCount: ledger.filter((row) => row.kind === 'BEND_B3_2').length,
      teeModifiedElementCount: ledger.filter((row) => row.kind === 'TEE_MODIFIED_FRAME').length,
      reducerElementCount: ledger.filter((row) => row.kind === 'REDUCER_CONDENSED').length,
    }),
  };
  return Object.freeze({ ...draft, semanticHash: semanticHash(draft) });
}

/**
 * Create the reducer contribution for a specific physical case. Stiffness is
 * invariant; gravity and thermal condensed vectors are independently enabled
 * so SUS and OPE states can use the same qualified condensed authority without
 * superposition assumptions about support status.
 */
export function reducerElementContributionForCase({
  elementId,
  authority,
  nodeIPosition,
  nodeJPosition,
  referenceVector = [0, 0, 1],
  localAxisProfile = FRAME_LOCAL_AXIS_PROFILE,
  includeGravity,
  includeThermal,
}) {
  const axes = resolveFrameLocalAxes({
    nodeI: nodeIPosition,
    nodeJ: nodeJPosition,
    referenceVector,
    profile: localAxisProfile,
  });
  return reducerContribution({ elementId, authority, axes, includeGravity, includeThermal });
}

function reducerContribution({ elementId, authority, axes, includeGravity, includeThermal }) {
  if (!authority?.condensed
    || !Array.isArray(authority.condensed.localStiffness)
    || authority.condensed.localStiffness.length !== 144) {
    throw new TypeError('Reducer authority must contain a condensed 12x12 local stiffness matrix.');
  }
  const transformation = frameTransformationMatrix(axes.axes);
  const zero = new Array(12).fill(0);
  const gravityLocal = includeGravity ? authority.condensed.gravityLocalVector : zero;
  const thermalLocal = includeThermal ? authority.condensed.thermalInitialStrainLocalVector : zero;
  return requireElementContribution({
    elementId,
    globalStiffness: transformStiffnessToGlobal(authority.condensed.localStiffness, transformation),
    equivalentLoadGlobal: transformLoadToGlobal(gravityLocal, transformation),
    initialStrainLoadGlobal: transformLoadToGlobal(thermalLocal, transformation),
  });
}

function mergeTeeModifiers(teeJunctions) {
  const bySegment = new Map();
  for (const junction of teeJunctions) {
    for (const modifier of junction.modifiers) {
      const id = String(modifier.legId);
      const current = bySegment.get(id) ?? {
        referenceVector: modifier.referenceVector,
        endSprings: [],
        rigidOffsets: { I: null, J: null },
        planeNormals: [],
      };
      if (!parallel(current.referenceVector, modifier.referenceVector)) {
        fail(
          'INPUTXML_FEATURE_STIFFNESS_TEE_AXIS_CONFLICT',
          `Source span ${id} connects tee junctions with incompatible local bending planes; a full rotated spring tensor is required.`,
        );
      }
      if (current.endSprings.some((row) => row.end === modifier.junctionEnd)) {
        fail('INPUTXML_FEATURE_STIFFNESS_TEE_END_DUPLICATE', `Source span ${id} has multiple tee modifiers at end ${modifier.junctionEnd}.`);
      }
      current.endSprings.push(...modifier.rotationalSprings);
      if (modifier.rigidOffset !== null) {
        if (current.rigidOffsets[modifier.junctionEnd] !== null) {
          fail('INPUTXML_FEATURE_STIFFNESS_TEE_OFFSET_DUPLICATE', `Source span ${id} has multiple tee offsets at end ${modifier.junctionEnd}.`);
        }
        current.rigidOffsets[modifier.junctionEnd] = asOffsetRecord(modifier.rigidOffset);
      }
      current.planeNormals.push(modifier.referenceVector);
      bySegment.set(id, current);
    }
  }
  return new Map([...bySegment].map(([id, row]) => [id, Object.freeze({
    referenceVector: Object.freeze([...row.referenceVector]),
    endSprings: Object.freeze(row.endSprings.sort((a, b) => compareAscii(`${a.end}:${a.dof}`, `${b.end}:${b.dof}`))),
    rigidOffsets: row.rigidOffsets.I === null && row.rigidOffsets.J === null ? null : Object.freeze({ ...row.rigidOffsets }),
  })]));
}

function resolveAxes(segment, nodes, referenceVector, profile) {
  const nodeI = nodes.get(String(segment.startNodeId));
  const nodeJ = nodes.get(String(segment.endNodeId));
  if (!nodeI || !nodeJ) fail('INPUTXML_FEATURE_STIFFNESS_NODE_MISSING', `Analysis segment ${segment.id} has missing endpoint geometry.`);
  return resolveFrameLocalAxes({
    nodeI: [nodeI.x, nodeI.y, nodeI.z],
    nodeJ: [nodeJ.x, nodeJ.y, nodeJ.z],
    referenceVector,
    profile,
  });
}

function ledgerRow(segment, sourceSegmentId, kind, contribution, authoritySemanticHash) {
  return Object.freeze({
    elementId: String(segment.id),
    sourceSegmentId,
    nodeI: String(segment.startNodeId),
    nodeJ: String(segment.endNodeId),
    kind,
    authoritySemanticHash,
    globalStiffnessHash: semanticHash(contribution.globalStiffness),
  });
}

function requireOneContributionPerSegment(geometry, contributions) {
  const expected = geometry.segments.map((row) => String(row.id)).sort(compareAscii);
  const actual = contributions.map((row) => row.elementId).sort(compareAscii);
  if (new Set(actual).size !== actual.length
    || expected.length !== actual.length
    || expected.some((id, index) => id !== actual[index])) {
    fail('INPUTXML_FEATURE_STIFFNESS_COVERAGE_INVALID', 'Feature-aware stiffness must provide exactly one contribution per analysis segment.');
  }
}

function requireFeaturePreparation(value, source) {
  if (!value
    || value.schema !== 'fea-inputxml-feature-mechanics-preparation/v1'
    || value.sourcePreparationSemanticHash !== source.semanticHash
    || typeof value.semanticHash !== 'string') {
    throw new TypeError('featurePreparation is invalid or stale for sourcePreparation.');
  }
}
function parallel(a, b) {
  const cross = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  return Math.hypot(...cross) <= 1e-10;
}
function asOffsetRecord(vector) { return { x: vector[0], y: vector[1], z: vector[2] }; }
function compareAscii(left, right) { return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0; }
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
