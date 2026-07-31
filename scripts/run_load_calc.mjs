import fs from 'fs';
import path from 'path';
import { normalizeCalculationWorkspacePackage } from '../src/calc-workspace/workspaceModel.js';
import { buildEngineeringLoadDistribution, VISIBLE_ENGINEERING_LOAD_CONFIG } from '../src/calc-workspace/engineering-loads/engines/engineeringLoadEngine.js';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: node run_load_calc.mjs <path-to-json>');
  process.exit(1);
}

function synthesizeChainage(rawData) {
  // Simple chainage synthesizer to mimic Topology Validator
  let currentChainage = 0;
  
  function getPos(node) {
    const p = node.attributes?.POS || node.attributes?.APOS || node.attributes?.HPOS || node.attributes?.TPOS;
    return p ? { x: Number(p.x||0), y: Number(p.y||0), z: Number(p.z||0) } : null;
  }
  
  function dist(p1, p2) {
    if(!p1 || !p2) return 0;
    return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
  }

  function traverse(nodes, lastPos = null) {
    if(!nodes) return;
    for (const node of nodes) {
      if(!node.attributes) node.attributes = {};
      const pos = getPos(node);
      
      const length = dist(lastPos, pos);
      currentChainage += length;
      
      node.attributes.CHAINAGE_CENTER_MM = currentChainage;
      
      if(node.type === 'PIPE' || node.type === 'BEND') {
         node.attributes.CHAINAGE_START_MM = currentChainage - (length / 2);
         node.attributes.CHAINAGE_END_MM = currentChainage + (length / 2);
      } else {
         node.attributes.CHAINAGE_START_MM = currentChainage;
         node.attributes.CHAINAGE_END_MM = currentChainage;
      }
      
      traverse(node.children, pos || lastPos);
    }
  }
  
  if(rawData.objects) traverse(rawData.objects);
  else if(Array.isArray(rawData)) traverse(rawData);
}

import { analyzeTopologyOverlaps } from '../src/calc-workspace/cii-standalone-port/core/topology-autofix.js';

async function run() {
  console.log('Reading input dataset from:', inputPath);
  const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  console.log('Applying Topology Autofix Engine...');
  const allNodes = [];
  function collect(nodes) {
    if (!nodes) return;
    for (const n of nodes) {
      allNodes.push(n);
      collect(n.children);
    }
  }
  collect(rawData.objects || rawData);
  
  const autofixResults = analyzeTopologyOverlaps(allNodes, 1.0);
  console.log(`Detected ${autofixResults.merges.length} overlaps to merge.`);
  
  // Mutate original tree elements to apply IGNORED_OVERLAP
  const absorbedNames = new Set(autofixResults.merges.flatMap(m => m.absorbed.map(a => a.name)));
  allNodes.forEach(n => {
    if (absorbedNames.has(n.name)) {
      if (!n.attributes) n.attributes = {};
      n.attributes.IGNORED_OVERLAP = true;
      n.type = 'IGNORED_SUPPORT'; // Change type so parsing skips it entirely
    }
  });

  console.log('Synthesizing missing chainage...');
  synthesizeChainage(rawData);

  console.log('1. Normalizing calculation workspace...');
  const workspace = normalizeCalculationWorkspacePackage(rawData, 'benchmark', new Date().toISOString());

  console.log('2. Building Engineering Load Distribution...');
  // Note: VISIBLE_ENGINEERING_LOAD_CONFIG has been updated in the engine to assume Vertical Capability for ATTA, REST, WP, etc.
  const distribution = buildEngineeringLoadDistribution(workspace, VISIBLE_ENGINEERING_LOAD_CONFIG, new Date().toISOString());

  const outputJsonPath = path.join('F:\\CODE-6\\Advanced_Analysis', 'load_calc_output.json');
  fs.writeFileSync(outputJsonPath, JSON.stringify(distribution, null, 2));
  console.log('Saved actual JSON to:', outputJsonPath);

  const csvLines = [];
  csvLines.push('supportId,name,supportType,branchName,boreMm,chainageMm,x,y,z,verticalLoadOpeKg,verticalLoadOpeN,verticalLoadHydKg,verticalLoadHydN,contributionCount');
  
  if (distribution.supports) {
    for (const s of distribution.supports) {
      csvLines.push(`${s.supportId},${s.name},${s.supportType},${s.branchName || ''},${s.boreMm || ''},${s.chainageMm || 0},${s.position.x || 0},${s.position.y || 0},${s.position.z || 0},${s.verticalLoadOpeKg || 0},${s.verticalLoadOpeN || 0},${s.verticalLoadHydKg || 0},${s.verticalLoadHydN || 0},${s.contributions?.length || 0}`);
    }
  }
  
  const outputCsvPath = path.join('F:\\CODE-6\\Advanced_Analysis', 'load_calc_output.csv');
  fs.writeFileSync(outputCsvPath, csvLines.join('\n'));
  console.log('Saved actual CSV to:', outputCsvPath);
  
  console.log(`Successfully processed ${distribution.supports?.length || 0} supports.`);
  console.log(`Unsupported weight remaining (OPE Kg): ${distribution.totals?.unsupportedWeightOpeKg || 0}`);
}

run().catch(console.error);
