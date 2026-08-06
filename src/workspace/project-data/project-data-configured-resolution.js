import {
  createConfiguredResolutionSession,
  normalizeConfiguredDefaults,
} from '../../core/empirical-piping-mechanics/configured-resolution.js';
import { semanticHash } from '../../core/empirical-piping-mechanics/identity.js';
import { freezeDeep } from '../dataset-utils.js';
import {
  projectDataEntry,
  projectDataValue,
  upgradeProjectDataProfile,
  validateProjectDataProfile,
} from './project-data-contract.js';

export const PROJECT_DATA_CONFIGURED_DEFAULTS_AUTHORITY_SCHEMA =
  'project-data-configured-defaults-authority/v1';

const PROJECT_DATA_PATHS = Object.freeze({
  resolutionPolicy: 'engineeringCalculationDefaults.resolutionPolicy',
  dimensionVerificationTolerancesMm:
    'engineeringCalculationDefaults.dimensionVerificationTolerancesMm',
  configuredDefaults: 'engineeringCalculationDefaults.configuredDefaults',
});

/**
 * Converts approved Project Data into a calculation-ready configured-default
 * authority. It never reads the benchmark defaults package directly.
 */
export function resolveProjectDataConfiguredDefaultsAuthority(profile) {
  const normalizedProfile = upgradeProjectDataProfile(profile);
  const audit = validateProjectDataProfile(
    normalizedProfile,
    'nonFeaPipingDefaults',
    null,
  );
  const profileSemanticHash = normalizedProfile?.schema
    ? semanticHash(normalizedProfile)
    : null;

  if (!audit.valid) {
    return freezeDeep({
      schema: PROJECT_DATA_CONFIGURED_DEFAULTS_AUTHORITY_SCHEMA,
      status: 'BLOCKED_INVALID_PROJECT_DATA',
      projectId: normalizedProfile?.projectId ?? null,
      projectDataRevision: normalizedProfile?.revision ?? null,
      projectDataSemanticHash: profileSemanticHash,
      projectDataPaths: PROJECT_DATA_PATHS,
      resolutionPolicy: null,
      dimensionVerificationTolerancesMm: null,
      configuredDefaults: Object.freeze([]),
      evidence: null,
      blockers: audit.errors,
      summary: freezeDeep({
        configuredDefaultCount: 0,
        enabledConfiguredDefaultCount: 0,
        blockedCount: audit.errors.length,
      }),
    });
  }

  let configuredDefaults;
  try {
    configuredDefaults = normalizeConfiguredDefaults(
      projectDataValue(normalizedProfile, PROJECT_DATA_PATHS.configuredDefaults),
    );
  } catch (error) {
    return freezeDeep({
      schema: PROJECT_DATA_CONFIGURED_DEFAULTS_AUTHORITY_SCHEMA,
      status: 'BLOCKED_INVALID_PROJECT_DATA',
      projectId: normalizedProfile.projectId,
      projectDataRevision: normalizedProfile.revision,
      projectDataSemanticHash: profileSemanticHash,
      projectDataPaths: PROJECT_DATA_PATHS,
      resolutionPolicy: projectDataValue(
        normalizedProfile,
        PROJECT_DATA_PATHS.resolutionPolicy,
      ),
      dimensionVerificationTolerancesMm: projectDataValue(
        normalizedProfile,
        PROJECT_DATA_PATHS.dimensionVerificationTolerancesMm,
      ),
      configuredDefaults: Object.freeze([]),
      evidence: null,
      blockers: Object.freeze([{
        path: PROJECT_DATA_PATHS.configuredDefaults,
        code: 'INVALID_CONFIGURED_DEFAULTS',
        message: error instanceof Error ? error.message : String(error),
      }]),
      summary: freezeDeep({
        configuredDefaultCount: 0,
        enabledConfiguredDefaultCount: 0,
        blockedCount: 1,
      }),
    });
  }
  const authorityValue = {
    schema: PROJECT_DATA_CONFIGURED_DEFAULTS_AUTHORITY_SCHEMA,
    status: 'READY',
    projectId: normalizedProfile.projectId,
    projectDataRevision: normalizedProfile.revision,
    projectDataSemanticHash: profileSemanticHash,
    projectDataPaths: PROJECT_DATA_PATHS,
    resolutionPolicy: projectDataValue(
      normalizedProfile,
      PROJECT_DATA_PATHS.resolutionPolicy,
    ),
    dimensionVerificationTolerancesMm: projectDataValue(
      normalizedProfile,
      PROJECT_DATA_PATHS.dimensionVerificationTolerancesMm,
    ),
    configuredDefaults,
    evidence: freezeDeep({
      resolutionPolicy: projectDataEntry(
        normalizedProfile,
        PROJECT_DATA_PATHS.resolutionPolicy,
      )?.evidence ?? null,
      dimensionVerificationTolerancesMm: projectDataEntry(
        normalizedProfile,
        PROJECT_DATA_PATHS.dimensionVerificationTolerancesMm,
      )?.evidence ?? null,
      configuredDefaults: projectDataEntry(
        normalizedProfile,
        PROJECT_DATA_PATHS.configuredDefaults,
      )?.evidence ?? null,
    }),
    blockers: Object.freeze([]),
    summary: freezeDeep({
      configuredDefaultCount: configuredDefaults.length,
      enabledConfiguredDefaultCount: configuredDefaults.filter(
        (record) => record.enabled,
      ).length,
      blockedCount: 0,
    }),
  };
  return freezeDeep({
    ...authorityValue,
    semanticIdentity: semanticHash(authorityValue),
  });
}

/**
 * Creates the generic resolution session only when the Project Data authority
 * is approved and structurally valid. Callers receive a governed blocker
 * object instead of a partially configured session.
 */
export function createConfiguredResolutionSessionFromProjectData(profile) {
  const authority = resolveProjectDataConfiguredDefaultsAuthority(profile);
  if (authority.status !== 'READY') {
    return freezeDeep({
      status: authority.status,
      authority,
      session: null,
    });
  }
  const coreSession = createConfiguredResolutionSession({
    projectDataRevision: authority.projectDataRevision,
    projectDataSemanticHash: authority.projectDataSemanticHash,
    defaults: authority.configuredDefaults,
  });
  return freezeDeep({
    status: 'READY',
    authority,
    session: bindSessionToProjectData(coreSession, authority),
  });
}

function bindSessionToProjectData(coreSession, authority) {
  const path = authority.projectDataPaths.configuredDefaults;
  return Object.freeze({
    resolve(request) {
      return bindResolution(coreSession.resolve(request), authority, path);
    },
    receipt() {
      const coreReceipt = coreSession.receipt();
      const value = {
        ...coreReceipt,
        projectDataPath: path,
        resolutionPolicy: authority.resolutionPolicy,
        projectDataAuthoritySemanticIdentity: authority.semanticIdentity,
        configuredDefaultUsages: Object.freeze(coreReceipt.configuredDefaultUsages.map((usage) =>
          bindUsage(usage, authority, path))),
        resolutions: Object.freeze(coreReceipt.resolutions.map((resolution) =>
          bindResolution(resolution, authority, path))),
      };
      delete value.semanticIdentity;
      return freezeDeep({ ...value, semanticIdentity: semanticHash(value) });
    },
  });
}

function bindResolution(resolution, authority, path) {
  if (resolution?.kind !== 'PROJECT_CONFIGURED_DEFAULT') return resolution;
  const definition = authority.configuredDefaults.find(
    (record) => record.id === resolution.authority,
  );
  return freezeDeep({
    ...resolution,
    sourcePath: `ProjectData.${path}:${resolution.authority}`,
    projectDataPath: path,
    projectDataAuthoritySemanticIdentity: authority.semanticIdentity,
    defaultDefinitionSemanticIdentity: definition ? semanticHash(definition) : null,
  });
}

function bindUsage(usage, authority, path) {
  const definition = authority.configuredDefaults.find(
    (record) => record.id === usage.defaultId,
  );
  return freezeDeep({
    ...usage,
    projectDataPath: path,
    projectDataAuthoritySemanticIdentity: authority.semanticIdentity,
    defaultDefinitionSemanticIdentity: definition ? semanticHash(definition) : null,
  });
}
