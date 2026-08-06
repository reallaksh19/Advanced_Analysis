import { attributeValue, findElements, firstElement } from './inputxml-tag-scanner.js';
import { parseInputXmlUnitSystem } from './inputxml-unit-system.js';
import { buildInputXmlCanonicalGeometry } from './inputxml-canonical-geometry-builder.js';
import { buildInputXmlSourceRecords } from './inputxml-source-records.js';
import { rawFiniteNumber } from './inputxml-canonical-geometry-features.js';
import {
  computeInputXmlBundleContentHash,
  computeInputXmlBundleSourceSemanticHash,
  sealInputXmlSourceBundle,
} from './inputxml-source-bundle-contract.js';

/**
 * Parse CAESAR II InputXML into one source bundle. Canonical geometry and
 * retained source records consume the same PIPINGELEMENT scan, inherited
 * field state, sentinel rules and unit authority.
 */
export function parseInputXmlSourceBundle(xmlText, options = {}) {
  if (typeof xmlText !== 'string') throw new TypeError('parseInputXmlSourceBundle requires InputXML text.');
  const geometryDiagnostics = [];
  const unitSystem = parseInputXmlUnitSystem(xmlText, options.unit, geometryDiagnostics);
  if (!unitSystem.lengthUnit) {
    throw new TypeError(
      'parseInputXmlSourceBundle requires options.unit when InputXML has no supported <UNITS><LENGTH> declaration.',
    );
  }
  const sourceLabel = options.source || 'inputxml';
  const pipingModelAttrs = firstElement(xmlText, ['PIPINGMODEL'])?.attributes || {};
  const jobName = attributeValue(pipingModelAttrs, 'JOBNAME');
  const elementTags = findElements(xmlText, 'PIPINGELEMENT');
  const { geometry, edges } = buildInputXmlCanonicalGeometry({
    elementTags,
    unitSystem,
    sourceLabel,
    jobName,
    options,
    diagnostics: geometryDiagnostics,
  });
  const sourceRecordDiagnostics = [];
  const records = buildInputXmlSourceRecords({
    edges,
    segments: geometry.segments,
    unitSystem,
    diagnostics: sourceRecordDiagnostics,
  });
  const contentHash = computeInputXmlBundleContentHash(xmlText);
  const sourceSemanticHash = computeInputXmlBundleSourceSemanticHash(contentHash);
  return sealInputXmlSourceBundle({
    source: {
      fileName: options.fileName ?? null,
      sourceLabel,
      contentHash,
      sourceSemanticHash,
      declaredCounts: {
        elements: rawFiniteNumber(attributeValue(pipingModelAttrs, 'NUMELT')),
        bends: rawFiniteNumber(attributeValue(pipingModelAttrs, 'NUMBEND')),
        rigids: rawFiniteNumber(attributeValue(pipingModelAttrs, 'NUMRIGID')),
        restraints: rawFiniteNumber(attributeValue(pipingModelAttrs, 'NUMREST')),
      },
    },
    unitSystem,
    elementRecords: records.elementRecords,
    sourceRecords: records.sourceRecords,
    geometry,
    diagnostics: sourceRecordDiagnostics,
  });
}
