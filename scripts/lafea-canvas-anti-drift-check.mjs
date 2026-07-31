// scripts/lafea-canvas-anti-drift-check.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/workspace/lafea-canvas');

const forbidden = [
  {
    code: 'RENDERER_FEA_CALCULATION',
    pattern:
      /assembleGlobal|stiffness|constitutive|solveSystem|vonMises\s*=|membraneStress\s*=|utilization\s*=/u,
  },
  {
    code: 'RENDERER_STRESS_AVERAGING',
    pattern:
      /averageStress|smoothStress|nodalStressFromElements|recoverStress/u,
  },
  {
    code: 'RENDERER_TOPOLOGY_REPAIR',
    pattern:
      /repairMesh|mergeNodes|flipElement|removeHole|retriangulate/u,
  },
  {
    code: 'RANDOM_ENGINEERING_IDENTITY',
    pattern: /Math\.random|randomUUID/u,
  },
  {
    code: 'LOCALE_DEPENDENT_ORDERING',
    pattern: /localeCompare/u,
  },
  {
    code: 'HIDDEN_RENDER_THRESHOLD',
    pattern: /(?:5000|10000|50000|100000|250000).*(?:SVG|WEBGL)/u,
  },
  {
    code: 'DIRECT_CORE_SOLVER_IMPORT',
    pattern:
      /from\s+['"][^'"]*\/(?:solver|mesher|recovery|code-engine)[^'"]*['"]/u,
  },
  {
    code: 'SEPARATE_RENDERER_SOURCE_STORE',
    pattern:
      /createSvgSourceStore|createWebglSourceStore|webglEngineeringModel/u,
  },
];

const files = walk(ROOT).filter((file) => file.endsWith('.js'));

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const physicalLineCount = source.split(/\r?\n/u).length;

  assert.ok(
    physicalLineCount <= 300,
    `MODULE_LINE_LIMIT_EXCEEDED: ${file} has ${physicalLineCount} lines`,
  );

  for (const rule of forbidden) {
    assert.doesNotMatch(
      source,
      rule.pattern,
      `${rule.code}: ${file}`,
    );
  }
}

const slotContracts = [
  {
    file: path.join(ROOT, 'render-packet-contract.js'),
    slotId: 'C3-PACK-QUALIFIED-MESH',
  },
  {
    file: path.join(ROOT, 'three-mesh-renderer.js'),
    slotId: 'C3-CREATE-MATERIAL',
  },
];

for (const slot of slotContracts) {
  const source = fs.readFileSync(slot.file, 'utf8');
  const begin = `BEGIN_AGENT_FILL:${slot.slotId}`;
  const end = `END_AGENT_FILL:${slot.slotId}`;

  assert.equal(count(source, begin), 1, `Missing or duplicate ${begin}`);
  assert.equal(count(source, end), 1, `Missing or duplicate ${end}`);
  assert.ok(source.indexOf(begin) < source.indexOf(end), `Invalid slot order: ${slot.slotId}`);
}

console.log('LAFEA canvas anti-drift check PASS');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    });
}

function count(source, token) {
  return source.split(token).length - 1;
}
