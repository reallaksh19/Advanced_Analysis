import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';

export const TL05_INDEPENDENT_REFERENCE_METHOD = 'INDEPENDENT_EXHAUSTIVE_COMPLEMENTARITY_ORACLE_V1';

export function solveIndependentTlBComplementarityReference(intake) {
  if (intake?.schema !== 'engineering-preproduction-thermal-liftoff-active-set-intake/v1'
      || intake.status !== 'READY_FOR_TL04_ACTIVE_SET') throw coded('TL05_ORACLE_INTAKE_NOT_READY');
  const ids = [...intake.ordering];
  if (ids.length > 12) throw coded('TL05_ORACLE_STATE_SPACE_TOO_LARGE');
  const supportById = new Map(intake.supports.map((x) => [x.supportSiteId, x]));
  const cold = ids.map((id) => supportById.get(id).coldGravityReactionN);
  const free = ids.map((id) => supportById.get(id).freeOpeningM);
  const admissible = [];
  const stateCount = (2 ** ids.length) - 1;
  for (let mask = 1; mask < 2 ** ids.length; mask += 1) {
    const active = ids.filter((_, i) => mask & (1 << i));
    const solved = solveState(intake, ids, supportById, cold, free, new Set(active));
    if (solved.admissible) admissible.push(solved);
  }
  const problemSemanticHash = independentProblemHash(intake);
  if (admissible.length !== 1) {
    return {
      referenceMethod: TL05_INDEPENDENT_REFERENCE_METHOD,
      problemSemanticHash,
      enumeratedStateCount: stateCount,
      admissibleStateCount: admissible.length,
      supportResults: [],
      diagnostics: { candidateOutputConsumed:false, iterativeActiveSetUsed:false, exhaustiveStateEnumerationPerformed:true },
    };
  }
  const winner = admissible[0];
  return {
    referenceMethod: TL05_INDEPENDENT_REFERENCE_METHOD,
    problemSemanticHash,
    enumeratedStateCount: stateCount,
    admissibleStateCount: 1,
    supportResults: ids.map((id, i) => ({
      supportSiteId: id,
      state: winner.active.has(id) ? 'ACTIVE' : 'LIFTED',
      referenceTotalReactionN: winner.reaction[i],
      referenceHotGapM: winner.gap[i],
    })),
    diagnostics: { candidateOutputConsumed:false, iterativeActiveSetUsed:false, exhaustiveStateEnumerationPerformed:true },
  };
}

function solveState(intake, ids, supportById, cold, free, active) {
  let gravity;
  try { gravity = redistribute(intake, ids, supportById, active); } catch { return { admissible:false }; }
  const gravityDelta = gravity.map((x, i) => x - cold[i]);
  const activeIndexes = ids.map((_,i)=>i).filter((i)=>active.has(ids[i]));
  const a = activeIndexes.map((i) => activeIndexes.map((j) => intake.flexibilityMatrixMPerN[i][j]));
  const rhs = activeIndexes.map((i) => -(free[i] + dot(intake.flexibilityMatrixMPerN[i], gravityDelta)));
  let local;
  try { local = solveLinear(a, rhs, intake.numericalControls.matrixPivotToleranceMPerN); } catch { return { admissible:false }; }
  const thermal = ids.map(() => 0);
  activeIndexes.forEach((i,k)=>{ thermal[i]=local[k]; });
  const reaction = ids.map((id,i)=>active.has(id) ? gravity[i] + thermal[i] : 0);
  const change = ids.map((_,i)=>gravityDelta[i]+thermal[i]);
  const gap = ids.map((_,i)=>free[i]+dot(intake.flexibilityMatrixMPerN[i], change));
  const reactionTolerance = intake.reactionToleranceN;
  const gapTolerance = intake.numericalControls.gapToleranceM;
  const compTolerance = intake.numericalControls.complementarityToleranceNM;
  const admissible = ids.every((id,i) => active.has(id)
    ? reaction[i] >= -reactionTolerance && Math.abs(gap[i]) <= gapTolerance && Math.abs(reaction[i]*gap[i]) <= compTolerance
    : reaction[i] === 0 && gap[i] >= -gapTolerance);
  return { admissible, active, reaction, gap };
}

function redistribute(intake, ids, supportById, active) {
  const activeRows = ids.filter((id)=>active.has(id)).map((id)=>supportById.get(id)).sort((a,b)=>a.routeChainageMm-b.routeChainageMm);
  if (!activeRows.length) throw coded('TL05_ORACLE_NO_ACTIVE_SUPPORTS');
  const reactions = Object.fromEntries(ids.map((id)=>[id,0]));
  for (const load of intake.gravityContributions) {
    const x = load.chainageMm; const p = load.verticalForceN;
    const exact = activeRows.find((s)=>s.routeChainageMm === x);
    if (exact) { reactions[exact.supportSiteId] += p; continue; }
    const left = [...activeRows].reverse().find((s)=>s.routeChainageMm < x);
    const right = activeRows.find((s)=>s.routeChainageMm > x);
    if (!left || !right) throw coded('TL05_ORACLE_UNBRACKETED_GRAVITY');
    const span = right.routeChainageMm-left.routeChainageMm;
    reactions[left.supportSiteId] += p*(right.routeChainageMm-x)/span;
    reactions[right.supportSiteId] += p*(x-left.routeChainageMm)/span;
  }
  return ids.map((id)=>reactions[id]);
}

function solveLinear(a,b,pivotTolerance) {
  const n=a.length; const m=a.map((row,i)=>[...row,b[i]]);
  for (let c=0;c<n;c+=1) {
    let p=c; for (let r=c+1;r<n;r+=1) if (Math.abs(m[r][c])>Math.abs(m[p][c])) p=r;
    if (Math.abs(m[p][c])<=pivotTolerance) throw coded('TL05_ORACLE_SINGULAR_MATRIX');
    [m[c],m[p]]=[m[p],m[c]];
    const pivot=m[c][c]; for (let j=c;j<=n;j+=1) m[c][j]/=pivot;
    for (let r=0;r<n;r+=1) if (r!==c) { const factor=m[r][c]; for (let j=c;j<=n;j+=1) m[r][j]-=factor*m[c][j]; }
  }
  return m.map((row)=>row[n]);
}
function independentProblemHash(intake) {
  return semanticHash({
    method:intake.method, applicabilityClass:intake.applicabilityClass, datasetId:intake.datasetId, loadCaseId:intake.loadCaseId,
    coldGravityMethod:intake.coldGravityMethod, routeId:intake.routeId, reactionToleranceN:intake.reactionToleranceN,
    ordering:[...intake.ordering],
    supports:intake.supports.map((x)=>({supportSiteId:x.supportSiteId,routeChainageMm:x.routeChainageMm,coldGravityReactionN:x.coldGravityReactionN,coldGapM:x.coldGapM,freeOpeningM:x.freeOpeningM})),
    gravityContributions:intake.gravityContributions.map((x)=>({contributionId:x.contributionId,routeId:x.routeId,verticalForceN:x.verticalForceN,chainageMm:x.chainageMm})),
    flexibilityMatrixMPerN:intake.flexibilityMatrixMPerN.map((row)=>[...row]),
    numericalControls:{gapToleranceM:intake.numericalControls.gapToleranceM,complementarityToleranceNM:intake.numericalControls.complementarityToleranceNM,gravityParityToleranceN:intake.numericalControls.gravityParityToleranceN,forceToleranceN:intake.numericalControls.forceToleranceN,momentToleranceNmm:intake.numericalControls.momentToleranceNmm,matrixPivotToleranceMPerN:intake.numericalControls.matrixPivotToleranceMPerN},
  });
}
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0);} function coded(code){const e=new Error(code);e.code=code;return e;}
