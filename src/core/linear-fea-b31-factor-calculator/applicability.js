function verdict(status, ruleId, violations = []) {
  return Object.freeze({
    status,
    ruleId,
    evaluatedBy: 'LFEA-B31-FACTOR-CALCULATOR',
    violations: Object.freeze(violations.map((entry) => Object.freeze({ ...entry }))),
  });
}

export function evaluateBendApplicability(geometry, profile) {
  const ratio = geometry.outerDiameter / geometry.wallThickness;
  const violations = [];
  if (profile.factorStandard === 'ASME_B31J' && ratio > 100) {
    violations.push({ field: 'outerDiameter/wallThickness', value: ratio, rule: 'D/T <= 100' });
  }
  if (geometry.smooth90FlexibilityCorrection) {
    if (profile.factorStandard !== 'ASME_B31J') {
      violations.push({
        field: 'smooth90FlexibilityCorrection',
        value: true,
        rule: 'B31J Table 1-1 Note (3) is available only for ASME B31J profiles',
      });
    }
    if (geometry.bendAngleDegrees === null
        || Math.abs(geometry.bendAngleDegrees - 90) > 1e-6) {
      violations.push({
        field: 'bendAngleDegrees',
        value: geometry.bendAngleDegrees,
        rule: 'smooth-90 correction requires a 90 degree bend within 1e-6 degree',
      });
    }
  }
  return violations.length === 0
    ? verdict('WITHIN_RANGE', `${profile.formulaFamily}_BEND_APPLICABILITY`)
    : verdict('OUTSIDE_RANGE', `${profile.formulaFamily}_BEND_APPLICABILITY`, violations);
}

export function evaluateTeeApplicability(geometry, profile) {
  const D = geometry.runOuterDiameter - geometry.runWallThickness;
  const d = geometry.branchOuterDiameter - geometry.branchWallThickness;
  const ratio = d / D;
  const violations = [];
  if (geometry.branchOuterDiameter > geometry.runOuterDiameter) {
    violations.push({ field: 'branchOuterDiameter', value: geometry.branchOuterDiameter, rule: 'branch OD <= run OD' });
  }
  if (!(ratio > 0 && ratio <= 1)) {
    violations.push({ field: 'd/D', value: ratio, rule: '0 < d/D <= 1' });
  }
  if (profile.factorStandard === 'ASME_B31J'
      && geometry.runOuterDiameter / geometry.runWallThickness > 100) {
    violations.push({
      field: 'runOuterDiameter/runWallThickness',
      value: geometry.runOuterDiameter / geometry.runWallThickness,
      rule: 'D/T <= 100',
    });
  }
  if (profile.factorStandard === 'ASME_B31J' && geometry.fittingQuality !== 'VERIFIED_B16_9') {
    violations.push({
      field: 'fittingQuality',
      value: geometry.fittingQuality,
      rule: 'Sketch 2.1 verified B16.9 geometry required; imperfect tees use a different rule',
    });
  }
  return violations.length === 0
    ? verdict('WITHIN_RANGE', `${profile.formulaFamily}_WELDING_TEE_APPLICABILITY`)
    : verdict('OUTSIDE_RANGE', `${profile.formulaFamily}_WELDING_TEE_APPLICABILITY`, violations);
}

export function evaluateReducerApplicability(geometry, profile) {
  if (profile.factorStandard !== 'ASME_B31J') {
    return verdict('WITHIN_RANGE', `${profile.formulaFamily}_REDUCER_UNITY_RULE`);
  }
  const ratio = geometry.smallEndOuterDiameter / geometry.smallEndWallThickness;
  const radiusRatio = geometry.smallEndTransitionRadius / geometry.smallEndOuterDiameter;
  const thicknessRatio = geometry.largeEndWallThickness / geometry.smallEndWallThickness;
  const violations = [];
  if (!(geometry.coneAngleDegrees > 5 && geometry.coneAngleDegrees < 60)) {
    violations.push({ field: 'coneAngleDegrees', value: geometry.coneAngleDegrees, rule: '5 < alpha < 60 deg' });
  }
  if (!(ratio > 5 && ratio < 80)) {
    violations.push({ field: 'D2/T2', value: ratio, rule: '5 < D2/T2 < 80' });
  }
  if (geometry.bodyMinimumWallThickness < geometry.largeEndWallThickness) {
    violations.push({
      field: 'bodyMinimumWallThickness',
      value: geometry.bodyMinimumWallThickness,
      rule: 'body wall >= T1 except immediately adjacent to the small-end cylinder',
    });
  }
  if (!(radiusRatio > 0.08 && radiusRatio < 0.7)) {
    violations.push({ field: 'r2/D2', value: radiusRatio, rule: '0.08 < r2/D2 < 0.7' });
  }
  if (!(thicknessRatio > 1 && thicknessRatio < 2.12)) {
    violations.push({ field: 'T1/T2', value: thicknessRatio, rule: '1 < T1/T2 < 2.12' });
  }
  return violations.length === 0
    ? verdict('WITHIN_RANGE', `${profile.formulaFamily}_REDUCER_NOTE_15`)
    : verdict('OUTSIDE_RANGE', `${profile.formulaFamily}_REDUCER_NOTE_15`, violations);
}
