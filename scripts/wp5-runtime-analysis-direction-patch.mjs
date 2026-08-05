import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../src/workspace/engineering-loads/empirical-restraint-network-runtime.js', import.meta.url);
let source = readFileSync(path, 'utf8');

source = replaceOnce(
  source,
  "      thermalExpansionPerK: line.thermalExpansionPerK,\n      complianceMPerN,",
  "      thermalExpansionPerK: line.thermalExpansionPerK,\n      analysisDirection: state.analysisDirection,\n      complianceMPerN,",
);

source = replaceOnce(
  source,
  `function segmentAnalysisDirection(segment) {
  // The directional projection squared is retained for compliance, while the
  // signed thermal projection is reconstructed from the stored tangent and
  // the runtime-injected immutable analysis direction.
  return segment.analysisDirection || CURRENT_ANALYSIS_DIRECTION;
}

let CURRENT_ANALYSIS_DIRECTION = Object.freeze([1, 0, 0]);

function setCurrentAnalysisDirection(direction) {
  CURRENT_ANALYSIS_DIRECTION = direction;
}`,
  `function segmentAnalysisDirection(segment) {
  const direction = segment.analysisDirection;
  if (!Array.isArray(direction) || direction.length !== 3
    || direction.some((item) => !Number.isFinite(item))) {
    throw runtimeError(
      EMPIRICAL_FAILURE_CODES.RESTRAINT_AXIS_AMBIGUOUS,
      \`Segment \${segment.id} has no immutable analysis direction.\`,
    );
  }
  return direction;
}`,
);

source = replaceOnce(
  source,
  "  const normalized = deepFreeze(value.map((item) => Object.is(item, -0) ? 0 : item));\n  setCurrentAnalysisDirection(normalized);\n  return normalized;",
  "  return deepFreeze(value.map((item) => Object.is(item, -0) ? 0 : item));",
);

assert.doesNotMatch(source, /CURRENT_ANALYSIS_DIRECTION|setCurrentAnalysisDirection/);
assert.match(source, /analysisDirection: state\.analysisDirection/);
writeFileSync(path, source);
console.log('wp5-runtime-analysis-direction-patch: APPLIED');

function replaceOnce(value, before, after) {
  const first = value.indexOf(before);
  assert.notEqual(first, -1, `Patch target not found: ${before.slice(0, 80)}`);
  assert.equal(value.indexOf(before, first + 1), -1, 'Patch target is not unique.');
  return `${value.slice(0, first)}${after}${value.slice(first + before.length)}`;
}
