import { parseInputXmlSourceBundle } from './inputXmlToCanonicalGeometry.js';
import { auditInputXmlSourceBundle } from './inputxml-source-bundle-audit.js';
import { DEFAULT_RESTRAINT_TYPE_CODE_MAP, restraintTypeCodeLabel } from './inputxml-restraint-type-mutation.js';

export const INPUTXML_LOAD_DIAGNOSTICS_SCHEMA = 'fea-inputxml-load-diagnostics/v1';

const AXES = Object.freeze(['xCosine', 'yCosine', 'zCosine']);
const AXIS_LABELS = Object.freeze({ xCosine: 'X', yCosine: 'Y', zCosine: 'Z' });

/**
 * Single entry point for "a file was just loaded" diagnostics on any real
 * CAESAR InputXML. Geometry, source custody and ingestion audit all consume
 * one parsed source bundle; no second raw-XML interpretation path is used.
 */
export function diagnoseInputXmlLoad(xmlText, options = {}) {
  if (typeof xmlText !== 'string' || xmlText.trim().length === 0) {
    throw new TypeError('diagnoseInputXmlLoad requires non-empty InputXML text.');
  }
  const restraintTypeCodeMap = {
    ...DEFAULT_RESTRAINT_TYPE_CODE_MAP,
    ...(options.restraintTypeCodeMap ?? {}),
  };
  const sourceBundle = parseInputXmlSourceBundle(xmlText, {
    unit: options.unit,
    source: options.source ?? 'inputxml-load',
    fileName: options.fileName ?? null,
    componentOrigins: options.componentOrigins ?? {},
    restraintTypeCodeMap,
    bendRadiusTolerance: options.bendRadiusTolerance ?? 1e-6,
  });
  const geometry = sourceBundle.geometry;
  const audit = auditInputXmlSourceBundle(sourceBundle);
  const restraints = audit.restraintRecords.map((row) => enrichRestraintRow(row, geometry));
  const unresolvedRestraints = restraints.filter((row) => row.classification === 'UNKNOWN');
  const unresolvedSifs = audit.sifRecords.filter((row) => row.classification === 'UNKNOWN');
  const errorDiagnostics = audit.diagnostics.filter((row) => row.severity === 'error');
  const warnDiagnostics = audit.diagnostics.filter((row) => row.severity === 'warn');

  return Object.freeze({
    schema: INPUTXML_LOAD_DIAGNOSTICS_SCHEMA,
    valid: audit.valid,
    fileName: options.fileName ?? null,
    sourceSemanticHash: sourceBundle.source.sourceSemanticHash,
    unitSystem: Object.freeze({
      declared: geometry.summary.inputXmlUnitsDeclared,
      lengthUnit: geometry.summary.inputXmlLengthUnit,
    }),
    topology: Object.freeze({
      elements: audit.actual.elements,
      nodes: audit.actual.nodes,
      bends: audit.actual.bends,
      rigids: audit.actual.rigids,
      teeNodes: audit.actual.teeNodes,
      restraints: restraints.length,
      declaredElements: audit.declared.elements,
      declaredBends: audit.declared.bends,
      declaredRigids: audit.declared.rigids,
      declaredRestraints: audit.declared.restraints,
    }),
    restraints: Object.freeze(restraints),
    restraintTypeCodeMap,
    rigidElements: audit.rigidElements,
    bendElements: audit.bendElements,
    teeNodes: audit.teeNodes,
    sifRecords: audit.sifRecords,
    criticalFindings: Object.freeze({
      unresolvedRestraintCount: unresolvedRestraints.length,
      unresolvedRestraints: Object.freeze(unresolvedRestraints),
      unresolvedSifCount: unresolvedSifs.length,
      headerCountMismatchCount: errorDiagnostics.filter((row) => row.code === 'INPUTXML_HEADER_COUNT_MISMATCH').length,
    }),
    diagnostics: audit.diagnostics,
    errorCount: errorDiagnostics.length,
    warnCount: warnDiagnostics.length,
    sourceBundle,
    geometry,
  });
}

function enrichRestraintRow(row, geometry) {
  const node = geometry.nodes.find((candidate) => candidate.id === row.nodeId);
  const source = (node?.meta?.restraints ?? []).find(
    (candidate) => candidate.sourceTypeCode === row.sourceTypeCode && candidate.typeCode === row.typeCode,
  ) ?? null;
  const label = restraintTypeCodeLabel(row.typeCode);
  const dominantAxis = source ? dominantCosineAxis(source) : null;
  return Object.freeze({
    ...row,
    label,
    dominantAxis,
    xCosine: source?.xCosine ?? null,
    yCosine: source?.yCosine ?? null,
    zCosine: source?.zCosine ?? null,
  });
}

function dominantCosineAxis(source) {
  let bestAxis = null;
  let bestMagnitude = 0;
  for (const axis of AXES) {
    const value = source[axis];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const magnitude = Math.abs(value);
    if (magnitude > bestMagnitude) {
      bestMagnitude = magnitude;
      bestAxis = axis;
    }
  }
  return bestAxis && bestMagnitude > 0 ? AXIS_LABELS[bestAxis] : null;
}
