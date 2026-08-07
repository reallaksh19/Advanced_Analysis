#!/usr/bin/env node

import fs from 'node:fs';

function replaceOne(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error(`${path}: expected patch anchor missing`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`${path}: patch anchor is not unique`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceOne(
  'src/core/geometry/adapters/inputXmlToCanonicalGeometry.js',
  "      zCosine: caesarNumberOrNull(attributeValue(restraint.attributes, 'ZCOSINE')),\n      frictionCoefficient: caesarNumberOrNull(attributeValue(restraint.attributes, 'FRIC_COEF')),",
  "      zCosine: caesarNumberOrNull(attributeValue(restraint.attributes, 'ZCOSINE')),\n      gap: caesarNumberOrNull(attributeValue(restraint.attributes, 'GAP')),\n      frictionCoefficient: caesarNumberOrNull(attributeValue(restraint.attributes, 'FRIC_COEF')),")
;

replaceOne(
  'src/core/linear-piping-analysis-consumer/inputxml-unit-normalization.js',
  `function normalizeNode(node, scale, index) {\n  requireRecord(node, \`inputXmlGeometry.nodes[\${index}]\`);\n  rejectUnknownNumericMetadata(node.meta, NODE_META_FIELDS, \`nodes[\${index}].meta\`);\n  rejectUnknownNumericFields(node, new Set(['x', 'y', 'z']), \`nodes[\${index}]\`);\n  return {\n    ...structuredClone(node),\n    x: scaleNumber(node.x, scale, \`nodes[\${index}].x\`),\n    y: scaleNumber(node.y, scale, \`nodes[\${index}].y\`),\n    z: scaleNumber(node.z, scale, \`nodes[\${index}].z\`),\n  };\n}`,
  `function normalizeNode(node, scale, index) {\n  requireRecord(node, \`inputXmlGeometry.nodes[\${index}]\`);\n  rejectUnknownNumericMetadata(node.meta, NODE_META_FIELDS, \`nodes[\${index}].meta\`);\n  rejectUnknownNumericFields(node, new Set(['x', 'y', 'z']), \`nodes[\${index}]\`);\n  const result = {\n    ...structuredClone(node),\n    x: scaleNumber(node.x, scale, \`nodes[\${index}].x\`),\n    y: scaleNumber(node.y, scale, \`nodes[\${index}].y\`),\n    z: scaleNumber(node.z, scale, \`nodes[\${index}].z\`),\n  };\n  if (Array.isArray(result.meta?.restraints)) {\n    result.meta.restraints = result.meta.restraints.map((restraint, restraintIndex) => ({\n      ...restraint,\n      gap: typeof restraint.gap === 'number'\n        ? scaleNumber(restraint.gap, scale, \`nodes[\${index}].meta.restraints[\${restraintIndex}].gap\`)\n        : restraint.gap,\n    }));\n  }\n  return result;\n}`,
);

replaceOne(
  'scripts/lfea-m034-bm4-solve-fixtures.mjs',
  "export const BM4_SOURCE_ID = 'CAESAR-II-BM4-LIVE-INPUTXML';\n",
  "export const BM4_SOURCE_ID = 'CAESAR-II-BM4-LIVE-INPUTXML';\nexport const BM4_M036_LIFTOFF_NODE_IDS = Object.freeze(['20090', '20350', '21470', '21610']);\n",
);

replaceOne(
  'scripts/lfea-m034-bm4-run-analysis.mjs',
  "// M034 Phase 2: real solve + CASE 19(SUS)/20(OPE)/21(EXP) comparison against\n",
  "// M034 Phase 2 remains the immutable bilateral before-baseline. M036's opt-in\n// active-set after-solve is qualified separately by lfea-m036-bm4-liftoff-check.mjs.\n// M034 Phase 2: real solve + CASE 19(SUS)/20(OPE)/21(EXP) comparison against\n",
);

const packagePath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts['check:lfea-m036'] = [
  'node scripts/lfea-unilateral-closed-form-check.mjs',
  'node scripts/lfea-unilateral-determinism-check.mjs',
  'node scripts/lfea-unilateral-linear-noop-check.mjs',
  'node scripts/lfea-m036-bm4-liftoff-check.mjs',
  'node scripts/lfea-unilateral-anti-drift-check.mjs',
].join(' && ');
if (!pkg.scripts['check:lfea-linear-core'].includes('check:lfea-m036')) {
  pkg.scripts['check:lfea-linear-core'] += ' && npm run check:lfea-m036';
}
fs.writeFileSync(packagePath, JSON.stringify(pkg));

console.log('M036 production wiring patch applied');
