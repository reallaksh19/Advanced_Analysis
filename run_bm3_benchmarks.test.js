import { runExtendedSolver } from './src/calc-extended/solver/ExtendedSolver.js';

// Constants Used for Benchmarks
// Material: Carbon Steel (CS) -> E = 29.5 * 10^6 psi, alpha = 6.5 * 10^-6 in/in/degF
// Pipe: 8" NPS, SCH 40 (OD = 8.625", t = 0.322", I = 72.5 in^4)
// Method 1 (Fluor/Legacy): Zero axial friction.
// Method 2 (2D BUNDLE): Friction factor mu = 0.3 applied to anchor loads.

// Note: The ExtendedSolver logic applies thermal expansion delta based on internal DB lookups.
// The coefficients and equations used inside the solver will naturally derive similar outputs to the BM guide.

test('BM 2D-1: Simple L-Bend (Imperial Units)', () => {
    // Anchor A (0, 0)
    // Node B (50ft, 0) [Generator Leg = 50ft = 600in]
    // Anchor C (50ft, 20ft) [Absorber Leg = 20ft = 240in]

    const nodes = [
        { id: 'A', x: 0, y: 0, z: 0 },
        { id: 'B', x: 600, y: 0, z: 0 },
        { id: 'C', x: 600, y: 240, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'A', endNodeId: 'B' },
        { id: 'S2', startNodeId: 'B', endNodeId: 'C' }
    ];

    const payloadFLUOR = {
        nodes,
        segments,
        anchors: { anchor1: 'A', anchor2: 'C' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: 300,
            frictionFactor: 0.3,
            corrosionAllowance: 0, // Not explicitly mentioned, turn off for raw math
            millTolerance: 0 // Not explicitly mentioned, turn off for raw math
        },
        boundaryMovement: { x: 0, y: 0, z: 0 },
        vessel: { vesselOD: 0, vesselThk: 0, nozzleRad: 0, flangeClass: 150, designPress: 0, momentArm: 0 },
        constraints: { maxStress: 20000 },
        methodology: 'FLUOR'
    };

    const payload2D = { ...payloadFLUOR, methodology: '2D_BUNDLE' };

    const resF = runExtendedSolver(payloadFLUOR);
    const res2D = runExtendedSolver(payload2D);

    console.log("=== BM 2D-1: Simple L-Bend ===");
    console.log("FLUOR Output X-Ax: Stress =", resF.axes.X.stress.toFixed(2), "psi, Delta =", resF.axes.X.delta.toFixed(4), "in, Force = ", resF.axes.X.force.toFixed(2), "lbs");
    console.log("2D_BD Output X-Ax: Stress =", res2D.axes.X.stress.toFixed(2), "psi, Delta =", res2D.axes.X.delta.toFixed(4), "in, Force = ", res2D.axes.X.force.toFixed(2), "lbs");
});


test('BM 2D-2: Symmetric U-Bend (SI Units)', () => {
    // Note: The UI layer converts SI to Imperial before passing to the engine. We will mock the Imperial passing.
    // Anchor A (0, 0)
    // Node B (10m = 393.7in, 0)
    // Node C (10m = 393.7in, 5m = 196.85in)
    // Anchor D (20m = 787.4in, 5m = 196.85in)
    // Material & Condition: SS316 (Austenitic 18Cr 8Ni), T_oper = 150 C = 302 F

    const nodes = [
        { id: 'A', x: 0, y: 0, z: 0 },
        { id: 'B', x: 393.7, y: 0, z: 0 },
        { id: 'C', x: 393.7, y: 196.85, z: 0 },
        { id: 'D', x: 787.4, y: 196.85, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'A', endNodeId: 'B' },
        { id: 'S2', startNodeId: 'B', endNodeId: 'C' },
        { id: 'S3', startNodeId: 'C', endNodeId: 'D' }
    ];

    const payloadFLUOR = {
        nodes,
        segments,
        anchors: { anchor1: 'A', anchor2: 'D' },
        inputs: {
            material: 'Austenitic Stainless Steel 18 Cr 8 Ni',
            sizeNps: 8,
            schedule: '40',
            tOperate: 302,
            frictionFactor: 0.3,
            corrosionAllowance: 0,
            millTolerance: 0
        },
        boundaryMovement: { x: 0, y: 0, z: 0 },
        vessel: { vesselOD: 0, vesselThk: 0, nozzleRad: 0, flangeClass: 150, designPress: 0, momentArm: 0 },
        constraints: { maxStress: 20000 },
        methodology: 'FLUOR'
    };

    const resF = runExtendedSolver(payloadFLUOR);

    // Convert output PSI/lbs back to SI (MPa, kN) to compare with benchmark documentation
    // 1 psi = 0.00689476 MPa
    // 1 lb = 0.00444822 kN
    // 1 in = 25.4 mm

    console.log("=== BM 2D-2: Symmetric U-Bend ===");
    console.log("FLUOR Output X-Ax:");
    console.log("  Stress =", (resF.axes.X.stress * 0.00689476).toFixed(2), "MPa");
    console.log("  Force  =", (resF.axes.X.force * 0.00444822).toFixed(2), "kN");
    console.log("  Delta  =", (resF.axes.X.delta * 25.4).toFixed(2), "mm");
});

test('BM 2D-3: Elaborate Nested Loop (Anchor Load Evaluation)', () => {
    // Geometry Setup: A 100ft straight run broken by an expansion loop.
    // Loop Dimensions: Width = 20ft, Depth = 15ft.
    // A -> B: 480in (40ft Generator 1)
    // B -> C: 180in Y (15ft Absorber Up)
    // C -> D: 240in X (20ft Across)
    // D -> E: -180in Y (15ft Absorber Down)
    // E -> F: 480in X (40ft Generator 2)
    // CS, T_op = 300F

    const nodes = [
        { id: 'A', x: 0, y: 0, z: 0 },
        { id: 'B', x: 480, y: 0, z: 0 },
        { id: 'C', x: 480, y: 180, z: 0 },
        { id: 'D', x: 720, y: 180, z: 0 },
        { id: 'E', x: 720, y: 0, z: 0 },
        { id: 'F', x: 1200, y: 0, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'A', endNodeId: 'B' },
        { id: 'S2', startNodeId: 'B', endNodeId: 'C' },
        { id: 'S3', startNodeId: 'C', endNodeId: 'D' },
        { id: 'S4', startNodeId: 'D', endNodeId: 'E' },
        { id: 'S5', startNodeId: 'E', endNodeId: 'F' }
    ];

    const payloadFLUOR = {
        nodes,
        segments,
        anchors: { anchor1: 'A', anchor2: 'F' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: 300,
            frictionFactor: 0.3,
            corrosionAllowance: 0,
            millTolerance: 0
        },
        boundaryMovement: { x: 0, y: 0, z: 0 },
        vessel: { vesselOD: 0, vesselThk: 0, nozzleRad: 0, flangeClass: 150, designPress: 0, momentArm: 0 },
        constraints: { maxStress: 20000 },
        methodology: 'FLUOR'
    };

    const payload2D = { ...payloadFLUOR, methodology: '2D_BUNDLE' };

    const resF = runExtendedSolver(payloadFLUOR);
    const res2D = runExtendedSolver(payload2D);

    console.log("=== BM 2D-3: Elaborate Nested Loop ===");
    console.log("FLUOR Output X-Ax: Stress =", resF.axes.X.stress.toFixed(2), "psi, Delta =", resF.axes.X.delta.toFixed(4), "in, Force = ", resF.axes.X.force.toFixed(2), "lbs");
    console.log("2D_BD Output X-Ax: Stress =", res2D.axes.X.stress.toFixed(2), "psi, Delta =", res2D.axes.X.delta.toFixed(4), "in, Force = ", res2D.axes.X.force.toFixed(2), "lbs");
});

test('BM 3D-1: Spatial L-Bend', () => {
    // A 3D L-Bend: 30ft run on X-axis, 20ft run on Y-axis, 10ft drop on Z-axis.
    // X = 360in, Y = 240in, Z = 120in
    const nodes = [
        { id: 'N1', x: 0, y: 0, z: 0 },
        { id: 'N2', x: 360, y: 0, z: 0 },
        { id: 'N3', x: 360, y: 240, z: 0 },
        { id: 'N4', x: 360, y: 240, z: -120 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'N1', endNodeId: 'N2' },
        { id: 'S2', startNodeId: 'N2', endNodeId: 'N3' },
        { id: 'S3', startNodeId: 'N3', endNodeId: 'N4' }
    ];

    const payload = {
        nodes,
        segments,
        anchors: { anchor1: 'N1', anchor2: 'N4' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: 300,
            frictionFactor: 0.3,
            corrosionAllowance: 0,
            millTolerance: 0
        },
        boundaryMovement: { x: 0, y: 0, z: 0 },
        vessel: { vesselOD: 0, vesselThk: 0, nozzleRad: 0, flangeClass: 150, designPress: 0, momentArm: 0 },
        constraints: { maxStress: 20000 },
        methodology: 'FLUOR'
    };

    const res = runExtendedSolver(payload);

    console.log("=== BM 3D-1: Spatial L-Bend ===");
    console.log("X-Ax Delta =", res.axes.X.delta.toFixed(4), "in");
    console.log("Y-Ax Delta =", res.axes.Y.delta.toFixed(4), "in");
    console.log("Z-Ax Delta =", res.axes.Z.delta.toFixed(4), "in");
});

test('BM 3D-2: Elevation Loop', () => {
    // 100ft header on X-axis. Interrupted by an elevation loop crossing over an obstacle:
    // 15ft Up (Z), 20ft Across (X), 15ft Down (-Z).
    // Start at origin. Header segment 1 = 40ft (480in)
    // Loop up = 15ft (180in) Z
    // Loop across = 20ft (240in) X
    // Loop down = 15ft (-180in) Z
    // Header segment 2 = 40ft (480in) X

    const nodes = [
        { id: 'N1', x: 0, y: 0, z: 0 },
        { id: 'N2', x: 480, y: 0, z: 0 },
        { id: 'N3', x: 480, y: 0, z: 180 },
        { id: 'N4', x: 720, y: 0, z: 180 },
        { id: 'N5', x: 720, y: 0, z: 0 },
        { id: 'N6', x: 1200, y: 0, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'N1', endNodeId: 'N2' },
        { id: 'S2', startNodeId: 'N2', endNodeId: 'N3' },
        { id: 'S3', startNodeId: 'N3', endNodeId: 'N4' },
        { id: 'S4', startNodeId: 'N4', endNodeId: 'N5' },
        { id: 'S5', startNodeId: 'N5', endNodeId: 'N6' }
    ];

    const payload = {
        nodes,
        segments,
        anchors: { anchor1: 'N1', anchor2: 'N6' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: 300,
            frictionFactor: 0.3,
            corrosionAllowance: 0,
            millTolerance: 0
        },
        boundaryMovement: { x: 0, y: 0, z: 0 },
        vessel: { vesselOD: 0, vesselThk: 0, nozzleRad: 0, flangeClass: 150, designPress: 0, momentArm: 0 },
        constraints: { maxStress: 20000 },
        methodology: 'FLUOR'
    };

    const res = runExtendedSolver(payload);

    console.log("=== BM 3D-2: Elevation Loop ===");
    console.log("X-Ax: Stress =", res.axes.X.stress.toFixed(2), "psi, Delta =", res.axes.X.delta.toFixed(4), "in");
});

test('BM 3D-3: Multi-Anchor Branch', () => {
    // Header A1 (0,0,0) to A2 (80ft=960in,0,0).
    // Branch Tee at (40ft=480in,0,0) drops to A3 (40ft=480in, 20ft=240in, 0).
    // Note: The extended solver analyzes the longest route and highest load path. We will mimic calculating the branch path as requested.
    // The benchmark requests the analysis of Path 2 (A1 to A3).
    // So anchors are A1(0,0,0) to A3(480,240,0).

    const nodes = [
        { id: 'A1', x: 0, y: 0, z: 0 },
        { id: 'TEE', x: 480, y: 0, z: 0 },
        { id: 'A3', x: 480, y: 240, z: 0 } // Path 2 anchors
    ];

    const segments = [
        { id: 'S1', startNodeId: 'A1', endNodeId: 'TEE' },
        { id: 'S2', startNodeId: 'TEE', endNodeId: 'A3' }
    ];

    const payload = {
        nodes,
        segments,
        anchors: { anchor1: 'A1', anchor2: 'A3' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: 300,
            frictionFactor: 0.3,
            corrosionAllowance: 0,
            millTolerance: 0
        },
        boundaryMovement: { x: 0, y: 0, z: 0 },
        vessel: { vesselOD: 0, vesselThk: 0, nozzleRad: 0, flangeClass: 150, designPress: 0, momentArm: 0 },
        constraints: { maxStress: 20000 },
        methodology: 'FLUOR'
    };

    const res = runExtendedSolver(payload);

    console.log("=== BM 3D-3: Multi-Anchor Branch (Path 2) ===");
    console.log("X-Ax: Stress =", res.axes.X.stress.toFixed(2), "psi, Delta =", res.axes.X.delta.toFixed(4), "in");
});
