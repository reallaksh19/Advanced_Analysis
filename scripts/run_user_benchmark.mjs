import fs from 'fs';
import { normalizeCalculationWorkspacePackage } from '../src/calc-workspace/workspaceModel.js';
import { buildEngineeringLoadDistribution, VISIBLE_ENGINEERING_LOAD_CONFIG } from '../src/calc-workspace/engineering-loads/engines/engineeringLoadEngine.js';

const inputPath = 'D:\\Code3\\Vertical load benchmark\\benchmark_30_complex_3d_support_load_stagedjson.json';
const outputCsvPath = 'F:\\CODE-6\\Advanced_Analysis\\benchmark_actual_supports.csv';
const outputJsonPath = 'F:\\CODE-6\\Advanced_Analysis\\benchmark_actual.json';

const expectedJsonPath = 'D:\\Code3\\Vertical load benchmark\\benchmark_30_complex_3d_support_load_expected.json';
const expectedCsvPath = 'D:\\Code3\\Vertical load benchmark\\benchmark_30_complex_3d_support_load_expected_supports.csv';

async function run() {
  console.log('Reading input dataset from:', inputPath);
  const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  console.log('1. Normalizing calculation workspace...');
  const workspace = normalizeCalculationWorkspacePackage(rawData, 'benchmark', new Date().toISOString());

  console.log('2. Building Engineering Load Distribution...');
  const distribution = buildEngineeringLoadDistribution(workspace, VISIBLE_ENGINEERING_LOAD_CONFIG, new Date().toISOString());

  fs.writeFileSync(outputJsonPath, JSON.stringify(distribution, null, 2));
  console.log('Saved actual JSON to:', outputJsonPath);

  const csvLines = [];
  csvLines.push('supportId,name,chainageMm,x,y,z,verticalLoadOpeKg,verticalLoadOpeN,verticalLoadHydKg,verticalLoadHydN,contributionCount');
  
  if (distribution.supports) {
    for (const s of distribution.supports) {
      csvLines.push(`${s.supportId},${s.name},${s.chainageMm || 0},${s.position.x || 0},${s.position.y || 0},${s.position.z || 0},${s.verticalLoadOpeKg || 0},${s.verticalLoadOpeN || 0},${s.verticalLoadHydKg || 0},${s.verticalLoadHydN || 0},${s.contributions?.length || 0}`);
    }
  }
  
  fs.writeFileSync(outputCsvPath, csvLines.join('\\n'));
  console.log('Saved actual CSV to:', outputCsvPath);

  console.log('\\n--- COMPARISON ---');
  let expectedJson = {};
  try {
    expectedJson = JSON.parse(fs.readFileSync(expectedJsonPath, 'utf8'));
  } catch (e) {
    console.error('Could not read expected JSON:', e.message);
  }
  
  console.log(`Expected supports: ${expectedJson.supports?.length}, Actual supports: ${distribution.supports?.length}`);
  
  // Compare values directly
  if (expectedJson.supports && distribution.supports) {
    for (const expectedSupport of expectedJson.supports) {
      const actualSupport = distribution.supports.find(a => a.supportId === expectedSupport.supportId);
      if (!actualSupport) {
        console.log(`Missing support in actual: ${expectedSupport.supportId}`);
        continue;
      }
      
      const opeDiff = Math.abs((expectedSupport.verticalLoadOpeN || 0) - (actualSupport.verticalLoadOpeN || 0));
      const hydDiff = Math.abs((expectedSupport.verticalLoadHydN || 0) - (actualSupport.verticalLoadHydN || 0));
      const opeKgDiff = Math.abs((expectedSupport.verticalLoadOpeKg || 0) - (actualSupport.verticalLoadOpeKg || 0));
      const hydKgDiff = Math.abs((expectedSupport.verticalLoadHydKg || 0) - (actualSupport.verticalLoadHydKg || 0));
      
      console.log(`Support ${expectedSupport.supportId}: Ope N Diff = ${opeDiff.toFixed(2)}, Hyd N Diff = ${hydDiff.toFixed(2)}, Ope Kg Diff = ${opeKgDiff.toFixed(2)}, Hyd Kg Diff = ${hydKgDiff.toFixed(2)}`);
    }
  }
}

run().catch(console.error);
