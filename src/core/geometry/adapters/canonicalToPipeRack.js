const getNominalNps = (segment = {}) => {
  const diameterMm = Number(segment.diameter || segment.od || segment.meta?.diameter || 0);
  if (diameterMm > 0) return Math.max(1, Math.round((diameterMm / 25.4) * 2) / 2);
  return Number(segment.sizeNps || segment.meta?.sizeNps || 8);
};

export function canonicalToPipeRack(geometry = {}, options = {}) {
  const segments = Array.isArray(geometry.segments) ? geometry.segments : [];
  const nodes = Array.isArray(geometry.nodes) ? geometry.nodes : [];
  const pipeSegments = segments.filter((segment) => ['PIPE', 'BEND', 'ELBOW'].includes(String(segment.type || 'PIPE').toUpperCase()));
  const warnings = [];

  const lines = pipeSegments.map((segment, index) => ({
    id: segment.id || `PR${index + 1}`,
    sourceSegmentId: segment.id,
    sizeNps: getNominalNps(segment),
    schedule: String(segment.schedule || segment.meta?.schedule || '40'),
    service: String(segment.service || segment.meta?.service || 'Process-Liquid'),
    material: String(segment.material || segment.meta?.material || options.material || 'Carbon Steel'),
    tOperate: Number(options.tOperate ?? segment.tOperate ?? segment.meta?.tOperate ?? 300),
    insulationThk: Number(options.insulationThk ?? segment.insulationThk ?? segment.meta?.insulationThk ?? 0),
    guide_mm: Number(options.guide_mm ?? 50),
    flange: String(options.flange || '150#'),
    hasFlange: Boolean(options.hasFlange ?? true),
    stagger: Boolean(options.stagger ?? true),
    hasVessel: false,
    vesselData: { R_mm: 800, T_mm: 20, r_n_mm: 100, f_MPa: 138 },
    tier: Number(options.tier ?? 1),
    slotIndex: index,
    loop_order: null,
    spacing_override: null,
    userOrderIndex: null,
    color: options.color || '#38bdf8',
    is3DLoop: false,
  }));

  if (!pipeSegments.length && segments.length) {
    warnings.push({ severity: 'warn', code: 'PIPE_RACK_NO_PIPE_SEGMENTS', message: 'Canonical geometry contains segments, but no PIPE/BEND/ELBOW segments were suitable for pipe-rack conversion.' });
  }

  return {
    schemaVersion: 'canonical-to-piperack-v1',
    source: options.source || geometry.source || 'canonical',
    unit: geometry.unit || 'unknown',
    lines,
    nodes,
    diagnostics: [...(geometry.diagnostics || []), ...warnings],
    summary: { inputSegmentCount: segments.length, lineCount: lines.length, warningCount: warnings.length },
  };
}
