import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireMechanicalModelCompilation } from '../linear-fea-model-compiler/index.js';
import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { EXECUTION_RECORD_KEYS, requireSolverExecution } from '../linear-fea-solver/index.js';
import { requireFrameElement } from '../linear-fea-frame-element/index.js';
import { requirePipingComponent } from '../linear-fea-piping-components/index.js';
import { gatherJointDisplacement12, recoverElementEndAction } from './element-end-actions.js';
import { recoverElementForceField } from './force-field.js';
import { recoverComponentCodePoint } from './code-points.js';
import {
  CODE_POINT_INTERPOLATION_METHOD,
  CODE_POINT_RESULTANT_KEYS,
  CODE_POINT_CONSISTENCY_KEYS,
  COMPONENT_RESULTANT_KEYS,
  ELEMENT_ACTION_KEYS,
  END_ACTION_PAIR_KEYS,
  FORCE_FIELD_KEYS,
  FORCE_FIELD_METHOD,
  FORCE_FIELD_STATION_KEYS,
  LOCAL_ACTION_FIELDS,
  RECOVERY_PROFILE_ID,
  RECOVERY_RECORD_KEYS,
  RECOVERY_SCHEMA,
  compareAscii,
  fail,
  requireArray,
  requireExactKeys,
  requireFinite,
  requireHash,
  requireIdentity,
  requireMember,
  requireRecoveryProfile,
} from './recovery-contract.js';

const CODE = 'RECOVERY_INVALID';

function requireLocalActionRecord(value, field) {
  requireExactKeys(value, LOCAL_ACTION_FIELDS, field, CODE);
  for (const key of LOCAL_ACTION_FIELDS) requireFinite(value[key], `${field}.${key}`, CODE);
  return value;
}

function requireEndActionPair(value, field) {
  requireExactKeys(value, END_ACTION_PAIR_KEYS, field, CODE);
  requireLocalActionRecord(value.I, `${field}.I`);
  requireLocalActionRecord(value.J, `${field}.J`);
  return value;
}

/**
 * Bind execution status and identity cross-checks (section 2.1 identity
 * chain, section 9 fail-closed refusal of an unqualified execution).
 */
function requireBoundInputs({ compilation, execution, loadCase }) {
  if (execution.mechanicalModelSemanticHash !== compilation.mechanicalModelSemanticHash
    || execution.stiffnessStateHash !== compilation.stiffnessStateHash) {
    fail(
      'execution does not cite the same mechanical model compilation supplied for recovery; recovery reads back the exact model an execution was solved against, never a different one.',
      'RECOVERY_EXECUTION_MODEL_MISMATCH',
    );
  }
  if (execution.physicalLoadCaseHash !== loadCase.physicalLoadCaseHash) {
    fail(
      'execution.physicalLoadCaseHash does not match the supplied physical load case; recovery needs the exact load case an execution was solved against to reconstruct distributed-load force fields.',
      'RECOVERY_EXECUTION_LOAD_CASE_MISMATCH',
    );
  }
  if (execution.status === 'BLOCKED') {
    fail(
      'execution.status is BLOCKED; a blocked execution has no reaction or displacement worth recovering, and recovery refuses it rather than reporting evidence built on an unqualified solve.',
      'RECOVERY_EXECUTION_BLOCKED',
    );
  }
}

/** Register every supplied frame element and piping-component element by
 * `elementId`, re-verified through its own package's validator, and require
 * that the bound mechanical model's own element list is covered exactly once
 * — the same discipline B-3.3's assembly applies to element contributions. */
function buildElementRegistry({ compilation, frameElements, pipingComponents }) {
  const registry = new Map();
  const componentByComponentId = new Map();

  const register = (elementId, entry) => {
    if (registry.has(elementId)) {
      fail(`Element ${elementId} was supplied more than once across frameElements/pipingComponents.`, 'RECOVERY_ELEMENT_DUPLICATE');
    }
    registry.set(elementId, entry);
  };

  for (const candidate of frameElements) {
    const accepted = requireFrameElement(candidate);
    register(accepted.elementId, {
      frameElementRecord: accepted,
      effectiveLocalStiffness: accepted.localStiffness,
      ownerComponentId: null,
    });
  }
  for (const candidate of pipingComponents) {
    const accepted = requirePipingComponent(candidate);
    componentByComponentId.set(accepted.componentId, accepted);
    for (const entry of accepted.elements) {
      register(entry.elementId, {
        frameElementRecord: entry.frameElement,
        effectiveLocalStiffness: entry.effectiveLocalStiffness,
        ownerComponentId: accepted.componentId,
      });
    }
  }

  const modelElementsById = new Map(compilation.model.elements.map((element) => [element.elementId, element]));
  for (const element of compilation.model.elements) {
    if (!registry.has(element.elementId)) {
      fail(
        `Model element ${element.elementId} has no supplied frame element or piping-component contribution to recover from.`,
        'RECOVERY_ELEMENT_MISSING',
      );
    }
  }
  return { registry, modelElementsById, componentByComponentId };
}

function buildDisplacementIndex(execution) {
  const index = new Map();
  for (const entry of execution.displacement) index.set(`${entry.nodeId}:${entry.dof}`, entry.value);
  return index;
}

/** Combine a declared load basis into global components — the same
 * combination `solve.js` performs when it scatters NODAL_FORCE_MOMENT
 * primitives into the assembled load vector (not reused by import since it
 * is a private helper there; the operation itself is generic basis
 * composition, not a re-derivation of any stiffness or transformation). */
function combineBasisComponents(basis, components) {
  if (basis.kind === 'GLOBAL') return components;
  const { e1, e2, e3 } = basis;
  const [a, b, c] = components;
  return [
    e1.x * a + e2.x * b + e3.x * c,
    e1.y * a + e2.y * b + e3.y * c,
    e1.z * a + e2.z * b + e3.z * c,
  ];
}

/** Sum every NODAL_FORCE_MOMENT primitive's global components per node, so
 * the code-point consistency check can fold in a real external load applied
 * directly at an internal chain node instead of assuming it is always zero. */
function buildNodalLoadIndex(loadCase) {
  const index = new Map();
  for (const primitive of loadCase.primitives) {
    if (primitive.kind !== 'NODAL_FORCE_MOMENT') continue;
    const [fx, fy, fz] = combineBasisComponents(primitive.basis, [primitive.force.fx, primitive.force.fy, primitive.force.fz]);
    const [mx, my, mz] = combineBasisComponents(primitive.basis, [primitive.moment.mx, primitive.moment.my, primitive.moment.mz]);
    const existing = index.get(primitive.nodeId) ?? { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
    index.set(primitive.nodeId, {
      fx: existing.fx + fx, fy: existing.fy + fy, fz: existing.fz + fz,
      mx: existing.mx + mx, my: existing.my + my, mz: existing.mz + mz,
    });
  }
  return index;
}

/**
 * LFEA-B3.4 exit boundary: recover element end actions, element force
 * fields and component code-point resultants from one sealed
 * `fea-linear-execution/v1` (B-3.3), the B-3.1/B-3.2 element evidence it was
 * assembled from and the B-3.0 physical load case it was solved against,
 * into a sealed `fea-linear-recovery/v1` record (sections 9, 9.1).
 *
 * @param {object} args
 * @param {Readonly<object>} args.compilation Sealed `fea-linear-mechanical-model-compilation/v1`.
 * @param {Readonly<object>} args.execution Sealed `fea-linear-execution/v1`, QUALIFIED or CONDITIONAL.
 * @param {Readonly<object>} args.loadCase Sealed `fea-linear-physical-load-case/v1`, the one the execution was solved against.
 * @param {Array<object>} args.frameElements Sealed `fea-linear-frame-element/v1` records for every bare model element.
 * @param {Array<object>} [args.pipingComponents] Sealed `fea-linear-piping-component/v1` records for every model element generated by a component.
 * @param {Readonly<object>} args.recoveryProfile Sealed `fea-linear-recovery-profile/v1`.
 * @returns {Readonly<object>} Sealed `fea-linear-recovery/v1`.
 */
export function compileResultRecovery({
  compilation,
  execution,
  loadCase,
  frameElements,
  pipingComponents = [],
  recoveryProfile,
}) {
  const acceptedCompilation = requireMechanicalModelCompilation(compilation);
  /*
   * `compileSolverExecution` returns its sealed `fea-linear-execution/v1`
   * plus non-hashed reuse/diagnostic fields (`factorizationHandle` and
   * friends) that are never part of the execution's own exact-key contract.
   * Project down to `EXECUTION_RECORD_KEYS` before re-validating, so callers
   * can pass that return value straight through without stripping it first.
   */
  const executionRecord = Object.fromEntries(EXECUTION_RECORD_KEYS.map((key) => [key, execution[key]]));
  const acceptedExecution = requireSolverExecution(executionRecord);
  const acceptedLoadCase = requirePhysicalLoadCase(loadCase);
  const acceptedProfile = requireRecoveryProfile(recoveryProfile);
  requireBoundInputs({ compilation: acceptedCompilation, execution: acceptedExecution, loadCase: acceptedLoadCase });

  const stationCount = acceptedProfile.elementForceStationsPerSpan.value;
  const consistencyTolerance = acceptedProfile.codePointConsistencyTolerance.value;

  const { registry, modelElementsById, componentByComponentId } = buildElementRegistry({
    compilation: acceptedCompilation,
    frameElements,
    pipingComponents,
  });
  const displacementIndex = buildDisplacementIndex(acceptedExecution);
  const loadCasePrimitivesById = new Map(acceptedLoadCase.primitives.map((primitive) => [primitive.primitiveId, primitive]));

  const orderedElementIds = [...registry.keys()].sort(compareAscii);
  const elementActions = [];
  const forceFields = [];
  const actionByElementId = new Map();

  for (const elementId of orderedElementIds) {
    const { frameElementRecord, effectiveLocalStiffness, ownerComponentId } = registry.get(elementId);
    const modelElement = modelElementsById.get(elementId);
    const jointDisplacement12 = gatherJointDisplacement12(displacementIndex, modelElement.nodeI, modelElement.nodeJ);
    const recovered = recoverElementEndAction({ frameElementRecord, effectiveLocalStiffness, jointDisplacement12 });
    actionByElementId.set(elementId, { local: recovered.local, global: recovered.global });
    elementActions.push({
      elementId,
      ownerComponentId,
      local: recovered.local,
      global: recovered.global,
    });
    forceFields.push({
      elementId,
      ownerComponentId,
      ...recoverElementForceField({
        frameElementRecord,
        qLocal: recovered.qLocal,
        loadCasePrimitivesById,
        stationCount,
      }),
    });
  }

  const nodalLoadByNode = buildNodalLoadIndex(acceptedLoadCase);
  const componentResultants = [...componentByComponentId.keys()].sort(compareAscii).map((componentId) => {
    const component = componentByComponentId.get(componentId);
    const componentElementIds = component.elements.map((entry) => entry.elementId);
    const codePoints = component.codeStations.map((station) => recoverComponentCodePoint({
      station,
      componentElementIds,
      modelElementsById,
      actionByElementId,
      nodalLoadByNode,
      tolerance: consistencyTolerance,
    }));
    return { componentId, componentType: component.componentType, codePoints };
  });

  const draft = {
    schema: RECOVERY_SCHEMA,
    profileId: RECOVERY_PROFILE_ID,
    recoveryProfileSemanticHash: acceptedProfile.semanticHash,
    modelIdentity: acceptedExecution.modelIdentity,
    modelRevision: acceptedExecution.modelRevision,
    mechanicalModelSemanticHash: acceptedExecution.mechanicalModelSemanticHash,
    stiffnessStateHash: acceptedExecution.stiffnessStateHash,
    physicalLoadCaseHash: acceptedExecution.physicalLoadCaseHash,
    executionHash: acceptedExecution.executionHash,
    executionStatus: acceptedExecution.status,
    elementActions,
    forceFields,
    componentResultants,
    recoveryHash: '',
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeRecoverySemanticHash(draft);
  draft.recoveryHash = draft.semanticHash;
  draft.evidenceHash = computeRecoveryEvidenceHash(draft);
  return requireResultRecovery(draft);
}

/**
 * Project every declared field except the three hash fields whose value
 * depends on this very projection. `recoveryHash` in particular must never
 * feed its own hash input — a self-referential projection recomputes to a
 * different value the moment the draft's empty-string placeholder is
 * replaced by the real hash, which is exactly the false "stale hash" defect
 * a prior LFEA package shipped with.
 */
export function recoverySemanticProjection(record) {
  const projection = {};
  for (const key of RECOVERY_RECORD_KEYS) {
    if (key === 'semanticHash' || key === 'evidenceHash' || key === 'recoveryHash') continue;
    projection[key] = record[key];
  }
  return projection;
}

export function computeRecoverySemanticHash(record) {
  return semanticHash(recoverySemanticProjection(record));
}

export function computeRecoveryEvidenceHash(record) {
  return semanticHash({ semanticHash: record.semanticHash, executionStatus: record.executionStatus });
}

function requireForceFieldStation(entry, field) {
  requireExactKeys(entry, FORCE_FIELD_STATION_KEYS, field, CODE);
  if (!Number.isInteger(entry.index) || entry.index < 0) fail(`${field}.index must be a non-negative integer.`, CODE);
  requireFinite(entry.fraction, `${field}.fraction`, CODE);
  requireFinite(entry.position, `${field}.position`, CODE);
  requireLocalActionRecord(entry.action, `${field}.action`);
}

function requireCodePointConsistency(entry, field) {
  if (entry === null) return;
  requireExactKeys(entry, CODE_POINT_CONSISTENCY_KEYS, field, CODE);
  requireIdentity(entry.comparedElementId, `${field}.comparedElementId`, CODE);
  requireMember(entry.comparedEnd, ['I', 'J'], `${field}.comparedEnd`, CODE);
  requireFinite(entry.residual, `${field}.residual`, CODE);
  requireFinite(entry.tolerance, `${field}.tolerance`, CODE);
  if (typeof entry.withinTolerance !== 'boolean') fail(`${field}.withinTolerance must be boolean.`, CODE);
}

/**
 * Re-accept a sealed `fea-linear-recovery/v1` record: exact keys, structural
 * completeness of every element action / force field / code-point resultant,
 * and a semantic hash that still matches the content.
 */
export function requireResultRecovery(record) {
  requireExactKeys(record, RECOVERY_RECORD_KEYS, 'recovery', CODE);
  if (record.schema !== RECOVERY_SCHEMA) fail(`recovery.schema must be ${RECOVERY_SCHEMA}.`, CODE);
  if (record.profileId !== RECOVERY_PROFILE_ID) fail(`recovery.profileId must be ${RECOVERY_PROFILE_ID}.`, CODE);
  for (const field of [
    'recoveryProfileSemanticHash', 'mechanicalModelSemanticHash', 'stiffnessStateHash',
    'physicalLoadCaseHash', 'executionHash', 'recoveryHash', 'semanticHash', 'evidenceHash',
  ]) {
    requireHash(record[field], `recovery.${field}`, CODE);
  }
  requireIdentity(record.modelIdentity, 'recovery.modelIdentity', CODE);
  requireMember(record.executionStatus, ['QUALIFIED', 'CONDITIONAL'], 'recovery.executionStatus', CODE);

  requireArray(record.elementActions, 'recovery.elementActions', CODE);
  record.elementActions.forEach((entry, index) => {
    const field = `recovery.elementActions[${index}]`;
    requireExactKeys(entry, ELEMENT_ACTION_KEYS, field, CODE);
    requireIdentity(entry.elementId, `${field}.elementId`, CODE);
    if (entry.ownerComponentId !== null) requireIdentity(entry.ownerComponentId, `${field}.ownerComponentId`, CODE);
    requireEndActionPair(entry.local, `${field}.local`);
    requireEndActionPair(entry.global, `${field}.global`);
  });

  requireArray(record.forceFields, 'recovery.forceFields', CODE);
  record.forceFields.forEach((entry, index) => {
    const field = `recovery.forceFields[${index}]`;
    requireExactKeys(entry, FORCE_FIELD_KEYS, field, CODE);
    requireIdentity(entry.elementId, `${field}.elementId`, CODE);
    if (entry.ownerComponentId !== null) requireIdentity(entry.ownerComponentId, `${field}.ownerComponentId`, CODE);
    if (entry.method !== FORCE_FIELD_METHOD) fail(`${field}.method must be ${FORCE_FIELD_METHOD}.`, CODE);
    requireFinite(entry.length, `${field}.length`, CODE);
    requireArray(entry.stations, `${field}.stations`, CODE);
    if (entry.stations.length < 2) fail(`${field}.stations must carry at least two stations.`, CODE);
    entry.stations.forEach((station, stationIndex) => requireForceFieldStation(station, `${field}.stations[${stationIndex}]`));
  });

  requireArray(record.componentResultants, 'recovery.componentResultants', CODE);
  record.componentResultants.forEach((entry, index) => {
    const field = `recovery.componentResultants[${index}]`;
    requireExactKeys(entry, COMPONENT_RESULTANT_KEYS, field, CODE);
    requireIdentity(entry.componentId, `${field}.componentId`, CODE);
    requireArray(entry.codePoints, `${field}.codePoints`, CODE);
    entry.codePoints.forEach((point, pointIndex) => {
      const pointField = `${field}.codePoints[${pointIndex}]`;
      requireExactKeys(point, CODE_POINT_RESULTANT_KEYS, pointField, CODE);
      requireIdentity(point.elementId, `${pointField}.elementId`, CODE);
      requireMember(point.end, ['I', 'J'], `${pointField}.end`, CODE);
      if (point.method !== CODE_POINT_INTERPOLATION_METHOD) fail(`${pointField}.method must be ${CODE_POINT_INTERPOLATION_METHOD}.`, CODE);
      requireLocalActionRecord(point.local, `${pointField}.local`);
      requireLocalActionRecord(point.global, `${pointField}.global`);
      requireCodePointConsistency(point.consistency, `${pointField}.consistency`);
    });
  });

  if (record.recoveryHash !== record.semanticHash) fail('recovery.recoveryHash must equal recovery.semanticHash.', CODE);
  if (record.semanticHash !== computeRecoverySemanticHash(record)) fail('recovery.semanticHash is stale.', 'RECOVERY_HASH_MISMATCH');
  if (record.evidenceHash !== computeRecoveryEvidenceHash(record)) fail('recovery.evidenceHash is stale.', 'RECOVERY_HASH_MISMATCH');

  return deepFreeze({ ...record });
}
