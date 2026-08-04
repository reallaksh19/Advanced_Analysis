import os from 'node:os';
import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';

export const NON_FEA_ENVIRONMENT_EVIDENCE_SCHEMA = 'non-fea-environment-evidence/v1';

export function createNonFeaEnvironmentEvidence(env = process.env) {
  const cpuModels = [...new Set(os.cpus().map((cpu) => String(cpu.model || '').trim()).filter(Boolean))].sort(codeUnitCompare);
  return deepFreeze({
    schema: NON_FEA_ENVIRONMENT_EVIDENCE_SCHEMA,
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    cpuCount: os.cpus().length,
    cpuModels,
    totalMemoryBytes: os.totalmem(),
    logicalConcurrency: Number.isInteger(os.availableParallelism?.()) ? os.availableParallelism() : os.cpus().length,
    ci: normalizedBoolean(env.CI),
    timezone: typeof env.TZ === 'string' && env.TZ.trim() ? env.TZ.trim() : null,
    language: typeof env.LANG === 'string' && env.LANG.trim() ? env.LANG.trim() : null,
    nodeOptions: typeof env.NODE_OPTIONS === 'string' && env.NODE_OPTIONS.trim() ? env.NODE_OPTIONS.trim() : null,
  });
}

function normalizedBoolean(value) {
  if (value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(text)) return true;
  if (['0', 'false', 'no', ''].includes(text)) return false;
  return null;
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
