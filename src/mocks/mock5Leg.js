/**
 * 5-leg 3D geometry mock representing an L-Bend candidate (after short leg removal and axis cancellation)
 * This directly corresponds to the documentation: "Example — resolving to L"
 */
export const mock5LegData = [
    {
        id: "A1",
        type: "ANCHOR",
        points: [{ x: 0, y: 0, z: 0 }],
        attributes: { MATERIAL: "CS-A106-B" }
    },
    {
        id: "PIPE_1",
        type: "PIPE",
        points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 3000, z: 0 }], // (+Y, 3000) -> short leg to be cancelled/merged later? The docs say: Y,3000 then -Y,3000
        attributes: { "ITEM-CODE": "PIPE", MATERIAL: "CS-A106-B" }
    },
    {
        id: "ELBOW_1",
        type: "ELBOW",
        points: [{ x: 0, y: 3000, z: 0 }],
        attributes: { MATERIAL: "CS-A106-B" }
    },
    {
        id: "PIPE_2",
        type: "PIPE",
        points: [{ x: 0, y: 3000, z: 0 }, { x: 6000, y: 3000, z: 0 }], // (+X, 6000)
        attributes: { "ITEM-CODE": "PIPE", MATERIAL: "CS-A106-B" }
    },
    {
        id: "ELBOW_2",
        type: "ELBOW",
        points: [{ x: 6000, y: 3000, z: 0 }],
        attributes: { MATERIAL: "CS-A106-B" }
    },
    {
        id: "PIPE_3",
        type: "PIPE",
        points: [{ x: 6000, y: 3000, z: 0 }, { x: 6000, y: 0, z: 0 }], // (-Y, 3000)
        attributes: { "ITEM-CODE": "PIPE", MATERIAL: "CS-A106-B" }
    },
    {
        id: "ELBOW_3",
        type: "ELBOW",
        points: [{ x: 6000, y: 0, z: 0 }],
        attributes: { MATERIAL: "CS-A106-B" }
    },
    {
        id: "PIPE_4",
        type: "PIPE",
        points: [{ x: 6000, y: 0, z: 0 }, { x: 6000, y: 0, z: 4000 }], // (+Z, 4000)
        attributes: { "ITEM-CODE": "PIPE", MATERIAL: "CS-A106-B" }
    },
    {
        id: "A2",
        type: "ANCHOR",
        points: [{ x: 6000, y: 0, z: 4000 }],
        attributes: { MATERIAL: "CS-A106-B" }
    }
];

export const mockBenchmark = {
    // XZ Plane
    // Original: +Y 3000, +X 6000, -Y 3000, +Z 4000
    // Y cancels out. XZ remains: +X 6000, +Z 4000
    expectedPlane: 'XZ',
    expectedLgen: 6000,
    expectedLabs: 4000,
};
