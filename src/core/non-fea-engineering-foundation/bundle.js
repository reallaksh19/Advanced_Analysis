import {
  validateVerticalLoadPathModel,
  validateVerticalLoadPathProfile,
} from '../support-load-screening/index.js';
import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { validateNonFeaMassLedger } from './mass-ledger.js';

export const NON_FEA_ENGINEERING_FOUNDATION_SCHEMA = 'non-fea-engineering-foundation-bundle/v1';

const CAPABILITY_IDS = Object.freeze([
  'LOAD_CASE_AUTHORITY',
  'MODEL_LOAD_FOUNDATION',
  'MASS_LEDGER',
  'TOPOLOGY_GRAPH',
  'SUPPORT_ATTACHMENTS',
  'RESTRAINT_CAPABILITY',
  'SUPPORT_SITES',
  'ROUTE_PARTITIONS',
  'VERTICAL_LOAD_PATH',
]);

/**
 * Immutable common preprocessing bundle. Capability readiness is deliberately
 * independent of method qualification and execution authorization.
 */
export function createNonFeaEngineeringFoundationBundle(input = {}) {
  const sourceModelSemanticHash = requiredHash(input.sourceModelSemanticHash, 'sourceModelSemanticHash');
  const enrichmentProjectionSemanticHash = requiredHash(
    input.enrichmentProjectionSemanticHash,
    'enrichmentProjectionSemanticHash',
  );
  const capabilities = [
    loadCaseCapability(input.loadCaseAuthority),
    modelLoadCapability(input.modelLoadFoundation, input.loadCaseAuthority),
    massCapability(
      input.massLedger,
      input.modelLoadFoundation,
      sourceModelSemanticHash,
      enrichmentProjectionSemanticHash,
    ),
    topologyCapability(input.topologyGraph, sourceModelSemanticHash),
    attachmentCapability(input.supportAttachmentModel, input.topologyGraph),
    restraintCapability(input.restraintCapabilityModel, input.supportAttachmentModel),
    contractCapability('SUPPORT_SITES', input.supportSiteModel, 'Support-site model'),
    contractCapability('ROUTE_PARTITIONS', input.routePartitionModel, 'Route-partition model'),
    verticalPathCapability({
      profile: input.verticalLoadPathProfile,
      model: input.verticalLoadPathModel,
      sourceModelSemanticHash,
      topologyGraph: input.topologyGraph,
      supportAttachmentModel: input.supportAttachmentModel,
      restraintCapabilityModel: input.restraintCapabilityModel,
    }),
  ];
  const readyCount = capabilities.filter((row) => row.state === 'READY').length;
  const bundleState = readyCount === capabilities.length
    ? 'READY'
    : readyCount === 0 ? 'BLOCKED' : 'PARTIALLY_READY';
  const blockers = capabilities
    .filter((row) => row.state !== 'READY')
    .flatMap((row) => row.blockers.map((blocker) => ({ capabilityId: row.capabilityId, ...blocker })))
    .sort(issueOrder);
  const base = {
    schema: NON_FEA_ENGINEERING_FOUNDATION_SCHEMA,
    bundleState,
    sourceModelSemanticHash,
    enrichmentProjectionSemanticHash,
    projectDataRevision: Number.isInteger(input.projectDataRevision) ? input.projectDataRevision : null,
    loadCaseAuthority: input.loadCaseAuthority || null,
    modelLoadFoundation: input.modelLoadFoundation || null,
    massLedger: input.massLedger || null,
    topologyGraph: input.topologyGraph || null,
    supportAttachmentModel: input.supportAttachmentModel || null,
    restraintCapabilityModel: input.restraintCapabilityModel || null,
    supportSiteModel: input.supportSiteModel || null,
    routePartitionModel: input.routePartitionModel || null,
    verticalLoadPathProfile: input.verticalLoadPathProfile || null,
    verticalLoadPathModel: input.verticalLoadPathModel || null,
    capabilities,
    blockers,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateNonFeaEngineeringFoundationBundle(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return deepFreeze({ ok: false, errors: ['Engineering foundation bundle must be an object.'] });
  }
  if (value.schema !== NON_FEA_ENGINEERING_FOUNDATION_SCHEMA) {
    errors.push(`Expected ${NON_FEA_ENGINEERING_FOUNDATION_SCHEMA}.`);
  }
  if (!['READY', 'PARTIALLY_READY', 'BLOCKED'].includes(value.bundleState)) {
    errors.push('Engineering foundation bundleState is invalid.');
  }
  try { requiredHash(value.sourceModelSemanticHash, 'sourceModelSemanticHash'); } catch (error) { errors.push(error.message); }
  try { requiredHash(value.enrichmentProjectionSemanticHash, 'enrichmentProjectionSemanticHash'); } catch (error) { errors.push(error.message); }
  if (!Array.isArray(value.capabilities)) errors.push('Engineering foundation capabilities must be an array.');
  else {
    const ids = value.capabilities.map((row) => row?.capabilityId);
    if (JSON.stringify(ids) !== JSON.stringify(CAPABILITY_IDS)) {
      errors.push('Engineering foundation capability registry is incomplete or out of order.');
    }
  }
  if (!Array.isArray(value.blockers)) errors.push('Engineering foundation blockers must be an array.');
  if (value.semanticHash !== semanticHash(withoutHash(value))) {
    errors.push('Engineering foundation semantic hash is invalid.');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function loadCaseCapability(authority) {
  if (!authority) return blocked('LOAD_CASE_AUTHORITY', 'LOAD_CASE_AUTHORITY_MISSING', 'Project Data Load Case authority is not available.');
  if (authority.state !== 'READY') {
    return blocked('LOAD_CASE_AUTHORITY', 'LOAD_CASE_AUTHORITY_BLOCKED', 'Project Data Load Case authority is blocked.', authority.blockers || []);
  }
  return ready('LOAD_CASE_AUTHORITY', authority.semanticHash, `${authority.approvedLoadCases?.length || 0} canonical Load Cases are approved.`);
}

function modelLoadCapability(foundation, loadCaseAuthority) {
  if (!foundation?.loadCaseSet || !foundation?.loadPrimitiveSet || !foundation?.readinessAudit) {
    return blocked('MODEL_LOAD_FOUNDATION', 'MODEL_LOAD_FOUNDATION_MISSING', 'W10.4 model-load foundation is not available.');
  }
  const hashes = [
    foundation.loadCaseSet.semanticHash,
    foundation.loadPrimitiveSet.semanticHash,
    foundation.readinessAudit.semanticHash,
  ];
  if (hashes.some((value) => !validHash(value))) {
    return blocked('MODEL_LOAD_FOUNDATION', 'MODEL_LOAD_FOUNDATION_HASH_MISSING', 'W10.4 foundation contracts require semantic hashes.');
  }
  const caseIds = (foundation.loadCaseSet.loadCases || []).map((row) => row.loadCaseId);
  if (loadCaseAuthority?.state === 'READY') {
    const outside = caseIds.filter((loadCaseId) => !loadCaseAuthority.approvedLoadCases.includes(loadCaseId));
    if (outside.length) {
      return blocked(
        'MODEL_LOAD_FOUNDATION',
        'MODEL_LOAD_CASE_AUTHORITY_MISMATCH',
        `W10.4 foundation contains Load Cases outside Project Data authority: ${outside.sort().join(', ')}.`,
      );
    }
  }
  return ready('MODEL_LOAD_FOUNDATION', semanticHash({ hashes }), `${caseIds.length} W10.4 Load Cases are bound.`);
}

function massCapability(ledger, foundation, sourceHash, projectionHash) {
  if (!ledger) return blocked('MASS_LEDGER', 'MASS_LEDGER_MISSING', 'Common mass/weight/COG ledger is not available.');
  const validation = validateNonFeaMassLedger(ledger);
  if (!validation.ok) return blocked('MASS_LEDGER', 'MASS_LEDGER_INVALID', validation.errors.join(' '));
  const blockers = [];
  if (ledger.sourceSemanticHash !== sourceHash) blockers.push(issue('MASS_LEDGER_SOURCE_MISMATCH', 'Mass ledger is bound to a different source model.'));
  if (ledger.enrichmentProjectionSemanticHash !== projectionHash) blockers.push(issue('MASS_LEDGER_PROJECTION_MISMATCH', 'Mass ledger is bound to a different enriched projection.'));
  if (foundation?.loadPrimitiveSet?.semanticHash && ledger.loadPrimitiveSemanticHash !== foundation.loadPrimitiveSet.semanticHash) {
    blockers.push(issue('MASS_LEDGER_PRIMITIVE_MISMATCH', 'Mass ledger does not match the active W10.4 primitive set.'));
  }
  if (foundation?.loadCaseSet?.semanticHash && ledger.loadCaseSetSemanticHash !== foundation.loadCaseSet.semanticHash) {
    blockers.push(issue('MASS_LEDGER_CASE_SET_MISMATCH', 'Mass ledger does not match the active W10.4 Load Case set.'));
  }
  return blockers.length
    ? capability('MASS_LEDGER', 'BLOCKED', null, blockers)
    : ready('MASS_LEDGER', ledger.semanticHash, `${ledger.rows.length} mass ledger rows are current.`);
}

function topologyCapability(graph, sourceHash) {
  if (!graph) return blocked('TOPOLOGY_GRAPH', 'TOPOLOGY_GRAPH_MISSING', 'Governed topology graph is not available.');
  if (!validHash(graph.semanticHash)) return blocked('TOPOLOGY_GRAPH', 'TOPOLOGY_GRAPH_HASH_MISSING', 'Topology graph semantic hash is required.');
  if (graph.sharedModelSemanticHash !== sourceHash) {
    return blocked('TOPOLOGY_GRAPH', 'TOPOLOGY_SOURCE_MISMATCH', 'Topology graph is bound to a different shared model.');
  }
  return ready('TOPOLOGY_GRAPH', graph.semanticHash, 'Governed topology graph is current.');
}

function attachmentCapability(model, graph) {
  if (!model) return blocked('SUPPORT_ATTACHMENTS', 'SUPPORT_ATTACHMENT_MISSING', 'Support attachment model is not available.');
  if (!validHash(model.semanticHash)) return blocked('SUPPORT_ATTACHMENTS', 'SUPPORT_ATTACHMENT_HASH_MISSING', 'Support attachment semantic hash is required.');
  if (!graph || model.topologySemanticHash !== graph.semanticHash) {
    return blocked('SUPPORT_ATTACHMENTS', 'SUPPORT_ATTACHMENT_TOPOLOGY_MISMATCH', 'Support attachments do not match the active topology graph.');
  }
  return ready('SUPPORT_ATTACHMENTS', model.semanticHash, 'Exact support attachments are current.');
}

function restraintCapability(model, attachmentModel) {
  if (!model) return blocked('RESTRAINT_CAPABILITY', 'RESTRAINT_CAPABILITY_MISSING', 'Restraint capability model is not available.');
  if (!validHash(model.semanticHash)) return blocked('RESTRAINT_CAPABILITY', 'RESTRAINT_CAPABILITY_HASH_MISSING', 'Restraint capability semantic hash is required.');
  if (!attachmentModel || model.attachmentModelSemanticHash !== attachmentModel.semanticHash) {
    return blocked('RESTRAINT_CAPABILITY', 'RESTRAINT_ATTACHMENT_MISMATCH', 'Restraint capability does not match the active support attachments.');
  }
  return ready('RESTRAINT_CAPABILITY', model.semanticHash, 'Restraint capability authority is current.');
}

function verticalPathCapability(input) {
  if (!input.profile || !input.model) {
    return blocked('VERTICAL_LOAD_PATH', 'VERTICAL_LOAD_PATH_MISSING', 'Vertical load-path profile/model is not available.');
  }
  const profileValidation = validateVerticalLoadPathProfile(input.profile);
  const modelValidation = validateVerticalLoadPathModel(input.model);
  const blockers = [];
  if (!profileValidation.ok) blockers.push(issue('VERTICAL_LOAD_PATH_PROFILE_INVALID', profileValidation.errors.join(' ')));
  if (!modelValidation.ok) blockers.push(issue('VERTICAL_LOAD_PATH_MODEL_INVALID', modelValidation.errors.join(' ')));
  if (input.model.sharedModelSemanticHash !== input.sourceModelSemanticHash) blockers.push(issue('VERTICAL_LOAD_PATH_SOURCE_MISMATCH', 'Vertical load path is bound to a different shared model.'));
  if (!input.topologyGraph || input.model.topologySemanticHash !== input.topologyGraph.semanticHash) blockers.push(issue('VERTICAL_LOAD_PATH_TOPOLOGY_MISMATCH', 'Vertical load path does not match active topology.'));
  if (!input.supportAttachmentModel || input.model.attachmentModelSemanticHash !== input.supportAttachmentModel.semanticHash) blockers.push(issue('VERTICAL_LOAD_PATH_ATTACHMENT_MISMATCH', 'Vertical load path does not match active attachments.'));
  if (!input.restraintCapabilityModel || input.model.restraintModelSemanticHash !== input.restraintCapabilityModel.semanticHash) blockers.push(issue('VERTICAL_LOAD_PATH_RESTRAINT_MISMATCH', 'Vertical load path does not match active restraint capability.'));
  return blockers.length
    ? capability('VERTICAL_LOAD_PATH', 'BLOCKED', null, blockers)
    : ready('VERTICAL_LOAD_PATH', input.model.semanticHash, `${input.model.paths?.length || 0} vertical path candidates are current.`);
}

function contractCapability(capabilityId, value, label) {
  if (!value) return blocked(capabilityId, `${capabilityId}_MISSING`, `${label} is not available.`);
  if (!validHash(value.semanticHash)) return blocked(capabilityId, `${capabilityId}_HASH_MISSING`, `${label} semantic hash is required.`);
  return ready(capabilityId, value.semanticHash, `${label} is current.`);
}

function ready(capabilityId, semanticHashValue, message) {
  return capability(capabilityId, 'READY', semanticHashValue, [], message);
}
function blocked(capabilityId, code, message, details = null) {
  return capability(capabilityId, 'BLOCKED', null, [issue(code, message, details)]);
}
function capability(capabilityId, state, semanticHashValue, blockers, message = '') {
  return deepFreeze({ capabilityId, state, semanticHash: semanticHashValue, message, blockers });
}
function issue(code, message, details = null) { return deepFreeze({ code, message, details }); }
function issueOrder(left, right) { return `${left.capabilityId}|${left.code}`.localeCompare(`${right.capabilityId}|${right.code}`); }
function validHash(value) { return typeof value === 'string' && value.includes(':'); }
function requiredHash(value, field) {
  if (!validHash(value)) throw new TypeError(`${field} must be a namespaced semantic hash.`);
  return value;
}
function withoutHash(value) { const copy = structuredClone(value); delete copy.semanticHash; return copy; }
