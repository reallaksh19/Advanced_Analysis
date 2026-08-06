import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../shared-piping-model/immutable.js';
import {
  INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS,
  INPUTXML_FEATURE_DISPOSITIONS,
  INPUTXML_MODEL_HEALTH_CAPABILITIES,
} from './inputxml-model-health-profile.js';

export const INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA = 'fea-inputxml-linear-model-health/v1';

export function sealInputXmlLinearModelHealth(value) {
  requireDraft(value);
  const draft = structuredClone(value);
  const semantic = semanticHash(semanticProjection(draft));
  const evidence = semanticHash(evidenceProjection(draft, semantic));
  return deepFreeze({ ...draft, semanticHash: semantic, evidenceHash: evidence });
}

export function requireInputXmlLinearModelHealth(value, expectedSourceBundle, expectedTopology) {
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
  if (expectedSourceBundle) {
    if (value.sourceBundleSemanticHash !== expectedSourceBundle.semanticHash
      || value.sourceBundleEvidenceHash !== expectedSourceBundle.evidenceHash) {
      throw new TypeError('InputXML linear model-health report is stale for the supplied source bundle.');
    }
  }
  if (expectedTopology) {
    if (value.topologySemanticHash !== expectedTopology.semanticHash
      || value.topologyEvidenceHash !== expectedTopology.evidenceHash) {
      throw new TypeError('InputXML linear model-health report is stale for the supplied topology report.');
    }
  }
  return value;
}

function requireDraft(value) {
  if (!isPlainRecord(value)) throw new TypeError('InputXML linear model-health draft must be a record.');
  for (const key of [
    'sourceBundleSemanticHash', 'sourceBundleEvidenceHash',
    'topologySemanticHash', 'topologyEvidenceHash',
  ]) {
    if (typeof value[key] !== 'string') throw new TypeError(`InputXML model-health ${key} is invalid.`);
  }
  if (!isPlainRecord(value.capabilityDependencies) || !Array.isArray(value.capabilities)
    || !Array.isArray(value.inventory) || !Array.isArray(value.findings)
    || !isPlainRecord(value.summary) || !isPlainRecord(value.executionAvailability)) {
    throw new TypeError('InputXML model-health collections are invalid.');
  }
  requireCapabilities(value.capabilities);
  requireInventory(value.inventory);
  requireFindings(value.findings);
}

function requireCapabilities(capabilities) {
  const ids = capabilities.map((row) => row.capabilityId);
  if (ids.length !== INPUTXML_MODEL_HEALTH_CAPABILITIES.length
    || ids.some((id, index) => id !== INPUTXML_MODEL_HEALTH_CAPABILITIES[index])) {
    throw new TypeError('InputXML model-health capabilities are incomplete or out of canonical order.');
  }
  for (const row of capabilities) {
    if (!INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS.includes(row.status)
      || !INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS.includes(row.ownStatus)) {
      throw new TypeError(`InputXML model-health capability ${row.capabilityId} has invalid status.`);
    }
    if (!Array.isArray(row.dependencyIds) || !Array.isArray(row.dependencyEffects)
      || !Array.isArray(row.findingIds) || !Array.isArray(row.limitationCodes)) {
      throw new TypeError(`InputXML model-health capability ${row.capabilityId} is malformed.`);
    }
  }
}

function requireInventory(inventory) {
  const ids = new Set();
  for (const row of inventory) {
    if (!isPlainRecord(row) || typeof row.inventoryId !== 'string' || ids.has(row.inventoryId)) {
      throw new TypeError('InputXML model-health inventory identity is invalid or duplicated.');
    }
    ids.add(row.inventoryId);
    if (!isPlainRecord(row.dispositionByProfile)) {
      throw new TypeError(`Inventory ${row.inventoryId} has no profile dispositions.`);
    }
    for (const disposition of Object.values(row.dispositionByProfile)) {
      if (!INPUTXML_FEATURE_DISPOSITIONS.includes(disposition.disposition)) {
        throw new TypeError(`Inventory ${row.inventoryId} has an invalid feature disposition.`);
      }
    }
  }
}

function requireFindings(findings) {
  const ids = new Set();
  for (const row of findings) {
    if (!isPlainRecord(row) || typeof row.findingId !== 'string' || ids.has(row.findingId)) {
      throw new TypeError('InputXML model-health finding identity is invalid or duplicated.');
    }
    ids.add(row.findingId);
    if (!['info', 'warning', 'error'].includes(row.severity)
      || !isPlainRecord(row.capabilityEffects) || !isPlainRecord(row.entities)
      || !isPlainRecord(row.evidence)) {
      throw new TypeError(`InputXML model-health finding ${row.findingId} is malformed.`);
    }
    for (const [capabilityId, effect] of Object.entries(row.capabilityEffects)) {
      if (!INPUTXML_MODEL_HEALTH_CAPABILITIES.includes(capabilityId)
        || !INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS.includes(effect.disposition)) {
        throw new TypeError(`InputXML model-health finding ${row.findingId} has an invalid capability effect.`);
      }
    }
  }
}

function semanticProjection(value) {
  return {
    schema: value.schema,
    authoritativeCapabilityId: value.authoritativeCapabilityId,
    sourceBundleSemanticHash: value.sourceBundleSemanticHash,
    topologySemanticHash: value.topologySemanticHash,
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
    topologyEvidenceHash: value.topologyEvidenceHash,
  };
}
