import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../linear-fea-material/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../linear-fea-section/index.js';
import {
  RIGID_ELEMENT_REQUEST_SCHEMA,
  compileCaesarRigidElementAuthority,
  sealRigidElementRequest,
} from '../linear-fea-rigid-element/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { resolveInputXmlThermalExpansionAuthority } from './inputxml-thermal-authority.js';
import {
  INPUTXML_INSTALLATION_TEMPERATURE,
  InputXmlLinearPreparationError,
} from './inputxml-linear-preparation-profile.js';

const GRAVITY = 9.80665;

export function compileInputXmlElementAuthorities(request) {
  const { sourceBundle, geometry, inventory, modelId, analysisProfileId } = request;
  const elementBySegment = new Map(sourceBundle.elementRecords.map((row) => [row.segmentId, row]));
  const inventoryBySegment = new Map(
    inventory.filter((row) => row.sourceKind === 'ELEMENT')
      .map((row) => [row.targetIds.segmentIds[0], row]),
  );
  const materialBySignature = new Map();
  const sectionBySignature = new Map();
  const materialResolutions = [];
  const sectionResolutions = [];
  const rigidAuthorities = [];
  const entries = [];

  for (const segment of geometry.segments) {
    const element = elementBySegment.get(segment.id);
    const inventoryItem = inventoryBySegment.get(segment.id);
    if (!element || !inventoryItem) preparationFailure(
      'INPUTXML_PREPARATION_ELEMENT_SOURCE_MISSING',
      `Segment ${segment.id} has no retained source element or inventory record.`,
      { segmentId: segment.id },
    );
    const disposition = inventoryItem.dispositionByProfile[analysisProfileId];
    if (!['IMPLEMENTED_EXACTLY', 'IMPLEMENTED_WITH_DECLARED_APPROXIMATION'].includes(disposition?.disposition)) {
      preparationFailure(
        'INPUTXML_PREPARATION_COMPONENT_NOT_REPRESENTABLE',
        `Segment ${segment.id} is not representable under ${analysisProfileId}.`,
        { segmentId: segment.id, disposition },
      );
    }
    const thermalAuthority = resolveInputXmlThermalExpansionAuthority(
      element.fields.materialNumber?.canonicalValue,
    );
    const material = materialFor({
      element, sourceBundle, modelId, thermalAuthority,
      materialBySignature, materialResolutions,
    });
    const physicalSection = sectionFor({
      element, sourceBundle, modelId, sectionBySignature, sectionResolutions,
    });
    const rigidRecord = sourceBundle.sourceRecords.rigids.find((row) => row.segmentId === segment.id) ?? null;
    const rigidAuthority = rigidRecord === null ? null : rigidFor({
      segment, element, rigidRecord, physicalSection, material,
      sourceBundle, modelId, thermalAuthority,
    });
    if (rigidAuthority) rigidAuthorities.push(rigidAuthority);
    const analysisSection = rigidAuthority === null
      ? physicalSection
      : sectionFromRigid({
        segment, rigidAuthority, sourceBundle, modelId,
        sectionBySignature, sectionResolutions,
      });
    entries.push(Object.freeze({
      elementId: `${modelId}.${segment.id}`,
      sourceSegment: segment,
      sourceElementIndex: element.sourceElementIndex,
      sourceRecordSemanticHash: semanticHash(element),
      componentKind: inventoryItem.classification.componentKind,
      implementation: disposition.disposition,
      limitationCode: disposition.limitationCode,
      materialResolution: material,
      physicalSection,
      analysisSection,
      rigidAuthority,
      thermalAuthority,
      referenceVector: Object.freeze([0, 0, 1]),
    }));
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    materialResolutions: Object.freeze(materialResolutions),
    sectionResolutions: Object.freeze(sectionResolutions),
    rigidAuthorities: Object.freeze(rigidAuthorities),
  });
}

function materialFor(request) {
  const { element, sourceBundle, modelId, thermalAuthority, materialBySignature, materialResolutions } = request;
  const fields = element.fields;
  const elasticModulus = fields.elasticModulus.canonicalValue;
  const poissonRatio = fields.poissonRatio.canonicalValue;
  const massDensity = fields.pipeDensity.canonicalValue;
  const thermalExpansionCoefficient = thermalAuthority.coefficientPerKelvin ?? 0;
  const signature = semanticHash({
    materialNumber: fields.materialNumber.canonicalValue,
    elasticModulus,
    poissonRatio,
    massDensity,
    thermalExpansionCoefficient,
  });
  if (materialBySignature.has(signature)) return materialBySignature.get(signature);
  const point = {
    absoluteTemperature: INPUTXML_INSTALLATION_TEMPERATURE,
    elasticModulus,
    shearModulus: elasticModulus / (2 * (1 + poissonRatio)),
    poissonRatio,
    massDensity,
    thermalExpansionCoefficient,
  };
  const materialId = `${modelId}-MATERIAL-${materialResolutions.length + 1}`;
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId,
    sourceEvidence: sourceEvidence({
      sourceId: `${materialId}-SOURCE`,
      sourceRevision: sourceBundle.semanticHash,
      sourceElementIndex: element.sourceElementIndex,
      fields: {
        materialNumber: fields.materialNumber,
        elasticModulus: fields.elasticModulus,
        poissonRatio: fields.poissonRatio,
        pipeDensity: fields.pipeDensity,
      },
      thermalAuthority,
    }),
    points: [point],
    semanticHash: '',
  });
  const resolution = resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: `${modelId}-MAT-${materialResolutions.length + 1}`,
      materialId,
      evaluationTemperature: INPUTXML_INSTALLATION_TEMPERATURE,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
  materialBySignature.set(signature, resolution);
  materialResolutions.push(resolution);
  return resolution;
}

function sectionFor(request) {
  const { element, sourceBundle, modelId, sectionBySignature, sectionResolutions } = request;
  return resolveSectionShared({
    outerDiameter: element.fields.diameter.canonicalValue,
    wallThickness: element.fields.wallThickness.canonicalValue,
    sourceId: `${modelId}-PHYSICAL-SECTION`,
    sourceRevision: sourceBundle.semanticHash,
    sourceRecord: element,
    modelId,
    sectionBySignature,
    sectionResolutions,
  });
}

function sectionFromRigid(request) {
  const { segment, rigidAuthority, sourceBundle, modelId, sectionBySignature, sectionResolutions } = request;
  return resolveSectionShared({
    outerDiameter: rigidAuthority.stiffnessSection.outsideDiameter,
    wallThickness: rigidAuthority.stiffnessSection.wallThickness,
    sourceId: `${modelId}-RIGID-STIFFNESS-SECTION`,
    sourceRevision: sourceBundle.semanticHash,
    sourceRecord: { segmentId: segment.id, rigidAuthorityHash: rigidAuthority.semanticHash },
    modelId,
    sectionBySignature,
    sectionResolutions,
  });
}

function resolveSectionShared(request) {
  const signature = `${request.outerDiameter}:${request.wallThickness}`;
  if (request.sectionBySignature.has(signature)) return request.sectionBySignature.get(signature);
  const sectionStateId = `${request.modelId}-SEC-${request.sectionResolutions.length + 1}`;
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: request.outerDiameter,
    wallThickness: request.wallThickness,
    sourceEvidence: sourceEvidence({
      sourceId: request.sourceId,
      sourceRevision: request.sourceRevision,
      sourceRecord: request.sourceRecord,
      outerDiameter: request.outerDiameter,
      wallThickness: request.wallThickness,
    }),
  };
  const section = resolvePipeSection({
    request: { ...payload, semanticHash: computePipeSectionRequestSemanticHash(payload) },
    profile: PIPE_SECTION_PROFILE,
  });
  request.sectionBySignature.set(signature, section);
  request.sectionResolutions.push(section);
  return section;
}

function rigidFor(request) {
  const { segment, element, rigidRecord, physicalSection, material, sourceBundle, modelId, thermalAuthority } = request;
  const fields = element.fields;
  const operatingTemperature = operatingTemperatureFor(sourceBundle, segment.id);
  const rigidRequest = sealRigidElementRequest({
    schema: RIGID_ELEMENT_REQUEST_SCHEMA,
    rigidElementId: `${modelId}-RIGID-${segment.id}`,
    length: segment.length,
    insideDiameter: physicalSection.dimensions.innerDiameter,
    enteredOutsideDiameter: physicalSection.dimensions.outerDiameter,
    pipeWallThickness: physicalSection.dimensions.wallThickness,
    enteredRigidWeight: rigidRecord.weight.canonicalValue ?? 0,
    fluidDensity: fields.fluidDensity.canonicalValue ?? 0,
    insulationThickness: fields.insulationThickness.canonicalValue ?? 0,
    insulationDensity: fields.insulationDensity.canonicalValue ?? 0,
    refractoryWeight: 0,
    claddingWeight: 0,
    gravityAcceleration: GRAVITY,
    installationTemperature: INPUTXML_INSTALLATION_TEMPERATURE,
    operatingTemperature,
    material: {
      elasticModulus: material.materialState.elasticModulus,
      shearModulus: material.materialState.shearModulus,
      thermalExpansionCoefficient: thermalAuthority.coefficientPerKelvin ?? 0,
    },
    sourceEvidence: sourceEvidence({
      sourceId: rigidRecord.sourceFeatureId,
      sourceRevision: sourceBundle.semanticHash,
      rigidRecord,
      sourceElementIndex: element.sourceElementIndex,
      physicalSectionHash: physicalSection.semanticHash,
    }),
    semanticHash: '',
  });
  return compileCaesarRigidElementAuthority(rigidRequest);
}

function operatingTemperatureFor(sourceBundle, segmentId) {
  return sourceBundle.sourceRecords.temperatureSets.find(
    (row) => row.segmentId === segmentId && row.sourceSetId === 'T1' && row.canonicalValue !== null,
  )?.canonicalValue ?? INPUTXML_INSTALLATION_TEMPERATURE;
}

function sourceEvidence(value) {
  return {
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
    sourceSemanticHash: semanticHash(value),
  };
}

function preparationFailure(code, message, data) {
  throw new InputXmlLinearPreparationError(message, code, data);
}
