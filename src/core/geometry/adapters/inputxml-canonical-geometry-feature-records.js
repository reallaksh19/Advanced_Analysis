import { attributeValue, findAnyElements, findElements, firstElement } from './inputxml-tag-scanner.js';
import { convertInputXmlScalar } from './inputxml-unit-system.js';
import { INPUTXML_FEATURE_TAGS } from './inputxml-feature-registry.js';
import { addDiagnostic, caesarNumberOrNull, cleanNodeId } from './inputxml-canonical-geometry-values.js';

const RIGID_TAGS = INPUTXML_FEATURE_TAGS.RIGID;
const SIF_TAGS = INPUTXML_FEATURE_TAGS.SIF;
const HANGER_TAGS = INPUTXML_FEATURE_TAGS.HANGER;
const FORCES_MOMENTS_TAGS = INPUTXML_FEATURE_TAGS.FORCES_MOMENTS;
const ALLOWABLE_STRESS_TAGS = INPUTXML_FEATURE_TAGS.ALLOWABLE_STRESS;

export function attachChildEvidence(segment, edge, units, diagnostics) {
  const rigid = firstElement(edge.tag.inner, RIGID_TAGS);
  if (rigid) {
    const rawWeight = caesarNumberOrNull(attributeValue(rigid.attributes, 'WEIGHT'));
    segment.meta.analysis.rigid = {
      type: attributeValue(rigid.attributes, 'TYPE', 'RIGID_TYPE') || null,
      weight: rawWeight == null ? null : safeConvert(rawWeight, units.force, 'FORCE', edge, diagnostics),
    };
  }
  const sifs = findAnyElements(edge.tag.inner, SIF_TAGS)
    .map((tag) => ({
      nodeId: cleanNodeId(attributeValue(tag.attributes, 'NODE')) || null,
      typeCode: caesarNumberOrNull(attributeValue(tag.attributes, 'TYPE')),
      inPlane: caesarNumberOrNull(attributeValue(tag.attributes, 'SIF_IN')),
      outOfPlane: caesarNumberOrNull(attributeValue(tag.attributes, 'SIF_OUT')),
    }))
    .filter((row) => row.nodeId !== null);
  if (sifs.length > 0) {
    segment.meta.analysis.sifs = sifs;
    addDiagnostic(
      diagnostics, 'warn', 'INPUTXML_SIF_PRESENT_NOT_COMPILED',
      `Element ${edge.index + 1} contains ${sifs.length} active SIF record(s); their evidence is retained but no SIF override is silently applied by geometry ingestion.`,
      { elementIndex: edge.index, sifs },
    );
  }
  const hangers = findAnyElements(edge.tag.inner, HANGER_TAGS)
    .map((tag) => ({
      nodeId: cleanNodeId(attributeValue(tag.attributes, 'NODE')) || null,
      hangerTable: caesarNumberOrNull(attributeValue(tag.attributes, 'HGR_TABLE')),
      loadVariation: caesarNumberOrNull(attributeValue(tag.attributes, 'LOAD_VAR')),
    }))
    .filter((row) => row.nodeId !== null);
  if (hangers.length > 0) {
    segment.meta.analysis.hangers = hangers;
    addDiagnostic(
      diagnostics, 'warn', 'INPUTXML_HANGER_PRESENT_NOT_COMPILED',
      `Element ${edge.index + 1} contains ${hangers.length} active HANGER record(s); they are retained and explicitly reported as unsupported rather than dropped.`,
      { elementIndex: edge.index, hangers },
    );
  }
  const forcesMoments = findAnyElements(edge.tag.inner, FORCES_MOMENTS_TAGS)
    .map((tag) => {
      const nodeNumber = caesarNumberOrNull(attributeValue(tag.attributes, 'NODE_NUM', 'NODE'));
      const nodeId = nodeNumber == null ? null : cleanNodeId(String(nodeNumber));
      const vectors = findElements(tag.inner, 'VECTOR')
        .map((vector) => ({
          number: caesarNumberOrNull(attributeValue(vector.attributes, 'NUMBER')),
          force: {
            fx: convertedOptional(vector, 'FX', units.force, 'FORCE', edge, diagnostics),
            fy: convertedOptional(vector, 'FY', units.force, 'FORCE', edge, diagnostics),
            fz: convertedOptional(vector, 'FZ', units.force, 'FORCE', edge, diagnostics),
          },
          moment: {
            mx: convertedOptionalMoment(vector, 'MX', units, edge, diagnostics),
            my: convertedOptionalMoment(vector, 'MY', units, edge, diagnostics),
            mz: convertedOptionalMoment(vector, 'MZ', units, edge, diagnostics),
          },
        }))
        .filter((row) => row.number !== null);
      return {
        forceMomentNumber: caesarNumberOrNull(attributeValue(tag.attributes, 'FORCMNT_NUM')),
        nodeId,
        vectors,
      };
    })
    .filter((row) => row.nodeId !== null);
  if (forcesMoments.length > 0) {
    segment.meta.analysis.forcesMoments = forcesMoments;
    addDiagnostic(
      diagnostics, 'warn', 'INPUTXML_FORCES_MOMENTS_PRESENT_NOT_COMPILED',
      `Element ${edge.index + 1} contains ${forcesMoments.length} active FORCESMOMENTS record(s); their vectors are retained but no external nodal load is applied by geometry ingestion.`,
      { elementIndex: edge.index, forcesMoments },
    );
  }
  const allowableCount = findAnyElements(edge.tag.inner, ALLOWABLE_STRESS_TAGS).length;
  if (allowableCount > 0) {
    segment.meta.analysis.allowableStressRecordCount = allowableCount;
    addDiagnostic(
      diagnostics, 'info', 'INPUTXML_ALLOWABLE_STRESS_RECORD_PRESENT',
      `Element ${edge.index + 1} contains ALLOWABLESTRESS data; geometry ingestion records its presence but B-4 authority remains separately declared.`,
      { elementIndex: edge.index, recordCount: allowableCount },
    );
  }
}

function convertedOptional(tag, attribute, declaration, quantity, edge, diagnostics) {
  const value = caesarNumberOrNull(attributeValue(tag.attributes, attribute));
  return value == null ? null : safeConvert(value, declaration, quantity, edge, diagnostics);
}

function convertedOptionalMoment(tag, attribute, units, edge, diagnostics) {
  const value = caesarNumberOrNull(attributeValue(tag.attributes, attribute));
  if (value == null) return null;
  if (!units.momentInput) {
    addDiagnostic(
      diagnostics, 'error', 'INPUTXML_UNIT_DECLARATION_REQUIRED',
      'InputXML <UNITS> must declare MOMENT-INPUT to convert moment inputs.',
      { elementIndex: edge.index, quantity: 'MOMENT' },
    );
    return null;
  }
  return safeConvert(value, units.momentInput, 'MOMENT-INPUT', edge, diagnostics);
}

function safeConvert(value, declaration, quantity, edge, diagnostics) {
  try {
    return convertInputXmlScalar(value, declaration, quantity);
  } catch (error) {
    addDiagnostic(
      diagnostics, 'error', 'INPUTXML_UNIT_DECLARATION_REQUIRED',
      error instanceof Error ? error.message : String(error),
      { elementIndex: edge.index, quantity },
    );
    return null;
  }
}
