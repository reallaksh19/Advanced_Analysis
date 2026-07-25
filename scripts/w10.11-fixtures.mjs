import { createSolverResultContract } from '../src/core/solvers/certification/solverResultContract.js';
import { deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import { createWorkspaceConsumerContext } from '../src/core/workspace-consumers/index.js';
import { buildW1010Context } from './w10.10-fixtures.mjs';

export function buildW1011Fixture(options = {}) {
  const context = buildSourceContext(options);
  const entity = options.selectedEntityId === null ? null : selectedEntity(context.selectedEntityId);
  const inspection = entity ? capabilityInspection(context, options) : null;
  const result = solverResult(options);
  const session = options.noSession || !inspection ? null : analysisSession(context, inspection, result, options);
  const entries = options.entries || (inspection ? ledgerEntries(context, inspection, result, options) : deepFreeze([]));
  const ledgerSnapshot = deepFreeze({
    schema: 'analysis-ledger/v1',
    datasetId: context.datasetId,
    entries,
    activeEntryId: options.activeEntryId ?? entries.at(-1)?.entryId ?? '',
    comparison: null,
    version: 4,
  });
  return deepFreeze({
    sourceContext: context,
    selectedEntity: entity,
    capabilityInspection: inspection,
    sessionSnapshot: deepFreeze({ status: session ? 'active' : 'empty', session, version: 3 }),
    ledgerSnapshot,
    result,
  });
}

export function forgedResult() {
  const valid = solverResult();
  const payload = { ...structuredClone(valid), results: { flexibilityRatio: 999 } };
  return deepFreeze({ ...payload, semanticHash: semanticHash(valid) });
}

function buildSourceContext(options) {
  const selectedEntityId = options.selectedEntityId === undefined ? 'PIPE-117' : options.selectedEntityId;
  const template = buildW1010Context({
    requiredOnly: true,
    datasetId: options.datasetId || 'W10.11-FIXTURE',
    workspaceVersion: options.workspaceVersion ?? 7,
    selectedEntityId: 'PIPE-117',
  });
  return createWorkspaceConsumerContext({
    datasetId: template.datasetId,
    workspaceVersion: template.workspaceVersion,
    selectedEntityId,
    contracts: template.contracts,
  });
}

function selectedEntity(entityId) {
  const sourceAttributes = deepFreeze({ LINE_ID: 'LINE-117', SYSTEM_ID: 'SYS-117', ALPHA_PER_C: 0.000012 });
  const nativeParams = deepFreeze({ startPoint: [0, 0, 0], endPoint: [6000, 0, 0] });
  return deepFreeze({
    entityId,
    sourceEntityId: entityId,
    name: 'Pipe 117',
    entityType: 'PIPE',
    selectionType: 'pipe',
    sourcePath: `/MODEL/PIPES/${entityId}`,
    lineId: 'LINE-117',
    systemId: 'SYS-117',
    category: 'pipe',
    properties: deepFreeze({ sourceAttributes, nativeParams }),
  });
}

function capabilityInspection(context, options) {
  const missing = new Set(options.missing || []);
  const fields = inspectionFields(missing);
  const missingInputs = deepFreeze(fields.filter((row) => row.value === null).map(inputEvidence));
  const diagnostics = orderedReadinessDiagnostics(missingInputs, options.reverseDiagnostics);
  const workspaceReadiness = workspaceReadinessEvidence(context, fields, missingInputs, diagnostics, options);
  return deepFreeze({
    fields,
    readiness: deepFreeze({ enabled: workspaceReadiness.readyToRun, reason: diagnostics[0]?.message || '', missing: [...missing] }),
    summary: deepFreeze({ fieldCount: fields.length, overrideCount: 0, missingCount: missingInputs.length, invalidCount: 0 }),
    workspaceReadiness,
  });
}

function inspectionFields(missing) {
  return deepFreeze([
    field('connectedLineSegments', 'Connected pipe legs', 'count', 2, 'derived', false),
    field('deltaT', 'Temperature difference', '°C', missing.has('deltaT') ? null : 180),
    field('alpha', 'Thermal expansion coefficient', '1/°C', missing.has('alpha') ? null : 0.000012),
    field('E', 'Elastic modulus', 'MPa', missing.has('E') ? null : 200000),
    field('od', 'Pipe outside diameter', 'mm', missing.has('od') ? null : 168.3),
    field('Sa', 'Allowable stress', 'MPa', missing.has('Sa') ? null : 100),
  ]);
}

function orderedReadinessDiagnostics(missingInputs, reverse) {
  const rows = readinessDiagnostics(missingInputs);
  return reverse ? deepFreeze([...rows].reverse()) : rows;
}

function workspaceReadinessEvidence(context, fields, missingInputs, diagnostics, options) {
  const applicable = options.applicable !== false;
  const readyToRun = applicable && missingInputs.length === 0;
  return deepFreeze({
    schema: 'workspace-analysis-readiness/v1', analysisType: 'pipe-screening',
    label: 'Pipe flexibility screening', description: 'Runs the benchmarked simplified 2D screening solver for the selected pipe line.',
    targetId: context.selectedEntityId, datasetId: context.datasetId,
    solverId: 'workspace-simplified-2d-screening', solverVersion: '1.0.0',
    methodId: 'SIMPLIFIED_2D_TOPOLOGY_SCREENING', methodVersion: '1', engineeringLevel: 'BENCHMARKED_SCREENING',
    codeBasis: deepFreeze(['Simplified guided-cantilever flexibility screening equations']),
    applicable, applicabilityReason: applicable ? '' : 'Not applicable.',
    qualificationStatus: readyToRun ? 'READY_FOR_REVIEWED_EXECUTION' : applicable ? 'INPUT_REQUIRED' : 'NOT_APPLICABLE',
    requiredInputs: fields.map(inputEvidence), resolvedInputs: fields.filter((row) => row.value !== null).map(inputEvidence),
    missingInputs, invalidInputs: deepFreeze([]),
    assumptions: deepFreeze(['The connected route is projected onto its two dominant geometric axes.']),
    limitations: deepFreeze(['This is a screening method, not a final piping-code stress analysis.']),
    diagnostics: deepFreeze(diagnostics), readyToReview: applicable, readyToRun,
  });
}

function field(key, label, unit, value, source = 'source', editable = true) {
  return deepFreeze({
    key, label, unit, kind: 'number', required: true, editable,
    value, source: value === null ? 'missing' : source,
    sourcePath: value === null ? '' : `properties.sourceAttributes.${key}`,
    validation: 'positive',
  });
}

function inputEvidence(row) {
  return deepFreeze({ key: row.key, label: row.label, value: row.value, unit: row.unit, source: row.source, sourcePath: row.sourcePath, editable: row.editable });
}

function readinessDiagnostics(missingInputs) {
  if (!missingInputs.length) return deepFreeze([]);
  return deepFreeze(missingInputs.map((row) => deepFreeze({
    severity: 'warning', code: 'ANALYSIS_INPUT_REQUIRED',
    message: `Missing input: ${row.key}.`, data: { fieldKey: row.key },
  })));
}

function solverResult(options = {}) {
  return createSolverResultContract({
    moduleId: options.moduleId || 'simplified-2d',
    methodId: options.methodId || 'SIMPLIFIED_2D_L_SHAPE',
    formulaIds: ['SIMPLIFIED_2D_FLEXIBILITY_RATIO'],
    settingsHash: 'fnv1a64:1111111111111111',
    dataStatus: 'EXPLICIT_INPUTS',
    engineeringLevel: options.engineeringLevel || 'BENCHMARKED_SCREENING',
    status: 'CALCULATED',
    input: { deltaT: 180, alpha: 0.000012, E: 200000, od: 168.3, Sa: 100 },
    results: { flexibilityRatio: 0.42 },
    diagnostics: [],
    warnings: [],
    formulaTrace: [{ formulaId: 'SIMPLIFIED_2D_FLEXIBILITY_RATIO', value: 0.42 }],
    meta: {
      geometryType: options.geometryType || 'L_SHAPE',
      requestedTargetId: 'PIPE-117',
      analysisSessionId: 'analysis-session-1',
    },
    summary: { flexibilityRatio: 0.42 },
  });
}

function analysisSession(context, inspection, result, options) {
  const status = options.sessionStatus || (inspection.workspaceReadiness.readyToRun ? 'ready' : 'draft');
  return deepFreeze({
    schema: 'analysis-session/v1',
    sessionId: 'analysis-session-1',
    targetId: options.sessionTargetId || context.selectedEntityId,
    analysisType: options.sessionAnalysisType || 'pipe-screening',
    datasetId: options.sessionDatasetId || context.datasetId,
    workspaceVersion: options.sessionWorkspaceVersion ?? context.workspaceVersion,
    version: 2,
    status,
    inputs: inspection.fields,
    overrides: deepFreeze(options.overrides || {}),
    fieldErrors: deepFreeze(options.fieldErrors || {}),
    readiness: inspection.readiness,
    workspaceReadiness: inspection.workspaceReadiness,
    requestId: ['completed', 'failed', 'running'].includes(status) ? 'analysis-1' : undefined,
    result: status === 'completed' ? (options.result || result) : null,
    failure: status === 'failed' ? deepFreeze({ code: 'SCREENING_FAILED', message: 'Screening failed.', details: {} }) : null,
  });
}

function ledgerEntries(context, inspection, result, options) {
  const current = analysisSession(context, inspection, result, ledgerSessionOptions(options));
  const support = deepFreeze({ ...structuredClone(current), sessionId: 'support-session', analysisType: 'support-load' });
  const prior = deepFreeze({ ...structuredClone(current), sessionId: 'prior-session', datasetId: 'PRIOR-DATASET' });
  return deepFreeze([
    ledgerEntry('analysis-ledger-entry-12', 12, current),
    ledgerEntry('analysis-ledger-entry-13', 13, support),
    ledgerEntry('analysis-ledger-entry-14', 14, prior),
    ledgerEntry('analysis-ledger-entry-18-a', 18, deepFreeze({ ...structuredClone(current), sessionId: 'analysis-session-18-a' })),
    ledgerEntry('analysis-ledger-entry-18-b', 18, deepFreeze({ ...structuredClone(current), sessionId: 'analysis-session-18-b' })),
  ]);
}

function ledgerSessionOptions(options) {
  return {
    ...options,
    sessionStatus: 'completed',
    sessionDatasetId: options.ledgerSessionDatasetId,
    sessionTargetId: options.ledgerSessionTargetId,
    sessionAnalysisType: options.ledgerSessionAnalysisType,
    sessionWorkspaceVersion: options.ledgerSessionWorkspaceVersion,
  };
}

function ledgerEntry(entryId, sequence, session) {
  return deepFreeze({
    schema: 'analysis-ledger-entry/v1',
    entryId,
    sequence,
    archiveKey: `${session.sessionId}:${session.requestId}`,
    datasetId: session.datasetId,
    session,
  });
}
