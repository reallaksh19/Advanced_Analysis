import {
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE as STRICT,
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE,
} from './inputxml-model-health-profile.js';
import {
  createInputXmlModelHealthFinding as finding,
  inputXmlCapabilityEffect as effect,
  normalizeInputXmlSeverity,
} from './inputxml-model-health-finding.js';

export function buildInputXmlRepresentabilityFindings({ sourceBundle, topology, inventory }) {
  return Object.freeze([
    ...sourceFindings(sourceBundle),
    ...topologyFindings(topology),
    ...inventoryFindings(inventory),
    ...codeInputFindings(sourceBundle),
  ]);
}

function sourceFindings(sourceBundle) {
  const rows = [];
  const diagnostics = [
    ...(sourceBundle.diagnostics ?? []),
    ...(sourceBundle.geometry?.diagnostics ?? []),
  ];
  diagnostics.forEach((diagnostic, index) => {
    const severity = normalizeInputXmlSeverity(diagnostic.severity);
    if (severity === 'info') return;
    rows.push(finding({
      code: diagnostic.code || 'MODEL_SOURCE_DIAGNOSTIC',
      category: 'SOURCE',
      severity,
      message: diagnostic.message || 'InputXML source diagnostic.',
      entities: diagnosticEntities(diagnostic),
      evidence: { diagnostic, occurrenceIndex: index },
      authority: 'INPUTXML_SOURCE_BUNDLE',
      remediation: 'Correct the source declaration and parse the model again.',
      capabilityEffects: {
        SOURCE_ACCEPTANCE: effect(
          severity === 'error' ? 'BLOCK' : 'CONDITIONAL',
          diagnostic.code || 'MODEL_SOURCE_DIAGNOSTIC',
        ),
      },
    }));
  });
  const actual = {
    elements: sourceBundle.elementRecords.length,
    bends: sourceBundle.sourceRecords.bends.length,
    rigids: sourceBundle.sourceRecords.rigids.length,
    restraints: sourceBundle.sourceRecords.restraints.length,
  };
  for (const [kind, actualCount] of Object.entries(actual)) {
    const declared = sourceBundle.source.declaredCounts[kind];
    if (declared === null || declared === actualCount) continue;
    rows.push(finding({
      code: 'INPUTXML_HEADER_COUNT_MISMATCH',
      category: 'SOURCE',
      severity: 'error',
      message: `InputXML declares ${declared} ${kind} but the retained source bundle contains ${actualCount}.`,
      entities: {},
      evidence: { kind, declared, actual: actualCount },
      authority: 'INPUTXML_SOURCE_BUNDLE',
      remediation: 'Regenerate or correct the InputXML header counts before analysis.',
      capabilityEffects: { SOURCE_ACCEPTANCE: effect('BLOCK', 'INPUTXML_HEADER_COUNT_MISMATCH') },
    }));
  }
  return rows;
}

function topologyFindings(topology) {
  return topology.findings.map((row, index) => {
    const blocked = Array.isArray(row.blocks) && row.blocks.length > 0;
    return finding({
      code: row.code,
      category: 'TOPOLOGY',
      severity: row.severity,
      message: row.message,
      entities: row.entities,
      evidence: { topologyFinding: row, occurrenceIndex: index },
      authority: topology.schema,
      remediation: row.remediation,
      capabilityEffects: {
        TOPOLOGY_ACCEPTANCE: effect(blocked ? 'BLOCK' : 'CONDITIONAL', row.code),
      },
    });
  });
}

function inventoryFindings(inventory) {
  const rows = [];
  for (const item of inventory) {
    if (!item.active) continue;
    const strict = item.dispositionByProfile[STRICT];
    const approximate = item.dispositionByProfile[APPROXIMATE];
    const effects = {};
    addProfileEffect(effects, 'STRICT_LINEAR_STATIC', strict);
    addProfileEffect(effects, 'APPROXIMATE_LINEAR_STATIC', approximate);
    const codeOnly = strict.disposition === 'CODE_ONLY' && approximate.disposition === 'CODE_ONLY';
    if (Object.keys(effects).length === 0 && !codeOnly) continue;
    const block = Object.values(effects).some((row) => row.disposition === 'BLOCK');
    const conditional = Object.values(effects).some((row) => row.disposition === 'CONDITIONAL');
    const code = strict.limitationCode || approximate.limitationCode || 'MODEL_CODE_ONLY_FEATURE_RETAINED';
    rows.push(finding({
      code,
      category: item.sourceKind === 'RESTRAINT' ? 'RESTRAINT' : 'REPRESENTABILITY',
      severity: block ? 'error' : conditional ? 'warning' : 'info',
      message: `${item.sourceKind} ${item.inventoryId} is ${strict.disposition} for ${STRICT} and ${approximate.disposition} for ${APPROXIMATE}.`,
      entities: {
        nodeIds: item.targetIds.nodeIds,
        segmentIds: item.targetIds.segmentIds,
        sourceFeatureIds: item.sourceFeatureId ? [item.sourceFeatureId] : [],
        sourceElementIndices: [item.sourceElementIndex],
      },
      evidence: {
        inventoryId: item.inventoryId,
        sourceRecordSemanticHash: item.sourceRecordSemanticHash,
        classification: item.classification,
        dispositionByProfile: item.dispositionByProfile,
      },
      authority: 'GENERIC_INPUTXML_REPRESENTABILITY_V1',
      remediation: codeOnly
        ? 'Retain this input for later code-stress evaluation; it does not alter structural stiffness in this profile.'
        : `Implement exact mechanics or select only a profile whose declared disposition is acceptable; source feature ${item.inventoryId} is not silently omitted.`,
      capabilityEffects: effects,
    }));
  }
  return rows;
}

function codeInputFindings(sourceBundle) {
  return sourceBundle.sourceRecords.sifs
    .filter((row) => ![3, 5].includes(row.typeCode))
    .map((row) => finding({
      code: 'MODEL_SIF_TYPE_UNSUPPORTED',
      category: 'CODE_INPUT',
      severity: 'error',
      message: `SIF ${row.sourceFeatureId} has unsupported type ${row.typeCode}.`,
      entities: { sourceFeatureIds: [row.sourceFeatureId], nodeIds: row.nodeId ? [row.nodeId] : [] },
      evidence: { typeCode: row.typeCode, sourcePath: row.sourcePath },
      authority: 'INPUTXML_SOURCE_BUNDLE',
      remediation: 'Map the SIF type through a qualified code-input authority.',
      capabilityEffects: { CODE_STRESS_INPUT_READINESS: effect('BLOCK', 'MODEL_SIF_TYPE_UNSUPPORTED') },
    }));
}

function addProfileEffect(effects, capabilityId, disposition) {
  if (disposition.disposition === 'IMPLEMENTED_WITH_DECLARED_APPROXIMATION') {
    effects[capabilityId] = effect('CONDITIONAL', disposition.limitationCode);
  } else if (['UNSUPPORTED_BY_GENERIC_SOLVER', 'NONLINEAR_OUT_OF_SCOPE', 'INVALID_SOURCE_DATA'].includes(disposition.disposition)) {
    effects[capabilityId] = effect('BLOCK', disposition.limitationCode);
  }
}

function diagnosticEntities(diagnostic) {
  const data = diagnostic.data ?? {};
  return {
    nodeIds: data.nodeId ? [data.nodeId] : data.nodeIds ?? [],
    segmentIds: data.segmentId ? [data.segmentId] : data.segmentIds ?? [],
    sourceElementIndices: data.elementIndex !== undefined ? [data.elementIndex] : [],
  };
}
