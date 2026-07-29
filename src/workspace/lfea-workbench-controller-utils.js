import { FEA_BENCHMARK_STYLES } from './fea-benchmark-styles.js';
import { LFEA_WORKBENCH_STYLES } from './lfea-workbench-styles.js';

export function installLfeaWorkbenchStyles(documentRef) {
  if (!documentRef || documentRef.querySelector('[data-lfea-workbench-styles]')) return;
  const style = documentRef.createElement('style');
  style.dataset.lfeaWorkbenchStyles = 'true';
  style.textContent = `${LFEA_WORKBENCH_STYLES}\n${FEA_BENCHMARK_STYLES}`;
  documentRef.head?.append(style);
}

export async function readLfeaUtf8(file) {
  if (typeof file.arrayBuffer === 'function') {
    return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  }
  if (typeof file.text === 'function') return file.text();
  throw new TypeError('Selected LFEA source cannot be read.');
}

export function parseLfeaJsonObject(text, label) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object.`);
  }
  return value;
}

export function serializableLfeaError(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : 'Unknown LFEA worker failure.',
    code: typeof error?.code === 'string' ? error.code : null,
  };
}

export function downloadLfeaJson(documentRef, value, filename) {
  if (!documentRef || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  }));
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  documentRef.body?.append(anchor);
  anchor.click();
  anchor.remove();
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
    clearTimeout(timeout);
  };
  const timeout = setTimeout(revoke, 30000);
  documentRef.defaultView?.addEventListener('focus', revoke, { once: true });
}
