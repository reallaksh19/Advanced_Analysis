import { LafeaProfileContractError } from './errors.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';

/**
 * The 8-link engineering hash lineage spec §3 requires:
 *
 *   sourceSemanticHash -> compiledModelSemanticHash -> meshSemanticHash ->
 *   loadCaseSemanticHash -> executionSemanticHash -> recoverySemanticHash ->
 *   codeAssessmentSemanticHash -> evidenceHash
 *
 * "Changing display scale, contour palette, camera state or selected object
 * shall not alter engineering hashes. Changing mesh sizing, formulation,
 * material state, load case, SCL placement, stress classification or code
 * profile shall alter the appropriate engineering identity."
 */
export const HASH_LINEAGE_ORDER = Object.freeze([
  'sourceSemanticHash',
  'compiledModelSemanticHash',
  'meshSemanticHash',
  'loadCaseSemanticHash',
  'executionSemanticHash',
  'recoverySemanticHash',
  'codeAssessmentSemanticHash',
  'evidenceHash',
]);

/**
 * The catalogue of change kinds this contract can classify. Each maps to the
 * first lineage link it invalidates, or `null` for a display-only change that
 * must leave every engineering hash untouched.
 */
export const CHANGE_KINDS = Object.freeze({
  DISPLAY_CONTOUR_PALETTE: 'DISPLAY_CONTOUR_PALETTE',
  DISPLAY_CAMERA_STATE: 'DISPLAY_CAMERA_STATE',
  DISPLAY_SELECTION: 'DISPLAY_SELECTION',
  DISPLAY_SCALE: 'DISPLAY_SCALE',
  DISPLAY_UNIT_FORMATTING: 'DISPLAY_UNIT_FORMATTING',
  SOURCE_GEOMETRY_EDIT: 'SOURCE_GEOMETRY_EDIT',
  MATERIAL_STATE_EDIT: 'MATERIAL_STATE_EDIT',
  MESH_DENSITY_EDIT: 'MESH_DENSITY_EDIT',
  MESH_FORMULATION_EDIT: 'MESH_FORMULATION_EDIT',
  LOAD_CASE_EDIT: 'LOAD_CASE_EDIT',
  BOUNDARY_CONDITION_EDIT: 'BOUNDARY_CONDITION_EDIT',
  SOLVER_BACKEND_EDIT: 'SOLVER_BACKEND_EDIT',
  RECOVERY_METHOD_EDIT: 'RECOVERY_METHOD_EDIT',
  SCL_PLACEMENT_EDIT: 'SCL_PLACEMENT_EDIT',
  STRESS_CLASSIFICATION_EDIT: 'STRESS_CLASSIFICATION_EDIT',
  CODE_PROFILE_EDIT: 'CODE_PROFILE_EDIT',
});

const FIRST_IMPACTED_LINK = Object.freeze({
  [CHANGE_KINDS.DISPLAY_CONTOUR_PALETTE]: null,
  [CHANGE_KINDS.DISPLAY_CAMERA_STATE]: null,
  [CHANGE_KINDS.DISPLAY_SELECTION]: null,
  [CHANGE_KINDS.DISPLAY_SCALE]: null,
  [CHANGE_KINDS.DISPLAY_UNIT_FORMATTING]: null,
  [CHANGE_KINDS.SOURCE_GEOMETRY_EDIT]: 'sourceSemanticHash',
  [CHANGE_KINDS.MATERIAL_STATE_EDIT]: 'compiledModelSemanticHash',
  [CHANGE_KINDS.MESH_DENSITY_EDIT]: 'meshSemanticHash',
  [CHANGE_KINDS.MESH_FORMULATION_EDIT]: 'meshSemanticHash',
  [CHANGE_KINDS.LOAD_CASE_EDIT]: 'loadCaseSemanticHash',
  [CHANGE_KINDS.BOUNDARY_CONDITION_EDIT]: 'loadCaseSemanticHash',
  [CHANGE_KINDS.SOLVER_BACKEND_EDIT]: 'executionSemanticHash',
  [CHANGE_KINDS.RECOVERY_METHOD_EDIT]: 'recoverySemanticHash',
  [CHANGE_KINDS.SCL_PLACEMENT_EDIT]: 'codeAssessmentSemanticHash',
  [CHANGE_KINDS.STRESS_CLASSIFICATION_EDIT]: 'codeAssessmentSemanticHash',
  [CHANGE_KINDS.CODE_PROFILE_EDIT]: 'codeAssessmentSemanticHash',
});

export function canonicalHashLineage(source) {
  exactKeys(source, HASH_LINEAGE_ORDER, 'hashLineage');
  const lineage = {};
  for (const link of HASH_LINEAGE_ORDER) lineage[link] = nonEmptyString(source[link], `hashLineage.${link}`);
  return Object.freeze(lineage);
}

export function isDisplayOnlyChange(changeKind) {
  return FIRST_IMPACTED_LINK[requireKnownChangeKind(changeKind)] === null;
}

export function isEngineeringHashImpacted(changeKind) {
  return !isDisplayOnlyChange(changeKind);
}

/**
 * The ordered slice of lineage links a change kind invalidates: the link it
 * first touches and every link downstream of it, since each link's hash is
 * defined in terms of everything upstream of it.
 *
 * @param {string} changeKind One of `CHANGE_KINDS`.
 * @returns {readonly string[]} Impacted links, in lineage order.
 */
export function impactedLineageLinks(changeKind) {
  const first = FIRST_IMPACTED_LINK[requireKnownChangeKind(changeKind)];
  if (first === null) return Object.freeze([]);
  const startIndex = HASH_LINEAGE_ORDER.indexOf(first);
  return Object.freeze(HASH_LINEAGE_ORDER.slice(startIndex));
}

/**
 * Apply one classified change to a prior lineage, producing the next one.
 *
 * Fails closed in both directions: every impacted link must actually change,
 * and no non-impacted link may change — this is the executable form of "no
 * display-only change may alter an engineering hash; no declared engineering
 * change may leave its hash untouched."
 *
 * @param {Readonly<object>} priorLineage Prior canonical lineage.
 * @param {string} changeKind One of `CHANGE_KINDS`.
 * @param {Record<string,string>} nextHashes New hash values for each impacted
 *        link (empty object for a display-only change).
 * @returns {Readonly<object>} Next canonical lineage.
 */
export function applyLineageChange(priorLineage, changeKind, nextHashes) {
  const prior = canonicalHashLineage(priorLineage);
  const impacted = impactedLineageLinks(changeKind);
  exactKeys(nextHashes ?? {}, impacted, `hashLineage change ${changeKind}`);
  const draft = { ...prior };
  for (const link of impacted) {
    const value = nonEmptyString(nextHashes[link], `hashLineage.${link}`);
    if (value === prior[link]) {
      throw new LafeaProfileContractError(`${link} must change for ${changeKind}`, 'HASH_NOT_UPDATED');
    }
    draft[link] = value;
  }
  for (const link of HASH_LINEAGE_ORDER) {
    if (!impacted.includes(link) && draft[link] !== prior[link]) {
      throw new LafeaProfileContractError(`${link} must not change for ${changeKind}`, 'HASH_UNEXPECTEDLY_CHANGED');
    }
  }
  return canonicalHashLineage(draft);
}

function requireKnownChangeKind(changeKind) {
  if (!(changeKind in FIRST_IMPACTED_LINK)) {
    throw new LafeaProfileContractError(`Unknown hash-lineage change kind: ${changeKind}`, 'UNSUPPORTED_VALUE');
  }
  return changeKind;
}
