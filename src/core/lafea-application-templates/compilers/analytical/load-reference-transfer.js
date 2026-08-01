import { semanticHash } from '../../../shared-piping-model/index.js';
import {
  MODEL_SCHEMA,
  REQUEST_TYPES,
  createCanonicalLocalAttachmentFoundationModel,
} from '../../../local-stress/index.js';
import { requireLafeaApplicationTemplate } from '../../template-registry.js';
import { requireT3AnalyticalParameterSchema } from '../../parameter-schemas/analytical.js';
import { requireT3AnalyticalCompilerBinding } from './bindings.js';
import {
  assertCompilerParents,
  createCompilationResult,
  createGeometryArtifact,
  createHandoffArtifact,
  createLoadArtifact,
  createNoBoundaryArtifact,
  deepClone,
  exactWrapper,
  parameterMap,
  parameterSourceRefs,
  parameterSourceStatus,
  pipeCoordinateArtifacts,
  prepareParameterSet,
  requiredRecord,
  sortedBy,
  sortedStrings,
  sourceRefRecord,
  sourceRefRecords,
} from './common.js';
import {
  T3_RESULT_UNIT_PROJECTION_POLICY_ID,
  projectT3ResultUnits,
} from './result-unit-projection.js';

const TEMPLATE_ID = 'ALG-LOAD-REFERENCE-TRANSFER';

export function compileLoadReferenceTransfer(rawParameters) {
  const template = requireLafeaApplicationTemplate(TEMPLATE_ID);
  const parameterSchema = requireT3AnalyticalParameterSchema(TEMPLATE_ID);
  const binding = requireT3AnalyticalCompilerBinding(TEMPLATE_ID);
  assertCompilerParents(template, binding, parameterSchema);

  const parameterSet = prepareParameterSet({
    parameterSchema,
    rawParameters,
    normalizeRawParameters,
  });
  const byId = parameterMap(parameterSet);
  const identity = identityRecord(requiredRecord(byId, 'identity'));
  const units = unitsRecord(requiredRecord(byId, 'units'));
  const pipeContext = pipeContextRecord(requiredRecord(byId, 'pipeContext'));
  const loadTransfer = loadTransferRecord(requiredRecord(byId, 'loadTransfer'));
  const qualificationProfile = requiredRecord(byId, 'qualificationProfile');
  const limitations = limitationValues(requiredRecord(byId, 'limitations'));

  const source = {
    schema: MODEL_SCHEMA,
    modelIdentity: identity.modelIdentity,
    modelVersion: identity.modelVersion,
    sourceAncestry: {
      sourceModelIdentity: identity.sourceModelIdentity,
      sourceVersion: identity.sourceVersion,
      adapterIdentity: identity.adapterIdentity,
      adapterVersion: identity.adapterVersion,
    },
    units,
    pipeGeometry: {
      outsideDiameter: pipeContext.outsideDiameter,
    },
    pipeCoordinateSystem: pipeContext.pipeCoordinateSystem,
    materials: pipeContext.materials,
    thicknessBasis: pipeContext.thicknessBasis,
    pressureDefinitions: [],
    loadReferencePoints: loadTransfer.loadReferencePoints,
    loadCases: loadTransfer.loadCases,
    resultRequests: {
      requestedAnalyses: [REQUEST_TYPES.LOAD_TRANSFER],
      transformedLoadCaseIdentities: loadTransfer.loadCases
        .map((row) => row.identity)
        .sort(codeSort),
      pressure: [],
    },
    qualificationProfile,
    limitations,
  };

  const canonicalModel = createCanonicalLocalAttachmentFoundationModel(source);
  const stageSource = {
    ...deepClone(canonicalModel.sourceEvidence),
    schema: MODEL_SCHEMA,
  };
  const resultUnitProjection = projectT3ResultUnits(canonicalModel.units);

  const status = parameterSourceStatus(byId, [
    'identity',
    'units',
    'pipeContext',
    'loadTransfer',
    'qualificationProfile',
  ]);
  const coordinate = pipeCoordinateArtifacts(stageSource.pipeCoordinateSystem);
  const geometry = createGeometryArtifact({
    template,
    binding,
    parameterSet,
    coordinateSystem: {
      ...coordinate,
      sourceRef: sourceRefRecord(requiredParameterRef(byId, 'pipeContext')),
    },
    units: resultUnitProjection.records,
    features: geometryFeatures(canonicalModel, status),
    localFrames: [{
      frameId: coordinate.identity,
      origin: coordinate.origin,
      axes: coordinate.axes,
      handedness: 'RIGHT_HANDED',
      sourceRef: sourceRefRecord(requiredParameterRef(byId, 'pipeContext')),
      status,
    }],
    ancestry: {
      canonicalModelSemanticHash: canonicalModel.semanticHash,
      sourceSemanticHash: canonicalModel.sourceAncestry.sourceSemanticHash,
      stageSourceSemanticHash: semanticHash(stageSource),
      resultUnitProjection: resultUnitProjection.ancestry,
    },
    status,
    diagnostics: resultUnitProjection.diagnostics,
  });

  const loads = createLoadArtifact({
    template,
    binding,
    parameterSet,
    geometry,
    loadCases: loadCases(
      canonicalModel,
      status,
      resultUnitProjection.resultUnits,
    ),
    diagnostics: resultUnitProjection.diagnostics,
  });
  const boundaries = createNoBoundaryArtifact({
    template,
    binding,
    parameterSet,
    geometry,
    diagnostic: 'ANALYTICAL_RESULTANT_TRANSFER_HAS_NO_STIFFNESS_BOUNDARY_CONDITIONS',
  });
  const handoff = createHandoffArtifact({
    template,
    parameterSet,
    geometry,
    loads,
    boundaries,
    stageSource,
    diagnostics: [
      'STAGE_SOURCE_VALIDATED_BY_LAFEA1_CANONICAL_MODEL_FACTORY',
      'SOURCE_UNIT_IDENTITY_RETAINED_IN_STAGE_SOURCE',
      'ENGINE_NOT_EXECUTED',
    ],
  });

  return createCompilationResult({
    template,
    binding,
    parameterSchema,
    parameterSet,
    geometry,
    loads,
    boundaries,
    handoff,
    diagnostics: [
      'LOAD_TRANSFER_ONLY',
      'NO_PRESSURE_REQUEST_GENERATED',
      'NO_STRESS_OR_UTILIZATION_CALCULATED',
      `RESULT_UNIT_PROJECTION_POLICY:${T3_RESULT_UNIT_PROJECTION_POLICY_ID}`,
    ],
  });
}

function normalizeRawParameters(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const normalized = deepClone(raw);
  sortEnvelopeArray(normalized, 'pipeContext', 'materials', 'identity');
  sortEnvelopeArray(normalized, 'loadTransfer', 'loadReferencePoints', 'identity');
  sortEnvelopeArray(normalized, 'loadTransfer', 'loadCases', 'identity');
  sortEnvelopeArray(normalized, 'limitations', 'values', null);
  return normalized;
}

function identityRecord(value) {
  exactWrapper(value, [
    'adapterIdentity',
    'adapterVersion',
    'modelIdentity',
    'modelVersion',
    'sourceModelIdentity',
    'sourceVersion',
  ], 'identity');
  Object.entries(value).forEach(([key, item]) => text(item, `identity.${key}`));
  return value;
}

function unitsRecord(value) {
  exactWrapper(value, ['force', 'length', 'moment', 'pressure', 'stress'], 'units');
  Object.entries(value).forEach(([key, item]) => text(item, `units.${key}`));
  return value;
}

function pipeContextRecord(value) {
  exactWrapper(value, [
    'materials',
    'outsideDiameter',
    'pipeCoordinateSystem',
    'thicknessBasis',
  ], 'pipeContext');
  if (!Array.isArray(value.materials)) throw new TypeError('pipeContext.materials must be an array.');
  return {
    ...value,
    materials: sortedBy(value.materials, 'identity'),
  };
}

function loadTransferRecord(value) {
  exactWrapper(value, ['loadCases', 'loadReferencePoints'], 'loadTransfer');
  if (!Array.isArray(value.loadReferencePoints) || value.loadReferencePoints.length < 2) {
    throw new TypeError('loadTransfer requires at least two reference points.');
  }
  if (!Array.isArray(value.loadCases) || value.loadCases.length === 0) {
    throw new TypeError('loadTransfer requires at least one load case.');
  }
  return {
    loadReferencePoints: sortedBy(value.loadReferencePoints, 'identity'),
    loadCases: sortedBy(value.loadCases, 'identity'),
  };
}

function limitationValues(value) {
  exactWrapper(value, ['values'], 'limitations');
  return sortedStrings(value.values, 'limitations.values');
}

function geometryFeatures(model, status) {
  const features = [{
    featureId: 'PIPE-SECTION-CONTEXT',
    kind: 'PIPE_SECTION_CONTEXT',
    geometry: {
      outsideDiameter: model.pipeGeometry.outsideDiameter.value,
      assessmentThickness: model.thicknessBasis.assessmentPipeThickness.value,
    },
    sourceRefs: sourceRefRecords([
      model.pipeGeometry.outsideDiameter.sourceRef,
      model.thicknessBasis.assessmentPipeThickness.sourceRef,
    ]),
    status,
  }];
  model.loadReferencePoints.forEach((point) => {
    features.push({
      featureId: `REFERENCE-POINT-${point.identity}`,
      kind: 'REFERENCE_POINT',
      geometry: {
        coordinateSystem: point.coordinateSystem,
        point: point.point.value,
      },
      sourceRefs: sourceRefRecords([point.point.sourceRef]),
      status,
    });
  });
  return features.sort((left, right) => codeSort(left.featureId, right.featureId));
}

function loadCases(model, status, resultUnits) {
  return model.loadCases.map((loadCase) => ({
    caseId: loadCase.identity,
    primitives: [
      {
        loadId: `${loadCase.identity}-FORCE`,
        kind: 'FORCE_RESULTANT',
        entityId: loadCase.targetReferencePointIdentity,
        basis: loadCase.sourceCoordinateSystem,
        referencePoint: referencePoint(model, loadCase.sourceReferencePointIdentity),
        values: {
          actionSense: loadCase.actionSense,
          vector: loadCase.force.value,
        },
        units: [{ dimension: 'force', unit: resultUnits.force }],
        sourceRef: sourceRefRecord(loadCase.force.sourceRef),
        status,
      },
      {
        loadId: `${loadCase.identity}-MOMENT`,
        kind: 'MOMENT_RESULTANT',
        entityId: loadCase.targetReferencePointIdentity,
        basis: loadCase.sourceCoordinateSystem,
        referencePoint: referencePoint(model, loadCase.sourceReferencePointIdentity),
        values: {
          actionSense: loadCase.actionSense,
          vector: loadCase.moment.value,
        },
        units: [{ dimension: 'moment', unit: resultUnits.moment }],
        sourceRef: sourceRefRecord(loadCase.moment.sourceRef),
        status,
      },
    ],
    sourceRefs: sourceRefRecords([
      loadCase.force.sourceRef,
      loadCase.moment.sourceRef,
    ]),
    status,
  }));
}

function referencePoint(model, identity) {
  const point = model.loadReferencePoints.find((row) => row.identity === identity);
  if (!point) throw new TypeError(`Missing reference point ${identity}.`);
  return point.point.value;
}

function requiredParameterRef(byId, parameterId) {
  const refs = parameterSourceRefs(byId, [parameterId]);
  if (refs.length !== 1) throw new TypeError(`Parameter ${parameterId} must retain one source reference.`);
  return refs[0];
}

function sortEnvelopeArray(raw, envelopeId, field, identityKey) {
  const value = raw?.[envelopeId]?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  if (!Array.isArray(value[field])) return;
  value[field] = identityKey === null
    ? [...value[field]].sort(codeSort)
    : [...value[field]].sort((left, right) => codeSort(left?.[identityKey], right?.[identityKey]));
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be non-empty text.`);
  return value.trim();
}

function codeSort(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}
