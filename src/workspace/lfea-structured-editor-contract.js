import {
  CONSTRAINT_COMPONENT_TYPES,
  ELEMENT_TYPES,
  LOCAL_EDGE_IDS,
  SELECTOR_TYPES,
} from '../core/element-fea/index.js';

export const LFEA_EDITOR_ENUMS = Object.freeze({
  elementTypes: Object.freeze(Object.values(ELEMENT_TYPES)),
  selectorTypes: Object.freeze(Object.values(SELECTOR_TYPES)),
  constraintComponentTypes: Object.freeze(Object.values(CONSTRAINT_COMPONENT_TYPES)),
  localEdgeIds: Object.freeze({
    T3: LOCAL_EDGE_IDS.T3,
    Q4: LOCAL_EDGE_IDS.Q4,
  }),
});

export const LFEA_STRUCTURED_EDITOR_CONTRACTS = Object.freeze({
  nodes: contract('Node', [
    text('nodeId', 'Node ID'),
    number('x', 'X'),
    number('y', 'Y'),
    text('sourceEntityId', 'Source entity ID'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  elements: contract('Element', [
    text('elementId', 'Element ID'),
    enumField('elementType', 'Element type', LFEA_EDITOR_ENUMS.elementTypes),
    nodeSlots('nodeIds', 'Connectivity'),
    text('sourceEntityId', 'Source entity ID'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  materials: contract('Material', [
    text('materialId', 'Material ID'),
    number('E', 'Elastic modulus E'),
    number('nu', 'Poisson ratio nu'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  regions: contract('Region', [
    text('regionId', 'Region ID'),
    multiReference('elementIds', 'Elements', 'elements', 'elementId'),
    text('sourceEntityId', 'Source entity ID'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  boundaries: contract('Boundary', [
    text('boundaryId', 'Boundary ID'),
    edgeReferences('edgeReferences', 'Boundary edges'),
    text('sourceEntityId', 'Source entity ID'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  points: contract('Point', [
    text('pointId', 'Point ID'),
    reference('nodeId', 'Node', 'nodes', 'nodeId'),
    text('sourceEntityId', 'Source entity ID'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  'analysisDefinition.materialAssignments': contract('Material assignment', [
    text('assignmentId', 'Assignment ID'),
    reference('regionId', 'Region', 'regions', 'regionId'),
    reference('materialId', 'Material', 'materials', 'materialId'),
  ]),
  'analysisDefinition.thicknessAssignments': contract('Thickness assignment', [
    text('assignmentId', 'Assignment ID'),
    reference('regionId', 'Region', 'regions', 'regionId'),
    number('thickness', 'Thickness'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  'analysisDefinition.loadCase.pointForces': contract('Point force', [
    text('loadId', 'Load ID'),
    reference('pointId', 'Point', 'points', 'pointId'),
    number('fx', 'Fx'),
    number('fy', 'Fy'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  'analysisDefinition.loadCase.boundaryTractions': contract('Boundary traction', [
    text('loadId', 'Load ID'),
    reference('boundaryId', 'Boundary', 'boundaries', 'boundaryId'),
    number('tx', 'Tx'),
    number('ty', 'Ty'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  'analysisDefinition.loadCase.boundaryPressures': contract('Boundary pressure', [
    text('loadId', 'Load ID'),
    reference('boundaryId', 'Boundary', 'boundaries', 'boundaryId'),
    number('pressure', 'Pressure'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
  'analysisDefinition.constraints': contract('Constraint', [
    text('constraintId', 'Constraint ID'),
    enumField('selectorType', 'Selector type', LFEA_EDITOR_ENUMS.selectorTypes),
    selectorReference('selectorId', 'Selector'),
    constraintComponent('ux', 'UX'),
    constraintComponent('uy', 'UY'),
    text('sourceSemanticHash', 'Source semantic hash'),
  ]),
});

export function lfeaStructuredEditorContract(path) {
  return LFEA_STRUCTURED_EDITOR_CONTRACTS[path] ?? null;
}

export function lfeaReferenceValues(packageValue, path, key) {
  const rows = valueAtPath(packageValue, path);
  return rows.map((row) => row?.[key]).filter((value) => typeof value === 'string');
}

export function lfeaElementType(packageValue, elementId) {
  return packageValue?.elements?.find((row) => row.elementId === elementId)?.elementType ?? null;
}

export function lfeaEditorGuard(state, path, index) {
  return Object.freeze({
    semanticHash: state.packageValue?.semanticHash ?? null,
    modelVersion: state.modelVersion,
    path,
    index,
  });
}

export function isLfeaEditorGuardCurrent(guard, state, path, index) {
  return Boolean(guard)
    && guard.semanticHash === (state?.packageValue?.semanticHash ?? null)
    && guard.modelVersion === state?.modelVersion
    && guard.path === path
    && guard.index === index;
}

function contract(label, fields) {
  return Object.freeze({ label, fields: Object.freeze(fields) });
}
function field(name, label, kind, extra = {}) {
  return Object.freeze({ name, label, kind, ...extra });
}
function text(name, label) { return field(name, label, 'text'); }
function number(name, label) { return field(name, label, 'number'); }
function enumField(name, label, options) { return field(name, label, 'enum', { options }); }
function reference(name, label, path, key) { return field(name, label, 'reference', { reference: { path, key } }); }
function multiReference(name, label, path, key) { return field(name, label, 'multi-reference', { reference: { path, key } }); }
function nodeSlots(name, label) { return field(name, label, 'node-slots'); }
function edgeReferences(name, label) { return field(name, label, 'edge-references'); }
function selectorReference(name, label) { return field(name, label, 'selector-reference'); }
function constraintComponent(name, label) { return field(name, label, 'constraint-component'); }

function valueAtPath(value, path) {
  const rows = path.split('.').reduce((current, key) => current?.[key], value);
  return Array.isArray(rows) ? rows : [];
}
