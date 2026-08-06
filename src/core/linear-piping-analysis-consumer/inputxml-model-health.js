import { diagnoseInputXmlTopology } from '../geometry/model-health/index.js';
import { parseInputXmlModelHealthSource } from './inputxml-source-binding.js';

export const INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA = 'fea-inputxml-model-health-source/v1';

export function diagnoseInputXmlModelHealthSource(content, options) {
  const acceptedOptions = options ?? {};
  const { topology: topologyOptions = {}, ...ingestionOptions } = acceptedOptions;
  const sourceBundle = parseInputXmlModelHealthSource(content, ingestionOptions);
  const topology = diagnoseInputXmlTopology(sourceBundle, topologyOptions);
  return Object.freeze({
    schema: INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA,
    sourceBundleSemanticHash: sourceBundle.semanticHash,
    sourceBundleEvidenceHash: sourceBundle.evidenceHash,
    status: topology.status,
    sourceBundle,
    topology,
  });
}
