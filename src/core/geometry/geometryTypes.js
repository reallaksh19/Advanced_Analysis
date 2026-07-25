/**
 * Canonical geometry contracts for Simplified Calc.
 *
 * These JSDoc typedefs define the shared data shape that sits between UI
 * import/edit surfaces and engineering solvers. Keep solver code dependent on
 * this contract instead of tab-local component shapes.
 */

/**
 * @typedef {{ x:number, y:number, z:number, bore?:number }} Point3D
 */

/**
 * @typedef {{
 *   id: string,
 *   x: number,
 *   y: number,
 *   z: number,
 *   sourceComponentUid?: string,
 *   restraint?: 'ANCHOR'|'GUIDE'|'FREE'|'UNKNOWN',
 *   meta?: Record<string, unknown>
 * }} CanonicalNode
 */

/**
 * @typedef {{
 *   id: string,
 *   startNodeId: string,
 *   endNodeId: string,
 *   type: 'PIPE'|'ELBOW'|'TEE'|'BEND'|'VALVE'|'FLANGE'|'SUPPORT'|'UNKNOWN'|string,
 *   sourceComponentUid?: string,
 *   length?: number,
 *   diameter?: number,
 *   thickness?: number,
 *   material?: string,
 *   meta?: Record<string, unknown>
 * }} CanonicalSegment
 */

/**
 * @typedef {{
 *   nodes: CanonicalNode[],
 *   segments: CanonicalSegment[],
 *   source: 'pcf'|'pcf-selection'|'sketcher'|'manual'|'transform'|string,
 *   unit: 'mm'|'m'|'in'|'ft'|'unknown'|string,
 *   diagnostics: Array<Record<string, unknown>>,
 *   summary?: Record<string, unknown>
 * }} CanonicalGeometry
 */

export const CANONICAL_GEOMETRY_SCHEMA_VERSION = 'canonical-geometry-v1';

export const CANONICAL_SEGMENT_TYPES = Object.freeze([
  'PIPE',
  'ELBOW',
  'TEE',
  'BEND',
  'VALVE',
  'FLANGE',
  'SUPPORT',
  'UNKNOWN',
]);

export const DEFAULT_GEOMETRY_UNIT = 'mm';
