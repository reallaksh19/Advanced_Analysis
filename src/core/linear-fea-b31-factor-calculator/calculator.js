import {
  FACTOR_CALCULATION_RESULT_SCHEMA,
  requireFactorCalculationRequest,
  sealFactorCalculationRequest,
  sealFactorCalculationResult,
} from './contract.js';
import { resolveB31FactorEditionProfile } from './edition-profiles.js';
import { normalizeComponentGeometry } from './geometry.js';
import {
  applyB31J2023SustainedDoTCorrection,
  b31jBranchSustainedIndices,
  b31jDirectSustainedIndices,
  calculateB31JReducerFactors,
  calculateB31JWeldingTeeFactors,
  calculateBendFactors,
  calculateLegacyWeldingTeeFactors,
  legacySustainedIndices,
} from './equations.js';
import {
  evaluateBendApplicability,
  evaluateReducerApplicability,
  evaluateTeeApplicability,
} from './applicability.js';
import {
  buildBendComponentFactorSet,
  buildBendStressFactorSet,
  buildLegacyTeeComponentFactorSet,
  buildReducerStressFactorSet,
  buildTeeStressFactorSets,
  sourceIdentity,
} from './records.js';

function acceptedRequest(request) {
  return request.semanticHash === ''
    ? sealFactorCalculationRequest(request)
    : requireFactorCalculationRequest(request);
}

function blockedResult({ request, profile, geometry, applicability, ruleId }) {
  return sealFactorCalculationResult({
    schema: FACTOR_CALCULATION_RESULT_SCHEMA,
    calculationId: request.calculationId,
    componentId: request.componentId,
    editionProfileId: request.editionProfileId,
    componentType: request.componentType,
    status: 'BLOCKED',
    sourceIdentity: sourceIdentity(profile, ruleId),
    applicability,
    geometry,
    factors: null,
    componentFactorSet: null,
    stressFactorSets: [],
    matchingPipeApplication: request.componentType === 'REDUCER'
      ? matchingPipeApplication(request.componentId, geometry, [])
      : null,
    diagnostics: applicability.violations.map((violation) => ({
      code: 'B31_FACTOR_APPLICABILITY_EXCEEDED',
      severity: 'error',
      message: `${violation.field}=${violation.value} violates ${violation.rule}.`,
    })),
    semanticHash: '',
  });
}


function sustainedWithEditionCorrection(profile, baseIndices, outerDiameterToThickness) {
  if (profile.factorEdition !== '2023') {
    return {
      indices: baseIndices,
      correction: { applied: false, outerDiameterToThickness, denominator: 1 },
    };
  }
  return applyB31J2023SustainedDoTCorrection(baseIndices, outerDiameterToThickness);
}

function bendResult(request, profile, geometry) {
  const applicability = evaluateBendApplicability(geometry, profile);
  const ruleId = profile.factorStandard === 'ASME_B31J'
    ? 'TABLE_1_1_SKETCH_1_1_BEND'
    : 'TABLE_D300_WELDING_ELBOW';
  if (applicability.status !== 'WITHIN_RANGE') {
    return blockedResult({ request, profile, geometry, applicability, ruleId });
  }
  const factors = calculateBendFactors(geometry, profile);
  const baseSustainedIndices = profile.factorStandard === 'ASME_B31J'
    ? b31jDirectSustainedIndices(factors.displacementSifs)
    : legacySustainedIndices(factors.displacementSifs);
  const sustained = sustainedWithEditionCorrection(
    profile,
    baseSustainedIndices,
    geometry.outerDiameter / geometry.wallThickness,
  );
  const sustainedIndices = sustained.indices;
  const componentFactorSet = buildBendComponentFactorSet({
    componentId: request.componentId,
    profile,
    applicability,
    factors,
  });
  const stressFactorSet = buildBendStressFactorSet({
    componentId: request.componentId,
    profile,
    applicability,
    momentDirectionMapping: request.momentDirectionMapping,
    factors,
    sustainedIndices,
  });
  return sealFactorCalculationResult({
    schema: FACTOR_CALCULATION_RESULT_SCHEMA,
    calculationId: request.calculationId,
    componentId: request.componentId,
    editionProfileId: request.editionProfileId,
    componentType: request.componentType,
    status: 'QUALIFIED',
    sourceIdentity: sourceIdentity(profile, ruleId),
    applicability,
    geometry,
    factors: { ...factors, sustainedIndices, sustainedCorrection: sustained.correction },
    componentFactorSet,
    stressFactorSets: [stressFactorSet],
    matchingPipeApplication: null,
    diagnostics: factors.flexibilityRule.smooth90CorrectionApplied
      ? [{
          code: 'B31J_SMOOTH_90_BEND_FLEXIBILITY_CORRECTION_APPLIED',
          severity: 'info',
          message: 'B31J Table 1-1 Note (3) 1.3/h flexibility was applied by explicit geometry policy.',
        }]
      : [],
    semanticHash: '',
  });
}

function teeResult(request, profile, geometry) {
  const applicability = evaluateTeeApplicability(geometry, profile);
  const ruleId = profile.factorStandard === 'ASME_B31J'
    ? 'TABLE_1_1_SKETCH_2_1_WELDING_TEE'
    : 'TABLE_D300_WELDING_TEE';
  if (applicability.status !== 'WITHIN_RANGE') {
    return blockedResult({ request, profile, geometry, applicability, ruleId });
  }
  const factors = profile.factorStandard === 'ASME_B31J'
    ? calculateB31JWeldingTeeFactors(geometry)
    : calculateLegacyWeldingTeeFactors(geometry);
  const thicknessRatio = geometry.branchWallThickness / geometry.runWallThickness;
  const baseSustainedIndices = profile.factorStandard === 'ASME_B31J'
    ? {
        run: b31jBranchSustainedIndices(factors.displacementSifs.run, thicknessRatio),
        branch: b31jBranchSustainedIndices(factors.displacementSifs.branch, thicknessRatio),
      }
    : {
        run: legacySustainedIndices(factors.displacementSifs.run),
        branch: legacySustainedIndices(factors.displacementSifs.branch),
      };
  const doTRatio = geometry.runOuterDiameter / geometry.runWallThickness;
  const sustainedRun = sustainedWithEditionCorrection(profile, baseSustainedIndices.run, doTRatio);
  const sustainedBranch = sustainedWithEditionCorrection(profile, baseSustainedIndices.branch, doTRatio);
  const sustainedIndices = { run: sustainedRun.indices, branch: sustainedBranch.indices };
  const sustainedCorrection = { run: sustainedRun.correction, branch: sustainedBranch.correction };
  const stressFactorSets = buildTeeStressFactorSets({
    componentId: request.componentId,
    profile,
    applicability,
    momentDirectionMapping: request.momentDirectionMapping,
    displacementSifs: factors.displacementSifs,
    sustainedIndices,
  });
  const componentFactorSet = profile.factorStandard === 'ASME_B31J'
    ? null
    : buildLegacyTeeComponentFactorSet({ componentId: request.componentId, profile, applicability });
  const diagnostics = profile.factorStandard === 'ASME_B31J'
    ? [
        {
          code: 'B31J_TEE_DIRECTIONAL_FLEXIBILITY_NOT_SEALED_FOR_B3_2',
          severity: 'info',
          message: 'Run/branch directional k-factors are emitted in factors.flexibility but are not collapsed into the scalar B3.2 component-factor-set contract.',
        },
        ...(factors.qualityReduction?.applied
          ? [{
              code: 'B31J_TEE_NOTE_6_REDUCTION_APPLIED',
              severity: 'info',
              message: 'Verified welding-tee flexibility factors and SIFs were divided by 1.26 before the mandatory minimum-one floor.',
            }]
          : []),
      ]
    : [];
  return sealFactorCalculationResult({
    schema: FACTOR_CALCULATION_RESULT_SCHEMA,
    calculationId: request.calculationId,
    componentId: request.componentId,
    editionProfileId: request.editionProfileId,
    componentType: request.componentType,
    status: 'QUALIFIED',
    sourceIdentity: sourceIdentity(profile, ruleId),
    applicability,
    geometry,
    factors: { ...factors, sustainedIndices, sustainedCorrection },
    componentFactorSet,
    stressFactorSets,
    matchingPipeApplication: null,
    diagnostics,
    semanticHash: '',
  });
}

function legacyReducerFactors() {
  const unity = { axial: 1, torsional: 1, inPlaneBending: 1, outOfPlaneBending: 1 };
  return { flexibility: null, displacementSifs: unity };
}

function matchingPipeApplication(componentId, geometry, stressFactorSets) {
  return {
    ruleId: 'MATCHING_PIPE_SECTION_MODULUS_BY_REDUCER_END',
    componentId,
    lengthUnit: 'm',
    largeEnd: {
      endpoint: 'LARGE_END',
      outerDiameter: geometry.largeEndOuterDiameter,
      wallThickness: geometry.largeEndWallThickness,
    },
    smallEnd: {
      endpoint: 'SMALL_END',
      outerDiameter: geometry.smallEndOuterDiameter,
      wallThickness: geometry.smallEndWallThickness,
    },
    stressFactorSetIds: stressFactorSets.map((entry) => entry.factorSetId),
  };
}

function reducerResult(request, profile, geometry) {
  const applicability = evaluateReducerApplicability(geometry, profile);
  const ruleId = profile.factorStandard === 'ASME_B31J'
    ? 'TABLE_1_1_SKETCH_3_1_REDUCER'
    : 'TABLE_D300_REDUCER_UNITY';
  if (applicability.status !== 'WITHIN_RANGE') {
    return blockedResult({ request, profile, geometry, applicability, ruleId });
  }
  const factors = profile.factorStandard === 'ASME_B31J'
    ? calculateB31JReducerFactors(geometry)
    : legacyReducerFactors();
  const baseSustainedIndices = profile.factorStandard === 'ASME_B31J'
    ? b31jDirectSustainedIndices(factors.displacementSifs)
    : legacySustainedIndices(factors.displacementSifs);
  const sustained = sustainedWithEditionCorrection(
    profile,
    baseSustainedIndices,
    geometry.smallEndOuterDiameter / geometry.smallEndWallThickness,
  );
  const sustainedIndices = sustained.indices;
  const stressFactorSet = buildReducerStressFactorSet({
    componentId: request.componentId,
    profile,
    applicability,
    momentDirectionMapping: request.momentDirectionMapping,
    displacementSifs: factors.displacementSifs,
    sustainedIndices,
  });
  const stressFactorSets = [stressFactorSet];
  return sealFactorCalculationResult({
    schema: FACTOR_CALCULATION_RESULT_SCHEMA,
    calculationId: request.calculationId,
    componentId: request.componentId,
    editionProfileId: request.editionProfileId,
    componentType: request.componentType,
    status: 'QUALIFIED',
    sourceIdentity: sourceIdentity(profile, ruleId),
    applicability,
    geometry,
    factors: { ...factors, sustainedIndices, sustainedCorrection: sustained.correction },
    componentFactorSet: null,
    stressFactorSets,
    matchingPipeApplication: matchingPipeApplication(request.componentId, geometry, stressFactorSets),
    diagnostics: [profile.factorStandard === 'ASME_B31J'
      ? {
          code: 'B31J_REDUCER_GENERAL_FLEXIBILITY_FACTOR_NOT_DEFINED',
          severity: 'info',
          message: 'The reducer rule emits directional SIFs and endpoint matching-pipe evidence; it does not invent a general numeric k-factor.',
        }
      : {
          code: 'B31_3_APPENDIX_D_REDUCER_UNITY_RULE',
          severity: 'info',
          message: 'The selected legacy Appendix D profile emits the edition-specific unity reducer SIF rule; this is not a fallback for a failed B31J applicability check.',
        }],
    semanticHash: '',
  });
}

export function calculateB31Factors(inputRequest) {
  const request = acceptedRequest(inputRequest);
  const profile = resolveB31FactorEditionProfile(request.editionProfileId);
  const geometry = normalizeComponentGeometry(request.geometry);
  if (request.componentType === 'BEND') return bendResult(request, profile, geometry);
  if (request.componentType === 'WELDING_TEE') return teeResult(request, profile, geometry);
  return reducerResult(request, profile, geometry);
}
