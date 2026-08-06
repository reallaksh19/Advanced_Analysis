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
  INPUTXML_GRAVITY_ACCELERATION,
  INPUTXML_INSTALLATION_TEMPERATURE,
  InputXmlLinearSolvePreparationError,
} from './inputxml-linear-preparation-profile.js';

const ZERO_TOLERANCE = 1e-12;

export function prepareInputXmlElementAuthorities({
  sourceBundle,
  sourceBundleSemanticHash,
  geometry,
  inventory,
  modelId,
  analysisProfileId,
}) {
  const elementBySegment = new Map(
    sourceBundle.elementRecords
      .filter((row) => row.canonicalSegmentId !== null)
      .map((row) => [String(row.canonicalSegmentId), row]),
  );
  const inventoryBySegment = new Map(
    inventory
      .filter((row) => row.sourceKind === 'ELEMENT_COMPONENT')
      .flatMap((row) => row.targetIds.segmentIds.map((segmentId) => [String(segmentId), row])),
  );
  const materialBySignature = new Map();
  const sectionBySignature = new Map();
  const materialResolutions = [];
  const sectionResolutions = [];
  const rigidAuthorities = [];
  const segmentBindings = [];
  const loadBindings = [];

  for (const segment of geometry.segments) {
    const segmentId = String(segment.id);
    const element = elementBySegment.get(segmentId) ?? null;
    const inventoryItem = inventoryBySegment.get(segmentId) ?? null;
    if (element === null || inventoryItem === null) {
      fail(
        'INPUTXML_PREPARATION_ELEMENT_SOURCE_MISSING',
        `Segment ${segmentId} lacks retained source or representability custody.`,
        { segmentId },
      );
    }
    const disposition = inventoryItem.dispositionByProfile[analysisProfileId] ?? null;
    if (!['IMPLEMENTED_EXACTLY', 'IMPLEMENTED_WITH_DECLARED_APPROXIMATION']
      .includes(disposition?.disposition)) {
      fail(
        'INPUTXML_PREPARATION_COMPONENT_NOT_REPRESENTABLE',
        `Segment ${segmentId} is not representable under ${analysisProfileId}.`,
        { segmentId, disposition },
      );
    }
    const analysis = segment.meta?.analysis ?? {};
    const thermalAuthority = resolveInputXmlThermalExpansionAuthority(segment.meta?.materialNumber);
    const evaluationTemperature = finite(analysis.operatingTemperature)
      ?? INPUTXML_INSTALLATION_TEMPERATURE.value;
    const materialResolution = materialFor({
      segment,
      element,
      analysis,
      evaluationTemperature,
      thermalAuthority,
      sourceBundleSemanticHash,
      modelId,
      materialBySignature,
      materialResolutions,
    });
    const physicalSection = sectionFor({
      segment,
      element,
      sourceBundleSemanticHash,
      modelId,
      sectionBySignature,
      sectionResolutions,
    });
    const rigidFeature = (element.childFeatures ?? [])
      .find((row) => String(row.kind).toUpperCase() === 'RIGID') ?? null;
    const rigidAuthority = rigidFeature === null ? null : rigidFor({
      segment,
      element,
      rigidFeature,
      analysis,
      physicalSection,
      materialResolution,
      thermalAuthority,
      sourceBundleSemanticHash,
      modelId,
    });
    if (rigidAuthority !== null) rigidAuthorities.push(rigidAuthority);
    const analysisSection = rigidAuthority === null
      ? physicalSection
      : rigidSectionFor({
        segment,
        rigidAuthority,
        sourceBundleSemanticHash,
        modelId,
        sectionBySignature,
        sectionResolutions,
      });

    const segmentBinding = Object.freeze({
      bindingId: `${modelId}:SEGMENT:${segmentId}`,
      segmentId,
      sourceFeatureId: element.sourceFeatureId,
      sourceIndex: element.sourceIndex,
      componentKind: inventoryItem.classification.componentKind,
      representabilityDisposition: disposition.disposition,
      limitationCode: disposition.limitationCode,
      materialResolutionSemanticHash: materialResolution.semanticHash,
      materialResolutionEvidenceHash: materialResolution.evidenceHash,
      physicalSectionSemanticHash: physicalSection.semanticHash,
      analysisSectionSemanticHash: analysisSection.semanticHash,
      rigidAuthoritySemanticHash: rigidAuthority?.semanticHash ?? null,
      thermalAuthoritySemanticHash: thermalAuthority.semanticHash,
      thermalAuthorityStatus: thermalAuthority.status,
    });
    segmentBindings.push(segmentBinding);
    loadBindings.push(loadBindingFor({
      segment,
      element,
      analysis,
      materialResolution,
      physicalSection,
      rigidAuthority,
      thermalAuthority,
      modelId,
      sourceBundleSemanticHash,
    }));
  }

  return Object.freeze({
    materialResolutions: Object.freeze(materialResolutions),
    sectionResolutions: Object.freeze(sectionResolutions),
    rigidAuthorities: Object.freeze(rigidAuthorities),
    segmentBindings: Object.freeze(segmentBindings),
    loadBindings: Object.freeze(loadBindings),
  });
}

function materialFor({
  segment,
  element,
  analysis,
  evaluationTemperature,
  thermalAuthority,
  sourceBundleSemanticHash,
  modelId,
  materialBySignature,
  materialResolutions,
}) {
  const elasticModulus = positive(analysis.elasticModulus, segment.id, 'elasticModulus');
  const poissonRatio = finite(analysis.poissonRatio);
  const massDensity = positive(analysis.pipeDensity, segment.id, 'pipeDensity');
  if (!(poissonRatio > 0 && poissonRatio < 0.5)) {
    fail(
      'INPUTXML_PREPARATION_POISSON_RATIO_INVALID',
      `Segment ${segment.id} Poisson ratio must be in (0, 0.5).`,
      { segmentId: segment.id, poissonRatio },
    );
  }
  const thermalExpansionCoefficient = thermalAuthority.coefficientPerKelvin ?? 0;
  const signature = semanticHash({
    materialNumber: segment.meta?.materialNumber ?? null,
    materialName: segment.material ?? null,
    elasticModulus,
    poissonRatio,
    massDensity,
    evaluationTemperature,
    thermalExpansionCoefficient,
    thermalUsageAuthorized: thermalAuthority.status === 'RESOLVED',
  });
  if (materialBySignature.has(signature)) return materialBySignature.get(signature);
  const materialOrdinal = materialResolutions.length + 1;
  const materialId = `${modelId}-MATERIAL-${materialOrdinal}`;
  const point = {
    absoluteTemperature: evaluationTemperature,
    elasticModulus,
    shearModulus: elasticModulus / (2 * (1 + poissonRatio)),
    poissonRatio,
    massDensity,
    thermalExpansionCoefficient,
  };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId,
    sourceEvidence: sourceEvidence({
      sourceId: `${materialId}-SOURCE`,
      sourceRevision: sourceBundleSemanticHash,
      sourceFeatureId: element.sourceFeatureId,
      sourceIndex: element.sourceIndex,
      materialNumber: segment.meta?.materialNumber ?? null,
      materialName: segment.material ?? null,
      fieldEvidence: {
        MODULUS: element.fieldEvidence.MODULUS,
        POISSONS: element.fieldEvidence.POISSONS,
        PIPE_DENSITY: element.fieldEvidence.PIPE_DENSITY,
      },
      thermalAuthority,
    }),
    points: [point],
    semanticHash: '',
  });
  const resolution = resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: `${modelId}-MAT-${materialOrdinal}`,
      materialId,
      evaluationTemperature,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
  materialBySignature.set(signature, resolution);
  materialResolutions.push(resolution);
  return resolution;
}

function sectionFor({
  segment,
  element,
  sourceBundleSemanticHash,
  modelId,
  sectionBySignature,
  sectionResolutions,
}) {
  return resolveSectionShared({
    outerDiameter: positive(segment.diameter, segment.id, 'diameter'),
    wallThickness: positive(segment.thickness, segment.id, 'thickness'),
    sourceId: `${modelId}-PHYSICAL-SECTION`,
    sourceRevision: sourceBundleSemanticHash,
    sourceRecord: {
      sourceFeatureId: element.sourceFeatureId,
      sourceIndex: element.sourceIndex,
      diameter: element.fieldEvidence.DIAMETER,
      wallThickness: element.fieldEvidence.WALL_THICK,
    },
    modelId,
    sectionBySignature,
    sectionResolutions,
  });
}

function rigidSectionFor({
  segment,
  rigidAuthority,
  sourceBundleSemanticHash,
  modelId,
  sectionBySignature,
  sectionResolutions,
}) {
  return resolveSectionShared({
    outerDiameter: rigidAuthority.stiffnessSection.outsideDiameter,
    wallThickness: rigidAuthority.stiffnessSection.wallThickness,
    sourceId: `${modelId}-RIGID-STIFFNESS-SECTION`,
    sourceRevision: sourceBundleSemanticHash,
    sourceRecord: {
      segmentId: segment.id,
      rigidAuthoritySemanticHash: rigidAuthority.semanticHash,
    },
    modelId,
    sectionBySignature,
    sectionResolutions,
  });
}

function resolveSectionShared({
  outerDiameter,
  wallThickness,
  sourceId,
  sourceRevision,
  sourceRecord,
  modelId,
  sectionBySignature,
  sectionResolutions,
}) {
  const signature = semanticHash({ outerDiameter, wallThickness });
  if (sectionBySignature.has(signature)) return sectionBySignature.get(signature);
  const sectionStateId = `${modelId}-SEC-${sectionResolutions.length + 1}`;
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter,
    wallThickness,
    sourceEvidence: sourceEvidence({
      sourceId,
      sourceRevision,
      sourceRecord,
      outerDiameter,
      wallThickness,
    }),
  };
  const section = resolvePipeSection({
    request: {
      ...payload,
      semanticHash: computePipeSectionRequestSemanticHash(payload),
    },
    profile: PIPE_SECTION_PROFILE,
  });
  sectionBySignature.set(signature, section);
  sectionResolutions.push(section);
  return section;
}

function rigidFor({
  segment,
  element,
  rigidFeature,
  analysis,
  physicalSection,
  materialResolution,
  thermalAuthority,
  sourceBundleSemanticHash,
  modelId,
}) {
  const operatingTemperature = finite(analysis.operatingTemperature)
    ?? INPUTXML_INSTALLATION_TEMPERATURE.value;
  const enteredRigidWeight = finite(analysis.rigid?.weight) ?? 0;
  const request = sealRigidElementRequest({
    schema: RIGID_ELEMENT_REQUEST_SCHEMA,
    rigidElementId: `${modelId}-RIGID-${segment.id}`,
    length: positive(segment.length, segment.id, 'length'),
    insideDiameter: physicalSection.dimensions.innerDiameter,
    enteredOutsideDiameter: physicalSection.dimensions.outerDiameter,
    pipeWallThickness: physicalSection.dimensions.wallThickness,
    enteredRigidWeight,
    fluidDensity: finite(analysis.fluidDensity) ?? 0,
    insulationThickness: finite(analysis.insulationThickness) ?? 0,
    insulationDensity: finite(analysis.insulationDensity) ?? 0,
    refractoryWeight: 0,
    claddingWeight: 0,
    gravityAcceleration: INPUTXML_GRAVITY_ACCELERATION.value,
    installationTemperature: INPUTXML_INSTALLATION_TEMPERATURE.value,
    operatingTemperature,
    material: {
      elasticModulus: materialResolution.materialState.elasticModulus,
      shearModulus: materialResolution.materialState.shearModulus,
      thermalExpansionCoefficient: thermalAuthority.coefficientPerKelvin ?? 0,
    },
    sourceEvidence: sourceEvidence({
      sourceId: rigidFeature.sourceFeatureId,
      sourceRevision: sourceBundleSemanticHash,
      sourceFeature: rigidFeature,
      sourceElementIndex: element.sourceIndex,
      physicalSectionSemanticHash: physicalSection.semanticHash,
      thermalAuthority,
    }),
    semanticHash: '',
  });
  return compileCaesarRigidElementAuthority(request);
}

function loadBindingFor({
  segment,
  element,
  analysis,
  materialResolution,
  physicalSection,
  rigidAuthority,
  thermalAuthority,
  modelId,
  sourceBundleSemanticHash,
}) {
  const gravity = gravityAuthority({
    segment,
    element,
    analysis,
    materialResolution,
    physicalSection,
    rigidAuthority,
    modelId,
    sourceBundleSemanticHash,
  });
  const pressure = pressureAuthority(segment, element, analysis, modelId, sourceBundleSemanticHash);
  const thermal = thermalLoadAuthority(
    segment,
    element,
    analysis,
    thermalAuthority,
    modelId,
    sourceBundleSemanticHash,
  );
  return Object.freeze({
    loadBindingId: `${modelId}:LOAD:${segment.id}`,
    segmentId: String(segment.id),
    sourceFeatureId: element.sourceFeatureId,
    gravity,
    pressure,
    thermal,
  });
}

function gravityAuthority({
  segment,
  element,
  analysis,
  materialResolution,
  physicalSection,
  rigidAuthority,
  modelId,
  sourceBundleSemanticHash,
}) {
  if (rigidAuthority !== null) {
    const payload = {
      kind: 'DISTRIBUTED_GRAVITY_LINE_LOAD',
      basis: 'GLOBAL',
      direction: [0, -1, 0],
      lineForcePerLength: rigidAuthority.gravity.totalLineWeight,
      componentWeightsPerLength: null,
      sourceAuthority: 'RIGID_ELEMENT_AUTHORITY',
      rigidAuthoritySemanticHash: rigidAuthority.semanticHash,
    };
    return Object.freeze({
      ...payload,
      semanticHash: semanticHash(payload),
      sourceEvidence: sourceEvidence({
        sourceId: `${modelId}-GRAVITY-${segment.id}`,
        sourceRevision: sourceBundleSemanticHash,
        sourceFeatureId: element.sourceFeatureId,
        rigidAuthoritySemanticHash: rigidAuthority.semanticHash,
      }),
    });
  }
  const area = physicalSection.sectionState.area;
  const innerDiameter = physicalSection.dimensions.innerDiameter;
  const pipeMassPerLength = materialResolution.materialState.massDensity * area;
  const fluidDensity = finite(analysis.fluidDensity) ?? 0;
  const contentsArea = Math.PI * innerDiameter ** 2 / 4;
  const contentsMassPerLength = fluidDensity * contentsArea;
  const insulationThickness = finite(analysis.insulationThickness) ?? 0;
  const insulationDensity = finite(analysis.insulationDensity) ?? 0;
  const outsideDiameter = physicalSection.dimensions.outerDiameter;
  const insulatedDiameter = outsideDiameter + 2 * insulationThickness;
  const insulationArea = Math.PI * (insulatedDiameter ** 2 - outsideDiameter ** 2) / 4;
  const insulationMassPerLength = insulationDensity * insulationArea;
  const componentWeightsPerLength = {
    pipe: pipeMassPerLength * INPUTXML_GRAVITY_ACCELERATION.value,
    contents: contentsMassPerLength * INPUTXML_GRAVITY_ACCELERATION.value,
    insulation: insulationMassPerLength * INPUTXML_GRAVITY_ACCELERATION.value,
  };
  const lineForcePerLength = Object.values(componentWeightsPerLength)
    .reduce((sum, value) => sum + value, 0);
  const payload = {
    kind: 'DISTRIBUTED_GRAVITY_LINE_LOAD',
    basis: 'GLOBAL',
    direction: [0, -1, 0],
    lineForcePerLength,
    componentWeightsPerLength,
    sourceAuthority: 'PREPARED_PHYSICAL_LINE_WEIGHT',
    rigidAuthoritySemanticHash: null,
  };
  return Object.freeze({
    ...payload,
    semanticHash: semanticHash(payload),
    sourceEvidence: sourceEvidence({
      sourceId: `${modelId}-GRAVITY-${segment.id}`,
      sourceRevision: sourceBundleSemanticHash,
      sourceFeatureId: element.sourceFeatureId,
      materialResolutionSemanticHash: materialResolution.semanticHash,
      physicalSectionSemanticHash: physicalSection.semanticHash,
      fieldEvidence: {
        FLUID_DENSITY: element.fieldEvidence.FLUID_DENSITY,
        INSUL_THICK: element.fieldEvidence.INSUL_THICK,
        INSUL_DENSITY: element.fieldEvidence.INSUL_DENSITY,
      },
    }),
  });
}

function pressureAuthority(segment, element, analysis, modelId, sourceBundleSemanticHash) {
  const pressure = finite(analysis.pressure);
  const active = pressure !== null && Math.abs(pressure) > ZERO_TOLERANCE;
  const payload = {
    kind: 'PRESSURE_INPUT_CUSTODY',
    active,
    pressure: active ? pressure : null,
    pressureBasis: active ? 'GAUGE' : null,
    authorizedEffects: active
      ? { codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false }
      : null,
  };
  return Object.freeze({
    ...payload,
    semanticHash: semanticHash(payload),
    sourceEvidence: sourceEvidence({
      sourceId: `${modelId}-PRESSURE-${segment.id}`,
      sourceRevision: sourceBundleSemanticHash,
      sourceFeatureId: element.sourceFeatureId,
      fieldEvidence: element.fieldEvidence.PRESSURE1,
    }),
  });
}

function thermalLoadAuthority(
  segment,
  element,
  analysis,
  thermalAuthority,
  modelId,
  sourceBundleSemanticHash,
) {
  const operatingTemperature = finite(analysis.operatingTemperature);
  const active = operatingTemperature !== null;
  const resolved = active && thermalAuthority.status === 'RESOLVED';
  const deltaTemperature = active
    ? operatingTemperature - INPUTXML_INSTALLATION_TEMPERATURE.value
    : null;
  const thermalStrain = resolved
    ? thermalAuthority.coefficientPerKelvin * deltaTemperature
    : null;
  const payload = {
    kind: 'UNIFORM_TEMPERATURE_INPUT_CUSTODY',
    active,
    status: !active ? 'NOT_ACTIVE' : resolved ? 'RESOLVED' : 'UNRESOLVED',
    installationTemperature: INPUTXML_INSTALLATION_TEMPERATURE.value,
    operatingTemperature,
    deltaTemperature,
    coefficientPerKelvin: resolved ? thermalAuthority.coefficientPerKelvin : null,
    thermalStrain,
    thermalAuthoritySemanticHash: thermalAuthority.semanticHash,
  };
  return Object.freeze({
    ...payload,
    semanticHash: semanticHash(payload),
    sourceEvidence: sourceEvidence({
      sourceId: `${modelId}-THERMAL-${segment.id}`,
      sourceRevision: sourceBundleSemanticHash,
      sourceFeatureId: element.sourceFeatureId,
      fieldEvidence: element.fieldEvidence.TEMP_EXP_C1,
      materialNumber: segment.meta?.materialNumber ?? null,
      thermalAuthority,
    }),
  });
}

function sourceEvidence(value) {
  return Object.freeze({
    sourceId: String(value.sourceId),
    sourceRevision: String(value.sourceRevision),
    sourceSemanticHash: semanticHash(value),
  });
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positive(value, segmentId, field) {
  const number = finite(value);
  if (!(number > 0)) {
    fail(
      'INPUTXML_PREPARATION_REQUIRED_FIELD_INVALID',
      `Segment ${segmentId} requires positive ${field}.`,
      { segmentId, field, value },
    );
  }
  return number;
}

function fail(code, message, data) {
  throw new InputXmlLinearSolvePreparationError(message, code, data);
}
