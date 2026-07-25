import assert from 'node:assert/strict';
import {
  reconstructShellResultHashes,
  validateCanonicalLocalShellModel,
} from '../src/core/local-shell/index.js';
import {
  calculateLocalTrunnionFootprint,
} from '../src/core/local-trunnion-footprint/index.js';
import { stableShellTemplate, workflowSource } from './lafea.5-fixtures.mjs';

const source = workflowSource();
const result = calculateLocalTrunnionFootprint(source);
assert.equal(result.qualification.state,'ACCEPTED',JSON.stringify(result.diagnostics));
assert.equal(validateCanonicalLocalShellModel(result.generatedShellModel).semanticHash,result.canonicalShellModelHash);
assert.deepEqual(result.generatedShellModel.constraints, source.shellTemplate.constraints.slice().sort((a,b)=>a.constraintId<b.constraintId?-1:1));
assert.ok(result.generatedShellModel.loadCases.every((loadCase)=>loadCase.pressureLoads.length===0));
assert.ok(result.generatedShellModel.loadCases.flatMap((loadCase)=>loadCase.nodalLoads).every((load)=>load.m1===0&&load.m2===0));
assert.deepEqual(reconstructShellResultHashes(result.rawShellResult),result.rawShellResult.semanticHashes);
assert.equal(result.rawShellResult.canonicalModelSemanticHash,result.generatedShellModel.semanticHash);
assert.ok(result.rawShellResult.loadCaseResults[0].qualification.accepted);
assert.equal(result.canonicalWorkflowModel.unitCompatibilityEvidence.accepted,true);
assert.deepEqual(result.canonicalWorkflowModel.unitCompatibilityEvidence.rows.map((row)=>row.dimension),['length','force','moment']);

const multipleSource = workflowSource({ mappings: [
  { workflowLoadCaseId: 'WF-FX', attachmentLoadCaseId: 'FX', shellLoadCaseId: 'SHELL-FX', mechanicalScaleFactor: 1, sourceReference: 'mapping-fx' },
  { workflowLoadCaseId: 'WF-MZ', attachmentLoadCaseId: 'MZ', shellLoadCaseId: 'SHELL-MZ', mechanicalScaleFactor: 1, sourceReference: 'mapping-mz' },
] });
const multiple = calculateLocalTrunnionFootprint(multipleSource);
assert.equal(multiple.qualification.state, 'ACCEPTED', JSON.stringify(multiple.diagnostics));
assert.deepEqual(multiple.generatedShellModel.loadCases.map((row) => row.loadCaseId), ['SHELL-FX', 'SHELL-MZ']);
assert.equal(multiple.loadCaseResults.length, 2);

const invalid = workflowSource();
invalid.shellTemplate.elements[0].materialId='MISSING';
const invalidRejected=calculateLocalTrunnionFootprint(invalid);
assert.equal(invalidRejected.qualification.state,'REJECTED_SHELL_MODEL');
assert.equal(invalidRejected.diagnostics[0].code,'SHELL_TEMPLATE_INVALID');

const singular = workflowSource({shellTemplate:stableShellTemplate({singular:true})});
const rejected = calculateLocalTrunnionFootprint(singular);
assert.equal(rejected.qualification.state,'REJECTED_SHELL_RESULT');
for(const field of ['generatedShellModel','rawShellResult','loadDistributionEvidence','assessmentRegionResults','loadCaseResults'])assert.equal(Object.hasOwn(rejected,field),false);
console.log('LAFEA.5 public LAFEA.4 adoption, force-only loads, stable solve and singular containment passed.');