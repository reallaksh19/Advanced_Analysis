import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { add, cross, dot, scale } from '../shared-analysis-contract/vector3.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { DOF_ORDER } from '../linear-fea-contract/conventions.js';
import { validateLinearPipingAnalysisResult } from '../linear-piping-analysis-consumer/index.js';
import {
  INTERFACE_ENVELOPE_SCHEMA,
  INTERFACE_RECOVERY_SCHEMA,
  REFERENCE_TRANSFER_FORMULA,
  REVERSED_INTERFACE_SIGN,
  compareAscii,
  failInterface,
  requireArray,
  requireHash,
} from './contracts.js';
import { requireLinearPipingInterfaceSet } from './interface-set.js';

export const SOLVER_REACTION_SIGN_CONVENTION = 'FORCE_ON_PIPE_FROM_INTERFACE';
export const INTERFACE_RECOVERY_INPUT_KEYS = Object.freeze([
  'interfaceSet', 'analysisResult', 'loadCase',
]);
export const INTERFACE_RECOVERY_KEYS = Object.freeze([
  'schema', 'interfaceSetSemanticHash', 'analysisResultSemanticHash', 'executionHash',
  'physicalLoadCaseHash', 'loadCaseId', 'units', 'results', 'status', 'semanticHash', 'evidenceHash',
]);
export const INTERFACE_RESULT_KEYS = Object.freeze([
  'interfaceId', 'interfaceKind', 'nodeId', 'frameSemanticHash', 'reportingSignConvention',
  'forceGlobal', 'momentAtNodeGlobal', 'forceLocal', 'momentAtNodeLocal',
  'momentAtReferenceLocal', 'referencePointGlobal', 'leverReferenceToNodeLocal',
  'sourceReactionDofs', 'formulaIds', 'semanticHash',
]);
export const INTERFACE_ENVELOPE_KEYS = Object.freeze([
  'schema', 'envelopeId', 'interfaceSetSemanticHash', 'recoverySemanticHashes',
  'interfaces', 'semanticHash', 'evidenceHash',
]);

export function recoverLinearPipingInterfaceLoads(input) {
  exactKeys(input, INTERFACE_RECOVERY_INPUT_KEYS, 'interfaceRecoveryInput');
  const interfaceSet = requireLinearPipingInterfaceSet(input.interfaceSet);
  const analysisResult = validateLinearPipingAnalysisResult(input.analysisResult);
  const loadCase = requirePhysicalLoadCase(input.loadCase);
  requireCurrentParents(interfaceSet, analysisResult, loadCase);

  const reactions = new Map(
    analysisResult.execution.reactions.map((row) => [`${row.nodeId}:${row.dof}`, row.value]),
  );
  const results = interfaceSet.interfaces
    .map((definition) => recoverDefinition(definition, reactions))
    .sort((left, right) => compareAscii(left.interfaceId, right.interfaceId));
  const draft = {
    schema: INTERFACE_RECOVERY_SCHEMA,
    interfaceSetSemanticHash: interfaceSet.semanticHash,
    analysisResultSemanticHash: analysisResult.semanticHash,
    executionHash: analysisResult.execution.executionHash,
    physicalLoadCaseHash: loadCase.physicalLoadCaseHash,
    loadCaseId: loadCase.loadCaseId,
    units: interfaceSet.units,
    results,
    status: analysisResult.status,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInterfaceRecoverySemanticHash(draft);
  draft.evidenceHash = computeInterfaceRecoveryEvidenceHash(draft);
  return requireLinearPipingInterfaceRecovery(draft);
}

function recoverDefinition(definition, reactions) {
  const values = Object.fromEntries(DOF_ORDER.map((dof) => [dof, 0]));
  const sourceReactionDofs = definition.dofMappings.map((mapping) => {
    const key = `${definition.nodeId}:${mapping.dof}`;
    if (!reactions.has(key)) {
      failInterface(`Execution does not contain reaction ${key}.`, 'PIPING_INTERFACE_REACTION_MISSING');
    }
    values[mapping.dof] = reactions.get(key);
    return { dof: mapping.dof, value: reactions.get(key) };
  });

  const signFactor = definition.reportingSignConvention === SOLVER_REACTION_SIGN_CONVENTION ? 1 : -1;
  const forceGlobal = vector(
    signFactor * values.UX,
    signFactor * values.UY,
    signFactor * values.UZ,
  );
  const momentAtNodeGlobal = vector(
    signFactor * values.RX,
    signFactor * values.RY,
    signFactor * values.RZ,
  );
  const forceLocal = projectToLocal(forceGlobal, definition.basis);
  const momentAtNodeLocal = projectToLocal(momentAtNodeGlobal, definition.basis);
  const momentAtReferenceLocal = add(
    momentAtNodeLocal,
    cross(definition.leverReferenceToNodeLocal, forceLocal),
  );
  const draft = {
    interfaceId: definition.interfaceId,
    interfaceKind: definition.interfaceKind,
    nodeId: definition.nodeId,
    frameSemanticHash: semanticHash(definition.basis),
    reportingSignConvention: definition.reportingSignConvention,
    forceGlobal,
    momentAtNodeGlobal,
    forceLocal,
    momentAtNodeLocal,
    momentAtReferenceLocal,
    referencePointGlobal: definition.referencePointGlobal,
    leverReferenceToNodeLocal: definition.leverReferenceToNodeLocal,
    sourceReactionDofs: sourceReactionDofs
      .map((row) => ({ ...row, value: signFactor * row.value }))
      .sort((left, right) => DOF_ORDER.indexOf(left.dof) - DOF_ORDER.indexOf(right.dof)),
    formulaIds: Object.freeze([
      'GLOBAL_REACTION_COMPONENT_GROUPING_BY_DECLARED_INTERFACE',
      'ORTHONORMAL_GLOBAL_TO_LOCAL_PROJECTION',
      REFERENCE_TRANSFER_FORMULA,
    ]),
    semanticHash: '',
  };
  draft.semanticHash = semanticHash(interfaceResultProjection(draft));
  return deepFreeze(draft);
}

export function createLinearPipingInterfaceEnvelope(input) {
  exactKeys(input, ['envelopeId', 'recoveries'], 'interfaceEnvelopeInput');
  const envelopeId = nonEmptyString(input.envelopeId, 'interfaceEnvelopeInput.envelopeId');
  const recoveries = requireArray(input.recoveries, 'interfaceEnvelopeInput.recoveries')
    .map(requireLinearPipingInterfaceRecovery)
    .sort((left, right) => compareAscii(left.loadCaseId, right.loadCaseId));
  if (recoveries.length === 0) {
    failInterface('interfaceEnvelopeInput.recoveries must not be empty.', 'PIPING_INTERFACE_ENVELOPE_EMPTY');
  }
  const interfaceSetSemanticHash = recoveries[0].interfaceSetSemanticHash;
  if (recoveries.some((row) => row.interfaceSetSemanticHash !== interfaceSetSemanticHash)) {
    failInterface('Envelope recoveries must use one interface set.', 'PIPING_INTERFACE_ENVELOPE_PARENT_MISMATCH');
  }
  const ids = recoveries[0].results.map((row) => row.interfaceId);
  for (const recovery of recoveries) {
    if (JSON.stringify(recovery.results.map((row) => row.interfaceId)) !== JSON.stringify(ids)) {
      failInterface('Envelope recoveries have different interface identities.', 'PIPING_INTERFACE_ENVELOPE_PARENT_MISMATCH');
    }
  }
  const interfaces = ids.map((interfaceId) => envelopeForInterface(interfaceId, recoveries));
  const draft = {
    schema: INTERFACE_ENVELOPE_SCHEMA,
    envelopeId,
    interfaceSetSemanticHash,
    recoverySemanticHashes: recoveries.map((row) => row.semanticHash).sort(compareAscii),
    interfaces,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(envelopeSemanticProjection(draft));
  draft.evidenceHash = semanticHash({
    semanticHash: draft.semanticHash,
    governingCases: interfaces,
  });
  return requireLinearPipingInterfaceEnvelope(draft);
}

function envelopeForInterface(interfaceId, recoveries) {
  const rows = recoveries.map((recovery) => ({
    loadCaseId: recovery.loadCaseId,
    recoverySemanticHash: recovery.semanticHash,
    result: recovery.results.find((entry) => entry.interfaceId === interfaceId),
  }));
  const components = {};
  for (const [group, field] of [
    ['forceLocal', 'forceLocal'],
    ['momentAtReferenceLocal', 'momentAtReferenceLocal'],
  ]) {
    components[group] = {};
    for (const component of ['x', 'y', 'z']) {
      const candidates = rows.map((row) => ({
        value: row.result[field][component],
        absoluteValue: Math.abs(row.result[field][component]),
        loadCaseId: row.loadCaseId,
        recoverySemanticHash: row.recoverySemanticHash,
      })).sort((left, right) => (
        right.absoluteValue - left.absoluteValue
        || compareAscii(left.loadCaseId, right.loadCaseId)
        || compareAscii(left.recoverySemanticHash, right.recoverySemanticHash)
      ));
      components[group][component] = deepFreeze(candidates[0]);
    }
    components[group] = deepFreeze(components[group]);
  }
  return deepFreeze({ interfaceId, components: deepFreeze(components) });
}

function requireCurrentParents(interfaceSet, analysisResult, loadCase) {
  if (interfaceSet.mechanicalModelSemanticHash !== analysisResult.parents.mechanicalModelSemanticHash
    || interfaceSet.stiffnessStateHash !== analysisResult.parents.stiffnessStateHash) {
    failInterface('Interface set is stale against the analysis result.', 'PIPING_INTERFACE_RESULT_STALE');
  }
  if (loadCase.physicalLoadCaseHash !== analysisResult.parents.physicalLoadCaseHash) {
    failInterface('Physical load case is stale against the analysis result.', 'PIPING_INTERFACE_RESULT_STALE');
  }
  if (analysisResult.execution.status === 'BLOCKED') {
    failInterface('Blocked execution cannot produce interface loads.', 'PIPING_INTERFACE_EXECUTION_BLOCKED');
  }
}

function projectToLocal(vectorGlobal, basis) {
  return vector(
    dot(vectorGlobal, basis.e1),
    dot(vectorGlobal, basis.e2),
    dot(vectorGlobal, basis.e3),
  );
}

function vector(x, y, z) {
  return deepFreeze({
    x: Object.is(x, -0) ? 0 : x,
    y: Object.is(y, -0) ? 0 : y,
    z: Object.is(z, -0) ? 0 : z,
  });
}

function interfaceResultProjection(record) {
  const { semanticHash: _semanticHash, ...projection } = record;
  return projection;
}

export function computeInterfaceRecoverySemanticHash(record) {
  return semanticHash({
    schema: record.schema,
    interfaceSetSemanticHash: record.interfaceSetSemanticHash,
    analysisResultSemanticHash: record.analysisResultSemanticHash,
    executionHash: record.executionHash,
    physicalLoadCaseHash: record.physicalLoadCaseHash,
    loadCaseId: record.loadCaseId,
    units: record.units,
    results: record.results.map((row) => ({ interfaceId: row.interfaceId, semanticHash: row.semanticHash })),
    status: record.status,
  });
}

export function computeInterfaceRecoveryEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    sourceReactionDofs: record.results.map((row) => ({
      interfaceId: row.interfaceId,
      sourceReactionDofs: row.sourceReactionDofs,
      formulaIds: row.formulaIds,
    })),
  });
}

export function requireLinearPipingInterfaceRecovery(record) {
  exactKeys(record, INTERFACE_RECOVERY_KEYS, 'interfaceRecovery');
  if (record.schema !== INTERFACE_RECOVERY_SCHEMA) {
    failInterface(`interfaceRecovery.schema must be ${INTERFACE_RECOVERY_SCHEMA}.`, 'PIPING_INTERFACE_RECOVERY_INVALID');
  }
  for (const field of [
    'interfaceSetSemanticHash', 'analysisResultSemanticHash', 'executionHash',
    'physicalLoadCaseHash', 'semanticHash', 'evidenceHash',
  ]) requireHash(record[field], `interfaceRecovery.${field}`);
  nonEmptyString(record.loadCaseId, 'interfaceRecovery.loadCaseId');
  requireArray(record.results, 'interfaceRecovery.results');
  for (const [index, result] of record.results.entries()) {
    exactKeys(result, INTERFACE_RESULT_KEYS, `interfaceRecovery.results[${index}]`);
    if (result.semanticHash !== semanticHash(interfaceResultProjection(result))) {
      failInterface('Interface result semantic hash is stale.', 'PIPING_INTERFACE_HASH_MISMATCH');
    }
  }
  if (record.semanticHash !== computeInterfaceRecoverySemanticHash(record)
    || record.evidenceHash !== computeInterfaceRecoveryEvidenceHash(record)) {
    failInterface('Interface recovery hashes are stale.', 'PIPING_INTERFACE_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}

function envelopeSemanticProjection(record) {
  const { semanticHash: _semanticHash, evidenceHash: _evidenceHash, ...projection } = record;
  return projection;
}

export function requireLinearPipingInterfaceEnvelope(record) {
  exactKeys(record, INTERFACE_ENVELOPE_KEYS, 'interfaceEnvelope');
  if (record.schema !== INTERFACE_ENVELOPE_SCHEMA) {
    failInterface(`interfaceEnvelope.schema must be ${INTERFACE_ENVELOPE_SCHEMA}.`, 'PIPING_INTERFACE_ENVELOPE_INVALID');
  }
  nonEmptyString(record.envelopeId, 'interfaceEnvelope.envelopeId');
  requireHash(record.interfaceSetSemanticHash, 'interfaceEnvelope.interfaceSetSemanticHash');
  requireArray(record.recoverySemanticHashes, 'interfaceEnvelope.recoverySemanticHashes')
    .forEach((hash, index) => requireHash(hash, `interfaceEnvelope.recoverySemanticHashes[${index}]`));
  requireArray(record.interfaces, 'interfaceEnvelope.interfaces');
  if (record.semanticHash !== semanticHash(envelopeSemanticProjection(record))) {
    failInterface('Interface envelope semantic hash is stale.', 'PIPING_INTERFACE_HASH_MISMATCH');
  }
  if (record.evidenceHash !== semanticHash({ semanticHash: record.semanticHash, governingCases: record.interfaces })) {
    failInterface('Interface envelope evidence hash is stale.', 'PIPING_INTERFACE_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}

export function reverseInterfaceResultSign(result) {
  const factor = -1;
  const draft = {
    ...result,
    reportingSignConvention: REVERSED_INTERFACE_SIGN[result.reportingSignConvention],
    forceGlobal: scale(result.forceGlobal, factor),
    momentAtNodeGlobal: scale(result.momentAtNodeGlobal, factor),
    forceLocal: scale(result.forceLocal, factor),
    momentAtNodeLocal: scale(result.momentAtNodeLocal, factor),
    momentAtReferenceLocal: scale(result.momentAtReferenceLocal, factor),
    sourceReactionDofs: result.sourceReactionDofs.map((row) => ({ ...row, value: -row.value })),
    semanticHash: '',
  };
  draft.semanticHash = semanticHash(interfaceResultProjection(draft));
  return deepFreeze(draft);
}
