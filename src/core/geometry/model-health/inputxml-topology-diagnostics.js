import { requireInputXmlSourceBundle } from '../adapters/inputxml-source-bundle-contract.js';
import { diagnoseCanonicalTopology } from './topology-diagnostics.js';

export function diagnoseInputXmlTopology(sourceBundle, options = {}) {
  const accepted = requireInputXmlSourceBundle(sourceBundle);
  return diagnoseCanonicalTopology({
    geometry: accepted.geometry,
    sourceElements: accepted.elementRecords,
    sourceBundleSemanticHash: accepted.semanticHash,
    sourceBundleEvidenceHash: accepted.evidenceHash,
  }, options);
}
