import {
  EMPIRICAL_FORMULA_IDS,
  EMPIRICAL_PIPING_SCHEMAS,
  deepFreeze,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requirePositiveNumber,
} from './contracts.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';
import { semanticHash } from './identity.js';

export function calculateAnnularSection(outsideDiameterM, wallThicknessM) {
  requirePositiveNumber(outsideDiameterM, 'outsideDiameterM');
  requirePositiveNumber(wallThicknessM, 'wallThicknessM');
  const insideDiameterM = outsideDiameterM - (2 * wallThicknessM);
  if (!(insideDiameterM > 0)) {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.SECTION_INVALID,
      'Wall thickness produces a non-positive inside diameter.',
      { outsideDiameterM, wallThicknessM },
    );
  }
  const areaM2 = (Math.PI / 4) * ((outsideDiameterM ** 2) - (insideDiameterM ** 2));
  const secondMomentM4 = (Math.PI / 64) * ((outsideDiameterM ** 4) - (insideDiameterM ** 4));
  const polarMomentM4 = 2 * secondMomentM4;
  const sectionModulusM3 = (2 * secondMomentM4) / outsideDiameterM;
  return deepFreeze({
    outsideDiameterM,
    insideDiameterM,
    wallThicknessM,
    areaM2,
    secondMomentM4,
    polarMomentM4,
    sectionModulusM3,
    formulaTrace: [
      EMPIRICAL_FORMULA_IDS.sectionArea,
      EMPIRICAL_FORMULA_IDS.sectionSecondMoment,
      EMPIRICAL_FORMULA_IDS.sectionPolarMoment,
      EMPIRICAL_FORMULA_IDS.sectionModulus,
    ],
  });
}

export function resolveSectionStates(input) {
  if (!input || typeof input !== 'object') {
    throw empiricalFailure(EMPIRICAL_FAILURE_CODES.INPUT_INCOMPLETE, 'Section input is required.');
  }
  const outsideDiameterM = requirePositiveNumber(input.outsideDiameterM, 'outsideDiameterM');
  const nominalWallM = requirePositiveNumber(input.nominalWallM, 'nominalWallM');
  const stiffnessWallM = requirePositiveNumber(input.stiffnessWallM, 'stiffnessWallM');
  const weightWallM = requirePositiveNumber(input.weightWallM, 'weightWallM');
  const corrosionAllowanceM = requireNonNegativeNumber(
    input.corrosionAllowanceM ?? 0,
    'corrosionAllowanceM',
  );
  const codeStressWallRule = requireNonEmptyString(
    input.codeStressWallRule,
    'codeStressWallRule',
  );

  let codeStressWallM;
  if (codeStressWallRule === 'EXPLICIT') {
    codeStressWallM = requirePositiveNumber(input.codeStressWallM, 'codeStressWallM');
  } else if (codeStressWallRule === 'NOMINAL_MINUS_CORROSION') {
    codeStressWallM = nominalWallM - corrosionAllowanceM;
    if (!(codeStressWallM > 0)) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.SECTION_INVALID,
        'Nominal wall minus corrosion allowance is not positive.',
        { nominalWallM, corrosionAllowanceM },
      );
    }
  } else {
    throw empiricalFailure(
      EMPIRICAL_FAILURE_CODES.CODE_DATASET_UNRESOLVED,
      `Unsupported code stress wall rule: ${codeStressWallRule}`,
    );
  }

  const sourceAuthority = deepFreeze({
    nominalWall: requireNonEmptyString(input.authority?.nominalWall, 'authority.nominalWall'),
    stiffnessWall: requireNonEmptyString(input.authority?.stiffnessWall, 'authority.stiffnessWall'),
    weightWall: requireNonEmptyString(input.authority?.weightWall, 'authority.weightWall'),
    codeStressWall: requireNonEmptyString(input.authority?.codeStressWall, 'authority.codeStressWall'),
  });

  const result = {
    schema: EMPIRICAL_PIPING_SCHEMAS.sectionStates,
    outsideDiameterM,
    nominalWallM,
    stiffnessWallM,
    weightWallM,
    corrosionAllowanceM,
    codeStressWallM,
    codeStressWallRule,
    millToleranceWallM: input.millToleranceWallM ?? null,
    sourceAuthority,
    stiffness: calculateAnnularSection(outsideDiameterM, stiffnessWallM),
    weight: calculateAnnularSection(outsideDiameterM, weightWallM),
    codeStress: calculateAnnularSection(outsideDiameterM, codeStressWallM),
  };
  return deepFreeze({
    ...result,
    semanticIdentity: semanticHash(result),
  });
}
