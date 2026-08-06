import {
  diagnoseInputXmlTopology,
  requireModelTopologyDiagnostics,
} from '../geometry/model-health/index.js';
import { parseInputXmlModelHealthSource } from './inputxml-source-binding.js';
import {
  INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA,
  sealInputXmlLinearModelHealth,
} from './inputxml-model-health-contract.js';
import { INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES } from './inputxml-model-health-profile.js';
import { buildInputXmlFeatureInventory } from './inputxml-feature-inventory.js';
import { buildInputXmlRepresentabilityFindings } from './inputxml-representability-findings.js';
import { buildInputXmlAuthorityFindings } from './inputxml-authority-findings.js';
import { foldInputXmlModelHealthCapabilities } from './inputxml-capability-folding.js';
import { compareInputXmlModelHealthFinding } from './inputxml-model-health-finding.js';

export const INPUTXML_MODEL_HEALTH_CONTEXT_SCHEMA = 'fea-inputxml-model-health-context/v1';
export const INPUTXML_MODEL_HEALTH_SOURCE_SCHEMA = INPUTXML_MODEL_HEALTH_CONTEXT_SCHEMA;

export function diagnoseInputXmlLinearModelHealth(sourceBundle, options) {
  const accepted = options ?? {};
  const topology = requireModelTopologyDiagnostics(
    accepted.topologyReport ?? diagnoseInputXmlTopology(sourceBundle, accepted.topology ?? {}),
    sourceBundle,
  );
  const inventory = buildInputXmlFeatureInventory(sourceBundle);
  const findings = [
    ...buildInputXmlRepresentabilityFindings({ sourceBundle, topology, inventory }),
    ...buildInputXmlAuthorityFindings(sourceBundle, inventory),
  ].sort(compareInputXmlModelHealthFinding);
  const capabilities = foldInputXmlModelHealthCapabilities(
    findings,
    INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES,
  );
  const capabilityById = new Map(capabilities.map((row) => [row.capabilityId, row]));
  return sealInputXmlLinearModelHealth({
    schema: INPUTXML_LINEAR_MODEL_HEALTH_SCHEMA,
    authoritativeCapabilityId: 'STRICT_LINEAR_STATIC',
    sourceBundleSemanticHash: sourceBundle.semanticHash,
    sourceBundleEvidenceHash: sourceBundle.evidenceHash,
    topologySemanticHash: topology.semanticHash,
    topologyEvidenceHash: topology.evidenceHash,
    capabilityDependencies: INPUTXML_MODEL_HEALTH_CAPABILITY_DEPENDENCIES,
    capabilities,
    inventory,
    findings,
    summary: summaryOf(inventory, findings, capabilityById),
    executionAvailability: {
      STRICT_INPUTXML_LINEAR_STATIC_V1: 'LOAD_CASE_PREPARATION_AVAILABLE_STIFFNESS_PREFLIGHT_NOT_IMPLEMENTED',
      DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_V1: 'LOAD_CASE_PREPARATION_AVAILABLE_STIFFNESS_PREFLIGHT_NOT_IMPLEMENTED',
    },
  });
}

export function diagnoseInputXmlLinearModelHealthContext(content, options) {
  const accepted = options ?? {};
  const { topology: topologyOptions = {}, ...ingestionOptions } = accepted;
  const sourceBundle = parseInputXmlModelHealthSource(content, ingestionOptions);
  const topology = diagnoseInputXmlTopology(sourceBundle, topologyOptions);
  const report = diagnoseInputXmlLinearModelHealth(sourceBundle, { topologyReport: topology });
  return Object.freeze({
    schema: INPUTXML_MODEL_HEALTH_CONTEXT_SCHEMA,
    sourceBundleSemanticHash: sourceBundle.semanticHash,
    sourceBundleEvidenceHash: sourceBundle.evidenceHash,
    sourceBundle,
    topology,
    report,
  });
}

export function diagnoseInputXmlModelHealthSource(content, options) {
  return diagnoseInputXmlLinearModelHealthContext(content, options);
}

function summaryOf(inventory, findings, capabilityById) {
  const severityCounts = countBy(findings, 'severity');
  const sourceKindCounts = countBy(inventory, 'sourceKind');
  return Object.freeze({
    authoritativeCapabilityId: 'STRICT_LINEAR_STATIC',
    strictLinearStaticStatus: capabilityById.get('STRICT_LINEAR_STATIC').status,
    approximateLinearStaticStatus: capabilityById.get('APPROXIMATE_LINEAR_STATIC').status,
    sustainedStrictStatus: capabilityById.get('SUSTAINED_CASE_STRICT').status,
    operatingStrictStatus: capabilityById.get('OPERATING_CASE_STRICT').status,
    sustainedApproximateStatus: capabilityById.get('SUSTAINED_CASE_APPROXIMATE').status,
    operatingApproximateStatus: capabilityById.get('OPERATING_CASE_APPROXIMATE').status,
    inventoryCount: inventory.length,
    activeInventoryCount: inventory.filter((row) => row.active).length,
    findingCount: findings.length,
    errorFindingCount: severityCounts.error ?? 0,
    warningFindingCount: severityCounts.warning ?? 0,
    infoFindingCount: severityCounts.info ?? 0,
    sourceKindCounts: Object.freeze(sourceKindCounts),
  });
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}