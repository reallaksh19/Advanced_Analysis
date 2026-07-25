import assert from 'node:assert/strict';
import {
  MAPPING_STATUS, MESH_ADAPTER_PROFILE_SCHEMA, MESH_ADAPTER_RESULT_SCHEMA, MESH_ADAPTER_STATUS,
  MESH_COORDINATE_SYSTEM, MESH_PACKAGE_SCHEMA, MESH_PACKAGE_UNITS, adaptMeshPackage,
  createMeshAdapterProfile, createMeshPackage, validateMeshAdapterProfile, validateMeshAdapterResult, validateMeshPackage,
} from '../src/core/element-fea/index.js';
import { adapterProfile, clone, rectangularQ4Package, resealPackage } from './lfea-005-fixtures.mjs';

const profile=createMeshAdapterProfile(adapterProfile());
assert.equal(profile.schema,MESH_ADAPTER_PROFILE_SCHEMA);assert.ok(Object.isFrozen(profile));
assert.equal(validateMeshAdapterProfile(profile).ok,true);
const source=rectangularQ4Package();const pkg=createMeshPackage(source);
assert.equal(pkg.schema,MESH_PACKAGE_SCHEMA);assert.equal(pkg.unitsIdentity,MESH_PACKAGE_UNITS);assert.equal(pkg.coordinateSystem,MESH_COORDINATE_SYSTEM);
assert.equal(validateMeshPackage(pkg).ok,true);assert.ok(Object.isFrozen(pkg));assert.ok(Object.isFrozen(pkg.nodes));
const result=adaptMeshPackage(source,profile);
assert.equal(result.schema,MESH_ADAPTER_RESULT_SCHEMA);assert.equal(result.status,MESH_ADAPTER_STATUS.ACCEPTED);assert.equal(result.qualifiedModel.schema,'fea-continuum-model/v1');
assert.equal(result.qualifiedModelSemanticHash,result.qualifiedModel.semanticHash);assert.equal(result.sourcePackageSemanticHash,pkg.semanticHash);assert.equal(validateMeshAdapterResult(result).ok,true);
assert.ok(result.mappingLedger.length>0);assert.ok(result.mappingLedger.every((row)=>row.mappingStatus===MAPPING_STATUS));assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.qualifiedModel));assert.ok(Object.isFrozen(result.mappingLedger));
const extra=clone(source);extra.thirdPartyFormat='GMSH';extra.semanticHash=source.semanticHash;const rejected=adaptMeshPackage(extra,profile);assert.equal(rejected.status,MESH_ADAPTER_STATUS.REJECTED);assert.equal(rejected.qualifiedModel,null);assert.equal(rejected.qualifiedModelSemanticHash,null);assert.equal(rejected.mappingLedger.length,0);assert.equal(validateMeshAdapterResult(rejected).ok,true);
const changed=clone(source);changed.packageIdentity='OTHER';const stale=adaptMeshPackage(changed,profile);assert.equal(stale.status,MESH_ADAPTER_STATUS.REJECTED);assert.equal(stale.diagnostics[0].code,'STALE_PACKAGE_SEMANTIC_HASH');
const rebuilt=resealPackage(changed);assert.equal(adaptMeshPackage(rebuilt,profile).status,MESH_ADAPTER_STATUS.ACCEPTED);
console.log(`LFEA-005 closed package/profile/result contracts passed: ${result.semanticHash}`);
