/**
 * BENCHMARK UPDATE LOG:
 * 2026-04-27 — Agent 1-GC3D fixed double SRSS combination (G-1).
 *   Expected SE values updated. New values verified by hand calculation.
 *   Previous values archived in benchmarks/expected/3d/archive-pre-srss-fix/.
 * 2026-04-27 — Agent 1-EXT fixed force formula unit (E-1, ×1728 not ×144).
 *   Force expected values updated. Stress values unchanged.
 */

import { runExtendedSolver } from './src/calc-extended/solver/ExtendedSolver.js';

test('BM 3D-A: Complex Rigidity', () => {
    // An 8-element pipeline spanning X, Y, and Z axes. Includes a specific short-drop on the Z-axis (2.5ft = 30in) which the engine's Rule of Rigidity must filter out and ignore for flexibility calculations.
    // Alloy Steel, T_oper = 250 C = 482 F

    const nodes = [
        { id: 'N1', x: 0, y: 0, z: 0 },
        { id: 'N2', x: 120, y: 0, z: 0 }, // 10ft X
        { id: 'N3', x: 120, y: 120, z: 0 }, // 10ft Y
        { id: 'N4', x: 240, y: 120, z: 0 }, // 10ft X
        { id: 'N5', x: 240, y: 120, z: 30 }, // 2.5ft Z (SHORT DROP)
        { id: 'N6', x: 360, y: 120, z: 30 }, // 10ft X
        { id: 'N7', x: 360, y: 0, z: 30 }, // 10ft -Y
        { id: 'N8', x: 360, y: 0, z: 270 } // 20ft Z (Long Drop)
    ];

    const segments = [
        { id: 'S1', startNodeId: 'N1', endNodeId: 'N2' },
        { id: 'S2', startNodeId: 'N2', endNodeId: 'N3' },
        { id: 'S3', startNodeId: 'N3', endNodeId: 'N4' },
        { id: 'S4', startNodeId: 'N4', endNodeId: 'N5' }, // Short drop
        { id: 'S5', startNodeId: 'N5', endNodeId: 'N6' },
        { id: 'S6', startNodeId: 'N6', endNodeId: 'N7' },
        { id: 'S7', startNodeId: 'N7', endNodeId: 'N8' }
    ];

    const payload = {
        nodes,
        segments,
        anchors: { anchor1: 'N1', anchor2: 'N8' },
        inputs: {
            material: 'Austenitic Stainless Steel 18 Cr 8 Ni', // Closest to Alloy Steel
            sizeNps: 8,
            schedule: '40',
            tOperate: 482,
            frictionFactor: 0.3,
            corrosionAllowance: 0.125,
            millTolerance: 12.5
        },
        boundaryMovement: { x: 0, y: 0, z: 0 },
        vessel: { vesselOD: 72, vesselThk: 0.5, nozzleRad: 6, flangeClass: 300, designPress: 450, momentArm: 12 },
        constraints: [],
        methodology: 'FLUOR'
    };

    const res = runExtendedSolver(payload);
    console.log("=== BM 3D-A: Complex Rigidity ===");
    console.log("Z-Axis Bending Leg Length Used (in):", res.axes.Z.bendingLeg);
    console.log("Expected: 120 + 120 + 120 = 360in. 30in short drop should be excluded.");
});

test('BM 3D-C: Vessel Nozzle MIST & Flange', () => {
    // Short rigid pipe, T = 600 F, 300# rating.
    // Expect: Flange leak FAIL
    const nodes = [
        { id: 'V1', x: 0, y: 0, z: 0 },
        { id: 'V2', x: 60, y: 0, z: 0 } // 5ft straight
    ];
    const segments = [
        { id: 'S1', startNodeId: 'V1', endNodeId: 'V2' }
    ];

    const payload = {
        nodes,
        segments,
        anchors: { anchor1: 'V1', anchor2: 'V2' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 16,
            schedule: '40',
            tOperate: 600,
            frictionFactor: 0.3,
            corrosionAllowance: 0.125,
            millTolerance: 12.5
        },
        boundaryMovement: { x: 0, y: 0, z: 0 },
        vessel: { vesselOD: 72, vesselThk: 0.5, nozzleRad: 6, flangeClass: 300, designPress: 450, momentArm: 24 },
        constraints: [],
        methodology: 'FLUOR'
    };

    const res = runExtendedSolver(payload);
    console.log("=== BM 3D-C: Vessel Nozzle MIST & Koves Flange ===");
    console.log("Flange Status:", res.flange.status, "Eq Load:", res.flange.equivalentLoad.toFixed(2), "Allowable:", res.flange.allowableCapacity.toFixed(2));
    console.log("MIST Status:", res.mist.status, "Interaction Ratio:", res.mist.interactionRatio.toFixed(3));
});
