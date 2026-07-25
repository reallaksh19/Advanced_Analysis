import { exportSketchGraphToPCFX, importPCFXToSketchGraph, validatePCFXRoundtrip } from '../src/core/pcfx/pcfxRoundtripAdapter.js';

console.log('=== V15 PCFX Roundtrip Behavior Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

// Bend test
console.log('Bend Test:');
{
  const bendGraph = {
    nodes: {
      A: { type: 'free', pos: [0, 0, 0] },
      B: {
        type: 'elbow',
        pos: [1000, 0, 0],
        rawAttributes: { CA97: 'BEND-REF' },
        meta: { componentData: { status: 'SCREENING_SAMPLE', c2e_in: 12 } }
      },
      C: { type: 'free', pos: [1000, 1000, 0] }
    },
    segments: [
      { id: 'S1', startNode: 'A', endNode: 'B' },
      { id: 'S2', startNode: 'B', endNode: 'C' }
    ]
  };

  const pcfx = exportSketchGraphToPCFX(bendGraph);
  const imported = importPCFXToSketchGraph(pcfx);
  const validation = validatePCFXRoundtrip(bendGraph, imported);

  test('bend', validation.ok, 'Roundtrip validation passed');
  test('bend', imported.nodes.B.type === 'elbow', 'Elbow type preserved');
  test('bend', imported.nodes.B.meta?.componentData, 'Component data preserved');
  test('bend', pcfx.components.length === 1, 'One component exported');
  test('bend', pcfx.components[0]?.componentType === 'ELBOW', 'Component type is ELBOW');
}

// Tee test
console.log('\nTee Test:');
{
  const teeGraph = {
    nodes: {
      W: { type: 'free', pos: [-1000, 0, 0] },
      T: {
        type: 'tee',
        pos: [0, 0, 0],
        rawAttributes: { CA97: 'TEE-REF' },
        meta: { componentData: { status: 'SCREENING_SAMPLE' } }
      },
      E: { type: 'free', pos: [1000, 0, 0] },
      N: { type: 'free', pos: [0, 1000, 0] }
    },
    segments: [
      { id: 'WEST', startNode: 'W', endNode: 'T' },
      { id: 'EAST', startNode: 'T', endNode: 'E' },
      { id: 'BRANCH', startNode: 'T', endNode: 'N' }
    ]
  };

  const pcfx = exportSketchGraphToPCFX(teeGraph);
  const imported = importPCFXToSketchGraph(pcfx);

  test('tee', imported.nodes.T.type === 'tee', 'Tee type preserved');
  test('tee', imported.nodes.T.meta?.componentData, 'Component data preserved');
  test('tee', pcfx.components[0]?.componentType === 'TEE', 'Component type is TEE');
}

// Olet test
console.log('\nOlet Test:');
{
  const oletGraph = {
    nodes: {
      W: { type: 'free', pos: [-1000, 0, 0] },
      O: {
        type: 'olet',
        pos: [0, 0, 0],
        rawAttributes: { CA97: 'OLET-REF' },
        meta: { componentData: { status: 'SCREENING_SAMPLE', BRLEN_in: 6 } }
      },
      E: { type: 'free', pos: [1000, 0, 0] },
      N: { type: 'free', pos: [0, 1000, 0] }
    },
    segments: [
      { id: 'WEST', startNode: 'W', endNode: 'O' },
      { id: 'EAST', startNode: 'O', endNode: 'E' },
      { id: 'BRANCH', startNode: 'O', endNode: 'N' }
    ]
  };

  const pcfx = exportSketchGraphToPCFX(oletGraph);
  const imported = importPCFXToSketchGraph(pcfx);

  test('olet', imported.nodes.O.type === 'olet', 'Olet type preserved');
  test('olet', imported.nodes.O.meta?.componentData, 'Component data preserved');
  test('olet', pcfx.components[0]?.componentType === 'OLET', 'Component type is OLET');
}

// Missing component test
console.log('\nMissing Component Test:');
{
  const missingGraph = {
    nodes: {
      A: {
        type: 'elbow',
        pos: [0, 0, 0],
        meta: { componentData: { status: 'MISSING_COMPONENT_DATA' } }
      },
      B: { type: 'free', pos: [1000, 0, 0] },
      C: { type: 'free', pos: [0, 1000, 0] }
    },
    segments: [
      { id: 'S1', startNode: 'A', endNode: 'B' },
      { id: 'S2', startNode: 'A', endNode: 'C' }
    ]
  };

  const pcfx = exportSketchGraphToPCFX(missingGraph);

  test('missing', pcfx.lossContract.length > 0, 'Loss contract has entry');
  const hasMissingEntry = pcfx.lossContract.some(
    entry => entry.code === 'COMPONENT_DATA_NOT_QUALIFIED'
  );
  test('missing', hasMissingEntry, 'Loss contract contains COMPONENT_DATA_NOT_QUALIFIED');
}

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}/${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
