#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  createLafeaTemplateCatalogQuery,
  validateLafeaTemplateCatalogModel,
} from '../src/workspace/lafea-templates/index.js';
import {
  LAFEA_TEMPLATE_WIZARD_ACTIONS,
  LAFEA_TEMPLATE_WIZARD_INTEGRATION_STATUS,
  LAFEA_T6A_SELECTION_TEMPLATE_IDS,
  LAFEA_T6A_STANDALONE_CATALOG_MODEL,
  createLafeaTemplateWizardModel,
  requireT6AParameterSchema,
  validateLafeaTemplateWizardModel,
  validateLafeaTemplateWizardSelection,
} from '../src/workspace/lafea-templates/t6a-standalone-wizard.js';

assert.equal(validateLafeaTemplateCatalogModel(LAFEA_T6A_STANDALONE_CATALOG_MODEL).ok, true);
assert.equal(LAFEA_T6A_STANDALONE_CATALOG_MODEL.cards.length, 27);
assert.equal(LAFEA_T6A_STANDALONE_CATALOG_MODEL.summary.executableCount, 0);
assert.deepEqual(LAFEA_T6A_SELECTION_TEMPLATE_IDS, [
  'ALG-LOAD-REFERENCE-TRANSFER',
  'ALG-PIPE-SECTION-COMBINED',
  'C2D-LUG-PINHOLE',
  'C2D-PIPE-PAD-SECTION',
]);

const initial = createLafeaTemplateWizardModel();
assert.equal(validateLafeaTemplateWizardModel(initial).ok, true);
assert.equal(initial.matchedTemplateIds.length, 27);
assert.equal(initial.selectedTemplateId, null);
assert.equal(initial.selection, null);
assert.deepEqual(initial.actions, LAFEA_TEMPLATE_WIZARD_ACTIONS);
assert.equal(initial.actions.selectionOnly, true);
for (const field of [
  'compilerInvocation',
  'engineExecution',
  'lifecycleRegistration',
  'parameterEntry',
  'releasePromotion',
  'workbenchImport',
]) {
  assert.equal(initial.actions[field], false);
}
assert.equal(initial.integrationIssue.issueNumber, 61);
assert.equal(Object.isFrozen(initial), true);

for (const templateId of LAFEA_T6A_SELECTION_TEMPLATE_IDS) {
  const model = createLafeaTemplateWizardModel({ selectedTemplateId: templateId });
  assert.equal(validateLafeaTemplateWizardModel(model).ok, true);
  assert.equal(validateLafeaTemplateWizardSelection(model.selection).ok, true);
  assert.equal(model.selection.templateId, templateId);
  assert.equal(model.selection.selectionAllowed, true);
  assert.equal(model.selection.compilerStatus, 'DRAFT_COMPILER_AVAILABLE');
  assert.equal(model.selection.executable, false);
  assert.equal(
    model.selection.integrationStatus,
    LAFEA_TEMPLATE_WIZARD_INTEGRATION_STATUS,
  );
  assert.match(model.selection.parameterSchemaSemanticHash, /^fnv1a64:[0-9a-f]{16}$/u);
  assert.equal(requireT6AParameterSchema(templateId).templateId, templateId);
  assert.equal(Object.isFrozen(model.selection), true);
}

const outsideRelease = createLafeaTemplateWizardModel({
  selectedTemplateId: 'C2D-BRACKET-GUSSET',
});
assert.equal(outsideRelease.selection.selectionAllowed, false);
assert.equal(outsideRelease.selection.compilerRoute, 'CONTINUUM_T4');
assert.equal(outsideRelease.selection.compilerStatus, 'COMPILER_OUTSIDE_T6A_RELEASE_SET');
assert.equal(outsideRelease.selection.executable, false);

const noCompiler = createLafeaTemplateWizardModel({
  selectedTemplateId: 'SHL-PIPE-LOCAL-PATCH',
});
assert.equal(noCompiler.selection.selectionAllowed, false);
assert.equal(noCompiler.selection.compilerRoute, 'UNAVAILABLE');
assert.equal(noCompiler.selection.compilerStatus, 'COMPILER_NOT_AVAILABLE');
assert.equal(noCompiler.selection.parameterSchemaSemanticHash, null);

const queryA = query({
  text: 'lug',
  applicationGroups: ['PIPE_SUPPORT', 'STRUCTURAL_LUG_BRACKET'],
  stageIds: ['LAFEA.5', 'LAFEA.3'],
});
const queryB = query({
  text: 'lug',
  applicationGroups: ['STRUCTURAL_LUG_BRACKET', 'PIPE_SUPPORT'],
  stageIds: ['LAFEA.3', 'LAFEA.5'],
});
assert.equal(queryA.semanticHash, queryB.semanticHash);
const filteredA = createLafeaTemplateWizardModel({ query: queryA });
const filteredB = createLafeaTemplateWizardModel({ query: queryB });
assert.equal(filteredA.semanticHash, filteredB.semanticHash);
assert.deepEqual(filteredA.matchedTemplateIds, filteredB.matchedTemplateIds);
assert.ok(filteredA.matchedTemplateIds.includes('C2D-LUG-PINHOLE'));

const stageThreeOnly = query({ stageIds: ['LAFEA.3'] });
assert.throws(
  () => createLafeaTemplateWizardModel({
    query: stageThreeOnly,
    selectedTemplateId: 'ALG-LOAD-REFERENCE-TRANSFER',
  }),
  /SELECTED_TEMPLATE_NOT_IN_QUERY_RESULT/u,
);

assert.throws(
  () => requireT6AParameterSchema('SHL-PIPE-LOCAL-PATCH'),
  /T6A parameter schema unavailable/u,
);

console.log(JSON.stringify({
  check: 'lafea-template-t6a-standalone-wizard',
  status: 'PASS',
  catalogTemplateCount: LAFEA_T6A_STANDALONE_CATALOG_MODEL.cards.length,
  preparationCandidateCount: LAFEA_T6A_SELECTION_TEMPLATE_IDS.length,
  executableTemplateCount: 0,
  parameterEntryPaths: 0,
  compilerInvocationPaths: 0,
  workbenchImportPaths: 0,
  engineExecutionPaths: 0,
  integrationIssue: 61,
}, null, 2));

function query(overrides) {
  return createLafeaTemplateCatalogQuery({
    text: null,
    applicationFamilies: [],
    applicationGroups: [],
    bucketIds: [],
    stageIds: [],
    engineStates: [],
    readinessStatuses: [],
    releaseStatuses: [],
    geometryClasses: [],
    benchmarkQualificationStatuses: [],
    assessmentProfileIds: [],
    executable: null,
    ...overrides,
  });
}
