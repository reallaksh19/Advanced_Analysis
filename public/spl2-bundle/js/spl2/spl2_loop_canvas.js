import { SPL2Canvas } from './spl2_canvas.js';

export class LoopCanvas extends SPL2Canvas {
    constructor(canvasId) {
        super(canvasId);
        // Default dims hooked to inputs
        this.dims = { s: 325, g: 80, h: 25, w: 15 };
    }

    updateDims(s, g, h, w, specs = null) {
        this.dims = { s, g, h, w };
        this.specs = specs;
        this.render();
    }

    drawScene() {
        if (!this.dims) return;
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2 + 50; // offset down

        // Scale to fit constraints loosely
        const maxSpan = this.dims.s + (this.dims.g * 2) + this.dims.w;
        // pxPerFt scales dynamically to keep the drawing roughly bounded to 600px width
        const pxPerFt = Math.min(600 / maxSpan, 20);

        const s_px = this.dims.s * pxPerFt;
        const g_px = this.dims.g * pxPerFt;
        const h_px = this.dims.h * pxPerFt;
        const w_px = this.dims.w * pxPerFt;

        const anchorL = cx - (s_px / 2) - g_px - (w_px / 2);
        const anchorR = cx + (s_px / 2) + g_px + (w_px / 2);
        const guideL = cx - (w_px / 2) - g_px;
        const guideR = cx + (w_px / 2) + g_px;
        const loopL = cx - (w_px / 2);
        const loopR = cx + (w_px / 2);
        const topY = cy - h_px;

        // Pipe segments
        this.drawLine(anchorL, cy, loopL, cy, this.colors.pipe, 3); // L run
        this.drawLine(anchorR, cy, loopR, cy, this.colors.pipe, 3); // R run
        this.drawLine(loopL, cy, loopL, topY, this.colors.pipe, 3); // L leg
        this.drawLine(loopR, cy, loopR, topY, this.colors.pipe, 3); // R leg
        this.drawLine(loopL, topY, loopR, topY, this.colors.pipe, 3); // Top run

        // Spec Readout
        if (this.specs && this.specs.nps) {
            this.ctx.textAlign = 'center';
            this.drawText(`${this.specs.nps}" Sch ${this.specs.sch}, ${this.specs.tempF} °F`, cx, 30, null, '#ff6644', 14);
            this.drawText(`${this.specs.mat}`, cx, 50, null, '#ff6644', 14);
        }

        // Equipment / Symbols
        // Anchors
        this.drawCircle(anchorL, cy, 8, '#ff0000', true);
        this.drawCircle(anchorR, cy, 8, '#ff0000', true);

        // Guides
        this.ctx.fillStyle = '#00ff00';
        this.ctx.fillRect(guideL - 5, cy - 5, 10, 10);
        this.ctx.fillRect(guideR - 5, cy - 5, 10, 10);

        // Dimensions
        this.drawDim(anchorL, cy + 30, anchorR, cy + 30, `S: ${this.dims.s} ft`, null, 0);
        this.drawDim(guideL, cy + 60, guideR, cy + 60, `G: ${this.dims.g} ft`, null, 0);
        this.drawDim(loopL, topY - 30, loopR, topY - 30, `W: ${this.dims.w} ft`, 'loop_inp_w', 0);
        this.drawDim(loopR + 30, cy, loopR + 30, topY, `H: ${this.dims.h} ft`, 'loop_inp_h', 0);
        // Force Vectors (symbolic explicitly drawn arrows)
        const drawArrow = (x, y, dx, dy, color) => {
            this.drawLine(x, y, x + dx, y + dy, color, 2);
            const angle = Math.atan2(dy, dx);
            const headLen = 10;
            this.drawLine(x + dx, y + dy, x + dx - headLen * Math.cos(angle - Math.PI / 6), y + dy - headLen * Math.sin(angle - Math.PI / 6), color, 2);
            this.drawLine(x + dx, y + dy, x + dx - headLen * Math.cos(angle + Math.PI / 6), y + dy - headLen * Math.sin(angle + Math.PI / 6), color, 2);
        };

        // Fx points outward
        drawArrow(anchorL, cy, -40, 0, '#ff6600');
        drawArrow(anchorR, cy, 40, 0, '#ff6600');
        this.drawText('Fx', anchorL - 55, cy, null, '#ff6600', 12);
        this.drawText('Fx', anchorR + 55, cy, null, '#ff6600', 12);

        // Fz points downward towards guides
        drawArrow(guideL, cy - 35, 0, 25, '#00ffff');
        drawArrow(guideR, cy - 35, 0, 25, '#00ffff');
        this.drawText('Fz', guideL, cy - 45, null, '#00ffff', 12);
        this.drawText('Fz', guideR, cy - 45, null, '#00ffff', 12);

        // Output universal Axis Triad
        this.drawAxes('2D_ZX', 50, this.canvas.height - 30);
    }
}

// Ensure the class is globally hooked so master can init it
window.initLoopCanvas = function () {
    window.loopCanvas = new LoopCanvas('canvas-loop');

    // Listen for custom double-click edits
    document.getElementById('canvas-loop').addEventListener('canvas-edit', (e) => {
        const id = e.detail.id;
        const val = e.detail.value;
        const el = document.getElementById(id);
        if (el) {
            el.value = val;
            document.getElementById('loop_btn_run').click(); // Auto recalc
        }
    });

    window.loopCanvas.resize();
};
