import { attributeValue, findAnyElements, findElements, firstElement } from './inputxml-tag-scanner.js';

export const INPUTXML_INGESTION_AUDIT_SCHEMA = 'fea-inputxml-ingestion-audit/v1';
export const CAESAR_UNSET_SENTINEL = -1.0101;

const SENTINEL_TOLERANCE = 0.001;
const RIGID_TAGS = ['RIGID', 'RIGIDS'];
const BEND_TAGS = ['BEND', 'BENDS', 'ELBOW', 'ELBOWS'];
const SIF_TAGS = ['SIF', 'SIFS'];
const KNOWN_SIF_TYPES = Object.freeze({
  3: 'WELDING_TEE',
  5: 'WELDOLET',
});

const KNOWN_PIPING_ELEMENT_ATTRIBUTES = new Set([
  'FROM_NODE', 'TO_NODE', 'DELTA_X', 'DELTA_Y', 'DELTA_Z',
  'DIAMETER', 'BORE', 'NOMINAL_DIAMETER', 'WALL_THICK', 'THICKNESS',
  'INSUL_THICK', 'CORR_ALLOW', 'HYDRO_PRESSURE', 'MODULUS', 'POISSONS',
  'PIPE_DENSITY', 'PDENSITY', 'INSUL_DENSITY', 'IDENSITY',
  'FLUID_DENSITY', 'FDENSITY', 'REFRACTORY_DENSITY', 'REFRACTORY_THK',
  'CLADDING_DEN', 'CLADDING_THK', 'INSUL_CLAD_UNIT_WEIGHT',
  'MATERIAL_NUM', 'MATERIAL_NAME', 'MILL_TOL_PLUS', 'MILL_TOL_MINUS',
  'SEAM_WELD', 'NAME',
]);

function numeric(value) {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function nodeId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? String(parsed) : raw;
}

function isSentinel(value) {
  return value != null && Math.abs(value - CAESAR_UNSET_SENTINEL) < SENTINEL_TOLERANCE;
}

function classifyRigidType(value) {
  const type = String(value ?? '').trim();
  const upper = type.toUpperCase();
  if (upper.includes('VALVE')) return 'VALVE';
  if (upper.includes('FLANGE')) return 'FLANGE_PAIR';
  if (!upper || upper === 'UNSPECIFIED') return 'UNSPECIFIED';
  return 'UNKNOWN';
}

function isKnownElementAttribute(name) {
  if (KNOWN_PIPING_ELEMENT_ATTRIBUTES.has(name)) return true;
  if (/^TEMP_EXP_C[1-9]$/u.test(name)) return true;
  if (/^PRESSURE[1-9]$/u.test(name)) return true;
  if (/^HOT_MOD[1-9]$/u.test(name)) return true;
  return false;
}

function parseDeclaredCounts(xmlText) {
  const model = firstElement(xmlText, ['PIPINGMODEL']);
  const attrs = model?.attributes ?? {};
  return Object.freeze({
    elements: numeric(attributeValue(attrs, 'NUMELT')),
    bends: numeric(attributeValue(attrs, 'NUMBEND')),
    rigids: numeric(attributeValue(attrs, 'NUMRIGID')),
    restraints: numeric(attributeValue(attrs, 'NUMREST')),
  });
}

function sharedNodeTopology(geometry) {
  const incident = new Map();
  for (const segment of geometry.segments ?? []) {
    for (const id of [segment.startNodeId, segment.endNodeId]) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id).push(segment.id);
    }
  }
  return [...incident.entries()]
    .filter(([, segmentIds]) => segmentIds.length >= 3)
    .map(([id, segmentIds]) => Object.freeze({ nodeId: id, incidentSegmentIds: [...segmentIds].sort() }))
    .sort((a, b) => Number(a.nodeId) - Number(b.nodeId));
}

function auditRestraints(geometry, diagnostics) {
  const rows = [];
  for (const node of geometry.nodes ?? []) {
    for (const restraint of node.meta?.restraints ?? []) {
      const classification = node.restraint === 'UNKNOWN' ? 'UNKNOWN' : node.restraint;
      const row = Object.freeze({
        nodeId: node.id,
        sourceTypeCode: restraint.sourceTypeCode,
        typeCode: restraint.typeCode,
        mutationApplied: Boolean(restraint.mutationApplied),
        classification,
      });
      rows.push(row);
      if (classification === 'UNKNOWN') {
        diagnostics.push(Object.freeze({
          severity: 'warn',
          code: 'INPUTXML_RESTRAINT_TYPE_UNKNOWN',
          message: `Restraint TYPE ${row.typeCode ?? row.sourceTypeCode ?? 'unset'} at node ${node.id} remains UNKNOWN after configured mutation and classification.`,
          data: row,
        }));
      }
    }
  }
  return rows.sort((a, b) => Number(a.nodeId) - Number(b.nodeId));
}

export function auditInputXmlIngestion(xmlText, geometry) {
  if (typeof xmlText !== 'string') throw new TypeError('auditInputXmlIngestion requires InputXML text.');
  if (!geometry || !Array.isArray(geometry.nodes) || !Array.isArray(geometry.segments)) {
    throw new TypeError('auditInputXmlIngestion requires canonical geometry output.');
  }

  const diagnostics = (geometry.diagnostics ?? []).map((row) => Object.freeze({ ...row, source: 'CANONICAL_GEOMETRY' }));
  const declared = parseDeclaredCounts(xmlText);
  const elementTags = findElements(xmlText, 'PIPINGELEMENT');
  const rigidElements = [];
  const bendElements = [];
  const sifRecords = [];
  const unrecognizedElementAttributes = [];

  elementTags.forEach((elementTag, index) => {
    const segment = geometry.segments.find((candidate) => candidate.meta?.sourceIndex === index)
      ?? geometry.segments[index]
      ?? null;
    const fromNode = nodeId(attributeValue(elementTag.attributes, 'FROM_NODE', 'FROMNODE', 'FROM'));
    const toNode = nodeId(attributeValue(elementTag.attributes, 'TO_NODE', 'TONODE', 'TO'));

    for (const name of Object.keys(elementTag.attributes)) {
      if (isKnownElementAttribute(name)) continue;
      const row = Object.freeze({ elementIndex: index, segmentId: segment?.id ?? null, attribute: name });
      unrecognizedElementAttributes.push(row);
      diagnostics.push(Object.freeze({
        severity: 'warn',
        code: 'INPUTXML_ELEMENT_ATTRIBUTE_UNKNOWN',
        message: `PIPINGELEMENT ${index + 1} attribute ${name} is not in the governed ingestion audit registry.`,
        data: row,
      }));
    }

    const bend = firstElement(elementTag.inner, BEND_TAGS);
    if (bend) {
      bendElements.push(Object.freeze({
        elementIndex: index,
        segmentId: segment?.id ?? null,
        fromNode,
        toNode,
        declaredRadius: numeric(attributeValue(bend.attributes, 'RADIUS')),
      }));
    }

    const rigid = firstElement(elementTag.inner, RIGID_TAGS);
    if (rigid) {
      const rawWeight = numeric(attributeValue(rigid.attributes, 'WEIGHT'));
      const sentinelNormalized = isSentinel(rawWeight);
      const parsedWeight = segment?.meta?.analysis?.rigid?.weight;
      const enteredWeight = sentinelNormalized ? 0 : parsedWeight;
      const row = Object.freeze({
        elementIndex: index,
        segmentId: segment?.id ?? null,
        fromNode,
        toNode,
        rawType: attributeValue(rigid.attributes, 'TYPE', 'RIGID_TYPE') || null,
        classification: classifyRigidType(attributeValue(rigid.attributes, 'TYPE', 'RIGID_TYPE')),
        rawWeight,
        enteredWeight,
        weightAuthority: sentinelNormalized ? 'CAESAR_UNSET_SENTINEL_ZERO' : 'DECLARED_INPUTXML_WEIGHT',
        sentinelNormalized,
      });
      rigidElements.push(row);
      if (sentinelNormalized) {
        diagnostics.push(Object.freeze({
          severity: 'info',
          code: 'INPUTXML_RIGID_WEIGHT_SENTINEL_NORMALIZED',
          message: `Rigid element ${fromNode}-${toNode} declares CAESAR unset sentinel ${rawWeight}; entered rigid weight is explicitly normalized to zero.`,
          data: row,
        }));
      }
      if (!sentinelNormalized && !Number.isFinite(enteredWeight)) {
        diagnostics.push(Object.freeze({
          severity: 'error',
          code: 'INPUTXML_RIGID_WEIGHT_UNRESOLVED',
          message: `Rigid element ${fromNode}-${toNode} has no finite entered-weight authority.`,
          data: row,
        }));
      }
    }

    for (const sif of findAnyElements(elementTag.inner, SIF_TAGS)) {
      const activeNodeId = nodeId(attributeValue(sif.attributes, 'NODE'));
      if (!activeNodeId) continue;
      const typeCode = numeric(attributeValue(sif.attributes, 'TYPE'));
      const knownType = typeCode == null ? null : KNOWN_SIF_TYPES[Math.round(typeCode)] ?? null;
      const row = Object.freeze({
        elementIndex: index,
        segmentId: segment?.id ?? null,
        nodeId: activeNodeId,
        typeCode,
        classification: knownType ?? 'UNKNOWN',
      });
      sifRecords.push(row);
      if (!knownType) {
        diagnostics.push(Object.freeze({
          severity: 'warn',
          code: 'INPUTXML_SIF_TYPE_UNKNOWN',
          message: `SIF TYPE ${typeCode ?? 'unset'} at node ${activeNodeId} is retained as UNKNOWN and is not guessed or applied.`,
          data: row,
        }));
      }
    }
  });

  const teeNodes = sharedNodeTopology(geometry);
  for (const tee of teeNodes) {
    diagnostics.push(Object.freeze({
      severity: 'info',
      code: 'INPUTXML_SHARED_NODE_BRANCH_CONFIRMED',
      message: `Node ${tee.nodeId} is a shared-node branch with ${tee.incidentSegmentIds.length} incident independently listed elements.`,
      data: tee,
    }));
  }

  const actual = Object.freeze({
    elements: elementTags.length,
    nodes: geometry.nodes.length,
    bends: bendElements.length,
    rigids: rigidElements.length,
    teeNodes: teeNodes.length,
  });
  for (const [field, declaredValue] of Object.entries({
    elements: declared.elements,
    bends: declared.bends,
    rigids: declared.rigids,
  })) {
    if (declaredValue != null && actual[field] !== declaredValue) {
      diagnostics.push(Object.freeze({
        severity: 'error',
        code: 'INPUTXML_HEADER_COUNT_MISMATCH',
        message: `InputXML header declares ${field}=${declaredValue}, but ingestion audit found ${actual[field]}.`,
        data: Object.freeze({ field, declared: declaredValue, actual: actual[field] }),
      }));
    }
  }

  const restraintRecords = auditRestraints(geometry, diagnostics);
  const fatalDiagnostics = diagnostics.filter((row) => String(row.severity).toLowerCase() === 'error');

  return Object.freeze({
    schema: INPUTXML_INGESTION_AUDIT_SCHEMA,
    source: geometry.source ?? 'inputxml',
    valid: geometry.valid === true && fatalDiagnostics.length === 0,
    declared,
    actual,
    bendElements: Object.freeze(bendElements),
    rigidElements: Object.freeze(rigidElements),
    teeNodes: Object.freeze(teeNodes),
    sifRecords: Object.freeze(sifRecords),
    restraintRecords: Object.freeze(restraintRecords),
    unrecognizedElementAttributes: Object.freeze(unrecognizedElementAttributes),
    diagnostics: Object.freeze(diagnostics),
    fatalDiagnosticCount: fatalDiagnostics.length,
    silentDropCount: 0,
  });
}
