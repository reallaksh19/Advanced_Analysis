#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveInputXmlGeneric } from '../src/core/linear-piping-analysis-consumer/generic-inputxml-solve.js';

const INPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM4/InputXML_BM4.xml', import.meta.url));
const REFERENCE_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM4/Output_BM4.xml', import.meta.url));
const REPORT_PATH = fileURLToPath(new URL('../reports/bm4-case19-21-benchmark.json', import.meta.url));
const STRICT_CASES = Object.freeze([
  Object.freeze({ caseNumber: 19, category: 'SUS', solverField: 'sustained' }),
  Object.freeze({ caseNumber: 20, category: 'OPE', solverField: 'operating' }),
  Object.freeze({ caseNumber: 21, category: 'EXP', solverField: 'derived' }),
]);
const COMPONENTS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const TRANSLATION_COMPONENTS = new Set(['UX', 'UY', 'UZ']);
const STRICT_RELATIVE_LIMIT = 0.05;
const RAD_TO_DEG = 180 / Math.PI;

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function attributes(text) {
  return Object.fromEntries([...text.matchAll(/([A-Z0-9_]+)="([^"]*)"/gu)].map((match) => [match[1], match[2]]));
}

function parseReferenceDisplacements(xml) {
  const reports = new Map();
  const availableCaseNumbers = [];
  const reportPattern = /<DISPLACEMENT_REPORT\b([^>]*)>([\s\S]*?)<\/DISPLACEMENT_REPORT>/gu;
  for (const reportMatch of xml.matchAll(reportPattern)) {
    const reportAttributes = attributes(reportMatch[1]);
    const loadCase = reportAttributes.LOADCASE ?? '';
    const caseMatch = loadCase.match(/^CASE\s+(\d+)\b/u);
    if (!caseMatch) continue;
    const caseNumber = Number(caseMatch[1]);
    availableCaseNumbers.push(caseNumber);
    if (!STRICT_CASES.some((row) => row.caseNumber === caseNumber)) continue;

    const nodes = new Map();
    const nodePattern = /<NODE\b([^>]*)>([\s\S]*?)<\/NODE>/gu;
    for (const nodeMatch of reportMatch[2].matchAll(nodePattern)) {
      const nodeAttributes = attributes(nodeMatch[1]);
      const translationMatch = nodeMatch[2].match(/<TRANSLATIONS\b([^>]*)\/>/u);
      const rotationMatch = nodeMatch[2].match(/<ROTATIONS\b([^>]*)\/>/u);
      if (!nodeAttributes.NUMBER || !translationMatch || !rotationMatch) continue;
      const translation = attributes(translationMatch[1]);
      const rotation = attributes(rotationMatch[1]);
      nodes.set(String(nodeAttributes.NUMBER), Object.freeze({
        UX: Number(translation.DX),
        UY: Number(translation.DY),
        UZ: Number(translation.DZ),
        RX: Number(rotation.RX),
        RY: Number(rotation.RY),
        RZ: Number(rotation.RZ),
      }));
    }
    reports.set(caseNumber, Object.freeze({ loadCase, nodes }));
  }
  return Object.freeze({
    reports,
    availableCaseNumbers: Object.freeze([...new Set(availableCaseNumbers)].sort((a, b) => a - b)),
  });
}

function solverDisplacement(node, field, component) {
  if (field === 'derived') {
    if (!node.operating || !node.sustained) return null;
    return node.operating.displacement[component] - node.sustained.displacement[component];
  }
  const result = node[field];
  return result ? result.displacement[component] : null;
}

function toReferenceUnits(value, component) {
  return TRANSLATION_COMPONENTS.has(component) ? value * 1000 : value * RAD_TO_DEG;
}

function scalarComparison(reference, candidate) {
  const absoluteDifference = Math.abs(candidate - reference);
  if (reference === 0) {
    return Object.freeze({
      absoluteDifference,
      relativeDifference: candidate === 0 ? 0 : null,
      withinStrictLimit: candidate === 0,
      zeroReference: true,
    });
  }
  const relativeDifference = absoluteDifference / Math.abs(reference);
  return Object.freeze({
    absoluteDifference,
    relativeDifference,
    withinStrictLimit: relativeDifference < STRICT_RELATIVE_LIMIT,
    zeroReference: false,
  });
}

function percentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(probability * sorted.length) - 1));
  return sorted[index];
}

function summarizeCase(caseDefinition, referenceReport, solverByNode) {
  const comparisons = [];
  const unmatchedReferenceNodes = [];
  for (const [nodeId, referenceValues] of referenceReport.nodes) {
    const solverNode = solverByNode.get(nodeId);
    if (!solverNode) {
      unmatchedReferenceNodes.push(nodeId);
      continue;
    }
    for (const component of COMPONENTS) {
      const rawCandidate = solverDisplacement(solverNode, caseDefinition.solverField, component);
      if (rawCandidate === null || !Number.isFinite(rawCandidate)) {
        comparisons.push({ nodeId, component, reference: referenceValues[component], candidate: rawCandidate, finite: false, withinStrictLimit: false });
        continue;
      }
      const candidate = toReferenceUnits(rawCandidate, component);
      const comparison = scalarComparison(referenceValues[component], candidate);
      comparisons.push({
        nodeId,
        component,
        reference: referenceValues[component],
        candidate,
        finite: Number.isFinite(candidate),
        ...comparison,
      });
    }
  }

  const finite = comparisons.filter((row) => row.finite);
  const nonZeroRelative = finite.map((row) => row.relativeDifference).filter((value) => value !== null && Number.isFinite(value));
  const failures = comparisons.filter((row) => !row.withinStrictLimit);
  const expectedScalarCount = referenceReport.nodes.size * COMPONENTS.length;
  return Object.freeze({
    caseNumber: caseDefinition.caseNumber,
    category: caseDefinition.category,
    sourceLoadCase: referenceReport.loadCase,
    referenceNodeCount: referenceReport.nodes.size,
    matchedNodeCount: referenceReport.nodes.size - unmatchedReferenceNodes.length,
    unmatchedReferenceNodeCount: unmatchedReferenceNodes.length,
    unmatchedReferenceNodes: unmatchedReferenceNodes.slice(0, 50),
    expectedScalarCount,
    comparedScalarCount: comparisons.length,
    finiteScalarCount: finite.length,
    strictPassScalarCount: comparisons.length - failures.length,
    strictFailScalarCount: failures.length,
    strictPassRate: expectedScalarCount === 0 ? 0 : (comparisons.length - failures.length) / expectedScalarCount,
    maximumAbsoluteDifference: finite.length === 0 ? null : Math.max(...finite.map((row) => row.absoluteDifference)),
    maximumRelativeDifference: nonZeroRelative.length === 0 ? null : Math.max(...nonZeroRelative),
    p50RelativeDifference: percentile(nonZeroRelative, 0.50),
    p95RelativeDifference: percentile(nonZeroRelative, 0.95),
    strictFailuresSample: failures.slice(0, 100),
    disposition: unmatchedReferenceNodes.length === 0 && comparisons.length === expectedScalarCount && failures.length === 0
      ? 'PASS'
      : 'FAIL',
  });
}

function writeReport(report) {
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function normalizedError(error) {
  return {
    name: error?.name ?? 'Error',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
    diagnostics: error?.diagnostics ?? null,
  };
}

function run() {
  const inputXml = readFileSync(INPUT_PATH, 'utf8');
  const referenceXml = readFileSync(REFERENCE_PATH, 'utf8');
  const parsedReference = parseReferenceDisplacements(referenceXml);
  const missingCases = STRICT_CASES.map((row) => row.caseNumber).filter((caseNumber) => !parsedReference.reports.has(caseNumber));
  if (missingCases.length > 0) {
    const error = new Error(`BM4 reference output is missing displacement reports for CASE ${missingCases.join(', CASE ')}.`);
    error.code = 'BM4_REFERENCE_CASE_MISSING';
    throw error;
  }

  const solve = solveInputXmlGeneric(inputXml, {
    modelId: 'BM4',
    fileName: 'InputXML_BM4.xml',
  });
  const solverByNode = new Map(solve.nodes.map((node) => [String(node.sourceNodeId), node]));
  const cases = STRICT_CASES.map((definition) => summarizeCase(
    definition,
    parsedReference.reports.get(definition.caseNumber),
    solverByNode,
  ));
  const expectedScalarCount = cases.reduce((sum, row) => sum + row.expectedScalarCount, 0);
  const comparedScalarCount = cases.reduce((sum, row) => sum + row.comparedScalarCount, 0);
  const strictPassScalarCount = cases.reduce((sum, row) => sum + row.strictPassScalarCount, 0);
  const strictFailScalarCount = cases.reduce((sum, row) => sum + row.strictFailScalarCount, 0);
  const selectedCaseNumbers = STRICT_CASES.map((row) => row.caseNumber);
  const excludedReferenceCaseNumbers = parsedReference.availableCaseNumbers.filter((caseNumber) => !selectedCaseNumbers.includes(caseNumber));
  const completeCoverage = comparedScalarCount === expectedScalarCount;
  const disposition = completeCoverage && strictFailScalarCount === 0 && cases.every((row) => row.disposition === 'PASS')
    ? 'QUALIFIED'
    : 'NOT_QUALIFIED';

  const report = {
    schema: 'lfea-bm4-case19-21-benchmark/v1',
    benchmarkId: 'BM4',
    scope: {
      selectedCases: STRICT_CASES,
      selectedCaseNumbers,
      excludedReferenceCaseNumbers,
      frictionCasesIncluded: false,
      comparisonDomain: 'NODAL_DISPLACEMENT_6DOF',
      translationUnits: 'mm',
      rotationUnits: 'deg',
      strictRelativeLimitExclusive: STRICT_RELATIVE_LIMIT,
      zeroReferencePolicy: 'EXACT_ZERO_REQUIRED',
    },
    custody: {
      inputPath: 'benchmarks/LFEA/BM4/InputXML_BM4.xml',
      inputSha256: sha256(inputXml),
      referencePath: 'benchmarks/LFEA/BM4/Output_BM4.xml',
      referenceSha256: sha256(referenceXml),
      referenceGitBlobSha: '5be0cc70f0d608b0afdfb9878e4085982192bc72',
      referenceCommit: '1d7dee134a925846e11f024e8e7f883a53533829',
    },
    solver: {
      schema: solve.schema,
      thermalCaseAvailable: solve.thermalCaseAvailable,
      thermalExpansionCoefficient: solve.thermalExpansionCoefficient,
      thermalMaterial: solve.thermalMaterial,
      nodeCount: solve.nodes.length,
      elementCount: solve.elements.length,
      limitations: solve.limitations,
    },
    totals: {
      expectedScalarCount,
      comparedScalarCount,
      coverage: expectedScalarCount === 0 ? 0 : comparedScalarCount / expectedScalarCount,
      strictPassScalarCount,
      strictFailScalarCount,
      strictPassRate: expectedScalarCount === 0 ? 0 : strictPassScalarCount / expectedScalarCount,
    },
    cases,
    disposition,
  };

  writeReport(report);
  console.log(JSON.stringify({
    benchmarkId: report.benchmarkId,
    selectedCases: selectedCaseNumbers,
    excludedCaseCount: excludedReferenceCaseNumbers.length,
    thermalCaseAvailable: report.solver.thermalCaseAvailable,
    totals: report.totals,
    cases: cases.map((row) => ({
      caseNumber: row.caseNumber,
      category: row.category,
      referenceNodeCount: row.referenceNodeCount,
      matchedNodeCount: row.matchedNodeCount,
      strictPassScalarCount: row.strictPassScalarCount,
      strictFailScalarCount: row.strictFailScalarCount,
      strictPassRate: row.strictPassRate,
      p95RelativeDifference: row.p95RelativeDifference,
      maximumRelativeDifference: row.maximumRelativeDifference,
      disposition: row.disposition,
    })),
    disposition,
  }, null, 2));
  if (disposition !== 'QUALIFIED') process.exitCode = 2;
}

try {
  run();
} catch (error) {
  const report = {
    schema: 'lfea-bm4-case19-21-benchmark/v1',
    benchmarkId: 'BM4',
    scope: { selectedCaseNumbers: STRICT_CASES.map((row) => row.caseNumber), frictionCasesIncluded: false },
    disposition: 'EXECUTION_ERROR',
    error: normalizedError(error),
  };
  writeReport(report);
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
