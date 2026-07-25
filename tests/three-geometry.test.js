import { test, expect } from '@playwright/test';
import { buildResolvedEngineeringGeometry } from '../src/workspace/resolved-engineering-geometry.js';
import { buildViewportRenderModel } from '../src/workspace/viewport-render-model.js';

test.describe('Three.js Geometry Minimum Qualification Fixtures', () => {

  const createDataset = (entity) => ({
    schema: 'workspace-dataset/v1',
    datasetId: 'test-dataset',
    entities: [entity],
  });

  const generateModel = (entity) => {
    const dataset = createDataset(entity);
    const resolved = buildResolvedEngineeringGeometry(dataset);
    return buildViewportRenderModel(resolved);
  };

  test('PIPE component generates a tube primitive in the physical layer', () => {
    const model = generateModel({
      entityId: 'pipe-1',
      entityType: 'PIPE',
      properties: {
        geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 } },
        dimensions: { outerDiameterMm: 50 },
      },
    });

    expect(model.physicalPrimitives).toHaveLength(1);
    expect(model.supportOverlayPrimitives).toHaveLength(0);
    
    const p = model.physicalPrimitives[0];
    expect(p.kind).toBe('PIPE_TUBE');
    expect(p.primitiveId).toBe('visual:pipe-1:pipe_tube');
    expect(p.layer).toBe('PHYSICAL');
  });

  test('OLET component generates a frustum primitive mapped correctly', () => {
    const model = generateModel({
      entityId: 'olet-1',
      entityType: 'WELDOLET',
      properties: {
        geometry: { start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 50, z: 0 } },
        dimensions: { outerDiameterMm: 100, branchDiameterMm: 50 },
      },
    });

    expect(model.physicalPrimitives).toHaveLength(1);
    
    const p = model.physicalPrimitives[0];
    expect(p.componentKind).toBe('OLET');
    expect(p.kind).toBe('OLET_FRUSTUM');
    expect(p.primitiveId).toBe('visual:olet-1:olet_frustum');
  });

  test('TEE component generates three segments in physical layer', () => {
    const model = generateModel({
      entityId: 'tee-1',
      entityType: 'TEE',
      properties: {
        geometry: {
          start: { x: -50, y: 0, z: 0 },
          end: { x: 50, y: 0, z: 0 },
          center: { x: 0, y: 0, z: 0 },
          branchPoints: [{ x: 0, y: 50, z: 0 }],
        },
        dimensions: { outerDiameterMm: 100, branchDiameterMm: 50 },
      },
    });

    // Run legs (2) + Branch leg (1) = 3 primitives
    expect(model.physicalPrimitives).toHaveLength(3);
    expect(model.physicalPrimitives.map(p => p.kind).sort()).toEqual([
      'TEE_BRANCH',
      'TEE_LEG',
      'TEE_LEG',
    ]);
    expect(model.physicalPrimitives[0].primitiveId).toMatch(/^visual:tee-1:leg-0/);
  });

  test('SUPPORT component generates overlay primitives', () => {
    const model = generateModel({
      entityId: 'sup-1',
      entityType: 'GUIDE',
      category: 'support',
      properties: {
        geometry: { center: { x: 10, y: 20, z: 30 } },
        dimensions: { supportSizeMm: 150 },
      },
    });

    expect(model.physicalPrimitives).toHaveLength(0);
    expect(model.supportOverlayPrimitives).toHaveLength(1);
    
    const p = model.supportOverlayPrimitives[0];
    expect(p.componentKind).toBe('SUPPORT');
    expect(p.kind).toBe('SUPPORT_MARKER');
    expect(p.layer).toBe('SUPPORT');
  });

  test('Fallback geometries populate the diagnostic layer', () => {
    // A pipe without any geometry
    const model = generateModel({
      entityId: 'bad-pipe',
      entityType: 'PIPE',
      properties: {
        geometry: {},
      },
    });

    expect(model.physicalPrimitives).toHaveLength(0);
    expect(model.diagnosticPrimitives).toHaveLength(1);
    expect(model.diagnosticPrimitives[0].kind).toBe('FALLBACK_MARKER');
    expect(model.diagnosticPrimitives[0].layer).toBe('DIAGNOSTIC');
  });
});
