import { canonicalPrettyStringify } from '../shared-piping-model/index.js';

/**
 * Serializes a qualification suite without timestamps or environment metadata.
 *
 * @param {Readonly<object>} suite Valid tab benchmark suite.
 * @returns {string} Canonical JSON with a terminal newline.
 */
export function serializeTabBenchmarkSuiteJson(suite) {
  return `${canonicalPrettyStringify(suite)}\n`;
}

/**
 * Produces the deterministic human-readable qualification report.
 *
 * @param {Readonly<object>} suite Valid tab benchmark suite.
 * @returns {string} Markdown report with stable ordering.
 */
export function serializeTabBenchmarkSuiteMarkdown(suite) {
  const lines = [
    '# Advanced Analysis Tab Qualification',
    '',
    `Suite semantic hash: \`${suite.semanticHash}\``,
    '',
    '| Tab | Status | Passed | Required | Failed | Missing |',
    '|---|---:|---:|---:|---|---|',
  ];
  suite.qualifications.forEach((row) => {
    lines.push(`| ${row.tabId} | ${row.status} | ${row.passedCaseCount} | ${row.requiredCaseCount} | ${list(row.failedCaseIds)} | ${list(row.missingCaseIds)} |`);
  });
  lines.push('', '## Evidence', '');
  suite.results.forEach((result) => {
    lines.push(
      `### ${result.tabId} / ${result.caseId}`,
      '',
      `- Status: ${result.status}`,
      `- Category: ${result.category}`,
      `- Evidence basis: ${result.evidenceBasis}`,
      `- Input semantic hash: \`${result.inputSemanticHash}\``,
      `- Result semantic hash: \`${result.semanticHash}\``,
      `- Expected: \`${inlineJson(result.expectedEvidence)}\``,
      `- Actual: \`${inlineJson(result.actualEvidence)}\``,
      `- Tolerance: \`${inlineJson(result.tolerance)}\``,
      `- Diagnostics: ${list(result.diagnostics)}`,
      '',
    );
  });
  return `${lines.join('\n')}\n`;
}

function inlineJson(value) {
  return JSON.stringify(value).replaceAll('|', '\\|');
}

function list(values) {
  return values.length ? values.join(', ') : '—';
}
