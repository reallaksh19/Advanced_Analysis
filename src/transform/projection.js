/**
 * src/transform/projection.js
 * Implements 3D to 2D geometric projections using rotation matrices.
 * Maintains True-Length mapping for skewed pipes (Zero Length-Loss).
 * Processes sequentially as a connected graph to avoid gaps.
 */
import * as THREE from 'three';
import { log } from '../utils/logger';

export const detectBestFitPlane = (segments) => {
    if (!segments || !Array.isArray(segments) || segments.length === 0) return 'XY';

    let netX = 0, netY = 0, netZ = 0;
    segments.forEach(seg => {
        if (!seg.start || !seg.end) return;
        netX += Math.abs(Number(seg.end[0]) - Number(seg.start[0]));
        netY += Math.abs(Number(seg.end[1]) - Number(seg.start[1]));
        netZ += Math.abs(Number(seg.end[2]) - Number(seg.start[2]));
    });

    const dimensions = [
        { axis: 'X', val: netX },
        { axis: 'Y', val: netY },
        { axis: 'Z', val: netZ }
    ].sort((a, b) => b.val - a.val);

    return [dimensions[0].axis, dimensions[1].axis].sort().join('');
};

export const getProjectionMatrix = (plane) => {
    const mat = new THREE.Matrix3();
    mat.identity();
    switch (plane) {
        case 'XY': break;
        case 'XZ':
            mat.set(1, 0, 0, 0, 0, -1, 0, 1, 0);
            break;
        case 'YZ':
            mat.set(0, 0, 1, 0, 1, 0, -1, 0, 0);
            break;
    }
    return mat;
};

export const projectPoint = (pt, matrix) => {
    if (!pt || pt.length < 3) return [0, 0, 0];
    const vec = new THREE.Vector3(Number(pt[0]), Number(pt[1]), Number(pt[2]));
    vec.applyMatrix3(matrix);
    return [vec.x, vec.y, 0]; // Flatten Z
};

/**
 * Transforms an array of 3D segments into a connected 2D representation.
 * Iterates sequentially to accumulate unfolding offsets, ensuring continuous pipes.
 */
export const transformTo2D = (segments, plane = 'Auto') => {
    if (!segments || segments.length === 0) return { segments2D: [], matrix: new THREE.Matrix3(), plane: 'XY' };

    const targetPlane = plane === 'Auto' ? detectBestFitPlane(segments) : plane;
    const matrix = getProjectionMatrix(targetPlane);

    log('info', 'projection', `Transforming ${segments.length} segments to ${targetPlane} plane.`);

    // To process sequentially, we assume segments are ordered.
    // In a robust implementation we'd trace the graph. For now, we accumulate offset from previous end.
    const segments2D = [];
    let current2DPos = null;

    segments.forEach(seg => {
        if (!seg.start || !seg.end) return;

        const origStart = seg.start;
        const origEnd = seg.end;

        // True 3D length
        const origVec = new THREE.Vector3(origEnd[0]-origStart[0], origEnd[1]-origStart[1], origEnd[2]-origStart[2]);
        const trueLength = origVec.length();

        // 1. Where should this segment start in 2D?
        // If it's the first segment or disconnected, project its raw start.
        // Otherwise, it starts exactly where the last segment ended.
        let start2D = current2DPos;
        if (!start2D) {
             start2D = projectPoint(origStart, matrix);
        }

        // 2. Determine raw direction in 2D using local segment points
        const rawStart2D = projectPoint(origStart, matrix);
        const rawEnd2D = projectPoint(origEnd, matrix);
        const projVec = new THREE.Vector3(rawEnd2D[0] - rawStart2D[0], rawEnd2D[1] - rawStart2D[1], 0);
        const projLength = projVec.length();

        // 3. Unfold (Scale to true length)
        let end2D;
        if (projLength < 0.001) {
            // Segment is completely perpendicular to plane. Fold it flat along local X.
            end2D = [start2D[0] + trueLength, start2D[1], 0];
        } else {
            projVec.normalize().multiplyScalar(trueLength);
            end2D = [start2D[0] + projVec.x, start2D[1] + projVec.y, 0];
        }

        segments2D.push({
            ...seg,
            start2D,
            end2D,
            trueLength
        });

        // Update current position for next connected segment
        current2DPos = end2D;
    });

    return { segments2D, matrix, plane: targetPlane };
};
