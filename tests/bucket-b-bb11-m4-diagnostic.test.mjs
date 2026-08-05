import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCanonicalFlangeHubGeometry,
} from '../src/core/bucket-b/flange-hub-geometry.js';
import {
  createFlangeHubMesh,
} from '../src/core/bucket-b/flange-hub-mesh.js';
import {
  solveFlangeHubLoadCase,
} from '../src/core/bucket-b/flange-hub-solver.js';
import {
  FLANGE_HUB_DIAGNOSTIC_SOLVER_POLICY,
  solveFlangeHubDiagnosticProbe,
} from '../src/core/bucket-b/flange-hub-diagnostic-solver.js';

const PROBE = Object.freeze({
  probeId: 'P-HUB-MID',
  r: 62.75,
  z: 30,
});

function elementEnergy(elementResult) {
  return elementResult.gaussPointResults.reduce((total, state) => total + 0.5 * (
    state.strain.epsilonR * state.stress.sigmaR
    + state.strain.epsilonZ * state.stress.sigmaZ
    + state.strain.epsilonTheta * state.stress.sigmaTheta
    + state.strain.gammaRZ * state.stress.tauRZ
  ) * state.circumferenceFactor
    * state.determinant
    * state.quadratureWeight, 0);
}

test('bounded diagnostic reproduces the production M0 axial solve certificates', () => {
  const mesh = createFlangeHubMesh('M0', createCanonicalFlangeHubGeometry());
  const production = solveFlangeHubLoadCase({
    mesh,
    loadCaseId: 'FH-AXIAL-001',
  });
  const diagnostic = solveFlangeHubDiagnosticProbe({
    mesh,
    loadCaseId: 'FH-AXIAL-001',
    probe: PROBE,
  });
  const probeNode = mesh.nodes.find((node) => (
    Math.hypot(node.r - PROBE.r, node.z - PROBE.z) <= 1e-9
  ));
  assert.ok(probeNode);
  const productionProbe = production.nodalDisplacements.find(
    (row) => row.nodeId === probeNode.nodeId,
  );
  assert.ok(productionProbe);

  assert.equal(diagnostic.probe.radial, productionProbe.radial);
  assert.equal(diagnostic.probe.axial, productionProbe.axial);
  assert.equal(
    diagnostic.probe.vectorNorm,
    Math.hypot(productionProbe.radial, productionProbe.axial),
  );
  assert.deepEqual(diagnostic.solver, production.solver);
  assert.deepEqual(diagnostic.equilibrium, production.equilibrium);
  assert.deepEqual(diagnostic.energy, production.energy);
  assert.deepEqual(diagnostic.residual, production.residual);

  const adjacentIds = new Set(mesh.elements
    .filter((element) => (
      ['FH-B03', 'FH-B04'].includes(element.blockId)
      && element.nodeIds.includes(probeNode.nodeId)
    ))
    .map((element) => element.elementId));
  const productionPatchEnergy = production.elementResults
    .filter((element) => adjacentIds.has(element.elementId))
    .reduce((sum, element) => sum + elementEnergy(element), 0);
  assert.equal(diagnostic.patch.totalEnergy, productionPatchEnergy);
  assert.equal(
    diagnostic.patch.fractionOfGlobalStrainEnergy,
    productionPatchEnergy / production.energy.strainEnergy,
  );

  assert.equal('nodalDisplacements' in diagnostic, false);
  assert.equal('elementResults' in diagnostic, false);
  assert.ok(Buffer.byteLength(JSON.stringify(diagnostic), 'utf8') < 1_000_000);
  assert.equal(diagnostic.qualificationAuthorityGranted, false);
  assert.equal(diagnostic.productionAuthorityGranted, false);
  assert.equal(diagnostic.mergeAuthorityGranted, false);
  assert.equal(diagnostic.bb12Authorized, false);
  assert.equal(
    FLANGE_HUB_DIAGNOSTIC_SOLVER_POLICY.productionSolverModified,
    false,
  );
});

test('bounded diagnostic refuses non-axial production load cases', () => {
  const mesh = createFlangeHubMesh('M0', createCanonicalFlangeHubGeometry());
  assert.throws(() => solveFlangeHubDiagnosticProbe({
    mesh,
    loadCaseId: 'FH-PRES-001',
    probe: PROBE,
  }), /FH_DIAGNOSTIC_LOAD_CASE_FORBIDDEN/);
});
