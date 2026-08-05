import {
  BM2_JUNCTION_SURFACE_NODE_PROFILE,
  buildBm2JunctionSurfaceNodeAuthorities as buildRawBm2JunctionSurfaceNodeAuthorities,
} from './lfea-b3.28-bm2-junction-surface-node-runtime-base.mjs';

export { BM2_JUNCTION_SURFACE_NODE_PROFILE };

export const BM2_BEND_STATION_SENTINEL_NORMALIZATION = Object.freeze({
  schema: 'lfea-bm2-bend-station-sentinel-normalization/v1',
  sourceValue: -2.0202,
  effectiveRule: 'BEND_MIDPOINT_HALF_SWEEP_V1',
  affectedNodeId: '64',
  affectedSourceElement: '60-65',
  sourceField: 'ANGLE1',
  effectiveAngleDegrees: 45,
  sourceAuthority: 'CAESAR_INPUTXML_DOUBLE_SENTINEL_INTERPRETATION',
});

function normalizeMidpointSentinel(content) {
  const source = 'ANGLE1="-2.020200" NODE1="64.000000"';
  const effective = 'ANGLE1="45.000000" NODE1="64.000000"';
  const occurrences = content.split(source).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `BM2 bend midpoint sentinel normalization expected one source record; found ${occurrences}.`,
    );
  }
  return content.replace(source, effective);
}

export function buildBm2JunctionSurfaceNodeAuthorities() {
  const raw = buildRawBm2JunctionSurfaceNodeAuthorities();
  const effectiveContent = normalizeMidpointSentinel(raw.content);
  return Object.freeze({
    ...raw,
    rawInputXmlContent: raw.content,
    content: effectiveContent,
    bendStationSentinelNormalization: BM2_BEND_STATION_SENTINEL_NORMALIZATION,
  });
}
