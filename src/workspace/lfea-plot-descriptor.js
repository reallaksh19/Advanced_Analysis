/**
 * Plot descriptor: the only legal way to reach the mesh renderer.
 *
 * Constructing this object forces four things to be declared explicitly:
 * the quantity, its unit, the geometry state (undeformed or deformed, and at
 * what scale), and the evidence authority. A coloured mesh without all four is
 * not a reviewable engineering output.
 *
 * The invariants below make the D-02 defect unrepresentable: a plot cannot be
 * drawn on deformed coordinates while claiming to be undeformed, because the
 * scale and the state are validated against each other at construction.
 */

export const GEOMETRY_STATES = Object.freeze({
  UNDEFORMED: 'UNDEFORMED_SOURCE_GEOMETRY',
  DEFORMED: 'SCALED_DEFORMATION_REVIEW_GEOMETRY',
});

const LEGEND_TICK_COUNT = 5;

/**
 * Build an immutable plot descriptor.
 *
 * @param {{field:Record<string,unknown>, geometryState:string, deformationScale:number,
 *          authority:string, unitsIdentity:string}} input Explicit plot state.
 * @returns {Readonly<Record<string, unknown>>} Plot descriptor.
 */
export function createPlotDescriptor(input) {
  const { field, geometryState, deformationScale, authority, unitsIdentity } = input ?? {};
  if (!field || typeof field !== 'object') throw new TypeError('A field descriptor is required.');
  if (!Object.values(GEOMETRY_STATES).includes(geometryState)) {
    throw new TypeError(`Unknown geometry state: ${geometryState}.`);
  }
  const deformed = geometryState === GEOMETRY_STATES.DEFORMED;
  if (deformed && !(Number.isFinite(deformationScale) && deformationScale > 0)) {
    throw new TypeError('Deformed geometry requires an explicit positive deformation scale.');
  }
  if (!deformed && deformationScale !== 0) {
    throw new TypeError('Undeformed geometry must declare a deformation scale of exactly 0.');
  }
  if (typeof field.unit !== 'string' || !field.unit.trim()) {
    throw new TypeError('A plot descriptor requires a unit taken from the solver profile.');
  }

  return Object.freeze({
    quantityId: field.quantityId,
    unit: field.unit,
    reduction: field.reduction,
    sourcePath: field.sourcePath,
    min: field.min,
    max: field.max,
    ticks: legendTicks(field.min, field.max),
    geometryState,
    deformationScale,
    authority: authority ?? field.authority,
    unitsIdentity: unitsIdentity ?? null,
    caption: `${field.quantityId} [${field.unit}] · ${field.reduction} · `
      + `${deformed ? `DEFORMED x${deformationScale}` : 'UNDEFORMED'} · ${authority ?? field.authority}`,
  });
}

/**
 * Build a descriptor for a geometry-only view (no result field).
 *
 * @param {{unitsIdentity?:string}} input Explicit options.
 * @returns {Readonly<Record<string, unknown>>} Plot descriptor.
 */
export function createGeometryOnlyDescriptor(input = {}) {
  return Object.freeze({
    quantityId: 'NONE',
    unit: input.lengthUnit ?? 'mm',
    reduction: 'NONE',
    sourcePath: 'package.nodes[] + package.elements[]',
    min: null,
    max: null,
    ticks: Object.freeze([]),
    geometryState: GEOMETRY_STATES.UNDEFORMED,
    deformationScale: 0,
    authority: 'SOURCE_MESH_GEOMETRY',
    unitsIdentity: input.unitsIdentity ?? null,
    caption: `Source mesh · no result field · UNDEFORMED · SOURCE_MESH_GEOMETRY`,
  });
}

/**
 * Evenly spaced legend ticks spanning the field range.
 *
 * @param {number} min Field minimum.
 * @param {number} max Field maximum.
 * @returns {ReadonlyArray<number>} Tick values.
 */
export function legendTicks(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return Object.freeze([]);
  if (!(max > min)) return Object.freeze([min]);
  return Object.freeze(
    Array.from({ length: LEGEND_TICK_COUNT }, (_, index) => min + (index * (max - min)) / (LEGEND_TICK_COUNT - 1)),
  );
}

/**
 * Perceptually monotone colour ramp (nine stops, increasing in luminance).
 *
 * Replaces the previous red/blue ramp, which was not monotone in luminance and
 * was ambiguous under the common colour-vision deficiencies.
 */
const RAMP = Object.freeze([
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
  [31, 158, 137], [53, 183, 121], [110, 206, 88], [253, 231, 37],
]);

/**
 * Build a colour scale locked to an explicit numeric range.
 *
 * The range is supplied by the caller and never re-derived from the current
 * data, so a value keeps its colour across edits and between two runs being
 * compared.
 *
 * @param {number} min Range minimum.
 * @param {number} max Range maximum.
 * @returns {(value:number)=>string} Colour function.
 */
export function createLockedColourScale(min, max) {
  const span = Number.isFinite(max - min) && max > min ? max - min : 1;
  return (value) => {
    if (!Number.isFinite(value)) return 'rgb(120,120,120)';
    const ratio = Math.min(1, Math.max(0, (value - min) / span));
    const position = ratio * (RAMP.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(RAMP.length - 1, lower + 1);
    const blend = position - lower;
    const channel = (index) => Math.round(RAMP[lower][index] + blend * (RAMP[upper][index] - RAMP[lower][index]));
    return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
  };
}
