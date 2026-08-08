import { readFileSync } from 'node:fs';

const SPEC = process.env.TOPOLOGY_EDIT_REAL_USER_SPEC
  || 'e2e/topology-edit-real-user-reachability.spec.js';

const source = readFileSync(SPEC, 'utf8');
const forbidden = [
  ['PAGE_EVALUATE', /\bpage\.evaluate\s*\(/u],
  ['GLOBAL_CONTROLLER_ESCAPE', /\bglobalThis\b/u],
  ['PICK_CONTEXT', /\bpickContext\b/u],
  ['RAYCAST_ESCAPE', /\bpickWithRaycaster\b/u],
  ['CANONICAL_NODE_LITERAL', /['"`]node:/u],
  ['CANONICAL_EDGE_LITERAL', /['"`]edge:/u],
  ['INTERNAL_PORT_KEY', /:port:/u],
  ['BACKEND_OVERRIDE', /Canvas2D|canvas2d|test[-_ ]renderer|viewportBackend\s*=/u],
  ['DIRECT_SESSION_EXECUTION', /\bsession\.(?:execute|undo|redo)\s*\(/u],
  ['DIRECT_PLANNER', /\b(?:planProfessionalOperation|createTopologyEditProfessionalOperationPlan)\s*\(/u],
  ['DIRECT_COMMAND', /\bcreateTopologyEditCommandIntent\s*\(/u],
  ['PIXEL_SCAN', /for\s*\([^)]*(?:clientX|clientY|pixel|canvas)[^)]*\)/u],
];

const violations = forbidden
  .filter(([, pattern]) => pattern.test(source))
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
