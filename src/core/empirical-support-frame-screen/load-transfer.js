import { createSupportInterfaceLoad } from './contracts.js';

function cross(a, b) {
  return {
    x: (a.y * b.z) - (a.z * b.y),
    y: (a.z * b.x) - (a.x * b.z),
    z: (a.x * b.y) - (a.y * b.x),
  };
}

export function transferSupportInterfaceLoad(input, targetReferencePointM) {
  const load = createSupportInterfaceLoad(input);
  const r = {
    x: load.applicationPointM.x - targetReferencePointM.x,
    y: load.applicationPointM.y - targetReferencePointM.y,
    z: load.applicationPointM.z - targetReferencePointM.z,
  };
  const eccentricMoment = cross(r, load.forceN);
  return Object.freeze({
    ...load,
    applicationPointM: Object.freeze({ ...targetReferencePointM }),
    momentNm: Object.freeze({
      x: load.momentNm.x + eccentricMoment.x,
      y: load.momentNm.y + eccentricMoment.y,
      z: load.momentNm.z + eccentricMoment.z,
    }),
    formula: 'M_ref=M+r×F',
    disposition: 'SCREENING_INPUT_ONLY',
  });
}
