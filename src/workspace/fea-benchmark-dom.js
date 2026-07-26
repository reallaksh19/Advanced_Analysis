/**
 * Shared DOM and formatting helpers for the FEA benchmark panel.
 *
 * Inputs are explicit DOM roots and scalar values. No benchmark decision or
 * engineering quantity is calculated here.
 */
export function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function shortBenchmarkId(checkId, caseId) {
  return checkId.startsWith(`${caseId}.`)
    ? checkId.slice(caseId.length + 1)
    : checkId;
}

export function formatBenchmarkNumber(value, unit) {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return String(value);
  const suffix = unit && unit !== '-' ? ` ${unit}` : '';
  if (value === 0) return `0${suffix}`;
  const magnitude = Math.abs(value);
  const text = magnitude < 1e-3 || magnitude >= 1e6
    ? value.toExponential(4)
    : value.toPrecision(7);
  return `${text}${suffix}`;
}

export function benchmarkElement(root, tag, className, text) {
  const documentRef = root?.ownerDocument ?? globalThis.document;
  const value = documentRef.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

export function benchmarkButton(root, text, handler) {
  const value = benchmarkElement(root, 'button', null, text);
  value.type = 'button';
  value.addEventListener('click', handler);
  return value;
}
