import { AUTHORITIES } from '../lfea-field-adapter.js';
import { qualityEvidenceRows } from '../lfea-quality-adapter.js';
import { scalarText } from '../workbench-dom.js';

export const LFEA_RESULT_VIEW_IDS = Object.freeze([
  'OVERVIEW',
  'DISPLACEMENTS',
  'REACTIONS',
  'RAW_STRESS',
  'PROJECTED_STRESS',
  'MESH_QUALITY',
  'REVIEW',
]);

const VIEW_LABELS = Object.freeze({
  OVERVIEW: 'Overview',
  DISPLACEMENTS: 'Displacements',
  REACTIONS: 'Reactions',
  RAW_STRESS: 'Raw stress',
  PROJECTED_STRESS: 'Projected stress',
  MESH_QUALITY: 'Mesh quality',
  REVIEW: 'Review / evidence',
});

export function createLfeaResultsIdentity(state) {
  return [
    state?.packageValue?.semanticHash ?? '',
    state?.modelVersion ?? '',
    state?.activeRun?.runId ?? state?.execution?.runId ?? '',
    state?.execution?.result?.semanticHash ?? '',
  ].join(':');
}

export function createLfeaResultsViewModel(state) {
  const execution = state?.execution ?? null;
  const result = execution?.result ?? null;
  const datasets = Object.freeze({
    DISPLACEMENTS: result?.nodalDisplacements ?? [],
    REACTIONS: result?.reactions ?? [],
    RAW_STRESS: rawStressRows(result),
    PROJECTED_STRESS: execution?.stressProjection?.nodalValues ?? [],
    MESH_QUALITY: result ? qualityEvidenceRows(result) : [],
  });
  const views = LFEA_RESULT_VIEW_IDS.map((id) => createView(id, datasets, execution, result));
  return Object.freeze({
    identity: createLfeaResultsIdentity(state),
    packageSemanticHash: state?.packageValue?.semanticHash ?? null,
    modelVersion: state?.modelVersion ?? null,
    runId: execution?.runId ?? state?.activeRun?.runId ?? null,
    resultSemanticHash: result?.semanticHash ?? null,
    reviewSemanticHash: execution?.review?.semanticHash ?? null,
    evidenceExportSemanticHash: execution?.evidenceExport?.semanticHash ?? null,
    stressUnit: state?.packageValue?.analysisDefinition?.solverProfile?.units?.stress ?? null,
    pipelineStatus: execution?.status ?? null,
    preflightStatus: execution?.preflight?.status ?? null,
    solverStatus: result?.status ?? null,
    reviewStatus: execution?.review?.status ?? null,
    evidenceExportStatus: execution?.evidenceExport?.status ?? null,
    authorityPolicy: execution?.authorityPolicy ?? null,
    datasets,
    views: Object.freeze(views),
    review: execution ? createReviewSnapshot(execution) : null,
  });
}

export function projectLfeaResultRows(rows, query = '', sortKey = '', sortDirection = 'asc') {
  const source = Array.isArray(rows) ? rows : [];
  const needle = String(query ?? '').trim().toLocaleLowerCase();
  const filtered = needle
    ? source.filter((row) => Object.values(row ?? {}).some((value) =>
      scalarText(value).toLocaleLowerCase().includes(needle)))
    : [...source];
  if (!sortKey) return filtered;
  const direction = sortDirection === 'desc' ? -1 : 1;
  return [...filtered].sort((left, right) =>
    direction * compareCells(left?.[sortKey], right?.[sortKey]));
}

export function lfeaResultColumnKeys(rows) {
  return [...new Set((rows ?? []).flatMap((row) => Object.keys(row ?? {})))];
}

function createView(id, datasets, execution, result) {
  const rows = datasets[id] ?? [];
  const metadata = viewMetadata(id, execution, result);
  return Object.freeze({
    id,
    label: VIEW_LABELS[id],
    available: id === 'OVERVIEW' || id === 'REVIEW'
      ? Boolean(execution)
      : rows.length > 0,
    rowCount: rows.length,
    sourcePath: metadata.sourcePath,
    authority: metadata.authority,
    sourceClass: metadata.sourceClass,
  });
}

function viewMetadata(id, execution, result) {
  if (id === 'DISPLACEMENTS') return meta('execution.result.nodalDisplacements', 'Solver result rows');
  if (id === 'REACTIONS') return meta('execution.result.reactions', 'Solver result rows');
  if (id === 'RAW_STRESS') {
    const path = Array.isArray(result?.integrationPointResults)
      ? 'execution.result.integrationPointResults'
      : 'execution.result.elementStresses';
    return meta(path, 'Solver stress evidence', AUTHORITIES.RAW);
  }
  if (id === 'PROJECTED_STRESS') {
    return meta('execution.stressProjection.nodalValues', 'Review projection', AUTHORITIES.PROJECTED);
  }
  if (id === 'MESH_QUALITY') return meta('execution.result.elementQualityEvidence', 'Solver quality evidence');
  if (id === 'REVIEW') return meta('execution.review + execution.evidenceExport', 'Review and evidence records');
  return meta('execution', 'Current execution');
}

function meta(sourcePath, sourceClass, authority = null) {
  return { sourcePath, sourceClass, authority };
}

function rawStressRows(result) {
  if (!result) return [];
  return Array.isArray(result.integrationPointResults)
    ? result.integrationPointResults
    : result.elementStresses ?? [];
}

function createReviewSnapshot(execution) {
  return Object.freeze({
    pipelineStatus: execution.status,
    failedStage: execution.failedStage ?? null,
    solverStatus: execution.result?.status ?? null,
    reviewStatus: execution.review?.status ?? null,
    evidenceExportStatus: execution.evidenceExport?.status ?? null,
    authorityPolicy: execution.authorityPolicy ?? null,
    equilibriumTotals: execution.result?.equilibriumTotals ?? null,
    energyConsistency: execution.result?.energyConsistency ?? null,
    review: execution.review ?? null,
    evidenceExport: execution.evidenceExport ?? null,
  });
}

function compareCells(left, right) {
  if (typeof left === 'number' && typeof right === 'number') {
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }
  const leftText = scalarText(left);
  const rightText = scalarText(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}
