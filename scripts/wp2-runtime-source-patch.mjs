import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../src/workspace/engineering-loads/empirical-beam-contact-runtime.js', import.meta.url);
let source = readFileSync(path, 'utf8');

source = replaceOnce(
  source,
  "    state.component.geometry?.center,\n    state.context.sourceLengthFactorM,\n",
  "    state.component.geometry?.center,\n    state.context.topology.sourceLengthFactorM,\n",
  'elbow source length factor',
);
source = replaceOnce(
  source,
  "  const componentById = new Map(context.sharedModel.components.map((row) => [row.componentKey, row]));\n\n  for (const componentKey of [...context.region.componentKeys].sort()) {\n",
  "  const componentById = new Map(context.sharedModel.components.map((row) => [row.componentKey, row]));\n  const runtimeContext = {\n    ...context,\n    regionPlaneOffset: determineRegionPlaneOffset(context, componentById),\n  };\n\n  for (const componentKey of [...context.region.componentKeys].sort()) {\n",
  'region plane context',
);
source = replaceCount(
  source,
  "        context,\n        sectionStates,\n",
  "        context: runtimeContext,\n        sectionStates,\n",
  2,
  'component runtime context',
);
source = replaceOnce(
  source,
  "  const regionOffset = context.regionPlaneOffsets?.get(region.connectedComponentId)\n    ?? offsets[0];\n",
  "  const regionOffset = context.regionPlaneOffset ?? offsets[0];\n",
  'region plane offset',
);
source = replaceOnce(
  source,
  "function assertComponentPlanarity(points, region, context, componentKey) {\n",
  `function determineRegionPlaneOffset(context, componentById) {\n  const normal = context.request.coordinateFrame.analysisPlaneBasis.normal;\n  for (const componentKey of [...context.region.componentKeys].sort()) {\n    const component = componentById.get(componentKey);\n    if (!component) continue;\n    const endpoints = componentEndpoints(component, context.topology);\n    return dot(endpoints.pointI, normal);\n  }\n  throw runtimeError(\n    EMPIRICAL_FAILURE_CODES.GEOMETRY_INVALID,\n    \`Region \${context.region.connectedComponentId} has no component geometry.\`,\n  );\n}\n\nfunction assertComponentPlanarity(points, region, context, componentKey) {\n`,
  'region plane helper',
);

writeFileSync(path, source);
console.log('wp2-runtime-source-patch: APPLIED');

function replaceOnce(value, before, after, label) {
  const count = value.split(before).length - 1;
  assert.equal(count, 1, `${label}: expected one source match, found ${count}`);
  return value.replace(before, after);
}

function replaceCount(value, before, after, expected, label) {
  const count = value.split(before).length - 1;
  assert.equal(count, expected, `${label}: expected ${expected} source matches, found ${count}`);
  return value.split(before).join(after);
}
