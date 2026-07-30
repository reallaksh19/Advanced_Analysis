import { localDistributedLoadIntensity } from '../linear-fea-frame-element/index.js';
import { FORCE_FIELD_METHOD, fail, requireFinite } from './recovery-contract.js';

/**
 * Element force-field recovery (section 9 "Element force field"): axial,
 * torsion, shear and bending distributions at governed stations, built by
 * equilibrium from the I-end local action, integrating the same
 * DISTRIBUTED_LOAD primitives B-3.1 already bound into the element — closed
 * form for the UNIFORM/LINEAR intensity shapes B-3.0/B-3.1 support, per
 * section 9's "do not invent a numerical integration scheme where a closed
 * form already exists".
 *
 * Convention (declared here, since this is a different quantity from the
 * joint-on-element `q_local` end action section 9's "Element end action" row
 * reports): at local coordinate `x` from the I end, the station action is the
 * equilibrium action that would close the free body `[0, x]` under the I-end
 * joint action plus the distributed load over `[0, x]`, i.e. exactly the role
 * `q_local`'s J-end plays for the whole span, played here by a virtual cut at
 * `x`. Consequently `stationAction(0)` is the negative of the I-end joint
 * force/torque components (no shear-induced moment yet accumulated) and
 * `stationAction(length)` equals the J-end joint action exactly — the
 * relation is verified by the reviewer regression and the hand equilibrium
 * check in the package README.
 *
 * With local distributed intensity `w(s) = a + (b - a) s / L` on `[0, L]`:
 *
 *   integral of w from 0 to x            = a x + (b - a) x^2 / (2 L)
 *   integral of (x - s) w(s) from 0 to x = a x^2 / 2 + (b - a) x^3 / (6 L)
 *
 * the second being the first moment of the load on `[0, x]` about the cut at
 * `x`, needed for the bending-moment stations (a constant shear still
 * produces a linearly varying moment even when the distributed load is
 * zero).
 */

const CODE = 'RECOVERY_FORCE_FIELD_INVALID';

function integralOfIntensity(a, b, length, x) {
  return a * x + ((b - a) * x * x) / (2 * length);
}

function firstMomentOfIntensityAboutCut(a, b, length, x) {
  return (a * x * x) / 2 + ((b - a) * (x ** 3)) / (6 * length);
}

/**
 * Sum every DISTRIBUTED_LOAD primitive this element cites into one pair of
 * local start/end intensities (superposition — both the equivalent-load
 * integral and this closed form are linear in intensity).
 */
export function accumulateLocalDistributedLoad({ frameElementRecord, loadCasePrimitivesById }) {
  const totals = { start: { fx: 0, fy: 0, fz: 0 }, end: { fx: 0, fy: 0, fz: 0 } };
  for (const citation of frameElementRecord.appliedLoads) {
    const primitive = loadCasePrimitivesById.get(citation.primitiveId);
    if (primitive === undefined) {
      fail(
        `Element ${frameElementRecord.elementId} cites distributed-load primitive ${citation.primitiveId}, which the supplied physical load case does not contain.`,
        'RECOVERY_APPLIED_LOAD_PRIMITIVE_MISSING',
      );
    }
    if (primitive.kind !== citation.kind || primitive.semanticHash !== citation.semanticHash) {
      fail(
        `Element ${frameElementRecord.elementId} cites distributed-load primitive ${citation.primitiveId}, which does not match the supplied physical load case's own record of it.`,
        'RECOVERY_APPLIED_LOAD_PRIMITIVE_MISMATCH',
      );
    }
    const local = localDistributedLoadIntensity({ primitive, axes: frameElementRecord.localAxes.axes });
    for (const component of ['fx', 'fy', 'fz']) {
      totals.start[component] += local.start[component];
      totals.end[component] += local.end[component];
    }
  }
  return totals;
}

/** One force-field station at local coordinate `x` from the I end. */
export function evaluateForceFieldStation({ qLocalI, distributed, length, x }) {
  const { start: a, end: b } = distributed;
  const axial = -(qLocalI.fx + integralOfIntensity(a.fx, b.fx, length, x));
  const torsion = -qLocalI.mx;
  const shearY = -(qLocalI.fy + integralOfIntensity(a.fy, b.fy, length, x));
  const shearZ = -(qLocalI.fz + integralOfIntensity(a.fz, b.fz, length, x));
  const momentY = -qLocalI.my - x * qLocalI.fz - firstMomentOfIntensityAboutCut(a.fz, b.fz, length, x);
  const momentZ = -qLocalI.mz + x * qLocalI.fy + firstMomentOfIntensityAboutCut(a.fy, b.fy, length, x);
  return {
    fx: requireFinite(axial, 'forceField.fx', CODE),
    fy: requireFinite(shearY, 'forceField.fy', CODE),
    fz: requireFinite(shearZ, 'forceField.fz', CODE),
    mx: requireFinite(torsion, 'forceField.mx', CODE),
    my: requireFinite(momentY, 'forceField.my', CODE),
    mz: requireFinite(momentZ, 'forceField.mz', CODE),
  };
}

/**
 * Recover one element's force-field distribution at `stationCount` evenly
 * spaced stations from I (`fraction 0`) to J (`fraction 1`) inclusive.
 *
 * @param {object} args
 * @param {Readonly<object>} args.frameElementRecord Sealed frame element.
 * @param {Array<number>} args.qLocal The 12-component recovered local end action.
 * @param {Map<string,object>} args.loadCasePrimitivesById Sealed load-case primitives, by `primitiveId`.
 * @param {number} args.stationCount Declared `elementForceStationsPerSpan` (>= 2).
 * @returns {{length:number, method:string, stations:Array<object>}}
 */
export function recoverElementForceField({ frameElementRecord, qLocal, loadCasePrimitivesById, stationCount }) {
  const length = frameElementRecord.geometry.length;
  const distributed = accumulateLocalDistributedLoad({ frameElementRecord, loadCasePrimitivesById });
  const qLocalI = { fx: qLocal[0], fy: qLocal[1], fz: qLocal[2], mx: qLocal[3], my: qLocal[4], mz: qLocal[5] };
  const stations = [];
  for (let index = 0; index < stationCount; index += 1) {
    const fraction = index / (stationCount - 1);
    const position = fraction * length;
    stations.push({
      index,
      fraction,
      position,
      action: evaluateForceFieldStation({ qLocalI, distributed, length, x: position }),
    });
  }
  return { length, method: FORCE_FIELD_METHOD, stations };
}
