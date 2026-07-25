import { freezeDeep } from './dataset-utils.js';
import { validateAnalysisReport } from './analysis-report.js';

export const ANALYSIS_EXPORT_SCHEMA = 'analysis-export-artifact/v1';
const FORMATS = new Set(['json', 'csv', 'markdown']);

export function exportAnalysisReport(report, format) {
  const validation = validateAnalysisReport(report);
  if (!validation.ok) throw new Error(`Analysis report is invalid: ${validation.errors.join(' ')}`);
  const normalizedFormat = String(format || '').toLowerCase();
  if (!FORMATS.has(normalizedFormat)) throw new Error(`Unsupported analysis export format: ${format}.`);

  const descriptor = formatDescriptor(normalizedFormat, report);
  const content = descriptor.serialize(report);
  return freezeDeep({
    schema: ANALYSIS_EXPORT_SCHEMA,
    format: normalizedFormat,
    filename: `${stableBaseName(report)}.${descriptor.extension}`,
    mimeType: descriptor.mimeType,
    content,
    byteLength: new TextEncoder().encode(content).length,
    reportId: report.reportId,
  });
}

export function triggerAnalysisDownload(documentRef, artifact) {
  if (!documentRef?.createElement) throw new TypeError('Analysis download requires a document.');
  if (!artifact || artifact.schema !== ANALYSIS_EXPORT_SCHEMA) {
    throw new TypeError(`Analysis download requires ${ANALYSIS_EXPORT_SCHEMA}.`);
  }
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatDescriptor(format, report) {
  if (format === 'json') {
    return {
      extension: 'json',
      mimeType: 'application/json;charset=utf-8',
      serialize: (value) => `${JSON.stringify(value, null, 2)}\n`,
    };
  }
  if (format === 'csv') {
    return {
      extension: 'csv',
      mimeType: 'text/csv;charset=utf-8',
      serialize: () => serializeCsv(report),
    };
  }
  return {
    extension: 'md',
    mimeType: 'text/markdown;charset=utf-8',
    serialize: () => serializeMarkdown(report),
  };
}

function serializeCsv(report) {
  const rows = [['section', 'entry', 'path', 'left_or_value', 'right', 'status']];
  rows.push(['report', '', 'schema', report.schema, '', '']);
  rows.push(['report', '', 'reportId', report.reportId, '', '']);
  rows.push(['report', '', 'datasetId', report.datasetId, '', '']);
  rows.push(['report', '', 'mode', report.mode, '', '']);

  report.entries.forEach((entry) => {
    flattenValue(entry).forEach(({ path, value }) => {
      rows.push(['entry', entry.entryId, path, value, '', '']);
    });
  });
  (report.comparison?.rows || []).forEach((row) => {
    rows.push(['comparison', '', row.path, row.left, row.right, row.status]);
  });
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function serializeMarkdown(report) {
  const lines = [
    '# Analysis Report',
    '',
    `- Schema: \`${report.schema}\``,
    `- Report ID: \`${report.reportId}\``,
    `- Dataset: \`${report.datasetId}\``,
    `- Mode: \`${report.mode}\``,
    '',
  ];
  report.entries.forEach((entry) => {
    lines.push(`## ${entry.entryId}`, '');
    lines.push(`- Session: \`${entry.sessionId}\``);
    lines.push(`- Request: \`${entry.requestId}\``);
    lines.push(`- Target: \`${entry.targetId}\``);
    lines.push(`- Capability: \`${entry.analysisType}\``);
    lines.push(`- Status: \`${entry.status}\``, '');
    lines.push('| Path | Value |', '|---|---|');
    flattenValue(entry).forEach(({ path, value }) => {
      lines.push(`| ${escapeMarkdown(path)} | ${escapeMarkdown(value)} |`);
    });
    lines.push('');
  });
  if (report.comparison) {
    lines.push('## Comparison', '');
    lines.push(`- Left: \`${report.comparison.leftEntryId}\``);
    lines.push(`- Right: \`${report.comparison.rightEntryId}\``, '');
    lines.push('| Path | Left | Right | Status |', '|---|---|---|---|');
    report.comparison.rows.forEach((row) => {
      lines.push(`| ${escapeMarkdown(row.path)} | ${escapeMarkdown(row.left)} | ${escapeMarkdown(row.right)} | ${row.status} |`);
    });
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function flattenValue(value, path = '', rows = []) {
  if (Array.isArray(value)) {
    if (!value.length) rows.push({ path: path || '$', value: '[]' });
    value.forEach((child, index) => flattenValue(child, `${path}[${index}]`, rows));
    return rows;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    if (!keys.length) rows.push({ path: path || '$', value: '{}' });
    keys.forEach((key) => flattenValue(value[key], path ? `${path}.${key}` : key, rows));
    return rows;
  }
  rows.push({ path: path || '$', value: scalar(value) });
  return rows;
}

function scalar(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function csvCell(value) {
  const text = scalar(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeMarkdown(value) {
  return scalar(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function stableBaseName(report) {
  const suffix = report.mode === 'comparison'
    ? report.entryIds.join('-vs-')
    : report.activeEntryId;
  return sanitize(`analysis-${report.datasetId}-${suffix}`);
}

function sanitize(value) {
  return String(value || 'analysis-report')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'analysis-report';
}
