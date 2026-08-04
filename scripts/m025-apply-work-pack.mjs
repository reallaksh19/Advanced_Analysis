#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

function patch(path, transform) {
  const before = readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`M025 patch produced no change for ${path}.`);
  writeFileSync(path, after);
  console.log(`M025 patched ${path}`);
}

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`M025 could not find ${label}.`);
  if (content.indexOf(search, index + search.length) >= 0) throw new Error(`M025 found ${label} more than once.`);
  return `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`;
}

const fixture = 'scripts/lfea-b3.15-bm1-inputxml-fixtures.mjs';
patch(fixture, (initial) => {
  let content = initial;
  content = replaceOnce(
    content,
    "import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';\n",
    "import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';\nimport { solveBm1CoulombCases } from './lfea-b3.19-bm1-friction.mjs';\n",
    'M025 friction helper import',
  );
  content = replaceOnce(
    content,
    'export function buildBm1InputXmlAuthorities() {',
    'export function buildBm1InputXmlAuthorities({ frictionStates = {} } = {}) {',
    'buildBm1InputXmlAuthorities signature',
  );
  content = replaceOnce(
    content,
    '    kernelNodeByReference,\n    modelEntries,\n  });',
    '    kernelNodeByReference,\n    modelEntries,\n    frictionStates,\n  });',
    'compileModel call',
  );
  content = replaceOnce(
    content,
    'function compileModel({ source, conditioned, analysisGeometry, material, sections, kernelNodeByReference, modelEntries }) {',
    'function compileModel({ source, conditioned, analysisGeometry, material, sections, kernelNodeByReference, modelEntries, frictionStates }) {',
    'compileModel signature',
  );
  content = replaceOnce(
    content,
    '    constraintDeclarations: constraintDeclarations(analysisGeometry, kernelNodeByReference),',
    '    constraintDeclarations: constraintDeclarations(analysisGeometry, kernelNodeByReference, frictionStates),',
    'constraintDeclarations call',
  );
  content = replaceOnce(
    content,
    'function constraintDeclarations(geometry, kernelNodeByReference) {',
    'function constraintDeclarations(geometry, kernelNodeByReference, frictionStates = {}) {',
    'constraintDeclarations signature',
  );
  content = replaceOnce(
    content,
    '  return [...rows.values()];\n}\n\nexport function solveBm1InputXml() {',
    `  for (const [referenceNode, state] of Object.entries(frictionStates)) {\n    if (state === 'STICK') {\n      add(referenceNode, 'UX');\n      add(referenceNode, 'UZ');\n    } else if (state !== 'SLIP') {\n      throw new Error(\`M025 unsupported friction state \${state} at node \${referenceNode}.\`);\n    }\n  }\n  return [...rows.values()];\n}\n\nexport function solveBm1InputXml() {`,
    'friction constraint expansion',
  );

  const solvePattern = /export function solveBm1InputXml\(\) \{[\s\S]*?\n\}\n\nfunction analyseCase\(authorities, loadCaseId, thermal\) \{/u;
  if (!solvePattern.test(content)) throw new Error('M025 could not locate solveBm1InputXml/analyseCase block.');
  content = content.replace(solvePattern, `export function solveBm1InputXml() {\n  const solved = solveBm1CoulombCases({\n    buildAuthorities: (options) => buildBm1InputXmlAuthorities(options),\n    analyseCase,\n  });\n  const { authorities, sustained, operating, friction } = solved;\n  const codeAuthorities = bm1CodeAuthorities(authorities);\n  const code = displacementStressResults(authorities, sustained, operating, codeAuthorities);\n  const baseResult = {\n    ...authorities,\n    sustainedAuthorities: friction.sustained,\n    operatingAuthorities: friction.operating,\n    sustained,\n    operating,\n    friction,\n    code,\n    report: buildReport(authorities, sustained, operating, code),\n  };\n  return augmentBm1CodeStress(baseResult, codeAuthorities);\n}\n\nfunction analyseCase(authorities, loadCaseId, thermal, frictionForces = []) {`);
  content = replaceOnce(
    content,
    '  const loadCase = compileCase(authorities, loadCaseId, thermal);',
    '  const loadCase = compileCase(authorities, loadCaseId, thermal, frictionForces);',
    'analyseCase compileCase call',
  );
  content = replaceOnce(
    content,
    'function compileCase(authorities, loadCaseId, thermal) {',
    'function compileCase(authorities, loadCaseId, thermal, frictionForces = []) {',
    'compileCase signature',
  );
  content = replaceOnce(
    content,
    '  return compilePhysicalLoadCase({\n    loadCaseId,',
    `  for (const row of frictionForces) {\n    primitives.push({\n      schema: 'fea-linear-load-primitive/v1',\n      primitiveId: \`\${loadCaseId}-FRICTION-\${row.sourceNodeId}\`,\n      kind: 'NODAL_FORCE_MOMENT',\n      nodeId: row.kernelNodeId,\n      basis: { kind: 'GLOBAL' },\n      force: { fx: row.fx, fy: 0, fz: row.fz },\n      moment: { mx: 0, my: 0, mz: 0 },\n      units: { force: 'N', moment: 'N*m', length: 'm' },\n      signConvention: 'APPLIED_TO_STRUCTURE',\n      sourceEvidence: sourceEvidence({\n        sourceId: \`\${SOURCE_ID}-M025-FRICTION\`,\n        sourceRevision: \`\${loadCaseId}:\${row.sourceNodeId}:\${row.fx}:\${row.fz}\`,\n      }),\n    });\n  }\n  return compilePhysicalLoadCase({\n    loadCaseId,`,
    'friction load primitives',
  );
  content = replaceOnce(
    content,
    "      'CAESAR restraints at nodes 70 and 80 declare friction coefficient 0.3; restraint friction remains outside this linear benchmark.',",
    "      'M025 resolves the declared node-70/node-80 friction coefficient 0.3 through an explicit active-set Coulomb outer solve around the unchanged linear kernel; convergence, state and bound evidence are retained per case.',",
    'old friction limitation',
  );
  content = replaceOnce(
    content,
    '    equilibrium: { sustained: sustained.equilibrium, operating: operating.equilibrium },\n  });',
    '    equilibrium: { sustained: sustained.equilibrium, operating: operating.equilibrium },\n    friction: { sustained: sustained.friction, operating: operating.friction },\n  });',
    'report friction evidence',
  );
  content = replaceOnce(
    content,
    `function nodalResult(analysis, nodeId) {\n  const value = (array, dof) => array.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;\n  return {\n    displacement: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.displacement, dof)])),\n    reaction: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.reactions, dof)])),\n  };\n}`,
    `function nodalResult(analysis, nodeId) {\n  const value = (array, dof) => array.find((row) => row.nodeId === nodeId && row.dof === dof)?.value ?? 0;\n  const supplement = analysis.friction?.byKernelNode?.[nodeId]?.reactionSupplement ?? {};\n  return {\n    displacement: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.displacement, dof)])),\n    reaction: Object.fromEntries(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'].map((dof) => [dof, value(analysis.execution.reactions, dof) + (supplement[dof] ?? 0)])),\n  };\n}`,
    'nodal friction reaction supplement',
  );
  return content;
});

patch('scripts/lfea-bm1-cii-output-comparison.mjs', (content) => replaceOnce(
  content,
  "      'CAESAR restraints at nodes 70 and 80 declare a real FRIC_COEF=0.3 (Coulomb friction). This repo\\'s BM1 constraint model does not implement restraint friction (a nonlinear, iterative CAESAR feature); the resulting transverse (UX/FZ-direction) reaction/displacement deviation downstream of those two restraints is real and attributable to this gap, not to a solver defect.',",
  "      'M025 applies the two live FRIC_COEF=0.3 restraints through an active-set Coulomb outer solve. The comparison includes the resulting physical tangential support reactions for both stick and slip states.',",
  'comparison friction limitation',
));

patch('package.json', (initial) => {
  let content = initial;
  content = replaceOnce(
    content,
    '    "check:lfea-b3.18": "node scripts/lfea-b3.18-bm1-bend-check.mjs",\n',
    '    "check:lfea-b3.18": "node scripts/lfea-b3.18-bm1-bend-check.mjs",\n    "check:lfea-b3.19": "node scripts/lfea-b3.19-bm1-friction-check.mjs",\n',
    'b3.19 package script insertion',
  );
  content = replaceOnce(
    content,
    '&& npm run check:lfea-b3.18 && npm run check:lfea-bm1-cii-comparison',
    '&& npm run check:lfea-b3.18 && npm run check:lfea-b3.19 && npm run check:lfea-bm1-cii-comparison',
    'b3.19 aggregate insertion',
  );
  return content;
});
