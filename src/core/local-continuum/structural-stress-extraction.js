/**
 * Structural (linearized) stress extraction along a through-thickness line
 * (spec §12: the structural-stress recovery layer; consumed by the Phase G
 * ASME elastic Design-by-Analysis module for Pm/PL/Pb classification).
 *
 * Membrane is the through-thickness average, bending the linear first
 * moment about mid-thickness, and peak the remainder — the classical
 * decomposition. Peak is returned as the residual at each sampled station,
 * never collapsed to a single "peak stress" scalar, because the location of
 * the maximum residual is itself engineering information.
 *
 * Input samples must come from an authoritative recovery layer
 * (integration-point or element-face-surface). This module rejects any
 * sample tagged with a display authority — a linearization built on
 * smoothed contour data would produce a code stress with no defensible
 * provenance, which spec §12/§13 forbid outright.
 */
import { loadError, modelError } from './errors.js';
import { canonicalNumber } from './numeric.js';
import { DISPLAY_AUTHORITY } from './nodal-projection-display.js';

export const LINEARIZATION_FORMULA_ID = 'THROUGH_THICKNESS_MEMBRANE_BENDING_PEAK_LINEARIZATION_V1';
export const STRUCTURAL_STRESS_LAYER = 'STRUCTURAL_STRESS';

const COMPONENTS = Object.freeze(['sigmaX', 'sigmaY', 'sigmaZ', 'tauXY']);

/**
 * @param {ReadonlyArray<{position:number, stress:object, authority?:string}>} samples
 *        Ordered through-thickness stations. `position` is the distance
 *        along the line from its start; the line's total length is
 *        `position` of the last station.
 * @returns Membrane/bending/peak decomposition per stress component.
 */
export function linearizeThroughThickness(samples, lineIdentity) {
  requireAuthoritativeSamples(samples, lineIdentity);
  const positions = samples.map((row) => row.position);
  const length = positions[positions.length - 1] - positions[0];
  if (!(length > 0)) {
    throw modelError('DEGENERATE_CLASSIFICATION_LINE', lineIdentity, 'A stress-classification line must have positive length.');
  }
  const mid = (positions[0] + positions[positions.length - 1]) / 2;

  const membrane = {};
  const bending = {};
  COMPONENTS.forEach((component) => {
    const values = samples.map((row) => row.stress[component]);
    const average = trapezoidIntegral(positions, values) / length;
    const firstMoment = exactFirstMoment(positions, values, mid);
    // Linear bending distribution with extreme-fibre value `6*M/t^2`.
    membrane[component] = canonicalNumber(average, `membrane ${component}`);
    bending[component] = canonicalNumber(6 * firstMoment / length ** 2, `bending ${component}`);
  });

  const stations = samples.map((row) => {
    const factor = 2 * (row.position - mid) / length; // -1 at start, +1 at end
    const peak = {};
    COMPONENTS.forEach((component) => {
      peak[component] = canonicalNumber(
        row.stress[component] - membrane[component] - bending[component] * factor,
        `peak ${component}`,
      );
    });
    return Object.freeze({ position: row.position, throughThicknessFactor: canonicalNumber(factor), peak: Object.freeze(peak) });
  });

  return Object.freeze({
    lineIdentity,
    lineLength: canonicalNumber(length, 'classification line length'),
    membrane: Object.freeze(membrane),
    bending: Object.freeze(bending),
    peakStations: Object.freeze(stations),
    recoveryLayer: STRUCTURAL_STRESS_LAYER,
    sampleCount: samples.length,
    formulaId: LINEARIZATION_FORMULA_ID,
  });
}

/**
 * Spec §12/§13: a structural or code stress may only be built from an
 * authoritative recovery layer. A display-only (projected/averaged) sample
 * is rejected outright rather than silently accepted.
 */
function requireAuthoritativeSamples(samples, lineIdentity) {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw modelError('INSUFFICIENT_CLASSIFICATION_LINE_SAMPLES', lineIdentity, 'A stress-classification line needs at least two through-thickness samples.');
  }
  samples.forEach((row, index) => {
    if (row.authority === DISPLAY_AUTHORITY) {
      throw loadError(
        'DISPLAY_ONLY_STRESS_NOT_ADMISSIBLE_FOR_LINEARIZATION',
        `${lineIdentity}.samples[${index}]`,
        'Structural-stress linearization requires authoritative (integration-point or element-face-surface) stress; a display-only projection is not admissible.',
      );
    }
  });
  for (let index = 1; index < samples.length; index += 1) {
    if (!(samples[index].position > samples[index - 1].position)) {
      throw modelError(
        'CLASSIFICATION_LINE_SAMPLES_NOT_MONOTONIC',
        `${lineIdentity}.samples[${index}]`,
        'Through-thickness samples must be ordered by strictly increasing position.',
      );
    }
  }
}

/** Exact for the assumed piecewise-linear stress field (this IS the trapezoid rule for that assumption). */
function trapezoidIntegral(positions, values) {
  let total = 0;
  for (let index = 1; index < positions.length; index += 1) {
    const width = positions[index] - positions[index - 1];
    total += width * (values[index] + values[index - 1]) / 2;
  }
  return total;
}

/**
 * `integral( sigma(z) * (z - mid) ) dz`, integrated exactly for the same
 * piecewise-linear stress field the membrane average assumes. The integrand
 * is quadratic, so applying the trapezoid rule to the product would be
 * inexact — it overstates the bending of a genuinely linear distribution
 * (measured 67.5 against a true 60), which would inflate every downstream
 * Pb classification.
 */
function exactFirstMoment(positions, values, mid) {
  let total = 0;
  for (let index = 1; index < positions.length; index += 1) {
    const z0 = positions[index - 1] - mid;
    const width = positions[index] - positions[index - 1];
    const start = values[index - 1];
    const slope = values[index] - start;
    total += width * (start * z0 + start * width / 2 + slope * z0 / 2 + slope * width / 3);
  }
  return total;
}
