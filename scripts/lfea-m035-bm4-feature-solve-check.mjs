#!/usr/bin/env node
import assert from 'node:assert/strict';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';

console.log('\n--- M035 BM4 feature-aware bend/tee solve ---');
const result = solveBm4M035FeatureCases();
const { report, sustained, operating, expansion } = result;

assert.equal(report.schema, 'm035-bm4-feature-solve-report/v1');
assert.equal(report.summary.bendComponents, 11);
assert.equal(report.summary.teeJunctions, 2);
assert.equal(report.summary.inlineReducerCandidates, 7);
assert.equal(report.summary.reducerCondensationActive, 0);
assert.ok(report.summary.analysisElements > report.summary.sourceElements);
assert.ok(report.summary.analysisNodes > report.summary.sourceNodes);
assert.ok(sustained.execution.displacement.length > 0);
assert.ok(operating.execution.displacement.length > 0);
assert.ok(expansion.nodalDisplacements.length > 0);
assert.equal(report.nodes.length, report.summary.sourceNodes);
assert.equal(report.elements.length, report.summary.sourceElements);
assert.ok(report.nodes.every((row) => ['sustained','operating','expansion'].every((key) => row[key] && Object.values(row[key]).every(Number.isFinite))));
assert.ok(report.elements.every((row) => ['sustained','operating','expansion'].every((key) => row[key] && ['local','global'].every((basis) => ['I','J'].every((end) => Object.values(row[key][basis][end]).every(Number.isFinite))))));
assert.ok(report.limitations.some((row) => row.includes('reducer')));
assert.ok(report.limitations.some((row) => row.includes('One-way +Y')));

console.log(JSON.stringify({
  status: 'PASS',
  summary: report.summary,
  sustainedSolver: sustained.execution.assessment ?? sustained.execution.status ?? null,
  operatingSolver: operating.execution.assessment ?? operating.execution.status ?? null,
  reportFeatureHash: report.featureSemanticHash,
}, null, 2));
console.log('M035 BM4 feature-aware bend/tee solve PASS');
