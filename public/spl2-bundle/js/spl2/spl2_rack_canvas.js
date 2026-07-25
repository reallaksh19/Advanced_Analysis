import { SPL2Canvas } from './spl2_canvas.js';

export class RackSectionCanvas extends SPL2Canvas {
    constructor(canvasId) {
        super(canvasId);
        // Default dims
        this.pipes = []; // Array of pipeline objects
        this.pipeY = 200;
        this.rackW = 300;
    }

    updatePipes(pipesArray) {
        this.pipes = pipesArray || [];

        let totalWidthInches = 0;
        const clearanceInches = 4.0; // ~100mm

        if (this.pipes.length > 1) {
            for (let i = 1; i < this.pipes.length; i++) {
                const prev = this.pipes[i - 1];
                const curr = this.pipes[i];
                const spaceInches = ((prev.od_in || 0) + (curr.od_in || 0)) / 2 + (prev.insul_in || 0) + (curr.insul_in || 0) + clearanceInches;
                totalWidthInches += spaceInches;
            }
        }

        const pxPerIn = 3; // Visual scale 1 inch = 3 pixels
        this.rackW = Math.max(400, totalWidthInches * pxPerIn + 200);

        this.render();
    }

    drawScene() {
        const cx = this.canvas.width / 2;

        // Draw flat steel section beneath pipes
        this.ctx.fillStyle = this.colors.grid;
        // Simple rectangular block representing the steel rack
        this.ctx.fillRect(cx - this.rackW / 2, this.pipeY, this.rackW, 20);

        if (!this.pipes || this.pipes.length === 0) return;

        // Start from left side of the beam padding
        let startX = cx - (this.rackW / 2) + 100;
        let currentX = startX;
        const pxPerIn = 3;
        const clearanceInches = 4.0;

        for (let i = 0; i < this.pipes.length; i++) {
            const p = this.pipes[i];

            if (i > 0) {
                const prev = this.pipes[i - 1];
                const spaceInches = ((prev.od_in || 0) + (p.od_in || 0)) / 2 + (prev.insul_in || 0) + (p.insul_in || 0) + clearanceInches;
                currentX += spaceInches * pxPerIn;
            }

            const r_px = Math.max(10, (p.od_in || 0) * pxPerIn / 2); // Radius in px
            const insul_px = (p.insul_in || 0) * pxPerIn;

            // Insulation Layer
            if (insul_px > 0) {
                this.drawCircle(currentX, this.pipeY - r_px - insul_px, r_px + insul_px, 'rgba(200,200,200,0.3)', true);
                this.drawCircle(currentX, this.pipeY - r_px - insul_px, r_px + insul_px, this.colors.grid, false);
            }

            const pipeColor = i === 0 ? this.colors.pipe : `hsl(${180 + i * 40}, 80%, 60%)`;

            // Pipe Wall
            this.drawCircle(currentX, this.pipeY - r_px, r_px, pipeColor, false);
            this.drawCircle(currentX, this.pipeY - r_px, r_px * 0.85, this.colors.bg, true);

            // Centerline
            this.drawLine(currentX, this.pipeY - r_px * 2 - 30, currentX, this.pipeY + 20, this.colors.center, 1, [10, 5, 2, 5]);

            // Annotations (Line Number & OD)
            this.drawText(`${p.nps}"`, currentX, this.pipeY - r_px * 2 - 25, null, pipeColor, 12);
            this.drawText(`L${p.lineNo}`, currentX, this.pipeY - r_px * 2 - 10, null, pipeColor, 12);
        }
    }
}

export class RackPlanCanvas extends SPL2Canvas {
    constructor(canvasId) {
        super(canvasId);
        this.pipes = [];
    }

    updatePipes(pipesArray) {
        this.pipes = pipesArray || [];
        this.render();
    }

    drawScene() {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2 + 30; // Shift down slightly

        if (!this.pipes || this.pipes.length === 0) {
            this.drawText('NO LOOP DATA', cx, cy, null, '#666', 16);
            return;
        }

        const pxPerFt = 4;

        // Find maximum span to frame the anchors
        let maxSpan = 0;
        this.pipes.forEach(p => maxSpan = Math.max(maxSpan, (p.endAnch || 100) - (p.startAnch || 0)));
        const spanRadius = (maxSpan > 0 ? maxSpan : 100) * pxPerFt / 2;

        // Draw Anchors
        const drawAnchor = (x, y, labelText, color) => {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - 6);
            this.ctx.lineTo(x + 6, y + 4);
            this.ctx.lineTo(x - 6, y + 4);
            this.ctx.closePath();

            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 0.2;
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;

            this.ctx.stroke();
            this.drawText(labelText, x, y - 12, null, color || '#00ffff', 10);
        };

        // Iterate backwards so larger loops draw first (background)
        const sortedPipes = [...this.pipes].sort((a, b) => (b.loopDepth || 0) - (a.loopDepth || 0));

        sortedPipes.forEach((p, index) => {
            if (!p.loopWidth || !p.loopDepth || p.loopWidth <= 0 || p.loopDepth <= 0) return;

            const lw = p.loopWidth * pxPerFt;
            const ld = p.loopDepth * pxPerFt;
            const yOffset = (index * 12); // Offset inner pipes slightly vertically to fake a 3D overlay or space them apart

            const pipeColor = index === 0 ? this.colors.pipe : `hsl(${180 + index * 40}, 80%, 60%)`;

            // Draw individual anchors for this specific line
            const stAnchRaw = p.startAnch !== undefined ? p.startAnch : 0;
            const enAnchRaw = p.endAnch !== undefined ? p.endAnch : maxSpan;
            drawAnchor(cx - spanRadius, cy + yOffset, `A(${stAnchRaw})`, pipeColor);
            drawAnchor(cx + spanRadius, cy + yOffset, `A(${enAnchRaw})`, pipeColor);

            // Draw main straight runs to the bounds of the actual anchor span
            this.drawLine(cx - spanRadius, cy + yOffset, cx - lw / 2, cy + yOffset, pipeColor, 2);
            this.drawLine(cx + lw / 2, cy + yOffset, cx + spanRadius, cy + yOffset, pipeColor, 2);

            // Draw U-loop
            this.drawLine(cx - lw / 2, cy + yOffset, cx - lw / 2, cy - ld + yOffset, pipeColor, 2);
            this.drawLine(cx + lw / 2, cy + yOffset, cx + lw / 2, cy - ld + yOffset, pipeColor, 2);
            this.drawLine(cx - lw / 2, cy - ld + yOffset, cx + lw / 2, cy - ld + yOffset, pipeColor, 2);

            const g_dist = (p.guideDist || 0) * pxPerFt;
            const distAllowed = (spanRadius - (lw / 2));
            if (g_dist > 0 && g_dist < distAllowed) {
                // Dim lines per active line (to match color per feedback)
                // We use drawText instead of drawDim to avoid the arrows, printing G=40
                this.drawText(`[G] G=${p.guideDist}`, cx + lw / 2 + g_dist, cy + yOffset - 4, null, pipeColor, 10);
                this.drawText(`[G] G=${p.guideDist}`, cx - lw / 2 - g_dist, cy + yOffset - 4, null, pipeColor, 10);
            }

            // Draw dimensions only for each line neatly aligned
            // For L, place precisely horizontally inside the U bounds and stagger vertically by index
            this.drawText(`L=${p.loopWidth}`, cx, cy - ld + yOffset - 15 - (index * 12), null, pipeColor, 10);
            // For D, map along the exact right riser wall staggeringly
            this.drawText(`D=${p.loopDepth}`, cx + lw / 2 + 15 + (index * 12), cy - (ld / 2) + yOffset, null, pipeColor, 10);
        });

        // Output universal Axis Triad
        this.drawAxes('2D', 20, this.canvas.height - 40);
    }
}

// Global initialization hooked to master
window.initRackCanvas = function () {
    window.rackSectionCanvas = new RackSectionCanvas('canvas-rack-section');
    window.rackPlanCanvas = new RackPlanCanvas('canvas-rack-plan');
};
