import { INPUTXML_KNOWN_SIF_TYPES } from './inputxml-feature-registry.js';
import { requireInputXmlSourceBundle } from './inputxml-source-bundle-contract.js';

const INPUTXML_INGESTION_AUDIT_SCHEMA = 'fea-inputxml-ingestion-audit/v1';

export function auditInputXmlSourceBundle(bundleValue) {
  const bundle = requireInputXmlSourceBundle(bundleValue);
  const geometry = bundle.geometry;
  const diagnostics = [
    ...(geometry.diagnostics ?? []).map(
      (row) => Object.freeze({ ...row, source: 'CANONICAL_GEOMETRY' }),
    ),
    ...(bundle.diagnostics ?? []).map(
      (row) => Object.freeze({ ...row, source: 'INPUTXML_SOURCE_BUNDLE' }),
    ),
  ];
  const declared = Object.freeze({ ...bundle.source.declaredCounts });
  const bendElements = bundle.sourceRecords.bends.map((row) => Object.freeze({
    elementIndex: row.sourceElementIndex,
    segmentId: row.segmentId,
    fromNode: elementRecord(bundle, row.sourceElementIndex)?.fromNodeId ?? null,
    toNode: elementRecord(bundle, row.sourceElementIndex)?.toNodeId ?? null,
    declaredRadius: row.radius?.parsedValue ?? null,
  }));
  const rigidElements = bundle.sourceRecords.rigids.map((row) => {
    const element = elementRecord(bundle, row.sourceElementIndex);
    const sentinelNormalized = row.weight?.sentinel?.kind === 'UNSET';
    const enteredWeight = sentinelNormalized ? 0 : row.weight?.canonicalValue ?? null;
    const record = Object.freeze({
      elementIndex: row.sourceElementIndex,
      segmentId: row.segmentId,
      fromNode: element?.fromNodeId ?? null,
      toNode: element?.toNodeId ?? null,
      rawType: row.rawType,
      classification: classifyRigidType(row.rawType),
      rawWeight: row.weight?.parsedValue ?? null,
      enteredWeight,
      weightAuthority: sentinelNormalized ? 'CAESAR_UNSET_SENTINEL_ZERO' : 'DECLARED_INPUTXML_WEIGHT',
      sentinelNormalized,
      sourceFeatureId: row.sourceFeatureId,
    });
    if (sentinelNormalized) {
      diagnostics.push(Object.freeze({
        severity: 'info',
        code: 'INPUTXML_RIGID_WEIGHT_SENTINEL_NORMALIZED',
        message: `Rigid element ${record.fromNode}-${record.toNode} declares the CAESAR unset sentinel; entered rigid weight is explicitly normalized to zero.`,
        data: record,
      }));
    }
    if (!sentinelNormalized && !Number.isFinite(enteredWeight)) {
      diagnostics.push(Object.freeze({
        severity: 'error',
        code: 'INPUTXML_RIGID_WEIGHT_UNRESOLVED',
        message: `Rigid element ${record.fromNode}-${record.toNode} has no finite entered-weight authority.`,
        data: record,
      }));
    }
    return record;
  });
  const sifRecords = bundle.sourceRecords.sifs
    .filter((row) => row.nodeId)
    .map((row) => {
      const knownType = row.typeCode == null
        ? null
        : INPUTXML_KNOWN_SIF_TYPES[Math.round(row.typeCode)] ?? null;
      const record = Object.freeze({
        elementIndex: row.sourceElementIndex,
        segmentId: row.segmentId,
        nodeId: row.nodeId,
        typeCode: row.typeCode,
        classification: knownType ?? 'UNKNOWN',
        sourceFeatureId: row.sourceFeatureId,
      });
      if (!knownType) {
        diagnostics.push(Object.freeze({
          severity: 'warn',
          code: 'INPUTXML_SIF_TYPE_UNKNOWN',
          message: `SIF TYPE ${row.typeCode ?? 'unset'} at node ${row.nodeId} is retained as UNKNOWN and is not guessed or applied.`,
          data: record,
        }));
      }
      return record;
    });
  const unrecognizedElementAttributes = [];
  for (const element of bundle.elementRecords) {
    for (const attribute of element.unrecognizedAttributeNames ?? []) {
      const record = Object.freeze({
        elementIndex: element.sourceElementIndex,
        segmentId: element.segmentId,
        attribute,
      });
      unrecognizedElementAttributes.push(record);
      diagnostics.push(Object.freeze({
        severity: 'warn',
        code: 'INPUTXML_ELEMENT_ATTRIBUTE_UNKNOWN',
        message: `PIPINGELEMENT ${element.sourceElementNumber} attribute ${attribute} is not in the governed ingestion registry.`,
        data: record,
      }));
    }
  }
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
    elements: bundle.elementRecords.length,
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
  const fatalDiagnostics = diagnostics.filter(
    (row) => String(row.severity).toLowerCase() === 'error',
  );
  return Object.freeze({
    schema: INPUTXML_INGESTION_AUDIT_SCHEMA,
    source: geometry.source ?? 'inputxml',
    sourceSemanticHash: bundle.source.sourceSemanticHash,
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

function elementRecord(bundle, sourceElementIndex) {
  return bundle.elementRecords.find((row) => row.sourceElementIndex === sourceElementIndex) ?? null;
}

function classifyRigidType(value) {
  const upper = String(value ?? '').trim().toUpperCase();
  if (upper.includes('VALVE')) return 'VALVE';
  if (upper.includes('FLANGE')) return 'FLANGE_PAIR';
  if (!upper || upper === 'UNSPECIFIED') return 'UNSPECIFIED';
  return 'UNKNOWN';
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
    .map(([id, segmentIds]) => Object.freeze({
      nodeId: id,
      incidentSegmentIds: [...segmentIds].sort(compareAscii),
    }))
    .sort((left, right) => compareNodeId(left.nodeId, right.nodeId));
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
  return rows.sort((left, right) => compareNodeId(left.nodeId, right.nodeId));
}

function compareNodeId(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber < rightNumber ? -1 : 1;
  }
  return compareAscii(left, right);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}
