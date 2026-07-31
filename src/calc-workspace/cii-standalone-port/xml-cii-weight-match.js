export function runStandaloneWeightMatch({ xmlText = '', stagedJsonText = '', config = {} } = {}) {
  return {
    matchedCount: 0,
    unmatchedCount: 0,
    rows: []
  };
}
