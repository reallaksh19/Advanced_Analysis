/**
 * Fallback policy handler for engineering data lookups.
 *
 * When a requested piece of engineering data (pipe size, material grade, etc.)
 * is not found in a source table, this helper returns a structured result
 * rather than silently substituting another value.  A fallback is only
 * applied if the `fallbackPolicy.allowFallback` flag is true and a
 * `fallbackValue` is provided.  The status will be `NOT_QUALIFIED` for
 * fallback values and `MISSING_DATA` if no fallback is permitted.
 */

export function resolveEngineeringData({ requested, sourceTable, dataType, fallbackPolicy }) {
  const diagnostics = [];
  const value = sourceTable && requested != null ? sourceTable[requested] : undefined;
  if (value !== undefined) {
    return {
      value,
      status: 'OK',
      dataSource: 'primary',
      diagnostics,
      usedFallback: false
    };
  }
  if (fallbackPolicy && fallbackPolicy.allowFallback && fallbackPolicy.fallbackValue !== undefined) {
    diagnostics.push({ message: `${dataType} "${requested}" not found; using fallback value`, severity: 'WARNING' });
    return {
      value: fallbackPolicy.fallbackValue,
      status: 'NOT_QUALIFIED',
      dataSource: 'fallback',
      diagnostics,
      usedFallback: true
    };
  }
  diagnostics.push({ message: `${dataType} "${requested}" not found and no fallback permitted`, severity: 'ERROR' });
  return {
    value: null,
    status: 'MISSING_DATA',
    dataSource: null,
    diagnostics,
    usedFallback: false
  };
}