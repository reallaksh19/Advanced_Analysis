import { SPL2Canvas } from './spl2_canvas.js';

export class SimplifiedCanvas extends SPL2Canvas {
    constructor(canvasId) {
        super(canvasId);
        // By default, routing starts at origin (cx, cy)
        this.segments = []; // Array of { axis: 'X'|'Y'|'Z', len: Float }
    }

    updateRouting(segments, realDx = null, realDy = null, realDz = null, isSI = false) {
        this.segments = segments;
        this.realDx = realDx;
        this.realDy = realDy;
        this.realDz = realDz;
        this.isSI = isSI;
        this.render();
    }

    // Convert 3D coordinate to 2D isometric projection
    project3D(x, y, z) {
        // Isometric angles
        const angleX = Math.PI / 6; // 30 degrees
        const angleZ = Math.PI / 6; // 30 degrees

        // Origin offset to center
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2 + 50;

        // X axis goes right and slightly down
        // Z axis goes left and slightly down
        // Y axis goes straight up

        const px = cx + (x * Math.cos(angleX)) - (z * Math.cos(angleZ));
        const py = cy + (x * Math.sin(angleX)) + (z * Math.sin(angleZ)) - y;

        return { px, py };
    }

    drawScene() {
        if (!this.segments || this.segments.length === 0) {
            this.drawText('NO ROUTING DATA', this.canvas.width / 2, this.canvas.height / 2, null, '#666', 16);
            return;
        }

        // Determine bounding box to auto-scale
        let maxX = 0, maxY = 0, maxZ = 0;
        let minX = 0, minY = 0, minZ = 0;
        let cx = 0, cy = 0, cz = 0;

        // True growth envelopes (absolute deltas) for dashed lines
        let totalDx = 0, totalDy = 0, totalDz = 0;

        this.segments.forEach(seg => {
            if (seg.axis === 'X') { cx += seg.len; totalDx += seg.len; }
            if (seg.axis === '-X') { cx -= seg.len; totalDx += seg.len; }
            if (seg.axis === 'Y') { cy += seg.len; totalDy += seg.len; }
            if (seg.axis === '-Y') { cy -= seg.len; totalDy += seg.len; }
            if (seg.axis === 'Z') { cz += seg.len; totalDz += seg.len; }
            if (seg.axis === '-Z') { cz -= seg.len; totalDz += seg.len; }

            maxX = Math.max(maxX, cx);
            maxY = Math.max(maxY, cy);
            maxZ = Math.max(maxZ, cz);
            minX = Math.min(minX, cx);
            minY = Math.min(minY, cy);
            minZ = Math.min(minZ, cz);
        });

        // Dynamic scale factor (ft to px)
        const maxDim = Math.max(Math.abs(maxX - minX), Math.abs(maxY - minY), Math.abs(maxZ - minZ), 1);
        const pxPerFt = Math.min(200 / maxDim, 40);

        // Draw Origin Indicator
        const origin = this.project3D(0, 0, 0);
        this.drawCircle(origin.px, origin.py, 6, '#ff00ff', true);
        this.drawText('ANCHOR (0,0,0)', origin.px, origin.py + 20, null, '#ff00ff', 12);

        // Draw Segments
        let x = 0, y = 0, z = 0;
        let lastPt = origin;

        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            const L = seg.len * pxPerFt;

            if (seg.axis === 'X') x += L;
            if (seg.axis === '-X') x -= L;
            if (seg.axis === 'Y') y += L;
            if (seg.axis === '-Y') y -= L;
            if (seg.axis === 'Z') z += L;
            if (seg.axis === '-Z') z -= L;

            const nextPt = this.project3D(x, y, z);

            let segColor = this.colors.pipe;
            if (seg.axis.includes('X')) segColor = 'rgba(255, 255, 0, 1)'; // Yellow
            if (seg.axis.includes('Y')) segColor = 'rgba(0, 255, 204, 1)'; // Cyan
            if (seg.axis.includes('Z')) segColor = 'rgba(255, 102, 255, 1)'; // Magenta

            // Draw pipe
            this.drawLine(lastPt.px, lastPt.py, nextPt.px, nextPt.py, segColor, 4);

            // Draw joint
            this.drawCircle(nextPt.px, nextPt.py, 4, this.colors.highlight, true);

            // Label
            const midX = (lastPt.px + nextPt.px) / 2;
            const midY = (lastPt.py + nextPt.py) / 2;

            const displayLen = this.isSI ? (seg.len / 3.28084).toFixed(3) : seg.len;
            const unit = this.isSI ? 'm' : 'ft';

            this.drawText(`S${i + 1} (${displayLen}${unit})`, midX, midY - 15, null, segColor, 12);

            lastPt = nextPt;
        }

        // Draw Global Envelope Vectors (Dashed) linking max expansions
        const finalX = totalDx * pxPerFt;
        const finalY = totalDy * pxPerFt;
        const finalZ = totalDz * pxPerFt;

        const ptX = this.project3D(finalX, 0, 0);
        const ptXY = this.project3D(finalX, finalY, 0);
        const ptXYZ = this.project3D(finalX, finalY, finalZ);

        this.ctx.setLineDash([4, 4]); // Dashed

        const rx = this.realDx !== null && this.realDx !== undefined ? this.realDx : totalDx;
        const ry = this.realDy !== null && this.realDy !== undefined ? this.realDy : totalDy;
        const rz = this.realDz !== null && this.realDz !== undefined ? this.realDz : totalDz;

        const displayRx = this.isSI ? (rx * 25.4) : rx;
        const displayRy = this.isSI ? (ry * 25.4) : ry;
        const displayRz = this.isSI ? (rz * 25.4) : rz;
        const unitSm = this.isSI ? 'mm' : 'in';

        // Origin to X
        this.drawLine(origin.px, origin.py, ptX.px, ptX.py, 'rgba(255, 255, 0, 0.4)', 1.5);
        this.drawText(`Δx: ${displayRx.toFixed(3)}${unitSm}`, (origin.px + ptX.px) / 2, (origin.py + ptX.py) / 2 + 15, null, 'rgba(255, 255, 0, 0.7)', 10);

        // X to XY
        this.drawLine(ptX.px, ptX.py, ptXY.px, ptXY.py, 'rgba(0, 255, 204, 0.4)', 1.5);
        this.drawText(`Δy: ${displayRy.toFixed(3)}${unitSm}`, (ptX.px + ptXY.px) / 2 - 25, (ptX.py + ptXY.py) / 2, null, 'rgba(0, 255, 204, 0.7)', 10);

        // XY to XYZ (Final)
        this.drawLine(ptXY.px, ptXY.py, ptXYZ.px, ptXYZ.py, 'rgba(255, 102, 255, 0.4)', 1.5);
        this.drawText(`Δz: ${displayRz.toFixed(3)}${unitSm}`, (ptXY.px + ptXYZ.px) / 2 + 25, (ptXY.py + ptXYZ.py) / 2, null, 'rgba(255, 102, 255, 0.7)', 10);

        this.ctx.setLineDash([]); // Reset to solid

        // Final Anchor
        this.drawCircle(lastPt.px, lastPt.py, 6, '#ff0000', true);
        this.drawText('EQUIPMENT', lastPt.px, lastPt.py + 20, null, '#ff0000', 12);

        // Output universal Axis Triad
        this.drawAxes('3D', 50, this.canvas.height - 30);
    }
}

window.initSimpCanvas = function () {
    window.simpCanvas = new SimplifiedCanvas('canvas-simp-3d');
    window.simpCanvas.resize();
};
