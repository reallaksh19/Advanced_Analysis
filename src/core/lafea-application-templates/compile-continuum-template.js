import { deepFreeze } from '../shared-piping-model/index.js';
import { assertExactKeys } from './contracts.js';
import { LAFEA_T4_CONTINUUM_TEMPLATE_IDS } from './parameter-schemas/continuum.js';
import { compileContinuumSourceIntake } from './compilers/continuum/source-intake.js';

const COMPILER_INPUT_KEYS = Object.freeze(['rawParameters', 'templateId']);
const COMPILED_IDS = new Set(LAFEA_T4_CONTINUUM_TEMPLATE_IDS);

export function compileLafeaContinuumApplicationTemplate(input) {
  assertExactKeys(input, COMPILER_INPUT_KEYS, 'Continuum template compiler input');
  if (!COMPILED_IDS.has(input.templateId)) throw blockedTemplateError(input.templateId);
  return compileContinuumSourceIntake(input.templateId, input.rawParameters);
}

export const LAFEA_T4_COMPILED_CONTINUUM_TEMPLATE_IDS = deepFreeze(
  [...LAFEA_T4_CONTINUUM_TEMPLATE_IDS],
);

function blockedTemplateError(templateId) {
  const code = templateId === 'C2D-FLANGE-HUB'
    ? 'AXISYMMETRIC_CONTINUUM_AUTHORITY_PENDING_QUALIFICATION'
    : 'TEMPLATE_COMPILER_NOT_AVAILABLE';
  const error = new TypeError(`${code}:${templateId}`);
  error.code = code;
  return error;
}
