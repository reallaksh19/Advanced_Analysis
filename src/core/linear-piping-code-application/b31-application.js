import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { exactKeys, nonEmptyString } from '../shared-analysis-contract/validation.js';
import { requirePhysicalLoadCase } from '../linear-fea-load-case/index.js';
import { requireResultRecovery } from '../linear-fea-result-recovery/index.js';
import {
  compileCodeResult,
  requireCodeProfile,
  requireCodeResult,
  requireEditionDataset,
} from '../linear-fea-b31-code-engine/index.js';
import {
  B31_APPLICATION_REQUEST_SCHEMA,
  B31_APPLICATION_SCHEMA,
  compareAscii,
  failCodeApplication,
  requireArray,
  requireHash,
} from './contracts.js';
import { resolvePressureStressContribution } from './pressure-stress-derivation.js';

export const B31_APPLICATION_INPUT_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'codeProfile',
  'editionDataset',
  'cases',
  'checks',
]);
export const B31_CASE_KEYS = Object.freeze(['caseId', 'loadCase', 'recovery']);
export const B31_CHECK_KEYS = Object.freeze([
  'checkId',
  'category',
  'codePointId',
  'componentId',
  'combinationId',
  'actionSource',
  'frameElementRecord',
  'sectionResolution',
  'sustainedSectionResolution',
  'materialResolution',
  'stressFactorSet',
  'pressureStressContribution',
  'coldTemperature',
  'sustainedStress',
  'occasionalCategoryId',
]);
export const B31_APPLICATION_KEYS = Object.freeze([
  'schema',
  'applicationId',
  'codeProfileSemanticHash',
  'editionDatasetSemanticHash',
  'caseBindings',
  'results',
  'status',
  'semanticHash',
  'evidenceHash',
]);
export const B31_CASE_BINDING_KEYS = Object.freeze([
  'caseId',
  'physicalLoadCaseHash',
  'recoverySemanticHash',
  'recoveryEvidenceHash',
  'executionHash',
  'mechanicalModelSemanticHash',
  'stiffnessStateHash',
]);
export const B31_RESULT_ENTRY_KEYS = Object.freeze([
  'checkId',
  'actionSource',
  'sourceRecoveryHashes',
  'codeResult',
]);

const SINGLE_CASE_SOURCE_KEYS = Object.freeze(['kind', 'caseId']);
const RANGE_SOURCE_KEYS = Object.freeze(['kind', 'fromCaseId', 'toCaseId']);
const LOCAL_ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const IMPLEMENTED_CATEGORIES = Object.freeze([
  'SUSTAINED',
  'OCCASIONAL',
  'DISPLACEMENT_STRESS_RANGE',
  'EXPANSION_RANGE_ENVELOPE',
]);
const RANGE_CATEGORIES = Object.freeze([
  'DISPLACEMENT_STRESS_RANGE',
  'EXPANSION_RANGE_ENVELOPE',
]);

export function compileLinearPipingB31Application(input) {
  exactKeys(input, B31_APPLICATION_INPUT_KEYS, 'b31ApplicationInput');
  if (input.schema !== B31_APPLICATION_REQUEST_SCHEMA) {
    failCodeApplication(
      `b31ApplicationInput.schema must be ${B31_APPLICATION_REQUEST_SCHEMA}.`,
      'PIPING_B31_APPLICATION_INPUT_INVALID',
    );
  }
  const applicationId = nonEmptyString(input.applicationId, 'b31ApplicationInput.applicationId');
  const codeProfile = requireCodeProfile(input.codeProfile);
  const editionDataset = requireEditionDataset(input.editionDataset);
  const cases = canonicalCases(input.cases);
  const caseIndex = new Map(cases.map((entry) => [entry.caseId, entry]));
  const results = requireArray(input.checks, 'b31ApplicationInput.checks')
    .map((check, index) => compileCheck(check, index, caseIndex, codeProfile, editionDataset))
    .sort((left, right) => compareAscii(left.checkId, right.checkId));
  if (results.length === 0) {
    failCodeApplication('B31 application requires at least one code check.', 'PIPING_B31_APPLICATION_EMPTY');
  }
  requireUnique(results.map((row) => row.checkId), 'PIPING_B31_CHECK_ID_DUPLICATE');

  const draft = {
    schema: B31_APPLICATION_SCHEMA,
    applicationId,
    codeProfileSemanticHash: codeProfile.semanticHash,
    editionDatasetSemanticHash: editionDataset.semanticHash,
    caseBindings: cases.map(caseBinding),
    results,
    status: results.some((row) => row.codeResult.status === 'CONDITIONAL')
      ? 'CONDITIONAL'
      : 'QUALIFIED',
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = semanticHash(b31ApplicationSemanticProjection(draft));
  draft.evidenceHash = computeB31ApplicationEvidenceHash(draft);
  return requireLinearPipingB31Application(draft);
}

function canonicalCases(source) {
  const accepted = requireArray(source, 'b31ApplicationInput.cases').map((entry, index) => {
    const field = `b31ApplicationInput.cases[${index}]`;
    exactKeys(entry, B31_CASE_KEYS, field);
    const caseId = nonEmptyString(entry.caseId, `${field}.caseId`);
    const loadCase = requirePhysicalLoadCase(entry.loadCase);
    const recovery = requireResultRecovery(entry.recovery);
    if (recovery.physicalLoadCaseHash !== loadCase.physicalLoadCaseHash) {
      failCodeApplication(
        `${field}.recovery does not belong to the supplied physical load case.`,
        'PIPING_B31_CASE_PARENT_MISMATCH',
      );
    }
    return deepFreeze({ caseId, loadCase, recovery });
  }).sort((left, right) => compareAscii(left.caseId, right.caseId));
  if (accepted.length === 0) {
    failCodeApplication('B31 application requires at least one physical case.', 'PIPING_B31_CASES_EMPTY');
  }
  requireUnique(accepted.map((row) => row.caseId), 'PIPING_B31_CASE_ID_DUPLICATE');
  return accepted;
}

function compileCheck(source, index, caseIndex, codeProfile, editionDataset) {
  const field = `b31ApplicationInput.checks[${index}]`;
  const acceptedSource = {
    sustainedSectionResolution: null,
    sustainedStress: null,
    ...source,
  };
  exactKeys(acceptedSource, B31_CHECK_KEYS, field);
  const checkId = nonEmptyString(acceptedSource.checkId, `${field}.checkId`);
  const category = acceptedSource.category;
  if (!IMPLEMENTED_CATEGORIES.includes(category)) {
    failCodeApplication(`${field}.category is unsupported.`, 'PIPING_B31_CATEGORY_UNSUPPORTED');
  }
  const actionSource = canonicalActionSource(acceptedSource.actionSource, category, field);
  const resolved = resolveAction(
    actionSource,
    acceptedSource.componentId,
    acceptedSource.codePointId,
    caseIndex,
  );
  const pressureStressContribution = RANGE_CATEGORIES.includes(category)
    ? acceptedSource.pressureStressContribution
    : resolvePressureStressContribution({
      loadCase: requireCase(caseIndex, actionSource.caseId).loadCase,
      frameElementRecord: acceptedSource.frameElementRecord,
      sectionResolution: acceptedSource.sectionResolution,
      suppliedContribution: acceptedSource.pressureStressContribution,
    });
  const codeResult = compileCodeResult({
    codeProfile,
    editionDataset,
    stressFactorSet: acceptedSource.stressFactorSet,
    category,
    codePointId: nonEmptyString(acceptedSource.codePointId, `${field}.codePointId`),
    componentId: nonEmptyString(acceptedSource.componentId, `${field}.componentId`),
    combinationId: nonEmptyString(acceptedSource.combinationId, `${field}.combinationId`),
    frameElementRecord: acceptedSource.frameElementRecord,
    sectionResolution: acceptedSource.sectionResolution,
    sustainedSectionResolution: acceptedSource.sustainedSectionResolution,
    materialResolution: acceptedSource.materialResolution,
    localAction: resolved.localAction,
    pressureStressContribution,
    coldTemperature: acceptedSource.coldTemperature,
    sustainedStress: acceptedSource.sustainedStress,
    occasionalCategoryId: acceptedSource.occasionalCategoryId,
  });
  return deepFreeze({
    checkId,
    actionSource,
    sourceRecoveryHashes: resolved.sourceRecoveryHashes,
    codeResult,
  });
}

function canonicalActionSource(source, category, field) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    failCodeApplication(`${field}.actionSource must be a record.`, 'PIPING_B31_ACTION_SOURCE_INVALID');
  }
  if (source.kind === 'SINGLE_CASE') {
    exactKeys(source, SINGLE_CASE_SOURCE_KEYS, `${field}.actionSource`);
    if (RANGE_CATEGORIES.includes(category)) {
      failCodeApplication(
        `${category} requires an explicit ordered case pair.`,
        'PIPING_B31_RANGE_SOURCE_REQUIRED',
      );
    }
    return deepFreeze({
      kind: source.kind,
      caseId: nonEmptyString(source.caseId, `${field}.actionSource.caseId`),
    });
  }
  if (source.kind === 'CASE_RANGE') {
    exactKeys(source, RANGE_SOURCE_KEYS, `${field}.actionSource`);
    if (!RANGE_CATEGORIES.includes(category)) {
      failCodeApplication(
        'CASE_RANGE is only valid for DISPLACEMENT_STRESS_RANGE or EXPANSION_RANGE_ENVELOPE.',
        'PIPING_B31_RANGE_CATEGORY_INVALID',
      );
    }
    const fromCaseId = nonEmptyString(source.fromCaseId, `${field}.actionSource.fromCaseId`);
    const toCaseId = nonEmptyString(source.toCaseId, `${field}.actionSource.toCaseId`);
    if (fromCaseId === toCaseId) {
      failCodeApplication('Case-range endpoints must be different.', 'PIPING_B31_RANGE_CASES_IDENTICAL');
    }
    return deepFreeze({ kind: source.kind, fromCaseId, toCaseId });
  }
  failCodeApplication(`${field}.actionSource.kind is unsupported.`, 'PIPING_B31_ACTION_SOURCE_INVALID');
}

function resolveAction(actionSource, componentId, codePointId, caseIndex) {
  if (actionSource.kind === 'SINGLE_CASE') {
    const bound = requireCase(caseIndex, actionSource.caseId);
    const point = findCodePoint(bound.recovery, componentId, codePointId);
    return {
      localAction: point.local,
      sourceRecoveryHashes: deepFreeze([bound.recovery.semanticHash]),
    };
  }
  const fromCase = requireCase(caseIndex, actionSource.fromCaseId);
  const toCase = requireCase(caseIndex, actionSource.toCaseId);
  if (fromCase.recovery.mechanicalModelSemanticHash !== toCase.recovery.mechanicalModelSemanticHash
    || fromCase.recovery.stiffnessStateHash !== toCase.recovery.stiffnessStateHash) {
    failCodeApplication(
      'Displacement-range cases do not share one mechanical stiffness state.',
      'PIPING_B31_RANGE_STIFFNESS_MISMATCH',
    );
  }
  const fromPoint = findCodePoint(fromCase.recovery, componentId, codePointId);
  const toPoint = findCodePoint(toCase.recovery, componentId, codePointId);
  return {
    localAction: deepFreeze(Object.fromEntries(
      LOCAL_ACTION_FIELDS.map((field) => [field, toPoint.local[field] - fromPoint.local[field]]),
    )),
    sourceRecoveryHashes: deepFreeze([
      fromCase.recovery.semanticHash,
      toCase.recovery.semanticHash,
    ]),
  };
}

function requireCase(caseIndex, caseId) {
  const result = caseIndex.get(caseId);
  if (!result) {
    failCodeApplication(`B31 action source references missing case ${caseId}.`, 'PIPING_B31_CASE_MISSING');
  }
  return result;
}

function findCodePoint(recovery, componentId, codePointId) {
  const component = recovery.componentResultants.find((row) => row.componentId === componentId);
  const point = component?.codePoints.find((row) => row.stationId === codePointId);
  if (!point) {
    failCodeApplication(
      `Recovery ${recovery.semanticHash} does not contain code point ${componentId}:${codePointId}.`,
      'PIPING_B31_CODE_POINT_MISSING',
    );
  }
  if (point.consistency !== null && point.consistency.withinTolerance !== true) {
    failCodeApplication(
      `Recovered code point ${componentId}:${codePointId} failed its B-3.4 consistency check.`,
      'PIPING_B31_CODE_POINT_INCONSISTENT',
    );
  }
  return point;
}

function caseBinding(entry) {
  return deepFreeze({
    caseId: entry.caseId,
    physicalLoadCaseHash: entry.loadCase.physicalLoadCaseHash,
    recoverySemanticHash: entry.recovery.semanticHash,
    recoveryEvidenceHash: entry.recovery.evidenceHash,
    executionHash: entry.recovery.executionHash,
    mechanicalModelSemanticHash: entry.recovery.mechanicalModelSemanticHash,
    stiffnessStateHash: entry.recovery.stiffnessStateHash,
  });
}

function requireUnique(values, code) {
  if (new Set(values).size !== values.length) {
    failCodeApplication('Duplicate identity is not permitted.', code, { values });
  }
}

export function requireLinearPipingB31Application(record) {
  exactKeys(record, B31_APPLICATION_KEYS, 'b31Application');
  if (record.schema !== B31_APPLICATION_SCHEMA) {
    failCodeApplication('B31 application schema is invalid.', 'PIPING_B31_APPLICATION_INVALID');
  }
  nonEmptyString(record.applicationId, 'b31Application.applicationId');
  requireHash(record.codeProfileSemanticHash, 'b31Application.codeProfileSemanticHash');
  requireHash(record.editionDatasetSemanticHash, 'b31Application.editionDatasetSemanticHash');
  requireHash(record.semanticHash, 'b31Application.semanticHash');
  requireHash(record.evidenceHash, 'b31Application.evidenceHash');
  const caseBindings = requireArray(record.caseBindings, 'b31Application.caseBindings');
  const bindingByCaseId = new Map();
  for (const [index, entry] of caseBindings.entries()) {
    const field = `b31Application.caseBindings[${index}]`;
    exactKeys(entry, B31_CASE_BINDING_KEYS, field);
    nonEmptyString(entry.caseId, `${field}.caseId`);
    requireHash(entry.physicalLoadCaseHash, `${field}.physicalLoadCaseHash`);
    requireHash(entry.recoverySemanticHash, `${field}.recoverySemanticHash`);
    requireHash(entry.recoveryEvidenceHash, `${field}.recoveryEvidenceHash`);
    requireHash(entry.executionHash, `${field}.executionHash`);
    requireHash(entry.mechanicalModelSemanticHash, `${field}.mechanicalModelSemanticHash`);
    requireHash(entry.stiffnessStateHash, `${field}.stiffnessStateHash`);
    if (bindingByCaseId.has(entry.caseId)) {
      failCodeApplication('B31 case binding IDs must be unique.', 'PIPING_B31_CASE_ID_DUPLICATE');
    }
    bindingByCaseId.set(entry.caseId, entry);
  }
  const results = requireArray(record.results, 'b31Application.results');
  for (const [index, entry] of results.entries()) {
    const field = `b31Application.results[${index}]`;
    exactKeys(entry, B31_RESULT_ENTRY_KEYS, field);
    nonEmptyString(entry.checkId, `${field}.checkId`);
    const codeResult = requireCodeResult(entry.codeResult);
    const actionSource = canonicalActionSource(entry.actionSource, codeResult.category, field);
    const sourceRecoveryHashes = requireArray(entry.sourceRecoveryHashes, `${field}.sourceRecoveryHashes`);
    sourceRecoveryHashes.forEach((hash, hashIndex) => requireHash(hash, `${field}.sourceRecoveryHashes[${hashIndex}]`));
    requireOutputSourceBinding(actionSource, sourceRecoveryHashes, bindingByCaseId);
  }
  if (!['QUALIFIED', 'CONDITIONAL'].includes(record.status)) {
    failCodeApplication('B31 application status is invalid.', 'PIPING_B31_APPLICATION_INVALID');
  }
  if (record.semanticHash !== semanticHash(b31ApplicationSemanticProjection(record))) {
    failCodeApplication('B31 application semantic hash is stale.', 'PIPING_B31_APPLICATION_HASH_MISMATCH');
  }
  if (record.evidenceHash !== computeB31ApplicationEvidenceHash(record)) {
    failCodeApplication('B31 application evidence hash is stale.', 'PIPING_B31_APPLICATION_HASH_MISMATCH');
  }
  return deepFreeze({ ...record });
}

function requireOutputSourceBinding(actionSource, sourceHashes, bindingByCaseId) {
  const expected = actionSource.kind === 'SINGLE_CASE'
    ? [bindingByCaseId.get(actionSource.caseId)?.recoverySemanticHash]
    : [
      bindingByCaseId.get(actionSource.fromCaseId)?.recoverySemanticHash,
      bindingByCaseId.get(actionSource.toCaseId)?.recoverySemanticHash,
    ];
  if (expected.some((value) => value === undefined)
    || JSON.stringify(sourceHashes) !== JSON.stringify(expected)) {
    failCodeApplication(
      'B31 result action source does not match the retained case bindings.',
      'PIPING_B31_RESULT_PARENT_MISMATCH',
      { actionSource, sourceHashes, expected },
    );
  }
}

export function b31ApplicationSemanticProjection(record) {
  const { semanticHash: _semanticHash, evidenceHash: _evidenceHash, ...projection } = record;
  return projection;
}

export function computeB31ApplicationEvidenceHash(record) {
  return semanticHash({
    semanticHash: record.semanticHash,
    caseEvidence: record.caseBindings.map((entry) => ({
      caseId: entry.caseId,
      recoverySemanticHash: entry.recoverySemanticHash,
      recoveryEvidenceHash: entry.recoveryEvidenceHash,
    })),
    resultEvidence: record.results.map((entry) => ({
      checkId: entry.checkId,
      sourceRecoveryHashes: entry.sourceRecoveryHashes,
      codeResultEvidenceHash: entry.codeResult.evidenceHash,
    })),
  });
}
