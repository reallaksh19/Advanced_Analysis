/**
 * Strict UI boundary for retained kernel convergence evidence.
 *
 * The input already contains solved user-supplied levels. This module performs
 * no remeshing, observed-order arithmetic, extrapolation, or classification.
 */
import {
  createConvergenceStudy,
  interpretConvergenceStudy,
} from '../core/element-fea/index.js';

export const CONVERGENCE_STANDING_CAPTION =
  'A stable global response does not prove convergence of a local peak stress.';

export function buildConvergenceStudy(studyInput) {
  assertRawAuthorities(studyInput);
  const study = createConvergenceStudy(studyInput);
  const interpretation = interpretConvergenceStudy(studyInput);
  const levelMetrics = study.levels.map((level) => ({
    levelId: level.levelId,
    ...level.meshMetrics,
  }));
  const probeMappings = study.levels.flatMap((level) =>
    level.probeMappings.map((mapping) => ({
      levelId: level.levelId,
      ...mapping,
    })));
  return deepFreeze({
    study,
    interpretation,
    levelMetrics,
    refinementRatios: study.refinementRatios,
    probeMappings,
  });
}

function assertRawAuthorities(input) {
  if (!Array.isArray(input?.quantities)) {
    throw new TypeError('Convergence quantities are required.');
  }
  const prohibited = input.quantities.filter(
    (row) => row?.sourceAuthority !== 'RAW_QUALIFIED_RESULT',
  );
  if (prohibited.length) {
    throw new TypeError(
      "Projected stress is prohibited for convergence: "
        + "authorityPolicy.projectedStressForConvergence is 'PROHIBITED'.",
    );
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
