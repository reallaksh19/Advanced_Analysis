import { readFileSync } from 'node:fs';

const SPEC = process.env.TOPOLOGY_EDIT_REAL_USER_SPEC
  || 'e2e/topology-edit-real-user-reachability.spec.js';

const source = readFileSync(SPEC, 'utf8');
const canonicalLiteralSource = source.replace(
  /(?:from\s+)?(['"])node:[^'"\n]+\1/gu,
  "''",
);
const forbidden = [
  ['PAGE_EVALUATE', /\bpage\.evaluate\s*\(/u, source],
  ['GLOBAL_CONTROLLER_ESCAPE', /\bglobalThis\b/u, source],
  ['PICK_CONTEXT', /\bpickContext\b/u, source],
  ['RAYCAST_ESCAPE', /\bpickWithRaycaster\b/u, source],
  ['CANONICAL_NODE_LITERAL', /['"`]node:/u, canonicalLiteralSource],
  ['CANONICAL_EDGE_LITERAL', /['"`]edge:/u, source],
  ['INTERNAL_PORT_KEY', /:port:/u, source],
  ['BACKEND_OVERRIDE', /Canvas2D|canvas2d|test[-_ ]renderer|viewportBackend\s*=/u, source],
  ['DIRECT_SESSION_EXECUTION', /\bsession\.(?:execute|undo|redo)\s*\(/u, source],
  ['DIRECT_PLANNER', /\b(?:planProfessionalOperation|createTopologyEditProfessionalOperationPlan)\s*\(/u, source],
  ['DIRECT_COMMAND', /\bcreateTopologyEditCommandIntent\s*\(/u, source],
  ['PIXEL_SCAN', /for\s*\([^)]*(?:clientX|clientY|pixel|canvas)[^)]*\)/u, source],
];

const violations = forbidden
  .filter(([, pattern, candidate]) => pattern.test(candidate))
  .map(([code]) => code);

if (violations.length) {
  process.stderr.write(
    `Issue #907 anti-cheat failed for ${SPEC}: ${violations.join(', ')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Issue #907 anti-cheat passed for ${SPEC}; no privileged targeting patterns found.\n`,
  );
}
