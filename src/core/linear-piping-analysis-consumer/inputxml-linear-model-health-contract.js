import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import {
  computeInputXmlModelHealthSourceEvidenceHash,
  computeInputXmlModelHealthSourceSemanticHash,
  requireInputXmlModelHealthSource,
  requireTopologyGraphDiagnostics,
  requireTopologyProximityDiagnostics,
} from '../geometry/model-health/index.js';
import {
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
  INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS,
  INPUTXML_FEATURE_DISPOSITIONS,
  INPUTXML_MODEL_HEALTH_CAPABILITIES,
  INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES,
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
} from './inputxml-model-health-profile.js';

export const INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA = 'fea-inputxml-linear-model-health/v1';

const EXPECTED_PROFILE_IDS = Object.freeze([
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE,
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE,
]);

export function sealInputXmlLinearModelHealth(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(semanticProjection(draft));
  const evidence = semanticHash(evidenceProjection(draft, semantic));
  return deepFreeze({ ...draft, semanticHash: semantic, evidenceHash: evidence });
}

export function requireInputXmlLinearModelHealth(
  value,
  expectedSourceBundle = null,
  expectedGraphReport = null,
  expectedProximityReport = null,
) {
  if (!isPlainRecord(value) || value.schema !== INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA) {
    throw new TypeError('InputXML linear model-health schema is invalid.');
  }
  requireDraft(value);
  const expectedSemantic = semanticHash(semanticProjection(value));
  if (value.semanticHash !== expectedSemantic) {
    throw new TypeError('InputXML linear model-health semantic hash mismatch.');
  }
  const expectedEvidence = semanticHash(evidenceProjection(value, expectedSemantic));
  if (value.evidenceHash !== expectedEvidence) {
    throw new TypeError('InputXML linear model-health evidence hash mismatch.');
  }
  if (expectedSourceBundle !== null) {
    const accepted = requireInputXmlModelHealthSource(expectedSourceBundle);
    if (value.sourceBundleSemanticHash !== computeInputXmlModelHealthSourceSemanticHash(accepted)
      || value.sourceBundleEvidenceHash !== computeInputXmlModelHealthSourceEvidenceHash(accepted)) {
      throw new TypeError('InputXML linear model-health report is stale for the supplied source bundle.');
    }
  }
  if (expectedGraphReport !== null) {
    const graph = requireTopologyGraphDiagnostics(expectedGraphReport, expectedSourceBundle);
    if (value.topologyGraphSemanticHash !== graph.semanticHash
      || value.topologyGraphEvidenceHash !== graph.evidenceHash) {
      throw new TypeError('InputXML linear model-health report is stale for the supplied graph report.');
    }
  }
  if (expectedProximityReport !== null) {
    const proximity = requireTopologyProximityDiagnostics(expectedProximityReport, expectedSourceBundle);
    if (value.topologyProximitySemanticHash !== proximity.semanticHash
      || value.topologyProximityEvidenceHash !== proximity.evidenceHash) {
      throw new TypeError('InputXML linear model-health report is stale for the supplied proximity report.');
    }
  }
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value)) throw new TypeError('InputXML linear model-health draft must be a record.');
  if (value.schema !== INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA) {
    throw new TypeError('InputXML linear model-health draft schema is invalid.');
  }
  for (const key of [
    'sourceBundleSemanticHash',
    'sourceBundleEvidenceHash',
    'topologyGraphSemanticHash',
    'topologyGraphEvidenceHash',
    'topologyProximitySemanticHash',
    'topologyProximityEvidenceHash',
  ]) {
    if (typeof value[key] !== 'string') {
      throw new TypeError(`InputXML linear model-health ${key} is invalid.`);
    }
  }
  if (!sameOrderedStrings(value.profileIds, EXPECTED_PROFILE_IDS)) {
    throw new TypeError('InputXML linear model-health profile identities are incomplete or out of order.');
  }
  if (!isPlainRecord(value.capabilityDependencies)
    || semanticHash(value.capabilityDependencies)
      !== semanticHash(INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES)
    || !Array.isArray(value.capabilities)
    || !Array.isArray(value.inventory)
    || !Array.isArray(value.findings)
    || !isPlainRecord(value.summary)
    || !isPlainRecord(value.executionAvailability)) {
    throw new TypeError('InputXML linear model-health collections are invalid.');
  }
  const findingIds = requireFindings(value.findings);
  requireCapabilities(value.capabilities, findingIds);
  requireInventory(value.inventory);
  requireExecutionBoundary(value.executionAvailability);
}

function requireCapabilities(capabilities, findingIds) {
  const ids = capabilities.map((row) => row.capabilityId);
  if (!sameOrderedStrings(ids, INPUTXML_MODEL_HEALTH_CAPABILITIES)) {
    throw new TypeError('InputXML linear model-health capabilities are incomplete or out of canonical order.');
  }
  for (const row of capabilities) {
    const expectedDependencies = INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES[row.capabilityId];
    if (!INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS.includes(row.status)
      || !INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS.includes(row.ownStatus)
      || !sameOrderedStrings(row.dependencyIds, expectedDependencies)
      || !Array.isArray(row.dependencyEffects)
      || !Array.isArray(row.findingIds)
      || !Array.isArray(row.limitationCodes)) {
      throw new TypeError(`InputXML linear model-health capability ${row.capabilityId} is malformed.`);
    }
    if (new Set(row.findingIds).size !== row.findingIds.length
      || row.findingIds.some((findingId) => !findingIds.has(findingId))
      || row.limitationCodes.some((code) => typeof code !== 'string')) {
      throw new TypeError(`InputXML linear model-health capability ${row.capabilityId} references invalid evidence.`);
    }
    for (const dependencyEffect of row.dependencyEffects) {
      if (!isPlainRecord(dependencyEffect)
        || !expectedDependencies.includes(dependencyEffect.capabilityId)
        || !INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS.includes(dependencyEffect.disposition)
        || dependencyEffect.disposition === 'PASS') {
        throw new TypeError(`InputXML linear model-health capability ${row.capabilityId} has an invalid dependency effect.`);
      }
    }
  }
}

function requireInventory(inventory) {
  const ids = new Set();
  for (const row of inventory) {
    if (!isPlainRecord(row)
      || typeof row.inventoryId !== 'string'
      || typeof row.sourceFeatureId !== 'string'
      || typeof row.sourceKind !== 'string'
      || typeof row.active !== 'boolean'
      || !Number.isInteger(row.sourceIndex)
      || row.sourceIndex < 0
      || typeof row.sourceRecordSemanticHash !== 'string'
      || !isPlainRecord(row.targetIds)
      || !Array.isArray(row.targetIds.nodeIds)
      || !Array.isArray(row.targetIds.segmentIds)
      || !isPlainRecord(row.classification)
      || ids.has(row.inventoryId)) {
      throw new TypeError('InputXML linear model-health inventory identity or structure is invalid.');
    }
    ids.add(row.inventoryId);
    if (!isPlainRecord(row.dispositionByProfile)
      || !sameUnorderedStrings(Object.keys(row.dispositionByProfile), EXPECTED_PROFILE_IDS)) {
      throw new TypeError(`Inventory ${row.inventoryId} has incomplete profile dispositions.`);
    }
    for (const disposition of Object.values(row.dispositionByProfile)) {
      if (!isPlainRecord(disposition)
        || !INPUTXML_FEATURE_DISPOSITIONS.includes(disposition.disposition)
        || !(disposition.limitationCode === null || typeof disposition.limitationCode === 'string')) {
        throw new TypeError(`Inventory ${row.inventoryId} has an invalid feature disposition.`);
      }
    }
  }
}

function requireFindings(findings) {
  const ids = new Set();
  for (const row of findings) {
    if (!isPlainRecord(row)
      || typeof row.findingId !== 'string'
      || typeof row.code !== 'string'
      || typeof row.category !== 'string'
      || typeof row.message !== 'string'
      || typeof row.authority !== 'string'
      || typeof row.remediation !== 'string'
      || ids.has(row.findingId)) {
      throw new TypeError('InputXML linear model-health finding identity or structure is invalid.');
    }
    ids.add(row.findingId);
    if (!['info', 'warning', 'error'].includes(row.severity)
      || !isPlainRecord(row.capabilityEffects)
      || !isPlainRecord(row.entities)
      || !isPlainRecord(row.evidence)) {
      throw new TypeError(`InputXML linear model-health finding ${row.findingId} is malformed.`);
    }
    for (const [capabilityId, effect] of Object.entries(row.capabilityEffects)) {
      if (!INPUTXML_MODEL_HEALTH_CAPABILITIES.includes(capabilityId)
        || !isPlainRecord(effect)
        || !INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS.includes(effect.disposition)
        || effect.disposition === 'PASS'
        || !(effect.limitationCode === null || typeof effect.limitationCode === 'string')) {
        throw new TypeError(`InputXML linear model-health finding ${row.findingId} has an invalid capability effect.`);
      }
    }
  }
  return ids;
}

function requireExecutionBoundary(value) {
  for (const key of [
    'strictProfilePreparationAvailable',
    'approximateProfilePreparationAvailable',
    'strictSolveAuthorized',
    'approximateSolveAuthorized',
    'legacyRawTextSolveGovernedByReport',
  ]) {
    if (value[key] !== false) {
      throw new TypeError(`InputXML linear model-health execution boundary ${key} must remain false in this diagnostic slice.`);
    }
  }
  if (!Array.isArray(value.reasonCodes)
    || value.reasonCodes.length === 0
    || value.reasonCodes.some((code) => typeof code !== 'string')) {
    throw new TypeError('InputXML linear model-health execution boundary reason codes are invalid.');
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    profileIds: value.profileIds,
    sourceBundleSemanticHash: value.sourceBundleSemanticHash,
    topologyGraphSemanticHash: value.topologyGraphSemanticHash,
    topologyProximitySemanticHash: value.topologyProximitySemanticHash,
    capabilityDependencies: value.capabilityDependencies,
    capabilities: value.capabilities,
    inventory: value.inventory,
    findings: value.findings,
    summary: value.summary,
    executionAvailability: value.executionAvailability,
  };
}

function evidenceProjection(value, semantic) {
  return {
    ...semanticProjection(value),
    semanticHash: semantic,
    sourceBundleEvidenceHash: value.sourceBundleEvidenceHash,
    topologyGraphEvidenceHash: value.topologyGraphEvidenceHash,
    topologyProximityEvidenceHash: value.topologyProximityEvidenceHash,
  };
}

function sameOrderedStrings(actual, expected) {
  return Array.isArray(actual)
    && Array.isArray(expected)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function sameUnorderedStrings(actual, expected) {
  return sameOrderedStrings([...actual].sort(), [...expected].sort());
}
