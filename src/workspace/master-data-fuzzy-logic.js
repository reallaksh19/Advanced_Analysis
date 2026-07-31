export function sequenceRatio(left, right) {
  const a = String(left || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = String(right || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!a || !b) return 0;
  const row = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const prior = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = prior;
    }
  }
  return (2 * row[b.length]) / (a.length + b.length);
}

export function fuzzyMatchLineId(entityLineId, lineListRows, lineKeyField) {
  let bestMatch = null;
  let bestScore = 0;
  
  const entityKey = String(entityLineId || '').trim();
  if (!entityKey) return null;

  for (const row of lineListRows) {
    const rowKey = String(row[lineKeyField] || '').trim();
    if (!rowKey) continue;
    
    if (entityKey.toLowerCase() === rowKey.toLowerCase()) {
      return row; // Exact match
    }

    const ratio = sequenceRatio(entityKey, rowKey);
    if (ratio > bestScore) {
      bestScore = ratio;
      bestMatch = row;
    }
  }

  // threshold for fuzzy match
  return bestScore >= 0.75 ? bestMatch : null;
}
