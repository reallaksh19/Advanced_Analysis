import { runExtendedSolver } from './src/calc-extended/solver/ExtendedSolver.js';
import { formatUnit, MetricToImperial } from './src/calc-extended/utils/units.js';

// Helper to convert SI Nodes (meters) to Imperial Nodes (inches) for the Engine Payload
const preProcessNodes = (nodes_m) => {
    return nodes_m.map(n => ({
        id: n.id,
        x: MetricToImperial.m_to_ft(n.x) * 12, // Engine takes inches for geometry
        y: MetricToImperial.m_to_ft(n.y) * 12,
        z: MetricToImperial.m_to_ft(n.z) * 12
    }));
};

// --- BM_SI 2D-1: Simple L-Bend ---
test('BM_SI 2D-1: Simple L-Bend', () => {
    // Original Imperial: B(50ft, 0) -> C(50ft, 20ft) | T = 300F
    // SI Version: B(15.24m, 0) -> C(15.24m, 6.096m) | T = 148.889C
    const nodes_si = [
        { id: 'A', x: 0, y: 0, z: 0 },
        { id: 'B', x: 15.24, y: 0, z: 0 },
        { id: 'C', x: 15.24, y: 6.096, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'A', endNodeId: 'B' },
        { id: 'S2', startNodeId: 'B', endNodeId: 'C' }
    ];

    // UI Pre-Processing: convert SI inputs to Imperial
    const tOperate_F = MetricToImperial.C_to_F(148.889);

    const payloadFLUOR = {
        nodes: preProcessNodes(nodes_si),
        segments,
        anchors: { anchor1: 'A', anchor2: 'C' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: tOperate_F,
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

    console.log("=== BM_SI 2D-1: Simple L-Bend ===");
    console.log("FLUOR Output X-Ax: Stress =", formatUnit('SI', 'pressure', resF.axes.X.stress), "MPa, Delta =", formatUnit('SI', 'shortLength', resF.axes.X.delta), "mm, Force =", formatUnit('SI', 'force', resF.axes.X.force), "N");
    console.log("2D_BD Output X-Ax: Stress =", formatUnit('SI', 'pressure', res2D.axes.X.stress), "MPa, Delta =", formatUnit('SI', 'shortLength', res2D.axes.X.delta), "mm, Force =", formatUnit('SI', 'force', res2D.axes.X.force), "N");
});

// --- BM_SI 2D-2: Symmetric U-Bend ---
test('BM_SI 2D-2: Symmetric U-Bend', () => {
    // Original SI: B(10m, 0) -> C(10m, 5m) -> D(20m, 5m) | T = 150C
    const nodes_si = [
        { id: 'A', x: 0, y: 0, z: 0 },
        { id: 'B', x: 10, y: 0, z: 0 },
        { id: 'C', x: 10, y: 5, z: 0 },
        { id: 'D', x: 20, y: 5, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'A', endNodeId: 'B' },
        { id: 'S2', startNodeId: 'B', endNodeId: 'C' },
        { id: 'S3', startNodeId: 'C', endNodeId: 'D' }
    ];

    const payloadFLUOR = {
        nodes: preProcessNodes(nodes_si),
        segments,
        anchors: { anchor1: 'A', anchor2: 'D' },
        inputs: {
            material: 'Austenitic Stainless Steel 18 Cr 8 Ni',
            sizeNps: 8,
            schedule: '40',
            tOperate: MetricToImperial.C_to_F(150),
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

    console.log("=== BM_SI 2D-2: Symmetric U-Bend ===");
    console.log("FLUOR Output X-Ax: Stress =", formatUnit('SI', 'pressure', resF.axes.X.stress), "MPa, Delta =", formatUnit('SI', 'shortLength', resF.axes.X.delta), "mm");
});

// --- BM_SI 2D-3: Elaborate Nested Loop ---
test('BM_SI 2D-3: Elaborate Nested Loop', () => {
    // Original Imperial: Loop w=20ft, h=15ft, runs=40ft | T=300F
    // SI Version: Runs=12.192m, h=4.572m, w=6.096m | T=148.889C
    const nodes_si = [
        { id: 'A', x: 0, y: 0, z: 0 },
        { id: 'B', x: 12.192, y: 0, z: 0 },
        { id: 'C', x: 12.192, y: 4.572, z: 0 },
        { id: 'D', x: 18.288, y: 4.572, z: 0 },
        { id: 'E', x: 18.288, y: 0, z: 0 },
        { id: 'F', x: 30.48, y: 0, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'A', endNodeId: 'B' },
        { id: 'S2', startNodeId: 'B', endNodeId: 'C' },
        { id: 'S3', startNodeId: 'C', endNodeId: 'D' },
        { id: 'S4', startNodeId: 'D', endNodeId: 'E' },
        { id: 'S5', startNodeId: 'E', endNodeId: 'F' }
    ];

    const payloadFLUOR = {
        nodes: preProcessNodes(nodes_si),
        segments,
        anchors: { anchor1: 'A', anchor2: 'F' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: MetricToImperial.C_to_F(148.889),
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

    console.log("=== BM_SI 2D-3: Elaborate Nested Loop ===");
    console.log("FLUOR Output X-Ax: Stress =", formatUnit('SI', 'pressure', resF.axes.X.stress), "MPa, Delta =", formatUnit('SI', 'shortLength', resF.axes.X.delta), "mm, Force =", formatUnit('SI', 'force', resF.axes.X.force), "N");
    console.log("2D_BD Output X-Ax: Stress =", formatUnit('SI', 'pressure', res2D.axes.X.stress), "MPa, Delta =", formatUnit('SI', 'shortLength', res2D.axes.X.delta), "mm, Force =", formatUnit('SI', 'force', res2D.axes.X.force), "N");
});

// --- BM_SI 3D-1: Spatial L-Bend ---
test('BM_SI 3D-1: Spatial L-Bend', () => {
    // Original Imperial: 30ft X, 20ft Y, 10ft Z | T=300F
    // SI Version: 9.144m X, 6.096m Y, -3.048m Z | T=148.889C
    const nodes_si = [
        { id: 'N1', x: 0, y: 0, z: 0 },
        { id: 'N2', x: 9.144, y: 0, z: 0 },
        { id: 'N3', x: 9.144, y: 6.096, z: 0 },
        { id: 'N4', x: 9.144, y: 6.096, z: -3.048 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'N1', endNodeId: 'N2' },
        { id: 'S2', startNodeId: 'N2', endNodeId: 'N3' },
        { id: 'S3', startNodeId: 'N3', endNodeId: 'N4' }
    ];

    const payload = {
        nodes: preProcessNodes(nodes_si),
        segments,
        anchors: { anchor1: 'N1', anchor2: 'N4' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: MetricToImperial.C_to_F(148.889),
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

    console.log("=== BM_SI 3D-1: Spatial L-Bend ===");
    console.log("X-Ax Delta =", formatUnit('SI', 'shortLength', res.axes.X.delta), "mm");
    console.log("Y-Ax Delta =", formatUnit('SI', 'shortLength', res.axes.Y.delta), "mm");
    console.log("Z-Ax Delta =", formatUnit('SI', 'shortLength', res.axes.Z.delta), "mm");
});

// --- BM_SI 3D-2: Elevation Loop ---
test('BM_SI 3D-2: Elevation Loop', () => {
    // Original Imperial: Loop up 15ft, across 20ft, down 15ft. Runs=40ft | T=300F
    // SI Version: Loop up 4.572m, across 6.096m, down -4.572m. Runs=12.192m | T=148.889C
    const nodes_si = [
        { id: 'N1', x: 0, y: 0, z: 0 },
        { id: 'N2', x: 12.192, y: 0, z: 0 },
        { id: 'N3', x: 12.192, y: 0, z: 4.572 },
        { id: 'N4', x: 18.288, y: 0, z: 4.572 },
        { id: 'N5', x: 18.288, y: 0, z: 0 },
        { id: 'N6', x: 30.48, y: 0, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'N1', endNodeId: 'N2' },
        { id: 'S2', startNodeId: 'N2', endNodeId: 'N3' },
        { id: 'S3', startNodeId: 'N3', endNodeId: 'N4' },
        { id: 'S4', startNodeId: 'N4', endNodeId: 'N5' },
        { id: 'S5', startNodeId: 'N5', endNodeId: 'N6' }
    ];

    const payload = {
        nodes: preProcessNodes(nodes_si),
        segments,
        anchors: { anchor1: 'N1', anchor2: 'N6' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: MetricToImperial.C_to_F(148.889),
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

    console.log("=== BM_SI 3D-2: Elevation Loop ===");
    console.log("X-Ax: Stress =", formatUnit('SI', 'pressure', res.axes.X.stress), "MPa, Delta =", formatUnit('SI', 'shortLength', res.axes.X.delta), "mm");
});

// --- BM_SI 3D-3: Multi-Anchor Branch ---
test('BM_SI 3D-3: Multi-Anchor Branch', () => {
    // Original Imperial: Header TEE at 40ft, branch to A3 at 40ft,20ft | T=300F
    // SI Version: TEE at 12.192m, branch A3 at 12.192m, 6.096m | T=148.889C
    const nodes_si = [
        { id: 'A1', x: 0, y: 0, z: 0 },
        { id: 'TEE', x: 12.192, y: 0, z: 0 },
        { id: 'A3', x: 12.192, y: 6.096, z: 0 }
    ];

    const segments = [
        { id: 'S1', startNodeId: 'A1', endNodeId: 'TEE' },
        { id: 'S2', startNodeId: 'TEE', endNodeId: 'A3' }
    ];

    const payload = {
        nodes: preProcessNodes(nodes_si),
        segments,
        anchors: { anchor1: 'A1', anchor2: 'A3' },
        inputs: {
            material: 'Carbon Steel',
            sizeNps: 8,
            schedule: '40',
            tOperate: MetricToImperial.C_to_F(148.889),
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

    console.log("=== BM_SI 3D-3: Multi-Anchor Branch (Path 2) ===");
    console.log("X-Ax: Stress =", formatUnit('SI', 'pressure', res.axes.X.stress), "MPa, Delta =", formatUnit('SI', 'shortLength', res.axes.X.delta), "mm");
});
