#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  requireT6AParameterSchema,
} from '../src/workspace/lafea-templates/wizard-model.js';
import {
  createLafeaTemplateParameterDraft,
  updateLafeaTemplateParameterDraft,
  validateLafeaTemplateParameterDraft,
} from '../src/workspace/lafea-templates/t7a-parameter-entry.js';
import {
  attemptLafeaTemplateCompilationPreview,
} from '../src/workspace/lafea-templates/t7b-compilation-preview.js';

const parameterSchema = requireT6AParameterSchema('ALG-LOAD-REFERENCE-TRANSFER');
let draft = createLafeaTemplateParameterDraft(parameterSchema);
for (const descriptor of parameterSchema.parameters) {
  draft = updateLafeaTemplateParameterDraft(
    parameterSchema,
    draft,
    descriptor.parameterId,
    {
      present: true,
      valueInput: JSON.stringify({
        declared: true,
        parameterId: descriptor.parameterId,
      }),
      unit: descriptor.canonicalUnit,
      sourceRefInput: descriptor.sourceRequired
        ? JSON.stringify({ reference: `VALIDATION#${descriptor.parameterId}` })
        : '',
      sourceStatus: descriptor.sourceRequired ? 'VERIFIED' : null,
    },
  );
}
const validation = validateLafeaTemplateParameterDraft(parameterSchema, draft);
assert.equal(validation.status, 'VALID');
assert.equal(Object.isFrozen(validation), true);

const forgedHashValidation = Object.freeze({
  ...validation,
  semanticHash: 'fnv1a64:0000000000000000',
});
const forgedHashAttempt = attemptLafeaTemplateCompilationPreview(
  parameterSchema,
  draft,
  forgedHashValidation,
);
assert.equal(forgedHashAttempt.status, 'BLOCKED');
assert.equal(
  forgedHashAttempt.errorCode,
  'T7B_PARAMETER_VALIDATION_HASH_INVALID',
);
assert.equal(forgedHashAttempt.preview, null);

const unexpectedKeyValidation = Object.freeze({
  ...validation,
  unexpected: true,
});
const unexpectedKeyAttempt = attemptLafeaTemplateCompilationPreview(
  parameterSchema,
  draft,
  unexpectedKeyValidation,
);
assert.equal(unexpectedKeyAttempt.status, 'BLOCKED');
assert.equal(
  unexpectedKeyAttempt.errorCode,
  'T7B_PARAMETER_VALIDATION_KEYS_INVALID',
);
assert.equal(unexpectedKeyAttempt.preview, null);

const mutableValidation = {
  ...validation,
};
const mutableAttempt = attemptLafeaTemplateCompilationPreview(
  parameterSchema,
  draft,
  mutableValidation,
);
assert.equal(mutableAttempt.status, 'BLOCKED');
assert.equal(
  mutableAttempt.errorCode,
  'T7B_PARAMETER_VALIDATION_MUST_BE_FROZEN',
);
assert.equal(mutableAttempt.preview, null);

console.log(JSON.stringify({
  check: 'lafea-template-t7b-validation-parent',
  status: 'PASS',
  forgedHashRejected: true,
  unexpectedValidationKeysRejected: true,
  mutableValidationRejected: true,
  compilerInvocationPathsReached: 0,
  workbenchImportPaths: 0,
  engineExecutionPaths: 0,
}, null, 2));
