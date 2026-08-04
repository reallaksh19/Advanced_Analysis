import {
  canonicalPrettyStringify,
  canonicalStringify,
  semanticHash,
} from '../../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../shared-piping-model/immutable.js';
import {
  createCsvContent,
  sealExportRecord,
} from '../../linear-piping-presentation/export.js';

export const INPUTXML_RESOLVED_GROUND_TRUTH_SCHEMA =
  'inputxml-resolved-ground-truth/v1';

export const INPUTXML_RESOLUTION_STATUSES = Object.freeze([
  'DECLARED',
  'INHERITED',
  'MISSING',
]);

const FIELD_SPECS = Object.freeze([
  Object.freeze({ key: 'diameter', label: 'DIAMETER', source: 'segment', unit: 'SOURCE_LENGTH_UNIT' }),
  Object.freeze({ key: 'thickness', label: 'WALL_THICK', source: 'segment', unit: 'SOURCE_LENGTH_UNIT' }),
  Object.freeze({ key: 'material', label: 'MATERIAL_NAME', source: 'segment', unit: null }),
  Object.freeze({ key: 'elasticModulus', label: 'MODULUS', source: 'analysis', unit: 'Pa' }),
  Object.freeze({ key: 'poissonRatio', label: 'POISSONS', source: 'analysis', unit: null }),
  Object.freeze({ key: 'operatingTemperature', label: 'TEMP_EXP_C1', source: 'analysis', unit: 'K' }),
  Object.freeze({ key: 'pressure', label: 'PRESSURE1', source: 'analysis', unit: 'Pa' }),
  Object.freeze({ key: 'hydroPressure', label: 'HYDRO_PRESSURE', source: 'analysis', unit: 'Pa' }),
  Object.freeze({ key: 'fluidDensity', label: 'FLUID_DENSITY', source: 'analysis', unit: 'kg/m^3' }),
  Object.freeze({ key: 'pipeDensity', label: 'PIPE_DENSITY', source: 'analysis', unit: 'kg/m^3' }),
  Object.freeze({ key: 'insulationThickness', label: 'INSUL_THICK', source: 'analysis', unit: 'm' }),
  Object.freeze({ key: 'insulationDensity', label: 'INSUL_DENSITY', source: 'analysis', unit: 'kg/m^3' }),
  Object.freeze({ key: 'corrosionAllowance', label: 'CORR_ALLOW', source: 'analysis', unit: 'm' }),
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'source',
  'units',
  'summary',
  'nodes',
  'elements',
  'diagnostics',
  'semanticHash',
  'evidenceHash',
]);

/**
 * Package already-resolved InputXML geometry as a deterministic, reviewable,
 * pre-solve authority. No value is recalculated here: field values come only
 * from the adapter output, while DECLARED/INHERITED/MISSING provenance is
 * resolved from the adapter's inheritance diagnostics.
 */
export function buildInputXmlResolvedGroundTruth(geometry) {
  requireGeometry(geometry);
  const diagnostics = normalizedDiagnostics(geometry.diagnostics ?? []);
  const nodes = buildNodeRows(geometry, diagnostics);
  const elements = buildElementRows(geometry, diagnostics);
  const draft = {
    schema: INPUTXML_RESOLVED_GROUND_TRUTH_SCHEMA,
    source: {
      sourceId: requireText(geometry.source, 'geometry.source'),
      geometrySchemaVersion: requireText(geometry.schemaVersion, 'geometry.schemaVersion'),
      geometrySemanticHash: geometrySemanticHash(geometry),
      jobName: optionalText(geometry.summary?.jobName),
      sourceLengthUnit: requireText(geometry.unit, 'geometry.unit'),
    },
    units: fieldUnits(geometry.unit),
    summary: {
      nodeCount: nodes.length,
      elementCount: elements.length,
      diagnosticCount: diagnostics.length,
      valid: geometry.valid === true,
    },
    nodes,
    elements,
    diagnostics,
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeInputXmlResolvedGroundTruthSemanticHash(draft);
  draft.evidenceHash = computeInputXmlResolvedGroundTruthEvidenceHash(draft);
  return requireInputXmlResolvedGroundTruth(draft);
}

export function requireInputXmlResolvedGroundTruth(value) {
  requireRecord(value, 'inputXmlResolvedGroundTruth');
  requireExactKeys(value, TOP_LEVEL_KEYS, 'inputXmlResolvedGroundTruth');
  if (value.schema !== INPUTXML_RESOLVED_GROUND_TRUTH_SCHEMA) {
    fail('InputXML resolved ground-truth schema is unsupported.');
  }
  requireRecord(value.source, 'inputXmlResolvedGroundTruth.source');
  requireRecord(value.units, 'inputXmlResolvedGroundTruth.units');
  requireRecord(value.summary, 'inputXmlResolvedGroundTruth.summary');
  if (!Array.isArray(value.nodes) || !Array.isArray(value.elements)
    || !Array.isArray(value.diagnostics)) {
    fail('InputXML resolved ground truth requires nodes, elements and diagnostics arrays.');
  }
  if (value.summary.nodeCount !== value.nodes.length
    || value.summary.elementCount !== value.elements.length
    || value.summary.diagnosticCount !== value.diagnostics.length) {
    fail('InputXML resolved ground-truth counts are stale.');
  }
  validateResolutionRows(value.elements);
  requireHash(value.source.geometrySemanticHash, 'source.geometrySemanticHash');
  requireHash(value.semanticHash, 'semanticHash');
  requireHash(value.evidenceHash, 'evidenceHash');
  if (value.semanticHash !== computeInputXmlResolvedGroundTruthSemanticHash(value)
    || value.evidenceHash !== computeInputXmlResolvedGroundTruthEvidenceHash(value)) {
    fail('InputXML resolved ground-truth hashes are stale.');
  }
  return deepFreeze(structuredClone(value));
}

export function computeInputXmlResolvedGroundTruthSemanticHash(value) {
  return semanticHash({
    schema: value.schema,
    source: value.source,
    units: value.units,
    summary: {
      nodeCount: value.summary.nodeCount,
      elementCount: value.summary.elementCount,
      valid: value.summary.valid,
    },
    nodes: value.nodes.map(withoutDiagnostics),
    elements: value.elements.map(withoutDiagnostics),
  });
}

export function computeInputXmlResolvedGroundTruthEvidenceHash(value) {
  return semanticHash({
    semanticHash: value.semanticHash,
    diagnosticCount: value.summary.diagnosticCount,
    diagnostics: value.diagnostics,
    nodeDiagnostics: value.nodes.map((row) => ({
      sourceNodeId: row.sourceNodeId,
      diagnostics: row.diagnostics,
    })),
    elementDiagnostics: value.elements.map((row) => ({
      sourceElementId: row.sourceElementId,
      diagnostics: row.diagnostics,
    })),
  });
}

/**
 * Produce one full-fidelity JSON export plus two rectangular CSV review tables.
 * Nodes and elements are deliberately separate because combining them creates a
 * ragged table with incompatible columns and hides missing-value provenance.
 */
export function createInputXmlResolvedGroundTruthExports(documentValue) {
  const document = requireInputXmlResolvedGroundTruth(documentValue);
  const base = {
    applicationId: document.source.sourceId,
    presentationSemanticHash: document.semanticHash,
    qualificationStatus: 'PRE_SOLVE_REVIEW',
  };
  return deepFreeze([
    sealExportRecord({
      ...base,
      role: 'INPUTXML_RESOLVED_GROUND_TRUTH_JSON',
      fileName: 'inputxml-resolved-ground-truth.json',
      mediaType: 'application/json',
      content: canonicalPrettyStringify(document),
    }),
    sealExportRecord({
      ...base,
      role: 'INPUTXML_RESOLVED_GROUND_TRUTH_NODES_CSV',
      fileName: 'inputxml-resolved-ground-truth-nodes.csv',
      mediaType: 'text/csv',
      content: nodeCsv(document),
    }),
    sealExportRecord({
      ...base,
      role: 'INPUTXML_RESOLVED_GROUND_TRUTH_ELEMENTS_CSV',
      fileName: 'inputxml-resolved-ground-truth-elements.csv',
      mediaType: 'text/csv',
      content: elementCsv(document),
    }),
  ]);
}

function buildNodeRows(geometry, diagnostics) {
  return [...geometry.nodes]
    .sort((left, right) => compareIds(left.id, right.id))
    .map((node) => ({
      sourceNodeId: String(node.id),
      coordinates: {
        x: finiteOrNull(node.x),
        y: finiteOrNull(node.y),
        z: finiteOrNull(node.z),
      },
      restraintClassification: requireText(node.restraint, `node[${node.id}].restraint`),
      restraints: structuredClone(node.meta?.restraints ?? []),
      diagnostics: diagnostics.filter((row) => diagnosticTargetsNode(row, String(node.id))),
    }));
}

function buildElementRows(geometry, diagnostics) {
  const ordered = [...geometry.segments].sort(compareSegments);
  const lastDeclared = new Map();
  return ordered.map((segment) => {
    const sourceIndex = integerIndex(segment.meta?.sourceIndex, segment.id);
    const elementDiagnostics = diagnostics.filter((row) => diagnosticTargetsElement(
      row,
      segment.id,
      sourceIndex,
    ));
    const fields = {};
    for (const spec of FIELD_SPECS) {
      const value = spec.source === 'segment'
        ? segment[spec.key]
        : segment.meta?.analysis?.[spec.key];
      fields[spec.key] = resolutionFor({
        segment,
        sourceIndex,
        spec,
        value,
        diagnostics: elementDiagnostics,
        lastDeclared,
      });
    }
    const analysis = segment.meta?.analysis ?? {};
    const sifs = structuredClone(analysis.sifs ?? []);
    const hangers = structuredClone(analysis.hangers ?? []);
    return {
      sourceElementId: requireText(segment.id, 'segment.id'),
      sourceIndex,
      fromNode: requireText(segment.startNodeId, `${segment.id}.startNodeId`),
      toNode: requireText(segment.endNodeId, `${segment.id}.endNodeId`),
      type: requireText(segment.type, `${segment.id}.type`),
      fields,
      childEvidence: {
        rigid: {
          present: analysis.rigid !== undefined && analysis.rigid !== null,
          record: analysis.rigid == null ? null : structuredClone(analysis.rigid),
        },
        sifs: { present: sifs.length > 0, count: sifs.length, records: sifs },
        hangers: { present: hangers.length > 0, count: hangers.length, records: hangers },
        allowableStressRecordCount: finiteCount(analysis.allowableStressRecordCount),
      },
      diagnostics: elementDiagnostics,
    };
  });
}

function resolutionFor({ segment, sourceIndex, spec, value, diagnostics, lastDeclared }) {
  if (value === undefined || value === null) return { status: 'MISSING' };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    fail(`${segment.id}.${spec.key} must be finite when resolved.`);
  }
  const inheritedCode = `${spec.label}_INHERITED_FROM_PRIOR_ELEMENT`;
  const inherited = diagnostics.some((row) => row.code === inheritedCode
    && row.data?.elementIndex === sourceIndex);
  if (inherited) {
    const fromElement = lastDeclared.get(spec.key);
    if (!fromElement) {
      fail(`${segment.id}.${spec.key} is marked inherited without a prior declared source.`);
    }
    return { status: 'INHERITED', value, fromElement };
  }
  lastDeclared.set(spec.key, segment.id);
  return { status: 'DECLARED', value };
}

function nodeCsv(document) {
  const headers = [
    'document_hash', 'source_id', 'source_node_id', 'x', 'y', 'z',
    'coordinate_unit', 'resolved_restraint', 'restraint_count',
    'restraints_json', 'diagnostic_codes',
  ];
  const rows = document.nodes.map((row) => [
    document.semanticHash,
    document.source.sourceId,
    row.sourceNodeId,
    row.coordinates.x,
    row.coordinates.y,
    row.coordinates.z,
    document.units.coordinates,
    row.restraintClassification,
    row.restraints.length,
    canonicalStringify(row.restraints),
    row.diagnostics.map((diagnostic) => diagnostic.code).join('|'),
  ]);
  return createCsvContent(headers, rows);
}

function elementCsv(document) {
  const headers = [
    'document_hash', 'source_id', 'source_element_id', 'source_index',
    'from_node', 'to_node', 'type',
  ];
  for (const spec of FIELD_SPECS) {
    headers.push(
      `${spec.key}_status`,
      `${spec.key}_value`,
      `${spec.key}_from_element`,
      `${spec.key}_unit`,
    );
  }
  headers.push(
    'rigid_present', 'rigid_record_json',
    'sifs_present', 'sif_count', 'sifs_json',
    'hangers_present', 'hanger_count', 'hangers_json',
    'allowable_stress_record_count', 'diagnostic_codes',
  );
  const rows = document.elements.map((row) => {
    const values = [
      document.semanticHash,
      document.source.sourceId,
      row.sourceElementId,
      row.sourceIndex,
      row.fromNode,
      row.toNode,
      row.type,
    ];
    for (const spec of FIELD_SPECS) {
      const field = row.fields[spec.key];
      values.push(
        field.status,
        Object.hasOwn(field, 'value') ? field.value : null,
        field.fromElement ?? null,
        document.units[spec.key] ?? null,
      );
    }
    values.push(
      row.childEvidence.rigid.present,
      row.childEvidence.rigid.record == null
        ? ''
        : canonicalStringify(row.childEvidence.rigid.record),
      row.childEvidence.sifs.present,
      row.childEvidence.sifs.count,
      canonicalStringify(row.childEvidence.sifs.records),
      row.childEvidence.hangers.present,
      row.childEvidence.hangers.count,
      canonicalStringify(row.childEvidence.hangers.records),
      row.childEvidence.allowableStressRecordCount,
      row.diagnostics.map((diagnostic) => diagnostic.code).join('|'),
    );
    return values;
  });
  return createCsvContent(headers, rows);
}

function fieldUnits(sourceLengthUnit) {
  return Object.freeze({
    coordinates: sourceLengthUnit,
    diameter: sourceLengthUnit,
    thickness: sourceLengthUnit,
    material: null,
    elasticModulus: 'Pa',
    poissonRatio: null,
    operatingTemperature: 'K',
    pressure: 'Pa',
    hydroPressure: 'Pa',
    fluidDensity: 'kg/m^3',
    pipeDensity: 'kg/m^3',
    insulationThickness: 'm',
    insulationDensity: 'kg/m^3',
    corrosionAllowance: 'm',
    rigidWeight: 'N',
  });
}

function geometrySemanticHash(geometry) {
  return semanticHash({
    schemaVersion: geometry.schemaVersion,
    source: geometry.source,
    unit: geometry.unit,
    nodes: geometry.nodes,
    segments: geometry.segments,
  });
}

function normalizedDiagnostics(value) {
  if (!Array.isArray(value)) fail('geometry.diagnostics must be an array.');
  return value.map((row, index) => {
    requireRecord(row, `geometry.diagnostics[${index}]`);
    return {
      severity: optionalText(row.severity),
      code: requireText(row.code, `geometry.diagnostics[${index}].code`),
      message: optionalText(row.message),
      data: isPlainRecord(row.data) ? structuredClone(row.data) : {},
    };
  });
}

function diagnosticTargetsNode(row, nodeId) {
  return String(row.data?.nodeId ?? '') === nodeId
    || String(row.data?.nodeRef ?? '') === nodeId;
}

function diagnosticTargetsElement(row, segmentId, sourceIndex) {
  return row.data?.segmentId === segmentId || row.data?.elementIndex === sourceIndex;
}

function validateResolutionRows(elements) {
  for (const element of elements) {
    requireRecord(element.fields, `${element.sourceElementId}.fields`);
    for (const spec of FIELD_SPECS) {
      const field = element.fields[spec.key];
      requireRecord(field, `${element.sourceElementId}.fields.${spec.key}`);
      if (!INPUTXML_RESOLUTION_STATUSES.includes(field.status)) {
        fail(`${element.sourceElementId}.fields.${spec.key}.status is invalid.`);
      }
      if (field.status === 'MISSING') {
        if (Object.keys(field).length !== 1) {
          fail(`${element.sourceElementId}.fields.${spec.key} MISSING rows may only contain status.`);
        }
      } else if (!Object.hasOwn(field, 'value')) {
        fail(`${element.sourceElementId}.fields.${spec.key} must carry a resolved value.`);
      }
      if (field.status === 'INHERITED' && !field.fromElement) {
        fail(`${element.sourceElementId}.fields.${spec.key} must name fromElement.`);
      }
    }
  }
}

function withoutDiagnostics(row) {
  const { diagnostics: _diagnostics, ...semantic } = row;
  return semantic;
}

function compareSegments(left, right) {
  const leftIndex = integerIndex(left.meta?.sourceIndex, left.id);
  const rightIndex = integerIndex(right.meta?.sourceIndex, right.id);
  return leftIndex - rightIndex || compareIds(left.id, right.id);
}

function compareIds(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function integerIndex(value, field) {
  if (!Number.isInteger(value) || value < 0) fail(`${field} sourceIndex must be a non-negative integer.`);
  return value;
}

function finiteCount(value) {
  if (value === undefined || value === null) return 0;
  if (!Number.isInteger(value) || value < 0) fail('allowableStressRecordCount must be a non-negative integer.');
  return value;
}

function finiteOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('Node coordinates must be finite or null.');
  return Object.is(value, -0) ? 0 : value;
}

function requireGeometry(geometry) {
  requireRecord(geometry, 'geometry');
  if (!Array.isArray(geometry.nodes) || !Array.isArray(geometry.segments)) {
    fail('InputXML resolved ground truth requires geometry nodes and segments arrays.');
  }
  requireText(geometry.schemaVersion, 'geometry.schemaVersion');
  requireText(geometry.source, 'geometry.source');
  requireText(geometry.unit, 'geometry.unit');
}

function requireRecord(value, field) {
  if (!isPlainRecord(value)) fail(`${field} must be a record.`);
  return value;
}

function requireExactKeys(value, expected, field) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    fail(`${field} keys are invalid.`);
  }
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(`${field} must be non-empty text.`);
  return value;
}

function optionalText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function requireHash(value, field) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    fail(`${field} must be a semantic hash.`);
  }
}

function fail(message) {
  const error = new TypeError(message);
  error.code = 'INPUTXML_RESOLVED_GROUND_TRUTH_INVALID';
  throw error;
}
