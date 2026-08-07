#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  diagnoseBm4M035FeatureStiffness,
  diagnoseBm4M035PhysicalCases,
} from './lfea-m035-bm4-feature-solver-diagnostic.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';

console.log('\n--- M035 BM4 feature-model stiffness qualification ---');
const stiffnessDiagnostic = diagnoseBm4M035FeatureStiffness();
console.log(JSON.stringify(stiffnessDiagnostic, null, 2));
assert.ok(Number.isFinite(stiffnessDiagnostic.factorization.conditionEstimate));

console.log('\n--- M035 BM4 loaded SUS/OPE solver qualification ---');
const physicalDiagnostics = diagnoseBm4M035PhysicalCases();
console.log(JSON.stringify(physicalDiagnostics, null, 2));
assert.ok(['QUALIFIED', 'CONDITIONAL', 'BLOCKED'].includes(physicalDiagnostics.sustained.status));
assert.ok(['QUALIFIED', 'CONDITIONAL', 'BLOCKED'].includes(physicalDiagnostics.operating.status));

console.log('\n--- M035 BM4 feature-aware bend/tee solve ---');
const result = solveBm4M035FeatureCases();
const { report, sustained, operating, expansion, authorities } = result;

assert.equal(report.schema, 'm035-bm4-feature-solve-report/v1');
assert.equal(report.summary.bendComponents, 11);
assert.equal(report.summary.teeJunctions, 2);
assert.equal(report.summary.inlineReducerCandidates, 6);
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

// IX-S36 is both the branch leg of tee 20295 and a real bend. Tee compliance
// belongs on the generated incoming straight at the junction; B-3.2 remains
// the sole owner of every arc element. This proves the two flexibilities are in
// series without applying the tee spring repeatedly across bend subdivisions.
const teeBendOverlap = authorities.entries.filter((row) => row.sourceSegmentId === 'IX-S36');
const teeCarriers = teeBendOverlap.filter((row) => row.teeModifier !== null);
const bendArcEntries = teeBendOverlap.filter((row) => row.bendComponent !== null);
assert.equal(teeCarriers.length, 1, 'IX-S36 tee flexibility must have exactly one analysis-span carrier.');
assert.equal(teeCarriers[0].segment.meta.analysisRole, 'BEND_INCOMING_STRAIGHT');
assert.equal(String(teeCarriers[0].segment.startNodeId), '20295');
assert.ok(teeCarriers[0].teeModifier.endSprings.every((row) => row.end === 'I'));
assert.ok(bendArcEntries.length > 0, 'IX-S36 must retain its B-3.2 bend arc elements.');
assert.ok(bendArcEntries.every((row) => row.teeModifier === null), 'Tee flexibility must never leak into B-3.2 bend arc elements.');

console.log(JSON.stringify({
  status: 'PASS',
  stiffnessDiagnostic,
  physicalDiagnostics,
  summary: report.summary,
  teeBendOverlap: {
    sourceSegmentId: 'IX-S36',
    teeCarrierElementId: teeCarriers[0].elementId,
    teeCarrierRole: teeCarriers[0].segment.meta.analysisRole,
    bendArcElementCount: bendArcEntries.length,
  },
  sustainedSolver: sustained.execution.status,
  operatingSolver: operating.execution.status,
  reportFeatureHash: report.featureSemanticHash,
}, null, 2));
console.log('M035 BM4 feature-aware bend/tee solve PASS');
