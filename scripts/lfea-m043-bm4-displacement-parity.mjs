import {
  DISPLACEMENT_FIELDS,
  M043_LADDER_POLICY,
  caesarDisplacementSI,
  compareValue,
  indexNodeDofVector,
  passRate,
  regressionAgainstReference,
} from './lfea-m043-bm4-ladder-fixtures.mjs';

// M043 L3: nodal displacement parity, all six DOF.
//
// Displacement is the PRIMARY unknown: everything else in a linear solve is
// recovered from it. Reactions are K*u - F, element end actions are k_local*T*u,
// stresses are those actions divided by section properties and multiplied by
// SIFs. So a displacement comparison is the first level that can attribute an
// error to the model itself rather than to post-processing, and if displacement
// agrees while element forces do not, the defect is in recovery -- which is a
// completely different investigation from a wrong stiffness or a wrong load.
//
// Comparison surface: SHARED PHYSICAL NODES ONLY. LFEA expands each bend into a
// chord chain and therefore owns interior arc nodes CAESAR never declares;
// CAESAR in turn declares mid-arc code stations. Neither model is wrong about
// its own interior, and forcing a correspondence between them would be a
// category error. Unmatched nodes on both sides are counted and reported.
//
// Per-DOF reporting matters more than the aggregate here. An error that lives in
// one direction (say horizontal translation while vertical is sound) points at a
// specific missing physics; an error spread evenly over all six points at a
// global stiffness or unit problem. The aggregate hides exactly that.

const TRANSLATION_DOFS = Object.freeze(['UX', 'UY', 'UZ']);
const ROTATION_DOFS = Object.freeze(['RX', 'RY', 'RZ']);

function floorForFamily(family) {
  return family === 'TRANSLATION'
    ? M043_LADDER_POLICY.displacement.translationFloorMetres
    : M043_LADDER_POLICY.displacement.rotationFloorRadians;
}

function familySummary(rows, family) {
  const subset = rows.filter((row) => row.family === family);
  return Object.freeze({
    ...passRate(subset),
    regression: regressionAgainstReference(subset, floorForFamily(family)),
  });
}

/**
 * Compare LFEA vs CAESAR displacement at every shared node, for one case.
 *
 * @param {Readonly<object>} analysis Solved case (`analyseM035M036Case` shape).
 * @param {Readonly<object>} cii Parsed CAESAR output authority.
 * @param {string} caseLabel 'SUS' | 'OPE' | 'EXP'.
 */
export function auditDisplacementParity({ analysis, cii, caseLabel, nodePrefix }) {
  const caesar = caesarDisplacementSI(cii, caseLabel);
  const lfea = indexNodeDofVector(analysis.execution.displacement);
  const rows = [];
  const caesarOnlyNodes = [];
  let matchedNodeCount = 0;

  for (const [sourceNodeId, caesarNode] of caesar) {
    const analysisNodeId = `${nodePrefix}${sourceNodeId}`;
    if (!lfea.has(`${analysisNodeId}|UX`)) {
      caesarOnlyNodes.push(sourceNodeId);
      continue;
    }
    matchedNodeCount += 1;
    for (const field of DISPLACEMENT_FIELDS) {
      const ours = lfea.get(`${analysisNodeId}|${field.dof}`);
      const reference = caesarNode[field.dof];
      rows.push(Object.freeze({
        sourceNodeId,
        analysisNodeId,
        dof: field.dof,
        family: field.family,
        units: field.family === 'TRANSLATION' ? 'm' : 'rad',
        ...compareValue(ours, reference, {
          floor: floorForFamily(field.family),
          tolerancePercent: M043_LADDER_POLICY.displacement.targetTolerancePercent,
        }),
      }));
    }
  }

  const byDof = Object.fromEntries([...TRANSLATION_DOFS, ...ROTATION_DOFS].map((dof) => {
    const subset = rows.filter((row) => row.dof === dof);
    return [dof, Object.freeze({
      ...passRate(subset),
      regression: regressionAgainstReference(
        subset,
        floorForFamily(TRANSLATION_DOFS.includes(dof) ? 'TRANSLATION' : 'ROTATION'),
      ),
    })];
  }));

  const worstByAbsoluteDelta = [...rows]
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta)
      || left.sourceNodeId.localeCompare(right.sourceNodeId)
      || left.dof.localeCompare(right.dof))
    .slice(0, 20);

  return Object.freeze({
    level: 'L3',
    name: 'NODAL_DISPLACEMENT_PARITY',
    caseLabel,
    isolates: 'STIFFNESS_AND_LOAD_JOINTLY_VIA_THE_PRIMARY_SOLVE_UNKNOWN',
    comparisonSurface: 'SHARED_PHYSICAL_NODES_ONLY_NO_INTERPOLATION_ACROSS_DIFFERING_DISCRETISATION',
    matchedNodeCount,
    caesarOnlyNodeCount: caesarOnlyNodes.length,
    caesarOnlyNodes: Object.freeze(caesarOnlyNodes.sort()),
    comparedRowCount: rows.length,
    summary: Object.freeze({
      all: passRate(rows),
      translation: familySummary(rows, 'TRANSLATION'),
      rotation: familySummary(rows, 'ROTATION'),
      byDof: Object.freeze(byDof),
    }),
    worstByAbsoluteDelta: Object.freeze(worstByAbsoluteDelta),
    rows: Object.freeze(rows),
    status: rows.every((row) => row.passed) ? 'MATCHED' : 'DIVERGED',
  });
}

/**
 * Contrast the per-case regression slopes against each other.
 *
 * A model that is correctly scaled in one case and badly scaled in another is
 * not uniformly wrong -- the difference between the cases names the missing
 * term. BM4 is exactly this shape: SUS (W+P1) and OPE (W+P1+T1) differ only by
 * thermal content, so a slope that is near 1 in OPE and far below 1 in SUS
 * means the missing physics is something whose contribution is a small
 * correction to a large thermal displacement but the dominant driver of a small
 * gravity-only one.
 */
export function contrastCaseSlopes(displacementLevels) {
  const rows = displacementLevels.map((level) => Object.freeze({
    caseLabel: level.caseLabel,
    translationSlope: level.summary.translation.regression.slope,
    translationSignAgreement: level.summary.translation.regression.signAgreement,
    rotationSlope: level.summary.rotation.regression.slope,
    rotationSignAgreement: level.summary.rotation.regression.signAgreement,
    translationPassedFraction: level.summary.translation.passedFraction,
    byDofPassedFraction: Object.fromEntries(
      Object.entries(level.summary.byDof).map(([dof, value]) => [dof, value.passedFraction]),
    ),
  }));
  return Object.freeze({
    level: 'L3',
    name: 'CROSS_CASE_SLOPE_CONTRAST',
    rows: Object.freeze(rows),
    interpretationRule: 'A_SLOPE_NEAR_ONE_IN_ONE_CASE_AND_FAR_BELOW_ONE_IN_ANOTHER_LOCALISES_THE_MISSING_TERM_TO_WHAT_DIFFERS_BETWEEN_THOSE_CASES',
  });
}
