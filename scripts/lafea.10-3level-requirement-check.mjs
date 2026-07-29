#!/usr/bin/env node

/**
 * LAFEA upgrade spec §10.4 minimum-mesh-level-count check.
 *
 * Covers `requireSufficientMeshLevels` in
 * `src/core/lafea-meshing/mesh-convergence-framework.js`: production code
 * assessment requires >= 3 mesh levels; fewer than 3 is rejected unless a
 * validated benchmark-template exemption is supplied.
 */

import assert from 'node:assert/strict';
import { LafeaMeshingError, requireSufficientMeshLevels } from '../src/core/lafea-meshing/index.js';

console.log('\n--- LAFEA §10.4 minimum mesh-level-count check ---');
checkThreeOrMoreLevelsAccepted();
checkFewerThanThreeRejectedWithoutExemption();
checkValidExemptionAccepted();
checkMalformedExemptionRejected();
console.log('\n✅ LAFEA §10.4 minimum mesh-level-count check passed.\n');

function checkThreeOrMoreLevelsAccepted() {
  const three = requireSufficientMeshLevels({ levelCount: 3, benchmarkTemplateExemption: null });
  assert.equal(three.exempted, false);
  const five = requireSufficientMeshLevels({ levelCount: 5, benchmarkTemplateExemption: null });
  assert.equal(five.exempted, false);
  console.log('✅ 3 or more mesh levels are accepted without needing an exemption.');
}

function checkFewerThanThreeRejectedWithoutExemption() {
  assert.throws(() => requireSufficientMeshLevels({ levelCount: 1, benchmarkTemplateExemption: null }), (error) => {
    assert.ok(error instanceof LafeaMeshingError);
    assert.equal(error.code, 'INSUFFICIENT_MESH_LEVELS');
    return true;
  });
  assert.throws(() => requireSufficientMeshLevels({ levelCount: 2, benchmarkTemplateExemption: null }), (error) => {
    assert.equal(error.code, 'INSUFFICIENT_MESH_LEVELS');
    return true;
  });
  console.log('✅ Fewer than 3 mesh levels is rejected when no exemption is supplied.');
}

function checkValidExemptionAccepted() {
  const result = requireSufficientMeshLevels({
    levelCount: 1,
    benchmarkTemplateExemption: { benchmarkId: 'SHELL-PATCH-01', qualificationEvidenceHash: 'fnv1a64:0123456789abcdef' },
  });
  assert.equal(result.exempted, true);
  assert.equal(result.benchmarkId, 'SHELL-PATCH-01');
  console.log('✅ A validated benchmark-template exemption allows fewer than 3 levels, explicitly flagged as exempted.');
}

function checkMalformedExemptionRejected() {
  assert.throws(() => requireSufficientMeshLevels({
    levelCount: 1,
    benchmarkTemplateExemption: { benchmarkId: 'SHELL-PATCH-01' },
  }), (error) => {
    assert.equal(error.code, 'MISSING_FIELD');
    return true;
  });
  console.log('✅ An incomplete exemption record is rejected, not silently accepted.');
}
