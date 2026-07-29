#!/usr/bin/env node

/**
 * P0 containment check — LFEA Phase 1-3 Revamped Improvement Plan.
 *
 * P0 is the stated precondition for the revised LFEA phase structure. Its
 * four claims were verified against this repository before any fix was
 * written, per the session's "trust but verify" rule:
 *
 *   P0.1 mount-root collision       NOT PRESENT — workspace-layout.js already
 *                                    declares distinct data-role values
 *                                    ("lfea-consumer-root" / "lafea-consumer-root")
 *                                    and bootstrap.js already queries them
 *                                    distinctly. Locked in here, not fixed.
 *   P0.2 stale worker result        REAL — verified: lfea-workbench-store.js
 *                                    completeRun() accepted any resolved
 *                                    execution unconditionally, with no check
 *                                    that the package hadn't been edited while
 *                                    the run was in flight. Fixed in
 *                                    lfea-workbench-store.js; covered by
 *                                    scripts/lfea-workbench-check.mjs (already
 *                                    in npm run gate), not duplicated here.
 *   P0.3 DEFORMED requires a scale  NOT PRESENT — lfea-workbench-model.js's
 *                                    resolveDeformation() already throws for
 *                                    DEFORMED without an explicit positive
 *                                    scale. It had zero test coverage before
 *                                    this file; locked in here.
 *   P0.4 e2e not in the release     REAL — check:e2e exists (66 Playwright
 *        gate                       specs, full dev-server + browser) but is
 *                                    not part of npm run gate. NOT wired in by
 *                                    this change: adding the full suite (or
 *                                    any subset) to the gate changes CI
 *                                    runtime/reliability for the whole
 *                                    application, not just LFEA, and deserves
 *                                    its own explicit decision. Left as an
 *                                    open, named finding rather than a quiet
 *                                    gate change.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lfeaDisplayGeometry } from '../src/workspace/lfea-workbench-model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('\n--- LFEA P0 containment check ---');
checkUniqueWorkbenchRoots();
checkDeformedModeRequiresExplicitScale();
console.log('\n✅ LFEA P0 containment check passed.\n');

function checkUniqueWorkbenchRoots() {
  // P0.1 lock-in, source level: no live DOM in this check environment, so the
  // invariant is verified the same way scripts/doc-drift-check.mjs verifies
  // forbidden-path invariants -- against the actual source text, not a
  // reimplementation of the render.
  const layoutSource = fs.readFileSync(path.join(ROOT, 'src/workspace/workspace-layout.js'), 'utf8');
  assertExactCount(layoutSource, /data-role="lfea-consumer-root"/gu, 1, 'workspace-layout.js must declare exactly one LFEA root');
  assertExactCount(layoutSource, /data-role="lafea-consumer-root"/gu, 1, 'workspace-layout.js must declare exactly one LAFEA root');

  const bootstrapSource = fs.readFileSync(path.join(ROOT, 'src/workspace/bootstrap.js'), 'utf8');
  const lfeaLine = matchLine(bootstrapSource, /new\s+LfeaWorkbenchController\([^)]*\)/u, 'bootstrap.js must construct LfeaWorkbenchController');
  const lafeaLine = matchLine(bootstrapSource, /new\s+LafeaWorkbenchController\([^)]*\)/u, 'bootstrap.js must construct LafeaWorkbenchController');
  assert.ok(lfeaLine.includes('"lfea-consumer-root"'), 'LfeaWorkbenchController must mount on the LFEA root');
  assert.ok(lafeaLine.includes('"lafea-consumer-root"'), 'LafeaWorkbenchController must mount on the LAFEA root');
  assert.notEqual(lfeaLine, lafeaLine, 'LFEA and LAFEA must not be mounted against the same selector');
  console.log('✅ Exactly one root per workbench, each mounted by its own controller (P0.1, verified already correct).');
}

function checkDeformedModeRequiresExplicitScale() {
  // P0.3 lock-in.
  const packageValue = { nodes: [{ nodeId: 'N1', x: 0, y: 0 }], elements: [], unitsIdentity: null };
  assert.throws(
    () => lfeaDisplayGeometry(packageValue, null, 'DEFORMED', {}),
    /explicit positive deformation scale/u,
    'DEFORMED mode without an explicit positive scale must throw',
  );
  assert.throws(
    () => lfeaDisplayGeometry(packageValue, null, 'DEFORMED', { deformation: { enabled: true, scale: 0 } }),
    /explicit positive deformation scale/u,
    'a zero scale must not be accepted as "explicit and positive"',
  );
  assert.throws(
    () => lfeaDisplayGeometry(packageValue, null, 'DEFORMED', { deformation: { enabled: true, scale: -5 } }),
    /explicit positive deformation scale/u,
    'a negative scale must not be accepted',
  );
  const rendered = lfeaDisplayGeometry(packageValue, null, 'DEFORMED', { deformation: { enabled: true, scale: 10 } });
  assert.equal(rendered.mode, 'DEFORMED');
  assert.equal(rendered.authority, 'SCALED_DEFORMATION_REVIEW_GEOMETRY', 'an explicit positive scale must be honored, not silently ignored');

  const undeformed = lfeaDisplayGeometry(packageValue, null, 'MODEL', {});
  assert.equal(undeformed.plot.geometryState, 'UNDEFORMED_SOURCE_GEOMETRY');
  console.log('✅ DEFORMED mode is impossible without an explicit positive scale (P0.3, verified already correct).');
}

function assertExactCount(source, pattern, expected, message) {
  const matches = source.match(pattern) || [];
  assert.equal(matches.length, expected, `${message} (found ${matches.length})`);
}

function matchLine(source, pattern, message) {
  const match = source.match(pattern);
  assert.ok(match, message);
  return match[0];
}
