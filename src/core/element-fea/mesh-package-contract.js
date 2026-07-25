import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { ELEMENT_TYPES, FORMULATIONS } from './constants.js';
import {
  CONSTRAINT_COMPONENT_TYPES, LOCAL_EDGE_IDS, MESH_ADAPTER_PROFILE_SCHEMA, MESH_COORDINATE_SYSTEM,
  MESH_PACKAGE_SCHEMA, MESH_PACKAGE_UNITS, SELECTOR_TYPES,
} from './mesh-package-constants.js';

const PACKAGE_KEYS = Object.freeze(['schema','packageIdentity','packageVersion','unitsIdentity','coordinateSystem','nodes','elements','materials','regions','boundaries','points','analysisDefinition','sourceReferences','semanticHash']);
const PROFILE_KEYS = Object.freeze(['schema','profileIdentity','coordinateAbsoluteTolerance','areaAbsoluteTolerance','jacobianAbsoluteTolerance','maximumNodes','maximumElements','maximumEdges','maximumRegions','maximumBoundaries','maximumPoints','maximumAssignments']);

export function createMeshAdapterProfile(input) {
  const row = record(input, 'adapter profile'); exactKeys(row, PROFILE_KEYS, 'adapter profile');
  if (row.schema !== MESH_ADAPTER_PROFILE_SCHEMA) throw failure('UNSUPPORTED_ADAPTER_PROFILE_SCHEMA', 'Invalid lfea-mesh-adapter-profile/v1 schema.');
  return deepFreeze({ schema: row.schema, profileIdentity: text(row.profileIdentity, 'profileIdentity'),
    coordinateAbsoluteTolerance: positive(row.coordinateAbsoluteTolerance, 'coordinateAbsoluteTolerance'),
    areaAbsoluteTolerance: positive(row.areaAbsoluteTolerance, 'areaAbsoluteTolerance'),
    jacobianAbsoluteTolerance: positive(row.jacobianAbsoluteTolerance, 'jacobianAbsoluteTolerance'),
    maximumNodes: positiveInteger(row.maximumNodes, 'maximumNodes'), maximumElements: positiveInteger(row.maximumElements, 'maximumElements'),
    maximumEdges: positiveInteger(row.maximumEdges, 'maximumEdges'), maximumRegions: positiveInteger(row.maximumRegions, 'maximumRegions'),
    maximumBoundaries: positiveInteger(row.maximumBoundaries, 'maximumBoundaries'), maximumPoints: positiveInteger(row.maximumPoints, 'maximumPoints'),
    maximumAssignments: positiveInteger(row.maximumAssignments, 'maximumAssignments') });
}

export function validateMeshAdapterProfile(input) {
  try { return deepFreeze({ ok: true, profile: createMeshAdapterProfile(input), diagnostics: [] }); }
  catch (error) { return deepFreeze({ ok: false, profile: null, diagnostics: [diagnostic(error)] }); }
}

export function createMeshPackage(input) {
  const source = record(input, 'mesh package'); exactKeys(source, PACKAGE_KEYS, 'mesh package');
  if (source.schema !== MESH_PACKAGE_SCHEMA) throw failure('UNSUPPORTED_PACKAGE_SCHEMA', 'Invalid lfea-mesh-package/v1 schema.');
  if (source.unitsIdentity !== MESH_PACKAGE_UNITS) throw failure('UNSUPPORTED_UNITS', `unitsIdentity must equal ${MESH_PACKAGE_UNITS}.`);
  if (source.coordinateSystem !== MESH_COORDINATE_SYSTEM) throw failure('UNSUPPORTED_COORDINATE_SYSTEM', `coordinateSystem must equal ${MESH_COORDINATE_SYSTEM}.`);
  const base = normalizePackage(source); const hash = semanticHash(base);
  if (source.semanticHash !== hash) throw failure('STALE_PACKAGE_SEMANTIC_HASH', 'Mesh-package semantic hash mismatch.');
  return deepFreeze({ ...base, semanticHash: hash });
}

export function validateMeshPackage(input) {
  try { return deepFreeze({ ok: true, package: createMeshPackage(input), diagnostics: [] }); }
  catch (error) { return deepFreeze({ ok: false, package: null, diagnostics: [diagnostic(error)] }); }
}

export function adapterFailure(code, message, details = null) { return failure(code, message, details); }
export function adapterDiagnostic(error, severity = 'ERROR') { return diagnostic(error, severity); }
export function compareIdentity(left, right) { return compare(left, right); }

function normalizePackage(source) {
  return { schema: MESH_PACKAGE_SCHEMA, packageIdentity: text(source.packageIdentity, 'packageIdentity'), packageVersion: text(source.packageVersion, 'packageVersion'),
    unitsIdentity: MESH_PACKAGE_UNITS, coordinateSystem: MESH_COORDINATE_SYSTEM,
    nodes: normalizeNodes(source.nodes), elements: normalizeElements(source.elements), materials: normalizeMaterials(source.materials),
    regions: normalizeRegions(source.regions), boundaries: normalizeBoundaries(source.boundaries), points: normalizePoints(source.points),
    analysisDefinition: normalizeAnalysis(source.analysisDefinition), sourceReferences: normalizeSourceReferences(source.sourceReferences) };
}

function normalizeNodes(value) {
  const rows = array(value, 'nodes').map((row) => { exactKeys(record(row, 'node'), ['nodeId','x','y','sourceEntityId','sourceSemanticHash'], 'node'); return { nodeId: text(row.nodeId,'nodeId'), x: canonicalNumber(row.x,'node.x'), y: canonicalNumber(row.y,'node.y'), sourceEntityId: text(row.sourceEntityId,'node.sourceEntityId'), sourceSemanticHash: text(row.sourceSemanticHash,'node.sourceSemanticHash') }; });
  unique(rows, 'nodeId', 'node'); if (!rows.length) throw failure('EMPTY_NODE_SET', 'At least one node is required.'); return sort(rows, 'nodeId');
}
function normalizeElements(value) {
  const rows = array(value, 'elements').map((row) => { exactKeys(record(row,'element'), ['elementId','elementType','nodeIds','sourceEntityId','sourceSemanticHash'], 'element');
    if (!Object.values(ELEMENT_TYPES).includes(row.elementType)) throw failure('UNSUPPORTED_ELEMENT_TYPE', `Unsupported element type: ${row.elementType}.`);
    const expected = row.elementType === ELEMENT_TYPES.Q4 ? 4 : 3; const nodeIds = textArray(row.nodeIds, 'element.nodeIds', false);
    if (nodeIds.length !== expected || new Set(nodeIds).size !== expected) throw failure('INVALID_ELEMENT_CONNECTIVITY', `${row.elementType} requires ${expected} distinct node identities.`);
    return { elementId:text(row.elementId,'elementId'), elementType:row.elementType, nodeIds, sourceEntityId:text(row.sourceEntityId,'element.sourceEntityId'), sourceSemanticHash:text(row.sourceSemanticHash,'element.sourceSemanticHash') }; });
  unique(rows,'elementId','element'); if (!rows.length) throw failure('EMPTY_ELEMENT_SET','At least one element is required.'); return sort(rows,'elementId');
}
function normalizeMaterials(value) {
  const rows = array(value,'materials').map((row) => { exactKeys(record(row,'material'), ['materialId','E','nu','sourceSemanticHash'], 'material'); const E=positive(row.E,'material.E'); const nu=finite(row.nu,'material.nu'); if (!(nu>-1&&nu<.5)) throw failure('INVALID_MATERIAL','Material nu must lie in (-1,0.5).'); return {materialId:text(row.materialId,'materialId'),E,nu,sourceSemanticHash:text(row.sourceSemanticHash,'material.sourceSemanticHash')}; });
  unique(rows,'materialId','material'); if(!rows.length)throw failure('EMPTY_MATERIAL_SET','At least one material is required.'); return sort(rows,'materialId');
}
function normalizeRegions(value) {
  const rows=array(value,'regions').map((row)=>{exactKeys(record(row,'region'),['regionId','elementIds','sourceEntityId','sourceSemanticHash'],'region');const elementIds=textArray(row.elementIds,'region.elementIds');if(!elementIds.length)throw failure('EMPTY_REGION','Regions cannot be empty.');return{regionId:text(row.regionId,'regionId'),elementIds,sourceEntityId:text(row.sourceEntityId,'region.sourceEntityId'),sourceSemanticHash:text(row.sourceSemanticHash,'region.sourceSemanticHash')};}); unique(rows,'regionId','region'); return sort(rows,'regionId');
}
function normalizeBoundaries(value) {
  const rows=array(value,'boundaries').map((row)=>{exactKeys(record(row,'boundary'),['boundaryId','edgeReferences','sourceEntityId','sourceSemanticHash'],'boundary');const refs=array(row.edgeReferences,'boundary.edgeReferences').map(edgeReference).sort(edgeCompare);if(!refs.length)throw failure('EMPTY_BOUNDARY','Boundaries cannot be empty.');const keys=refs.map(edgeReferenceKey);if(new Set(keys).size!==keys.length)throw failure('DUPLICATE_BOUNDARY_EDGE','A boundary cannot repeat an edge reference.');return{boundaryId:text(row.boundaryId,'boundaryId'),edgeReferences:refs,sourceEntityId:text(row.sourceEntityId,'boundary.sourceEntityId'),sourceSemanticHash:text(row.sourceSemanticHash,'boundary.sourceSemanticHash')};}); unique(rows,'boundaryId','boundary'); return sort(rows,'boundaryId');
}
function edgeReference(row){exactKeys(record(row,'edge reference'),['elementId','localEdgeId'],'edge reference');const elementId=text(row.elementId,'edgeReference.elementId');const localEdgeId=text(row.localEdgeId,'edgeReference.localEdgeId');if(![...LOCAL_EDGE_IDS.T3,...LOCAL_EDGE_IDS.Q4].includes(localEdgeId))throw failure('UNSUPPORTED_LOCAL_EDGE','Boundary localEdgeId is unsupported.');return{elementId,localEdgeId};}
function normalizePoints(value){const rows=array(value,'points').map((row)=>{exactKeys(record(row,'point'),['pointId','nodeId','sourceEntityId','sourceSemanticHash'],'point');return{pointId:text(row.pointId,'pointId'),nodeId:text(row.nodeId,'point.nodeId'),sourceEntityId:text(row.sourceEntityId,'point.sourceEntityId'),sourceSemanticHash:text(row.sourceSemanticHash,'point.sourceSemanticHash')};});unique(rows,'pointId','point');return sort(rows,'pointId');}
function normalizeAnalysis(value){const row=record(value,'analysisDefinition');exactKeys(row,['formulation','solverProfile','materialAssignments','thicknessAssignments','loadCase','constraints'],'analysisDefinition');if(!Object.values(FORMULATIONS).includes(row.formulation))throw failure('UNSUPPORTED_FORMULATION','Analysis formulation is unsupported.');return{formulation:row.formulation,solverProfile:record(row.solverProfile,'solverProfile'),materialAssignments:sort(normalizeMaterialAssignments(row.materialAssignments),'assignmentId'),thicknessAssignments:sort(normalizeThicknessAssignments(row.thicknessAssignments),'assignmentId'),loadCase:normalizeLoadCase(row.loadCase),constraints:sort(normalizeConstraints(row.constraints),'constraintId')};}
function normalizeMaterialAssignments(value){const rows=array(value,'materialAssignments').map((row)=>{exactKeys(record(row,'material assignment'),['assignmentId','regionId','materialId'],'material assignment');return{assignmentId:text(row.assignmentId,'materialAssignment.assignmentId'),regionId:text(row.regionId,'materialAssignment.regionId'),materialId:text(row.materialId,'materialAssignment.materialId')};});unique(rows,'assignmentId','material assignment');return rows;}
function normalizeThicknessAssignments(value){const rows=array(value,'thicknessAssignments').map((row)=>{exactKeys(record(row,'thickness assignment'),['assignmentId','regionId','thickness','sourceSemanticHash'],'thickness assignment');return{assignmentId:text(row.assignmentId,'thicknessAssignment.assignmentId'),regionId:text(row.regionId,'thicknessAssignment.regionId'),thickness:positive(row.thickness,'thicknessAssignment.thickness'),sourceSemanticHash:text(row.sourceSemanticHash,'thicknessAssignment.sourceSemanticHash')};});unique(rows,'assignmentId','thickness assignment');return rows;}
function normalizeLoadCase(value){const row=record(value,'loadCase');exactKeys(row,['loadCaseId','pointForces','boundaryTractions','boundaryPressures','sourceSemanticHash'],'loadCase');const pointForces=sort(normalizePointForces(row.pointForces),'loadId'),boundaryTractions=sort(normalizeTractions(row.boundaryTractions),'loadId'),boundaryPressures=sort(normalizePressures(row.boundaryPressures),'loadId');unique([...pointForces,...boundaryTractions,...boundaryPressures],'loadId','load');return{loadCaseId:text(row.loadCaseId,'loadCaseId'),pointForces,boundaryTractions,boundaryPressures,sourceSemanticHash:text(row.sourceSemanticHash,'loadCase.sourceSemanticHash')};}
function normalizePointForces(value){return array(value,'pointForces').map((row)=>{exactKeys(record(row,'point force'),['loadId','pointId','fx','fy','sourceSemanticHash'],'point force');return{loadId:text(row.loadId,'pointForce.loadId'),pointId:text(row.pointId,'pointForce.pointId'),fx:finite(row.fx,'pointForce.fx'),fy:finite(row.fy,'pointForce.fy'),sourceSemanticHash:text(row.sourceSemanticHash,'pointForce.sourceSemanticHash')};});}
function normalizeTractions(value){return array(value,'boundaryTractions').map((row)=>{exactKeys(record(row,'boundary traction'),['loadId','boundaryId','tx','ty','sourceSemanticHash'],'boundary traction');return{loadId:text(row.loadId,'traction.loadId'),boundaryId:text(row.boundaryId,'traction.boundaryId'),tx:finite(row.tx,'traction.tx'),ty:finite(row.ty,'traction.ty'),sourceSemanticHash:text(row.sourceSemanticHash,'traction.sourceSemanticHash')};});}
function normalizePressures(value){return array(value,'boundaryPressures').map((row)=>{exactKeys(record(row,'boundary pressure'),['loadId','boundaryId','pressure','sourceSemanticHash'],'boundary pressure');return{loadId:text(row.loadId,'pressure.loadId'),boundaryId:text(row.boundaryId,'pressure.boundaryId'),pressure:finite(row.pressure,'pressure.pressure'),sourceSemanticHash:text(row.sourceSemanticHash,'pressure.sourceSemanticHash')};});}
function normalizeConstraints(value){const rows=array(value,'constraints').map((row)=>{exactKeys(record(row,'constraint'),['constraintId','selectorType','selectorId','ux','uy','sourceSemanticHash'],'constraint');if(!Object.values(SELECTOR_TYPES).includes(row.selectorType))throw failure('UNSUPPORTED_SELECTOR_TYPE','Constraint selectorType is unsupported.');return{constraintId:text(row.constraintId,'constraintId'),selectorType:row.selectorType,selectorId:text(row.selectorId,'constraint.selectorId'),ux:constraintComponent(row.ux,'constraint.ux'),uy:constraintComponent(row.uy,'constraint.uy'),sourceSemanticHash:text(row.sourceSemanticHash,'constraint.sourceSemanticHash')};});unique(rows,'constraintId','constraint');return rows;}
function constraintComponent(value,name){const row=record(value,name);if(row.type===CONSTRAINT_COMPONENT_TYPES.PRESCRIBED){exactKeys(row,['type','value'],name);return{type:row.type,value:finite(row.value,`${name}.value`)};}exactKeys(row,['type'],name);if(![CONSTRAINT_COMPONENT_TYPES.FREE,CONSTRAINT_COMPONENT_TYPES.FIXED].includes(row.type))throw failure('UNSUPPORTED_CONSTRAINT_TYPE',`${name}.type is unsupported.`);return{type:row.type};}
function normalizeSourceReferences(value){const rows=array(value,'sourceReferences').map((row)=>{exactKeys(record(row,'source reference'),['sourceReferenceId','sourceType','sourceVersion','sourceSemanticHash'],'source reference');return{sourceReferenceId:text(row.sourceReferenceId,'sourceReferenceId'),sourceType:text(row.sourceType,'sourceType'),sourceVersion:text(row.sourceVersion,'sourceVersion'),sourceSemanticHash:text(row.sourceSemanticHash,'sourceReference.sourceSemanticHash')};});unique(rows,'sourceReferenceId','source reference');if(!rows.length)throw failure('EMPTY_SOURCE_REFERENCES','At least one source reference is required.');return sort(rows,'sourceReferenceId');}

function failure(code,message,details=null){const error=new TypeError(message);error.code=code;error.details=details;return error;}
function diagnostic(error,severity='ERROR'){return{code:error?.code||'MESH_PACKAGE_REJECTED',severity,message:String(error?.message||error),...(error?.details?{details:error.details}:{})};}
function record(value,name){if(!value||typeof value!=='object'||Array.isArray(value))throw failure('INVALID_RECORD',`${name} must be a record.`);return value;}
function array(value,name){if(!Array.isArray(value))throw failure('INVALID_ARRAY',`${name} must be an array.`);return value;}
function text(value,name){if(typeof value!=='string'||!value.trim())throw failure('INVALID_TEXT',`${name} is required.`);return value.trim();}
function finite(value,name){if(typeof value!=='number'||!Number.isFinite(value))throw failure('NONFINITE_VALUE',`${name} must be finite.`);return Object.is(value,-0)?0:value;}
function canonicalNumber(value,name){return finite(value,name);}
function positive(value,name){const result=finite(value,name);if(!(result>0))throw failure('NONPOSITIVE_VALUE',`${name} must be positive.`);return result;}
function positiveInteger(value,name){const result=positive(value,name);if(!Number.isInteger(result))throw failure('INVALID_INTEGER',`${name} must be an integer.`);return result;}
function textArray(value,name,canonical=true){const rows=array(value,name).map((item)=>text(item,name));if(new Set(rows).size!==rows.length)throw failure('DUPLICATE_IDENTITY',`${name} contains duplicate identities.`);return canonical?[...rows].sort(compare):rows;}
function exactKeys(value,allowed,name){const actual=Object.keys(value);const extras=actual.filter((key)=>!allowed.includes(key));const missing=allowed.filter((key)=>!Object.hasOwn(value,key));if(extras.length)throw failure('UNSUPPORTED_FIELD',`${name} contains unsupported fields: ${extras.sort(compare).join(', ')}.`);if(missing.length)throw failure('MISSING_FIELD',`${name} is missing required fields: ${missing.sort(compare).join(', ')}.`);}
function unique(rows,key,label){if(new Set(rows.map((row)=>row[key])).size!==rows.length)throw failure('DUPLICATE_IDENTITY',`Duplicate ${label} identity.`);}
function sort(rows,key){return[...rows].sort((a,b)=>compare(a[key],b[key]));}
function edgeCompare(a,b){return compare(a.elementId,b.elementId)||compare(a.localEdgeId,b.localEdgeId);}
function edgeReferenceKey(row){return`${row.elementId}:${row.localEdgeId}`;}
function compare(left,right){return left<right?-1:left>right?1:0;}
