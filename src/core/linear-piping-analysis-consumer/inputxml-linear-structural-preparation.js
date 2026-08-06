import {
  FRAME_LOCAL_AXIS_PROFILE,
  conditionGeometry,
  resolveFrameLocalAxes,
} from '../centerline-beam-fea/index.js';
import { compileMechanicalModel } from '../linear-fea-model-compiler/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  INPUTXML_LENGTH_UNIT_REGISTRY_ID,
  LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
  sealLinearPipingInputXmlUnitProfile,
} from './inputxml-unit-contract.js';
import { normalizeLinearPipingInputXmlGeometry } from './inputxml-unit-normalization.js';
import { requireInputXmlLinearModelHealth } from './inputxml-model-health-contract.js';
import { compileInputXmlElementAuthorities } from './inputxml-linear-preparation-authorities.js';
import { compileInputXmlConstraintAuthorities } from './inputxml-linear-preparation-constraints.js';
import {
  INPUTXML_LINEAR_CONDITIONING_PROFILE,
  InputXmlLinearPreparationError,
  inputXmlMechanicalModelCompilerProfile,
  requireInputXmlLinearPreparationProfile,
} from './inputxml-linear-preparation-profile.js';
import {
  INPUTXML_LINEAR_STRUCTURAL_PREPARATION_SCHEMA,
  sealInputXmlLinearStructuralPreparation,
} from './inputxml-linear-structural-preparation-contract.js';

export function prepareInputXmlLinearStructure(healthContext, analysisProfileId, options) {
  requireHealthContext(healthContext);
  const accepted = options ?? {};
  const modelId = normalizeModelId(accepted.modelId ?? 'IXP');
  const profile = requireInputXmlLinearPreparationProfile(analysisProfileId);
  const report = requireInputXmlLinearModelHealth(
    healthContext.report,
    healthContext.sourceBundle,
    healthContext.topology,
  );
  const capability = report.capabilities.find((row) => row.capabilityId === profile.modelCapabilityId);
  if (!capability || capability.status === 'BLOCK') {
    throw new InputXmlLinearPreparationError(
      `InputXML profile ${analysisProfileId} is blocked by model-health diagnosis.`,
      'INPUTXML_PREPARATION_PROFILE_CAPABILITY_BLOCKED',
      {
        analysisProfileId,
        capabilityId: profile.modelCapabilityId,
        findingIds: capability?.findingIds ?? [],
        limitationCodes: capability?.limitationCodes ?? [],
      },
    );
  }

  const sourceBundle = healthContext.sourceBundle;
  const sourceUnit = sourceBundle.geometry.summary?.inputXmlLengthUnit
    ?? sourceBundle.unitSystem.lengthUnit;
  const unitProfile = sealLinearPipingInputXmlUnitProfile({
    schema: LINEAR_PIPING_INPUTXML_UNIT_PROFILE_SCHEMA,
    profileId: `INPUTXML-STRUCTURAL-PREPARATION-${sourceUnit}-R1`,
    registryId: INPUTXML_LENGTH_UNIT_REGISTRY_ID,
    allowedSourceUnits: [sourceUnit],
    sourceEvidence: {
      authority: 'CAESAR-II-INPUTXML-UNITS-BLOCK',
      documentId: sourceBundle.source.fileName ?? sourceBundle.source.sourceLabel,
      revision: sourceBundle.source.contentHash,
      sourceSemanticHash: sourceBundle.source.sourceSemanticHash,
    },
    semanticHash: '',
  });
  const unitResult = normalizeLinearPipingInputXmlGeometry(sourceBundle.geometry, unitProfile);
  const geometry = unitResult.geometry;
  const conditionedTopology = conditionGeometry(geometry, [], INPUTXML_LINEAR_CONDITIONING_PROFILE);
  const authorities = compileInputXmlElementAuthorities({
    sourceBundle,
    geometry,
    inventory: report.inventory,
    modelId,
    analysisProfileId,
  });
  const constraints = compileInputXmlConstraintAuthorities({
    inventory: report.inventory,
    modelId,
    analysisProfileId,
  });
  const axes = authorities.entries.map((entry) => ({
    evidenceIdentity: `AXIS-${entry.elementId}`,
    result: resolveFrameLocalAxes({
      nodeI: point(geometry, entry.sourceSegment.startNodeId),
      nodeJ: point(geometry, entry.sourceSegment.endNodeId),
      referenceVector: entry.referenceVector,
      profile: FRAME_LOCAL_AXIS_PROFILE,
    }),
  }));
  const compilation = compileMechanicalModel({
    modelIdentity: `${modelId}-${analysisProfileId}`,
    modelRevision: 1,
    sourceSemanticHash: sourceBundle.semanticHash,
    conditionedTopology,
    nodeBindings: geometry.nodes.map((node) => ({
      nodeId: `${modelId}.N${node.id}`,
      conditionedNodeId: `CN-${node.id}`,
      topologyNodeId: node.id,
    })),
    elementBindings: authorities.entries.map((entry) => ({
      elementId: entry.elementId,
      conditionedSegmentId: entry.sourceSegment.id,
      topologySegmentId: entry.sourceSegment.id,
      materialStateId: entry.materialResolution.materialState.materialStateId,
      sectionStateId: entry.analysisSection.sectionState.sectionStateId,
      formulationId: 'PIPE_FRAME3D_LINEAR_V1',
      localAxisEvidenceIdentity: `AXIS-${entry.elementId}`,
      sourceComponentId: entry.rigidAuthority?.rigidElementId
        ?? entry.sourceSegment.sourceComponentUid
        ?? entry.sourceSegment.id,
    })),
    materialResolutions: authorities.materialResolutions,
    sectionResolutions: authorities.sectionResolutions,
    localAxisResults: axes,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    constraintDeclarations: constraints.declarations,
    profile: inputXmlMechanicalModelCompilerProfile(),
  });

  const materialBindings = authorities.entries.map((entry) => Object.freeze({
    segmentId: entry.sourceSegment.id,
    elementId: entry.elementId,
    sourceElementIndex: entry.sourceElementIndex,
    sourceRecordSemanticHash: entry.sourceRecordSemanticHash,
    materialStateId: entry.materialResolution.materialState.materialStateId,
    materialResolutionSemanticHash: entry.materialResolution.semanticHash,
    materialResolutionEvidenceHash: entry.materialResolution.evidenceHash,
    thermalAuthority: entry.thermalAuthority,
  }));
  const sectionBindings = authorities.entries.map((entry) => Object.freeze({
    segmentId: entry.sourceSegment.id,
    elementId: entry.elementId,
    physicalSectionStateId: entry.physicalSection.sectionState.sectionStateId,
    physicalSectionSemanticHash: entry.physicalSection.semanticHash,
    analysisSectionStateId: entry.analysisSection.sectionState.sectionStateId,
    analysisSectionSemanticHash: entry.analysisSection.semanticHash,
    rigidElementId: entry.rigidAuthority?.rigidElementId ?? null,
  }));
  const componentBindings = authorities.entries.map((entry) => Object.freeze({
    segmentId: entry.sourceSegment.id,
    elementId: entry.elementId,
    componentKind: entry.componentKind,
    implementation: entry.implementation,
    limitationCode: entry.limitationCode,
    rigidAuthoritySemanticHash: entry.rigidAuthority?.semanticHash ?? null,
  }));
  const limitations = uniqueAscii([
    ...capability.limitationCodes,
    ...componentBindings.map((row) => row.limitationCode),
    ...constraints.bindings.map((row) => row.limitationCode),
  ].filter(Boolean));
  const thermalAuthoritySummary = thermalSummary(materialBindings, sourceBundle);

  return sealInputXmlLinearStructuralPreparation({
    schema: INPUTXML_LINEAR_STRUCTURAL_PREPARATION_SCHEMA,
    preparationId: `IXP-${semanticHash({ source: sourceBundle.semanticHash, modelId, analysisProfileId })}`,
    modelId,
    analysisProfileId,
    modelCapabilityId: profile.modelCapabilityId,
    profileCapabilityStatus: capability.status,
    sourceBundleSemanticHash: sourceBundle.semanticHash,
    sourceBundleEvidenceHash: sourceBundle.evidenceHash,
    modelHealthSemanticHash: report.semanticHash,
    modelHealthEvidenceHash: report.evidenceHash,
    topologySemanticHash: healthContext.topology.semanticHash,
    topologyEvidenceHash: healthContext.topology.evidenceHash,
    unitNormalizationSemanticHash: unitResult.semanticHash,
    unitNormalizationEvidenceHash: unitResult.evidenceHash,
    normalizedGeometry: geometry,
    conditionedTopology,
    materialResolutions: authorities.materialResolutions,
    sectionResolutions: authorities.sectionResolutions,
    rigidAuthorities: authorities.rigidAuthorities,
    materialBindings,
    sectionBindings,
    componentBindings,
    constraintDeclarations: constraints.declarations,
    constraintBindings: constraints.bindings,
    compilation,
    thermalAuthoritySummary,
    limitations,
    summary: {
      elementCount: authorities.entries.length,
      materialStateCount: authorities.materialResolutions.length,
      sectionStateCount: authorities.sectionResolutions.length,
      rigidAuthorityCount: authorities.rigidAuthorities.length,
      constraintDeclarationCount: constraints.declarations.length,
      approximatedComponentCount: componentBindings.filter(
        (row) => row.implementation === 'IMPLEMENTED_WITH_DECLARED_APPROXIMATION',
      ).length,
      approximatedConstraintCount: constraints.bindings.filter(
        (row) => row.implementation === 'IMPLEMENTED_WITH_DECLARED_APPROXIMATION',
      ).length,
      mechanicalModelSemanticHash: compilation.semanticHash,
      mechanicalModelEvidenceHash: compilation.evidenceHash,
    },
  });
}

function thermalSummary(materialBindings, sourceBundle) {
  const unresolved = materialBindings.filter((row) => row.thermalAuthority.status !== 'RESOLVED');
  const activeTemperatureCount = sourceBundle.sourceRecords.temperatureSets.filter(
    (row) => row.canonicalValue !== null && !row.sentinel?.matched,
  ).length;
  return Object.freeze({
    activeTemperatureRecordCount: activeTemperatureCount,
    resolvedSegmentIds: Object.freeze(materialBindings
      .filter((row) => row.thermalAuthority.status === 'RESOLVED')
      .map((row) => row.segmentId)),
    unresolvedSegmentIds: Object.freeze(unresolved.map((row) => row.segmentId)),
    operatingMaterialAuthorityReady: activeTemperatureCount > 0 && unresolved.length === 0,
    unresolvedCoefficientPlaceholder: 0,
    placeholderUsage: 'NONTHERMAL_MODEL_COMPILATION_ONLY',
  });
}

function point(geometry, nodeId) {
  const node = geometry.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new InputXmlLinearPreparationError(
    `Node ${nodeId} is missing from normalized geometry.`,
    'INPUTXML_PREPARATION_NODE_MISSING',
    { nodeId },
  );
  return [node.x, node.y, node.z];
}

function requireHealthContext(value) {
  if (!value || value.schema !== 'fea-inputxml-model-health-context/v1'
    || !value.sourceBundle || !value.topology || !value.report) {
    throw new TypeError('prepareInputXmlLinearStructure requires a retained InputXML model-health context.');
  }
}

function normalizeModelId(value) {
  const text = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_.-]+$/u.test(text)) {
    throw new TypeError('InputXML structural preparation modelId is invalid.');
  }
  return text;
}

function uniqueAscii(values) {
  return [...new Set(values.map(String))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
