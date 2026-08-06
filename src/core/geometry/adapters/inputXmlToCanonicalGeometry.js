export { parseInputXmlSourceBundle } from './inputxml-source-bundle.js';

import { parseInputXmlSourceBundle } from './inputxml-source-bundle.js';

/**
 * Compatibility projection for existing callers that only need canonical
 * geometry. The source-bundle parser remains the sole raw InputXML authority.
 */
export function inputXmlToCanonicalGeometry(xmlText, options = {}) {
  return parseInputXmlSourceBundle(xmlText, options).geometry;
}
