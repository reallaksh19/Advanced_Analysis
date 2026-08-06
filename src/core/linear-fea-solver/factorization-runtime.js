import { INACTIVE_ANALYSIS_DOF_BEHAVIOR } from '../linear-fea-contract/model-schema.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { assembleGlobalSystem } from './assembly.js';
import { buildDofMap } from './dof-map.js';
import { factorizeFreePartition } from './factorization.js';
import { createFactorizationCache, getOrFactorize } from './reuse-cache.js';
import { requireSolverProfile, resolveSolverPolicies } from './solver-contract.js';

export const LINEAR_FACTORIZATION_RUNTIME_SCHEMA = 'fea-linear-factorization-runtime/v1';

const runtimeRegistry = new WeakSet();

export function createLinearFactorizationRuntime({
  compilation,
  elementContributions,
  solverProfile,
}) {
  const acceptedCompilation = requireMechanicalModelCompilation(compilation);
  const acceptedProfile = requireSolverProfile(solverProfile);
  const policies = resolveSolverPolicies(acceptedProfile);
  const model = acceptedCompilation.model;
  const dofMap = buildDofMap(model);
  const assembly = assembleGlobalSystem({
    model,
    dofMap,
    elementContributions,
    backend: acceptedProfile.backend,
  });
  const factorization = factorizeFreePartition({
    model,
    dofMap,
    assembly,
    policies,
    backend: acceptedProfile.backend,
  });
  const cacheKey = `${acceptedCompilation.stiffnessStateHash}:${assembly.partitionHash}`;
  const factorizationCache = createFactorizationCache();
  const seeded = getOrFactorize(
    factorizationCache,
    cacheKey,
    acceptedProfile.backend,
    () => factorization,
  );
  if (seeded.reused || seeded.factorization !== factorization) {
    throw new TypeError('Linear factorization runtime cache seed is inconsistent.');
  }

  const publicRecord = {
    schema: LINEAR_FACTORIZATION_RUNTIME_SCHEMA,
    runtimeId: '',
    profileId: acceptedProfile.profileId,
    solverProfileSemanticHash: acceptedProfile.semanticHash,
    mechanicalModelSemanticHash: acceptedCompilation.mechanicalModelSemanticHash,
    stiffnessStateHash: acceptedCompilation.stiffnessStateHash,
    dofMapSemanticHash: dofMap.semanticHash,
    partitionHash: assembly.partitionHash,
    stiffnessAssemblyHash: semanticHash({
      dofCount: assembly.n,
      triplets: assembly.triplets,
      partitionHash: assembly.partitionHash,
    }),
    cacheKey,
    backend: acceptedProfile.backend,
    assembly: assemblyEvidence(assembly),
    factorization: factorizationEvidence(factorization),
    handleDisposition: 'CREATED_RUNTIME_ONLY',
    runtimeHash: '',
  };
  publicRecord.runtimeId = `LFR-${semanticHash(runtimeIdentityProjection(publicRecord))}`;
  publicRecord.runtimeHash = semanticHash(runtimeProjection(publicRecord));
  Object.defineProperties(publicRecord, {
    factorizationCache: {
      value: factorizationCache,
      enumerable: false,
      configurable: false,
      writable: false,
    },
    factorizationHandle: {
      value: factorization,
      enumerable: false,
      configurable: false,
      writable: false,
    },
  });
  runtimeRegistry.add(publicRecord);
  return Object.freeze(publicRecord);
}

export function requireLinearFactorizationRuntime(value, expected) {
  if (!value || value.schema !== LINEAR_FACTORIZATION_RUNTIME_SCHEMA
    || !runtimeRegistry.has(value)) {
    throw new TypeError('Linear factorization runtime was not created by the runtime authority.');
  }
  if (value.runtimeHash !== semanticHash(runtimeProjection(value))) {
    throw new TypeError('Linear factorization runtime public identity is stale.');
  }
  if (!(value.factorizationCache instanceof Map) || !value.factorizationHandle) {
    throw new TypeError('Linear factorization runtime handle is unavailable.');
  }
  const accepted = expected ?? {};
  if (accepted.compilation) {
    const compilation = requireMechanicalModelCompilation(accepted.compilation);
    if (value.mechanicalModelSemanticHash !== compilation.mechanicalModelSemanticHash
      || value.stiffnessStateHash !== compilation.stiffnessStateHash) {
      throw new TypeError('Linear factorization runtime is stale for the supplied model compilation.');
    }
  }
  if (accepted.solverProfile) {
    const profile = requireSolverProfile(accepted.solverProfile);
    if (value.solverProfileSemanticHash !== profile.semanticHash
      || value.backend !== profile.backend) {
      throw new TypeError('Linear factorization runtime is stale for the supplied solver profile.');
    }
  }
  if (accepted.stiffnessAssemblyHash
    && value.stiffnessAssemblyHash !== accepted.stiffnessAssemblyHash) {
    throw new TypeError('Linear factorization runtime stiffness assembly is stale.');
  }
  return value;
}

export function factorizationCacheFromRuntime(value, expected) {
  return requireLinearFactorizationRuntime(value, expected).factorizationCache;
}

function assemblyEvidence(assembly) {
  const inactiveDofCount = assembly.constrained.filter(
    (entry) => entry.behavior === INACTIVE_ANALYSIS_DOF_BEHAVIOR,
  ).length;
  return Object.freeze({
    tripletCount: assembly.tripletCount,
    lowerTriangleNonzeroCount: assembly.lowerTriangleNonzeroCount,
    elementCount: assembly.elementCount,
    springCount: assembly.springCount,
    constrainedDofCount: assembly.constrained.length - inactiveDofCount,
    inactiveDofCount,
    freeDofCount: assembly.freeIndices.length,
    symmetryResidual: assembly.symmetryResidual,
    partitionHash: assembly.partitionHash,
  });
}

function factorizationEvidence(factorization) {
  const factors = factorization.scaling.factors;
  return Object.freeze({
    backend: factorization.backend,
    scaling: factorization.scaling.scalingId,
    kind: factorization.kind,
    pivotStatistics: Object.freeze({ ...factorization.pivotStatistics }),
    conditionEstimate: factorization.conditionEstimate,
    conditionEstimateMethod: factorization.conditionEstimateMethod,
    conditionEstimateEvidence: Object.freeze(structuredClone(
      factorization.conditionEstimateEvidence,
    )),
    scaleFactorSummary: Object.freeze({
      count: factors.length,
      minimum: Math.min(...factors),
      maximum: Math.max(...factors),
    }),
  });
}

function runtimeIdentityProjection(value) {
  return {
    schema: value.schema,
    solverProfileSemanticHash: value.solverProfileSemanticHash,
    mechanicalModelSemanticHash: value.mechanicalModelSemanticHash,
    stiffnessStateHash: value.stiffnessStateHash,
    partitionHash: value.partitionHash,
    stiffnessAssemblyHash: value.stiffnessAssemblyHash,
  };
}

function runtimeProjection(value) {
  return {
    ...runtimeIdentityProjection(value),
    runtimeId: value.runtimeId,
    profileId: value.profileId,
    dofMapSemanticHash: value.dofMapSemanticHash,
    cacheKey: value.cacheKey,
    backend: value.backend,
    assembly: value.assembly,
    factorization: value.factorization,
    handleDisposition: value.handleDisposition,
  };
}
