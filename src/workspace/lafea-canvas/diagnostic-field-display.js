import { contractError, deepFreeze } from './contracts.js';

export const LAFEA_DIAGNOSTIC_DISPLAY_SCHEMA = 'LafeaDiagnosticDisplay.v1';
export const LAFEA_RENDER_QUALITY_FLAGS = Object.freeze({
  VALID: 0,
  UNRECOVERED: 1,
});
export const LAFEA_UNRECOVERED_VERTEX_DISPLAY_POLICY = deepFreeze({
  schema: 'LafeaDiagnosticColorPolicy.v1',
  policyId: 'LAFEA-UNRECOVERED-VERTEX-MAGENTA-V1',
  qualityFlag: LAFEA_RENDER_QUALITY_FLAGS.UNRECOVERED,
  color: [1, 0, 1],
  source: 'U4J_EXPLICIT_UNRECOVERED_DISPLAY_POLICY',
  semanticHash: 'sha256:lafea-u4j-unrecovered-magenta-v1',
});

/**
 * Describe diagnostic display without recovering, replacing or averaging a
 * producer field value. Only the explicit VALID and UNRECOVERED flags render.
 */
export function createLafeaDiagnosticDisplay(packet) {
  requirePacketArrays(packet);
  let diagnosticVertexCount = 0;
  for (let index = 0; index < packet.qualityFlags.length; index += 1) {
    const flag = packet.qualityFlags[index];
    requireSupportedFlag(flag, index);
    if (flag === LAFEA_RENDER_QUALITY_FLAGS.VALID
      && !Number.isFinite(packet.fieldValues[index])) {
      throw contractError('LAFEA_DIAGNOSTIC_DISPLAY_VALID_VALUE_NONFINITE', {
        vertexIndex: index,
      });
    }
    if (flag === LAFEA_RENDER_QUALITY_FLAGS.UNRECOVERED) {
      diagnosticVertexCount += 1;
    }
  }
  return deepFreeze({
    schema: LAFEA_DIAGNOSTIC_DISPLAY_SCHEMA,
    status: diagnosticVertexCount === 0 ? 'CLEAR' : 'DIAGNOSTIC',
    validVertexCount: packet.fieldValues.length - diagnosticVertexCount,
    diagnosticVertexCount,
    renderProfileHash: packet.lineage.renderProfileHash,
    policy: LAFEA_UNRECOVERED_VERTEX_DISPLAY_POLICY,
  });
}

/**
 * Build GPU colours. Flagged samples use only the explicit diagnostic colour;
 * their field values are never normalized, replaced, interpolated or averaged.
 */
export function createLafeaDiagnosticSafeVertexColors(packet, diagnosticDisplay) {
  requirePacketArrays(packet);
  const expected = createLafeaDiagnosticDisplay(packet);
  if (JSON.stringify(diagnosticDisplay) !== JSON.stringify(expected)) {
    throw contractError('LAFEA_DIAGNOSTIC_DISPLAY_SUMMARY_MISMATCH');
  }
  const colors = new Float32Array(packet.fieldValues.length * 3);
  const minimum = packet.field.bounds.minimum;
  const maximum = packet.field.bounds.maximum;
  const range = maximum - minimum;
  for (let index = 0; index < packet.fieldValues.length; index += 1) {
    const diagnosticColor = lafeaDiagnosticColor(packet.qualityFlags[index]);
    const color = diagnosticColor ?? colorMap(
      range === 0 ? 0.5 : clamp01((packet.fieldValues[index] - minimum) / range),
      packet.field.colorMapId,
    );
    colors.set(color, index * 3);
  }
  return colors;
}

/** Return the explicit diagnostic colour, or null for a valid numeric sample. */
export function lafeaDiagnosticColor(qualityFlag) {
  if (qualityFlag === LAFEA_RENDER_QUALITY_FLAGS.VALID) return null;
  if (qualityFlag === LAFEA_RENDER_QUALITY_FLAGS.UNRECOVERED) {
    return LAFEA_UNRECOVERED_VERTEX_DISPLAY_POLICY.color;
  }
  throw contractError('LAFEA_DIAGNOSTIC_DISPLAY_QUALITY_FLAG_UNSUPPORTED', {
    qualityFlag,
  });
}

function requirePacketArrays(packet) {
  if (!(packet?.fieldValues instanceof Float32Array)
    || !(packet?.qualityFlags instanceof Uint8Array)
    || packet.fieldValues.length !== packet.qualityFlags.length
    || typeof packet?.lineage?.renderProfileHash !== 'string'
    || packet.lineage.renderProfileHash.length === 0) {
    throw contractError('LAFEA_DIAGNOSTIC_DISPLAY_PACKET_INVALID');
  }
}

function requireSupportedFlag(flag, vertexIndex) {
  if (flag !== LAFEA_RENDER_QUALITY_FLAGS.VALID
    && flag !== LAFEA_RENDER_QUALITY_FLAGS.UNRECOVERED) {
    throw contractError('LAFEA_DIAGNOSTIC_DISPLAY_QUALITY_FLAG_UNSUPPORTED', {
      vertexIndex,
      qualityFlag: flag,
    });
  }
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function colorMap(value, colorMapId) {
  if (colorMapId === 'COOL_WARM') {
    return [
      Math.min(1, value * 2),
      1 - Math.abs((value * 2) - 1),
      Math.min(1, (1 - value) * 2),
    ];
  }
  return [
    Math.min(1, Math.max(0, 1.5 - Math.abs((4 * value) - 3))),
    Math.min(1, Math.max(0, 1.5 - Math.abs((4 * value) - 2))),
    Math.min(1, Math.max(0, 1.5 - Math.abs((4 * value) - 1))),
  ];
}
