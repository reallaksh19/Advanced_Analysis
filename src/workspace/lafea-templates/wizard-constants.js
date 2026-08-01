export const LAFEA_TEMPLATE_WIZARD_MODEL_SCHEMA =
  'lafea-template-wizard-model/v1';
export const LAFEA_TEMPLATE_WIZARD_SELECTION_SCHEMA =
  'lafea-template-wizard-selection/v1';

export const LAFEA_TEMPLATE_WIZARD_INTEGRATION_STATUS =
  'AGENT1_ACCESSORY_SEAM_REQUIRED';
export const LAFEA_TEMPLATE_WIZARD_ACTION_AUTHORITY =
  'READ_ONLY_PREPARATION';

export const LAFEA_TEMPLATE_WIZARD_COMPILER_ROUTES = Object.freeze([
  'ANALYTICAL_T3',
  'CONTINUUM_T4',
  'UNAVAILABLE',
]);

export const LAFEA_TEMPLATE_WIZARD_COMPILER_STATUSES = Object.freeze([
  'DRAFT_COMPILER_AVAILABLE',
  'COMPILER_OUTSIDE_T6A_RELEASE_SET',
  'COMPILER_NOT_AVAILABLE',
]);

export const LAFEA_TEMPLATE_WIZARD_SELECTION_KEYS = Object.freeze([
  'actionAuthority',
  'benchmarkQualificationStatus',
  'bucketId',
  'cardSemanticHash',
  'compilerRoute',
  'compilerStatus',
  'entryStageId',
  'executable',
  'integrationStatus',
  'limitations',
  'parameterSchemaId',
  'parameterSchemaSemanticHash',
  'readinessStatus',
  'releaseStatus',
  'schema',
  'selectionAllowed',
  'semanticHash',
  'templateId',
]);

export const LAFEA_TEMPLATE_WIZARD_MODEL_KEYS = Object.freeze([
  'actions',
  'catalogSemanticHash',
  'integrationIssue',
  'matchedTemplateIds',
  'query',
  'queryResultSemanticHash',
  'schema',
  'selectedTemplateId',
  'selection',
  'semanticHash',
  'summary',
]);

export const LAFEA_TEMPLATE_WIZARD_ACTIONS = Object.freeze({
  compilerInvocation: false,
  engineExecution: false,
  lifecycleRegistration: false,
  parameterEntry: false,
  releasePromotion: false,
  selectionOnly: true,
  workbenchImport: false,
});

export const LAFEA_TEMPLATE_WIZARD_STYLES = `
.lafea-template-wizard { display: grid; gap: 1rem; }
.lafea-template-wizard__header { display: grid; gap: .35rem; }
.lafea-template-wizard__filters { display: grid; grid-template-columns: minmax(14rem, 2fr) minmax(12rem, 1fr) minmax(10rem, 1fr); gap: .75rem; align-items: end; }
.lafea-template-wizard__filter { display: grid; gap: .25rem; }
.lafea-template-wizard__summary { display: flex; flex-wrap: wrap; gap: .75rem; }
.lafea-template-wizard__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: .75rem; }
.lafea-template-wizard__card { display: grid; gap: .5rem; border: 1px solid currentColor; border-radius: .4rem; padding: .85rem; }
.lafea-template-wizard__card[aria-current="true"] { outline: 2px solid currentColor; outline-offset: 2px; }
.lafea-template-wizard__meta { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: .25rem .65rem; }
.lafea-template-wizard__meta dt { font-weight: 600; }
.lafea-template-wizard__meta dd { margin: 0; }
.lafea-template-wizard__detail { display: grid; gap: .5rem; border-top: 1px solid currentColor; padding-top: .75rem; }
.lafea-template-wizard__notice { font-weight: 600; }
@media (max-width: 760px) {
  .lafea-template-wizard__filters { grid-template-columns: 1fr; }
}
`;
