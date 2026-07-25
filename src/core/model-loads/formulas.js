import { deepFreeze } from '../shared-piping-model/index.js';
import { FORMULA_IDS } from './constants.js';

const ROUNDING_RULE = 'NONE_CANONICAL_DOUBLE';

export function pipeMetalMassPerLength(odM, wallM, densityKgM3, evidence) {
  const idM = odM - (2 * wallM);
  const areaM2 = (Math.PI / 4) * ((odM ** 2) - (idM ** 2));
  const result = areaM2 * densityKgM3;
  return formulaResult(FORMULA_IDS.PIPE, result, 'kg/m', evidence, { odM, wallM, idM, areaM2, densityKgM3 });
}

export function fluidMassPerLength(idM, densityKgM3, evidence) {
  const areaM2 = (Math.PI / 4) * (idM ** 2);
  const result = areaM2 * densityKgM3;
  return formulaResult(FORMULA_IDS.FLUID, result, 'kg/m', evidence, { idM, areaM2, densityKgM3 });
}

export function insulationMassPerLength(odM, thicknessM, densityKgM3, evidence) {
  const insulationOdM = odM + (2 * thicknessM);
  const areaM2 = (Math.PI / 4) * ((insulationOdM ** 2) - (odM ** 2));
  const result = areaM2 * densityKgM3;
  return formulaResult(FORMULA_IDS.INSULATION, result, 'kg/m', evidence, {
    odM, thicknessM, insulationOdM, areaM2, densityKgM3,
  });
}

export function massToWeightForce(mass, gravity, distributed = false, sourceInputs = []) {
  const result = mass * gravity.accelerationMPerS2;
  return formulaResult(FORMULA_IDS.WEIGHT, result, distributed ? 'N/m' : 'N', sourceInputs, {
    mass,
    massUnit: distributed ? 'kg/m' : 'kg',
    accelerationMPerS2: gravity.accelerationMPerS2,
  });
}

function formulaResult(formulaId, rawResult, canonicalUnit, sourceInputs, canonicalSubstitutions) {
  return deepFreeze({
    value: rawResult,
    trace: {
      formulaId,
      formulaVersion: 1,
      sourceInputs: Array.isArray(sourceInputs) ? sourceInputs : [],
      canonicalSubstitutions,
      rawResult,
      canonicalUnit,
      roundingRule: ROUNDING_RULE,
      fallbackUsed: false,
    },
  });
}
