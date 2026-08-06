import { diagnoseInputXmlTopologyGraph } from '../geometry/model-health/index.js';

/**
 * Diagnose a previously parsed InputXML source bundle.
 *
 * Raw XML is deliberately not accepted here. Call
 * `parseInputXmlModelHealthSource()` once, retain that bundle, and pass the
 * same object through diagnostics and later preparation stages.
 */
export function diagnoseInputXmlModelHealthTopology(sourceBundle, options = {}) {
  return diagnoseInputXmlTopologyGraph(sourceBundle, options);
}
