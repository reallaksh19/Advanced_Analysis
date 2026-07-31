import { semanticHash } from '../../../shared-piping-model/index.js';
import {
  REQUEST_SCHEMA,
  SECTION_BASIS,
  createLocalAttachmentScreeningRequest,
} from '../../../local-attachment-screening/index.js';
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
  requiredText,
  sortedStrings,
  sourceRefRecord,
  sourceRefRecords,
  unitRecords,
} from './common.js';

const TEMPLATE_ID = 'ALG-PIPE-SECTION-COMBINED';

export function compilePipeSectionCombined(rawParameters) {
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
  const screeningCases = wrappedValues(
    requiredRecord(byId, 'screeningCases'),
    'screeningCases',
  );
  const evaluationLocations = wrappedValues(
    requiredRecord(byId, 'evaluationLocations'),
    'evaluationLocations',
  );
  const envelopeQuantities = sortedStrings(
    wrappedValues(requiredRecord(byId, 'envelopeQuantities'), 'envelopeQuantities'),
    'envelopeQuantities.values',
  );
  const limitations = sortedStrings(
    wrappedValues(requiredRecord(byId, 'limitations'), 'limitations'),
    'limitations.values',
  );

  const rawRequest = {
    schema: REQUEST_SCHEMA,
    requestIdentity: requiredText(byId, 'requestIdentity'),
    requestVersion: requiredText(byId, 'requestVersion'),
    sourceEvidence: requiredRecord(byId, 'sourceEvidence'),
    sectionBasis: { basis: SECTION_BASIS },
    screeningCases,
    evaluationLocations,
    resultRequests: { envelopeQuantities },
    qualificationProfile: requiredRecord(byId, 'qualificationProfile'),
    limitations,
  };
  const stageSource = createLocalAttachmentScreeningRequest(rawRequest);
  const foundationModel = stageSource.sourceEvidence.foundationModel;
  const status = parameterSourceStatus(byId, [
    'requestIdentity',
    'requestVersion',
    'sourceEvidence',
    'screeningCases',
    'evaluationLocations',
    'envelopeQuantities',
    'qualificationProfile',
  ]);
  const coordinate = pipeCoordinateArtifacts(foundationModel.pipeCoordinateSystem);

  const geometry = createGeometryArtifact({
    template,
    binding,
    parameterSet,
    coordinateSystem: {
      ...coordinate,
      sourceRef: sourceRefRecord(requiredParameterRef(byId, 'sourceEvidence')),
    },
    units: unitRecords(foundationModel.units),
    features: geometryFeatures(stageSource, status),
    localFrames: [{
      frameId: coordinate.identity,
      origin: coordinate.origin,
      axes: coordinate.axes,
      handedness: 'RIGHT_HANDED',
      sourceRef: sourceRefRecord(requiredParameterRef(byId, 'sourceEvidence')),
      status,
    }],
    ancestry: {
      foundationModelSemanticHash: foundationModel.semanticHash,
      foundationResultSemanticHash:
        stageSource.sourceEvidence.foundationResult.semanticHash,
      screeningRequestSemanticHash: stageSource.semanticHash,
      stageSourceSemanticHash: semanticHash(stageSource),
    },
    status,
  });

  const loads = createLoadArtifact({
    template,
    binding,
    parameterSet,
    geometry,
    loadCases: screeningLoadCases(stageSource, status),
    diagnostics: [
      'LOAD_COMBINATIONS_REFERENCE_RETAINED_LAFEA1_RESULTANTS_AND_PRESSURE_EVIDENCE',
    ],
  });
  const boundaries = createNoBoundaryArtifact({
    template,
    binding,
    parameterSet,
    geometry,
    diagnostic: 'NOMINAL_PIPE_SECTION_SCREENING_HAS_NO_STIFFNESS_BOUNDARY_CONDITIONS',
  });
  const handoff = createHandoffArtifact({
    template,
    parameterSet,
    geometry,
    loads,
    boundaries,
    stageSource,
    diagnostics: [
      'STAGE_SOURCE_VALIDATED_BY_LAFEA2_REQUEST_FACTORY',
      'FOUNDATION_SOURCE_AND_RESULT_EVIDENCE_RECONSTRUCTED',
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
      'NOMINAL_PIPE_SECTION_SCREENING_INPUT_ONLY',
      'NO_LOCAL_DISCONTINUITY_STRESS_CALCULATED',
      'NO_ALLOWABLE_OR_CODE_RESULT_CALCULATED',
    ],
  });
}

function normalizeRawParameters(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const normalized = deepClone(raw);
  const cases = normalized?.screeningCases?.value?.values;
  if (Array.isArray(cases)) {
    cases.forEach((screeningCase) => {
      if (Array.isArray(screeningCase?.mechanicalTerms)) {
        screeningCase.mechanicalTerms = [...screeningCase.mechanicalTerms]
          .sort((left, right) => codeSort(left?.loadCaseId, right?.loadCaseId));
      }
    });
    normalized.screeningCases.value.values = [...cases]
      .sort((left, right) => codeSort(left?.screeningCaseId, right?.screeningCaseId));
  }
  sortWrappedValues(normalized, 'evaluationLocations', 'evaluationLocationId');
  sortWrappedValues(normalized, 'envelopeQuantities', null);
  sortWrappedValues(normalized, 'limitations', null);
  return normalized;
}

function wrappedValues(record, label) {
  exactWrapper(record, ['values'], label);
  if (!Array.isArray(record.values)) throw new TypeError(`${label}.values must be an array.`);
  return deepClone(record.values);
}

function geometryFeatures(request, status) {
  const model = request.sourceEvidence.foundationModel;
  const features = [{
    featureId: 'PIPE-SECTION-CONTEXT',
    kind: 'PIPE_SECTION_CONTEXT',
    geometry: {
      outsideDiameter: model.pipeGeometry.outsideDiameter.value,
      assessmentThickness: model.thicknessBasis.assessmentPipeThickness.value,
      sectionBasis: request.sectionBasis.basis,
    },
    sourceRefs: sourceRefRecords([
      model.pipeGeometry.outsideDiameter.sourceRef,
      model.thicknessBasis.assessmentPipeThickness.sourceRef,
    ]),
    status,
  }];
  request.evaluationLocations.forEach((location) => {
    features.push({
      featureId: `EVALUATION-${location.evaluationLocationId}`,
      kind: 'PIPE_WALL_EVALUATION_LOCATION',
      geometry: {
        angle: location.angle,
        radius: location.radius,
        radiusBasis: location.radiusBasis,
      },
      sourceRefs: sourceRefRecords([location.sourceReference]),
      status,
    });
  });
  return features.sort((left, right) => codeSort(left.featureId, right.featureId));
}

function screeningLoadCases(request, status) {
  return request.screeningCases.map((screeningCase) => ({
    caseId: screeningCase.screeningCaseId,
    primitives: [
      ...screeningCase.mechanicalTerms.map((term) => ({
        loadId: `${screeningCase.screeningCaseId}-MECHANICAL-${term.loadCaseId}`,
        kind: 'RETAINED_MECHANICAL_RESULTANT_FACTOR',
        entityId: term.loadCaseId,
        basis: 'RETAINED_LAFEA1_PIPE_LOCAL_RESULTANT',
        referencePoint: null,
        values: { factor: term.factor },
        units: [],
        sourceRef: sourceRefRecord(screeningCase.sourceReference),
        status,
      })),
      {
        loadId: `${screeningCase.screeningCaseId}-PRESSURE-${screeningCase.pressureDefinitionId}`,
        kind: 'RETAINED_PRESSURE_DEFINITION_FACTOR',
        entityId: screeningCase.pressureDefinitionId,
        basis: 'RETAINED_LAFEA1_PRESSURE_EVIDENCE',
        referencePoint: null,
        values: { factor: screeningCase.pressureFactor },
        units: [],
        sourceRef: sourceRefRecord(screeningCase.sourceReference),
        status,
      },
    ],
    sourceRefs: sourceRefRecords([screeningCase.sourceReference]),
    status,
  }));
}

function requiredParameterRef(byId, parameterId) {
  const refs = parameterSourceRefs(byId, [parameterId]);
  if (refs.length !== 1) throw new TypeError(`Parameter ${parameterId} must retain one source reference.`);
  return refs[0];
}

function sortWrappedValues(raw, envelopeId, identityKey) {
  const values = raw?.[envelopeId]?.value?.values;
  if (!Array.isArray(values)) return;
  raw[envelopeId].value.values = identityKey === null
    ? [...values].sort(codeSort)
    : [...values].sort((left, right) => codeSort(left?.[identityKey], right?.[identityKey]));
}

function codeSort(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}
