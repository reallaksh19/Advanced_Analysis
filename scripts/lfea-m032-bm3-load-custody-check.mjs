#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { solveBm3M032LoadCustody } from './lfea-m032-bm3-load-custody.mjs';

const REPORT_PATH = fileURLToPath(new URL('../reports/m032-bm3-load-custody.json', import.meta.url));

console.log('\n--- M032 BM3 declared F1 and physical load-set custody ---');

const solved = solveBm3M032LoadCustody();
const declared = solved.declaredForceMoments;
assert.equal(declared.summary.declarationCount, 2);
assert.equal(declared.summary.primitiveCount, 2);
assert.equal(declared.summary.globalBasisCount, 2);
assert.deepEqual(declared.authorities.map((row) => row.sourceNodeId).sort(), ['100', '65']);
assert.ok(declared.authorities.every((row) => row.vectorNumber === 1));
assert.ok(declared.authorities.every((row) => row.basis === 'GLOBAL'));
assert.ok(declared.authorities.every((row) => row.force.fx === 0));
assert.ok(declared.authorities.every((row) => row.force.fy === -4000));
assert.ok(declared.authorities.every((row) => row.force.fz === 0));
assert.ok(declared.authorities.every((row) => Object.values(row.moment).every((value) => value === 0)));
assert.equal(new Set(declared.primitives.map((row) => row.primitiveId)).size, 2);

const expected = Object.freeze({
  CASE3_OPE: Object.freeze({ f1: 0, hangerPreload: 2, hangerStiffness: true, thermal: true, temperatureField: 'operatingTemperature' }),
  CASE4_SUS: Object.freeze({ f1: 0, hangerPreload: 2, hangerStiffness: true, thermal: true, temperatureField: 'operatingTemperature2' }),
  CASE5_OCC: Object.freeze({ f1: 2, hangerPreload: 2, hangerStiffness: true, thermal: false, temperatureField: null }),
  CASE6_NO_FRICTION: Object.freeze({ f1: 0, hangerPreload: 2, hangerStiffness: true, thermal: true, temperatureField: 'operatingTemperature2' }),
  CASE7_NO_FRICTION: Object.freeze({ f1: 0, hangerPreload: 0, hangerStiffness: true, thermal: false, temperatureField: null }),
});
for (const [caseKey, policy] of Object.entries(expected)) {
  const custody = solved.custody[caseKey];
  assert.equal(custody.physicalLoads.declaredF1PrimitiveCount, policy.f1, `${caseKey} F1 custody`);
  assert.equal(custody.physicalLoads.hangerPreloadPrimitiveCount, policy.hangerPreload, `${caseKey} hanger preload custody`);
  assert.equal(custody.physicalLoads.hangerStiffness, policy.hangerStiffness, `${caseKey} hanger stiffness custody`);
  assert.equal(custody.physicalLoads.thermal, policy.thermal, `${caseKey} thermal custody`);
  assert.equal(custody.physicalLoads.temperatureField, policy.temperatureField, `${caseKey} temperature-field custody`);
  assert.equal(custody.physicalLoads.friction, false, `${caseKey} friction custody`);
  assert.equal(custody.solverQualification.status, 'QUALIFIED', `${caseKey} solver status`);
  assert.equal(custody.solverQualification.forceEquilibrium, 'PASS', `${caseKey} force equilibrium`);
  assert.equal(custody.solverQualification.momentEquilibrium, 'PASS', `${caseKey} moment equilibrium`);
  assert.ok(custody.solverQualification.normalizedResidual <= 1e-6, `${caseKey} normalized residual`);
}

const case5F1 = solved.cases.CASE5_OCC.loadCase.primitives.filter((row) =>
  declared.primitives.some((declaredPrimitive) => declaredPrimitive.primitiveId === row.primitiveId));
assert.equal(case5F1.length, 2, 'CASE 5 must assemble each declared F1 primitive exactly once.');
assert.equal(case5F1.reduce((sum, row) => sum + row.force.fy, 0), -8000);
for (const caseKey of ['CASE3_OPE', 'CASE4_SUS', 'CASE6_NO_FRICTION', 'CASE7_NO_FRICTION']) {
  assert.equal(
    solved.cases[caseKey].loadCase.primitives.some((row) => declared.primitives.some((f1) => f1.primitiveId === row.primitiveId)),
    false,
    `${caseKey} must not assemble F1`,
  );
}

const case4 = solved.cases.CASE4_SUS.execution.displacement;
const case6 = solved.cases.CASE6_NO_FRICTION.execution.displacement;
assert.equal(case4.length, case6.length);
for (let index = 0; index < case4.length; index += 1) {
  assert.equal(case4[index].nodeId, case6[index].nodeId);
  assert.equal(case4[index].dof, case6[index].dof);
  assert.ok(Math.abs(case4[index].value - case6[index].value) <= 1e-12, `CASE 4/6 physical equality at ${case4[index].nodeId}:${case4[index].dof}`);
}

const effects = solved.controlledStudies.effects;
assert.ok(effects.hangerAtF1Off.l2DisplacementDelta > 0, 'H-only toggle must change the response.');
assert.ok(effects.f1AtHangerOff.l2DisplacementDelta > 0, 'F1-only toggle without hangers must change the response.');
assert.ok(effects.f1AtHangerOn.l2DisplacementDelta > 0, 'F1-only toggle with hangers must change the response.');
assert.equal(solved.controlledStudies.design, 'TWO_BY_TWO_HANGER_F1_FACTORIAL_WITH_FRICTION_HELD_OFF');

assert.deepEqual(solved.remainingGaps, []);

const retained = Object.freeze({
  schema: 'm032-bm3-load-custody-qualification/v2',
  status: 'PASS',
  sourceSemanticHash: solved.sourceSemanticHash,
  declaredForceMoments: Object.freeze({
    selectedVectorNumbers: declared.selectedVectorNumbers,
    summary: declared.summary,
    authorities: declared.authorities,
    semanticHash: declared.semanticHash,
  }),
  caseCustody: solved.custody,
  controlledStudies: Object.freeze({
    design: solved.controlledStudies.design,
    effects: solved.controlledStudies.effects,
  }),
  hangerSelections: Object.freeze(solved.predecessor.solved.hangerDesign.designs.map((design) => Object.freeze({
    nodeId: design.nodeId,
    figure: design.selected.figure,
    size: design.selected.size,
    springRate: design.selected.springRate,
    hotLoad: design.selected.hotLoad,
    signedOperatingTravel: design.selected.signedOperatingTravel,
  }))),
  remainingGaps: solved.remainingGaps,
});
mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(retained, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  check: 'm032-bm3-load-custody',
  status: retained.status,
  declaredF1Count: retained.declaredForceMoments.summary.declarationCount,
  case5F1ResultantFy: case5F1.reduce((sum, row) => sum + row.force.fy, 0),
  caseCustody: Object.fromEntries(Object.entries(retained.caseCustody).map(([key, row]) => [key, row.physicalLoads])),
  controlledEffects: retained.controlledStudies.effects,
  remainingGaps: retained.remainingGaps.map((row) => row.code),
}, null, 2));
console.log('M032 F1 compilation, CASE 3-7 custody, thermal-state selection, hanger hardware custody and controlled H/F1 studies PASS.');
