#!/usr/bin/env node

/**
 * LAFEA upgrade spec §3 hash-lineage check.
 *
 * Covers `src/core/lafea-profile-contract/hash-lineage.js`: the 8-link chain
 * order, and a full classification table of change kinds (display-only vs.
 * engineering), one assertion per row — "changing display scale, contour
 * palette, camera state or selected object shall not alter engineering
 * hashes. Changing mesh sizing, formulation, material state, load case, SCL
 * placement, stress classification or code profile shall alter the
 * appropriate engineering identity."
 */

import assert from 'node:assert/strict';
import {
  CHANGE_KINDS,
  HASH_LINEAGE_ORDER,
  applyLineageChange,
  canonicalHashLineage,
  impactedLineageLinks,
  isDisplayOnlyChange,
  isEngineeringHashImpacted,
} from '../src/core/lafea-profile-contract/index.js';

console.log('\n--- LAFEA §3 hash lineage check ---');
checkLineageOrder();
checkChangeKindClassificationTable();
checkImpactIsMonotonicDownstream();
checkUnknownChangeKindRejected();
checkFullLineageAppliedAcrossAllLinks();
console.log('\n✅ LAFEA §3 hash lineage check passed.\n');

function checkLineageOrder() {
  assert.deepEqual([...HASH_LINEAGE_ORDER], [
    'sourceSemanticHash',
    'compiledModelSemanticHash',
    'meshSemanticHash',
    'loadCaseSemanticHash',
    'executionSemanticHash',
    'recoverySemanticHash',
    'codeAssessmentSemanticHash',
    'evidenceHash',
  ]);
  console.log('✅ The 8-link engineering hash lineage order matches spec §3.');
}

function checkChangeKindClassificationTable() {
  // One row per confirmed change kind: display-only leaves every engineering
  // hash untouched; an engineering change moves its first-owned link and
  // everything downstream of it.
  const rows = [
    ['DISPLAY_CONTOUR_PALETTE', true, null],
    ['DISPLAY_CAMERA_STATE', true, null],
    ['DISPLAY_SELECTION', true, null],
    ['DISPLAY_SCALE', true, null],
    ['DISPLAY_UNIT_FORMATTING', true, null],
    ['SOURCE_GEOMETRY_EDIT', false, 'sourceSemanticHash'],
    ['MATERIAL_STATE_EDIT', false, 'compiledModelSemanticHash'],
    ['MESH_DENSITY_EDIT', false, 'meshSemanticHash'],
    ['MESH_FORMULATION_EDIT', false, 'meshSemanticHash'],
    ['LOAD_CASE_EDIT', false, 'loadCaseSemanticHash'],
    ['BOUNDARY_CONDITION_EDIT', false, 'loadCaseSemanticHash'],
    ['SOLVER_BACKEND_EDIT', false, 'executionSemanticHash'],
    ['RECOVERY_METHOD_EDIT', false, 'recoverySemanticHash'],
    ['SCL_PLACEMENT_EDIT', false, 'codeAssessmentSemanticHash'],
    ['STRESS_CLASSIFICATION_EDIT', false, 'codeAssessmentSemanticHash'],
    ['CODE_PROFILE_EDIT', false, 'codeAssessmentSemanticHash'],
  ];
  assert.equal(rows.length, 16, 'Classification table covers all declared change kinds.');
  assert.equal(Object.values(CHANGE_KINDS).length, rows.length, 'Every declared CHANGE_KINDS entry has a table row.');

  for (const [changeKind, expectDisplayOnly, firstImpacted] of rows) {
    assert.equal(CHANGE_KINDS[changeKind], changeKind, `Unknown change kind in table: ${changeKind}`);
    assert.equal(isDisplayOnlyChange(changeKind), expectDisplayOnly, `${changeKind} display-only classification mismatch`);
    assert.equal(isEngineeringHashImpacted(changeKind), !expectDisplayOnly, `${changeKind} engineering-impact classification mismatch`);
    const impacted = impactedLineageLinks(changeKind);
    if (firstImpacted === null) {
      assert.deepEqual([...impacted], [], `${changeKind} must impact no lineage link`);
    } else {
      const startIndex = HASH_LINEAGE_ORDER.indexOf(firstImpacted);
      assert.deepEqual([...impacted], HASH_LINEAGE_ORDER.slice(startIndex), `${changeKind} must impact from ${firstImpacted} downstream`);
    }
  }
  console.log('✅ All 16 change kinds classify correctly against the display-only/engineering table.');
}

function checkImpactIsMonotonicDownstream() {
  // A downstream-owning change kind's impacted set must never include a link
  // upstream of its first-owned link.
  const upstreamOnly = impactedLineageLinks(CHANGE_KINDS.CODE_PROFILE_EDIT);
  assert.deepEqual([...upstreamOnly], ['codeAssessmentSemanticHash', 'evidenceHash']);
  assert.equal(upstreamOnly.includes('meshSemanticHash'), false);
  assert.equal(upstreamOnly.includes('sourceSemanticHash'), false);
  console.log('✅ Impact sets never reach upstream of a change kind\'s first-owned link.');
}

function checkUnknownChangeKindRejected() {
  assert.throws(() => isDisplayOnlyChange('NOT_A_REAL_CHANGE_KIND'), (error) => {
    assert.equal(error.code, 'UNSUPPORTED_VALUE');
    return true;
  });
  console.log('✅ An unrecognized change kind is rejected, never defaulted to display-only.');
}

function checkFullLineageAppliedAcrossAllLinks() {
  let lineage = canonicalHashLineage(Object.fromEntries(HASH_LINEAGE_ORDER.map((link, index) => [link, `fnv1a64:${String(index).padStart(16, '0')}`])));
  let counter = 100;
  const changeSequence = [
    CHANGE_KINDS.SOURCE_GEOMETRY_EDIT,
    CHANGE_KINDS.MATERIAL_STATE_EDIT,
    CHANGE_KINDS.MESH_DENSITY_EDIT,
    CHANGE_KINDS.LOAD_CASE_EDIT,
    CHANGE_KINDS.SOLVER_BACKEND_EDIT,
    CHANGE_KINDS.RECOVERY_METHOD_EDIT,
    CHANGE_KINDS.CODE_PROFILE_EDIT,
  ];
  for (const changeKind of changeSequence) {
    const before = lineage;
    const impacted = impactedLineageLinks(changeKind);
    const nextHashes = Object.fromEntries(impacted.map((link) => {
      counter += 1;
      return [link, `fnv1a64:${String(counter).padStart(16, '0')}`];
    }));
    lineage = applyLineageChange(lineage, changeKind, nextHashes);
    for (const link of HASH_LINEAGE_ORDER) {
      if (impacted.includes(link)) assert.notEqual(lineage[link], before[link], `${changeKind} should move ${link}`);
      else assert.equal(lineage[link], before[link], `${changeKind} should not move ${link}`);
    }
  }
  // Walking source -> code-profile must have touched every link at least once.
  console.log('✅ A full source-to-code-profile edit sequence moves exactly the links each change owns.');
}
