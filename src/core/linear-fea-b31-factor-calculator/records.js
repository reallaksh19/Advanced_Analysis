import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { sealComponentFactorSet } from '../linear-fea-piping-components/piping-component-contract.js';
import { sealStressFactorSet } from '../linear-fea-b31-code-engine/code-engine-contract.js';

function authorityLabel(profile, ruleId) {
  return `${profile.factorStandard}-${profile.factorEdition} ${ruleId}`;
}

export function sourceIdentity(profile, ruleId) {
  return Object.freeze({
    standard: profile.factorStandard === 'ASME_B31J'
      ? `ASME_B31J_${profile.factorEdition}`
      : `ASME_B31_3_${profile.factorEdition}_APPENDIX_D`,
    edition: profile.factorEdition,
    ruleId,
    sourceRevision: profile.sourceRevision,
    sourceSemanticHash: semanticHash({
      standard: profile.factorStandard,
      edition: profile.factorEdition,
      ruleId,
      sourceRevision: profile.sourceRevision,
    }),
  });
}

function contractApplicability(applicability) {
  return {
    status: applicability.status,
    ruleId: applicability.ruleId,
    evaluatedBy: applicability.evaluatedBy,
  };
}

function declaredDirectionalFactors(values, source) {
  return {
    axial: { value: values.axial, source },
    torsional: { value: values.torsional, source },
    inPlaneBending: { value: values.inPlaneBending, source },
    outOfPlaneBending: { value: values.outOfPlaneBending, source },
  };
}

function stressFactorSet({
  factorSetId,
  componentId,
  profile,
  ruleId,
  applicability,
  momentDirectionMapping,
  sustainedIndices,
  displacementSifs,
}) {
  const source = authorityLabel(profile, ruleId);
  return sealStressFactorSet({
    schema: 'fea-b31-stress-factor-set/v1',
    factorSetId,
    componentId,
    sourceIdentity: sourceIdentity(profile, ruleId),
    applicability: contractApplicability(applicability),
    momentDirectionMapping: { ...momentDirectionMapping },
    sustainedIndices: declaredDirectionalFactors(sustainedIndices, source),
    occasionalIndices: declaredDirectionalFactors(sustainedIndices, source),
    displacementSifs: declaredDirectionalFactors(displacementSifs, source),
    userOverride: null,
    semanticHash: '',
  });
}

export function buildBendComponentFactorSet({ componentId, profile, applicability, factors }) {
  const ruleId = profile.factorStandard === 'ASME_B31J'
    ? 'TABLE_1_1_SKETCH_1_1_BEND'
    : 'TABLE_D300_WELDING_ELBOW';
  const source = authorityLabel(profile, ruleId);
  return sealComponentFactorSet({
    schema: 'fea-linear-component-factor-set/v1',
    factorSetId: `${componentId}.B31.K`,
    componentType: 'BEND',
    sourceIdentity: sourceIdentity(profile, ruleId),
    applicability: contractApplicability(applicability),
    flexibilityFactor: { value: factors.flexibility.inPlane, source },
    flexibilityGeometryBasis: 'ARC_GEOMETRY_EXCLUDED_V1',
    directionalFlexibilityFactors: null,
    pressureCorrectionApplied: factors.pressureCorrection.applied,
    pressureBasis: factors.pressureCorrection.applied
      ? `${source}; pressure correction uses declared P/E and bend geometry`
      : null,
    userOverride: null,
    semanticHash: '',
  });
}

export function buildLegacyTeeComponentFactorSet({ componentId, profile, applicability }) {
  const ruleId = 'TABLE_D300_WELDING_TEE';
  const source = authorityLabel(profile, ruleId);
  return sealComponentFactorSet({
    schema: 'fea-linear-component-factor-set/v1',
    factorSetId: `${componentId}.B31.K`,
    componentType: 'BRANCH_JUNCTION',
    sourceIdentity: sourceIdentity(profile, ruleId),
    applicability: contractApplicability(applicability),
    flexibilityFactor: { value: 1, source },
    flexibilityGeometryBasis: 'JUNCTION_GEOMETRY_EXCLUDED_V1',
    directionalFlexibilityFactors: null,
    pressureCorrectionApplied: false,
    pressureBasis: null,
    userOverride: null,
    semanticHash: '',
  });
}

export function buildBendStressFactorSet({
  componentId,
  profile,
  applicability,
  momentDirectionMapping,
  factors,
  sustainedIndices,
}) {
  const ruleId = profile.factorStandard === 'ASME_B31J'
    ? 'TABLE_1_1_SKETCH_1_1_BEND'
    : 'TABLE_D300_WELDING_ELBOW';
  return stressFactorSet({
    factorSetId: `${componentId}.B31.SIF`,
    componentId,
    profile,
    ruleId,
    applicability,
    momentDirectionMapping,
    sustainedIndices,
    displacementSifs: factors.displacementSifs,
  });
}

export function buildTeeStressFactorSets({
  componentId,
  profile,
  applicability,
  momentDirectionMapping,
  displacementSifs,
  sustainedIndices,
}) {
  const ruleId = profile.factorStandard === 'ASME_B31J'
    ? 'TABLE_1_1_SKETCH_2_1_WELDING_TEE'
    : 'TABLE_D300_WELDING_TEE';
  return ['run', 'branch'].map((leg) => stressFactorSet({
    factorSetId: `${componentId}.${leg.toUpperCase()}.B31.SIF`,
    componentId,
    profile,
    ruleId: `${ruleId}_${leg.toUpperCase()}`,
    applicability,
    momentDirectionMapping,
    sustainedIndices: sustainedIndices[leg],
    displacementSifs: displacementSifs[leg],
  }));
}

export function buildReducerStressFactorSet({
  componentId,
  profile,
  applicability,
  momentDirectionMapping,
  displacementSifs,
  sustainedIndices,
}) {
  const ruleId = profile.factorStandard === 'ASME_B31J'
    ? 'TABLE_1_1_SKETCH_3_1_REDUCER'
    : 'TABLE_D300_REDUCER_UNITY';
  return stressFactorSet({
    factorSetId: `${componentId}.B31.SIF`,
    componentId,
    profile,
    ruleId,
    applicability,
    momentDirectionMapping,
    sustainedIndices,
    displacementSifs,
  });
}
