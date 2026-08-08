#!/usr/bin/env node
import assert from 'node:assert/strict';
import { normalizeUnilateralDeclarations } from '../src/core/linear-fea-unilateral-solver/index.js';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import {
  analyseM035M036Case,
  buildM035M036Inventory,
} from './lfea-m035-m036-bm4-integration-runtime.mjs';
import {
  BM4_M038_FORCMNT_AUTHORITY,
  BM4_M038_FORCMNT_NODE_IDS,
} from './lfea-m038-bm4-forcmnt-authority.mjs';

function nodalPrimitives(loadCase) {
  return loadCase.primitives.filter((row) => row.kind === 'NODAL_FORCE_MOMENT');
}

function primitiveVector(row) {
  return [row.force.fx, row.force.fy, row.force.fz, row.moment.mx, row.moment.my, row.moment.mz];
}

function mechanicalRows(loadCase, prefix) {
  return nodalPrimitives(loadCase).map((row) => ({
    sourceNodeId: row.nodeId.replace(prefix, ''),
    vector: primitiveVector(row),
  })).sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId));
}

function assertMembership(label, loadCase, prefix) {
  const rows = mechanicalRows(loadCase, prefix);
  assert.equal(rows.length, 12, `${label} must contain exactly 12 BM4 FORCMNT primitives.`);
  assert.deepEqual(rows.map((row) => row.sourceNodeId), [...BM4_M038_FORCMNT_NODE_IDS]);
  return rows;
}

function assertSameMechanicalSet(label, left, right) {
  assert.deepEqual(left, right, `${label} FORCMNT mechanics must be identical.`);
  for (let row = 0; row < left.length; row += 1) {
    for (let component = 0; component < 6; component += 1) {
      assert.equal(
        right[row].vector[component] - left[row].vector[component],
        0,
        `${label} algebraic cancellation failed at ${left[row].sourceNodeId} component ${component}.`,
      );
    }
  }
}

function assertBourdonDisabled(loadCase) {
  for (const pressure of loadCase.primitives.filter((row) => row.kind === 'PRESSURE')) {
    assert.equal(pressure.authorizedEffects.bourdon, false, 'M038 FORCMNT must not silently authorize Bourdon mechanics.');
  }
}

function initialActiveState(inventory) {
  const normalized = normalizeUnilateralDeclarations(inventory.unilateral);
  const active = normalized.filter((row) => row.initiallyEngaged);
  return Object.freeze({
    normalized,
    declarations: Object.freeze([
      ...inventory.base,
      ...active.map((row) => row.constraintDeclaration),
    ]),
    movements: Object.freeze(active.map((row) => row.prescribedMovement).filter((row) => row !== null)),
  });
}

function qualificationSummary(analysis) {
  const factorization = analysis.execution.factorization;
  return Object.freeze({
    status: analysis.execution.status,
    stiffnessStateHash: analysis.compilation.stiffnessStateHash,
    diagnostics: analysis.execution.diagnostics,
    factorization: Object.freeze({
      backend: factorization.backend,
      scaling: factorization.scaling,
      kind: factorization.kind,
      cacheKey: factorization.cacheKey,
      reused: factorization.reused,
      pivotStatistics: factorization.pivotStatistics,
      conditionEstimate: factorization.conditionEstimate,
      conditionEstimateMethod: factorization.conditionEstimateMethod,
    }),
    nodalForcePrimitiveCount: analysis.execution.nodalForceDiagnostics.length,
  });
}

function sameFactorizationState(left, right) {
  assert.equal(left.compilation.stiffnessStateHash, right.compilation.stiffnessStateHash, 'A/B stiffnessStateHash drifted.');
  assert.equal(left.execution.factorization.cacheKey, right.execution.factorization.cacheKey, 'A/B factorization cache key drifted.');
  assert.equal(left.execution.factorization.kind, right.execution.factorization.kind, 'A/B factorization kind drifted.');
  assert.equal(left.execution.factorization.conditionEstimate, right.execution.factorization.conditionEstimate, 'A/B condition estimate drifted.');
  assert.deepEqual(left.execution.factorization.pivotStatistics, right.execution.factorization.pivotStatistics, 'A/B pivot statistics drifted.');
}

const baseline = solveBm4InputXmlConditioned();
const baselineSus = assertMembership('M034 SUS', baseline.sustained.loadCase, 'BM4.N');
const baselineOpe = assertMembership('M034 OPE', baseline.operating.loadCase, 'BM4.N');
assertSameMechanicalSet('M034 SUS/OPE', baselineSus, baselineOpe);
assertBourdonDisabled(baseline.sustained.loadCase);
assertBourdonDisabled(baseline.operating.loadCase);

const authorities = buildBm4M035FeatureAuthorities();
const inventory = buildM035M036Inventory(authorities);
const initial = initialActiveState(inventory);

function analysePair(label, thermal) {
  const legacy = analyseM035M036Case(
    authorities,
    initial.declarations,
    `${label}-LEGACY-RHS`,
    thermal,
    initial.movements,
    { skipRecovery: true, includeForcmnt: false },
  );
  const corrected = analyseM035M036Case(
    authorities,
    initial.declarations,
    `${label}-CORRECTED-RHS`,
    thermal,
    initial.movements,
    { skipRecovery: true, includeForcmnt: true },
  );
  sameFactorizationState(legacy, corrected);
  assert.equal(nodalPrimitives(legacy.loadCase).length, 0, `${label} legacy A/B side must omit FORCMNT only.`);
  return Object.freeze({ legacy, corrected });
}

const sus = analysePair('BM4-M038-DIAG-SUS', false);
const ope = analysePair('BM4-M038-DIAG-OPE', true);

const combinedSus = assertMembership('M035+M036 corrected SUS', sus.corrected.loadCase, 'BM4M035.N');
const combinedOpe = assertMembership('M035+M036 corrected OPE', ope.corrected.loadCase, 'BM4M035.N');
assertSameMechanicalSet('M035+M036 SUS/OPE', combinedSus, combinedOpe);
assertBourdonDisabled(sus.corrected.loadCase);
assertBourdonDisabled(ope.corrected.loadCase);

const report = {
  schema: 'm038-bm4-forcmnt-check/v1',
  authority: BM4_M038_FORCMNT_AUTHORITY,
  mechanics: {
    realVectorRows: combinedSus.length,
    nodeIds: combinedSus.map((row) => row.sourceNodeId),
    susOpeMembershipIdentical: true,
    expansionCancellationExact: true,
    bourdonStillDisabled: true,
  },
  initialContactState: {
    unilateralCount: initial.normalized.length,
    initiallyEngagedCount: initial.normalized.filter((row) => row.initiallyEngaged).length,
    initiallyReleasedCount: initial.normalized.filter((row) => !row.initiallyEngaged).length,
  },
  controlledRhsAB: {
    statement: 'Each pair uses identical model, constraint set, stiffness hash and factorization state; only BM4 FORCMNT membership changes.',
    SUS: {
      legacy: qualificationSummary(sus.legacy),
      corrected: qualificationSummary(sus.corrected),
    },
    OPE: {
      legacy: qualificationSummary(ope.legacy),
      corrected: qualificationSummary(ope.corrected),
    },
  },
};

console.log(JSON.stringify(report, null, 2));

assert.notEqual(
  sus.corrected.execution.status,
  'BLOCKED',
  'M038 corrected SUS inner solve is BLOCKED; controlledRhsAB proves whether this is RHS-exposed numerical accuracy.',
);
assert.notEqual(
  ope.corrected.execution.status,
  'BLOCKED',
  'M038 corrected OPE inner solve is BLOCKED; controlledRhsAB proves whether this is RHS-exposed numerical accuracy.',
);
