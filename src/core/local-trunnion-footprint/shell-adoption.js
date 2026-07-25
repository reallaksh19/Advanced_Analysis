import {
  MODEL_SCHEMA as SHELL_MODEL_SCHEMA,
  QUALIFICATION_STATES as SHELL_STATES,
  calculateLocalShell,
  createCanonicalLocalShellModel,
  reconstructShellResultHashes,
  validateCanonicalLocalShellModel,
} from '../local-shell/index.js';
import { shellModelError, shellResultError } from './errors.js';
import { codeUnitCompare, equalCanonical, semanticHash } from './json.js';
import { qualification } from './numeric.js';

export function adoptAndSolveShell(source, workflowModel, distributions) {
  const generatedLoadCases = distributions.map((distribution) => ({
    loadCaseId: distribution.shellLoadCaseId,
    nodalLoads: distribution.nodalForces.map((force) => ({
      loadId: `LAFEA5:${distribution.shellLoadCaseId}:${force.nodeId}`,
      nodeId: force.nodeId,
      fx: force.fx, fy: force.fy, fz: force.fz,
      m1: 0, m2: 0,
      sourceReference: `LAFEA5:${workflowModel.semanticHash}:${distribution.workflowLoadCaseId}:${force.nodeId}`,
    })),
    pressureLoads: [],
    sourceReference: `LAFEA5:${workflowModel.semanticHash}:${distribution.workflowLoadCaseId}`,
  }));
  const template = source.shellTemplate;
  const shellSource = {
    schema: SHELL_MODEL_SCHEMA,
    modelIdentity: template.modelIdentity,
    modelVersion: template.modelVersion,
    sourceAncestry: [...template.sourceAncestry],
    units: template.units,
    formulation: template.formulation,
    materials: template.materials,
    nodes: template.nodes,
    elements: template.elements,
    constraints: template.constraints,
    loadCases: generatedLoadCases,
    resultRequests: template.resultRequests,
    qualificationProfile: template.qualificationProfile,
    limitations: template.limitations,
  };
  let canonical;
  try { canonical = validateCanonicalLocalShellModel(createCanonicalLocalShellModel(shellSource)); }
  catch (error) { throw shellModelError('GENERATED_SHELL_MODEL_REJECTED', 'generatedShellModel', error instanceof Error ? error.message : 'Generated shell model was rejected.'); }
  verifyAdoption(template, canonical, generatedLoadCases);
  const result = calculateLocalShell(canonical);
  if (result?.qualification?.state !== SHELL_STATES.ACCEPTED || result?.qualification?.accepted !== true) throw shellResultError('GENERATED_SHELL_RESULT_REJECTED', 'rawShellResult', result?.qualification?.summary ?? 'Generated shell result was rejected.');
  const reconstructed = reconstructShellResultHashes(result);
  const hashAccepted = equalCanonical(reconstructed, result.semanticHashes);
  const shellHashReconstructionEvidence = qualification(hashAccepted ? 0 : 1, 1, source.qualificationProfile.shellHashReconstruction);
  if (!hashAccepted || !shellHashReconstructionEvidence.accepted) throw shellResultError('SHELL_RESULT_HASH_MISMATCH', 'rawShellResult.semanticHashes', 'Generated shell result hashes do not reconstruct.', shellHashReconstructionEvidence);
  if (result.canonicalModelSemanticHash !== canonical.semanticHash) throw shellResultError('SHELL_RESULT_MODEL_MISMATCH', 'rawShellResult.canonicalModelSemanticHash', 'Generated shell result does not belong to the generated model.');
  return { canonicalShellModel: canonical, rawShellResult: result, canonicalShellModelHash: canonical.semanticHash, shellResultHash: result.semanticHashes.resultPayloadSemanticHash, generatedLoadCasesHash: semanticHash(generatedLoadCases), shellHashReconstructionEvidence };
}

function verifyAdoption(template, canonical, loadCases) {
  for (const field of ['materials', 'nodes', 'constraints']) {
    if (!equalCanonical(canonicalSort(template[field], field), canonical[field])) throw shellModelError('SHELL_TEMPLATE_MUTATED', `generatedShellModel.${field}`, `Caller-authored shell ${field} changed during adoption.`);
  }
  verifyElements(template.elements, canonical.elements);
  for (const field of ['qualificationProfile', 'resultRequests', 'limitations']) {
    const expected = field === 'limitations' ? [...template[field]].sort(codeUnitCompare) : template[field];
    if (!equalCanonical(expected, canonical[field])) throw shellModelError('SHELL_TEMPLATE_MUTATED', `generatedShellModel.${field}`, `Caller-authored shell ${field} changed during adoption.`);
  }
  if (!equalCanonical(canonicalLoadCases(loadCases), canonical.loadCases)) throw shellModelError('SHELL_LOAD_CASE_MISMATCH', 'generatedShellModel.loadCases', 'Generated shell load cases do not reconstruct.');
  if (canonical.loadCases.some((loadCase) => loadCase.pressureLoads.length > 0 || loadCase.nodalLoads.some((load) => load.m1 !== 0 || load.m2 !== 0))) throw shellModelError('FORBIDDEN_SHELL_LOAD', 'generatedShellModel.loadCases', 'Generated shell cases must contain force-only nodal loads and no pressure.');
}
function verifyElements(expected, actual) {
  const expectedRows = canonicalSort(expected, 'elements');
  if (expectedRows.length !== actual.length) throw shellModelError('SHELL_TEMPLATE_MUTATED', 'generatedShellModel.elements', 'Caller-authored shell elements changed during adoption.');
  for (let index = 0; index < actual.length; index += 1) {
    const left = expectedRows[index], right = actual[index];
    if (left.elementId !== right.elementId || left.materialId !== right.materialId || left.thickness !== right.thickness || left.sourceReference !== right.sourceReference || !equalCanonical([...left.nodeIds].sort(codeUnitCompare), [...right.nodeIds].sort(codeUnitCompare))) throw shellModelError('SHELL_TEMPLATE_MUTATED', `generatedShellModel.elements.${right.elementId}`, 'Caller-authored shell element changed during adoption.');
  }
}
function canonicalLoadCases(values) {
  return [...values].map((row) => ({ ...row, nodalLoads: [...row.nodalLoads].sort((a,b)=>codeUnitCompare(a.loadId,b.loadId)), pressureLoads: [...row.pressureLoads].sort((a,b)=>codeUnitCompare(a.pressureLoadId,b.pressureLoadId)) })).sort((a,b)=>codeUnitCompare(a.loadCaseId,b.loadCaseId));
}
function canonicalSort(values, field) {
  const keys = { materials: 'materialId', nodes: 'nodeId', elements: 'elementId', constraints: 'constraintId', loadCases: 'loadCaseId' };
  return [...values].sort((a, b) => a[keys[field]] < b[keys[field]] ? -1 : a[keys[field]] > b[keys[field]] ? 1 : 0);
}