#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { diagnoseInputXmlLoad } from '../src/core/geometry/adapters/inputxml-load-diagnostics.js';
import {
  DEFAULT_RESTRAINT_TYPE_CODE_MAP,
} from '../src/core/geometry/adapters/inputxml-restraint-type-mutation.js';
import {
  parseInputXmlModelHealthSource,
} from '../src/core/geometry/adapters/inputxml-model-health-source.js';
import {
  diagnoseInputXmlModelHealthProximity,
  diagnoseInputXmlModelHealthTopology,
} from '../src/core/linear-piping-analysis-consumer/inputxml-model-health.js';

const FILE_NAME = 'InputXML_BM4.xml';
const SOURCE_PATH = fileURLToPath(new URL(`../benchmarks/LFEA/BM4/${FILE_NAME}`, import.meta.url));
const REPORT_PATH = fileURLToPath(new URL('../reports/bm4-intake-model-health.json', import.meta.url));
const EXPECTED = Object.freeze({
  elements: 96,
  bends: 12,
  rigids: 20,
  restraints: 30,
  forceMoments: 12,
});

function countTag(xml, tagName) {
  return [...xml.matchAll(new RegExp(`<${tagName}\\b`, 'gu'))].length;
}

function readDeclaredCounts(xml) {
  const model = xml.match(/<PIPINGMODEL\b([^>]*)>/u);
  if (!model) return null;
  const value = (name) => {
    const match = model[1].match(new RegExp(`\\b${name}="([^"]+)"`, 'u'));
    return match ? Number(match[1]) : null;
  };
  return {
    elements: value('NUMELT'),
    bends: value('NUMBEND'),
    rigids: value('NUMRIGID'),
    restraints: value('NUMREST'),
    forceMoments: value('NUMFORCMNT'),
  };
}

function normalizedError(error) {
  return {
    name: error?.name ?? 'Error',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
}

function writeReport(report) {
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function addMismatch(blockers, label, actual, expected) {
  if (actual !== expected) {
    blockers.push({
      code: 'BM4_SOURCE_COUNT_MISMATCH',
      field: label,
      expected,
      actual,
    });
  }
}

function run() {
  const xml = readFileSync(SOURCE_PATH, 'utf8');
  const sourceSha256 = createHash('sha256').update(xml, 'utf8').digest('hex');
  const declared = readDeclaredCounts(xml);
  const observed = {
    elements: countTag(xml, 'PIPINGELEMENT'),
    bends: countTag(xml, 'BEND'),
    rigids: countTag(xml, 'RIGID'),
    restraints: countTag(xml, 'RESTRAINT'),
    forceMoments: countTag(xml, 'FORCE'),
  };
  const options = Object.freeze({
    unit: 'mm',
    source: 'BM4_INPUTXML',
    fileName: FILE_NAME,
    restraintTypeCodeMap: DEFAULT_RESTRAINT_TYPE_CODE_MAP,
  });
  const sourceBundle = parseInputXmlModelHealthSource(xml, options);
  const topologyReport = diagnoseInputXmlModelHealthTopology(sourceBundle);
  const proximityReport = diagnoseInputXmlModelHealthProximity(sourceBundle);
  const loadReport = diagnoseInputXmlLoad(xml, { fileName: FILE_NAME });

  const blockers = [];
  const warnings = [];
  if (!declared) {
    blockers.push({ code: 'BM4_PIPINGMODEL_HEADER_MISSING' });
  } else {
    for (const [field, expected] of Object.entries(EXPECTED)) {
      addMismatch(blockers, `declared.${field}`, declared[field], expected);
    }
  }
  addMismatch(blockers, 'observed.elements', observed.elements, EXPECTED.elements);
  addMismatch(blockers, 'observed.bends', observed.bends, EXPECTED.bends);
  addMismatch(blockers, 'observed.rigids', observed.rigids, EXPECTED.rigids);
  addMismatch(blockers, 'observed.restraints', observed.restraints, EXPECTED.restraints);
  addMismatch(blockers, 'sourceBundle.sourceRecordCount', sourceBundle.sourceRecordCount, EXPECTED.elements);

  if (!sourceBundle.geometry.valid) {
    blockers.push({ code: 'BM4_CANONICAL_GEOMETRY_INVALID' });
  }
  const unresolvedSourceRows = sourceBundle.elementRecords.filter(
    (row) => row.canonicalStatus !== 'RECONCILED',
  ).map((row) => row.sourceFeatureId);
  if (unresolvedSourceRows.length > 0) {
    blockers.push({ code: 'BM4_SOURCE_ROWS_UNRESOLVED', sourceFeatureIds: unresolvedSourceRows });
  }
  if (!loadReport.valid) {
    blockers.push({ code: 'BM4_LOAD_DIAGNOSTICS_INVALID' });
  }
  if ((loadReport.criticalFindings?.unresolvedRestraintCount ?? 0) > 0) {
    blockers.push({
      code: 'BM4_RESTRAINT_TYPES_UNRESOLVED',
      count: loadReport.criticalFindings.unresolvedRestraintCount,
    });
  }
  if (topologyReport.status === 'BLOCKED') {
    blockers.push({ code: 'BM4_TOPOLOGY_BLOCKED' });
  } else if (topologyReport.status !== 'PASS') {
    warnings.push({ code: 'BM4_TOPOLOGY_CONDITIONAL', status: topologyReport.status });
  }
  if (proximityReport.status === 'BLOCKED') {
    blockers.push({ code: 'BM4_PROXIMITY_BLOCKED' });
  } else if (proximityReport.status !== 'PASS') {
    warnings.push({ code: 'BM4_PROXIMITY_CONDITIONAL', status: proximityReport.status });
  }
  if ((loadReport.warningCount ?? 0) > 0) {
    warnings.push({ code: 'BM4_LOAD_WARNINGS', count: loadReport.warningCount });
  }
  const nonFiniteSourceTokens = [...xml.matchAll(/-nan/giu)].length;
  if (nonFiniteSourceTokens > 0) {
    warnings.push({ code: 'BM4_SOURCE_NONFINITE_SENTINEL_TEXT', count: nonFiniteSourceTokens });
  }

  const disposition = blockers.length > 0
    ? 'BLOCKED'
    : warnings.length > 0
      ? 'CONDITIONAL'
      : 'PASS';
  const report = {
    schema: 'lfea-bm4-intake-model-health-run/v1',
    benchmarkId: 'BM4',
    fileName: FILE_NAME,
    sourcePath: 'benchmarks/LFEA/BM4/InputXML_BM4.xml',
    sourceByteLength: Buffer.byteLength(xml, 'utf8'),
    sourceSha256,
    declared,
    observed,
    expected: EXPECTED,
    sourceBundle: {
      schema: sourceBundle.schema,
      jobName: sourceBundle.jobName,
      sourceRecordCount: sourceBundle.sourceRecordCount,
      canonicalSegmentCount: sourceBundle.canonicalSegmentCount,
      geometryValid: sourceBundle.geometry.valid,
      geometryDiagnosticCount: sourceBundle.geometry.diagnostics.length,
      unresolvedSourceRows,
    },
    loadDiagnostics: {
      valid: loadReport.valid,
      errorCount: loadReport.errorCount,
      warningCount: loadReport.warningCount,
      criticalFindings: loadReport.criticalFindings,
      topology: loadReport.topology,
      restraintRecordCount: loadReport.restraints.length,
      diagnostics: loadReport.diagnostics,
    },
    topologyDiagnostics: topologyReport,
    proximityDiagnostics: proximityReport,
    solve: {
      attempted: false,
      authority: 'NOT_AUTHORIZED_BY_THIS_INTAKE_RUN',
      reason: 'Current main requires a separately governed full-source mechanical-model, load-case, constraint, solver, and recovery binding before execution.',
    },
    blockers,
    warnings,
    disposition,
  };
  writeReport(report);
  console.log(JSON.stringify({
    benchmarkId: report.benchmarkId,
    sourceSha256: report.sourceSha256,
    declared: report.declared,
    observed: report.observed,
    canonicalSegmentCount: report.sourceBundle.canonicalSegmentCount,
    loadValid: report.loadDiagnostics.valid,
    topologyStatus: topologyReport.status,
    proximityStatus: proximityReport.status,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    disposition,
  }, null, 2));
  if (blockers.length > 0) process.exitCode = 2;
}

try {
  run();
} catch (error) {
  const report = {
    schema: 'lfea-bm4-intake-model-health-run/v1',
    benchmarkId: 'BM4',
    disposition: 'EXECUTION_ERROR',
    error: normalizedError(error),
  };
  writeReport(report);
  console.error(report.error);
  process.exitCode = 1;
}
