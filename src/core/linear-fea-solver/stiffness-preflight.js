import { INACTIVE_ANALYSIS_DOF_BEHAVIOR } from '../linear-fea-contract/model-schema.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import { assembleGlobalSystem } from './assembly.js';
import { buildDofMap, requireDofMap } from './dof-map.js';
import { factorizeFreePartition } from './factorization.js';
import { connectedComponents, detectFloatingComponents } from './mechanism-diagnostics.js';
import { conditioningReport } from './qualification.js';
import {
  LinearSolverError,
  requireSolverProfile,
  resolveSolverPolicies,
} from './solver-contract.js';

export const LINEAR_STIFFNESS_PREFLIGHT_SCHEMA = 'fea-linear-stiffness-preflight/v1';
export const LINEAR_STIFFNESS_PREFLIGHT_STATUSES = Object.freeze([
  'QUALIFIED',
  'CONDITIONAL',
  'BLOCKED',
]);

export function compileLinearStiffnessPreflight({ compilation, elementContributions, solverProfile }) {
  const acceptedCompilation = requireMechanicalModelCompilation(compilation);
  const acceptedProfile = requireSolverProfile(solverProfile);
  const policies = resolveSolverPolicies(acceptedProfile);
  const model = acceptedCompilation.model;
  const dofMap = buildDofMap(model);
  const assembled = assembleGlobalSystem({
    model,
    dofMap,
    elementContributions,
    backend: acceptedProfile.backend,
  });
  const components = componentDiagnostics(model);
  const findings = [];
  const factorization = factorizationEvidence({
    model,
    dofMap,
    assembly: assembled,
    policies,
    backend: acceptedProfile.backend,
    findings,
  });
  if (factorization.status === 'PASS') {
    const conditioning = conditioningReport(factorization.conditionEstimate, policies);
    if (conditioning.status !== 'PASS') {
      findings.push(finding({
        code: conditioning.status === 'BLOCK'
          ? 'LINEAR_STIFFNESS_CONDITION_BLOCKED'
          : 'LINEAR_STIFFNESS_CONDITION_WARNING',
        disposition: conditioning.status,
        message: `Constrained stiffness condition estimate ${conditioning.value} is judged ${conditioning.status}.`,
        evidence: conditioning,
      }));
    }
  }
  findings.sort((left, right) => compareAscii(left.findingId, right.findingId));
  const status = statusOf(findings);
  const assembly = assemblyEvidence(assembled);
  const draft = {
    schema: LINEAR_STIFFNESS_PREFLIGHT_SCHEMA,
    profileId: acceptedProfile.profileId,
    solverProfileSemanticHash: acceptedProfile.semanticHash,
    mechanicalModelSemanticHash: acceptedCompilation.mechanicalModelSemanticHash,
    stiffnessStateHash: acceptedCompilation.stiffnessStateHash,
    dofMap,
    components,
    assembly,
    factorization,
    findings,
    status,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(preflightSemanticProjection(draft));
  draft.evidenceHash = semanticHash({
    semanticHash: draft.semanticHash,
    findings: draft.findings,
    status: draft.status,
  });
  return requireLinearStiffnessPreflight(draft);
}

export function requireLinearStiffnessPreflight(value) {
  if (!isPlainRecord(value) || value.schema !== LINEAR_STIFFNESS_PREFLIGHT_SCHEMA) {
    throw new TypeError('Linear stiffness preflight schema is invalid.');
  }
  requireDofMap(value.dofMap);
  if (!LINEAR_STIFFNESS_PREFLIGHT_STATUSES.includes(value.status)
    || !Array.isArray(value.components) || value.components.length === 0
    || !Array.isArray(value.findings)
    || !isPlainRecord(value.assembly) || !isPlainRecord(value.factorization)) {
    throw new TypeError('Linear stiffness preflight record is malformed.');
  }
  if (value.semanticHash !== semanticHash(preflightSemanticProjection(value))) {
    throw new TypeError('Linear stiffness preflight semantic hash mismatch.');
  }
  if (value.evidenceHash !== semanticHash({
    semanticHash: value.semanticHash,
    findings: value.findings,
    status: value.status,
  })) {
    throw new TypeError('Linear stiffness preflight evidence hash mismatch.');
  }
  assertNoRuntimeFactors(value.factorization);
  return deepFreeze({ ...value });
}

export function preflightSemanticProjection(value) {
  return {
    schema: value.schema,
    profileId: value.profileId,
    solverProfileSemanticHash: value.solverProfileSemanticHash,
    mechanicalModelSemanticHash: value.mechanicalModelSemanticHash,
    stiffnessStateHash: value.stiffnessStateHash,
    dofMap: value.dofMap,
    components: value.components,
    assembly: value.assembly,
    factorization: value.factorization,
    findings: value.findings,
    status: value.status,
  };
}

function factorizationEvidence({ model, dofMap, assembly, policies, backend, findings }) {
  try {
    const result = factorizeFreePartition({ model, dofMap, assembly, policies, backend });
    const factors = result.scaling.factors;
    return Object.freeze({
      status: 'PASS',
      backend: result.backend,
      scaling: result.scaling.scalingId,
      kind: result.kind,
      pivotStatistics: Object.freeze({ ...result.pivotStatistics }),
      conditionEstimate: result.conditionEstimate,
      conditionEstimateMethod: result.conditionEstimateMethod,
      conditionEstimateEvidence: Object.freeze(structuredClone(result.conditionEstimateEvidence)),
      scaleFactorSummary: Object.freeze({
        count: factors.length,
        minimum: factors.length === 0 ? null : Math.min(...factors),
        maximum: factors.length === 0 ? null : Math.max(...factors),
      }),
      errorCode: null,
      errorMessage: null,
      handleDisposition: 'DISCARDED_AFTER_PREFLIGHT',
    });
  } catch (error) {
    if (!(error instanceof LinearSolverError)) throw error;
    const evidence = {
      solverErrorCode: error.code,
      floatingComponents: detectFloatingComponents(model),
      freeDofCount: assembly.freeIndices.length,
      partitionHash: assembly.partitionHash,
    };
    findings.push(finding({
      code: error.code,
      disposition: 'BLOCK',
      message: error.message,
      evidence,
    }));
    return Object.freeze({
      status: 'BLOCK',
      backend,
      scaling: null,
      kind: null,
      pivotStatistics: null,
      conditionEstimate: null,
      conditionEstimateMethod: null,
      conditionEstimateEvidence: Object.freeze({}),
      scaleFactorSummary: Object.freeze({ count: 0, minimum: null, maximum: null }),
      errorCode: error.code,
      errorMessage: error.message,
      handleDisposition: 'NOT_CREATED',
    });
  }
}

function componentDiagnostics(model) {
  const floating = new Set(detectFloatingComponents(model).map((row) => row.componentId));
  return Object.freeze(connectedComponents(model).map((component) => {
    const nodes = new Set(component.nodeIds);
    const constraints = model.constraints
      .filter((constraint) => nodes.has(constraint.nodeId))
      .sort((left, right) => compareAscii(left.constraintId, right.constraintId));
    const inactiveCount = constraints.filter(
      (constraint) => constraint.behavior === INACTIVE_ANALYSIS_DOF_BEHAVIOR,
    ).length;
    return Object.freeze({
      componentId: component.componentId,
      nodeIds: Object.freeze([...component.nodeIds]),
      constraintIds: Object.freeze(constraints.map((row) => row.constraintId)),
      physicalConstraintCount: constraints.length - inactiveCount,
      analysisInactiveDofCount: inactiveCount,
      floating: floating.has(component.componentId),
    });
  }));
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

function finding({ code, disposition, message, evidence }) {
  return Object.freeze({
    findingId: `LSP:${code}:${semanticHash(evidence)}`,
    code,
    disposition,
    message,
    evidence: Object.freeze(structuredClone(evidence)),
  });
}

function statusOf(findings) {
  if (findings.some((row) => row.disposition === 'BLOCK')) return 'BLOCKED';
  if (findings.some((row) => row.disposition === 'WARN')) return 'CONDITIONAL';
  return 'QUALIFIED';
}

function assertNoRuntimeFactors(value) {
  const forbidden = new Set(['L', 'D', 'sparseFactor', 'sparseFreeMatrix', 'K', 'sparseK']);
  const visit = (candidate, path) => {
    if (candidate === null || typeof candidate !== 'object') return;
    for (const [key, child] of Object.entries(candidate)) {
      if (forbidden.has(key)) {
        throw new TypeError(`Linear stiffness preflight retains forbidden runtime field ${path}.${key}.`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value, 'factorization');
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
