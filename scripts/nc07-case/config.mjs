import { deepFreeze, semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
import { ASSESSMENT_BASIS, REGISTERED_INPUT, UNCERTAINTY } from '../nc06-package/config.mjs';
export const SYNTHETIC_CASE_ID = 'SYNTH-NC07-DENT-001';
export const SYNTHETIC_CASE = deepFreeze({
  schema: 'lafea-nc07-synthetic-case-definition/v2',
  id: SYNTHETIC_CASE_ID,
  caseNature: 'SYNTHETIC_NON_PHYSICAL_DEMONSTRATION_ONLY',
  assetId: 'SYNTHETIC-ASSET-DT40',
  defectId: 'SYNTHETIC-DENT-PER004',
  assessmentBasisId: ASSESSMENT_BASIS.id,
  qualifiedCellId: 'NC05-CELL-DT40-LD2-PER0.04',
  inputSourceClass: 'DETERMINISTIC_GENERATED_REGISTERED_CELL_VALUES',
  input: REGISTERED_INPUT,
  uncertainty: UNCERTAINTY,
  limitations: [
    'no physical asset is represented', 'no field measurement is represented',
    'no external code compliance is claimed', 'no fitness-for-service decision is made',
    'no remaining-strength or failure-pressure authority is granted',
    'no production or automatic acceptance authority is granted',
  ],
});
export const CASE_DEFINITION_HASH = semanticHash(SYNTHETIC_CASE);
