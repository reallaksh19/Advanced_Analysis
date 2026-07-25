import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { validateWorkspaceConsumerContext } from '../workspace-consumers/index.js';
import {
  THREE_D_CALCULATION_ASSUMPTIONS, THREE_D_CALCULATION_LIMITATIONS,
  THREE_D_CALCULATION_REVIEW_MODEL_SCHEMA, THREE_D_DIAGNOSTIC_CODES,
} from './constants.js';
import { projectComponents, projectModelSummary, projectPorts } from './projection-model.js';
import { projectConnections, projectTopologyComponents, projectTopologyDiagnostics } from './projection-topology.js';
import { projectRestraintCapabilities, projectSupportAttachments } from './projection-support.js';
import { projectFlexuralProperties, projectLoadPrimitives, projectVerticalBeamCases } from './projection-optional.js';

const BEAM_CONTRACT_KEYS = Object.freeze([
  'flexuralPropertyProjection',
  'verticalBeamModel',
  'verticalBeamSolution',
  'verticalBeamSolverAudit',
]);

export function createThreeDCalculationReviewModel(context) {
  assertContext(context);
  const required = requiredEvidence(context);
  const load = optionalLoadEvidence(context);
  const beam = optionalBeamEvidence(context, required);
  const diagnostics = canonicalDiagnostics([
    ...projectTopologyDiagnostics(required.topologyGraph, required.topologyAudit),
    ...load.diagnostics,
    ...beam.diagnostics,
  ]);
  const identity = reviewIdentity(context, required, load.evidence, beam.evidence, diagnostics);
  const reviewModelId = `three-d-calculation-review-model:${semanticHash(identity).split(':')[1]}`;
  const payload = { ...identity, reviewModelId };
  return deepFreeze({ ...payload, sourceContext: context, semanticHash: semanticHash(payload) });
}

export function validateThreeDCalculationReviewModel(value) {
  const errors = [];
  if (value?.schema !== THREE_D_CALCULATION_REVIEW_MODEL_SCHEMA) errors.push('Invalid three-dimensional calculation review-model schema.');
  if (!value?.sourceContext) errors.push('Three-dimensional calculation review-model source context is required.');
  if (!errors.length) compareReconstructedModel(value, errors);
  return deepFreeze({ ok: errors.length === 0, errors });
}

function compareReconstructedModel(value, errors) {
  try {
    const expected = createThreeDCalculationReviewModel(value.sourceContext);
    if (value.sourceContext !== expected.sourceContext) errors.push('Three-dimensional review-model source context reference mismatch.');
    if (canonicalStringify(contractPayload(value)) !== canonicalStringify(contractPayload(expected))) {
      errors.push('Three-dimensional review model does not match exact source evidence.');
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
}

function reviewIdentity(context, required, load, beam, diagnostics) {
  const components = projectComponents(required.sharedModel);
  const ports = projectPorts(required.topologyGraph);
  const connections = projectConnections(required.topologyGraph);
  const topologyComponents = projectTopologyComponents(required.topologyGraph, required.topologyAudit);
  const supportAttachments = projectSupportAttachments(required.attachmentModel);
  const restraintCapabilities = projectRestraintCapabilities(required.restraintModel);
  const loadPrimitives = load ? projectLoadPrimitives(load) : deepFreeze([]);
  const flexuralProperties = beam ? projectFlexuralProperties(beam.projection) : deepFreeze([]);
  const verticalBeamCases = beam ? projectVerticalBeamCases(beam.model, beam.solution, beam.audit) : deepFreeze([]);
  return {
    schema: THREE_D_CALCULATION_REVIEW_MODEL_SCHEMA,
    datasetId: context.datasetId,
    contextSemanticHash: context.semanticHash,
    sourceReferences: sourceReferences(required, load, beam),
    modelSummary: projectModelSummary(required.sharedModel, required.topologyGraph),
    components, ports, connections, topologyComponents, supportAttachments, restraintCapabilities,
    loadPrimitives, flexuralProperties, verticalBeamCases,
    assumptions: THREE_D_CALCULATION_ASSUMPTIONS,
    limitations: THREE_D_CALCULATION_LIMITATIONS,
    diagnostics,
    summary: summary(components, ports, connections, topologyComponents, supportAttachments,
      restraintCapabilities, loadPrimitives, flexuralProperties, verticalBeamCases),
  };
}

function requiredEvidence(context) {
  const contracts = context.contracts;
  const required = {
    sharedModel: contracts.sharedModel,
    topologyGraph: contracts.topologyGraph,
    topologyAudit: contracts.topologyAudit,
    attachmentModel: contracts.supportAttachmentModel,
    attachmentAudit: contracts.supportAttachmentAudit,
    restraintModel: contracts.restraintCapabilityModel,
    restraintAudit: contracts.restraintCapabilityAudit,
  };
  if (Object.values(required).some((value) => !value)) {
    throw new TypeError('Complete W10.1-W10.3 evidence is required.');
  }
  validateRequiredLinks(required, context.datasetId);
  return required;
}

function validateRequiredLinks(evidence, datasetId) {
  if ([evidence.topologyGraph, evidence.attachmentModel, evidence.restraintModel]
    .some((row) => row.datasetId !== datasetId) || evidence.sharedModel.project.datasetId !== datasetId) {
    throw new TypeError('Required evidence dataset mismatch.');
  }
  if (evidence.topologyGraph.sharedModelSemanticHash !== evidence.sharedModel.semanticHash
    || evidence.topologyAudit.modelSemanticHash !== evidence.sharedModel.semanticHash) {
    throw new TypeError('Topology evidence does not match the shared model.');
  }
  if (evidence.topologyGraph.topologyAudit.semanticHash !== evidence.topologyAudit.semanticHash) {
    throw new TypeError('Topology audit does not match the topology graph.');
  }
  validateSupportLinks(evidence);
}

function validateSupportLinks(evidence) {
  if (evidence.attachmentModel.sharedModelSemanticHash !== evidence.sharedModel.semanticHash
    || evidence.attachmentModel.topologySemanticHash !== evidence.topologyGraph.semanticHash) {
    throw new TypeError('Support attachment evidence is stale.');
  }
  if (evidence.attachmentModel.attachmentAudit.semanticHash !== evidence.attachmentAudit.semanticHash) {
    throw new TypeError('Support attachment audit mismatch.');
  }
  if (evidence.restraintModel.attachmentModelSemanticHash !== evidence.attachmentModel.semanticHash
    || evidence.restraintModel.restraintAudit.semanticHash !== evidence.restraintAudit.semanticHash) {
    throw new TypeError('Restraint evidence is stale.');
  }
}

function optionalLoadEvidence(context) {
  const primitiveSet = context.contracts.loadPrimitiveSet;
  if (!primitiveSet) return missingOptionalLoad(context);
  try {
    if (primitiveSet.datasetId !== context.datasetId) throw new TypeError('Model-load primitive dataset mismatch.');
    if (!context.contracts.loadCaseSet
      || primitiveSet.loadCaseSetSemanticHash !== context.contracts.loadCaseSet.semanticHash) {
      throw new TypeError('Model-load primitive set does not match load-case evidence.');
    }
    return { evidence: primitiveSet, diagnostics: [] };
  } catch (error) {
    return excluded(THREE_D_DIAGNOSTIC_CODES.OPTIONAL_MODEL_LOAD_INVALID, error);
  }
}

function missingOptionalLoad(context) {
  const diagnostic = rejectedContractDiagnostic(context, 'loadPrimitiveSet');
  return diagnostic
    ? excluded(THREE_D_DIAGNOSTIC_CODES.OPTIONAL_MODEL_LOAD_INVALID, new Error(diagnostic.message))
    : { evidence: null, diagnostics: [] };
}

function optionalBeamEvidence(context, required) {
  const values = {
    projection: context.contracts.flexuralPropertyProjection,
    model: context.contracts.verticalBeamModel,
    solution: context.contracts.verticalBeamSolution,
    audit: context.contracts.verticalBeamSolverAudit,
  };
  const present = Object.values(values).filter(Boolean).length;
  const rejected = BEAM_CONTRACT_KEYS.map((key) => rejectedContractDiagnostic(context, key)).find(Boolean);
  if (!present && !rejected) return { evidence: null, diagnostics: [] };
  if (rejected) {
    return excluded(THREE_D_DIAGNOSTIC_CODES.OPTIONAL_VERTICAL_BEAM_INVALID, new Error(rejected.message));
  }
  if (present !== BEAM_CONTRACT_KEYS.length) {
    return excluded(THREE_D_DIAGNOSTIC_CODES.OPTIONAL_VERTICAL_BEAM_INCOMPLETE,
      new Error('Optional W10.6 evidence is incomplete.'));
  }
  try {
    validateBeamLinks(values, required, context);
    return { evidence: values, diagnostics: [] };
  } catch (error) {
    return excluded(THREE_D_DIAGNOSTIC_CODES.OPTIONAL_VERTICAL_BEAM_INVALID, error);
  }
}

function validateBeamLinks(evidence, required, context) {
  if (Object.values(evidence).some((row) => row.datasetId !== context.datasetId)) {
    throw new TypeError('Vertical-beam evidence dataset mismatch.');
  }
  if (evidence.projection.sharedModelSemanticHash !== required.sharedModel.semanticHash) {
    throw new TypeError('Flexural projection does not match the shared model.');
  }
  if (!context.contracts.verticalLoadPathModel
    || evidence.projection.pathModelSemanticHash !== context.contracts.verticalLoadPathModel.semanticHash) {
    throw new TypeError('Flexural projection does not match vertical-load-path evidence.');
  }
  if (evidence.model.flexuralProjectionSemanticHash !== evidence.projection.semanticHash) {
    throw new TypeError('Vertical-beam model does not match flexural evidence.');
  }
  if (evidence.solution.beamModelSemanticHash !== evidence.model.semanticHash
    || evidence.audit.solutionSemanticHash !== evidence.solution.semanticHash) {
    throw new TypeError('Vertical-beam solution/audit evidence is stale.');
  }
}

function sourceReferences(required, load, beam) {
  return deepFreeze({
    sharedModelSemanticHash: required.sharedModel.semanticHash,
    topologyGraphSemanticHash: required.topologyGraph.semanticHash,
    topologyAuditSemanticHash: required.topologyAudit.semanticHash,
    supportAttachmentModelSemanticHash: required.attachmentModel.semanticHash,
    supportAttachmentAuditSemanticHash: required.attachmentAudit.semanticHash,
    restraintCapabilityModelSemanticHash: required.restraintModel.semanticHash,
    restraintCapabilityAuditSemanticHash: required.restraintAudit.semanticHash,
    loadPrimitiveSetSemanticHash: load?.semanticHash || null,
    flexuralPropertyProjectionSemanticHash: beam?.projection.semanticHash || null,
    verticalBeamModelSemanticHash: beam?.model.semanticHash || null,
    verticalBeamSolutionSemanticHash: beam?.solution.semanticHash || null,
    verticalBeamSolverAuditSemanticHash: beam?.audit.semanticHash || null,
  });
}

function summary(...rows) {
  const [components, ports, connections, topology, attachments, restraints, loads, flexural, beam] = rows;
  return deepFreeze({
    componentCount: components.length,
    portCount: ports.length,
    connectionCount: connections.length,
    topologyComponentCount: topology.length,
    supportAttachmentCount: attachments.length,
    restraintCapabilityCount: restraints.length,
    loadPrimitiveCount: loads.length,
    flexuralPropertyCount: flexural.length,
    verticalBeamCaseCount: beam.length,
    optionalModelLoadsIncluded: loads.length > 0,
    optionalVerticalBeamIncluded: beam.length > 0,
  });
}

function rejectedContractDiagnostic(context, contractKey) {
  return context.diagnostics.find((row) => row.contractKey === contractKey) || null;
}
function excluded(code, error) {
  return { evidence: null, diagnostics: [deepFreeze({
    code,
    severity: 'WARNING',
    scope: 'OPTIONAL_EVIDENCE',
    message: error instanceof Error ? error.message : String(error),
  })] };
}
function canonicalDiagnostics(rows) {
  return deepFreeze([...rows].sort((left, right) => (
    `${left.scope}|${left.code}|${left.message}`.localeCompare(`${right.scope}|${right.code}|${right.message}`)
  )));
}
function assertContext(context) {
  const validation = validateWorkspaceConsumerContext(context);
  if (!validation.ok) throw new TypeError(`Invalid workspace consumer context: ${validation.errors.join(' ')}`);
}
function contractPayload(value) {
  const { sourceContext: _sourceContext, ...payload } = value || {};
  return payload;
}
