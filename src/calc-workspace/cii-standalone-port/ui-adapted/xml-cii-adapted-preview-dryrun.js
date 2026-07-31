export * from './xml-cii-adapted-preview-dryrun-core.js';

import { xmlCiiDryRunPreview as buildCorePreview } from './xml-cii-adapted-preview-dryrun-core.js';
import { applyPreviewBoreWallAuthority } from './xml-cii-adapted-preview-bore-wall-authority.js';
import { applyPreviewRatingAuthority } from './xml-cii-adapted-preview-rating-authority.js';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  import('../../xml-cii-effective-class-shard-hydrator.js')
    .then(({ installXmlCiiEffectiveClassShardHydrator }) => installXmlCiiEffectiveClassShardHydrator())
    .catch((error) => console.error('Failed to install XML→CII effective-class shard hydrator:', error));
}

// Rating authority changed from automatic Line List / DTXR fallback to explicit
// override → Piping Class master → Regex extraction. Remove old renderer bridges
// and the former cache envelope before any upgraded Preview can restore them.
try {
  if (typeof localStorage !== 'undefined') {
    for (const key of ['xml-cii-pv-cache-v8-dtxr', 'xml-cii-pv-cache-v7', 'xml-cii-pv-cache-v6']) {
      localStorage.removeItem(key);
    }
  }
} catch {}

export function xmlCiiDryRunPreview(xmlText, config, stagedJsonText) {
  const coreResult = buildCorePreview(xmlText, config, stagedJsonText);
  const wallResult = applyPreviewBoreWallAuthority({
    xmlText,
    config,
    stagedJsonText,
    result: coreResult,
  });
  return applyPreviewRatingAuthority({
    xmlText,
    config,
    stagedJsonText,
    result: wallResult,
  });
}
