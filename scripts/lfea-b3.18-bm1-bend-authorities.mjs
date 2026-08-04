import { sealStressFactorSet } from '../src/core/linear-fea-b31-code-engine/index.js';
import { sealComponentFactorSet } from '../src/core/linear-fea-piping-components/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../src/core/shared-piping-model/immutable.js';

export const BM1_BEND_AUTHORITY_SCHEMA = 'm024-bm1-bend-authority/v1';
export const BM1_BEND_SOURCE = 'ASME B31.3-2006 Appendix D Table D300 welding elbow and Note (7)';

export function deriveBm1BendAuthority({ sourceSegment, material, section }) {
  requireBendSource(sourceSegment);
  const outerDiameter = positive(section?.dimensions?.outerDiameter, 'outerDiameter');
  const wallThickness = positive(section?.dimensions?.wallThickness, 'wallThickness');
  const bendRadius = positive(sourceSegment.meta.bendDeclaredRadius, 'bendRadius');
  const pressure = positive(sourceSegment.meta.analysis.pressure, 'pressure');
  const elasticModulus = positive(material?.materialState?.elasticModulus, 'elasticModulus');
  const meanCrossSectionRadius = (outerDiameter - wallThickness) / 2;
  const flexibilityCharacteristic = (wallThickness * bendRadius) / meanCrossSectionRadius ** 2;
  const unpressurisedFlexibilityFactor = 1.65 / flexibilityCharacteristic;
  const flexibilityPressureDenominator = 1
    + 6
      * (pressure / elasticModulus)
      * (meanCrossSectionRadius / wallThickness) ** (7 / 3)
      * (bendRadius / meanCrossSectionRadius) ** (1 / 3);
  const unpressurisedInPlaneSif = 0.9 / flexibilityCharacteristic ** (2 / 3);
  const unpressurisedOutOfPlaneSif = 0.75 / flexibilityCharacteristic ** (2 / 3);
  const sifPressureDenominator = 1
    + 3.25
      * (pressure / elasticModulus)
      * (meanCrossSectionRadius / wallThickness) ** (5 / 2)
      * (bendRadius / meanCrossSectionRadius) ** (2 / 3);
  const draft = {
    schema: BM1_BEND_AUTHORITY_SCHEMA,
    sourceSegmentId: sourceSegment.id,
    source: BM1_BEND_SOURCE,
    outerDiameter,
    wallThickness,
    bendRadius,
    pressure,
    elasticModulus,
    meanCrossSectionRadius,
    flexibilityCharacteristic,
    unpressurisedFlexibilityFactor,
    flexibilityPressureDenominator,
    pressureCorrectedFlexibilityFactor: unpressurisedFlexibilityFactor / flexibilityPressureDenominator,
    unpressurisedInPlaneSif,
    unpressurisedOutOfPlaneSif,
    sifPressureDenominator,
    pressureCorrectedInPlaneSif: unpressurisedInPlaneSif / sifPressureDenominator,
    pressureCorrectedOutOfPlaneSif: unpressurisedOutOfPlaneSif / sifPressureDenominator,
    semanticHash: '',
  };
  draft.semanticHash = semanticHash({ ...draft, semanticHash: undefined });
  return deepFreeze(draft);
}

export function bm1BendFactorSet(componentId, authority) {
  requireAuthority(authority);
  return sealComponentFactorSet({
    schema: 'fea-linear-component-factor-set/v1',
    factorSetId: `${componentId}.M024.FLEXIBILITY`,
    componentType: 'BEND',
    sourceIdentity: {
      standard: 'ASME_B31_3_2006',
      edition: '2006',
      ruleId: 'APPENDIX-D-TABLE-D300-WELDING-ELBOW-NOTE-7',
      sourceRevision: authority.sourceSegmentId,
      sourceSemanticHash: authority.semanticHash,
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: 'APPENDIX-D-WELDING-ELBOW',
      evaluatedBy: 'M024-BM1-BEND-AUTHORITY',
    },
    flexibilityFactor: {
      value: authority.pressureCorrectedFlexibilityFactor,
      source: BM1_BEND_SOURCE,
    },
    flexibilityGeometryBasis: 'ARC_GEOMETRY_EXCLUDED_V1',
    directionalFlexibilityFactors: null,
    pressureCorrectionApplied: true,
    pressureBasis: `${authority.pressure} Pa gauge from the live BM1 InputXML PRESSURE1 authority`,
    userOverride: null,
    semanticHash: '',
  });
}

export function bm1CodeStressFactorSet({ componentId, sourceSegmentId, bendAuthority = null }) {
  const bend = bendAuthority !== null;
  if (bend) requireAuthority(bendAuthority);
  const source = bend
    ? `${BM1_BEND_SOURCE}; pressure-corrected directional elbow SIFs`
    : 'M024 live BM1 InputXML non-bend code point; unity stress factor';
  const directional = () => ({
    axial: { value: 1, source },
    torsional: { value: 1, source },
    inPlaneBending: {
      value: bend ? bendAuthority.pressureCorrectedInPlaneSif : 1,
      source,
    },
    outOfPlaneBending: {
      value: bend ? bendAuthority.pressureCorrectedOutOfPlaneSif : 1,
      source,
    },
  });
  return sealStressFactorSet({
    schema: 'fea-b31-stress-factor-set/v1',
    factorSetId: `${componentId}.M024.${bend ? 'BEND' : 'UNITY'}`,
    componentId,
    sourceIdentity: {
      standard: bend ? 'ASME_B31_3_2006' : 'M024_INPUTXML',
      edition: bend ? '2006' : '01',
      ruleId: bend ? 'APPENDIX-D-TABLE-D300-WELDING-ELBOW-NOTE-7' : 'NON-BEND-UNITY',
      sourceRevision: sourceSegmentId,
      sourceSemanticHash: semanticHash({ sourceSegmentId, source, bendAuthoritySemanticHash: bendAuthority?.semanticHash ?? null }),
    },
    applicability: {
      status: 'WITHIN_RANGE',
      ruleId: bend ? 'APPENDIX-D-WELDING-ELBOW' : 'NON-BEND-UNITY',
      evaluatedBy: 'M024-BM1-BEND-AUTHORITY',
    },
    // The B-3.2 bend reference vector is its plane normal, so local y is
    // perpendicular to the bend plane (CAESAR/B31 in-plane bending axis) and
    // local z points radially (out-of-plane bending axis).
    momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
    sustainedIndices: directional(),
    occasionalIndices: directional(),
    displacementSifs: directional(),
    userOverride: null,
    semanticHash: '',
  });
}

function requireBendSource(sourceSegment) {
  if (!sourceSegment || sourceSegment.type !== 'BEND' || !sourceSegment.meta?.analysis) {
    throw new TypeError('M024 bend authority requires one normalized InputXML BEND source segment.');
  }
}

function requireAuthority(value) {
  if (!value || value.schema !== BM1_BEND_AUTHORITY_SCHEMA || !Number.isFinite(value.pressureCorrectedFlexibilityFactor)) {
    throw new TypeError('M024 requires a sealed BM1 bend authority.');
  }
}

function positive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`M024 ${field} must be positive and finite.`);
  return value;
}
