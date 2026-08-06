import { clonePlain } from './contracts.js';
import { DEFAULT_CONTACT_PROCEDURE, REQUIRED_CONTACT_BENCHMARKS } from './contact-procedure-contract.js';
import { evaluateContactQualification } from './contact-qualification-evaluator.js';
import { FIXTURE_HEAD, createQualifiedContactEvidenceSet, createQualifiedNc01BindingFixture, resealContactEvidence } from './nc02-fixtures.js';

export function runNc02NegativeControls() {
  const upstreamBinding = createQualifiedNc01BindingFixture();
  const baseline = createQualifiedContactEvidenceSet();
  const controls = [
    mutate('CALLER_CREATED_PASS', baseline, 0, (row) => { row.passed = true; }, false),
    mutate('STALE_EXACT_HEAD', baseline, 0, (row) => { row.exactHeadSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; }),
    mutate('TAMPERED_EVIDENCE', baseline, 0, (row) => { row.observedError = 0.1; }, false),
    mutate('FALSE_TENSILE_PRESSURE', baseline, 1, (row) => { row.pressureRange = [-1,0]; }),
    mutate('EXCESS_PENETRATION', baseline, 0, (row) => { row.penetrationRatio = 0.02; }),
    mutate('NONZERO_TANGENTIAL_TRACTION', baseline, 2, (row) => { row.tangentialTractionMax = 1; }),
    mutate('CONTACT_WORK_IMBALANCE', baseline, 2, (row) => { row.contactWorkImbalance = 0.01; }),
    mutate('UNBALANCED_RESULTANT', baseline, 0, (row) => { row.globalEquilibriumResidual = 0.01; }),
    mutate('MISSED_RECONTACT', baseline, 6, (row) => { row.stateSequence[2].active = false; }),
    mutate('PENALTY_NONMONOTONICITY', baseline, 8, (row) => { row.penaltySweep[1].penetrationRatio = 0.02; }),
    mutate('NONREFINING_MESH', baseline, 9, (row) => { row.meshLevels[2].globalH = row.meshLevels[1].globalH; }),
    mutate('MUTATION_NOT_DETECTED', baseline, 0, (row) => { row.mutation.mutatedError = 0; }),
    { id:'MISSING_BENCHMARK', evidence:baseline.slice(0,-1) },
    { id:'DUPLICATE_BENCHMARK', evidence:[...baseline, baseline[0]] },
  ];
  return controls.map((control) => {
    const report = evaluateContactQualification({ contract:DEFAULT_CONTACT_PROCEDURE, upstreamBinding, candidateExactHeadSha:FIXTURE_HEAD, benchmarkEvidence:control.evidence });
    return { controlId:control.id, passed:report.status === 'NC02_BLOCKED', reason:report.blockers[0] ?? 'NO_BLOCKER' };
  });
}

function mutate(id, baseline, index, fn, reseal = true) {
  const evidence = baseline.map((row) => clonePlain(row));
  fn(evidence[index]);
  if (reseal) evidence[index] = resealContactEvidence(evidence[index]);
  return { id, evidence };
}
