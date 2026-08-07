import { FRAME_LOCAL_AXIS_PROFILE } from '../centerline-beam-fea/index.js';
import {
  deriveB31JDirectionalBranchEndModifiers,
} from '../linear-fea-piping-components/index.js';
import {
  compileTenCylinderReducerAuthority,
  requireReducerCondensationRequest,
  sealReducerCondensationRequest,
} from '../linear-fea-reducer-condensation/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';
import { compileInputXmlBendFeatureExpansion } from './inputxml-bend-feature-expansion.js';

export const INPUTXML_FEATURE_MECHANICS_PREPARATION_SCHEMA =
  'fea-inputxml-feature-mechanics-preparation/v1';

/**
 * Build the feature-aware mechanical authority layer beside the legacy v1
 * one-source-span preparation. Bend and reducer custody remains source-span
 * based. Tee flexibility is keyed by the physical three-leg junction because
 * CAESAR may attach multiple SIF tags to spans belonging to one junction.
 */
export function compileInputXmlFeatureMechanicsPreparation({
  sourcePreparation,
  editionProfileId,
  momentDirectionMapping,
  smooth90FlexibilityCorrection,
  frameElementProfile,
  pipingComponentProfile,
  localAxisProfile = FRAME_LOCAL_AXIS_PROFILE,
  teeFactorResultByJunctionNodeId = new Map(),
  reducerRequestBySegmentId = new Map(),
  reducerSamplingQualification = null,
}) {
  const source = requireInputXmlLinearSolvePreparation(sourcePreparation);
  requireMap(teeFactorResultByJunctionNodeId, 'teeFactorResultByJunctionNodeId');
  requireMap(reducerRequestBySegmentId, 'reducerRequestBySegmentId');

  const materialByHash = new Map(source.materialResolutions.map((row) => [row.semanticHash, row]));
  const sectionByHash = new Map(source.sectionResolutions.map((row) => [row.semanticHash, row]));
  const materialBySegmentId = new Map();
  const physicalSectionBySegmentId = new Map();
  for (const binding of source.segmentBindings) {
    const material = materialByHash.get(binding.materialResolutionSemanticHash);
    const section = sectionByHash.get(binding.physicalSectionSemanticHash);
    if (!material || !section) {
      fail(
        'INPUTXML_FEATURE_MECHANICS_AUTHORITY_BINDING_MISSING',
        `Segment ${binding.segmentId} cannot resolve its retained material/physical-section authority.`,
      );
    }
    materialBySegmentId.set(String(binding.segmentId), material);
    physicalSectionBySegmentId.set(String(binding.segmentId), section);
  }

  const componentKinds = indexKinds(source.segmentBindings);
  const teeGroups = groupPhysicalTeeJunctions(source.normalizedGeometry, componentKinds.TEE);
  requireExactMapCoverage(
    teeFactorResultByJunctionNodeId,
    teeGroups.map((row) => row.junctionNodeId),
    'teeFactorResultByJunctionNodeId',
  );
  requireExactMapCoverage(reducerRequestBySegmentId, componentKinds.REDUCER, 'reducerRequestBySegmentId');

  const bendExpansion = compileInputXmlBendFeatureExpansion({
    canonicalGeometry: source.normalizedGeometry,
    editionProfileId,
    momentDirectionMapping,
    smooth90FlexibilityCorrection,
    materialBySegmentId,
    sectionBySegmentId: physicalSectionBySegmentId,
    frameElementProfile,
    pipingComponentProfile,
    localAxisProfile,
    segmentIds: componentKinds.BEND,
  });

  const teeJunctions = teeGroups.map((group) => compileTeeJunction({
    ...group,
    canonicalGeometry: source.normalizedGeometry,
    factorResult: mapValue(teeFactorResultByJunctionNodeId, group.junctionNodeId),
    materialBySegmentId,
    physicalSectionBySegmentId,
    pipingComponentProfile,
  }));
  requireTeeBendNonOverlap(teeJunctions, new Set(componentKinds.BEND));

  const reducerAuthorities = compileReducers({
    reducerSegmentIds: componentKinds.REDUCER,
    reducerRequestBySegmentId,
    reducerSamplingQualification,
  });

  const sourceToAnalysisElementIds = Object.freeze(Object.fromEntries(
    source.segmentBindings.map((binding) => {
      const segmentId = String(binding.segmentId);
      return [
        segmentId,
        bendExpansion.sourceToAnalysisSegmentIds[segmentId] ?? Object.freeze([segmentId]),
      ];
    }),
  ));
  const claimedSourceSegments = new Map();
  for (const id of componentKinds.BEND) claim(claimedSourceSegments, id, 'BEND');
  for (const id of componentKinds.REDUCER) claim(claimedSourceSegments, id, 'REDUCER');
  for (const junction of teeJunctions) {
    for (const modifier of junction.modifiers) {
      claim(claimedSourceSegments, modifier.legId, `TEE@${junction.junctionNodeId}`, true);
    }
  }

  const draft = {
    schema: INPUTXML_FEATURE_MECHANICS_PREPARATION_SCHEMA,
    preparationId: `${source.preparationId}:FEATURE-MECHANICS`,
    sourcePreparationSemanticHash: source.semanticHash,
    sourcePreparationEvidenceHash: source.evidenceHash,
    modelId: source.modelId,
    analysisProfileId: source.analysisProfileId,
    analysisGeometry: bendExpansion.analysisGeometry,
    bendExpansionSemanticHash: bendExpansion.semanticHash,
    bendComponents: bendExpansion.components,
    teeJunctions: Object.freeze(teeJunctions),
    reducerAuthorities: Object.freeze(reducerAuthorities),
    sourceToAnalysisElementIds,
    componentCoverage: Object.freeze({
      bends: Object.freeze([...componentKinds.BEND]),
      teeTaggedSegments: Object.freeze([...componentKinds.TEE]),
      teeJunctionNodeIds: Object.freeze(teeGroups.map((row) => row.junctionNodeId)),
      reducers: Object.freeze([...componentKinds.REDUCER]),
    }),
    ownership: Object.freeze({
      bendFlexibility: 'LFEA-B3.2',
      teeDirectionalFlexibility: 'LFEA-B3.2',
      reducerCondensation: 'LFEA-REDUCER-CONDENSATION',
      baseFrameFormulation: 'LFEA-B3.1',
    }),
    executionBoundary: Object.freeze({
      sourceV1PreparationMutated: false,
      mechanicalModelCompiled: false,
      loadPrimitivesRemapped: false,
      stiffnessAssembled: false,
      solveAuthorized: false,
      reasonCodes: Object.freeze([
        'FEATURE_AWARE_MODEL_COMPILATION_DEFERRED',
        'FEATURE_AWARE_LOAD_REMAP_DEFERRED',
      ]),
    }),
    limitations: Object.freeze([
      'This feature-mechanics preparation supplements rather than mutates the legacy one-source-span solve preparation.',
      'One qualified tee factor result is required per physical three-leg junction, not per SIF-tagged source span.',
      'Tee end modifiers must be applied to existing incident analysis spans; duplicate overlapping tee leg elements are forbidden.',
      'Reducer authorities are emitted only when one predeclared section-sampling rule is uniquely qualified.',
      'One-way supports, gaps and friction remain outside this M035 feature-mechanics layer.',
    ]),
  };
  return Object.freeze({ ...draft, semanticHash: semanticHash(draft) });
}

function groupPhysicalTeeJunctions(geometry, teeSegmentIds) {
  const groups = new Map();
  for (const teeSegmentId of teeSegmentIds) {
    const teeSegment = geometry.segments.find((row) => String(row.id) === String(teeSegmentId));
    if (!teeSegment || teeSegment.type !== 'TEE') {
      fail('INPUTXML_FEATURE_MECHANICS_TEE_SEGMENT_INVALID', `TEE segment ${teeSegmentId} is not present in canonical geometry.`);
    }
    const junctionNodeId = inferTeeJunctionNode(geometry, teeSegment);
    const existing = groups.get(junctionNodeId) ?? [];
    existing.push(String(teeSegmentId));
    groups.set(junctionNodeId, existing);
  }
  return [...groups.entries()]
    .map(([junctionNodeId, taggedSegmentIds]) => Object.freeze({
      junctionNodeId,
      taggedSegmentIds: Object.freeze([...new Set(taggedSegmentIds)].sort(compareAscii)),
    }))
    .sort((left, right) => compareAscii(left.junctionNodeId, right.junctionNodeId));
}

function compileTeeJunction({
  junctionNodeId,
  taggedSegmentIds,
  canonicalGeometry,
  factorResult,
  materialBySegmentId,
  physicalSectionBySegmentId,
  pipingComponentProfile,
}) {
  const junctionPosition = nodePoint(canonicalGeometry, junctionNodeId);
  const incident = canonicalGeometry.segments.filter((row) =>
    String(row.startNodeId) === junctionNodeId || String(row.endNodeId) === junctionNodeId);
  if (incident.length !== 3) {
    fail('INPUTXML_FEATURE_MECHANICS_TEE_TOPOLOGY_INVALID', `TEE junction ${junctionNodeId} must have exactly three incident source spans.`);
  }
  const legs = incident.map((segment) => {
    const segmentId = String(segment.id);
    const atI = String(segment.startNodeId) === junctionNodeId;
    const otherNodeId = atI ? String(segment.endNodeId) : String(segment.startNodeId);
    return Object.freeze({
      legId: segmentId,
      nodeId: otherNodeId,
      junctionEnd: atI ? 'I' : 'J',
      endPoint: nodePoint(canonicalGeometry, otherNodeId),
      material: requiredMapValue(materialBySegmentId, segmentId, 'material'),
      section: requiredMapValue(physicalSectionBySegmentId, segmentId, 'section'),
    });
  });
  const result = deriveB31JDirectionalBranchEndModifiers({
    componentId: `IXTEE.JUNCTION.${safe(junctionNodeId)}`,
    factorResult,
    junctionPosition,
    legs,
    runCollinearityTolerance: pipingComponentProfile.runCollinearityTolerance,
  });
  return Object.freeze({
    junctionNodeId,
    taggedSegmentIds,
    semanticHash: result.semanticHash,
    formulationId: result.formulationId,
    geometry: result.geometry,
    directionalFlexibilityFactors: result.directionalFlexibilityFactors,
    modifiers: result.modifiers,
    flexibilityOwnership: result.flexibilityOwnership,
  });
}

function compileReducers({
  reducerSegmentIds,
  reducerRequestBySegmentId,
  reducerSamplingQualification,
}) {
  if (reducerSegmentIds.length === 0) return [];
  if (!reducerSamplingQualification
    || reducerSamplingQualification.status !== 'QUALIFIED'
    || typeof reducerSamplingQualification.qualifiedSamplingRule !== 'string') {
    fail(
      'INPUTXML_FEATURE_MECHANICS_REDUCER_SAMPLING_NOT_QUALIFIED',
      'Reducer activation requires one uniquely qualified section-sampling rule.',
    );
  }
  return reducerSegmentIds.map((segmentId) => {
    const sourceRequest = requireReducerCondensationRequest(mapValue(reducerRequestBySegmentId, segmentId));
    const request = sealReducerCondensationRequest({
      ...sourceRequest,
      samplingRule: reducerSamplingQualification.qualifiedSamplingRule,
      semanticHash: '',
    });
    const authority = compileTenCylinderReducerAuthority(request);
    return Object.freeze({
      sourceSegmentId: String(segmentId),
      samplingQualificationSemanticHash: reducerSamplingQualification.semanticHash,
      authority,
    });
  });
}

function inferTeeJunctionNode(geometry, teeSegment) {
  const candidates = [String(teeSegment.startNodeId), String(teeSegment.endNodeId)]
    .map((nodeId) => ({ nodeId, count: geometry.segments.filter((row) =>
      String(row.startNodeId) === nodeId || String(row.endNodeId) === nodeId).length }))
    .filter((row) => row.count === 3);
  if (candidates.length !== 1) {
    fail(
      'INPUTXML_FEATURE_MECHANICS_TEE_JUNCTION_AMBIGUOUS',
      `TEE segment ${teeSegment.id} must identify exactly one three-leg junction endpoint; found ${candidates.length}.`,
    );
  }
  return candidates[0].nodeId;
}

function requireTeeBendNonOverlap(junctions, bendIds) {
  for (const junction of junctions) {
    const overlap = junction.modifiers.map((row) => row.legId).filter((id) => bendIds.has(id));
    if (overlap.length > 0) {
      fail(
        'INPUTXML_FEATURE_MECHANICS_FEATURE_OVERLAP_UNSUPPORTED',
        `TEE junction ${junction.junctionNodeId} shares source span(s) ${overlap.join(', ')} with a bend replacement; split the canonical features before assembly.`,
      );
    }
  }
}

function indexKinds(bindings) {
  const result = { BEND: [], TEE: [], REDUCER: [] };
  for (const binding of bindings) {
    if (Object.hasOwn(result, binding.componentKind)) result[binding.componentKind].push(String(binding.segmentId));
  }
  for (const key of Object.keys(result)) result[key].sort(compareAscii);
  return result;
}

function requireExactMapCoverage(map, expectedIds, field) {
  const keys = [...map.keys()].map(String).sort(compareAscii);
  const expected = [...expectedIds].map(String).sort(compareAscii);
  if (keys.length !== expected.length || keys.some((value, index) => value !== expected[index])) {
    fail(
      'INPUTXML_FEATURE_MECHANICS_AUTHORITY_COVERAGE_INCOMPLETE',
      `${field} must cover exactly [${expected.join(', ')}]; got [${keys.join(', ')}].`,
    );
  }
}

function nodePoint(geometry, nodeId) {
  const node = geometry.nodes.find((row) => String(row.id) === String(nodeId));
  if (!node) fail('INPUTXML_FEATURE_MECHANICS_NODE_MISSING', `Node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}

function requiredMapValue(map, key, label) {
  const value = map.get(String(key)) ?? map.get(key);
  if (!value) fail('INPUTXML_FEATURE_MECHANICS_AUTHORITY_MISSING', `${label} authority for ${key} is missing.`);
  return value;
}
function mapValue(map, key) {
  return map.get(String(key)) ?? map.get(key);
}
function requireMap(value, field) {
  if (!(value instanceof Map)) throw new TypeError(`${field} must be a Map keyed by its declared canonical identity.`);
}
function claim(index, segmentId, owner, allowShared = false) {
  const id = String(segmentId);
  const existing = index.get(id);
  if (existing && !allowShared) {
    fail('INPUTXML_FEATURE_MECHANICS_FEATURE_OVERLAP_UNSUPPORTED', `Source segment ${id} is claimed by both ${existing} and ${owner}.`);
  }
  if (!existing) index.set(id, owner);
}
function safe(value) { return String(value).replace(/[^A-Za-z0-9_.-]/gu, '-'); }
function compareAscii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
