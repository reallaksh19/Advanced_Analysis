/**
 * Topology Autofix Engine
 * Detects overlapping nodes (e.g. REST and SREF at the same POS) and provides merge suggestions.
 */

export const SUPPORT_HIERARCHY = ['REST', 'LINESTOP', 'ANCHOR', 'GUIDE', 'SUPPORT', 'ATTA', 'SREF'];

/**
 * Calculates 3D distance between two points.
 */
function distance3D(p1, p2) {
  if (!p1 || !p2) return Infinity;
  return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
}

/**
 * Gets the support priority rank (lower is better).
 */
function getPriorityIndex(supportType) {
  const type = String(supportType).toUpperCase();
  const index = SUPPORT_HIERARCHY.indexOf(type);
  return index === -1 ? 999 : index;
}

/**
 * Scans the provided elements for overlapping supports.
 * @param {Array} elements - Array of parsed benchmark elements/primitives
 * @param {Number} toleranceMm - Spatial tolerance to consider nodes overlapping
 * @returns {Object} { merges: Array of proposed merges, fixedElements: Array of elements after applying merges }
 */
export function analyzeTopologyOverlaps(elements, toleranceMm = 1.0) {
  const supports = elements.filter(el => el.type === 'SUPPORT' || el.attributes?.TYPE === 'ATTA');
  const overlaps = [];
  const processedIds = new Set();
  
  for (let i = 0; i < supports.length; i++) {
    const s1 = supports[i];
    if (processedIds.has(s1.supportKey)) continue;
    
    const pos1 = s1.position;
    if (!pos1) continue;
    
    const cluster = [s1];
    
    for (let j = i + 1; j < supports.length; j++) {
      const s2 = supports[j];
      if (processedIds.has(s2.supportKey)) continue;
      
      const pos2 = s2.position;
      if (!pos2) continue;
      
      if (distance3D(pos1, pos2) <= toleranceMm) {
        cluster.push(s2);
      }
    }
    
    if (cluster.length > 1) {
      cluster.forEach(s => processedIds.add(s.supportKey));
      
      // Determine dominant node
      let dominant = cluster[0];
      let bestRank = getPriorityIndex(dominant.supportEvidence?.SUPPORT_TYPE || dominant.type || dominant.name);
      
      for (let k = 1; k < cluster.length; k++) {
        const candidate = cluster[k];
        const rank = getPriorityIndex(candidate.supportEvidence?.SUPPORT_TYPE || candidate.type || candidate.name);
        // Special case: Name ending in /SREF is penalized
        const isSref = String(candidate.name).includes('SREF');
        const adjustedRank = isSref ? rank + 500 : rank;
        
        if (adjustedRank < bestRank) {
          bestRank = adjustedRank;
          dominant = candidate;
        }
      }
      
      const absorbed = cluster.filter(s => s.supportKey !== dominant.supportKey);
      overlaps.push({
        coordinate: { ...pos1 },
        dominant: dominant,
        absorbed: absorbed,
        description: `Merged: ${dominant.name} absorbed ${absorbed.map(a => a.name).join(', ')}`
      });
    }
  }
  
  // Create fixed elements array
  const absorbedNames = new Set(overlaps.flatMap(o => o.absorbed.map(a => a.supportKey)));
  const fixedElements = elements.map(el => {
    if (absorbedNames.has(el.supportKey)) {
      return { ...el, type: 'IGNORED_SUPPORT', IGNORED_OVERLAP: true };
    }
    return el;
  });
  
  return { merges: overlaps, fixedElements };
}
