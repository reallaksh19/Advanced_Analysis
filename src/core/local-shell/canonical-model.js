import { BASE_LIMITATIONS, MODEL_SCHEMA } from './constants.js';
import { ShellModelError } from './errors.js';
import { canonicalFacet, nodeBasisEvidence } from './geometry.js';
import { canonicalStringify, codeUnitCompare, deepFreeze, semanticHash, strictClone } from './json.js';
import { canonicalQualificationProfile } from './profile.js';
import {
  canonicalConstraint,
  canonicalElement,
  canonicalFormulation,
  canonicalLoadCase,
  canonicalMaterial,
  canonicalNode,
  canonicalResultRequests,
  canonicalUnits,
} from './canonical-records.js';
import { exactKeys, nonEmptyString, stringArray, uniqueBy } from './validation.js';

const SOURCE_KEYS = [
  'schema', 'modelIdentity', 'modelVersion', 'sourceAncestry', 'units', 'formulation',
  'materials', 'nodes', 'elements', 'constraints', 'loadCases', 'resultRequests',
  'qualificationProfile', 'limitations',
];
const MODEL_KEYS = [...SOURCE_KEYS, 'semanticHash'];

export function createCanonicalLocalShellModel(source) {
  const cloned = strictClone(source);
  const body = canonicalBody(cloned);
  return deepFreeze({ ...body, semanticHash: semanticHash(body) });
}

export function validateCanonicalLocalShellModel(model) {
  const cloned = strictClone(model);
  exactKeys(cloned, MODEL_KEYS, 'canonical model');
  const { semanticHash: retainedHash, ...source } = cloned;
  const body = canonicalBody(source);
  if (retainedHash !== semanticHash(body)) throw new ShellModelError('canonical model semanticHash does not reconstruct');
  if (canonicalStringify(body) !== canonicalStringify(source)) throw new ShellModelError('canonical model is not in canonical ordering');
  return deepFreeze({ ...body, semanticHash: retainedHash });
}

function canonicalBody(source) {
  exactKeys(source, SOURCE_KEYS, 'model source');
  if (source.schema !== MODEL_SCHEMA) throw new ShellModelError(`schema must be ${MODEL_SCHEMA}`);
  const qualificationProfile = canonicalQualificationProfile(source.qualificationProfile);
  const materials = mapArray(source.materials, canonicalMaterial, 'materials').sort(by('materialId'));
  const nodes = mapArray(source.nodes, canonicalNode, 'nodes').sort(by('nodeId'));
  uniqueBy(materials, 'materialId', 'materialId');
  uniqueBy(nodes, 'nodeId', 'nodeId');
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));
  const materialIds = new Set(materials.map((item) => item.materialId));
  nodes.forEach((node) => nodeBasisEvidence(node, qualificationProfile));
  const elements = canonicalElements(source.elements, nodeMap, materialIds, qualificationProfile);
  const constraints = canonicalConstraints(source.constraints, nodeMap);
  const loadCases = canonicalLoadCases(source.loadCases, nodeMap, new Set(elements.map((item) => item.elementId)));
  rejectUnreferencedNodes(nodes, elements);
  const limitations = canonicalLimitations(source.limitations);
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: nonEmptyString(source.modelIdentity, 'modelIdentity'),
    modelVersion: nonEmptyString(source.modelVersion, 'modelVersion'),
    sourceAncestry: canonicalStrings(source.sourceAncestry, 'sourceAncestry'),
    units: canonicalUnits(source.units),
    formulation: canonicalFormulation(source.formulation),
    materials,
    nodes,
    elements,
    constraints,
    loadCases,
    resultRequests: canonicalResultRequests(source.resultRequests),
    qualificationProfile,
    limitations,
  };
}

function canonicalElements(source, nodeMap, materialIds, profile) {
  const elements = mapArray(source, canonicalElement, 'elements');
  uniqueBy(elements, 'elementId', 'elementId');
  const sets = new Set();
  for (const element of elements) {
    for (const nodeId of element.nodeIds) if (!nodeMap.has(nodeId)) throw new ShellModelError(`Unresolved node ${nodeId}`);
    if (!materialIds.has(element.materialId)) throw new ShellModelError(`Unresolved material ${element.materialId}`);
    const key = [...element.nodeIds].sort(codeUnitCompare).join('\u0000');
    if (sets.has(key)) throw new ShellModelError(`Duplicate triangle ${key}`);
    sets.add(key);
    const canonical = canonicalFacet(element.nodeIds, nodeMap, profile, element.elementId);
    element.nodeIds = canonical.nodeIds;
  }
  return elements.sort(by('elementId'));
}

function canonicalConstraints(source, nodeMap) {
  const constraints = mapArray(source, canonicalConstraint, 'constraints').sort(by('constraintId'));
  uniqueBy(constraints, 'constraintId', 'constraintId');
  const targets = new Set();
  for (const constraint of constraints) {
    if (!nodeMap.has(constraint.nodeId)) throw new ShellModelError(`Unresolved constraint node ${constraint.nodeId}`);
    const target = `${constraint.nodeId}:${constraint.dof}`;
    if (targets.has(target)) throw new ShellModelError(`Duplicate prescribed DOF ${target}`);
    targets.add(target);
  }
  return constraints;
}

function canonicalLoadCases(source, nodeMap, elementIds) {
  const cases = mapArray(source, canonicalLoadCase, 'loadCases').sort(by('loadCaseId'));
  uniqueBy(cases, 'loadCaseId', 'loadCaseId');
  if (cases.length === 0) throw new ShellModelError('At least one explicit load case is required');
  for (const loadCase of cases) {
    for (const load of loadCase.nodalLoads) if (!nodeMap.has(load.nodeId)) throw new ShellModelError(`Unresolved nodal load node ${load.nodeId}`);
    for (const load of loadCase.pressureLoads) if (!elementIds.has(load.elementId)) throw new ShellModelError(`Unresolved pressure element ${load.elementId}`);
  }
  return cases;
}

function canonicalLimitations(source) {
  const values = canonicalStrings(source, 'limitations');
  for (const limitation of BASE_LIMITATIONS) if (!values.includes(limitation)) throw new ShellModelError(`Missing mandatory limitation ${limitation}`);
  return values;
}

function canonicalStrings(source, label) {
  const values = stringArray(source, label).sort(codeUnitCompare);
  if (new Set(values).size !== values.length) throw new ShellModelError(`${label} contains duplicates`);
  return values;
}

function rejectUnreferencedNodes(nodes, elements) {
  const referenced = new Set(elements.flatMap((element) => element.nodeIds));
  for (const node of nodes) if (!referenced.has(node.nodeId)) throw new ShellModelError(`Disconnected unreferenced node ${node.nodeId}`);
}

function mapArray(source, mapper, label) {
  if (!Array.isArray(source)) throw new ShellModelError(`${label} must be an array`);
  return source.map(mapper);
}

function by(field) {
  return (left, right) => codeUnitCompare(left[field], right[field]);
}
