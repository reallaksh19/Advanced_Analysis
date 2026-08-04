import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLANGE_HUB_FROZEN_INPUT,
  createBenchmarkRecord,
  createCanonicalFlangeHubGeometry,
  createFlangeHubLoadDefinition,
  createFlangeHubMesh,
  closedEndLameReference,
  prismaticAnnularAxialReference,
  verifyReversedEdgeInvariance,
} from '../src/core/bucket-b/index.js';

test('BB-11 frozen geometry creates exact tangent fillets', () => {
  const geometry = createCanonicalFlangeHubGeometry();
  assert.equal(geometry.validation.accepted, true);
  assert.equal(geometry.geometryId, 'BKT-B-FLANGE-GEOMETRY-V1');
  geometry.fillets.forEach((fillet) => {
    assert.ok(fillet.radiusResidual <= 1e-10);
    assert.ok(fillet.tangentResidual <= 1e-12);
    assert.ok(fillet.positionResidual <= 1e-10);
  });
  assert.throws(
    () => createCanonicalFlangeHubGeometry({ ...FLANGE_HUB_FROZEN_INPUT, state: 'QUALIFIED' }),
    /FIELD_SET_MISMATCH/,
  );
  assert.throws(
    () => createCanonicalFlangeHubGeometry({ ...FLANGE_HUB_FROZEN_INPUT, pipeWallThickness: -10 }),
    /FROZEN_VALUE_MISMATCH/,
  );
});

test('BB-11 M0 mesh is deterministic and meets registered quality', () => {
  const geometry = createCanonicalFlangeHubGeometry();
  const first = createFlangeHubMesh('M0', geometry);
  const second = createFlangeHubMesh('M0', geometry);
  assert.equal(first.meshHash, second.meshHash);
  assert.equal(first.canonicalModelHash, second.canonicalModelHash);
  assert.deepEqual(first.nodes, second.nodes);
  assert.deepEqual(first.elements, second.elements);
  assert.equal(first.quality.accepted, true);
  assert.ok(first.quality.minimumDetJAtGaussPoints > 0);
  assert.ok(first.quality.minimumDetJAtControlPoints > 0);
  assert.ok(first.quality.qJDeterminantRatio >= 0.20);
  assert.ok(first.quality.minimumScaledJacobian >= 0.20);
  assert.ok(first.quality.maximumAspectRatio <= 10);
  assert.ok(first.quality.maximumHotspotAspectRatio <= 5);
  assert.ok(first.quality.midsidePlacementResidual <= 1e-9);
  assert.equal(first.duplicateInterfaceNodes.length, 0);
});

test('BB-11 load definitions preserve sign and reversed-edge invariance', () => {
  const mesh = createFlangeHubMesh('M0');
  const nodes = new Map(mesh.nodes.map((node) => [node.nodeId, node]));
  const pressure = createFlangeHubLoadDefinition('FH-PRES-001');
  assert.ok(pressure.equivalentEndThrust < 0);
  assert.ok(Math.abs(pressure.equivalentEndThrust + 10 * Math.PI * 50 ** 2) <= 1e-10);
  const bore = mesh.boundaryEdges.find((edge) => edge.boundaryId === 'FH-BOUNDARY-BORE');
  const evidence = verifyReversedEdgeInvariance({
    edge: {
      edgeId: bore.edgeId,
      nodes: bore.nodeIds.map((id) => nodes.get(id)),
      outwardNormal: bore.outwardNormal,
    },
    mode: 'PRESSURE',
    value: 10,
  });
  assert.equal(evidence.accepted, true);
  assert.ok(evidence.relativeDifference <= 1e-10);
});

test('BB-11 analytical references distinguish closed-end and axial-member mechanics', () => {
  const lame = closedEndLameReference({
    innerRadius: 50,
    outerRadius: 60,
    internalPressure: 10,
    externalPressure: 0,
    youngsModulus: 210000,
    poissonRatio: 0.30,
    radius: 55,
  });
  assert.ok(lame.sigmaTheta > lame.sigmaZ);
  assert.ok(lame.sigmaZ > 0);
  assert.ok(lame.radialDisplacement > 0);
  const axial = prismaticAnnularAxialReference({
    innerRadius: 50,
    outerRadius: 60,
    length: 100,
    axialResultant: 100000,
    youngsModulus: 210000,
    poissonRatio: 0.30,
    radius: 55,
  });
  assert.ok(axial.sigmaZ > 0);
  assert.ok(axial.strainEnergy > 0);
});

test('BB-11 registry rejects direct caller state', () => {
  assert.throws(
    () => createBenchmarkRecord({
      moduleId: 'C2D-FLANGE-HUB',
      recordKind: 'CORE',
      state: 'FORMULATION_QUALIFIED',
    }),
    /state.*authority/i,
  );
});
