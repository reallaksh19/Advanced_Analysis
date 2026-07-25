import { createContinuumModel } from './model.js';
import { createMeshAdapterProfile, createMeshPackage, adapterDiagnostic } from './mesh-package-contract.js';
import { buildMeshPackageTopology } from './mesh-package-topology.js';
import { resolveMeshPackageEntities } from './mesh-package-entities.js';
import { resolveMeshPackageAssignments } from './mesh-package-assignments.js';
import { createAcceptedMeshAdapterResult, createRejectedMeshAdapterResult } from './mesh-package-result.js';

export function adaptMeshPackage(packageInput, profileInput) {
  let pkg=null,profile=null,topology=null;
  try{
    profile=createMeshAdapterProfile(profileInput); pkg=createMeshPackage(packageInput);
    topology=buildMeshPackageTopology(pkg,profile);
    const entities=resolveMeshPackageEntities(pkg,topology);
    const assignments=resolveMeshPackageAssignments(pkg,topology,entities);
    const qualifiedModel=createContinuumModel(assignments.modelInput);
    return createAcceptedMeshAdapterResult({sourcePackageIdentity:pkg.packageIdentity,sourcePackageVersion:pkg.packageVersion,sourcePackageSemanticHash:pkg.semanticHash,adapterProfileIdentity:profile.profileIdentity,qualifiedModel,topologyEvidence:topology.topologyEvidence,entityEvidence:entities.entityEvidence,assignmentEvidence:assignments.assignmentEvidence,mappingLedger:[...entities.mappingLedger,...assignments.mappingLedger],diagnostics:topology.diagnostics});
  }catch(error){
    return createRejectedMeshAdapterResult({sourcePackageIdentity:pkg?.packageIdentity||safeText(packageInput?.packageIdentity),sourcePackageVersion:pkg?.packageVersion||safeText(packageInput?.packageVersion),sourcePackageSemanticHash:pkg?.semanticHash||safeText(packageInput?.semanticHash),adapterProfileIdentity:profile?.profileIdentity||safeText(profileInput?.profileIdentity),topologyEvidence:topology?.topologyEvidence||null,diagnostics:[adapterDiagnostic(error)]});
  }
}
function safeText(value){return typeof value==='string'&&value.trim()?value.trim():null;}
