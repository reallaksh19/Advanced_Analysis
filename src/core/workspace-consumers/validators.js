import { validateSharedPipingModel } from '../shared-piping-model/index.js';
import {
  validatePipingPortTopologyGraph,
  validateTopologyConnectionAudit,
} from '../piping-topology/index.js';
import {
  validateRestraintCapabilityAudit,
  validateRestraintCapabilityModel,
  validateSupportAttachmentAudit,
  validateSupportAttachmentModel,
} from '../support-restraints/index.js';
import {
  validateLoadCaseSet,
  validateModelLoadPrimitiveSet,
  validateModelLoadReadinessAudit,
} from '../model-loads/index.js';
import {
  validateSupportLoadScreeningAudit,
  validateTributarySupportLoadScreening,
  validateVerticalLoadPathModel,
} from '../support-load-screening/index.js';
import {
  validateFlexuralPropertyProjection,
  validateVerticalBeamModel,
  validateVerticalBeamSolution,
  validateVerticalBeamSolverAudit,
} from '../vertical-beam-solver/index.js';
import {
  activeModelCalculationEntry,
  validateModelCalculationLedger,
  validateModelCalculationPackage,
  validateModelCalculationReport,
} from '../model-calculation-package/index.js';

const VALIDATORS = Object.freeze({
  sharedModel: validateSharedPipingModel,
  topologyGraph: validatePipingPortTopologyGraph,
  topologyAudit: validateTopologyConnectionAudit,
  supportAttachmentModel: validateSupportAttachmentModel,
  supportAttachmentAudit: validateSupportAttachmentAudit,
  restraintCapabilityModel: validateRestraintCapabilityModel,
  restraintCapabilityAudit: validateRestraintCapabilityAudit,
  loadCaseSet: validateLoadCaseSet,
  loadPrimitiveSet: validateModelLoadPrimitiveSet,
  modelLoadReadinessAudit: validateModelLoadReadinessAudit,
  verticalLoadPathModel: validateVerticalLoadPathModel,
  supportLoadScreening: validateTributarySupportLoadScreening,
  supportLoadScreeningAudit: validateSupportLoadScreeningAudit,
  flexuralPropertyProjection: validateFlexuralPropertyProjection,
  verticalBeamModel: validateVerticalBeamModel,
  verticalBeamSolution: validateVerticalBeamSolution,
  verticalBeamSolverAudit: validateVerticalBeamSolverAudit,
  modelCalculationLedger: validateModelCalculationLedger,
  activeModelCalculationPackage: validateModelCalculationPackage,
  activeModelCalculationReport: validateModelCalculationReport,
});

export function validateConsumerContract(contractKey, value, contracts = {}) {
  const validator = VALIDATORS[contractKey];
  if (!validator) return { ok: false, errors: [`Unknown consumer contract key: ${contractKey}.`] };
  try {
    const result = contractKey === 'activeModelCalculationReport'
      ? validator(value, contracts.activeModelCalculationPackage || null)
      : validator(value);
    return { ok: Boolean(result?.ok), errors: [...(result?.errors || [])] };
  } catch (error) {
    return { ok: false, errors: [messageOf(error)] };
  }
}

export function contractDatasetId(contractKey, value) {
  if (!value) return null;
  if (contractKey === 'sharedModel') return value.project?.datasetId || null;
  if (contractKey === 'loadCaseSet' || contractKey === 'topologyAudit') return null;
  return value.datasetId || null;
}

export function contractLinkError(contractKey, value, contracts) {
  const checks = LINK_CHECKS[contractKey] || [];
  for (const check of checks) {
    const error = check(value, contracts);
    if (error) return error;
  }
  return null;
}

export function activeLedgerEntry(ledger) {
  if (!ledger) return null;
  try { return activeModelCalculationEntry(ledger); } catch { return null; }
}

const LINK_CHECKS = Object.freeze({
  topologyGraph: [hashLink('sharedModel', 'sharedModelSemanticHash')],
  topologyAudit: [topologyAuditLink],
  supportAttachmentModel: [
    hashLink('sharedModel', 'sharedModelSemanticHash'),
    hashLink('topologyGraph', 'topologySemanticHash'),
  ],
  supportAttachmentAudit: [embeddedAuditLink('supportAttachmentModel', 'attachmentAudit')],
  restraintCapabilityModel: [
    hashLink('sharedModel', 'sharedModelSemanticHash'),
    hashLink('topologyGraph', 'topologySemanticHash'),
    hashLink('supportAttachmentModel', 'attachmentModelSemanticHash'),
  ],
  restraintCapabilityAudit: [embeddedAuditLink('restraintCapabilityModel', 'restraintAudit')],
  loadPrimitiveSet: [hashLink('loadCaseSet', 'loadCaseSetSemanticHash')],
  modelLoadReadinessAudit: [
    hashLink('loadCaseSet', 'loadCaseSetSemanticHash'),
    hashLink('loadPrimitiveSet', 'primitiveSetSemanticHash'),
  ],
  verticalLoadPathModel: [
    hashLink('sharedModel', 'sharedModelSemanticHash'),
    hashLink('topologyGraph', 'topologySemanticHash'),
    hashLink('supportAttachmentModel', 'attachmentModelSemanticHash'),
    hashLink('restraintCapabilityModel', 'restraintModelSemanticHash'),
  ],
  supportLoadScreening: [
    hashLink('verticalLoadPathModel', 'pathModelSemanticHash'),
    hashLink('loadCaseSet', 'loadCaseSetSemanticHash'),
    hashLink('loadPrimitiveSet', 'primitiveSetSemanticHash'),
    hashLink('modelLoadReadinessAudit', 'readinessAuditSemanticHash'),
  ],
  supportLoadScreeningAudit: [hashLink('supportLoadScreening', 'screeningSemanticHash')],
  flexuralPropertyProjection: [
    hashLink('sharedModel', 'sharedModelSemanticHash'),
    hashLink('verticalLoadPathModel', 'pathModelSemanticHash'),
  ],
  verticalBeamModel: [
    hashLink('verticalLoadPathModel', 'pathModelSemanticHash'),
    hashLink('flexuralPropertyProjection', 'flexuralProjectionSemanticHash'),
    hashLink('loadCaseSet', 'loadCaseSetSemanticHash'),
    hashLink('loadPrimitiveSet', 'primitiveSetSemanticHash'),
    hashLink('modelLoadReadinessAudit', 'readinessAuditSemanticHash'),
  ],
  verticalBeamSolution: [
    hashLink('verticalBeamModel', 'beamModelSemanticHash'),
    profileLink('verticalBeamModel'),
  ],
  verticalBeamSolverAudit: [hashLink('verticalBeamSolution', 'solutionSemanticHash')],
  activeModelCalculationPackage: [activePackageLink],
  activeModelCalculationReport: [activeReportLink],
});

function hashLink(parentKey, field) {
  return (value, contracts) => {
    const parent = contracts[parentKey];
    if (!parent) return `Required upstream contract ${parentKey} is unavailable.`;
    return value?.[field] === parent.semanticHash
      ? null : `${field} does not match ${parentKey}.`;
  };
}

function embeddedAuditLink(modelKey, field) {
  return (value, contracts) => {
    const model = contracts[modelKey];
    if (!model) return `Required upstream contract ${modelKey} is unavailable.`;
    return model[field]?.semanticHash === value?.semanticHash
      ? null : `${modelKey}.${field} does not match the supplied audit.`;
  };
}

function topologyAuditLink(value, contracts) {
  const graph = contracts.topologyGraph;
  if (!graph) return 'Required upstream contract topologyGraph is unavailable.';
  if (contracts.sharedModel && value?.modelSemanticHash !== contracts.sharedModel.semanticHash) {
    return 'Topology audit modelSemanticHash does not match sharedModel.';
  }
  return graph.topologyAudit?.semanticHash === value?.semanticHash
    ? null : 'Topology graph embedded audit does not match topologyAudit.';
}

function profileLink(parentKey) {
  return (value, contracts) => {
    const parent = contracts[parentKey];
    if (!parent) return `Required upstream contract ${parentKey} is unavailable.`;
    return parent.profile?.semanticHash === value?.profile?.semanticHash
      ? null : `Profile does not match ${parentKey}.`;
  };
}

function activePackageLink(value, contracts) {
  const entry = activeLedgerEntry(contracts.modelCalculationLedger);
  if (!entry) return 'Model calculation ledger has no active archived entry.';
  return entry.package === value && entry.packageSemanticHash === value?.semanticHash
    ? null : 'Active package is not the exact package reference from the active ledger entry.';
}

function activeReportLink(value, contracts) {
  const entry = activeLedgerEntry(contracts.modelCalculationLedger);
  const packageValue = contracts.activeModelCalculationPackage;
  if (!entry || !packageValue) return 'Active ledger package evidence is unavailable.';
  if (value?.entryId !== entry.entryId || value?.entrySemanticHash !== entry.semanticHash) {
    return 'Active report does not match the active ledger entry.';
  }
  return value?.packageSemanticHash === packageValue.semanticHash
    ? null : 'Active report does not match the active package.';
}

function messageOf(error) { return error instanceof Error ? error.message : String(error); }
