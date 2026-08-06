import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  diagnoseInputXmlTopologyGraph,
  diagnoseInputXmlTopologyProximity,
  requireInputXmlModelHealthSource,
  requireTopologyGraphDiagnostics,
  requireTopologyProximityDiagnostics,
} from '../geometry/model-health/index.js';
import { buildInputXmlFeatureInventory } from './inputxml-feature-inventory.js';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  INPUTXML_MODEL_HEALTH_CAPABILITIES,
  INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
} from './inputxml-model-health-profile.js';
import {
  INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA,
  sealInputXmlLinearModelHealth,
} from './inputxml-linear-model-health-contract.js';

const EFFECT_RANK = Object.freeze({ PASS: 0, CONDITIONAL: 1, BLOCK: 2 });

export function diagnoseInputXmlLinearModelHealth(sourceBundle, options = {}) {
  const accepted = requireInputXmlModelHealthSource(sourceBundle);
  const graph = requireTopologyGraphDiagnostics(
    options.graphReport ?? diagnoseInputXmlTopologyGraph(accepted, options.graph ?? {}),
    accepted,
  );
  const proximity = requireTopologyProximityDiagnostics(
    options.proximityReport ?? diagnoseInputXmlTopologyProximity(accepted, options.proximity ?? {}),
    accepted,
  );
  const inventory = buildInputXmlFeatureInventory(accepted);
  const findings = [
    ...sourceIntegrityFindings(accepted),
    ...topologyFindings(graph, 'TOPOLOGY_GRAPH'),
    ...topologyFindings(proximity, 'TOPOLOGY_PROXIMITY'),
    ...inventoryFindings(inventory),
    ...duplicateRestraintFindings(inventory),
    ...deferredPreparationFindings(inventory),
  ].sort(compareFinding);
  requireUniqueFindingIds(findings);
  const capabilities = foldCapabilities(findings);
  const capabilityStatusById = Object.freeze(Object.fromEntries(
    capabilities.map((row) => [row.capabilityId, row.status]),
  ));
  const sourceSemanticHash = computeInputXmlModelHealthSourceSemanticHash(accepted);
  const sourceEvidenceHash = computeInputXmlModelHealthSourceEvidenceHash(accepted);

  return sealInputXmlLinearModelHealth({
    schema: INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA,
    profileIds: Object.freeze([
      STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
      DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
    ]),
    sourceBundleSemanticHash: sourceSemanticHash,
    sourceBundleEvidenceHash: sourceEvidenceHash,
    topologyGraphSemanticHash: graph.semanticHash,
    topologyGraphEvidenceHash: graph.evidenceHash,
    topologyProximitySemanticHash: proximity.semanticHash,
    topologyProximityEvidenceHash: proximity.evidenceHash,
    capabilityDependencies: INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES,
    capabilities,
    inventory,
    findings,
    summary: Object.freeze({
      inventoryCount: inventory.length,
      activeInventoryCount: inventory.filter((row) => row.active).length,
      findingCount: findings.length,
      errorFindingCount: findings.filter((row) => row.severity === 'error').length,
      warningFindingCount: findings.filter((row) => row.severity === 'warning').length,
      infoFindingCount: findings.filter((row) => row.severity === 'info').length,
      capabilityStatusById,
      sourceKindCounts: Object.freeze(countBy(inventory, 'sourceKind')),
    }),
    executionAvailability: Object.freeze({
      strictProfilePreparationAvailable: false,
      approximateProfilePreparationAvailable: false,
      strictSolveAuthorized: false,
      approximateSolveAuthorized: false,
      legacyRawTextSolveGovernedByReport: false,
      reasonCodes: Object.freeze([
        'PROFILE_SPECIFIC_PREPARATION_NOT_IMPLEMENTED',
        'LEGACY_RAW_TEXT_SOLVE_NOT_MODEL_HEALTH_GOVERNED',
      ]),
    }),
  });
}

function sourceIntegrityFindings(sourceBundle) {
  const unique = new Map();
  for (const diagnostic of [
    ...(sourceBundle.diagnostics ?? []),
    ...(sourceBundle.geometry?.diagnostics ?? []),
  ]) {
    if (String(diagnostic?.severity ?? '').toLowerCase() !== 'error') continue;
    unique.set(semanticHash(diagnostic), diagnostic);
  }
  const grouped = new Map();
  for (const diagnostic of unique.values()) {
    const code = diagnostic.code || 'INPUTXML_SOURCE_ERROR';
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push(diagnostic);
  }
  const rows = [];
  for (const [code, diagnostics] of [...grouped.entries()].sort(([left], [right]) => compareAscii(left, right))) {
    const occurrences = diagnostics
      .map((row) => structuredClone(row))
      .sort((left, right) => compareAscii(semanticHash(left), semanticHash(right)));
    rows.push(finding({
      code,
      category: 'SOURCE',
      severity: 'error',
      occurrenceKey: `SOURCE_ERROR:${code}`,
      message: `${occurrences.length} InputXML source diagnostic occurrence(s) report ${code}.`,
      entities: aggregateDiagnosticEntities(occurrences),
      evidence: { occurrences },
      authority: sourceBundle.schema,
      remediation: 'Correct the source declaration and parse the model again.',
      capabilityEffects: {
        SOURCE_ACCEPTANCE: effect('BLOCK', code),
      },
    }));
  }
  if (sourceBundle.geometry?.valid !== true && rows.length === 0) {
    rows.push(finding({
      code: 'INPUTXML_SOURCE_GEOMETRY_INVALID',
      category: 'SOURCE',
      severity: 'error',
      occurrenceKey: 'SOURCE_GEOMETRY_INVALID',
      message: 'The retained InputXML source bundle does not contain valid canonical geometry.',
      evidence: { geometryValid: sourceBundle.geometry?.valid ?? null },
      authority: sourceBundle.schema,
      remediation: 'Resolve source and canonical geometry errors before analysis.',
      capabilityEffects: {
        SOURCE_ACCEPTANCE: effect('BLOCK', 'INPUTXML_SOURCE_GEOMETRY_INVALID'),
      },
    }));
  }
  return rows;
}

function topologyFindings(report, category) {
  return report.findings.map((row) => {
    const sourceEffects = Array.isArray(row.capabilityEffects) ? row.capabilityEffects : [];
    const disposition = sourceEffects.some((entry) => entry.effect === 'BLOCK')
      ? 'BLOCK'
      : 'CONDITIONAL';
    return finding({
      code: row.code,
      category,
      severity: disposition === 'BLOCK' ? 'error' : 'warning',
      occurrenceKey: row.findingId,
      message: row.message,
      entities: row.entities,
      evidence: { sourceFinding: row },
      authority: report.schema,
      remediation: row.remediation,
      capabilityEffects: {
        TOPOLOGY_ACCEPTANCE: effect(disposition, row.code),
      },
    });
  });
}

function inventoryFindings(inventory) {
  const rows = [];
  for (const item of inventory) {
    if (!item.active || item.classification?.mechanicsOwnedByInventoryId) continue;
    const strict = item.dispositionByProfile[STRICT_INPUTXML_LINEAR_STATIC_PROFILE];
    const approximate = item.dispositionByProfile[DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE];
    const effects = {};
    addProfileEffect(effects, 'STRICT_LINEAR_STATIC', strict);
    addProfileEffect(effects, 'APPROXIMATE_LINEAR_STATIC', approximate);

    if (item.sourceKind === 'SIF' && item.classification?.codeInputSupported === false) {
      effects.CODE_STRESS_INPUT_READINESS = effect('BLOCK', 'MODEL_SIF_TYPE_UNSUPPORTED');
    }
    if (Object.keys(effects).length === 0) continue;
    const worst = worstDisposition(Object.values(effects).map((row) => row.disposition));
    const limitationCode = effects.CODE_STRESS_INPUT_READINESS?.limitationCode
      ?? strict.limitationCode
      ?? approximate.limitationCode
      ?? 'MODEL_FEATURE_LIMITATION';
    rows.push(finding({
      code: limitationCode,
      category: item.sourceKind === 'RESTRAINT'
        ? 'RESTRAINT'
        : item.sourceKind === 'SIF' || item.sourceKind === 'ALLOWABLE_STRESS'
          ? 'CODE_INPUT'
          : 'REPRESENTABILITY',
      severity: worst === 'BLOCK' ? 'error' : 'warning',
      occurrenceKey: item.inventoryId,
      message: `${item.sourceKind} ${item.inventoryId} is ${strict.disposition} for the strict profile and ${approximate.disposition} for the disclosed approximation profile.`,
      entities: {
        nodeIds: item.targetIds.nodeIds,
        segmentIds: item.targetIds.segmentIds,
        sourceFeatureIds: item.sourceFeatureId ? [item.sourceFeatureId] : [],
        sourceIndices: [item.sourceIndex],
      },
      evidence: {
        inventoryId: item.inventoryId,
        sourceRecordSemanticHash: item.sourceRecordSemanticHash,
        classification: item.classification,
        dispositionByProfile: item.dispositionByProfile,
      },
      authority: 'CURRENT_GENERIC_INPUTXML_REPRESENTABILITY_V1',
      remediation: 'Implement the missing mechanics or use only a profile whose declared limitation is acceptable; the source feature is not silently omitted.',
      capabilityEffects: effects,
    }));
  }
  return rows;
}

function duplicateRestraintFindings(inventory) {
  const groups = new Map();
  for (const row of inventory) {
    if (!row.active || row.sourceKind !== 'RESTRAINT') continue;
    const nodeId = row.classification?.nodeId;
    const targetDofs = row.classification?.targetDofs ?? [];
    if (nodeId === null || nodeId === undefined || targetDofs.length === 0) continue;
    for (const targetDof of targetDofs) {
      const key = `${nodeId}:${targetDof}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([key, rows]) => {
      const [nodeId, targetDof] = key.split(':');
      return finding({
        code: 'MODEL_RESTRAINT_TARGET_DUPLICATE',
        category: 'RESTRAINT',
        severity: 'error',
        occurrenceKey: key,
        message: `${rows.length} retained restraints target ${key}; the current Map-based compiler would collapse declarations by node and DOF.`,
        entities: {
          nodeIds: [nodeId],
          sourceFeatureIds: rows.map((row) => row.sourceFeatureId),
        },
        evidence: {
          targetDof,
          inventoryIds: rows.map((row) => row.inventoryId).sort(compareAscii),
        },
        authority: 'CURRENT_GENERIC_INPUTXML_REPRESENTABILITY_V1',
        remediation: 'Resolve duplicate restraint intent explicitly before constraint compilation.',
        capabilityEffects: {
          STRICT_LINEAR_STATIC: effect('BLOCK', 'MODEL_RESTRAINT_TARGET_DUPLICATE'),
          APPROXIMATE_LINEAR_STATIC: effect('BLOCK', 'MODEL_RESTRAINT_TARGET_DUPLICATE'),
        },
      });
    });
}

function deferredPreparationFindings(inventory) {
  const activeTemperatureCount = inventory.filter((row) => (
    row.active && row.sourceKind === 'TEMPERATURE_INPUT'
  )).length;
  const thermalFinding = activeTemperatureCount === 0
    ? finding({
      code: 'MODEL_OPERATING_TEMPERATURE_NOT_DECLARED',
      category: 'LOAD',
      severity: 'error',
      occurrenceKey: 'THERMAL_AUTHORITY',
      message: 'No active operating temperature is retained; a thermal operating case is unavailable.',
      evidence: { activeTemperatureCount },
      authority: 'INPUTXML_MODEL_HEALTH_SOURCE',
      remediation: 'Declare an operating temperature when an operating thermal case is required.',
      capabilityEffects: {
        THERMAL_AUTHORITY: effect('BLOCK', 'MODEL_OPERATING_TEMPERATURE_NOT_DECLARED'),
      },
    })
    : finding({
      code: 'THERMAL_PROFILE_PREPARATION_REQUIRED',
      category: 'PREPARATION_BOUNDARY',
      severity: 'warning',
      occurrenceKey: 'THERMAL_AUTHORITY',
      message: 'Thermal material/alpha authority is retained for a later profile-preparation slice.',
      evidence: { preparationImplemented: false, activeTemperatureCount },
      authority: 'MODEL_HEALTH_SEQUENCE',
      remediation: 'Prepare and seal the thermal authority before enabling an operating case.',
      capabilityEffects: {
        THERMAL_AUTHORITY: effect('CONDITIONAL', 'THERMAL_PROFILE_PREPARATION_REQUIRED'),
      },
    });
  return [
    thermalFinding,
    finding({
      code: 'SUSTAINED_PROFILE_PREPARATION_REQUIRED',
      category: 'PREPARATION_BOUNDARY',
      severity: 'warning',
      occurrenceKey: 'SUSTAINED_CASES',
      message: 'Material, section, and sustained-load preparation is not implemented in this diagnostic slice.',
      evidence: { preparationImplemented: false },
      authority: 'MODEL_HEALTH_SEQUENCE',
      remediation: 'Prepare and seal the selected sustained profile before execution.',
      capabilityEffects: {
        SUSTAINED_CASE_STRICT: effect('CONDITIONAL', 'SUSTAINED_PROFILE_PREPARATION_REQUIRED'),
        SUSTAINED_CASE_APPROXIMATE: effect('CONDITIONAL', 'SUSTAINED_PROFILE_PREPARATION_REQUIRED'),
      },
    }),
    finding({
      code: 'OPERATING_PROFILE_PREPARATION_REQUIRED',
      category: 'PREPARATION_BOUNDARY',
      severity: 'warning',
      occurrenceKey: 'OPERATING_CASES',
      message: 'Operating-load preparation is not implemented in this diagnostic slice.',
      evidence: { preparationImplemented: false },
      authority: 'MODEL_HEALTH_SEQUENCE',
      remediation: 'Prepare and seal the selected operating profile before execution.',
      capabilityEffects: {
        OPERATING_CASE_STRICT: effect('CONDITIONAL', 'OPERATING_PROFILE_PREPARATION_REQUIRED'),
        OPERATING_CASE_APPROXIMATE: effect('CONDITIONAL', 'OPERATING_PROFILE_PREPARATION_REQUIRED'),
      },
    }),
    finding({
      code: 'CODE_STRESS_PROFILE_PREPARATION_REQUIRED',
      category: 'PREPARATION_BOUNDARY',
      severity: 'warning',
      occurrenceKey: 'CODE_STRESS_INPUT_READINESS',
      message: 'Code-stress input custody is inventoried, but code-stress preparation and evaluation are not performed here.',
      evidence: { preparationImplemented: false, evaluationImplemented: false },
      authority: 'MODEL_HEALTH_SEQUENCE',
      remediation: 'Prepare code inputs and run a separately qualified code evaluation before claiming readiness.',
      capabilityEffects: {
        CODE_STRESS_INPUT_READINESS: effect('CONDITIONAL', 'CODE_STRESS_PROFILE_PREPARATION_REQUIRED'),
      },
    }),
  ];
}

function foldCapabilities(findings) {
  const rows = new Map();
  for (const capabilityId of INPUTXML_MODEL_HEALTH_CAPABILITIES) {
    const dependencyIds = INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES[capabilityId];
    if (!Array.isArray(dependencyIds)) {
      throw new TypeError(`Capability ${capabilityId} has no dependency declaration.`);
    }
    rows.set(capabilityId, {
      capabilityId,
      ownStatus: 'PASS',
      status: 'PASS',
      dependencyIds: [...dependencyIds],
      dependencyEffects: [],
      findingIds: [],
      limitationCodes: [],
    });
  }
  for (const findingRow of findings) {
    for (const [capabilityId, capabilityEffect] of Object.entries(findingRow.capabilityEffects)) {
      const row = rows.get(capabilityId);
      if (!row) throw new TypeError(`Finding ${findingRow.findingId} names unknown capability ${capabilityId}.`);
      if (EFFECT_RANK[capabilityEffect.disposition] > EFFECT_RANK[row.ownStatus]) {
        row.ownStatus = capabilityEffect.disposition;
      }
      row.status = row.ownStatus;
      row.findingIds.push(findingRow.findingId);
      if (capabilityEffect.limitationCode) row.limitationCodes.push(capabilityEffect.limitationCode);
    }
  }
  for (let pass = 0; pass < INPUTXML_MODEL_HEALTH_CAPABILITIES.length; pass += 1) {
    let changed = false;
    for (const capabilityId of INPUTXML_MODEL_HEALTH_CAPABILITIES) {
      const row = rows.get(capabilityId);
      let status = row.ownStatus;
      const dependencyEffects = [];
      for (const dependencyId of row.dependencyIds) {
        const dependency = rows.get(dependencyId);
        if (!dependency) throw new TypeError(`Capability ${capabilityId} depends on unknown capability ${dependencyId}.`);
        if (EFFECT_RANK[dependency.status] > EFFECT_RANK[status]) status = dependency.status;
        if (dependency.status !== 'PASS') {
          dependencyEffects.push(Object.freeze({
            capabilityId: dependencyId,
            disposition: dependency.status,
          }));
        }
      }
      if (status !== row.status) changed = true;
      row.status = status;
      row.dependencyEffects = dependencyEffects;
    }
    if (!changed) break;
    if (pass === INPUTXML_MODEL_HEALTH_CAPABILITIES.length - 1) {
      throw new TypeError('InputXML model-health capability dependencies did not converge.');
    }
  }
  return Object.freeze(INPUTXML_MODEL_HEALTH_CAPABILITIES.map((capabilityId) => {
    const row = rows.get(capabilityId);
    return Object.freeze({
      capabilityId,
      ownStatus: row.ownStatus,
      status: row.status,
      dependencyIds: Object.freeze(row.dependencyIds),
      dependencyEffects: Object.freeze(row.dependencyEffects),
      findingIds: Object.freeze(uniqueAscii(row.findingIds)),
      limitationCodes: Object.freeze(uniqueAscii(row.limitationCodes)),
    });
  }));
}

function finding({
  code,
  category,
  severity,
  occurrenceKey,
  message,
  entities = {},
  evidence = {},
  authority,
  remediation,
  capabilityEffects,
}) {
  const normalizedEntities = normalizeEntities(entities);
  const findingId = `IMH:${code}:${semanticHash({ code, occurrenceKey, entities: normalizedEntities })}`;
  return Object.freeze({
    findingId,
    code,
    category,
    severity,
    message,
    entities: Object.freeze(normalizedEntities),
    evidence: Object.freeze(structuredClone(evidence)),
    authority,
    remediation,
    capabilityEffects: Object.freeze(capabilityEffects),
  });
}

function effect(disposition, limitationCode) {
  return Object.freeze({ disposition, limitationCode: limitationCode ?? null });
}

function addProfileEffect(effects, capabilityId, disposition) {
  if (disposition.disposition === 'IMPLEMENTED_WITH_DECLARED_APPROXIMATION') {
    effects[capabilityId] = effect('CONDITIONAL', disposition.limitationCode);
  } else if (['UNSUPPORTED_BY_GENERIC_SOLVER', 'NONLINEAR_OUT_OF_SCOPE', 'INVALID_SOURCE_DATA']
    .includes(disposition.disposition)) {
    effects[capabilityId] = effect('BLOCK', disposition.limitationCode);
  }
}

function worstDisposition(dispositions) {
  return dispositions.reduce((worst, value) => (
    EFFECT_RANK[value] > EFFECT_RANK[worst] ? value : worst
  ), 'PASS');
}

function normalizeEntities(entities) {
  return Object.fromEntries(Object.entries(entities).map(([key, values]) => [
    key,
    Object.freeze(uniqueAscii(values ?? [])),
  ]));
}

function aggregateDiagnosticEntities(diagnostics) {
  const nodeIds = [];
  const segmentIds = [];
  const sourceIndices = [];
  for (const row of diagnostics) {
    const data = row.data ?? {};
    if (data.nodeId !== undefined) nodeIds.push(data.nodeId);
    if (Array.isArray(data.nodeIds)) nodeIds.push(...data.nodeIds);
    if (data.segmentId !== undefined) segmentIds.push(data.segmentId);
    if (Array.isArray(data.segmentIds)) segmentIds.push(...data.segmentIds);
    if (data.elementIndex !== undefined) sourceIndices.push(data.elementIndex);
  }
  return { nodeIds, segmentIds, sourceIndices };
}

function requireUniqueFindingIds(findings) {
  const ids = new Set();
  for (const row of findings) {
    if (ids.has(row.findingId)) {
      throw new TypeError(`InputXML model-health finding ${row.findingId} is duplicated.`);
    }
    ids.add(row.findingId);
  }
}

function countBy(rows, key) {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => compareAscii(left, right)));
}

function uniqueAscii(values) {
  return [...new Set((values ?? [])
    .filter((value) => value !== null && value !== undefined)
    .map(String))].sort(compareAscii);
}

function compareFinding(left, right) {
  return compareAscii(left.findingId, right.findingId);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
