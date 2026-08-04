import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../src/core/linear-fea-material/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import { sealComponentFactorSet } from '../src/core/linear-fea-piping-components/index.js';
import {
  sealCodeProfile,
  sealEditionDataset,
  sealStressFactorSet,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  APPENDIX_S3_SOURCE,
  BRANCH_OUTER_DIAMETER,
  COLD_ALLOWABLE,
  CYCLE_REDUCTION_FACTOR,
  ELASTIC_MODULUS,
  HEADER_OUTER_DIAMETER,
  HOT_ALLOWABLE,
  INSTALLATION_TEMPERATURE,
  MASS_DENSITY,
  METER_DERIVATION,
  NOMINAL_WALL_THICKNESS,
  OPERATING_TEMPERATURE,
  POISSON_RATIO,
  SHEAR_MODULUS,
  TEE_DERIVATION,
  THERMAL_EXPANSION_COEFFICIENT,
} from './lfea-b3.14-appendix-s-example3-data.mjs';

export function sourceEvidence(source) {
  return {
    sourceId: source.sourceId,
    sourceRevision: source.sourceRevision,
    sourceSemanticHash: semanticHash(source),
  };
}

function sectionAuthority(sectionStateId, outerDiameter, wallThickness, sourceRevision) {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId,
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter,
    wallThickness,
    sourceEvidence: sourceEvidence({
      sourceId: `${APPENDIX_S3_SOURCE}-TABLE-S303.3`,
      sourceRevision,
      outerDiameter,
      wallThickness,
    }),
  };
  return resolvePipeSection({
    request: {
      ...payload,
      semanticHash: computePipeSectionRequestSemanticHash(payload),
    },
    profile: PIPE_SECTION_PROFILE,
  });
}

export function materialAuthority() {
  const points = [{
    absoluteTemperature: OPERATING_TEMPERATURE,
    elasticModulus: ELASTIC_MODULUS,
    shearModulus: SHEAR_MODULUS,
    poissonRatio: POISSON_RATIO,
    massDensity: MASS_DENSITY,
    thermalExpansionCoefficient: THERMAL_EXPANSION_COEFFICIENT,
  }];
  const source = {
    sourceId: `${APPENDIX_S3_SOURCE}-ASTM-A53-GRADE-B`,
    sourceRevision: 'S303.1-APPENDIX-C-TABLE-C1',
    points,
  };
  const table = sealMaterialTable({
    schema: 'fea-linear-material-table/v1',
    materialId: 'CS-A53B-APPENDIX-S3',
    sourceEvidence: sourceEvidence(source),
    points,
    semanticHash: '',
  });
  return resolveLinearFeaMaterialState({
    table,
    request: {
      materialStateId: 'MAT-A53B-APPENDIX-S3-394K',
      materialId: table.materialId,
      evaluationTemperature: OPERATING_TEMPERATURE,
    },
    profile: LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  });
}

export function sectionAuthorities() {
  return Object.freeze({
    header: sectionAuthority(
      'SEC-APP-S3-NPS24-STD',
      HEADER_OUTER_DIAMETER,
      NOMINAL_WALL_THICKNESS,
      'NPS24-STD-OD609.6-T9.53',
    ),
    branch: sectionAuthority(
      'SEC-APP-S3-NPS20-STD',
      BRANCH_OUTER_DIAMETER,
      NOMINAL_WALL_THICKNESS,
      'NPS20-STD-OD508.0-T9.53',
    ),
    meter: sectionAuthority(
      'SEC-APP-S3-NPS20-METER-EQUIVALENT',
      BRANCH_OUTER_DIAMETER,
      METER_DERIVATION.equivalentWallThickness,
      'METER-2000LB-5FT-EQUIVALENT-ANNULUS',
    ),
  });
}

export function teeFlexibilityFactorSet(componentId) {
  return sealComponentFactorSet({
    schema: 'fea-linear-component-factor-set/v1',
    factorSetId: `${componentId}.FS`,
    componentType: 'BRANCH_JUNCTION',
    sourceIdentity: {
      standard: 'ASME_B31_3_2006',
      edition: '2006',
      ruleId: 'APPENDIX-D-TABLE-D300-WELDING-TEE',
      sourceRevision: 'M018-01',
      sourceSemanticHash: semanticHash({ componentId, ...TEE_DERIVATION }),
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: 'APPENDIX-D-WELDING-TEE',
      evaluatedBy: 'M018-APPENDIX-S3-TEE-DERIVATION',
    },
    flexibilityFactor: {
      value: TEE_DERIVATION.flexibilityFactor,
      source: TEE_DERIVATION.source,
    },
    flexibilityGeometryBasis: 'JUNCTION_GEOMETRY_EXCLUDED_V1',
    directionalFlexibilityFactors: null,
    pressureCorrectionApplied: false,
    pressureBasis: null,
    userOverride: null,
    semanticHash: '',
  });
}

export function codeProfile() {
  return sealCodeProfile({
    schema: 'fea-b31-code-profile/v1',
    profileId: 'LINEAR-B31-CODE-PROFILE-R1',
    codeProfileId: 'ASME-B31.3-2006-APPENDIX-S3-BENCHMARK',
    scope: 'METALLIC_PROCESS_PIPING_B31_3',
    editionStandard: 'ASME_B31_3_2024',
    flexibilitySource: 'ASME_B31J_2023',
    temperatureInterpolationPolicy: 'LINEAR_BRACKET_INTERPOLATION_V1',
    displacementRangeCombinationRuleId: 'DISPLACEMENT_RANGE_COLD_HOT_CYCLE_REDUCTION_LINEAR_V1',
    occasionalDurationFactors: [],
    liberalAllowableUse: false,
    liberalAllowableUpliftFactor: null,
    semanticHash: '',
  });
}

export function editionDataset() {
  return sealEditionDataset({
    schema: 'fea-b31-edition-dataset/v1',
    datasetId: 'ASME-B31.3-2006-A53B-APPENDIX-S3-DERIVED',
    sourceIdentity: {
      standard: 'ASME_B31_3_2006',
      edition: '2006',
      sourceRevision: 'APPENDIX-S-S303-EQ1A-EQ1B-BACKSOLVE',
      sourceSemanticHash: semanticHash({
        coldAllowable: COLD_ALLOWABLE,
        hotAllowable: HOT_ALLOWABLE,
        cycleReductionFactor: CYCLE_REDUCTION_FACTOR,
      }),
    },
    materialId: 'CS-A53B-APPENDIX-S3',
    allowablePoints: [
      { absoluteTemperature: INSTALLATION_TEMPERATURE, allowableStress: { value: COLD_ALLOWABLE, source: 'M018 independent Eq. (1a)/(1b) back-solve from Appendix S published allowables' } },
      { absoluteTemperature: OPERATING_TEMPERATURE, allowableStress: { value: HOT_ALLOWABLE, source: 'M018 independent Eq. (1a)/(1b) back-solve from Appendix S published allowables' } },
    ],
    displacementRangeCoefficients: {
      coldWeight: { value: 1.25, source: 'ASME B31.3-2006 para. 302.3.5(d) Eq. (1a)' },
      hotWeight: { value: 0.25, source: 'ASME B31.3-2006 para. 302.3.5(d) Eq. (1a)' },
      cycleReductionFactor: { value: CYCLE_REDUCTION_FACTOR, source: 'Appendix S Example 3 weekly alternation over 20 years' },
    },
    weldJointFactor: { value: 1, source: 'Appendix S Example 3 ASTM A53 Grade B seamless pipe, E=1.00' },
    semanticHash: '',
  });
}

function directionalFactors(inPlaneSif, outOfPlaneSif, source) {
  return {
    axial: { value: 1, source },
    torsional: { value: 1, source },
    inPlaneBending: { value: inPlaneSif, source },
    outOfPlaneBending: { value: outOfPlaneSif, source },
  };
}

export function stressFactorSet(componentId, { tee = false, forceUnityTeeSifs = false } = {}) {
  const useTee = tee && !forceUnityTeeSifs;
  const source = useTee
    ? TEE_DERIVATION.source
    : forceUnityTeeSifs
      ? 'M018 forced-unity tee-SIF regression control'
      : 'ASME B31.3-2006 Eq. (17) straight-pipe unity indices';
  return sealStressFactorSet({
    schema: 'fea-b31-stress-factor-set/v1',
    factorSetId: `${componentId}.SF.${useTee ? 'TEE' : 'UNITY'}`,
    componentId,
    sourceIdentity: {
      standard: forceUnityTeeSifs ? 'M018_REGRESSION_CONTROL' : 'ASME_B31_3_2006',
      edition: forceUnityTeeSifs ? '01' : '2006',
      ruleId: useTee ? 'APPENDIX-D-TABLE-D300-WELDING-TEE' : 'EQ17-STRAIGHT-PIPE',
      sourceRevision: 'M018-01',
      sourceSemanticHash: semanticHash({ componentId, useTee, forceUnityTeeSifs, ...TEE_DERIVATION }),
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: useTee ? 'APPENDIX-D-WELDING-TEE' : 'STRAIGHT-PIPE',
      evaluatedBy: 'M018-APPENDIX-S3-STRESS-FACTOR-DERIVATION',
    },
    momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
    sustainedIndices: directionalFactors(1, 1, 'ASME B31.3-2006 sustained longitudinal-stress unity indices'),
    occasionalIndices: directionalFactors(1, 1, 'ASME B31.3-2006 occasional longitudinal-stress unity indices'),
    displacementSifs: directionalFactors(
      useTee ? TEE_DERIVATION.inPlaneSif : 1,
      useTee ? TEE_DERIVATION.outOfPlaneSif : 1,
      source,
    ),
    userOverride: null,
    semanticHash: '',
  });
}
