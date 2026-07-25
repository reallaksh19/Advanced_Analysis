import {
  canonicalPrettyStringify, deepFreeze, semanticHash, utf8ByteLength,
} from '../shared-piping-model/index.js';
import {
  EXPORT_FORMATS, MODEL_CALCULATION_EXPORT_ARTIFACT_SCHEMA,
} from './constants.js';
import { validateModelCalculationPackage } from './package.js';
import { validateModelCalculationReport } from './report.js';

const CSV_COLUMNS = Object.freeze([
  'rowType', 'datasetId', 'packageId', 'methodId', 'engineeringLevel',
  'pathId', 'loadCaseId', 'supportKey', 'field', 'value', 'unit',
  'qualification', 'code', 'message',
]);

export function createModelCalculationExportArtifact(packageValue, report, format) {
  assertInputs(packageValue, report, format);
  const rendered = render(format, packageValue, report);
  const base = {
    schema: MODEL_CALCULATION_EXPORT_ARTIFACT_SCHEMA,
    format,
    filename: filenameFor(packageValue, format),
    mimeType: mimeTypeFor(format),
    content: rendered,
    byteLength: utf8ByteLength(rendered),
    datasetId: packageValue.datasetId,
    packageId: packageValue.packageId,
    packageSemanticHash: packageValue.semanticHash,
    reportSemanticHash: report.semanticHash,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateModelCalculationExportArtifact(value) {
  const errors = [];
  if (value?.schema !== MODEL_CALCULATION_EXPORT_ARTIFACT_SCHEMA) errors.push('Invalid model calculation export artifact schema.');
  if (!Object.values(EXPORT_FORMATS).includes(value?.format)) errors.push('Invalid model calculation export format.');
  if (typeof value?.content !== 'string' || !value.content.endsWith('\n')) errors.push('Model calculation export must be newline-terminated UTF-8 text.');
  if (value?.byteLength !== utf8ByteLength(value?.content || '')) errors.push('Model calculation export byte length mismatch.');
  if (!value?.filename || !value?.mimeType || !value?.packageId || !value?.reportSemanticHash) errors.push('Model calculation export identity is incomplete.');
  validateRenderedContent(value, errors);
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Model calculation export artifact semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function validateRenderedContent(value, errors) {
  if (value?.format === EXPORT_FORMATS.JSON) {
    try {
      const parsed = JSON.parse(value.content);
      if (parsed?.package?.semanticHash !== value.packageSemanticHash || parsed?.report?.semanticHash !== value.reportSemanticHash) errors.push('JSON export semantic references mismatch.');
    } catch { errors.push('JSON export content is invalid.'); }
  }
  if (value?.format === EXPORT_FORMATS.CSV && !value.content.startsWith(`${CSV_COLUMNS.join(',')}\n`)) errors.push('CSV export header is invalid.');
  if (value?.format === EXPORT_FORMATS.MARKDOWN && !value.content.startsWith('# Model Calculation Package ')) errors.push('Markdown export heading is invalid.');
}
function render(format, packageValue, report) {
  if (format === EXPORT_FORMATS.JSON) return renderJson(packageValue, report);
  if (format === EXPORT_FORMATS.CSV) return renderCsv(packageValue, report);
  return renderMarkdown(packageValue, report);
}
function renderJson(packageValue, report) {
  const base = { schema: 'model-calculation-package-report-export/v1', package: packageValue, report };
  return canonicalPrettyStringify({ ...base, semanticHash: semanticHash(base) });
}
function renderCsv(packageValue, report) {
  const rows = csvRows(packageValue, report);
  return `${[CSV_COLUMNS, ...rows.map(toCsvRow)].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}
function csvRows(packageValue, report) {
  const rows = [row('package', packageValue, { field: 'packageMode', value: packageValue.packageMode })];
  packageValue.methodEvidence.forEach((method) => rows.push(row('method', packageValue, { methodId: method.methodId, engineeringLevel: method.engineeringLevel, field: 'profile', value: `${method.profileId}@${method.profileVersion}` })));
  packageValue.qualificationSummary.forEach((item) => rows.push(row('path/load case', packageValue, { pathId: item.pathId, loadCaseId: item.loadCaseId, qualification: item.beamQualification || item.screeningQualification, field: 'blockerCount', value: item.blockers.length })));
  report.sections.screeningSupportForces.forEach((item) => rows.push(row('screening force', packageValue, { ...item, field: 'screenedVerticalForceN', value: item.screenedVerticalForceN, unit: 'N' })));
  report.sections.verticalBeamSupportForces.forEach((item) => {
    rows.push(row('beam support force', packageValue, { ...item, field: 'signedSupportForceN', value: item.signedSupportForceN, unit: 'N' }));
    rows.push(row('beam support force', packageValue, { ...item, field: 'upwardSupportForceN', value: item.upwardSupportForceN, unit: 'N' }));
  });
  report.sections.residualEvidence.forEach((item) => ['forceResidualN', 'momentResidualNm', 'matrixResidualN'].forEach((field) => {
    if (item[field] !== null) rows.push(row('residual', packageValue, { ...item, field, value: item[field], unit: field === 'momentResidualNm' ? 'N*m' : 'N' }));
  }));
  report.sections.blockers.forEach((code) => rows.push(row('blocker', packageValue, { code, field: 'blocker', value: code })));
  report.sections.diagnostics.forEach((item) => rows.push(row('diagnostic', packageValue, { code: item.code, message: item.message, field: 'diagnostic', value: item.severity })));
  return rows.sort((a, b) => toCsvRow(a).join('|').localeCompare(toCsvRow(b).join('|')));
}
function renderMarkdown(packageValue, report) {
  const lines = [
    `# Model Calculation Package ${packageValue.packageId}`,
    '', `Dataset: ${packageValue.datasetId}`, `Mode: ${packageValue.packageMode}`,
    '', `> ${report.statement}`, '', '## Methods',
  ];
  packageValue.methodEvidence.forEach((method) => lines.push(`- ${method.methodId}@${method.methodVersion} — ${method.engineeringLevel}`));
  lines.push('', '## Assumptions', ...packageValue.assumptions.map((item) => `- ${item}`), '', '## Limitations', ...packageValue.limitations.map((item) => `- ${item}`));
  lines.push('', '## Path / Load-Case Qualification', '| Path | Case | Screening | Beam | Max v (m) | Max θ (rad) |', '|---|---|---|---|---:|---:|');
  packageValue.qualificationSummary.forEach((item) => lines.push(`| ${item.pathId} | ${item.loadCaseId} | ${item.screeningQualification || '—'} | ${item.beamQualification || '—'} | ${fmt(item.maximumAbsoluteDisplacementM)} | ${fmt(item.maximumAbsoluteRotationRad)} |`));
  lines.push('', '## Screening Support Forces', '| Path | Case | Support | screenedVerticalForceN (N) |', '|---|---|---|---:|');
  report.sections.screeningSupportForces.forEach((item) => lines.push(`| ${item.pathId} | ${item.loadCaseId} | ${item.supportKey} | ${fmt(item.screenedVerticalForceN)} |`));
  lines.push('', '## Vertical-Beam Support Forces', '| Path | Case | Support | signedSupportForceN (N) | upwardSupportForceN (N) |', '|---|---|---|---:|---:|');
  report.sections.verticalBeamSupportForces.forEach((item) => lines.push(`| ${item.pathId} | ${item.loadCaseId} | ${item.supportKey} | ${fmt(item.signedSupportForceN)} | ${fmt(item.upwardSupportForceN)} |`));
  lines.push('', '## Residual Evidence', '| Path | Case | Force (N) | Moment (N·m) | Matrix (N) |', '|---|---|---:|---:|---:|');
  report.sections.residualEvidence.forEach((item) => lines.push(`| ${item.pathId} | ${item.loadCaseId} | ${fmt(item.forceResidualN)} | ${fmt(item.momentResidualNm)} | ${fmt(item.matrixResidualN)} |`));
  lines.push('', '## Blockers', ...(report.sections.blockers.length ? report.sections.blockers.map((item) => `- ${item}`) : ['- None']), '', '## Diagnostics', ...(report.sections.diagnostics.length ? report.sections.diagnostics.map((item) => `- ${item.code}: ${item.message}`) : ['- None']));
  return `${lines.join('\n')}\n`;
}
function row(rowType, packageValue, values = {}) { return { rowType, datasetId: packageValue.datasetId, packageId: packageValue.packageId, ...values }; }
function toCsvRow(rowValue) { return CSV_COLUMNS.map((field) => rowValue[field] ?? ''); }
function csvCell(value) { const text = String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function filenameFor(packageValue, format) { const extension = { JSON: 'json', CSV: 'csv', MARKDOWN: 'md' }[format]; return `model-calculation-${safe(packageValue.datasetId)}-${packageValue.packageId.split(':').at(-1)}.${extension}`; }
function mimeTypeFor(format) { return format === EXPORT_FORMATS.JSON ? 'application/json;charset=utf-8' : format === EXPORT_FORMATS.CSV ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8'; }
function assertInputs(packageValue, report, format) {
  const packageValidation = validateModelCalculationPackage(packageValue);
  const reportValidation = validateModelCalculationReport(report, packageValue);
  if (!packageValidation.ok) throw new TypeError('Valid model calculation package is required.');
  if (!reportValidation.ok) throw new TypeError('Matching model calculation report is required.');
  if (!Object.values(EXPORT_FORMATS).includes(format)) throw new TypeError('Unsupported model calculation export format.');
}
function safe(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dataset'; }
function fmt(value) { return value === null || value === undefined ? '—' : Number(value).toPrecision(10).replace(/\.0+$/, ''); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
