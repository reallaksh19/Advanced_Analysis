import { semanticHash } from '../shared-piping-model/canonical-json.js';
import deepFreeze from '../shared-piping-model/immutable.js';

export const INPUTXML_FORCE_MOMENT_COMPILATION_SCHEMA =
  'linear-piping-inputxml-force-moment-compilation/v1';

export class InputXmlForceMomentCompilationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'InputXmlForceMomentCompilationError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

/**
 * Compile retained CAESAR II InputXML FORCESMOMENTS declarations into physical
 * NODAL_FORCE_MOMENT load primitives. InputXML force/moment components are
 * global by definition in this adapter path; no element-local frame is inferred.
 *
 * The selected vector numbers are explicit load-set custody. A declaration is
 * emitted at most once for each source segment / record / vector identity.
 */
export function compileInputXmlForceMomentPrimitives({
  geometry,
  kernelNodeByReference,
  vectorNumbers,
  sourceId,
  sourceRevision,
  primitiveIdPrefix = 'INPUTXML-FORCE-MOMENT',
}) {
  requireGeometry(geometry);
  const selected = requireVectorNumbers(vectorNumbers);
  const resolveNode = nodeResolver(kernelNodeByReference);
  const primitives = [];
  const authorities = [];
  const diagnostics = [];
  const identities = new Set();

  for (const segment of geometry.segments) {
    const records = segment?.meta?.analysis?.forcesMoments ?? [];
    if (!Array.isArray(records)) {
      throw new InputXmlForceMomentCompilationError(
        'INPUTXML_FORCE_MOMENT_RECORDS_INVALID',
        `Segment ${String(segment.id)} forcesMoments must be an array.`,
        { segmentId: segment.id },
      );
    }
    for (const [recordOrdinal, record] of records.entries()) {
      if (!record || typeof record !== 'object' || !record.nodeId) {
        throw new InputXmlForceMomentCompilationError(
          'INPUTXML_FORCE_MOMENT_RECORD_INVALID',
          `Segment ${String(segment.id)} force/moment record ${recordOrdinal} is malformed.`,
          { segmentId: segment.id, recordOrdinal },
        );
      }
      if (!Array.isArray(record.vectors)) {
        throw new InputXmlForceMomentCompilationError(
          'INPUTXML_FORCE_MOMENT_VECTORS_INVALID',
          `Segment ${String(segment.id)} force/moment record ${recordOrdinal} has no vector array.`,
          { segmentId: segment.id, recordOrdinal, nodeId: record.nodeId },
        );
      }
      const kernelNodeId = resolveNode(record.nodeId);
      if (!kernelNodeId) {
        throw new InputXmlForceMomentCompilationError(
          'INPUTXML_FORCE_MOMENT_NODE_UNBOUND',
          `Declared force/moment node ${record.nodeId} is not bound to the mechanical model.`,
          { segmentId: segment.id, recordOrdinal, nodeId: record.nodeId },
        );
      }

      for (const vectorNumber of selected) {
        const matches = record.vectors.filter((vector) => vector?.number === vectorNumber);
        if (matches.length > 1) {
          throw new InputXmlForceMomentCompilationError(
            'INPUTXML_FORCE_MOMENT_VECTOR_DUPLICATED',
            `Force/moment record at node ${record.nodeId} repeats vector ${vectorNumber}.`,
            { segmentId: segment.id, recordOrdinal, nodeId: record.nodeId, vectorNumber },
          );
        }
        if (matches.length === 0) {
          diagnostics.push(Object.freeze({
            severity: 'INFO',
            code: 'INPUTXML_FORCE_MOMENT_VECTOR_NOT_DECLARED',
            segmentId: segment.id,
            recordOrdinal,
            nodeId: record.nodeId,
            vectorNumber,
          }));
          continue;
        }
        const vector = matches[0];
        const force = components(vector.force, ['fx', 'fy', 'fz'], 'force', {
          segmentId: segment.id,
          recordOrdinal,
          nodeId: record.nodeId,
          vectorNumber,
        });
        const moment = components(vector.moment, ['mx', 'my', 'mz'], 'moment', {
          segmentId: segment.id,
          recordOrdinal,
          nodeId: record.nodeId,
          vectorNumber,
        });
        if ([...Object.values(force), ...Object.values(moment)].every((value) => value === 0)) {
          diagnostics.push(Object.freeze({
            severity: 'INFO',
            code: 'INPUTXML_FORCE_MOMENT_VECTOR_ZERO',
            segmentId: segment.id,
            recordOrdinal,
            nodeId: record.nodeId,
            vectorNumber,
          }));
          continue;
        }

        const identity = [segment.id, recordOrdinal, record.forceMomentNumber ?? 'UNNUMBERED', record.nodeId, vectorNumber].join('|');
        if (identities.has(identity)) {
          throw new InputXmlForceMomentCompilationError(
            'INPUTXML_FORCE_MOMENT_DECLARATION_DUPLICATED',
            `Force/moment declaration ${identity} would be assembled more than once.`,
            { identity },
          );
        }
        identities.add(identity);
        const primitiveId = `${primitiveIdPrefix}-${safeId(segment.id)}-R${recordOrdinal + 1}-V${vectorNumber}`;
        const evidencePayload = {
          sourceId,
          sourceRevision,
          sourceSegmentId: segment.id,
          recordOrdinal,
          forceMomentNumber: record.forceMomentNumber ?? null,
          sourceNodeId: record.nodeId,
          vectorNumber,
          basis: 'GLOBAL',
          force,
          moment,
        };
        const sourceEvidence = {
          sourceId,
          sourceRevision,
          sourceSemanticHash: semanticHash(evidencePayload),
        };
        primitives.push(Object.freeze({
          schema: 'fea-linear-load-primitive/v1',
          primitiveId,
          kind: 'NODAL_FORCE_MOMENT',
          nodeId: kernelNodeId,
          basis: Object.freeze({ kind: 'GLOBAL' }),
          force: Object.freeze(force),
          moment: Object.freeze(moment),
          units: Object.freeze({ force: 'N', moment: 'N*m', length: 'm' }),
          signConvention: 'APPLIED_TO_STRUCTURE',
          sourceEvidence: Object.freeze(sourceEvidence),
        }));
        authorities.push(Object.freeze({
          identity,
          primitiveId,
          sourceSegmentId: segment.id,
          recordOrdinal,
          forceMomentNumber: record.forceMomentNumber ?? null,
          sourceNodeId: record.nodeId,
          kernelNodeId,
          vectorNumber,
          basis: 'GLOBAL',
          force: Object.freeze(force),
          moment: Object.freeze(moment),
          sourceEvidence: Object.freeze(sourceEvidence),
        }));
      }
    }
  }

  const result = {
    schema: INPUTXML_FORCE_MOMENT_COMPILATION_SCHEMA,
    sourceId,
    sourceRevision,
    selectedVectorNumbers: [...selected],
    primitives,
    authorities,
    diagnostics,
    summary: {
      declarationCount: authorities.length,
      primitiveCount: primitives.length,
      globalBasisCount: authorities.length,
      diagnosticCount: diagnostics.length,
    },
    semanticHash: '',
  };
  result.semanticHash = semanticHash({ ...result, semanticHash: '' });
  return deepFreeze(result);
}

function requireGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object' || !Array.isArray(geometry.segments)) {
    throw new InputXmlForceMomentCompilationError(
      'INPUTXML_FORCE_MOMENT_GEOMETRY_INVALID',
      'Canonical geometry with a segments array is required.',
    );
  }
}

function requireVectorNumbers(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InputXmlForceMomentCompilationError(
      'INPUTXML_FORCE_MOMENT_VECTOR_SELECTION_REQUIRED',
      'At least one positive FORCESMOMENTS vector number must be selected explicitly.',
    );
  }
  const selected = value.map((number) => {
    if (!Number.isInteger(number) || number <= 0) {
      throw new InputXmlForceMomentCompilationError(
        'INPUTXML_FORCE_MOMENT_VECTOR_SELECTION_INVALID',
        `Invalid FORCESMOMENTS vector number ${String(number)}.`,
      );
    }
    return number;
  });
  if (new Set(selected).size !== selected.length) {
    throw new InputXmlForceMomentCompilationError(
      'INPUTXML_FORCE_MOMENT_VECTOR_SELECTION_DUPLICATED',
      'FORCESMOMENTS vector selection contains duplicates.',
    );
  }
  return Object.freeze([...selected].sort((left, right) => left - right));
}

function nodeResolver(value) {
  if (value instanceof Map) return (nodeId) => value.get(nodeId);
  if (typeof value === 'function') return value;
  throw new InputXmlForceMomentCompilationError(
    'INPUTXML_FORCE_MOMENT_NODE_RESOLVER_INVALID',
    'kernelNodeByReference must be a Map or resolver function.',
  );
}

function components(value, fields, label, details) {
  if (!value || typeof value !== 'object') {
    throw new InputXmlForceMomentCompilationError(
      'INPUTXML_FORCE_MOMENT_COMPONENTS_INVALID',
      `Declared ${label} components are missing.`,
      details,
    );
  }
  return Object.fromEntries(fields.map((field) => {
    const component = value[field];
    if (component == null) return [field, 0];
    if (!Number.isFinite(component)) {
      throw new InputXmlForceMomentCompilationError(
        'INPUTXML_FORCE_MOMENT_COMPONENT_NONFINITE',
        `Declared ${label}.${field} must be finite when present.`,
        { ...details, field, value: component },
      );
    }
    return [field, component];
  }));
}

function safeId(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/gu, '_');
}
