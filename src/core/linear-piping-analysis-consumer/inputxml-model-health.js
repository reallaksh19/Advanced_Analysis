import {
  diagnoseInputXmlTopologyGraph,
  diagnoseInputXmlTopologyProximity,
} from '../geometry/model-health/index.js';
import { diagnoseInputXmlLinearModelHealth } from './inputxml-linear-model-health.js';

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

export function diagnoseInputXmlModelHealthProximity(sourceBundle, options = {}) {
  return diagnoseInputXmlTopologyProximity(sourceBundle, options);
}

export { diagnoseInputXmlLinearModelHealth };
