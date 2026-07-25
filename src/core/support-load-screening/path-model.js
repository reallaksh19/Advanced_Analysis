import { deepFreeze, semanticHash, stringValue, validateSharedPipingModel } from '../shared-piping-model/index.js';
import { validatePipingPortTopologyGraph } from '../piping-topology/index.js';
import { validateRestraintCapabilityModel, validateSupportAttachmentModel } from '../support-restraints/index.js';
import { AUDIT_CODES, QUALIFICATION, VERTICAL_LOAD_PATH_MODEL_SCHEMA } from './constants.js';
import { diagnostic, diagnosticOrder } from './diagnostics.js';
import { qualifyAndOrderComponent } from './path-ordering.js';
import { validateVerticalLoadPathProfile } from './profile.js';
import { projectSupportStations } from './support-stations.js';

export function buildVerticalLoadPathModel(sharedModel, topologyGraph, attachmentModel, restraintModel, profile) {
  assertInputs(sharedModel, topologyGraph, attachmentModel, restraintModel, profile);
  const paths = topologyGraph.connectedComponents.map((connected) => buildPath(
    sharedModel, topologyGraph, attachmentModel, restraintModel, connected, profile,
  )).sort((left, right) => left.pathId.localeCompare(right.pathId));
  const diagnostics = modelDiagnostics(paths, topologyGraph.connectedComponents.length);
  const base = {
    schema: VERTICAL_LOAD_PATH_MODEL_SCHEMA,
    datasetId: topologyGraph.datasetId,
    sharedModelSemanticHash: sharedModel.semanticHash,
    topologySemanticHash: topologyGraph.semanticHash,
    attachmentModelSemanticHash: attachmentModel.semanticHash,
    restraintModelSemanticHash: restraintModel.semanticHash,
    profile,
    paths,
    diagnostics,
    summary: {
      pathCandidateCount: paths.length,
      qualifiedPathCount: paths.filter((row) => row.qualification === QUALIFICATION.READY).length,
      blockedPathCount: paths.filter((row) => row.qualification !== QUALIFICATION.READY).length,
      qualifiedSupportCount: paths.reduce((sum, row) => sum + row.qualifiedSupportKeys.length, 0),
      blockedSupportCount: paths.reduce((sum, row) => sum + row.blockedSupportKeys.length, 0),
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateVerticalLoadPathModel(model) {
  const errors = [];
  if (model?.schema !== VERTICAL_LOAD_PATH_MODEL_SCHEMA) errors.push('Invalid vertical-load-path model schema.');
  if (!stringValue(model?.datasetId)) errors.push('Vertical-load-path datasetId is required.');
  validateVerticalLoadPathProfile(model?.profile).errors.forEach((error) => errors.push(error));
  validatePaths(model?.paths, errors);
  if (model?.semanticHash !== semanticHash(withoutHash(model))) errors.push('Vertical-load-path semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function validatePaths(paths, errors) {
  if (!Array.isArray(paths)) return errors.push('Vertical-load-path paths must be an array.');
  const ids = paths.map((row) => stringValue(row?.pathId));
  if (ids.some((id) => !id)) errors.push('Vertical-load-path pathId is required.');
  if (new Set(ids).size !== ids.length) errors.push('Vertical-load-path IDs must be unique.');
  paths.forEach((row) => validatePath(row, errors));
}

function validatePath(path, errors) {
  if (!stringValue(path?.connectedComponentId)) errors.push(`Path ${path?.pathId || ''} connected-component ID is required.`);
  if (!Array.isArray(path?.orderedComponentKeys)) errors.push(`Path ${path?.pathId || ''} component order is required.`);
  if (!Array.isArray(path?.componentIntervals)) errors.push(`Path ${path?.pathId || ''} component intervals are required.`);
  if (!Array.isArray(path?.supportStations)) errors.push(`Path ${path?.pathId || ''} support stations are required.`);
  if (![QUALIFICATION.READY, QUALIFICATION.BLOCKED].includes(path?.qualification)) errors.push(`Path ${path?.pathId || ''} qualification is invalid.`);
  validateIntervals(path, errors);
  if (path?.semanticHash !== semanticHash(withoutHash(path))) errors.push(`Path ${path?.pathId || ''} semantic hash mismatch.`);
}

function validateIntervals(path, errors) {
  const intervals = path?.componentIntervals || [];
  const keys = intervals.map((row) => row.componentKey);
  if (new Set(keys).size !== keys.length) errors.push(`Path ${path?.pathId || ''} has duplicate component intervals.`);
  intervals.forEach((row) => {
    if (!(row.lengthM > 0) || !(row.endStationM > row.startStationM)) errors.push(`Path ${path?.pathId || ''} has invalid station interval.`);
    if (Math.abs((row.endStationM - row.startStationM) - row.lengthM) > 1e-9) errors.push(`Path ${path?.pathId || ''} interval length does not reconcile.`);
  });
}

function buildPath(sharedModel, graph, attachmentModel, restraintModel, connected, profile) {
  const ordered = qualifyAndOrderComponent(graph, sharedModel, connected);
  const identity = { connectedComponentId: connected.connectedComponentId, componentKeys: [...connected.componentKeys].sort() };
  const pathId = `vertical-path:${semanticHash(identity).split(':')[1]}`;
  if (!ordered.ok) return blockedPath(pathId, connected, ordered);
  const provisional = {
    pathId,
    connectedComponentId: connected.connectedComponentId,
    orientationBasis: 'LEXICOGRAPHICALLY_SMALLEST_TERMINAL_PORT',
    terminalStartKey: ordered.orientedPorts[0][0],
    terminalEndKey: ordered.orientedPorts.at(-1)[1],
    orderedComponentKeys: ordered.componentKeys,
    orderedConnectionIds: ordered.connectionIds,
    stationStartM: 0,
    stationEndM: ordered.stationEndM,
    componentIntervals: ordered.intervals,
  };
  const support = projectSupportStations(provisional, attachmentModel, restraintModel, profile);
  const diagnostics = [...ordered.diagnostics, ...support.diagnostics];
  const qualification = support.qualification;
  const base = {
    ...provisional,
    supportStations: support.supportStations,
    qualifiedSupportKeys: support.qualifiedSupportKeys,
    blockedSupportKeys: support.blockedSupportKeys,
    qualification,
    blockers: support.blockers,
    diagnostics,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function blockedPath(pathId, connected, ordered) {
  const base = {
    pathId,
    connectedComponentId: connected.connectedComponentId,
    orientationBasis: 'LEXICOGRAPHICALLY_SMALLEST_TERMINAL_PORT',
    terminalStartKey: null,
    terminalEndKey: null,
    orderedComponentKeys: [...connected.componentKeys].sort(),
    orderedConnectionIds: [...connected.connectionIds].sort(),
    stationStartM: null,
    stationEndM: null,
    componentIntervals: [],
    supportStations: [],
    qualifiedSupportKeys: [],
    blockedSupportKeys: [],
    qualification: QUALIFICATION.BLOCKED,
    blockers: [ordered.code],
    diagnostics: ordered.diagnostics,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function modelDiagnostics(paths, componentCount) {
  const rows = paths.flatMap((row) => row.diagnostics);
  if (componentCount > 1) rows.push(diagnostic(
    AUDIT_CODES.TOPOLOGY_DISCONNECTED,
    'topology',
    'Disconnected topology components are retained as separate path candidates.',
    { connectedComponentCount: componentCount },
    'INFO',
  ));
  return rows.sort(diagnosticOrder);
}

function assertInputs(sharedModel, graph, attachment, restraint, profile) {
  const validations = [
    ['shared-model', validateSharedPipingModel(sharedModel)],
    ['topology', validatePipingPortTopologyGraph(graph)],
    ['attachment', validateSupportAttachmentModel(attachment)],
    ['restraint', validateRestraintCapabilityModel(restraint)],
    ['profile', validateVerticalLoadPathProfile(profile)],
  ];
  validations.forEach(([label, validation]) => {
    if (!validation.ok) throw new TypeError(`Invalid ${label} input: ${validation.errors.join(' ')}`);
  });
  if (graph.sharedModelSemanticHash !== sharedModel.semanticHash) throw new TypeError('Topology does not match shared model.');
  if (attachment.topologySemanticHash !== graph.semanticHash) throw new TypeError('Attachment model does not match topology.');
  if (restraint.attachmentModelSemanticHash !== attachment.semanticHash) throw new TypeError('Restraint model does not match attachments.');
}
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
