// Deliberately separate expression order and conversion implementation.
const IN_PER_M = 1 / 0.0254;
const KSI_PER_MPA = 1000 / 6894.757293168361;
export function oracleCanonical(profile, x) {
  const y = JSON.parse(JSON.stringify(x));
  const lengthKeys = ['diameter','thickness','length','loadedDent','residualDent'];
  if (profile === 'MM_MPA') for (const key of lengthKeys) y[key] = y[key] * 1e-3;
  else if (profile === 'IN_KSI') {
    for (const key of lengthKeys) y[key] = y[key] / IN_PER_M;
    y.elasticModulus /= KSI_PER_MPA;
    y.pressure /= KSI_PER_MPA;
  } else if (profile !== 'M_MPA') throw new Error('ORACLE_PROFILE_REJECTED');
  return y;
}
export function oracleLedger(x) {
  const dOverT = x.diameter / x.thickness;
  const lOverD = x.length / x.diameter;
  const pRatio = (x.pressure / x.elasticModulus) * (x.diameter / (2*x.thickness));
  const dentRatio = x.loadedDent / x.diameter;
  const permanent = x.residualDent / x.loadedDent;
  return { depthRatio:dentRatio, permanentFraction:permanent, pressureElasticRatio:pRatio, diameterToThickness:dOverT, lengthToDiameter:lOverD };
}
