#!/usr/bin/env node
import assert from 'node:assert/strict';
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
  const active = inventory.unilateral.filter((row) => row.initiallyEngaged !== false);
  return Object.freeze({
    declarations: Object.freeze([
      ...inventory.base,
      ...active.map((row) => row.constraintDeclaration),
    ]),
    movements: Object.freeze(active.map((row) => row.prescribedMovement).filter((row) => row !== null)),
  });
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
const diagnosticSus = analyseM035M036Case(
  authorities,
  initial.declarations,
  'BM4-M038-DIAG-SUS',
  false,
  initial.movements,
  { skipRecovery: true },
);
const diagnosticOpe = analyseM035M036Case(
  authorities,
  initial.declarations,
  'BM4-M038-DIAG-OPE',
  true,
  initial.movements,
  { skipRecovery: true },
);

const combinedSus = assertMembership('M035+M036 diagnostic SUS', diagnosticSus.loadCase, 'BM4M035.N');
const combinedOpe = assertMembership('M035+M036 diagnostic OPE', diagnosticOpe.loadCase, 'BM4M035.N');
assertSameMechanicalSet('M035+M036 SUS/OPE', combinedSus, combinedOpe);
assertBourdonDisabled(diagnosticSus.loadCase);
assertBourdonDisabled(diagnosticOpe.loadCase);

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
  initialActiveSetCount: initial.movements.length,
  solverQualification: {
    SUS: {
      status: diagnosticSus.execution.status,
      diagnostics: diagnosticSus.execution.diagnostics,
      factorization: diagnosticSus.execution.factorization,
      nodalForceDiagnostics: diagnosticSus.execution.nodalForceDiagnostics,
    },
    OPE: {
      status: diagnosticOpe.execution.status,
      diagnostics: diagnosticOpe.execution.diagnostics,
      factorization: diagnosticOpe.execution.factorization,
      nodalForceDiagnostics: diagnosticOpe.execution.nodalForceDiagnostics,
    },
  },
};

console.log(JSON.stringify(report, null, 2));

assert.notEqual(
  diagnosticSus.execution.status,
  'BLOCKED',
  'M038 corrected SUS inner solve is BLOCKED; inspect solverQualification.SUS above before active-set/recovery work.',
);
assert.notEqual(
  diagnosticOpe.execution.status,
  'BLOCKED',
  'M038 corrected OPE inner solve is BLOCKED; inspect solverQualification.OPE above before active-set/recovery work.',
);
