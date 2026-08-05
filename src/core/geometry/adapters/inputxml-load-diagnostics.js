import { inputXmlToCanonicalGeometry } from './inputXmlToCanonicalGeometry.js';
import { auditInputXmlIngestion } from './inputxml-ingestion-audit.js';
import { DEFAULT_RESTRAINT_TYPE_CODE_MAP, restraintTypeCodeLabel } from './inputxml-restraint-type-mutation.js';

export const INPUTXML_LOAD_DIAGNOSTICS_SCHEMA = 'fea-inputxml-load-diagnostics/v1';

const AXES = Object.freeze(['xCosine', 'yCosine', 'zCosine']);
const AXIS_LABELS = Object.freeze({ xCosine: 'X', yCosine: 'Y', zCosine: 'Z' });

/**
 * Single entry point for "a file was just loaded" diagnostics on any real
 * CAESAR InputXML — not tied to BM1/BM2/BM3 or any other specific fixture.
 *
 * Runs geometry ingestion with the project's canonical restraint-type
 * defaults (DEFAULT_RESTRAINT_TYPE_CODE_MAP), then the generic ingestion
 * audit, then enriches every restraint record with a human-readable label
 * and dominant direction (derived from its own direction cosines, never
 * guessed) so a UI can render the restraint table directly without any
 * caller having to re-derive restraint semantics.
 *
 * This never throws for engineering-content problems (unknown restraint
 * type, header/actual count mismatch, unresolved SIF, etc.) — those come
 * back as diagnostics with `valid: false` when any are fatal. It only
 * throws for structurally invalid input (not a string, not parseable at
 * all) or a genuinely missing unit system the caller must supply.
 */
export function diagnoseInputXmlLoad(xmlText, options = {}) {
  if (typeof xmlText !== 'string' || xmlText.trim().length === 0) {
    throw new TypeError('diagnoseInputXmlLoad requires non-empty InputXML text.');
  }
  const restraintTypeCodeMap = {
    ...DEFAULT_RESTRAINT_TYPE_CODE_MAP,
    ...(options.restraintTypeCodeMap ?? {}),
  };
  const geometry = inputXmlToCanonicalGeometry(xmlText, {
    unit: options.unit,
    source: options.source ?? 'inputxml-load',
    fileName: options.fileName ?? null,
    componentOrigins: options.componentOrigins ?? {},
    restraintTypeCodeMap,
    bendRadiusTolerance: options.bendRadiusTolerance ?? 1e-6,
  });
  const audit = auditInputXmlIngestion(xmlText, geometry);
  const restraints = audit.restraintRecords.map((row) => enrichRestraintRow(row, geometry));
  const unresolvedRestraints = restraints.filter((row) => row.classification === 'UNKNOWN');
  const unresolvedSifs = audit.sifRecords.filter((row) => row.classification === 'UNKNOWN');
  const errorDiagnostics = audit.diagnostics.filter((row) => row.severity === 'error');
  const warnDiagnostics = audit.diagnostics.filter((row) => row.severity === 'warn');

  return Object.freeze({
    schema: INPUTXML_LOAD_DIAGNOSTICS_SCHEMA,
    valid: audit.valid,
    fileName: options.fileName ?? null,
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
