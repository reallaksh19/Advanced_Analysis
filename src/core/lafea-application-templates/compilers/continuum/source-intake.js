import { semanticHash } from '../../../shared-piping-model/index.js';
import {
  FORMULATIONS,
  MODEL_SCHEMA,
  QUALIFICATION_PROFILE,
  createCanonicalLocalContinuumModel,
} from '../../../local-continuum/index.js';
import { requireLafeaApplicationTemplate } from '../../template-registry.js';
import { requireT4ContinuumParameterSchema } from '../../parameter-schemas/continuum.js';
import { requireT4ContinuumCompilerBinding } from './bindings.js';
import {
  assertContinuumCompilerParents,
  createContinuumBoundaryArtifact,
  createContinuumCompilationResult,
  createContinuumHandoffArtifact,
  createContinuumMeshRequestArtifact,
  createGeometryArtifact,
  createLoadArtifact,
  deepClone,
  exactRecord,
  parameterMap,
  parameterSourceRefs,
  parameterSourceStatus,
  prepareParameterSet,
  requiredRecord,
  sortedUniqueStrings,
  sourceRefRecord,
  sourceRefRecords,
  unitRecords,
} from './common.js';

const EXPECTED_GEOMETRY_CLASSES = Object.freeze({
  'C2D-BRACKET-GUSSET': 'BRACKET_GUSSET',
  'C2D-CLAMP-EAR': 'CLAMP_EAR',
  'C2D-LUG-PINHOLE': 'LUG_PINHOLE',
  'C2D-NOZZLE-REPAD-SECTION': 'NOZZLE_REPAD_SECTION',
  'C2D-PIPE-PAD-SECTION': 'PIPE_PAD_SECTION',
});

const AUTHORIZED_SOURCE_STATUSES = Object.freeze(['DECLARED', 'IMPORTED', 'VERIFIED']);

export function compileContinuumSourceIntake(templateId, rawParameters) {
  const template = requireLafeaApplicationTemplate(templateId);
  const parameterSchema = requireT4ContinuumParameterSchema(templateId);
  const binding = requireT4ContinuumCompilerBinding(templateId);
  assertContinuumCompilerParents(template, binding, parameterSchema);

  const parameterSet = prepareParameterSet({
    parameterSchema,
    rawParameters,
    normalizeRawParameters,
  });
  const byId = parameterMap(parameterSet);
  const applicationEvidence = applicationEvidenceRecord(
    templateId,
    requiredRecord(byId, 'applicationEvidence'),
  );
  const sourceInput = requiredRecord(byId, 'stageSource');
  const meshProvenance = meshProvenanceRecord(requiredRecord(byId, 'meshProvenance'));
  const featureSizing = featureSizingRecord(
    requiredRecord(byId, 'featureSizing'),
    applicationEvidence.featureIds,
  );
  const limitations = limitationRecord(requiredRecord(byId, 'limitations'));

  assertEnvelopeAndProvenanceStatus(byId, meshProvenance);
  const canonicalModel = createCanonicalLocalContinuumModel(sourceInput);
  assertContinuumSourceAuthority(canonicalModel, binding, featureSizing);

  const stageSource = {
    ...deepClone(canonicalModel.sourceEvidence),
    schema: MODEL_SCHEMA,
  };
  const sourceStatus = parameterSourceStatus(byId, [
    'applicationEvidence',
    'stageSource',
    'meshProvenance',
    'featureSizing',
  ]);
  const sourceReference = singleParameterSourceReference(byId, 'stageSource');
  const applicationReference = singleParameterSourceReference(byId, 'applicationEvidence');
  const meshPayloadHash = semanticHash({
    formulation: canonicalModel.formulation,
    nodes: canonicalModel.nodes,
    elements: canonicalModel.elements,
    elementTypePolicy: canonicalModel.elementTypePolicy,
  });

  const geometry = createGeometryArtifact({
    template,
    binding,
    parameterSet,
    coordinateSystem: {
      identity: 'LAFEA3-CONTINUUM-XY',
      origin: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      sourceRef: sourceRefRecord(applicationReference),
    },
    units: unitRecords(canonicalModel.units),
    features: geometryFeatures({
      applicationEvidence,
      canonicalModel,
      sourceStatus,
      applicationReference,
      sourceReference,
    }),
    localFrames: [{
      frameId: 'LAFEA3-CONTINUUM-XY',
      origin: [0, 0, 0],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      handedness: 'RIGHT_HANDED',
      sourceRef: sourceRefRecord(applicationReference),
      status: sourceStatus,
    }],
    ancestry: {
      applicationGeometryClass: applicationEvidence.geometryClass,
      canonicalModelSemanticHash: canonicalModel.semanticHash,
      sourceEvidenceSemanticHash:
        canonicalModel.sourceAncestry.sourceEvidenceSemanticHash,
      stageSourceSemanticHash: semanticHash(stageSource),
      callerMeshPayloadHash: meshPayloadHash,
      meshProducerIdentity: meshProvenance.producerIdentity,
      meshProducerVersion: meshProvenance.producerVersion,
      compilerGeneratedMesh: false,
      meshQualificationClaimed: false,
    },
    status: sourceStatus,
    diagnostics: [
      'APPLICATION_GEOMETRY_DECLARATION_NOT_INDEPENDENTLY_INFERRED',
      'CALLER_SUPPLIED_ANALYSIS_MESH_RETAINED',
    ],
  });

  const loads = createLoadArtifact({
    template,
    binding,
    parameterSet,
    geometry,
    loadCases: loadArtifacts(canonicalModel, sourceStatus),
    diagnostics: ['PHYSICAL_LAFEA3_LOADS_RETAINED_WITHOUT_SOLVE'],
  });
  const boundaries = createContinuumBoundaryArtifact({
    template,
    binding,
    parameterSet,
    geometry,
    boundaryConditions: boundaryArtifacts(canonicalModel, sourceStatus),
    diagnostics: ['LAFEA3_CONSTRAINTS_RETAINED_WITHOUT_STIFFNESS_ASSEMBLY'],
  });
  const meshRequest = createContinuumMeshRequestArtifact({
    template,
    binding,
    geometry,
    meshProvenance: {
      ...meshProvenance,
      formulationProfileId: canonicalModel.formulation,
    },
    featureSizing: featureSizing.items,
    diagnostics: [
      'CALLER_SUPPLIED_ANALYSIS_MESH',
      'TEMPLATE_COMPILER_GENERATED_MESH=false',
      'MESH_QUALIFICATION_NOT_CLAIMED',
    ],
  });
  const handoff = createContinuumHandoffArtifact({
    template,
    parameterSet,
    geometry,
    loads,
    boundaries,
    meshRequest,
    stageSource,
    diagnostics: [
      'STAGE_SOURCE_VALIDATED_BY_LAFEA3_CANONICAL_MODEL_FACTORY',
      'CALLER_SUPPLIED_MESH_NOT_TEMPLATE_GENERATED',
      'ENGINE_NOT_EXECUTED',
      ...limitations.items.map((value) => `LIMITATION:${value}`),
    ],
  });

  return createContinuumCompilationResult({
    template,
    binding,
    parameterSchema,
    parameterSet,
    geometry,
    loads,
    boundaries,
    meshRequest,
    handoff,
    diagnostics: [
      `FORMULATION:${canonicalModel.formulation}`,
      'NO_AUTOMATIC_MESH_GENERATION',
      'NO_SOLVE_OR_RECOVERY',
      'NO_TEMPLATE_RELEASE_PROMOTION',
    ],
  });
}

function normalizeRawParameters(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const normalized = deepClone(raw);
  sortRecordArray(normalized, 'applicationEvidence', 'featureIds', null);
  sortRecordArray(normalized, 'featureSizing', 'items', 'featureId');
  sortRecordArray(normalized, 'limitations', 'items', null);
  const source = normalized?.stageSource?.value;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    sortArray(source, 'materials', 'materialId');
    sortArray(source, 'nodes', 'nodeId');
    sortArray(source, 'elements', 'elementId');
    sortArray(source, 'constraints', 'constraintId');
    sortArray(source, 'loadCases', 'loadCaseId');
    if (source.resultRequests && Array.isArray(source.resultRequests.loadCaseIds)) {
      source.resultRequests.loadCaseIds = [...source.resultRequests.loadCaseIds].sort(codeSort);
    }
    if (Array.isArray(source.loadCases)) {
      source.loadCases.forEach((loadCase) => {
        sortArray(loadCase, 'nodalForces', 'loadId');
        sortArray(loadCase, 'edgeTractions', 'tractionId');
        sortArray(loadCase, 'pressureLoads', 'pressureLoadId');
        sortArray(loadCase, 'bodyForces', 'bodyForceId');
        sortArray(loadCase, 'temperatureLoads', 'temperatureLoadId');
        sortArray(loadCase, 'imposedDisplacements', 'imposedDisplacementId');
      });
    }
  }
  return normalized;
}

function applicationEvidenceRecord(templateId, value) {
  exactRecord(
    value,
    ['declarationBasis', 'featureIds', 'geometryClass', 'sourceReference'],
    'applicationEvidence',
  );
  const geometryClass = text(value.geometryClass, 'applicationEvidence.geometryClass');
  if (geometryClass !== EXPECTED_GEOMETRY_CLASSES[templateId]) {
    throw new TypeError(
      `APPLICATION_GEOMETRY_CLASS_MISMATCH:${templateId}:${geometryClass}`,
    );
  }
  const featureIds = sortedUniqueStrings(value.featureIds, 'applicationEvidence.featureIds');
  if (featureIds.length === 0) {
    throw new TypeError('applicationEvidence.featureIds must not be empty.');
  }
  return {
    geometryClass,
    declarationBasis: text(value.declarationBasis, 'applicationEvidence.declarationBasis'),
    featureIds,
    sourceReference: text(value.sourceReference, 'applicationEvidence.sourceReference'),
  };
}

function meshProvenanceRecord(value) {
  exactRecord(
    value,
    [
      'generationMode',
      'meshProfileId',
      'producerIdentity',
      'producerVersion',
      'qualityProfileId',
      'sourceReference',
      'sourceStatus',
    ],
    'meshProvenance',
  );
  if (value.generationMode !== 'CALLER_SUPPLIED_ANALYSIS_MESH') {
    throw new TypeError('T4 requires generationMode=CALLER_SUPPLIED_ANALYSIS_MESH.');
  }
  if (!AUTHORIZED_SOURCE_STATUSES.includes(value.sourceStatus)) {
    throw new TypeError('meshProvenance.sourceStatus is not authorized.');
  }
  return {
    generationMode: value.generationMode,
    meshProfileId: text(value.meshProfileId, 'meshProvenance.meshProfileId'),
    qualityProfileId: text(value.qualityProfileId, 'meshProvenance.qualityProfileId'),
    producerIdentity: text(value.producerIdentity, 'meshProvenance.producerIdentity'),
    producerVersion: text(value.producerVersion, 'meshProvenance.producerVersion'),
    sourceReference: text(value.sourceReference, 'meshProvenance.sourceReference'),
    sourceStatus: value.sourceStatus,
  };
}

function featureSizingRecord(value, featureIds) {
  exactRecord(value, ['items'], 'featureSizing');
  if (!Array.isArray(value.items)) throw new TypeError('featureSizing.items must be an array.');
  const known = new Set(featureIds);
  const items = value.items.map((item, index) => {
    exactRecord(
      item,
      ['featureId', 'sourceRef', 'status', 'targetSize', 'unit'],
      `featureSizing.items[${index}]`,
    );
    if (!known.has(item.featureId)) {
      throw new TypeError(`UNKNOWN_FEATURE_SIZING_ID:${item.featureId}`);
    }
    if (typeof item.targetSize !== 'number' || !Number.isFinite(item.targetSize) || item.targetSize <= 0) {
      throw new TypeError(`featureSizing ${item.featureId} requires a positive finite targetSize.`);
    }
    if (!AUTHORIZED_SOURCE_STATUSES.includes(item.status)) {
      throw new TypeError(`featureSizing ${item.featureId} has unauthorized status.`);
    }
    if (!item.sourceRef || typeof item.sourceRef !== 'object' || Array.isArray(item.sourceRef)) {
      throw new TypeError(`featureSizing ${item.featureId} requires a sourceRef record.`);
    }
    return {
      featureId: item.featureId,
      targetSize: item.targetSize,
      unit: text(item.unit, `featureSizing.${item.featureId}.unit`),
      sourceRef: deepClone(item.sourceRef),
      status: item.status,
    };
  });
  const identities = items.map((item) => item.featureId);
  if (new Set(identities).size !== identities.length) {
    throw new TypeError('featureSizing feature IDs must be unique.');
  }
  return { items: items.sort((left, right) => codeSort(left.featureId, right.featureId)) };
}

function limitationRecord(value) {
  exactRecord(value, ['items'], 'limitations');
  return { items: sortedUniqueStrings(value.items, 'limitations.items') };
}

function assertEnvelopeAndProvenanceStatus(byId, meshProvenance) {
  const envelopeStatus = parameterSourceStatus(byId, ['meshProvenance']);
  if (envelopeStatus !== meshProvenance.sourceStatus) {
    throw new TypeError('meshProvenance source-status envelope does not match retained evidence.');
  }
}

function assertContinuumSourceAuthority(model, binding, featureSizing) {
  if (!binding.allowedFormulations.includes(model.formulation)) {
    throw new TypeError(
      `FORMULATION_NOT_AUTHORIZED_FOR_TEMPLATE:${model.formulation}`,
    );
  }
  if (![FORMULATIONS.PLANE_STRESS, FORMULATIONS.PLANE_STRAIN].includes(model.formulation)) {
    throw new TypeError(`UNREGISTERED_CONTINUUM_FORMULATION:${model.formulation}`);
  }
  if (model.elementTypePolicy.allowT3Fallback !== false) {
    throw new TypeError('T3_FALLBACK_NOT_AUTHORIZED_FOR_T4_TEMPLATE_COMPILERS');
  }
  const elementTypes = new Set(model.elements.map((element) => element.elementType));
  if (elementTypes.has('T3')) {
    throw new TypeError('T3_ELEMENT_NOT_AUTHORIZED_FOR_T4_TEMPLATE_COMPILERS');
  }
  if ([...elementTypes].some((elementType) => !['T6', 'Q8'].includes(elementType))) {
    throw new TypeError('T4 continuum source contains an unsupported element type.');
  }
  if (semanticHash(model.qualificationProfile) !== semanticHash(QUALIFICATION_PROFILE)) {
    throw new TypeError('LAFEA3_QUALIFICATION_PROFILE_MISMATCH');
  }
  featureSizing.items.forEach((item) => {
    if (item.unit !== model.units.canonical.length) {
      throw new TypeError(
        `FEATURE_SIZING_UNIT_MISMATCH:${item.featureId}:${item.unit}`,
      );
    }
  });
}

function geometryFeatures({
  applicationEvidence,
  canonicalModel,
  sourceStatus,
  applicationReference,
  sourceReference,
}) {
  const bounds = domainBounds(canonicalModel.nodes);
  const features = [
    {
      featureId: 'APPLICATION-DECLARATION',
      kind: 'APPLICATION_GEOMETRY_DECLARATION',
      geometry: {
        geometryClass: applicationEvidence.geometryClass,
        declarationBasis: applicationEvidence.declarationBasis,
        featureIds: applicationEvidence.featureIds,
        verificationStatus: 'DECLARED_NOT_INDEPENDENTLY_INFERRED',
      },
      sourceRefs: sourceRefRecords([
        applicationEvidence.sourceReference,
        applicationReference,
      ]),
      status: sourceStatus,
    },
    {
      featureId: 'ANALYSIS-DOMAIN',
      kind: 'CALLER_SUPPLIED_CONTINUUM_DOMAIN',
      geometry: {
        formulation: canonicalModel.formulation,
        nodeCount: canonicalModel.nodes.length,
        elementCount: canonicalModel.elements.length,
        elementTypes: sortedUniqueStrings(
          canonicalModel.elements.map((element) => element.elementType),
          'elementTypes',
        ),
        materialIds: canonicalModel.materials.map((material) => material.materialId),
        boundingBox: bounds,
        canonicalModelSemanticHash: canonicalModel.semanticHash,
        compilerGeneratedMesh: false,
      },
      sourceRefs: sourceRefRecords([sourceReference]),
      status: sourceStatus,
    },
  ];
  canonicalModel.materials.forEach((material) => {
    features.push({
      featureId: `MATERIAL-${material.materialId}`,
      kind: 'MATERIAL_REGION_REFERENCE',
      geometry: {
        materialId: material.materialId,
        elasticModulus: material.elasticModulus,
        poissonRatio: material.poissonRatio,
      },
      sourceRefs: sourceRefRecords([material.sourceReference]),
      status: sourceStatus,
    });
  });
  return features.sort((left, right) => codeSort(left.featureId, right.featureId));
}

function loadArtifacts(model, status) {
  return model.loadCases.map((loadCase) => {
    const primitives = [];
    loadCase.nodalForces.forEach((row) => primitives.push({
      loadId: row.loadId,
      kind: 'NODAL_FORCE',
      entityId: row.nodeId,
      basis: 'GLOBAL_XY',
      referencePoint: null,
      values: { fx: row.fx, fy: row.fy },
      units: [{ dimension: 'force', unit: row.canonicalUnit }],
      sourceRef: sourceRefRecord(row.sourceReference),
      status,
    }));
    loadCase.edgeTractions.forEach((row) => primitives.push({
      loadId: row.tractionId,
      kind: 'EDGE_TRACTION',
      entityId: row.elementId,
      basis: 'GLOBAL_XY',
      referencePoint: null,
      values: { edgeNodeIds: row.edgeNodeIds, tx: row.tx, ty: row.ty },
      units: [{ dimension: 'stress', unit: row.canonicalUnit }],
      sourceRef: sourceRefRecord(row.sourceReference),
      status,
    }));
    loadCase.pressureLoads.forEach((row) => primitives.push({
      loadId: row.pressureLoadId,
      kind: 'EDGE_NORMAL_PRESSURE',
      entityId: row.elementId,
      basis: 'ELEMENT_BOUNDARY_NORMAL',
      referencePoint: null,
      values: { edgeNodeIds: row.edgeNodeIds, pressure: row.pressure },
      units: [{ dimension: 'stress', unit: row.canonicalUnit }],
      sourceRef: sourceRefRecord(row.sourceReference),
      status,
    }));
    loadCase.bodyForces.forEach((row) => primitives.push({
      loadId: row.bodyForceId,
      kind: 'ELEMENT_BODY_FORCE',
      entityId: row.elementId,
      basis: 'GLOBAL_XY',
      referencePoint: null,
      values: { bx: row.bx, by: row.by },
      units: [{ dimension: 'bodyForceIntensity', unit: row.canonicalUnit }],
      sourceRef: sourceRefRecord(row.sourceReference),
      status,
    }));
    loadCase.temperatureLoads.forEach((row) => primitives.push({
      loadId: row.temperatureLoadId,
      kind: 'ELEMENT_THERMAL_STRAIN',
      entityId: row.elementId,
      basis: 'ISOTROPIC',
      referencePoint: null,
      values: { thermalStrain: row.thermalStrain },
      units: [{ dimension: 'strain', unit: row.canonicalUnit }],
      sourceRef: sourceRefRecord(row.sourceReference),
      status,
    }));
    loadCase.imposedDisplacements.forEach((row) => primitives.push({
      loadId: row.imposedDisplacementId,
      kind: 'IMPOSED_DISPLACEMENT',
      entityId: row.nodeId,
      basis: 'GLOBAL_XY',
      referencePoint: null,
      values: { dof: row.dof, value: row.value },
      units: [{ dimension: 'length', unit: row.canonicalUnit }],
      sourceRef: sourceRefRecord(row.sourceReference),
      status,
    }));
    return {
      caseId: loadCase.loadCaseId,
      primitives: primitives.sort((left, right) => codeSort(left.loadId, right.loadId)),
      sourceRefs: sourceRefRecords([
        loadCase.sourceReference,
        ...primitives.map((primitive) => primitive.sourceRef),
      ]),
      status,
    };
  });
}

function boundaryArtifacts(model, status) {
  return model.constraints.map((row) => ({
    boundaryId: row.constraintId,
    kind: 'PRESCRIBED_DISPLACEMENT',
    entityId: row.nodeId,
    basis: 'GLOBAL_XY',
    values: { dof: row.dof, value: row.value },
    units: [{ dimension: 'length', unit: row.canonicalUnit }],
    sourceRef: sourceRefRecord(row.sourceReference),
    status,
  }));
}

function domainBounds(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new TypeError('Continuum source requires at least one node.');
  }
  const x = nodes.map((node) => node.x);
  const y = nodes.map((node) => node.y);
  return {
    minimum: [Math.min(...x), Math.min(...y)],
    maximum: [Math.max(...x), Math.max(...y)],
  };
}

function singleParameterSourceReference(byId, parameterId) {
  const refs = parameterSourceRefs(byId, [parameterId]);
  if (refs.length !== 1) {
    throw new TypeError(`Parameter ${parameterId} must retain exactly one source reference.`);
  }
  return refs[0];
}

function sortRecordArray(raw, envelopeId, field, identityKey) {
  const value = raw?.[envelopeId]?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  if (!Array.isArray(value[field])) return;
  value[field] = identityKey === null
    ? [...value[field]].sort(codeSort)
    : [...value[field]].sort((left, right) => codeSort(left?.[identityKey], right?.[identityKey]));
}

function sortArray(record, field, identityKey) {
  if (!record || typeof record !== 'object' || !Array.isArray(record[field])) return;
  record[field] = [...record[field]].sort(
    (left, right) => codeSort(left?.[identityKey], right?.[identityKey]),
  );
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} must be non-empty text.`);
  }
  return value.trim();
}

function codeSort(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}
