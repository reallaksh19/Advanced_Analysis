import { deepFreeze } from '../shared-piping-model/index.js';
import { assertExactKeys } from './contracts.js';
import { compileLoadReferenceTransfer } from './compilers/analytical/load-reference-transfer.js';
import { compilePipeSectionCombined } from './compilers/analytical/pipe-section-combined.js';

const COMPILER_INPUT_KEYS = Object.freeze(['rawParameters', 'templateId']);

export function compileLafeaApplicationTemplate(input) {
  assertExactKeys(input, COMPILER_INPUT_KEYS, 'Template compiler input');
  if (input.templateId === 'ALG-LOAD-REFERENCE-TRANSFER') {
    return compileLoadReferenceTransfer(input.rawParameters);
  }
  if (input.templateId === 'ALG-PIPE-SECTION-COMBINED') {
    return compilePipeSectionCombined(input.rawParameters);
  }
  throw blockedTemplateError(input.templateId);
}

export const LAFEA_T3_COMPILED_TEMPLATE_IDS = deepFreeze([
  'ALG-LOAD-REFERENCE-TRANSFER',
  'ALG-PIPE-SECTION-COMBINED',
]);

function blockedTemplateError(templateId) {
  const error = new TypeError(`TEMPLATE_COMPILER_NOT_AVAILABLE:${templateId}`);
  error.code = 'TEMPLATE_COMPILER_NOT_AVAILABLE';
  return error;
}
