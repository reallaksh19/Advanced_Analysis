import {
  EMPIRICAL_FORMULA_IDS,
  EMPIRICAL_PIPING_SCHEMAS,
  deepFreeze,
  requireFiniteNumber,
  requireNonEmptyString,
  requireNonNegativeNumber,
} from '../contracts.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from '../failure-codes.js';
import { semanticHash } from '../identity.js';

function requireResolvedCitation(value, fieldName) {
  const citation = requireNonEmptyString(value, fieldName);
  if (citation === 'SOURCE_CITATION_UNRESOLVED') {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.SOURCE_CITATION_UNRESOLVED,
      `${fieldName} is unresolved.`,
    );
  }
  return citation;
}

export function calculateB31SustainedStress(input) {
  const section = input.sectionStates?.codeStress;
  if (!section) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.INPUT_INCOMPLETE,
      'Resolved code-stress section state is required.',
    );
  }
  const codeDataset = input.codeDataset;
  if (!codeDataset) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.CODE_DATASET_UNRESOLVED,
      'An edition-bound B31.3 code dataset is required.',
    );
  }
  const datasetId = requireNonEmptyString(codeDataset.id, 'codeDataset.id');
  const edition = requireNonEmptyString(codeDataset.edition, 'codeDataset.edition');
  const sustainedRuleCitation = requireResolvedCitation(
    codeDataset.sustainedRuleCitation,
    'codeDataset.sustainedRuleCitation',
  );
  const pressureAreaCitation = requireResolvedCitation(
    codeDataset.pressureAreaCitation,
    'codeDataset.pressureAreaCitation',
  );
  if (codeDataset.pressureAreaBasis !== 'CORRODED_INTERNAL_DIAMETER') {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.CODE_DATASET_UNRESOLVED,
      `Unsupported pressure-force area basis: ${codeDataset.pressureAreaBasis}`,
    );
  }

  const pressurePa = requireNonNegativeNumber(input.pressurePa, 'pressurePa');
  const mechanicalAxialForceN = requireFiniteNumber(
    input.mechanicalAxialForceN,
    'mechanicalAxialForceN',
  );
  const inPlaneMomentNm = requireFiniteNumber(input.inPlaneMomentNm ?? 0, 'inPlaneMomentNm');
  const outOfPlaneMomentNm = requireFiniteNumber(
    input.outOfPlaneMomentNm ?? 0,
    'outOfPlaneMomentNm',
  );
  const torsionalMomentNm = requireFiniteNumber(
    input.torsionalMomentNm ?? 0,
    'torsionalMomentNm',
  );
  const sustainedInPlaneIndex = requireNonNegativeNumber(
    input.sustainedInPlaneIndex,
    'sustainedInPlaneIndex',
  );
  const sustainedOutOfPlaneIndex = requireNonNegativeNumber(
    input.sustainedOutOfPlaneIndex,
    'sustainedOutOfPlaneIndex',
  );
  const indexCitation = requireResolvedCitation(input.indexCitation, 'indexCitation');

  const pressureForceAreaM2 = (Math.PI / 4) * (section.insideDiameterM ** 2);
  const pressureForceN = pressurePa * pressureForceAreaM2;
  let sustainedAxialForceN;
  if (input.axialCombination === 'PRESSURE_MINUS_MECHANICAL') {
    sustainedAxialForceN = pressureForceN - mechanicalAxialForceN;
  } else if (input.axialCombination === 'PRESSURE_PLUS_MECHANICAL') {
    sustainedAxialForceN = pressureForceN + mechanicalAxialForceN;
  } else {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.CODE_DATASET_UNRESOLVED,
      `Unsupported axial-force combination: ${input.axialCombination}`,
    );
  }

  const axialStressPa = sustainedAxialForceN / section.areaM2;
  const indexedInPlaneMomentNm = sustainedInPlaneIndex * inPlaneMomentNm;
  const indexedOutOfPlaneMomentNm = sustainedOutOfPlaneIndex * outOfPlaneMomentNm;
  const bendingStressPa = Math.hypot(
    indexedInPlaneMomentNm,
    indexedOutOfPlaneMomentNm,
  ) / section.sectionModulusM3;
  const torsionalStressPa = torsionalMomentNm / (2 * section.sectionModulusM3);
  const sustainedLongitudinalStressPa = Math.hypot(
    Math.abs(axialStressPa) + bendingStressPa,
    2 * torsionalStressPa,
  );
  const allowablePa = input.allowablePa === undefined || input.allowablePa === null
    ? null
    : requireNonNegativeNumber(input.allowablePa, 'allowablePa');
  const disposition = allowablePa === null
    ? 'NOT_EVALUATED'
    : sustainedLongitudinalStressPa <= allowablePa ? 'PASS' : 'FAIL';
  const utilization = allowablePa && allowablePa > 0
    ? sustainedLongitudinalStressPa / allowablePa
    : null;

  const result = {
    schema: EMPIRICAL_PIPING_SCHEMAS.sustainedStress,
    stationId: requireNonEmptyString(input.stationId, 'stationId'),
    codeDataset: { datasetId, edition, sustainedRuleCitation, pressureAreaCitation },
    pressureAreaBasis: codeDataset.pressureAreaBasis,
    pressureForceAreaM2,
    pressureForceN,
    mechanicalAxialForceN,
    axialCombination: input.axialCombination,
    sustainedAxialForceN,
    axialStressPa,
    inPlaneMomentNm,
    outOfPlaneMomentNm,
    sustainedInPlaneIndex,
    sustainedOutOfPlaneIndex,
    indexCitation,
    bendingStressPa,
    torsionalMomentNm,
    torsionalStressPa,
    sustainedLongitudinalStressPa,
    allowablePa,
    utilization,
    disposition,
    formulaTrace: [
      EMPIRICAL_FORMULA_IDS.pressureForce,
      EMPIRICAL_FORMULA_IDS.sustainedAxialStress,
      EMPIRICAL_FORMULA_IDS.sustainedBendingStress,
      EMPIRICAL_FORMULA_IDS.sustainedTorsionStress,
      EMPIRICAL_FORMULA_IDS.sustainedLongitudinalStress,
    ],
  };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}
