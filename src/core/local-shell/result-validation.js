import { ENGINEERING_LEVEL, FORMULATION, QUALIFICATION_STATES, RESULT_SCHEMA } from './constants.js';
import { ShellModelError } from './errors.js';
import { canonicalStringify, deepFreeze, strictClone } from './json.js';
import { reconstructShellResultHashes } from './result-hashes.js';
import { exactKeys } from './validation.js';

const BASE = ['schema','modelIdentity','modelVersion','sourceAncestry','formulation','engineeringLevel','qualification','canonicalModelSemanticHash','formulaTrace','diagnostics','limitations','semanticHashes'];
const ACCEPTED = [...BASE, 'meshEvidence', 'loadCaseResults'];
const ELEMENT = ['elementId','nodeIds','materialId','thickness','area','geometryScale','localCoordinates','localFrame','frameResidual','directorAlignment','areaQualification','membraneBMatrix','membraneMaterialMatrix','membraneConstitutiveMatrix','bendingConstitutiveMatrix','dktFormulation','dktRotationInterpolation','dktIntegrationPoints','membraneStiffness','bendingStiffness','combinedLocalStiffness','nodalBasisTransformation','globalStiffness','localDofOrdering','globalDofOrdering','qualification','sourceReferences','formulaIds'];
const CASE = ['loadCaseId','nodalDisplacements','reactions','freeDofIdentities','constrainedDofIdentities','solverEvidence','freeDofResiduals','freeDofResidualQualification','forceEquilibrium','momentEquilibrium','appliedLoadEvidence','elementResults','membraneStrainEnergy','bendingStrainEnergy','totalStrainEnergy','globalStrainEnergy','externalWorkIncludingPrescribedReactions','energyQualification','qualification','formulaIds'];
const ELEMENT_RESULT = ['elementId','localGeneralizedDisplacement','membraneStrain','membraneStress','integrationPoints','membraneStrainEnergy','bendingStrainEnergy','totalStrainEnergy','sourceReferences','formulaIds'];

export function validateLocalShellResult(result) {
  const value = strictClone(result);
  const accepted = value.qualification?.state === QUALIFICATION_STATES.ACCEPTED;
  exactKeys(value, accepted ? ACCEPTED : BASE, 'local-shell result');
  validateHeader(value);
  accepted ? validateAccepted(value) : validateRejected(value);
  const hashes = reconstructShellResultHashes(value);
  if (canonicalStringify(hashes) !== canonicalStringify(value.semanticHashes)) throw new ShellModelError('local-shell result semantic hashes do not reconstruct');
  return deepFreeze(value);
}

function validateHeader(value) {
  if (value.schema !== RESULT_SCHEMA) throw new ShellModelError(`result.schema must be ${RESULT_SCHEMA}`);
  if (![FORMULATION, null].includes(value.formulation)) throw new ShellModelError('result.formulation is invalid');
  if (value.engineeringLevel !== ENGINEERING_LEVEL) throw new ShellModelError('result.engineeringLevel is invalid');
  exactKeys(value.qualification, ['state','engineeringLevel','accepted','summary'], 'qualification');
  if (!Object.values(QUALIFICATION_STATES).includes(value.qualification.state)) throw new ShellModelError('qualification.state is invalid');
  if (value.qualification.engineeringLevel !== ENGINEERING_LEVEL) throw new ShellModelError('qualification.engineeringLevel is invalid');
  exactKeys(value.semanticHashes, ['sourceEvidenceSemanticHash','canonicalModelSemanticHash','loadCaseInputSemanticHash','resultPayloadSemanticHash','executionEvidenceHash','qualificationEvidenceHash'], 'semanticHashes');
  value.diagnostics.forEach((row, i) => exactKeys(row, ['code','message'], `diagnostics[${i}]`));
}

function validateAccepted(value) {
  validateMesh(value.meshEvidence);
  value.loadCaseResults.forEach((row, i) => validateCase(row, `loadCaseResults[${i}]`));
}

function validateMesh(mesh) {
  exactKeys(mesh, ['dofOrdering','nodeBasisQualification','elements','globalStiffness','globalStiffnessSymmetry','elementAssembly','formulaIds'], 'meshEvidence');
  mesh.nodeBasisQualification.forEach((row, i) => {
    exactKeys(row, ['nodeId','unitLength','orthogonality','handedness'], `nodeBasisQualification[${i}]`);
    ['unitLength','orthogonality','handedness'].forEach((field) => tolerance(row[field], `${field}[${i}]`));
  });
  mesh.elements.forEach((row, i) => validateElement(row, `elements[${i}]`));
  mesh.elementAssembly.forEach((row, i) => exactKeys(row, ['elementId','globalDofIndices'], `elementAssembly[${i}]`));
  tolerance(mesh.globalStiffnessSymmetry, 'globalStiffnessSymmetry');
}

function validateElement(row, label) {
  exactKeys(row, ELEMENT, label);
  exactKeys(row.localFrame, ['ex','ey','ez','area','edge12','edge13'], `${label}.localFrame`);
  row.directorAlignment.forEach((item, i) => minimum(item, `${label}.directorAlignment[${i}]`));
  tolerance(row.areaQualification, `${label}.areaQualification`);
  row.dktIntegrationPoints.forEach((item, i) => exactKeys(item, ['integrationPointId','barycentric','weight','areaWeight','bendingBMatrix'], `${label}.dktIntegrationPoints[${i}]`));
  exactKeys(row.nodalBasisTransformation, ['matrix','rotationMapping','tangentSampling','desiredRigid','eigenvalues','rank','rankTolerance','rigidReproduction'], `${label}.nodalBasisTransformation`);
  tolerance(row.nodalBasisTransformation.rigidReproduction, `${label}.rigidReproduction`);
  validateElementQualification(row.qualification, `${label}.qualification`);
}

function validateElementQualification(row, label) {
  const fields = ['membraneConstitutiveSymmetry','bendingConstitutiveSymmetry','localStiffnessSymmetry','globalStiffnessSymmetry','rigidTranslation','rigidRotation','membranePatch','bendingPatch'];
  exactKeys(row, fields, label);
  fields.filter((field) => field !== 'rigidRotation').forEach((field) => tolerance(row[field], `${label}.${field}`));
  exactKeys(row.rigidRotation, ['strainResidual','curvatureResidual','scaledQualification'], `${label}.rigidRotation`);
  tolerance(row.rigidRotation.scaledQualification, `${label}.rigidRotation.scaledQualification`);
}

function validateCase(row, label) {
  exactKeys(row, CASE, label);
  row.nodalDisplacements.forEach((item, i) => exactKeys(item, ['nodeId','ux','uy','uz','r1','r2'], `${label}.nodalDisplacements[${i}]`));
  row.reactions.forEach((item, i) => exactKeys(item, ['constraintId','nodeId','dof','kind','value'], `${label}.reactions[${i}]`));
  exactKeys(row.solverEvidence, ['method','pivots','pivotScale','pivotTolerance','minimumPivot','maximumPivot','pivotRatio'], `${label}.solverEvidence`);
  tolerance(row.freeDofResidualQualification, `${label}.freeDofResidualQualification`);
  equilibrium(row.forceEquilibrium, `${label}.forceEquilibrium`);
  equilibrium(row.momentEquilibrium, `${label}.momentEquilibrium`);
  validateLoads(row.appliedLoadEvidence, `${label}.appliedLoadEvidence`);
  row.elementResults.forEach((item, i) => validateElementResult(item, `${label}.elementResults[${i}]`));
  tolerance(row.energyQualification, `${label}.energyQualification`);
  exactKeys(row.qualification, ['accepted','checks'], `${label}.qualification`);
}

function validateLoads(row, label) {
  exactKeys(row, ['loadCaseId','forceVector','contributions','appliedForce','appliedMomentAboutOrigin','formulaIds'], label);
  row.contributions.forEach((item, i) => {
    const nodal = ['type','identity','nodeId','generalizedValues','sourceReference','formulaId'];
    const pressure = ['type','identity','elementId','pressure','sense','signedNormal','representedArea','nodalForce','totalForce','sourceReference','formulaId'];
    exactKeys(item, item.type === 'NODAL_FORCE_AND_TANGENT_MOMENT' ? nodal : pressure, `${label}.contributions[${i}]`);
  });
}

function validateElementResult(row, label) {
  exactKeys(row, ELEMENT_RESULT, label);
  strain(row.membraneStrain, `${label}.membraneStrain`);
  stress(row.membraneStress, `${label}.membraneStress`);
  row.integrationPoints.forEach((item, i) => validatePoint(item, `${label}.integrationPoints[${i}]`));
}

function validatePoint(row, label) {
  exactKeys(row, ['integrationPointId','barycentric','curvature','surfaces','sourceReferences','formulaIds'], label);
  exactKeys(row.curvature, ['kappaX','kappaY','kappaXY'], `${label}.curvature`);
  row.surfaces.forEach((item, i) => {
    exactKeys(item, ['surface','z','membraneStrain','bendingStrain','combinedStrain','membraneStress','bendingStress','combinedStress','principalMaximum','principalMinimum','maximumInPlaneShear','vonMises','formulaIds'], `${label}.surfaces[${i}]`);
    ['membraneStrain','bendingStrain','combinedStrain'].forEach((field) => strain(item[field], `${label}.${field}`));
    ['membraneStress','bendingStress','combinedStress'].forEach((field) => stress(item[field], `${label}.${field}`));
  });
}

function tolerance(row, label) { exactKeys(row, ['actual','scale','tolerance','accepted'], label); }
function minimum(row, label) { exactKeys(row, ['actual','scale','minimum','accepted'], label); }
function equilibrium(row, label) { exactKeys(row, ['residual','qualification'], label); tolerance(row.qualification, `${label}.qualification`); }
function strain(row, label) { exactKeys(row, ['epsilonX','epsilonY','gammaXY'], label); }
function stress(row, label) { exactKeys(row, ['sigmaX','sigmaY','tauXY'], label); }
function validateRejected(value) {
  if ('meshEvidence' in value || 'loadCaseResults' in value) throw new ShellModelError('Rejected result contains authoritative solve evidence');
  if (value.formulaTrace.length !== 0) throw new ShellModelError('Rejected result formulaTrace must be empty');
}
