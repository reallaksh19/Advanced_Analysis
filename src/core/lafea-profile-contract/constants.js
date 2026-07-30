/**
 * The seven profile kinds spec §15 requires ("all numerical behavior shall be
 * controlled by exact-key-validated, versioned profiles"). Field names below
 * match the spec's own illustrative configuration JSON; the spec explicitly
 * notes final field names may differ, but no listed authority may be hidden —
 * these are that authority, made concrete.
 */
export const PROFILE_KINDS = Object.freeze({
  GEOMETRY: 'geometryProfile',
  MESH: 'meshProfile',
  SOLVER: 'solverProfile',
  RECOVERY: 'recoveryProfile',
  CONVERGENCE: 'convergenceProfile',
  CODE: 'codeProfile',
  OUTPUT: 'outputProfile',
});

export const PROFILE_SCHEMA_IDS = Object.freeze({
  [PROFILE_KINDS.GEOMETRY]: 'lafea-geometry-profile/v1',
  [PROFILE_KINDS.MESH]: 'lafea-mesh-profile/v1',
  [PROFILE_KINDS.SOLVER]: 'lafea-solver-profile/v1',
  [PROFILE_KINDS.RECOVERY]: 'lafea-recovery-profile/v1',
  [PROFILE_KINDS.CONVERGENCE]: 'lafea-convergence-profile/v1',
  [PROFILE_KINDS.CODE]: 'lafea-code-profile/v1',
  [PROFILE_KINDS.OUTPUT]: 'lafea-output-profile/v1',
});

/**
 * Every profile carries these four envelope fields (spec §15.1: "Every
 * profile has schema, profile ID, semantic hash and source revision") wrapped
 * around its kind-specific `fields` record.
 */
export const PROFILE_ENVELOPE_FIELDS = Object.freeze([
  'schema',
  'profileIdentity',
  'sourceRevision',
  'fields',
  'semanticHash',
]);

export const SHELL_SURFACES = Object.freeze(['BOTTOM', 'MIDDLE', 'TOP']);

export const CODE_ASSESSMENT_METHODS = Object.freeze(['ELASTIC_STRESS_ANALYSIS']);
