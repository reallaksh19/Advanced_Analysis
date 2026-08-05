import { deepFreeze } from './contracts.js';

const FRD_FIELD_MAP = Object.freeze({
  DISP: ['NODAL_DISPLACEMENT'],
  FORC: ['NODAL_REACTION'],
  STRESS: ['SHELL_STRESS'],
  STRMID: ['SHELL_STRESS'],
  STRNEG: ['SHELL_STRESS'],
  STRPOS: ['SHELL_STRESS'],
  TOSTRAIN: ['SHELL_STRAIN'],
  ENER: ['TOTAL_STRAIN_ENERGY'],
  CONTACT: ['CONTACT_PRESSURE', 'CONTACT_OPENING'],
  CELS: ['CONTACT_OPENING'],
});

const COMPLETION_PATTERNS = Object.freeze([
  { id: 'JOB_FINISHED', pattern: /\bJOB\s+FINISHED\b/iu },
  { id: 'ANALYSIS_COMPLETED', pattern: /\bANALYSIS\s+COMPLETED\b/iu },
  { id: 'CALCULIX_COMPLETED', pattern: /\bCALCULIX\b[\s\S]{0,160}\bCOMPLETED\b/iu },
  { id: 'FRD_END_RECORD', pattern: /^\s*9999\s*$/mu },
]);

const FAILURE_PATTERNS = Object.freeze([
  { id: 'FATAL', pattern: /\bFATAL\b/iu },
  { id: 'ERROR', pattern: /(?:^|\n)\s*\*?ERROR\b/iu },
  { id: 'NO_CONVERGENCE', pattern: /\bNO\s+CONVERGENCE\b/iu, transientWhenComplete: true },
  { id: 'DIVERGENCE', pattern: /\bDIVERGENCE\b/iu, transientWhenComplete: true },
  { id: 'SEGMENTATION_FAULT', pattern: /\bSEGMENTATION\s+FAULT\b/iu },
]);

export function inventoryExternalSolverOutputs(retainedFiles, canonicalModel) {
  if (!(retainedFiles instanceof Map)) {
    throw new TypeError('retainedFiles must be a Map.');
  }
  const textFiles = [];
  const diagnosticTextFiles = [];
  const frdFiles = [];
  for (const [relativePath, bytes] of retainedFiles.entries()) {
    if (!Buffer.isBuffer(bytes)) throw new TypeError(`Retained file ${relativePath} is not a Buffer.`);
    if (/\.frd$/iu.test(relativePath)) frdFiles.push([relativePath, bytes]);
    if (/\.(?:txt|dat|sta|cvg|frd)$/iu.test(relativePath)) {
      const decoded = decodeBoundedText(bytes, relativePath);
      textFiles.push([relativePath, decoded]);
      if (!/\.frd$/iu.test(relativePath)) diagnosticTextFiles.push([relativePath, decoded]);
    }
  }
  textFiles.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  diagnosticTextFiles.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  frdFiles.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const searchableText = textFiles.map(([path, text]) => `\n--- ${path} ---\n${text}`).join('');
  const diagnosticText = diagnosticTextFiles
    .map(([path, text]) => `\n--- ${path} ---\n${text}`)
    .join('');

  const completionMarkers = COMPLETION_PATTERNS
    .filter(({ pattern }) => pattern.test(searchableText))
    .map(({ id }) => id);
  const completionEstablished = completionMarkers.length > 0;
  const failureMarkers = FAILURE_PATTERNS
    .filter(({ pattern, transientWhenComplete }) => (
      pattern.test(diagnosticText) && !(transientWhenComplete && completionEstablished)
    ))
    .map(({ id }) => id);
  if (hasUnqualifiedNonFiniteDiagnostic(diagnosticText, completionEstablished)) {
    failureMarkers.push('NAN_OR_INFINITY');
  }
  const stepInventory = parseStepInventory(searchableText);
  const incrementInventory = parseIncrementInventory(searchableText);
  const provisionalDatasetInventory = frdFiles.flatMap(([path, bytes]) => (
    parseAsciiFrdDatasets(decodeBoundedText(bytes, path), path)
  ));
  const available = new Set(
    provisionalDatasetInventory.flatMap((row) => FRD_FIELD_MAP[row.datasetLabel] ?? []),
  );
  detectDatContactOutputs(searchableText).forEach((field) => available.add(field));
  const requested = [...new Set([
    ...(canonicalModel.requestedOutputs ?? []),
    ...(canonicalModel.loadSteps ?? []).flatMap((step) => step.outputRequests ?? []),
  ])].sort();
  const availableFieldInventory = [...available].sort();
  const missing = requested.filter((field) => !available.has(field));
  const requestedOutputCoverage = {
    requested,
    available: availableFieldInventory,
    missing,
    status: missing.length === 0 ? 'COMPLETE' : available.size === 0 ? 'NONE' : 'PARTIAL',
  };
  const incrementSequenceEvidence = assessIncrementSequence(incrementInventory);
  const completionEvidence = {
    completionMarkers,
    failureMarkers,
    hasCompletionMarker: completionMarkers.length > 0,
    hasFailureMarker: failureMarkers.length > 0,
    frdEndRecordPresent: completionMarkers.includes('FRD_END_RECORD'),
  };

  return deepFreeze({
    searchableText,
    completionEvidence,
    stepInventory,
    incrementInventory,
    incrementSequenceEvidence,
    provisionalDatasetInventory,
    availableFieldInventory,
    requestedOutputCoverage,
  });
}

export function parseAsciiFrdDatasets(text, sourceFile = 'model.frd') {
  if (typeof text !== 'string') throw new TypeError('FRD text must be a string.');
  const rows = text.split(/\r?\n/u);
  const datasets = [];
  let current = null;
  const closeCurrent = () => {
    if (!current) return;
    datasets.push({
      sourceFile,
      ordinal: datasets.length + 1,
      datasetLabel: current.datasetLabel,
      componentLabels: current.componentLabels,
      recordCount: current.recordCount,
      numericTokenCount: current.numericTokenCount,
      finiteValueCount: current.finiteValueCount,
      minimum: current.finiteValueCount ? current.minimum : null,
      maximum: current.finiteValueCount ? current.maximum : null,
    });
    current = null;
  };
  rows.forEach((line) => {
    const header = line.match(/^\s*-4\s+([A-Za-z0-9_.:-]+)/u);
    if (header) {
      closeCurrent();
      current = {
        datasetLabel: header[1].toUpperCase(),
        componentLabels: [],
        recordCount: 0,
        numericTokenCount: 0,
        finiteValueCount: 0,
        minimum: Infinity,
        maximum: -Infinity,
      };
      return;
    }
    if (!current) return;
    const component = line.match(/^\s*-5\s+([A-Za-z0-9_.:-]+)/u);
    if (component) {
      current.componentLabels.push(component[1]);
      return;
    }
    if (/^\s*-3\b/u.test(line)) {
      closeCurrent();
      return;
    }
    if (/^\s*-1\b/u.test(line)) {
      current.recordCount += 1;
      const tokens = line.trim().split(/\s+/u).slice(2);
      current.numericTokenCount += tokens.length;
      tokens.forEach((token) => {
        const value = Number(token.replace(/[dD]/u, 'E'));
        if (!Number.isFinite(value)) return;
        current.finiteValueCount += 1;
        current.minimum = Math.min(current.minimum, value);
        current.maximum = Math.max(current.maximum, value);
      });
    }
  });
  closeCurrent();
  return datasets;
}

function parseStepInventory(text) {
  const rows = [];
  const seen = new Set();
  const add = (stepId, source) => {
    const id = String(stepId);
    const key = `${source}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ stepId: id, ordinal: rows.length + 1, source });
  };
  for (const match of text.matchAll(/^\s*STEP\s+(?:NAME\s*=\s*)?([A-Za-z0-9_.:-]+)\s*$/gimu)) {
    add(match[1], 'TEXT_STEP_MARKER');
  }
  for (const match of text.matchAll(/^\s*1PSTEP\s+[0-9]+\s+[0-9]+\s+([0-9]+)\s*$/gmu)) {
    add(match[1], 'FRD_PARAMETER_HEADER');
  }
  return rows;
}

function parseIncrementInventory(text) {
  const rows = [];
  for (const match of text.matchAll(
    /^\s*STEP\s+([A-Za-z0-9_.:-]+).*?\bINCREMENT\s+([0-9]+).*$/gimu,
  )) {
    rows.push({
      ordinal: rows.length + 1,
      stepId: match[1],
      solverIncrementId: Number(match[2]),
      source: 'COMBINED_TEXT_MARKER',
    });
  }
  if (rows.length === 0) {
    let latestStep = null;
    for (const line of text.split(/\r?\n/u)) {
      const step = line.match(/^\s*STEP\s+(?:NAME\s*=\s*)?([A-Za-z0-9_.:-]+)\s*$/iu);
      if (step) latestStep = step[1];
      const increment = line.match(
        /^\s*INCREMENT\s+([0-9]+)(?:\s+ATTEMPT\s+[0-9]+)?\s*$/iu,
      );
      if (increment) {
        rows.push({
          ordinal: rows.length + 1,
          stepId: latestStep,
          solverIncrementId: Number(increment[1]),
          source: 'TEXT_INCREMENT_MARKER',
        });
      }
    }
  }
  return rows;
}

function assessIncrementSequence(rows) {
  const lastByStep = new Map();
  const violations = [];
  rows.forEach((row) => {
    const key = row.stepId ?? '<UNKNOWN>';
    const previous = lastByStep.get(key);
    if (previous !== undefined && row.solverIncrementId < previous) {
      violations.push({
        stepId: row.stepId,
        previousIncrementId: previous,
        nextIncrementId: row.solverIncrementId,
        ordinal: row.ordinal,
      });
    }
    lastByStep.set(key, row.solverIncrementId);
  });
  return {
    status: violations.length ? 'NON_MONOTONIC' : 'MONOTONIC_OR_EMPTY',
    violations,
  };
}

function hasUnqualifiedNonFiniteDiagnostic(text, completionEstablished) {
  const nonFinite = /(?:\bNAN\b|\bINF(?:INITY)?\b)/iu;
  if (!nonFinite.test(text)) return false;
  if (!completionEstablished) return true;
  const zeroContactEstablished = /NUMBER\s+OF\s+CONTACT\s+SPRING\s+ELEMENTS\s*=\s*0/iu.test(text);
  if (!zeroContactEstablished) return true;
  const lines = text.split(/\r?\n/u);
  return lines.some((line, index) => {
    if (!nonFinite.test(line)) return false;
    if (/PRESSURE\s+RATIO[^\r\n]*=\s*[-+]?NAN\b/iu.test(line)) return false;
    const context = lines.slice(Math.max(0, index - 5), index + 1).join('\n');
    const zeroContactStatistic = /(?:CENTER\s+OF\s+GRAVITY\s+AND\s+MEAN\s+NORMAL|MOMENT\s+ABOUT\s+THE\s+CENTER\s+OF\s+GRAVITY|AREA\s*,\s*NORMAL\s+FORCE)/iu.test(context);
    return !zeroContactStatistic;
  });
}

function detectDatContactOutputs(text) {
  const fields = [];
  const integratedContactHeader = /AREA\s*,\s*NORMAL\s+FORCE\s*\(\+\s*=\s*TENSION\)\s+AND\s+SHEAR\s+FORCE/iu;
  if (/\b(?:CFN|TOTAL\s+NORMAL\s+FORCE)\b/iu.test(text) || integratedContactHeader.test(text)) {
    fields.push('CONTACT_NORMAL_FORCE');
  }
  if (/\b(?:CONTACT\s+AREA|AREA\s+OF\s+THE\s+CONTACT\s+AREA)\b/iu.test(text)
      || integratedContactHeader.test(text)) {
    fields.push('CONTACT_AREA');
  }
  return fields;
}

function decodeBoundedText(bytes, path) {
  if (bytes.length > 50_000_000) throw new TypeError(`Text output ${path} exceeds parser bound.`);
  const text = bytes.toString('utf8');
  if (text.includes('\uFFFD')) throw new TypeError(`Malformed UTF-8 output in ${path}.`);
  return text;
}
